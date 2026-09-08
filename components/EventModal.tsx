"use client";

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { ROOMS, getRoom } from "@/lib/rooms";
import { NewReservation } from "@/lib/types";
import { minutesToTime } from "@/lib/date";
import { START_HOUR, END_HOUR } from "./WeekView";
import { MAX_TITLE, MAX_ORGANIZER, MAX_NOTE } from "@/lib/validate";
import styles from "./EventModal.module.css";

export type ModalPrefill = {
  date: string;
  start: string;
  end: string;
  roomId: string;
  id?: string;
  title?: string;
  organizer?: string;
  note?: string;
};

type Props = {
  prefill: ModalPrefill;
  defaultName: string;
  onClose: () => void;
  onCreated: (reservation: NewReservation) => void;
  onNameChange: (name: string) => void;
};

const STEP = 30;
const timeOptions = (() => {
  const opts: string[] = [];
  for (let m = START_HOUR * 60; m <= END_HOUR * 60; m += STEP) opts.push(minutesToTime(m));
  return opts;
})();

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function labelForTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hh}:${String(m).padStart(2, "0")}`;
}

export default function EventModal({ prefill, defaultName, onClose, onCreated, onNameChange }: Props) {
  const isEdit = Boolean(prefill.id);
  const titleId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(prefill.title ?? "");
  const [organizer, setOrganizer] = useState(prefill.organizer ?? defaultName);
  const [roomId, setRoomId] = useState(prefill.roomId);
  const [date, setDate] = useState(prefill.date);
  const [start, setStart] = useState(prefill.start);
  const [end, setEnd] = useState(prefill.end);
  const [note, setNote] = useState(prefill.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) setOrganizer(defaultName);
  }, [defaultName, isEdit]);

  useEffect(() => {
    if (timeOptions.indexOf(end) <= timeOptions.indexOf(start)) {
      const idx = Math.min(timeOptions.indexOf(start) + 1, timeOptions.length - 1);
      setEnd(timeOptions[idx]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const room = getRoom(roomId);
  const endOptions = useMemo(
    () => timeOptions.filter((t) => timeOptions.indexOf(t) > timeOptions.indexOf(start)),
    [start]
  );

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => initialFocusRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!organizer.trim()) {
      setError("예약자 이름을 입력하세요.");
      return;
    }
    setSubmitting(true);
    const payload: NewReservation = {
      roomId,
      title: title.trim(),
      organizer: organizer.trim(),
      date,
      start,
      end,
      note: note.trim() || undefined,
    };
    try {
      const res = await fetch(isEdit ? `/api/reservations/${prefill.id}` : "/api/reservations", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "예약에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      if (!isEdit) onNameChange(organizer.trim());
      onCreated(payload);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        style={{ "--room-accent": room?.border ?? "#1769e0" } as React.CSSProperties}
      >
        <div className={styles.accent} />
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.headingRow}>
            <div>
              <p className={styles.eyebrow}>{isEdit ? "예약 정보 변경" : "새 일정"}</p>
              <h2 id={titleId} className={styles.heading}>{isEdit ? "예약 수정" : "회의실 예약"}</h2>
            </div>
            <button type="button" onClick={onClose} className={styles.closeButton}>닫기</button>
          </div>

          <div className={styles.fields}>
            <Field label="제목">
              <input ref={initialFocusRef} value={title} maxLength={MAX_TITLE}
                onChange={(event) => setTitle(event.target.value)} placeholder="예: 주간 팀 미팅"
                className={styles.input} />
            </Field>

            <div className={styles.twoColumns}>
              <Field label="예약자 이름">
                <input value={organizer} maxLength={MAX_ORGANIZER}
                  onChange={(event) => setOrganizer(event.target.value)} placeholder="이름 입력"
                  className={styles.input} required />
              </Field>
              <Field label="회의실">
                <select value={roomId} onChange={(event) => setRoomId(event.target.value)} className={styles.input}>
                  {ROOMS.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="날짜">
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={styles.input} />
            </Field>

            <div className={styles.twoColumns}>
              <Field label="시작 시간">
                <select value={start} onChange={(event) => setStart(event.target.value)} className={styles.input}>
                  {timeOptions.slice(0, -1).map((time) => (
                    <option key={time} value={time}>{labelForTime(time)}</option>
                  ))}
                </select>
              </Field>
              <Field label="종료 시간">
                <select value={end} onChange={(event) => setEnd(event.target.value)} className={styles.input}>
                  {endOptions.map((time) => (
                    <option key={time} value={time}>{labelForTime(time)}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className={styles.timeSummary} aria-live="polite">
              <span>{date}</span>
              <strong>{labelForTime(start)} – {labelForTime(end)}</strong>
              <span>{room?.name}</span>
            </div>

            <Field label="메모 (선택)">
              <textarea value={note} maxLength={MAX_NOTE} onChange={(event) => setNote(event.target.value)}
                rows={3} placeholder="안건, 참석자 등" className={`${styles.input} ${styles.textarea}`} />
            </Field>

            {error && <div id={errorId} role="alert" className={styles.error}>{error}</div>}
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={onClose} className={styles.secondaryButton}>취소</button>
            <button type="submit" disabled={submitting} className={styles.primaryButton}>
              {submitting ? "저장 중…" : isEdit ? "변경 저장" : "예약하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span className={styles.label}>{label}</span>{children}</label>;
}
