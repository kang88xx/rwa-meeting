"use client";
import { useEffect, useState } from "react";
import { WEEKDAYS_KO, addDays, isSameDay, isToday, startOfWeek, toDateKey } from "@/lib/date";
import styles from "./MiniCalendar.module.css";
type Props = { selected: Date; onSelect: (date: Date) => void };
export default function MiniCalendar({selected,onSelect}:Props){
  const [view,setView]=useState(()=>new Date(selected.getFullYear(),selected.getMonth(),1));
  useEffect(()=>setView(new Date(selected.getFullYear(),selected.getMonth(),1)),[selected]);
  const gridStart=startOfWeek(new Date(view.getFullYear(),view.getMonth(),1));
  const days=Array.from({length:42},(_,i)=>addDays(gridStart,i));
  const selectedWeek=startOfWeek(selected);
  return <div className={styles.calendar}>
    <div className={styles.heading}><h2>{view.getFullYear()}년 {view.getMonth()+1}월</h2><div>
      <button aria-label="이전 달" onClick={()=>setView(new Date(view.getFullYear(),view.getMonth()-1,1))}><img src="/icons/chevron-left.svg" width="12" height="12" alt="" /></button>
      <button aria-label="다음 달" onClick={()=>setView(new Date(view.getFullYear(),view.getMonth()+1,1))}><img src="/icons/chevron-right.svg" width="12" height="12" alt="" /></button>
    </div></div>
    <div className={styles.grid}>{WEEKDAYS_KO.map((d,i)=><span className={`${styles.weekday} ${i===0?styles.sunday:""}`} key={d}>{d}</span>)}
    {days.map(d=><button key={toDateKey(d)} aria-label={`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`} aria-pressed={isSameDay(d,selected)} onClick={()=>onSelect(d)} className={[styles.day,d.getMonth()!==view.getMonth()?styles.other:"",isSameDay(startOfWeek(d),selectedWeek)?styles.selectedWeek:"",isSameDay(d,selected)?styles.selected:"",isToday(d)?styles.today:""].join(" ")}>{d.getDate()}</button>)}</div>
  </div>;
}
