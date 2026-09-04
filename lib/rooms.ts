export type Room = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  mark: string; // 예약 블록 제목 앞에 붙는 회의실 구분 기호 (大 / 小, 글자색을 따라감)
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
    mark: "大",
    color: "#e8f0fe",
    border: "#1a73e8",
    dot: "#1a73e8",
  },
  {
    id: "small",
    name: "2F 소회의실",
    capacity: 4,
    location: "2층",
    mark: "小",
    color: "#e6f4ea",
    border: "#1e8e3e",
    dot: "#1e8e3e",
  },
];

export const ROOM_MAP: Record<string, Room> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r])
);

export function getRoom(id: string): Room | undefined {
  return ROOM_MAP[id];
}
