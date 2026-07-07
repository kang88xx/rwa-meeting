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
  // 소프트 삭제: 값이 있으면 삭제된 예약 (캘린더에서 숨기고 히스토리에는 남김)
  deletedAt?: string; // ISO
};

export type NewReservation = Omit<Reservation, "id" | "createdAt">;

// 예약자 이름별 고정 색상 (border: 진한 색, bg: 옅은 배경)
export type NameColor = {
  border: string;
  bg: string;
};

export type NameColorMap = Record<string, NameColor>;
