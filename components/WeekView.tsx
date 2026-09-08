"use client";

import { useEffect, useRef, useState } from "react";
import { NameColorMap, Reservation } from "@/lib/types";
import { getRoom } from "@/lib/rooms";
import {
  WEEKDAYS_KO,
  isToday,
  minutesToTime,
  timeToMinutes,
  toDateKey,
} from "@/lib/date";

import {
  START_HOUR,
  END_HOUR,
  SNAP_MINUTES as SNAP,
} from "@/lib/validate";
import styles from "./WeekView.module.css";

export { START_HOUR, END_HOUR };
export const HOUR_HEIGHT = 64; // px

type Selection = { key: string; startMin: number; endMin: number };

type Props = {
  days: Date[];
  reservations: Reservation[];
  // 예약자 이름별 고정 색상
  colors: NameColorMap;
  onSlotClick: (date: Date, startMin: number, endMin: number) => void;
  onEventClick: (res: Reservation, el: HTMLElement) => void;
  // 드래그가 끝나 모달이 떠 있는 동안 유지되는 확정 선택
  selection?: Selection | null;
};

type Positioned = Reservation & {
  top: number;
  height: number;
  col: number;
  cols: number;
};

// 하루 안에서 겹치는 예약들을 열로 분할 (구글 캘린더 방식)
function layoutDay(items: Reservation[]): Positioned[] {
  const sorted = [...items].sort(
    (a, b) =>
      timeToMinutes(a.start) - timeToMinutes(b.start) ||
      timeToMinutes(a.end) - timeToMinutes(b.end)
  );

  const result: Positioned[] = [];
  let cluster: Reservation[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // 열 배정
    const colEnds: number[] = []; // 각 열의 마지막 종료 시간(분)
    const assigned: { r: Reservation; col: number }[] = [];
    for (const r of cluster) {
      const s = timeToMinutes(r.start);
      let placed = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= s) {
          placed = c;
          break;
        }
      }
      if (placed === -1) {
        placed = colEnds.length;
        colEnds.push(timeToMinutes(r.end));
      } else {
        colEnds[placed] = timeToMinutes(r.end);
      }
      assigned.push({ r, col: placed });
    }
    const cols = colEnds.length;
    for (const { r, col } of assigned) {
      const s = timeToMinutes(r.start);
      const e = timeToMinutes(r.end);
      const top = ((s - START_HOUR * 60) / 60) * HOUR_HEIGHT;
      const height = Math.max(((e - s) / 60) * HOUR_HEIGHT, 18);
      result.push({ ...r, top, height, col, cols });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const r of sorted) {
    const s = timeToMinutes(r.start);
    if (cluster.length > 0 && s >= clusterEnd) {
      flush();
    }
    cluster.push(r);
    clusterEnd = Math.max(clusterEnd, timeToMinutes(r.end));
  }
  flush();

  return result;
}

function CurrentTimeLine() {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setMinutes(now.getHours() * 60 + now.getMinutes());
    };
    update();
    const t = setInterval(update, 60 * 1000);
    return () => clearInterval(t);
  }, []);
  if (minutes === null) return null;
  if (minutes < START_HOUR * 60 || minutes > END_HOUR * 60) return null;
  const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  return (
    <div
      className={styles.currentTime}
      style={{ top }}
    >
      <span className={styles.currentTimeDot} />
    </div>
  );
}

function displayRoomName(name: string | undefined): string {
  return name?.replace(/^\s*\d+F\s*/i, "") || "회의실";
}

export default function WeekView({
  days,
  reservations,
  colors,
  onSlotClick,
  onEventClick,
  selection,
}: Props) {
  const hours = Array.from(
    { length: END_HOUR - START_HOUR + 1 },
    (_, i) => START_HOUR + i
  );
  const bodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

  const byDay = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const arr = byDay.get(r.date) ?? [];
    arr.push(r);
    byDay.set(r.date, arr);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 오전 8시가 첫 줄에 오도록 초기 스크롤
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT - 12;
    }
  }, []);

  // 드래그 선택 상태 (마우스로 끌어서 시간대 지정)
  const dragRef = useRef<{ key: string; day: Date; rect: DOMRect; anchor: number } | null>(
    null
  );
  const [sel, setSel] = useState<{ key: string; startMin: number; endMin: number } | null>(
    null
  );

  // 컬럼 내 clientY -> 스냅된 분
  const minsFromY = (clientY: number, rect: DOMRect): number => {
    const y = clientY - rect.top;
    let mins = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
    mins = Math.round(mins / SNAP) * SNAP;
    return Math.max(START_HOUR * 60, Math.min(mins, END_HOUR * 60));
  };

  // 클릭/탭한 지점이 속한 칸의 시작 분 (내림 스냅)
  const slotStartFromY = (clientY: number, rect: DOMRect): number => {
    const y = clientY - rect.top;
    let mins = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
    mins = Math.floor(mins / SNAP) * SNAP;
    return Math.max(START_HOUR * 60, Math.min(mins, END_HOUR * 60 - SNAP));
  };

  // 클릭/탭 지점 기준 기본 1시간 예약 생성
  const clickToCreate = (day: Date, clientY: number, rect: DOMRect) => {
    const start = slotStartFromY(clientY, rect);
    const end = Math.min(start + 60, END_HOUR * 60);
    onSlotClick(day, start, end);
  };

  // 포인터 이벤트 기반 — 마우스와 터치 모두 지원
  const handleColumnPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    day: Date,
    key: string
  ) => {
    if ((e.target as HTMLElement).closest("[data-event]")) return;
    // 터치: 드래그는 스크롤 제스처와 충돌하므로 탭만 처리
    // (움직임 없이 손을 떼면 해당 시간 시작으로 예약 창 열기)
    if (e.pointerType === "touch") {
      const rect = e.currentTarget.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const cleanup = () => {
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
      };
      const up = (ev: PointerEvent) => {
        cleanup();
        // 스크롤 제스처는 pointercancel로 빠지지만, 미세한 움직임도 탭으로만 인정
        if (
          Math.abs(ev.clientX - startX) > 10 ||
          Math.abs(ev.clientY - startY) > 10
        )
          return;
        clickToCreate(day, ev.clientY, rect);
      };
      const cancel = () => cleanup();
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return; // 좌클릭만
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = minsFromY(e.clientY, rect);
    dragRef.current = { key, day, rect, anchor };
    setSel({ key, startMin: anchor, endMin: anchor });

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const m = minsFromY(ev.clientY, d.rect);
      setSel({
        key: d.key,
        startMin: Math.min(d.anchor, m),
        endMin: Math.max(d.anchor, m),
      });
    };

    const finish = (ev: PointerEvent | null) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      const d = dragRef.current;
      dragRef.current = null;
      setSel(null);
      if (!d || !ev) return;
      const m = minsFromY(ev.clientY, d.rect);
      const start = Math.max(START_HOUR * 60, Math.min(d.anchor, m));
      const end = Math.min(END_HOUR * 60, Math.max(d.anchor, m));
      // 드래그(최소 한 칸)면 끌어낸 범위 그대로, 단순 클릭이면 클릭한 칸 시작으로 기본 1시간
      if (end - start < SNAP) {
        clickToCreate(d.day, ev.clientY, d.rect);
        return;
      }
      onSlotClick(d.day, start, end);
    };
    const up = (ev: PointerEvent) => finish(ev);
    const cancel = () => finish(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const gridTemplateColumns = `72px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className={styles.weekView}>
      {/* 요일 헤더 */}
      <div className={styles.headerScrollGuard}>
        <div className={styles.header} style={{ gridTemplateColumns }}>
          <div className={styles.timeHeader} />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div
              key={toDateKey(d)}
              className={`${styles.dayHeader} ${today ? styles.todayHeader : ""}`}
            >
              <span
                className={`${styles.weekday} ${d.getDay() === 0 ? styles.sunday : ""}`}
              >
                {WEEKDAYS_KO[d.getDay()]}
              </span>
              <span
                className={`${styles.dateNumber} ${today ? styles.todayNumber : ""}`}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
        </div>
      </div>

      {/* 스크롤 본문 */}
      <div ref={scrollRef} className={`gc-scroll ${styles.scrollBody}`}>
        <div className={styles.timeline} style={{ height: bodyHeight, gridTemplateColumns }}>
          {/* 시간 눈금 */}
          <div className={styles.timeGutter}>
            {hours.map((h, i) => (
              i > 0 ? (
                <span
                  key={h}
                  className={styles.timeLabel}
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              ) : null
            ))}
          </div>

          {/* 요일 컬럼 */}
          {days.map((d) => {
            const key = toDateKey(d);
            const positioned = layoutDay(byDay.get(key) ?? []);
            const today = isToday(d);
            return (
              <div
                key={key}
                onPointerDown={(e) => handleColumnPointerDown(e, d, key)}
                className={`${styles.dayColumn} ${today ? styles.todayColumn : ""}`}
              >
                {/* 시간 가로줄 */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className={styles.hourLine}
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}

                {/* 드래그 중(sel) 또는 모달 대기 중(selection) 선택 하이라이트 */}
                {(() => {
                  const hl =
                    sel && sel.key === key
                      ? sel
                      : selection && selection.key === key
                        ? selection
                        : null;
                  if (!hl || hl.endMin <= hl.startMin) return null;
                  return (
                    <div
                      className={styles.selection}
                      style={{
                        top: ((hl.startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                        height: ((hl.endMin - hl.startMin) / 60) * HOUR_HEIGHT,
                      }}
                    >
                      <span className={styles.selectionTime}>
                        {minutesToTime(hl.startMin)}–{minutesToTime(hl.endMin)}
                      </span>
                    </div>
                  );
                })()}

                {today && <CurrentTimeLine />}

                {/* 예약 블록 — 같은 시간의 회의실 예약은 실제 시간 좌표에서 나란히 표시 */}
                {positioned.map((p) => {
                  const room = getRoom(p.roomId);
                  const nc = colors[p.organizer];
                  const accent = nc?.border ?? room?.border ?? "#5f6368";
                  const background = nc?.bg ?? room?.color ?? "#f1f3f4";
                  const roomName = displayRoomName(room?.name);
                  const gap = 3;
                  const widthPct = 100 / p.cols;
                  const isShort = p.height <= HOUR_HEIGHT / 2;
                  const isNarrow = p.cols > 1;
                  return (
                    <button
                      key={p.id}
                      data-event
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(p, e.currentTarget);
                      }}
                      className={`${styles.event} ${isShort ? styles.shortEvent : ""} ${isNarrow ? styles.narrowEvent : ""} ${!isShort && p.height <= HOUR_HEIGHT ? styles.compactEvent : ""}`}
                      style={{
                        top: p.top,
                        height: p.height - 1,
                        left: `calc(${p.col * widthPct}% + ${p.col === 0 ? 3 : 1}px)`,
                        width: `calc(${widthPct}% - ${gap + 1}px)`,
                        borderLeftColor: accent,
                        background,
                      }}
                      title={`${p.title} · ${p.start}~${p.end} · ${room?.name ?? roomName} · ${p.organizer}`}
                      aria-label={`${p.title}, ${p.start}부터 ${p.end}, ${room?.name ?? roomName}, 예약자 ${p.organizer}`}
                    >
                      {isShort ? (
                        <span className={styles.shortHeading}>
                          <span className={styles.shortRoom} title={roomName}>{p.roomId === "main" ? "대" : p.roomId === "small" ? "소" : "방"}</span>
                          <span className={styles.eventTitle}>{p.title}</span>
                        </span>
                      ) : <span className={styles.eventTitle}>{p.title}</span>}
                      <span className={styles.eventTime}>{p.start}–<wbr />{p.end}</span>
                      {!isShort && <span className={styles.eventRoom}>{roomName}</span>}
                      {p.height >= 100 && !isNarrow && (
                        <span className={styles.eventOrganizer}>{p.organizer}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
