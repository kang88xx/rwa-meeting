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

export { START_HOUR, END_HOUR };
export const HOUR_HEIGHT = 52; // px

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
      className="pointer-events-none absolute left-0 right-0 z-20"
      style={{ top }}
    >
      <div className="relative">
        <div className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-[#ea4335]" />
        <div className="h-[2px] w-full bg-[#ea4335]" />
      </div>
    </div>
  );
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
    // 오전 8시 근처로 초기 스크롤
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, HOUR_HEIGHT * 1.5);
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

  // 포인터 이벤트 기반 — 마우스와 터치 모두 지원
  const handleColumnPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    day: Date,
    key: string
  ) => {
    // 터치는 스크롤 제스처와 충돌하므로 제외 — 모바일은 + 버튼으로 예약 생성
    if (e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return; // 좌클릭만
    if ((e.target as HTMLElement).closest("[data-event]")) return;
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
      // 실제로 끌었을 때만(최소 한 칸) 예약 생성 — 단순 클릭/탭은 무시
      if (end - start < SNAP) return;
      onSlotClick(d.day, start, end);
    };
    const up = (ev: PointerEvent) => finish(ev);
    const cancel = () => finish(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 요일 헤더 */}
      <div className="flex border-b border-[#dadce0] pr-[12px]">
        <div className="w-14 shrink-0" />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div
              key={toDateKey(d)}
              className="flex flex-1 flex-col items-center py-2"
            >
              <span
                className={`text-[11px] font-medium uppercase ${
                  d.getDay() === 0 ? "text-[#d93025]" : "text-[#70757a]"
                }`}
              >
                {WEEKDAYS_KO[d.getDay()]}
              </span>
              <span
                className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none ${
                  today
                    ? "bg-[#1a73e8] font-normal text-white"
                    : "text-[#3c4043]"
                }`}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* 스크롤 본문 */}
      <div ref={scrollRef} className="gc-scroll flex-1 overflow-y-auto">
        <div className="flex" style={{ height: bodyHeight }}>
          {/* 시간 눈금 */}
          <div className="w-14 shrink-0">
            {hours.map((h, i) => (
              <div key={h} className="relative" style={{ height: HOUR_HEIGHT }}>
                {i > 0 && (
                  <span className="absolute -top-2 right-2 text-[10px] text-[#70757a]">
                    {h < 12
                      ? `오전 ${h}시`
                      : h === 12
                        ? "오후 12시"
                        : `오후 ${h - 12}시`}
                  </span>
                )}
              </div>
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
                className="relative flex-1 select-none border-l border-[#dadce0]"
              >
                {/* 시간 가로줄 */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="border-b border-[#dadce0]"
                    style={{ height: HOUR_HEIGHT }}
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
                      className="pointer-events-none absolute left-0.5 right-0.5 z-10 rounded-md border border-[#1a73e8] bg-[#1a73e8]/15"
                      style={{
                        top: ((hl.startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                        height: ((hl.endMin - hl.startMin) / 60) * HOUR_HEIGHT,
                      }}
                    >
                      <span className="absolute left-1.5 top-0.5 text-[11px] font-medium text-[#1a73e8]">
                        {minutesToTime(hl.startMin)}–{minutesToTime(hl.endMin)}
                      </span>
                    </div>
                  );
                })()}

                {today && <CurrentTimeLine />}

                {/* 예약 블록 */}
                {positioned.map((p) => {
                  const room = getRoom(p.roomId);
                  // 예약자 이름 색상 우선, 없으면 회의실 색상으로 폴백
                  const nc = colors[p.organizer];
                  const bg = nc?.bg ?? room?.color ?? "#e8eaed";
                  const border = nc?.border ?? room?.border ?? "#5f6368";
                  const gap = 2;
                  const widthPct = 100 / p.cols;
                  const compact = p.height < 34;
                  return (
                    <button
                      key={p.id}
                      data-event
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(p, e.currentTarget);
                      }}
                      className="group absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left transition-shadow hover:z-10 hover:shadow-md"
                      style={{
                        top: p.top,
                        height: p.height - 1,
                        left: `calc(${p.col * widthPct}% + 1px)`,
                        width: `calc(${widthPct}% - ${gap + 1}px)`,
                        background: bg,
                        borderLeft: `3px solid ${border}`,
                        color: border,
                      }}
                      title={`${p.title} · ${p.start}~${p.end} · ${room?.name ?? ""} · ${p.organizer}`}
                    >
                      {compact ? (
                        <div className="flex items-center gap-1 truncate text-[11px] font-medium leading-none">
                          <span className="truncate">{p.title}</span>
                          <span className="opacity-70">
                            {minutesToTime(timeToMinutes(p.start))}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="truncate text-[12px] font-semibold leading-tight">
                            {p.title}
                          </div>
                          <div className="truncate text-[11px] leading-tight opacity-90">
                            {p.start}~{p.end}
                          </div>
                          {p.height > 52 && (
                            <div className="truncate text-[11px] leading-tight opacity-75">
                              {room?.name} · {p.organizer}
                            </div>
                          )}
                        </>
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
