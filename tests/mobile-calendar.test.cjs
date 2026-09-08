const assert = require("node:assert/strict");
const test = require("node:test");
const { loadSource } = require("./helpers/load-source.cjs");

const mobileCalendar = loadSource("lib/mobile-calendar.ts");
const {
  layoutMobileReservations,
  mobileSlotFromOffset,
  MOBILE_DAY_START,
  MOBILE_DAY_END,
  MOBILE_HOUR_HEIGHT,
  MOBILE_SNAP_MINUTES,
} = mobileCalendar;

assert.equal(typeof layoutMobileReservations, "function", "layoutMobileReservations must be exported");
assert.equal(typeof mobileSlotFromOffset, "function", "mobileSlotFromOffset must be exported");
assert.equal(MOBILE_DAY_START, 7 * 60);
assert.equal(MOBILE_DAY_END, 22 * 60);
assert.equal(MOBILE_HOUR_HEIGHT, 56);
assert.equal(MOBILE_SNAP_MINUTES, 30);

const HALF_HOUR_HEIGHT = MOBILE_HOUR_HEIGHT / 2;

const DATE = "2026-09-08";

function reservation(id, roomId, start, end, overrides = {}) {
  return {
    id,
    roomId,
    title: `예약 ${id}`,
    organizer: "테스터",
    date: DATE,
    start,
    end,
    createdAt: `2026-09-01T00:00:${String(id.length).padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

function geometry(record) {
  return {
    top: record.top,
    height: record.height,
    column: record.column,
    columnCount: record.columnCount,
  };
}

test("simultaneous reservations in different rooms share the time row in two columns", () => {
  const positioned = layoutMobileReservations([
    reservation("main", "main", "09:00", "10:00"),
    reservation("small", "small", "09:00", "10:00"),
  ]);

  assert.equal(positioned.length, 2);
  assert.equal(positioned[0].top, positioned[1].top);
  assert.deepEqual(Array.from(positioned, (item) => item.column).sort(), [0, 1]);
  assert.deepEqual(Array.from(positioned, (item) => item.columnCount), [2, 2]);
});

test("a 30-minute later partial overlap uses a half-hour offset and keeps both end positions", () => {
  const positioned = layoutMobileReservations([
    reservation("early", "main", "09:00", "10:30"),
    reservation("late", "small", "09:30", "11:00"),
  ]);
  const byId = Object.fromEntries(Array.from(positioned, (item) => [item.id, item]));

  assert.equal(byId.late.top - byId.early.top, HALF_HOUR_HEIGHT);
  assert.equal(byId.early.top + byId.early.height, 3.5 * MOBILE_HOUR_HEIGHT);
  assert.equal(byId.late.top + byId.late.height, 4 * MOBILE_HOUR_HEIGHT);
  assert.deepEqual([byId.early.columnCount, byId.late.columnCount], [2, 2]);
});

test("adjacent reservations reuse the full-width column", () => {
  const positioned = layoutMobileReservations([
    reservation("first", "main", "09:00", "10:00"),
    reservation("second", "small", "10:00", "11:00"),
  ]);

  assert.deepEqual(Array.from(positioned, geometry), [
    { top: 2 * MOBILE_HOUR_HEIGHT, height: MOBILE_HOUR_HEIGHT, column: 0, columnCount: 1 },
    { top: 3 * MOBILE_HOUR_HEIGHT, height: MOBILE_HOUR_HEIGHT, column: 0, columnCount: 1 },
  ]);
});

test("three nested legacy overlaps are all preserved in distinct columns", () => {
  const positioned = layoutMobileReservations([
    reservation("outer", "main", "09:00", "12:00"),
    reservation("middle", "main", "09:30", "11:30"),
    reservation("inner", "main", "10:00", "11:00"),
  ]);

  assert.equal(positioned.length, 3);
  assert.deepEqual(Array.from(positioned, (item) => item.id), ["outer", "middle", "inner"]);
  assert.deepEqual(Array.from(positioned, (item) => item.column), [0, 1, 2]);
  assert.deepEqual(Array.from(positioned, (item) => item.columnCount), [3, 3, 3]);
});

test("deleted reservations are excluded from the mobile calendar", () => {
  const positioned = layoutMobileReservations([
    reservation("active", "main", "09:00", "10:00"),
    reservation("deleted", "small", "09:00", "10:00", {
      deletedAt: "2026-09-07T00:00:00.000Z",
    }),
  ]);

  assert.deepEqual(Array.from(positioned, (item) => item.id), ["active"]);
  assert.equal(positioned[0].columnCount, 1);
});

test("reservations are clipped to 07:00–22:00 and fully out-of-hours records are hidden", () => {
  const positioned = layoutMobileReservations([
    reservation("before", "main", "06:00", "07:00"),
    reservation("opening", "main", "06:30", "07:30"),
    reservation("closing", "small", "21:30", "22:30"),
    reservation("after", "small", "22:00", "23:00"),
  ]);
  const byId = Object.fromEntries(Array.from(positioned, (item) => [item.id, item]));

  assert.deepEqual(Object.keys(byId).sort(), ["closing", "opening"]);
  assert.deepEqual(geometry(byId.opening), {
    top: 0,
    height: HALF_HOUR_HEIGHT,
    column: 0,
    columnCount: 1,
  });
  assert.deepEqual(geometry(byId.closing), {
    top: 14.5 * MOBILE_HOUR_HEIGHT,
    height: HALF_HOUR_HEIGHT,
    column: 0,
    columnCount: 1,
  });
});

test("layout leaves the source array and reservation objects unchanged", () => {
  const reservations = [
    reservation("one", "main", "09:00", "10:00"),
    reservation("two", "small", "09:30", "11:00"),
    reservation("past-deleted", "main", "12:00", "13:00", {
      date: "2025-01-02",
      deletedAt: "2025-01-03T00:00:00.000Z",
    }),
  ];
  const before = JSON.stringify(reservations);

  const positioned = layoutMobileReservations(reservations);

  assert.equal(JSON.stringify(reservations), before);
  assert.notEqual(positioned, reservations);
  assert.notEqual(positioned[0], reservations[0]);
});

test("pointer offsets snap down to 30-minute slots and clamp to the booking day", () => {
  const cases = [
    [0, 7 * 60],
    [HALF_HOUR_HEIGHT - 0.01, 7 * 60],
    [HALF_HOUR_HEIGHT, 7 * 60 + 30],
    [MOBILE_HOUR_HEIGHT, 8 * 60],
    [2 * MOBILE_HOUR_HEIGHT, 9 * 60],
    [-20, 7 * 60],
    [Number.MAX_SAFE_INTEGER, 21 * 60 + 30],
  ];

  for (const [offset, expected] of cases) {
    assert.equal(mobileSlotFromOffset(offset), expected, `offset ${offset}`);
  }
});
