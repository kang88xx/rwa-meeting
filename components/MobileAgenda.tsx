"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { minutesToTime, timeToMinutes, toDateKey } from "@/lib/date";
import { ROOMS } from "@/lib/rooms";
import type { NameColorMap, Reservation } from "@/lib/types";
import styles from "./MobileAgenda.module.css";

const DAY_START = 7 * 60;
const DAY_END = 22 * 60;
const DEFAULT_DURATION = 60;
const MIN_DURATION = 30;
const DURATION_PRESETS = [30, 60, 120, 180];

const ROOM_LABELS: Record<string, string> = {
  main: "대회의실",
  small: "소회의실",
};

export type MobileAgendaProps = {
  date: Date;
  reservations: Reservation[];
  colors: NameColorMap;
  onCreate: (
    date: Date,
    startMin: number,
    endMin: number,
    roomId: string
  ) => void;
  onEventClick: (res: Reservation, el: HTMLElement) => void;
  pickerOnly?: boolean;
  initialSlot?: { roomId: string; startMin: number };
};

type FreeRow = {
  type: "free";
  startMin: number;
  endMin: number;
};

type ReservationRow = {
  type: "reservation";
  startMin: number;
  endMin: number;
  reservation: Reservation;
  overlappingRoomNames: string[];
};

export type AgendaRow = FreeRow | ReservationRow;

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
) {
  return aStart < bEnd && bStart < aEnd;
}

function splitFreeInterval(startMin: number, endMin: number): FreeRow[] {
  const rows: FreeRow[] = [];
  let cursor = startMin;

  while (endMin - cursor >= MIN_DURATION) {
    const duration =
      endMin - cursor >= DEFAULT_DURATION
        ? DEFAULT_DURATION
        : MIN_DURATION;
    rows.push({ type: "free", startMin: cursor, endMin: cursor + duration });
    cursor += duration;
  }

  return rows;
}

/**
 * Builds the mobile agenda without discarding historical or legacy records.
 * Free time is calculated only inside the supported 07:00–22:00 booking window.
 */
export function buildAgendaRows(
  dateKey: string,
  roomId: string,
  reservations: Reservation[]
): AgendaRow[] {
  const dayReservations = reservations
    .filter((reservation) => reservation.date === dateKey)
    .sort(
      (a, b) =>
        timeToMinutes(a.start) - timeToMinutes(b.start) ||
        timeToMinutes(a.end) - timeToMinutes(b.end) ||
        a.createdAt.localeCompare(b.createdAt)
    );
  const selectedRoomReservations = dayReservations.filter(
    (reservation) => reservation.roomId === roomId
  );

  const occupied = selectedRoomReservations
    .map((reservation) => ({
      startMin: Math.max(DAY_START, timeToMinutes(reservation.start)),
      endMin: Math.min(DAY_END, timeToMinutes(reservation.end)),
    }))
    .filter((interval) => interval.startMin < interval.endMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
    .reduce<Array<{ startMin: number; endMin: number }>>((merged, interval) => {
      const last = merged.at(-1);
      if (!last || interval.startMin > last.endMin) {
        merged.push({ ...interval });
      } else {
        last.endMin = Math.max(last.endMin, interval.endMin);
      }
      return merged;
    }, []);

  const freeRows: FreeRow[] = [];
  let cursor = DAY_START;
  for (const interval of occupied) {
    freeRows.push(...splitFreeInterval(cursor, interval.startMin));
    cursor = Math.max(cursor, interval.endMin);
  }
  freeRows.push(...splitFreeInterval(cursor, DAY_END));

  const reservationRows: ReservationRow[] = selectedRoomReservations.map(
    (reservation) => {
      const startMin = timeToMinutes(reservation.start);
      const endMin = timeToMinutes(reservation.end);
      const overlappingRoomNames = Array.from(
        new Set(
          dayReservations
            .filter(
              (other) =>
                other.roomId !== roomId &&
                intervalsOverlap(
                  startMin,
                  endMin,
                  timeToMinutes(other.start),
                  timeToMinutes(other.end)
                )
            )
            .map((other) => ROOM_LABELS[other.roomId] ?? other.roomId)
        )
      );

      return {
        type: "reservation",
        startMin,
        endMin,
        reservation,
        overlappingRoomNames,
      };
    }
  );

  return [...reservationRows, ...freeRows].sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    if (a.type !== b.type) return a.type === "reservation" ? -1 : 1;
    return a.endMin - b.endMin;
  });
}

// Agenda rows are display-sized pieces; a reservation may span several of them.
export function getAvailableWindow(
  rows: AgendaRow[],
  startMin: number
): { startMin: number; endMin: number } | null {
  if (!Number.isFinite(startMin) || startMin % MIN_DURATION !== 0 || startMin < DAY_START || startMin >= DAY_END) return null;
  const windows: Array<{ startMin: number; endMin: number }> = [];
  for (const row of rows.filter(row => row.type === "free").sort((a, b) => a.startMin - b.startMin)) {
    const last = windows.at(-1);
    if (last && row.startMin <= last.endMin) last.endMin = Math.max(last.endMin, row.endMin);
    else windows.push({ startMin: row.startMin, endMin: row.endMin });
  }
  return windows.find(window => window.startMin <= startMin && startMin < window.endMin) ?? null;
}

export function canSelectRange(rows: AgendaRow[], startMin: number, endMin: number): boolean {
  if (!Number.isFinite(endMin) || endMin % MIN_DURATION !== 0 || endMin <= startMin || endMin > DAY_END) return false;
  const window = getAvailableWindow(rows, startMin);
  return Boolean(window && endMin <= window.endMin);
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}시간${remainder ? ` ${remainder}분` : ""}` : `${minutes}분`;
}

function formatDate(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatDateWithWeekday(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function bookingStatus(dateKey: string, endMin: number, startMin: number, now: Date) {
  const todayKey = toDateKey(now);
  if (dateKey < todayKey) return "종료";
  if (dateKey > todayKey) return "예정";

  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (endMin <= nowMin) return "종료";
  if (startMin <= nowMin) return "진행 중";
  return "예정";
}

export default function MobileAgenda({
  date,
  reservations,
  colors,
  onCreate,
  onEventClick,
  pickerOnly = false,
  initialSlot,
}: MobileAgendaProps) {
  const dateKey = toDateKey(date);
  const [selectedRoomId, setSelectedRoomId] = useState(initialSlot?.roomId ?? ROOMS[0]?.id ?? "main");
  const [selectedTime, setSelectedTime] = useState<FreeRow | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [summaryHeight, setSummaryHeight] = useState(280);
  const selectionIntentRef = useRef("");
  const initialStart = initialSlot?.startMin;
  const selectionIntent = `${dateKey}:${selectedRoomId}:${initialStart ?? "none"}`;

  const rows = useMemo(
    () => buildAgendaRows(dateKey, selectedRoomId, reservations),
    [dateKey, selectedRoomId, reservations]
  );

  useEffect(() => {
    if (initialSlot) setSelectedRoomId(initialSlot.roomId);
  }, [initialSlot?.roomId]);

  useEffect(() => {
    if (selectionIntentRef.current === selectionIntent) return;
    selectionIntentRef.current = selectionIntent;
    const window = initialStart === undefined ? null : getAvailableWindow(rows, initialStart);
    setSelectedTime(window && initialStart !== undefined
      ? { type: "free", startMin: initialStart, endMin: Math.min(initialStart + DEFAULT_DURATION, window.endMin) }
      : null);
  }, [selectionIntent, initialStart, rows]);

  useEffect(() => {
    if (!selectedTime) return;
    const frame = requestAnimationFrame(() => selectedRowRef.current?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [selectedTime, summaryHeight]);

  useEffect(() => {
    const element = summaryRef.current;
    if (!element) return;
    const measure = () => setSummaryHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedTime]);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedTime) return;
    const stillAvailable = canSelectRange(rows, selectedTime.startMin, selectedTime.endMin);
    if (!stillAvailable) setSelectedTime(null);
  }, [rows, selectedTime]);

  const todayKey = now ? toDateKey(now) : null;
  const selectedRoomName = ROOM_LABELS[selectedRoomId] ?? selectedRoomId;

  const isPastSlot = (row: FreeRow) => {
    if (!now || !todayKey) return false;
    if (dateKey < todayKey) return true;
    if (dateKey > todayKey) return false;
    return row.startMin <= now.getHours() * 60 + now.getMinutes();
  };

  const visibleRows = rows.filter(row => row.type === "reservation" || !isPastSlot(row));
  const availableWindow = selectedTime ? getAvailableWindow(rows, selectedTime.startMin) : null;
  const duration = selectedTime ? selectedTime.endMin - selectedTime.startMin : DEFAULT_DURATION;
  const validSelection = selectedTime && !isPastSlot(selectedTime) && canSelectRange(rows, selectedTime.startMin, selectedTime.endMin);
  const earliestStart = now && todayKey === dateKey
    ? (Math.floor((now.getHours() * 60 + now.getMinutes()) / MIN_DURATION) + 1) * MIN_DURATION
    : DAY_START;
  const startOptions: number[] = [];
  const endOptions: number[] = [];
  if (selectedTime && availableWindow) {
    for (let time = Math.max(availableWindow.startMin, earliestStart); time + duration <= availableWindow.endMin; time += MIN_DURATION) startOptions.push(time);
    for (let time = selectedTime.startMin + MIN_DURATION; time <= availableWindow.endMin; time += MIN_DURATION) endOptions.push(time);
  }
  const selectRange = (startMin: number, endMin: number) => {
    if (canSelectRange(rows, startMin, endMin)) setSelectedTime({ type: "free", startMin, endMin });
  };

  return (
    <section className={`${styles.agenda} ${pickerOnly ? styles.picker : ""}`} aria-label={`${formatDate(date)} 회의실 일정`}>
      <div className={styles.roomTabsSticky}>
      <div className={styles.roomTabs} role="group" aria-label="회의실 선택">
        {ROOMS.map((room) => {
          const label = ROOM_LABELS[room.id] ?? room.name.replace(/^\d+F\s*/, "");
          const selected = room.id === selectedRoomId;
          return (
            <button
              key={room.id}
              type="button"
              aria-pressed={selected}
              className={`${styles.roomTab} ${selected ? styles.roomTabSelected : ""}`}
              onClick={() => setSelectedRoomId(room.id)}
            >
              {label}
            </button>
          );
        })}
      </div>
      </div>

      {!pickerOnly && <>
      <header className={styles.sectionHeader}>
        <h2>{todayKey === dateKey ? "오늘의 일정" : "선택한 날의 일정"}</h2>
        <p>{selectedRoomName} · 빈 시간 선택 후 예약 길이를 정하세요</p>
      </header>

      <div className={styles.rows} role="group" aria-label={`${selectedRoomName} 시간별 일정`}>
        {visibleRows.length === 0 && <p className={styles.empty}>이 날에는 표시할 예약이 없습니다.</p>}
        {visibleRows.map((row, index) => {
          const timeLabel = `${minutesToTime(row.startMin)}–${minutesToTime(row.endMin)}`;

          if (row.type === "reservation") {
            const color = colors[row.reservation.organizer];
            const status = now
              ? bookingStatus(dateKey, row.endMin, row.startMin, now)
              : "";
            return (
              <button
                key={`reservation-${row.reservation.id}-${index}`}
                type="button"
                className={styles.reservationRow}
                style={{
                  borderInlineStartColor: color?.border ?? "#5f6368",
                  backgroundColor: status === "종료" ? "#f8f9fb" : "#ffffff",
                }}
                onClick={(event) => onEventClick(row.reservation, event.currentTarget)}
                aria-label={`${timeLabel} ${row.reservation.title || "예약"}, ${row.reservation.organizer}${status ? `, ${status}` : ""}`}
              >
                <span className={styles.time}>{timeLabel}</span>
                <span className={styles.reservationDetails}>
                  <strong>{row.reservation.title || "예약"}</strong>
                  <span>{row.reservation.organizer}</span>
                  {row.overlappingRoomNames.length > 0 && (
                    <span className={styles.overlapNote}>
                      같은 시간 · {row.overlappingRoomNames.join(", ")}에도 예약
                    </span>
                  )}
                </span>
                <span className={styles.status}>{status}</span>
              </button>
            );
          }

          const selected = Boolean(selectedTime && intervalsOverlap(row.startMin, row.endMin, selectedTime.startMin, selectedTime.endMin));
          const startsSelection = Boolean(selectedTime && row.startMin <= selectedTime.startMin && selectedTime.startMin < row.endMin);
          const shownTimeLabel = selected && selectedTime
            ? `${minutesToTime(Math.max(row.startMin, selectedTime.startMin))}–${minutesToTime(Math.min(row.endMin, selectedTime.endMin))}`
            : timeLabel;
          const past = isPastSlot(row);

          return (
            <button
              key={`free-${row.startMin}-${row.endMin}`}
              ref={startsSelection ? selectedRowRef : undefined}
              type="button"
              className={`${styles.freeRow} ${selected ? styles.freeRowSelected : ""}`}
              style={{ scrollMarginBottom: selectedTime ? summaryHeight + 12 : 195 }}
              disabled={past}
              aria-pressed={selected}
              onClick={() => setSelectedTime(row)}
              aria-label={`${shownTimeLabel} ${past ? "지난 시간" : selected ? "선택한 시간" : "예약 가능"}`}
            >
              <span className={styles.time}>{shownTimeLabel}</span>
              <span className={styles.freeDetails}>
                <strong>{past ? "지난 시간" : "예약 가능"}</strong>
                {selected && <span>선택한 시간</span>}
              </span>
              <span className={styles.selectAction} aria-hidden="true">
                {selected ? "선택됨" : past ? "" : "선택"}
              </span>
            </button>
          );
        })}
      </div>
      </>}

      {pickerOnly && !validSelection && <p className={styles.pickerEmpty} role="status">선택한 시각에는 예약할 수 없습니다. 다른 회의실을 선택하거나 달력에서 시간을 다시 선택해 주세요.</p>}

      {selectedTime && availableWindow && validSelection && (
        <aside ref={summaryRef} className={styles.summary} aria-label="선택한 예약 시간">
          <div className={styles.summaryText}>
            <div className={styles.summaryHeading}><strong>예약 시간</strong><span aria-live="polite">{durationLabel(duration)}</span></div>
            <span>{selectedRoomName} · {formatDateWithWeekday(date)}</span>
          </div>
          <div className={styles.timeFields}>
            <label>시작<select aria-label="예약 시작 시간" value={selectedTime.startMin} onChange={event => selectRange(Number(event.target.value), Number(event.target.value) + duration)}>
              {startOptions.map(time => <option key={time} value={time}>{minutesToTime(time)}</option>)}
            </select></label>
            <label>종료<select aria-label="예약 종료 시간" value={selectedTime.endMin} onChange={event => selectRange(selectedTime.startMin, Number(event.target.value))}>
              {endOptions.map(time => <option key={time} value={time}>{minutesToTime(time)}</option>)}
            </select></label>
          </div>
          <div className={styles.durationPresets} role="group" aria-label="예약 길이">
            {DURATION_PRESETS.map(minutes => <button key={minutes} type="button" aria-pressed={duration === minutes} aria-describedby="mobile-duration-limit"
              disabled={!canSelectRange(rows, selectedTime.startMin, selectedTime.startMin + minutes)}
              onClick={() => selectRange(selectedTime.startMin, selectedTime.startMin + minutes)}>{durationLabel(minutes)}</button>)}
          </div>
          <p className={styles.durationLimit} id="mobile-duration-limit">
            {availableWindow.endMin === DAY_END ? "운영 종료" : "다음 예약"} {minutesToTime(availableWindow.endMin)}까지 · 최대 {durationLabel(availableWindow.endMin - selectedTime.startMin)}
          </p>
          <button
            type="button"
            className={styles.createButton}
            onClick={() =>
              onCreate(
                date,
                selectedTime.startMin,
                selectedTime.endMin,
                selectedRoomId
              )
            }
          >
            {durationLabel(duration)} 예약하기
          </button>
        </aside>
      )}
    </section>
  );
}
