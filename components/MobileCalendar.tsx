"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  addDays,
  fromDateKey,
  formatMonthTitle,
  minutesToTime,
  toDateKey,
  WEEKDAYS_KO,
} from "@/lib/date";
import {
  MOBILE_DAY_END,
  MOBILE_DAY_START,
  MOBILE_HOUR_HEIGHT,
  MOBILE_SNAP_MINUTES,
  layoutMobileReservations,
  mobileSlotFromOffset,
} from "@/lib/mobile-calendar";
import { ROOMS, getRoom } from "@/lib/rooms";
import type { NameColorMap, Reservation } from "@/lib/types";
import {
  buildAgendaRows,
  canSelectRange,
} from "./MobileAgenda";
import MobileAgenda from "./MobileAgenda";
import styles from "./MobileCalendar.module.css";

const ROOM_LABELS: Record<string, string> = {
  main: "대회의실",
  small: "소회의실",
};

type RoomFilter = "all" | string;
type Picker = { date: Date; startMin: number; roomId: string };

export type MobileCalendarProps = {
  anchor: Date;
  onAnchorChange: (date: Date) => void;
  reservations: Reservation[];
  colors: NameColorMap;
  onCreate: (
    date: Date,
    startMin: number,
    endMin: number,
    roomId: string
  ) => void;
  onEventClick: (reservation: Reservation, element: HTMLElement) => void;
};

function Icon({ name }: { name: string }) {
  return (
    <img
      className={styles.icon}
      src={`/icons/${name}.svg`}
      width="18"
      height="18"
      alt=""
      aria-hidden="true"
    />
  );
}

function roomLabel(roomId: string) {
  return (
    ROOM_LABELS[roomId] ??
    getRoom(roomId)?.name.replace(/^\s*\d+F\s*/i, "") ??
    "회의실"
  );
}

function ceilToHalfHour(minutes: number) {
  return Math.ceil(minutes / MOBILE_SNAP_MINUTES) * MOBILE_SNAP_MINUTES;
}

export default function MobileCalendar({
  anchor,
  onAnchorChange,
  reservations,
  colors,
  onCreate,
  onEventClick,
}: MobileCalendarProps) {
  const [dayCount, setDayCount] = useState<1 | 3>(3);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [picker, setPicker] = useState<Picker | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerRef = useRef<{
    x: number;
    y: number;
    date: Date;
    rect: DOMRect;
  } | null>(null);

  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const cancelPointer = useCallback(() => {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    pointerRef.current = null;
  }, []);

  useEffect(() => {
    cancelPointer();
    return cancelPointer;
  }, [anchor, dayCount, roomFilter, cancelPointer]);

  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, index) => addDays(anchor, index)),
    [anchor, dayCount]
  );
  const activeReservations = useMemo(
    () => reservations.filter((reservation) => !reservation.deletedAt),
    [reservations]
  );
  const filteredReservations = useMemo(
    () =>
      roomFilter === "all"
        ? activeReservations
        : activeReservations.filter(
            (reservation) => reservation.roomId === roomFilter
          ),
    [activeReservations, roomFilter]
  );
  const byDay = useMemo(() => {
    const grouped = new Map<string, Reservation[]>();
    for (const reservation of filteredReservations) {
      const day = grouped.get(reservation.date) ?? [];
      day.push(reservation);
      grouped.set(reservation.date, day);
    }
    return grouped;
  }, [filteredReservations]);
  const hours = useMemo(
    () =>
      Array.from(
        { length: MOBILE_DAY_END / 60 - MOBILE_DAY_START / 60 + 1 },
        (_, index) => MOBILE_DAY_START / 60 + index
      ),
    []
  );
  const bodyHeight =
    ((MOBILE_DAY_END - MOBILE_DAY_START) / 60) * MOBILE_HOUR_HEIGHT;
  const todayKey = now ? toDateKey(now) : null;
  const gridColumns = `44px repeat(${dayCount}, minmax(0, 1fr))`;

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = MOBILE_HOUR_HEIGHT - 8;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (picker && !dialog.open) dialog.showModal();
    if (!picker && dialog.open) dialog.close();
  }, [picker]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const closePicker = () => setPicker(null);

  const changeAnchor = (date: Date) => {
    cancelPointer();
    closePicker();
    setNotice("");
    onAnchorChange(date);
  };

  const changeRoomFilter = (filter: RoomFilter) => {
    cancelPointer();
    closePicker();
    setNotice("");
    setRoomFilter(filter);
  };

  const candidateRoomIds = () =>
    roomFilter === "all"
      ? ROOMS.map((room) => room.id)
      : ROOMS.filter((room) => room.id === roomFilter).map((room) => room.id);

  const roomAvailable = (date: Date, startMin: number, roomId: string) =>
    canSelectRange(
      buildAgendaRows(toDateKey(date), roomId, activeReservations),
      startMin,
      startMin + MOBILE_SNAP_MINUTES
    );

  const openPickerAt = (date: Date, startMin: number) => {
    const current = new Date();
    const dateKey = toDateKey(date);
    const currentKey = toDateKey(current);
    if (
      dateKey < currentKey ||
      (dateKey === currentKey &&
        startMin <= current.getHours() * 60 + current.getMinutes())
    ) {
      setNotice("지난 시간은 예약할 수 없습니다.");
      return;
    }
    const roomId = candidateRoomIds().find((id) =>
      roomAvailable(date, startMin, id)
    );
    if (!roomId) {
      setNotice("이 시간에는 선택한 회의실이 모두 예약되어 있습니다.");
      return;
    }
    setNotice("");
    setPicker({ date, startMin, roomId });
  };

  const openNearestAvailable = () => {
    const current = new Date();
    const currentKey = toDateKey(current);
    const anchorKey = toDateKey(anchor);
    const targetDate = anchorKey <= currentKey ? current : anchor;
    const targetKey = toDateKey(targetDate);
    const startAt =
      targetKey === currentKey
        ? Math.max(
            MOBILE_DAY_START,
            ceilToHalfHour(current.getHours() * 60 + current.getMinutes() + 1)
          )
        : 9 * 60;

    for (
      let startMin = startAt;
      startMin + MOBILE_SNAP_MINUTES <= MOBILE_DAY_END;
      startMin += MOBILE_SNAP_MINUTES
    ) {
      const roomId = candidateRoomIds().find((id) =>
        roomAvailable(targetDate, startMin, id)
      );
      if (roomId) {
        if (anchorKey !== targetKey) onAnchorChange(targetDate);
        setPicker({ date: targetDate, startMin, roomId });
        setNotice("");
        return;
      }
    }
    setNotice("선택한 날에는 예약 가능한 30분 시간이 없습니다.");
  };

  const finishPointer = (event: PointerEvent | null) => {
    const pointer = pointerRef.current;
    cancelPointer();
    if (!pointer || !event) return;
    if (
      Math.abs(event.clientX - pointer.x) > 10 ||
      Math.abs(event.clientY - pointer.y) > 10
    ) {
      return;
    }
    openPickerAt(
      pointer.date,
      mobileSlotFromOffset(event.clientY - pointer.rect.top)
    );
  };

  function handleWindowPointerUp(event: PointerEvent) {
    finishPointer(event);
  }

  function handleWindowPointerCancel() {
    finishPointer(null);
  }

  const handleColumnPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    date: Date
  ) => {
    cancelPointer();
    if ((event.target as HTMLElement).closest("[data-reservation]")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      date,
      rect: event.currentTarget.getBoundingClientRect(),
    };
    pointerCleanupRef.current = () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
    window.addEventListener("pointerup", handleWindowPointerUp, { once: true });
    window.addEventListener("pointercancel", handleWindowPointerCancel, {
      once: true,
    });
  };

  const openKeyboardSlot = (date: Date) => {
    const current = new Date();
    const start =
      toDateKey(date) === toDateKey(current)
        ? Math.max(
            MOBILE_DAY_START,
            ceilToHalfHour(current.getHours() * 60 + current.getMinutes() + 1)
          )
        : 9 * 60;
    openPickerAt(date, Math.min(start, MOBILE_DAY_END - MOBILE_SNAP_MINUTES));
  };

  return (
    <section className={`${styles.calendar} ${dayCount === 1 ? styles.singleDay : ""}`} aria-label="모바일 회의실 일정">
      <div className={styles.controls}>
        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.todayButton}
            onClick={() => changeAnchor(new Date())}
          >
            오늘
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`이전 ${dayCount}일`}
            onClick={() => changeAnchor(addDays(anchor, -dayCount))}
          >
            <Icon name="chevron-left" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`다음 ${dayCount}일`}
            onClick={() => changeAnchor(addDays(anchor, dayCount))}
          >
            <Icon name="chevron-right" />
          </button>
          <strong className={styles.monthTitle} title={formatMonthTitle(days)}>{formatMonthTitle(days)}</strong>
          <label className={styles.datePicker} aria-label="날짜로 이동">
            <Icon name="calendar3" />
            <input
              type="date"
              value={toDateKey(anchor)}
              onChange={(event) => {
                if (event.target.value) changeAnchor(fromDateKey(event.target.value));
              }}
            />
          </label>
        </div>

        <div className={styles.viewOptions}>
          <div className={styles.roomFilters} role="group" aria-label="회의실 필터">
            <button
              type="button"
              aria-pressed={roomFilter === "all"}
              onClick={() => changeRoomFilter("all")}
            >
              전체
            </button>
            {ROOMS.map((room) => (
              <button
                type="button"
                key={room.id}
                aria-pressed={roomFilter === room.id}
                onClick={() => changeRoomFilter(room.id)}
              >
                <span
                  className={styles.roomDot}
                  style={{ backgroundColor: room.dot }}
                  aria-hidden="true"
                />
                {roomLabel(room.id)}
              </button>
            ))}
          </div>
          <div className={styles.dayToggle} role="group" aria-label="표시 일수">
            {([3, 1] as const).map((count) => (
              <button
                type="button"
                key={count}
                aria-pressed={dayCount === count}
                onClick={() => {
                  cancelPointer();
                  closePicker();
                  setDayCount(count);
                }}
              >
                {count}일
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.dayHeaderGuard}>
        <div className={styles.dayHeaderGrid} style={{ gridTemplateColumns: gridColumns }}>
          <div className={styles.timeHeader} aria-hidden="true" />
          {days.map((date) => {
            const key = toDateKey(date);
            const today = key === todayKey;
            const bookingCount = (byDay.get(key) ?? []).length;
            return (
              <button
                type="button"
                key={key}
                className={`${styles.dayHeader} ${today ? styles.todayHeader : ""}`}
                aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS_KO[date.getDay()]}요일로 이동`}
                onClick={() => changeAnchor(date)}
              >
                <span className={styles.weekdayLine}>
                  <span className={date.getDay() === 0 ? styles.sunday : ""}>
                    {WEEKDAYS_KO[date.getDay()]}
                  </span>
                  <em>{bookingCount > 0 ? `${bookingCount}건` : "예약 없음"}</em>
                </span>
                <strong className={today ? styles.todayNumber : ""}>
                  {date.getDate()}
                </strong>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={scrollRef} className={`gc-scroll ${styles.scrollBody}`}>
        <div
          className={styles.timeline}
          style={{ height: bodyHeight, gridTemplateColumns: gridColumns }}
        >
          <div className={styles.timeGutter} aria-hidden="true">
            {hours.map((hour, index) =>
              index === 0 ? null : (
                <span
                  key={hour}
                  className={styles.timeLabel}
                  style={{ top: (hour - MOBILE_DAY_START / 60) * MOBILE_HOUR_HEIGHT }}
                >
                  {hour}시
                </span>
              )
            )}
          </div>

          {days.map((date) => {
            const key = toDateKey(date);
            const positioned = layoutMobileReservations(byDay.get(key) ?? []);
            const today = key === todayKey;
            const currentMinutes = now
              ? now.getHours() * 60 + now.getMinutes()
              : -1;
            const showCurrentLine =
              today &&
              currentMinutes >= MOBILE_DAY_START &&
              currentMinutes <= MOBILE_DAY_END;

            return (
              <div
                key={key}
                className={`${styles.dayColumn} ${today ? styles.todayColumn : ""}`}
                onPointerDown={(event) => handleColumnPointerDown(event, date)}
              >
                <button
                  type="button"
                  className={styles.keyboardCreate}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => openKeyboardSlot(date)}
                >
                  {date.getMonth() + 1}월 {date.getDate()}일 가까운 빈 시간 예약
                </button>
                {hours.map((hour) => (
                  <span
                    key={hour}
                    className={styles.hourLine}
                    style={{ top: (hour - MOBILE_DAY_START / 60) * MOBILE_HOUR_HEIGHT }}
                    aria-hidden="true"
                  />
                ))}

                {showCurrentLine && (
                  <span
                    className={styles.currentTime}
                    style={{
                      top:
                        ((currentMinutes - MOBILE_DAY_START) / 60) *
                        MOBILE_HOUR_HEIGHT,
                    }}
                    aria-hidden="true"
                  >
                    <span />
                  </span>
                )}

                {positioned.map((reservation) => {
                  const color = colors[reservation.organizer];
                  const room = getRoom(reservation.roomId);
                  const narrow = reservation.columnCount > 1 && dayCount === 3;
                  const short = reservation.height <= MOBILE_HOUR_HEIGHT / 2 + 1;
                  const width = 100 / reservation.columnCount;
                  const eventStyle = {
                    top: reservation.top,
                    height: reservation.height,
                    left: `calc(${reservation.column * width}% + 2px)`,
                    width: `calc(${width}% - 4px)`,
                    backgroundColor: color?.bg ?? room?.color ?? "#eef2f7",
                    borderColor: color?.border ?? room?.border ?? "#69717e",
                  } as CSSProperties;
                  const fullLabel = `${roomLabel(reservation.roomId)}, ${reservation.start}부터 ${reservation.end}, ${reservation.title || "예약"}, 예약자 ${reservation.organizer}`;

                  return (
                    <button
                      type="button"
                      key={reservation.id}
                      data-reservation
                      className={`${styles.event} ${narrow ? styles.narrowEvent : ""} ${short ? styles.shortEvent : ""}`}
                      style={eventStyle}
                      aria-label={fullLabel}
                      title={fullLabel}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEventClick(reservation, event.currentTarget);
                      }}
                    >
                      <span className={styles.eventRoom}>{roomLabel(reservation.roomId)}</span>
                      {!short && (
                        <strong className={styles.eventTitle}>
                          {reservation.title || "예약"}
                        </strong>
                      )}
                      <span className={styles.eventTime}>
                        {short || narrow
                          ? reservation.start
                          : `${reservation.start}–${reservation.end}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <button
        type="button"
        className={styles.floatingCreate}
        aria-label="가장 가까운 빈 시간에 예약 만들기"
        onClick={openNearestAvailable}
      >
        <Icon name="plus-lg" />
      </button>

      <dialog
        ref={dialogRef}
        className={styles.pickerDialog}
        aria-labelledby="mobile-picker-title"
        onCancel={(event) => {
          event.preventDefault();
          closePicker();
        }}
        onClose={() => setPicker(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePicker();
        }}
      >
        {picker && (
          <div className={styles.pickerSheet}>
            <div className={styles.pickerHeading}>
              <div>
                <span>예약 만들기</span>
                <strong id="mobile-picker-title">
                  {picker.date.getMonth() + 1}월 {picker.date.getDate()}일 {WEEKDAYS_KO[picker.date.getDay()]}요일
                </strong>
              </div>
              <button type="button" onClick={closePicker}>
                닫기
              </button>
            </div>
            <MobileAgenda
              key={`${toDateKey(picker.date)}-${picker.roomId}-${picker.startMin}`}
              pickerOnly
              initialSlot={{ roomId: picker.roomId, startMin: picker.startMin }}
              date={picker.date}
              reservations={activeReservations}
              colors={colors}
              onCreate={(date, startMin, endMin, roomId) => {
                closePicker();
                onCreate(date, startMin, endMin, roomId);
              }}
              onEventClick={onEventClick}
            />
          </div>
        )}
      </dialog>
    </section>
  );
}
