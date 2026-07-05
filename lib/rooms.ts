export type Room = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  color: string; // 이벤트 배경
  border: string; // 이벤트 좌측 강조/테두리
  dot: string; // 사이드바 색상 점
};

// 회사 내부 회의실 목록 — 필요에 맞게 수정하세요.
export const ROOMS: Room[] = [
  {
    id: "main",
    name: "2F 대회의실",
    capacity: 20,
    location: "2층",
    color: "#e8f0fe",
    border: "#1a73e8",
    dot: "#1a73e8",
  },
];

export const ROOM_MAP: Record<string, Room> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r])
);

export function getRoom(id: string): Room | undefined {
  return ROOM_MAP[id];
}
