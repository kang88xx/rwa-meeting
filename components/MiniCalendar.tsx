"use client";

import { useState } from "react";
import {
  WEEKDAYS_KO,
  addDays,
  isSameDay,
  isToday,
  startOfWeek,
  toDateKey,
} from "@/lib/date";

type Props = {
  selected: Date;
  onSelect: (d: Date) => void;
};

export default function MiniCalendar({ selected, onSelect }: Props) {
  const [view, setView] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );

  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekOfSelected = startOfWeek(selected);

  return (
    <div className="select-none">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-sm font-medium text-[#3c4043]">
          {view.getFullYear()}년 {view.getMonth() + 1}월
        </span>
        <div className="flex gap-1">
          <button
            aria-label="이전 달"
            onClick={() =>
              setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))
            }
            className="h-7 w-7 rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
          >
            ‹
          </button>
          <button
            aria-label="다음 달"
            onClick={() =>
              setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))
            }
            className="h-7 w-7 rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS_KO.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[10px] font-medium ${
              i === 0 ? "text-[#d93025]" : "text-[#70757a]"
            }`}
          >
            {w}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = d.getMonth() === view.getMonth();
          const today = isToday(d);
          const inSelWeek = isSameDay(startOfWeek(d), weekOfSelected);
          const isSel = isSameDay(d, selected);
          return (
            <button
              key={toDateKey(d)}
              onClick={() => onSelect(new Date(d))}
              className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors
                ${inSelWeek ? "bg-[#e8f0fe]" : ""}
                ${isSel || today ? "" : "hover:bg-[#f1f3f4]"}
                ${today ? "bg-[#1a73e8] font-medium text-white hover:bg-[#1a73e8]" : ""}
                ${!today && isSel ? "font-medium text-[#1a73e8]" : ""}
                ${!inMonth ? "text-[#bdc1c6]" : today ? "text-white" : "text-[#3c4043]"}
              `}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
