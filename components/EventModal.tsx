"use client";

import { useEffect, useMemo, useState } from "react";
import { ROOMS, getRoom } from "@/lib/rooms";
import { NewReservation } from "@/lib/types";
import { minutesToTime } from "@/lib/date";
import { START_HOUR, END_HOUR } from "./WeekView";
import { MAX_TITLE, MAX_ORGANIZER, MAX_NOTE } from "@/lib/validate";

export type ModalPrefill = {
  date: string;
  start: string;
  end: string;
  roomId: string;
  // 수정 모드: 기존 예약 정보
  id?: string;
  title?: string;
  organizer?: string;
  note?: string;
};

type Props = {
  prefill: ModalPrefill;
  defaultName: string;
  onClose: () => void;
  onCreated: () => void;
  onNameChange: (name: string) => void;
};

const STEP = 30;
const timeOptions = (() => {
  const opts: string[] = [];
  for (let m = START_HOUR * 60; m <= END_HOUR * 60; m += STEP) {
    opts.push(minutesToTime(m));
  }
  return opts;
})();

function labelForTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hh}:${String(m).padStart(2, "0")}`;
}

export default function EventModal({
  prefill,
  defaultName,
  onClose,
  onCreated,
  onNameChange,
}: Props) {
  const isEdit = Boolean(prefill.id);
  const [title, setTitle] = useState(prefill.title ?? "");
  const [organizer, setOrganizer] = useState(
    prefill.organizer ?? defaultName
  );
  const [roomId, setRoomId] = useState(prefill.roomId);
  const [date, setDate] = useState(prefill.date);
  const [start, setStart] = useState(prefill.start);
  const [end, setEnd] = useState(prefill.end);
  const [note, setNote] = useState(prefill.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 생성 모드에서만 사이드바 이름 변경을 반영 (수정 모드는 기존 예약자 유지)
    if (!isEdit) setOrganizer(defaultName);
  }, [defaultName, isEdit]);

  // 시작 시간이 종료 이상이면 종료를 자동 보정
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
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
      const res = await fetch(
        isEdit ? `/api/reservations/${prefill.id}` : "/api/reservations",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "예약에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      if (!isEdit) onNameChange(organizer.trim());
      onCreated();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="gc-overlay fixed inset-0 z-50 flex items-start justify-center bg-black/20 p-3 pt-[5vh] sm:p-4 sm:pt-[8vh]"
      onMouseDown={onClose}
    >
      <div
        className="gc-pop max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 상단 색상 바 */}
        <div
          className="h-1.5 w-full"
          style={{ background: room?.border ?? "#1a73e8" }}
        />
        <div className="px-4 pb-5 pt-4 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-[#3c4043]">
              {isEdit ? "예약 수정" : "회의실 예약"}
            </h2>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3.5">
            <Field label="제목">
              <input
                autoFocus
                value={title}
                maxLength={MAX_TITLE}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 주간 팀 미팅"
                className="w-full border-0 border-b-2 border-[#dadce0] px-0 py-1.5 text-base outline-none sm:text-[15px] focus:border-[#1a73e8]"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="예약자 이름">
                <input
                  value={organizer}
                  maxLength={MAX_ORGANIZER}
                  onChange={(e) => setOrganizer(e.target.value)}
                  placeholder="이름 입력"
                  className="w-full rounded-md border border-[#dadce0] px-2.5 py-2 text-base outline-none sm:text-sm focus:border-[#1a73e8]"
                />
              </Field>
              <Field label="회의실">
                <select
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full rounded-md border border-[#dadce0] bg-white px-2.5 py-2 text-base outline-none sm:text-sm focus:border-[#1a73e8]"
                >
                  {ROOMS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.capacity}인 · {r.location})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="날짜">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[#dadce0] px-2.5 py-2 text-base outline-none sm:text-sm focus:border-[#1a73e8]"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="시작">
                <select
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-md border border-[#dadce0] bg-white px-2.5 py-2 text-base outline-none sm:text-sm focus:border-[#1a73e8]"
                >
                  {timeOptions.slice(0, -1).map((t) => (
                    <option key={t} value={t}>
                      {labelForTime(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="종료">
                <select
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-md border border-[#dadce0] bg-white px-2.5 py-2 text-base outline-none sm:text-sm focus:border-[#1a73e8]"
                >
                  {endOptions.map((t) => (
                    <option key={t} value={t}>
                      {labelForTime(t)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="메모 (선택)">
              <textarea
                value={note}
                maxLength={MAX_NOTE}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="안건, 참석자 등"
                className="w-full resize-none rounded-md border border-[#dadce0] px-2.5 py-2 text-base outline-none sm:text-sm focus:border-[#1a73e8]"
              />
            </Field>

            {error && (
              <div className="rounded-md bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">
                {error}
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-[#1a73e8] hover:bg-[#f1f3f4]"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1765cc] disabled:opacity-60"
            >
              {submitting ? "저장 중…" : isEdit ? "저장" : "예약하기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5f6368]">
        {label}
      </span>
      {children}
    </label>
  );
}
