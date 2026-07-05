"use client";

import { useEffect, useState } from "react";
import { NameColor, Reservation } from "@/lib/types";
import { getRoom } from "@/lib/rooms";
import { fromDateKey, WEEKDAYS_KO } from "@/lib/date";

type Props = {
  reservation: Reservation;
  // 예약자 이름 색상 (없으면 회의실 색상으로 폴백)
  color?: NameColor;
  anchor: DOMRect;
  onClose: () => void;
  onDeleted: () => void;
  onEdit: (r: Reservation) => void;
};

function formatDate(key: string): string {
  const d = fromDateKey(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS_KO[d.getDay()]})`;
}

export default function EventPopover({
  reservation,
  color,
  anchor,
  onClose,
  onDeleted,
  onEdit,
}: Props) {
  const room = getRoom(reservation.roomId);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 앵커 기준 위치 계산 (화면 밖으로 나가지 않도록 보정)
  const W = 320;
  let left = anchor.right + 8;
  if (left + W > window.innerWidth - 8) {
    left = Math.max(8, anchor.left - W - 8);
  }
  let top = anchor.top;
  const H = 220;
  if (top + H > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - H - 8);
  }

  const del = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}`, {
        method: "DELETE",
      });
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
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        className="gc-pop fixed z-50 w-80 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 pt-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-sm"
              style={{ background: color?.border ?? room?.border ?? "#5f6368" }}
            />
            <div>
              <h3 className="text-base font-medium leading-tight text-[#3c4043]">
                {reservation.title}
              </h3>
              <p className="mt-0.5 text-sm text-[#5f6368]">
                {formatDate(reservation.date)} · {reservation.start}~
                {reservation.end}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 px-4 py-3 text-sm text-[#3c4043]">
          <Row icon="📍">
            {room?.name}{" "}
            <span className="text-[#5f6368]">
              ({room?.capacity}인 · {room?.location})
            </span>
          </Row>
          <Row icon="👤">
            예약자 <span className="font-medium">{reservation.organizer}</span>
          </Row>
          {reservation.note && <Row icon="📝">{reservation.note}</Row>}
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-md bg-[#fce8e6] px-3 py-2 text-xs text-[#c5221f]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-[#f1f3f4] px-4 py-2.5">
          {confirm ? (
            <>
              <span className="mr-auto text-xs text-[#5f6368]">삭제할까요?</span>
              <button
                onClick={() => setConfirm(false)}
                className="rounded-md px-3 py-1.5 text-sm text-[#5f6368] hover:bg-[#f1f3f4]"
              >
                취소
              </button>
              <button
                onClick={del}
                disabled={deleting}
                className="rounded-md bg-[#d93025] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#c5221f] disabled:opacity-60"
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onEdit(reservation)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
              >
                수정
              </button>
              <button
                onClick={() => setConfirm(true)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[#d93025] hover:bg-[#fce8e6]"
              >
                예약 취소
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-4 shrink-0 text-center text-[13px] leading-5 opacity-70">
        {icon}
      </span>
      <span className="leading-5">{children}</span>
    </div>
  );
}
