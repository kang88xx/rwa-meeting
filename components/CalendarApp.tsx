"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NameColorMap, Reservation } from "@/lib/types";
import { ROOMS, getRoom } from "@/lib/rooms";
import { addDays, isToday, minutesToTime, toDateKey, weekDays } from "@/lib/date";
import MiniCalendar from "./MiniCalendar";
import WeekView from "./WeekView";
import MobileCalendar from "./MobileCalendar";
import EventModal, { ModalPrefill } from "./EventModal";
import EventPopover from "./EventPopover";
import styles from "./CalendarApp.module.css";

const NAME_KEY = "mr:name";

function Icon({ name }: { name: string }) {
  return <img className={styles.icon} src={`/icons/${name}.svg`} width="20" height="20" alt="" aria-hidden="true" />;
}

function rangeTitle(days: Date[]) {
  const a = days[0], b = days[6];
  return a.getMonth() === b.getMonth()
    ? `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}일 – ${b.getDate()}일`
    : `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}일 – ${b.getMonth() + 1}월 ${b.getDate()}일`;
}

export default function CalendarApp() {
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [colors, setColors] = useState<NameColorMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [visible, setVisible] = useState(() => new Set(ROOMS.map(r => r.id)));
  const [name, setName] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [modal, setModal] = useState<ModalPrefill | null>(null);
  const [selection, setSelection] = useState<{ key: string; startMin: number; endMin: number } | null>(null);
  const [popover, setPopover] = useState<{ res: Reservation; rect: DOMRect } | null>(null);
  const [notice, setNotice] = useState("");

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reservations", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReservations((data.reservations ?? []).filter((r: Reservation) => !r.deletedAt));
      setColors(data.colors ?? {});
      setLoadError(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 959px)");
    const update = () => setIsMobile(media.matches);
    update(); media.addEventListener("change", update);
    try { const saved = localStorage.getItem(NAME_KEY); if (saved) setName(saved); } catch { /* Name persistence is optional. */ }
    load();
    return () => media.removeEventListener("change", update);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const saveName = (next: string) => {
    setName(next);
    try { localStorage.setItem(NAME_KEY, next); } catch { /* The booking remains usable. */ }
  };
  const visibleReservations = useMemo(() => reservations.filter(r => visible.has(r.roomId)), [reservations, visible]);
  const weekNames = useMemo(() => {
    const keys = new Set(days.map(toDateKey));
    return [...new Set(visibleReservations.filter(r => keys.has(r.date)).map(r => r.organizer))].sort((a,b) => a.localeCompare(b,"ko"));
  }, [days, visibleReservations]);

  const closeModal = useCallback(() => { setModal(null); setSelection(null); }, []);
  const closePopover = useCallback(() => setPopover(null), []);
  const openCreate = (date: Date, startMin: number, endMin?: number, roomId?: string) => {
    setPopover(null);
    const firstVisible = ROOMS.find(r => visible.has(r.id)) ?? ROOMS[0];
    const end = Math.min(endMin ?? startMin + 60, 22 * 60);
    setSelection(endMin !== undefined ? { key: toDateKey(date), startMin, endMin: end } : null);
    setModal({ date: toDateKey(date), start: minutesToTime(startMin), end: minutesToTime(end), roomId: roomId ?? firstVisible.id });
  };
  const openCreateDefault = () => {
    const now = new Date();
    const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
    const start = isToday(anchor) ? Math.min(Math.max(rounded, 7 * 60), 21 * 60 + 30) : 9 * 60;
    openCreate(anchor, start);
  };
  const eventClick = (res: Reservation, el: HTMLElement) => setPopover({ res, rect: el.getBoundingClientRect() });

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <a href="/" className={styles.brand} aria-label="Realworldsasset 회의실 예약 홈">
          <img className={styles.logo} src="/company-logo.svg" width="918" height="161" alt="Realworldsasset" />
          <span className={styles.brandDivider} aria-hidden="true" />
          <h1>회의실 예약</h1>
        </a>
        <a href="/history" className={styles.historyLink}><Icon name="calendar3" />예약 내역</a>
      </header>
      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="날짜와 회의실 필터">
          <button className={styles.createButton} onClick={openCreateDefault}><Icon name="plus-lg" />예약 만들기</button>
          <MiniCalendar selected={anchor} onSelect={setAnchor} />
          <section className={styles.roomSection}>
            <h2>회의실</h2>
            {ROOMS.map(room => <label className={styles.roomFilter} key={room.id}>
              <input type="checkbox" checked={visible.has(room.id)} style={{accentColor: room.dot}} onChange={() => setVisible(prev => {const next=new Set(prev); if(next.has(room.id))next.delete(room.id);else next.add(room.id);return next;})} />
              <span>{room.name}</span>
            </label>)}
          </section>
          {weekNames.length > 0 && <section className={styles.legendSection}>
            <h2>이번 주 예약자</h2>
            <ul>{weekNames.map(organizer => <li key={organizer}><span className={styles.colorDot} style={{background: colors[organizer]?.border ?? "#69717e"}} aria-hidden="true" /><span>{organizer}</span></li>)}</ul>
          </section>}
          <p className={styles.sidebarHint}>같은 시간의 두 회의실 예약은<br />나란히 표시됩니다.</p>
        </aside>
        <main className={styles.calendarPane}>
          {!isMobile && <div className={styles.toolbar}>
            <button className={styles.todayButton} onClick={() => setAnchor(new Date())}>오늘</button>
            <button className={styles.iconButton} aria-label="이전 주" onClick={() => setAnchor(addDays(anchor,-7))}><Icon name="chevron-left" /></button>
            <h2>{rangeTitle(days)}</h2>
            <button className={styles.iconButton} aria-label="다음 주" onClick={() => setAnchor(addDays(anchor,7))}><Icon name="chevron-right" /></button>
            <span className={styles.weekLabel}>주간 캘린더</span>
          </div>}
          {loadError && <div className={styles.error} role="alert">예약 정보를 불러오지 못했습니다. <button onClick={() => {setLoading(true);load();}}>다시 시도</button></div>}
          {loading ? <div className={styles.loading} role="status">일정을 불러오는 중입니다.</div> : isMobile ?
            <MobileCalendar anchor={anchor} onAnchorChange={setAnchor} reservations={reservations} colors={colors} onCreate={openCreate} onEventClick={eventClick} /> :
            <WeekView days={days} reservations={visibleReservations} colors={colors} onSlotClick={openCreate} onEventClick={eventClick} selection={selection} />}
        </main>
      </div>
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {modal && <EventModal prefill={modal} defaultName={name} onClose={closeModal} onNameChange={saveName} onCreated={saved => {
        setNotice(`${getRoom(saved.roomId)?.name ?? "회의실"} · ${saved.date} ${saved.start}–${saved.end} 예약이 저장됐습니다.`);
        closeModal(); load();
      }} />}
      {popover && <EventPopover reservation={popover.res} color={colors[popover.res.organizer]} anchor={popover.rect} onClose={closePopover} onDeleted={() => {closePopover();setNotice("예약을 취소했습니다.");load();}} onEdit={r => {
        closePopover();setSelection(null);setModal({id:r.id,date:r.date,start:r.start,end:r.end,roomId:r.roomId,title:r.title,organizer:r.organizer,note:r.note});
      }} />}
    </div>
  );
}
