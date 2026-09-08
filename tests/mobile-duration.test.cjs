const assert = require("node:assert/strict");
const test = require("node:test");
const { loadSource } = require("./helpers/load-source.cjs");

const mobileAgenda = loadSource("components/MobileAgenda.tsx");
const { buildAgendaRows, getAvailableWindow, canSelectRange } = mobileAgenda;

assert.equal(typeof buildAgendaRows, "function", "buildAgendaRows must remain exported");
assert.equal(typeof getAvailableWindow, "function", "getAvailableWindow must be exported");
assert.equal(typeof canSelectRange, "function", "canSelectRange must be exported");

const DATE = "2026-09-08";

function reservation(id, roomId, start, end) {
  return {
    id,
    roomId,
    title: `예약 ${id}`,
    organizer: "테스터",
    date: DATE,
    start,
    end,
    createdAt: `2026-09-01T00:00:${String(id.length).padStart(2, "0")}.000Z`,
  };
}

function rowsFor(reservations = [], roomId = "main") {
  return buildAgendaRows(DATE, roomId, reservations);
}

test("selects a 2-hour range across adjacent 1-hour free rows", () => {
  const rows = rowsFor([reservation("limit", "main", "12:00", "13:00")]);
  assert.equal(canSelectRange(rows, 9 * 60, 11 * 60), true);
});

test("selects a 3-hour range across three adjacent free rows", () => {
  const rows = rowsFor([reservation("limit", "main", "12:00", "13:00")]);
  assert.equal(canSelectRange(rows, 8 * 60, 11 * 60), true);
});

test("selects a 2.5-hour range ending on a half-hour boundary", () => {
  const rows = rowsFor([reservation("limit", "main", "16:30", "17:00")]);
  assert.equal(canSelectRange(rows, 14 * 60, 16 * 60 + 30), true);
});

test("finds a continuous window when selection starts at 16:30", () => {
  const rows = rowsFor([
    reservation("before", "main", "15:30", "16:30"),
    reservation("after", "main", "19:30", "20:00"),
  ]);
  const window = getAvailableWindow(rows, 16 * 60 + 30);
  assert.deepEqual(
    window && { startMin: window.startMin, endMin: window.endMin },
    { startMin: 16 * 60 + 30, endMin: 19 * 60 + 30 }
  );
  assert.equal(canSelectRange(rows, 16 * 60 + 30, 19 * 60 + 30), true);
});

test("rejects a range that crosses a reservation in the selected room", () => {
  const rows = rowsFor([reservation("blocked", "main", "10:00", "11:00")]);
  assert.equal(canSelectRange(rows, 9 * 60, 12 * 60), false);
});

test("a reservation in the other room does not block the selected room", () => {
  const rows = rowsFor([reservation("other", "small", "10:00", "11:00")]);
  assert.equal(canSelectRange(rows, 9 * 60, 12 * 60), true);
});

test("allows a range that starts exactly when a preceding reservation ends", () => {
  const rows = rowsFor([
    reservation("before", "main", "10:00", "11:00"),
    reservation("after", "main", "13:00", "14:00"),
  ]);
  assert.equal(canSelectRange(rows, 11 * 60, 13 * 60), true);
  const window = getAvailableWindow(rows, 11 * 60);
  assert.deepEqual(
    window && { startMin: window.startMin, endMin: window.endMin },
    { startMin: 11 * 60, endMin: 13 * 60 }
  );
});

test("accepts an end at 22:00 and rejects starts or ends outside the booking day", () => {
  const rows = rowsFor();
  assert.equal(canSelectRange(rows, 20 * 60, 22 * 60), true);
  assert.equal(canSelectRange(rows, 20 * 60, 22 * 60 + 30), false);
  assert.equal(canSelectRange(rows, 6 * 60 + 30, 7 * 60 + 30), false);
  assert.equal(getAvailableWindow(rows, 22 * 60), null);
});

test("rejects 15-minute boundaries, zero duration, and reversed ranges", () => {
  const rows = rowsFor();
  assert.equal(canSelectRange(rows, 9 * 60 + 15, 10 * 60), false);
  assert.equal(canSelectRange(rows, 9 * 60, 10 * 60 + 15), false);
  assert.equal(canSelectRange(rows, 9 * 60, 9 * 60), false);
  assert.equal(canSelectRange(rows, 10 * 60, 9 * 60), false);
  assert.equal(getAvailableWindow(rows, 9 * 60 + 15), null);
});

test("range helpers leave their agenda-row input unchanged", () => {
  const rows = rowsFor([reservation("blocked", "main", "10:00", "11:00")]);
  const before = JSON.stringify(rows);
  getAvailableWindow(rows, 8 * 60);
  canSelectRange(rows, 8 * 60, 10 * 60);
  assert.equal(JSON.stringify(rows), before);
});

test("new reservation data immediately reduces the available window", () => {
  const originalRows = rowsFor();
  const changedRows = rowsFor([reservation("new", "main", "10:00", "11:00")]);
  const originalWindow = getAvailableWindow(originalRows, 9 * 60);
  const changedWindow = getAvailableWindow(changedRows, 9 * 60);
  assert.deepEqual(
    originalWindow && { startMin: originalWindow.startMin, endMin: originalWindow.endMin },
    { startMin: 7 * 60, endMin: 22 * 60 }
  );
  assert.deepEqual(
    changedWindow && { startMin: changedWindow.startMin, endMin: changedWindow.endMin },
    { startMin: 7 * 60, endMin: 10 * 60 }
  );
});

test("a reservation on a different date does not block the selected day", () => {
  const future = { ...reservation("future", "main", "09:00", "12:00"), date: "2026-09-09" };
  assert.equal(canSelectRange(rowsFor([future]), 9 * 60, 12 * 60), true);
});

test("building availability preserves historical records and original ordering", () => {
  const reservations = [
    reservation("later", "main", "14:00", "15:00"),
    { ...reservation("past", "main", "09:00", "10:00"), date: "2025-01-02" },
    reservation("earlier", "main", "09:00", "10:00"),
  ];
  const before = JSON.stringify(reservations);
  rowsFor(reservations);
  assert.equal(JSON.stringify(reservations), before);
});
