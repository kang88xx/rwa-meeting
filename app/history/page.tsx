"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { NameColorMap, Reservation } from "@/lib/types";
import { getRoom } from "@/lib/rooms";
import { fromDateKey, toDateKey, WEEKDAYS_KO } from "@/lib/date";
import styles from "./history.module.css";

type Filter = "all" | "upcoming" | "past" | "deleted";

const filters: [Filter, string][] = [
  ["all", "전체"],
  ["upcoming", "예정"],
  ["past", "지난 예약"],
  ["deleted", "삭제"],
];

function formatDate(key: string): string {
  const d = fromDateKey(key);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${WEEKDAYS_KO[d.getDay()]})`;
}

function formatCreated(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function endAt(reservation: Reservation): number {
  const d = fromDateKey(reservation.date);
  const [h, m] = reservation.end.split(":").map(Number);
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
      .filter((reservation) => {
        if (reservation.deletedAt) {
          if (filter === "upcoming" || filter === "past") return false;
        } else if (filter === "deleted") {
          return false;
        }
        if (filter === "upcoming" && endAt(reservation) < now) return false;
        if (filter === "past" && endAt(reservation) >= now) return false;
        if (!q) return true;
        return (
          reservation.title.toLowerCase().includes(q) ||
          reservation.organizer.toLowerCase().includes(q) ||
          (reservation.note ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.start < b.start ? 1 : -1;
      });
  }, [reservations, filter, query, now]);

  const groups = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of rows) {
      const items = map.get(reservation.date) ?? [];
      items.push(reservation);
      map.set(reservation.date, items);
    }
    return Array.from(map.entries());
  }, [rows]);

  const todayKey = now ? toDateKey(new Date(now)) : "";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Image className={styles.logo} src="/company-logo.svg" alt="Realworlds" width={132} height={24} priority />
          <h1>예약 내역</h1>
        </div>
        <a href="/" className={styles.backLink}>캘린더로</a>
        <div className={styles.searchWrap}>
          <label htmlFor="history-search" className={styles.visuallyHidden}>예약 내역 검색</label>
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 예약자, 메모 검색"
            className={styles.search}
          />
        </div>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.filters} aria-label="예약 상태 필터">
          {filters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={filter === key ? styles.filterActive : styles.filter}
              aria-pressed={filter === key}
            >
              {label}
            </button>
          ))}
        </div>
        <span className={styles.count} aria-live="polite">{rows.length}건</span>
      </div>

      <main className={styles.main}>
        {loadError && (
          <div className={styles.loadError} role="alert">
            <span>예약 정보를 불러오지 못했습니다.</span>
            <button type="button" onClick={() => { setLoading(true); load(); }}>다시 시도</button>
          </div>
        )}

        {loading ? (
          <div className={styles.centerMessage}>불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className={styles.centerMessage}>
            <strong>표시할 예약이 없습니다.</strong>
            <span>검색어나 상태 필터를 바꿔보세요.</span>
          </div>
        ) : (
          <div className={styles.listWrap}>
            {groups.map(([date, items]) => (
              <section key={date} className={styles.group}>
                <div className={styles.dateHeading}>
                  <h2>{formatDate(date)}</h2>
                  {date === todayKey && <span className={styles.todayBadge}>오늘</span>}
                </div>

                <ul className={styles.list}>
                  {items.map((reservation) => {
                    const room = getRoom(reservation.roomId);
                    const past = endAt(reservation) < now;
                    return (
                      <li key={reservation.id} className={`${styles.card} ${reservation.deletedAt || past ? styles.cardMuted : ""}`}>
                        <span
                          className={styles.cardAccent}
                          style={{ background: colors[reservation.organizer]?.border ?? room?.border ?? "#5f6368" }}
                          aria-hidden="true"
                        />
                        <div className={styles.cardBody}>
                          <div className={styles.cardTitleRow}>
                            <h3>{reservation.title}</h3>
                            {reservation.deletedAt ? (
                              <span className={styles.deletedBadge}>삭제됨</span>
                            ) : past ? (
                              <span className={styles.pastBadge}>지남</span>
                            ) : (
                              <span className={styles.upcomingBadge}>예정</span>
                            )}
                          </div>
                          <p className={styles.metadata}>
                            <strong>{reservation.start}–{reservation.end}</strong>
                            <span>{room?.name ?? "삭제된 회의실"}</span>
                            <span>{reservation.organizer}</span>
                          </p>
                          {reservation.note && <p className={styles.note}>{reservation.note}</p>}
                        </div>
                        <div className={styles.timestamps}>
                          <span>등록 {formatCreated(reservation.createdAt)}</span>
                          {reservation.deletedAt && <span className={styles.deletedTime}>삭제 {formatCreated(reservation.deletedAt)}</span>}
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
