"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NameColorMap, Reservation } from "@/lib/types";
import { ROOMS } from "@/lib/rooms";
import {
  addDays,
  formatMonthTitle,
  minutesToTime,
  toDateKey,
  weekDays,
} from "@/lib/date";
import MiniCalendar from "./MiniCalendar";
import WeekView from "./WeekView";
import EventModal, { ModalPrefill } from "./EventModal";
import EventPopover from "./EventPopover";

const NAME_KEY = "mr:name";

export default function CalendarApp() {
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [colors, setColors] = useState<NameColorMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(ROOMS.map((r) => r.id))
  );
  const [name, setName] = useState("");
  const [modal, setModal] = useState<ModalPrefill | null>(null);
  const [selection, setSelection] = useState<{
    key: string;
    startMin: number;
    endMin: number;
  } | null>(null);
  const [popover, setPopover] = useState<{
    res: Reservation;
    rect: DOMRect;
  } | null>(null);

  // 모바일(<768px)에서는 7일 대신 3일 뷰로 표시
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const days = useMemo(
    () =>
      isMobile
        ? Array.from({ length: 3 }, (_, i) => addDays(anchor, i))
        : weekDays(anchor),
    [anchor, isMobile]
  );
  const navStep = isMobile ? 3 : 7;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reservations", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 소프트 삭제된 예약은 캘린더에 표시하지 않음 (히스토리에서만 확인)
      setReservations(
        (data.reservations ?? []).filter((r: Reservation) => !r.deletedAt)
      );
      setColors(data.colors ?? {});
      setLoadError(false);
    } catch {
      // 빈 화면이 "예약이 다 사라졌다"로 오해되지 않도록 에러를 표시
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setName(saved);
  }, [load]);

  const saveName = (n: string) => {
    setName(n);
    localStorage.setItem(NAME_KEY, n);
  };

  const visibleReservations = useMemo(
    () => reservations.filter((r) => visible.has(r.roomId)),
    [reservations, visible]
  );

  const toggleRoom = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (date: Date, startMin: number, endMin?: number) => {
    setPopover(null);
    const firstVisible = ROOMS.find((r) => visible.has(r.id)) ?? ROOMS[0];
    const end = endMin ?? startMin + 60;
    // 드래그로 지정한 경우(끝 시각 전달됨) 모달이 떠 있는 동안 선택 영역 유지
    setSelection(
      endMin !== undefined
        ? { key: toDateKey(date), startMin, endMin: end }
        : null
    );
    setModal({
      date: toDateKey(date),
      start: minutesToTime(startMin),
      end: minutesToTime(end),
      roomId: firstVisible.id,
    });
  };

  const openCreateDefault = () => {
    const now = new Date();
    let mins = now.getHours() * 60;
    mins = Math.min(Math.max(mins, 7 * 60), 21 * 60);
    openCreate(anchor, mins);
  };

  return (
    <div className="flex h-full flex-col bg-white text-[#3c4043]">
      {/* 상단 앱 바 */}
      <header className="flex items-center gap-2 border-b border-[#dadce0] px-4 py-2.5 sm:gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a73e8] text-lg text-white">
            📅
          </div>
          <div className="hidden leading-tight md:block">
            <h1 className="text-lg font-normal text-[#5f6368]">회의실 예약</h1>
          </div>
        </div>

        <button
          onClick={() => setAnchor(new Date())}
          className="ml-2 rounded-md border border-[#dadce0] px-4 py-1.5 text-sm font-medium text-[#3c4043] hover:bg-[#f1f3f4]"
        >
          오늘
        </button>

        <div className="flex items-center gap-1">
          <button
            aria-label="이전"
            onClick={() => setAnchor(addDays(anchor, -navStep))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
          >
            ‹
          </button>
          <button
            aria-label="다음"
            onClick={() => setAnchor(addDays(anchor, navStep))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
          >
            ›
          </button>
        </div>

        <h2 className="truncate text-base font-normal text-[#3c4043] sm:text-xl">
          {formatMonthTitle(days)}
        </h2>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <a
            href="/history"
            className="flex items-center gap-1.5 rounded-md border border-[#dadce0] px-3 py-1.5 text-sm font-medium text-[#3c4043] hover:bg-[#f1f3f4]"
          >
            🗂️<span className="hidden sm:inline"> 히스토리</span>
          </a>
          <span className="hidden rounded-full bg-[#e6f4ea] px-3 py-1 text-xs font-medium text-[#188038] sm:inline">
            주간
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[#dadce0] p-3 md:flex">
          <button
            onClick={openCreateDefault}
            className="mb-4 flex items-center gap-3 self-start rounded-2xl bg-white px-5 py-3.5 text-sm font-medium text-[#3c4043] shadow-[0_1px_3px_rgba(60,64,67,0.3)] transition-shadow hover:shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_rgba(60,64,67,0.15)]"
          >
            <span className="text-xl leading-none text-[#1a73e8]">＋</span>
            <span>예약 만들기</span>
          </button>

          <MiniCalendar selected={anchor} onSelect={(d) => setAnchor(d)} />

          {/* 내 이름 */}
          <div className="mt-5">
            <label className="mb-1.5 block text-xs font-medium text-[#5f6368]">
              내 이름 (계정 불필요)
            </label>
            <input
              value={name}
              onChange={(e) => saveName(e.target.value)}
              placeholder="이름을 기재하세요"
              className="w-full rounded-md border border-[#dadce0] px-2.5 py-2 text-sm outline-none focus:border-[#1a73e8]"
            />
            <p className="mt-1 text-[11px] leading-tight text-[#80868b]">
              예약 시 이 이름이 자동으로 채워집니다.
            </p>
          </div>

          {/* 회의실 필터 */}
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-medium text-[#5f6368]">회의실</h3>
            <ul className="space-y-0.5">
              {ROOMS.map((r) => {
                const on = visible.has(r.id);
                return (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-[#f1f3f4]">
                      <span
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-2 transition-colors"
                        style={{
                          background: on ? r.dot : "transparent",
                          borderColor: r.dot,
                        }}
                      >
                        {on && (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleRoom(r.id)}
                        className="sr-only"
                      />
                      <span className="flex-1 text-sm text-[#3c4043]">
                        {r.name}
                      </span>
                      <span className="text-[11px] text-[#80868b]">
                        {r.capacity}인
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 예약자 색상 범례 */}
          {Object.keys(colors).length > 0 && (
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <h3 className="mb-2 text-xs font-medium text-[#5f6368]">
                예약자 색상
              </h3>
              <ul className="space-y-0.5">
                {Object.entries(colors)
                  .sort(([a], [b]) => a.localeCompare(b, "ko"))
                  .map(([n, c]) => (
                    <li
                      key={n}
                      className="flex items-center gap-2.5 rounded-md px-1.5 py-1"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: c.border }}
                      />
                      <span className="truncate text-sm text-[#3c4043]">
                        {n}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </aside>

        {/* 캘린더 */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {loadError && (
            <div className="flex items-center gap-3 border-b border-[#fad2cf] bg-[#fce8e6] px-4 py-2 text-sm text-[#c5221f]">
              예약 정보를 불러오지 못했습니다.
              <button
                onClick={() => {
                  setLoading(true);
                  load();
                }}
                className="rounded-md border border-[#c5221f] px-2.5 py-0.5 text-xs font-medium hover:bg-[#fad2cf]"
              >
                다시 시도
              </button>
            </div>
          )}
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#5f6368]">
              불러오는 중…
            </div>
          ) : (
            <WeekView
              days={days}
              reservations={visibleReservations}
              colors={colors}
              onSlotClick={openCreate}
              selection={selection}
              onEventClick={(res, el) =>
                setPopover({ res, rect: el.getBoundingClientRect() })
              }
            />
          )}
        </main>
      </div>

      {/* 모바일용 플로팅 버튼 */}
      <button
        onClick={openCreateDefault}
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1a73e8] text-3xl text-white shadow-lg hover:bg-[#1765cc] md:hidden"
        aria-label="예약 만들기"
      >
        ＋
      </button>

      {modal && (
        <EventModal
          prefill={modal}
          defaultName={name}
          onClose={() => {
            setModal(null);
            setSelection(null);
          }}
          onNameChange={saveName}
          onCreated={() => {
            setModal(null);
            setSelection(null);
            load();
          }}
        />
      )}

      {popover && (
        <EventPopover
          reservation={popover.res}
          color={colors[popover.res.organizer]}
          anchor={popover.rect}
          onClose={() => setPopover(null)}
          onDeleted={() => {
            setPopover(null);
            load();
          }}
          onEdit={(r) => {
            setPopover(null);
            setSelection(null);
            setModal({
              id: r.id,
              date: r.date,
              start: r.start,
              end: r.end,
              roomId: r.roomId,
              title: r.title,
              organizer: r.organizer,
              note: r.note,
            });
          }}
        />
      )}
    </div>
  );
}
