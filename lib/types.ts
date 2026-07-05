export type Reservation = {
  id: string;
  roomId: string;
  title: string;
  organizer: string; // 예약자 이름 (계정 없이 기재)
  date: string; // YYYY-MM-DD (로컬 기준)
  start: string; // HH:mm
  end: string; // HH:mm
  note?: string;
  createdAt: string; // ISO
};

export type NewReservation = Omit<Reservation, "id" | "createdAt">;

// 예약자 이름별 고정 색상 (border: 진한 색, bg: 옅은 배경)
export type NameColor = {
  border: string;
  bg: string;
};

export type NameColorMap = Record<string, NameColor>;
