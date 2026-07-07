"use client";

import { useEffect, useMemo, useState } from "react";
import { NameColorMap, Reservation } from "@/lib/types";
import { getRoom } from "@/lib/rooms";
import { fromDateKey, toDateKey, WEEKDAYS_KO } from "@/lib/date";

type Filter = "all" | "upcoming" | "past" | "deleted";

function formatDate(key: string): string {
  const d = fromDateKey(key);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${WEEKDAYS_KO[d.getDay()]})`;
}

function formatCreated(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// 예약의 종료 시각을 Date로 (지남/예정 판정용)
function endAt(r: Reservation): number {
  const d = fromDateKey(r.date);
  const [h, m] = r.end.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export default function HistoryPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [colors, setColors] = useState<NameColorMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState<number>(0);

  const load = async () => {
    try {
      const res = await fetch("/api/reservations", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReservations(data.reservations ?? []);
      setColors(data.colors ?? {});
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNow(Date.now());
    load();
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reservations
      .filter((r) => {
        // 삭제된 예약은 "전체"와 "삭제" 탭에서만 표시
        if (r.deletedAt) {
          if (filter === "upcoming" || filter === "past") return false;
        } else if (filter === "deleted") {
          return false;
        }
        if (filter === "upcoming" && endAt(r) < now) return false;
        if (filter === "past" && endAt(r) >= now) return false;
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.organizer.toLowerCase().includes(q) ||
          (r.note ?? "").toLowerCase().includes(q)
        );
      })
      // 최신 일정이 위로 (날짜 → 시작시간 내림차순)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.start < b.start ? 1 : -1;
      });
  }, [reservations, filter, query, now]);

  // 날짜별 그룹핑
  const groups = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of rows) {
      const arr = map.get(r.date) ?? [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return Array.from(map.entries());
  }, [rows]);

  const todayKey = now ? toDateKey(new Date(now)) : "";

  return (
    <div className="flex h-full flex-col bg-white text-[#3c4043]">
      {/* 상단 앱 바 */}
      <header className="flex items-center gap-2 border-b border-[#dadce0] px-4 py-2.5 sm:gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a73e8] text-lg text-white">
            🗂️
          </div>
          <h1 className="hidden text-lg font-normal text-[#5f6368] sm:block">
            예약 히스토리
          </h1>
        </div>

        <a
          href="/"
          className="shrink-0 rounded-md border border-[#dadce0] px-3 py-1.5 text-sm font-medium text-[#3c4043] hover:bg-[#f1f3f4] sm:ml-2 sm:px-4"
        >
          ← 캘린더로
        </a>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·예약자·메모 검색"
            className="w-full min-w-0 rounded-full border border-[#dadce0] px-4 py-1.5 text-sm outline-none focus:border-[#1a73e8] sm:w-56"
          />
        </div>
      </header>

      {/* 필터 탭 */}
      <div className="flex items-center gap-2 border-b border-[#f1f3f4] px-4 py-2">
        {(
          [
            ["all", "전체"],
            ["upcoming", "예정"],
            ["past", "지난"],
            ["deleted", "삭제"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "bg-[#e8f0fe] text-[#1a73e8]"
                : "text-[#5f6368] hover:bg-[#f1f3f4]"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-[#80868b]">
          {rows.length}건
        </span>
      </div>

      {/* 목록 */}
      <main className="flex-1 overflow-auto">
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
          <div className="flex h-full items-center justify-center text-sm text-[#5f6368]">
            불러오는 중…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[#5f6368]">
            <span className="text-4xl">🗒️</span>
            <p className="text-sm">표시할 예약이 없습니다.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-5">
            {groups.map(([date, items]) => (
              <section key={date} className="mb-6">
                <div className="sticky top-0 z-10 -mx-2 mb-2 flex items-center gap-2 bg-white/90 px-2 py-1 backdrop-blur">
                  <h2 className="text-sm font-medium text-[#3c4043]">
                    {formatDate(date)}
                  </h2>
                  {date === todayKey && (
                    <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[11px] font-medium text-[#188038]">
                      오늘
                    </span>
                  )}
                </div>

                <ul className="space-y-2">
                  {items.map((r) => {
                    const room = getRoom(r.roomId);
                    const past = endAt(r) < now;
                    return (
                      <li
                        key={r.id}
                        className={`flex items-stretch gap-3 rounded-lg border border-[#e0e0e0] p-3 ${
                          r.deletedAt || past ? "opacity-70" : ""
                        }`}
                      >
                        <span
                          className="w-1 shrink-0 rounded-full"
                          style={{
                            background:
                              colors[r.organizer]?.border ??
                              room?.border ??
                              "#5f6368",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-[15px] font-medium text-[#3c4043]">
                              {r.title}
                            </h3>
                            {r.deletedAt ? (
                              <span className="shrink-0 rounded-full bg-[#fce8e6] px-2 py-0.5 text-[11px] font-medium text-[#c5221f]">
                                삭제됨
                              </span>
                            ) : past ? (
                              <span className="shrink-0 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[11px] text-[#80868b]">
                                지남
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[11px] font-medium text-[#1a73e8]">
                                예정
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-[#5f6368]">
                            {r.start}~{r.end} · {room?.name ?? "삭제된 회의실"} ·{" "}
                            <span className="font-medium text-[#3c4043]">
                              {r.organizer}
                            </span>
                          </p>
                          {r.note && (
                            <p className="mt-1 truncate text-[13px] text-[#80868b]">
                              📝 {r.note}
                            </p>
                          )}
                        </div>
                        <div className="hidden shrink-0 flex-col items-end justify-center text-right sm:flex">
                          <span className="text-[11px] text-[#80868b]">
                            등록 {formatCreated(r.createdAt)}
                          </span>
                          {r.deletedAt && (
                            <span className="text-[11px] text-[#c5221f]">
                              삭제 {formatCreated(r.deletedAt)}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
