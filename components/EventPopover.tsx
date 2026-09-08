"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { NameColor, Reservation } from "@/lib/types";
import { getRoom } from "@/lib/rooms";
import { fromDateKey, WEEKDAYS_KO } from "@/lib/date";
import styles from "./EventPopover.module.css";

type Props = {
  reservation: Reservation;
  color?: NameColor;
  anchor: DOMRect;
  onClose: () => void;
  onDeleted: () => void;
  onEdit: (r: Reservation) => void;
};

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function formatDate(key: string): string {
  const d = fromDateKey(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS_KO[d.getDay()]})`;
}

export default function EventPopover({ reservation, color, anchor, onClose, onDeleted, onEdit }: Props) {
  const room = getRoom(reservation.roomId);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const [position, setPosition] = useState({ left: 12, top: 12 });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const updatePosition = () => {
      const width = dialog.offsetWidth;
      const height = dialog.offsetHeight;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const preferredLeft = anchor.right + 10;
      const left = preferredLeft + width <= viewportWidth - 12
        ? preferredLeft
        : anchor.left - width - 10;
      const next = {
        left: Math.max(12, Math.min(left, viewportWidth - width - 12)),
        top: Math.max(12, Math.min(anchor.top, viewportHeight - height - 12)),
      };
      setPosition(previous => previous.left === next.left && previous.top === next.top ? previous : next);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(dialog);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchor]);

  const del = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "삭제에 실패했습니다.");
        setDeleting(false);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setDeleting(false);
    }
  };

  return (
    <>
      <div className={styles.backdrop} onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={styles.dialog}
        style={{
          left: position.left,
          top: position.top,
          "--event-accent": color?.border ?? room?.border ?? "#5f6368",
        } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.headingRow}>
          <span className={styles.colorBar} aria-hidden="true" />
          <div className={styles.headingText}>
            <div className={styles.titleLine}>
              <h3 id={titleId} className={styles.heading}>{reservation.title}</h3>
            </div>
            <p className={styles.schedule}>
              {formatDate(reservation.date)} · {reservation.start}–{reservation.end}
            </p>
          </div>
          <button ref={initialFocusRef} type="button" onClick={onClose} className={styles.closeButton}>닫기</button>
        </div>

        <dl className={styles.details}>
          <Detail label="회의실">{room?.name ?? "삭제된 회의실"}</Detail>
          <Detail label="예약자"><strong>{reservation.organizer}</strong></Detail>
          {reservation.note && <Detail label="메모"><span className={styles.note}>{reservation.note}</span></Detail>}
        </dl>

        {error && <div role="alert" className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          {confirm ? (
            <>
              <span className={styles.confirmText} aria-live="polite">이 예약을 삭제할까요?</span>
              <button type="button" onClick={() => setConfirm(false)} className={styles.secondaryButton}>돌아가기</button>
              <button type="button" onClick={del} disabled={deleting} className={styles.dangerButton}>
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onEdit(reservation)} className={styles.editButton}>수정</button>
              <button type="button" onClick={() => setConfirm(true)} className={styles.cancelButton}>예약 취소</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={styles.detailRow}><dt>{label}</dt><dd>{children}</dd></div>;
}
