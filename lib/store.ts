import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { NameColor, NameColorMap, Reservation } from "./types";
import { pickColor } from "./palette";

// ── 저장 백엔드 ────────────────────────────────────────────
// 프로덕션(Vercel): Upstash Redis (마켓플레이스 연동 시 환경변수 자동 주입)
// 로컬 개발: JSON 파일 (data/, DATA_DIR 환경변수로 변경 가능)
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

function filePath(key: string): string {
  return path.join(DATA_DIR, `${key}.json`);
}

async function readRaw(key: string): Promise<unknown> {
  if (redis) {
    // @upstash/redis는 JSON을 자동 역직렬화
    return await redis.get(key);
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  let raw: string;
  try {
    raw = await fs.readFile(filePath(key), "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // 파손된 파일을 덮어쓰면 조용한 전체 유실 — 복구용 백업 후 빈 상태로 시작
    const backup = path.join(DATA_DIR, `${key}.corrupt-${Date.now()}.json`);
    try {
      await fs.copyFile(filePath(key), backup);
      console.error(`[store] ${key}.json 파손 감지 — 백업: ${backup}`);
    } catch {
      // 백업 실패 시에도 서비스는 계속
    }
    return null;
  }
}

async function writeRaw(key: string, value: unknown): Promise<void> {
  if (redis) {
    await redis.set(key, value);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  // 원자적 쓰기: 임시 파일에 쓴 뒤 rename — 쓰기 도중 중단돼도 원본이 잘리지 않음
  const tmp = path.join(DATA_DIR, `.${key}.tmp-${process.pid}`);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath(key));
}

// 동시 요청 시 read-modify-write 경합을 막기 위한 간단한 직렬화 큐.
// 프로세스 단위 보호입니다 — 소규모 내부용 트래픽 전제 (README 참고).
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => {});
  return next;
}

// ── 예약 ───────────────────────────────────────────────────

// 저장소가 수동 편집 등으로 깨진 레코드를 담고 있어도
// 클라이언트가 죽지 않도록 최소한의 형태 검증을 통과한 것만 반환
function isReservationShape(r: unknown): r is Reservation {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.roomId === "string" &&
    typeof o.title === "string" &&
    typeof o.organizer === "string" &&
    typeof o.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
    typeof o.start === "string" &&
    /^\d{2}:\d{2}$/.test(o.start) &&
    typeof o.end === "string" &&
    /^\d{2}:\d{2}$/.test(o.end)
  );
}

export async function readAll(): Promise<Reservation[]> {
  const data = await readRaw("reservations");
  return Array.isArray(data) ? data.filter(isReservationShape) : [];
}

async function writeAll(items: Reservation[]): Promise<void> {
  await writeRaw("reservations", items);
}

// "HH:mm" -> 분 단위
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// 같은 회의실/같은 날짜에서 시간이 겹치는지 검사 (이중 예약 방지)
export function hasConflict(
  items: Reservation[],
  candidate: { roomId: string; date: string; start: string; end: string },
  ignoreId?: string
): Reservation | null {
  const cs = toMinutes(candidate.start);
  const ce = toMinutes(candidate.end);
  for (const r of items) {
    if (r.id === ignoreId) continue;
    if (r.deletedAt) continue; // 삭제된 예약은 시간을 점유하지 않음
    if (r.roomId !== candidate.roomId) continue;
    if (r.date !== candidate.date) continue;
    const rs = toMinutes(r.start);
    const re = toMinutes(r.end);
    // 경계가 맞닿는 건(예: 10:00 종료, 10:00 시작) 허용
    if (cs < re && rs < ce) return r;
  }
  return null;
}

function genId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

type ReservationInput = {
  roomId: string;
  title: string;
  organizer: string;
  date: string;
  start: string;
  end: string;
  note?: string;
};

type MutationResult =
  | { ok: true; item: Reservation }
  | { ok: false; error: string; conflict?: Reservation };

export function createReservation(input: ReservationInput): Promise<MutationResult> {
  return serialize(async () => {
    const items = await readAll();

    if (toMinutes(input.end) <= toMinutes(input.start)) {
      return { ok: false as const, error: "종료 시간은 시작 시간보다 늦어야 합니다." };
    }

    const conflict = hasConflict(items, input);
    if (conflict) {
      return {
        ok: false as const,
        error: `이미 예약된 시간입니다 (${conflict.start}~${conflict.end}, ${conflict.organizer}).`,
        conflict,
      };
    }

    const item: Reservation = {
      id: genId(),
      roomId: input.roomId,
      title: input.title.trim() || "(제목 없음)",
      organizer: input.organizer.trim(),
      date: input.date,
      start: input.start,
      end: input.end,
      note: input.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    items.push(item);
    await writeAll(items);
    return { ok: true as const, item };
  });
}

export function updateReservation(
  id: string,
  input: ReservationInput
): Promise<MutationResult | { ok: false; error: string; notFound: true }> {
  return serialize(async () => {
    const items = await readAll();
    // 삭제된 예약은 수정 대상에서 제외
    const idx = items.findIndex((r) => r.id === id && !r.deletedAt);
    if (idx === -1) {
      return {
        ok: false as const,
        error: "예약을 찾을 수 없습니다.",
        notFound: true as const,
      };
    }

    if (toMinutes(input.end) <= toMinutes(input.start)) {
      return { ok: false as const, error: "종료 시간은 시작 시간보다 늦어야 합니다." };
    }

    // 자기 자신은 겹침 검사에서 제외
    const conflict = hasConflict(items, input, id);
    if (conflict) {
      return {
        ok: false as const,
        error: `이미 예약된 시간입니다 (${conflict.start}~${conflict.end}, ${conflict.organizer}).`,
        conflict,
      };
    }

    const item: Reservation = {
      ...items[idx],
      roomId: input.roomId,
      title: input.title.trim() || "(제목 없음)",
      organizer: input.organizer.trim(),
      date: input.date,
      start: input.start,
      end: input.end,
      note: input.note?.trim() || undefined,
    };
    items[idx] = item;
    await writeAll(items);
    return { ok: true as const, item };
  });
}

// 소프트 삭제: 레코드를 지우는 대신 deletedAt만 기록.
// 캘린더에서는 숨겨지고 히스토리에는 "삭제됨"으로 남습니다.
export function deleteReservation(id: string): Promise<boolean> {
  return serialize(async () => {
    const items = await readAll();
    const idx = items.findIndex((r) => r.id === id && !r.deletedAt);
    if (idx === -1) return false;
    items[idx] = { ...items[idx], deletedAt: new Date().toISOString() };
    await writeAll(items);
    return true;
  });
}

// ── 예약자 이름별 색상 ──────────────────────────────────────
// 한 번 배정된 이름은 영구 저장되어 항상 같은 색을 씁니다.

function isNameColorShape(v: unknown): v is NameColor {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.border === "string" && typeof o.bg === "string";
}

async function readColors(): Promise<NameColorMap> {
  const data = await readRaw("colors");
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {};
  }
  const map: NameColorMap = {};
  for (const [name, color] of Object.entries(data)) {
    if (isNameColorShape(color)) map[name] = color;
  }
  return map;
}

// 주어진 이름들에 색상이 없으면 배정하고, 전체 매핑을 반환합니다.
export function ensureColorsFor(names: string[]): Promise<NameColorMap> {
  return serialize(async () => {
    const map = await readColors();
    let changed = false;
    for (const raw of names) {
      const name = raw.trim();
      if (!name || map[name]) continue;
      map[name] = pickColor(Object.values(map));
      changed = true;
    }
    if (changed) await writeRaw("colors", map);
    return map;
  });
}
