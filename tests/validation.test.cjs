const assert = require("node:assert/strict");
const test = require("node:test");
const { loadSource } = require("./helpers/load-source.cjs");
const { validateReservationBody } = loadSource("lib/validate.ts");

const body = {
  roomId: "main",
  title: "합성 테스트 예약",
  organizer: "테스터",
  date: "2026-09-08",
  start: "09:00",
  end: "10:00",
};

for (const roomId of ["__proto__", "constructor", "toString", "missing-room"]) {
  test(`rejects unregistered room ID ${roomId}`, () => {
    const result = validateReservationBody({ ...body, roomId });
    assert.equal(result.ok, false);
    assert.equal(result.error, "회의실을 선택하세요.");
  });
}

for (const roomId of ["main", "small"]) {
  test(`accepts registered room ${roomId}`, () => {
    const result = validateReservationBody({ ...body, roomId });
    assert.equal(result.ok, true);
    assert.equal(result.value.roomId, roomId);
  });
}

test("accepts the final 30-minute booking ending at 22:00", () => {
  const result = validateReservationBody({ ...body, start: "21:30", end: "22:00" });
  assert.equal(result.ok, true);
  assert.equal(result.value.end, "22:00");
});

for (const [start, end] of [
  ["06:30", "07:30"], ["21:30", "22:30"],
  ["09:15", "10:00"], ["09:00", "10:15"],
  ["09:00", "09:00"], ["10:00", "09:00"],
]) {
  test(`rejects invalid booking interval ${start}–${end}`, () => {
    assert.equal(validateReservationBody({ ...body, start, end }).ok, false);
  });
}
