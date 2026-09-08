import { timeToMinutes } from "./date";
import type { Reservation } from "./types";

export const MOBILE_DAY_START = 7 * 60;
export const MOBILE_DAY_END = 22 * 60;
export const MOBILE_HOUR_HEIGHT = 56;
export const MOBILE_SNAP_MINUTES = 30;

export type PositionedMobileReservation = Reservation & {
  top: number;
  height: number;
  column: number;
  columnCount: number;
};

/** Position reservations at their real time and split legacy overlaps into columns. */
export function layoutMobileReservations(
  reservations: Reservation[]
): PositionedMobileReservation[] {
  const visible = reservations
    .filter((reservation) => !reservation.deletedAt)
    .map((reservation) => ({
      reservation,
      startMin: Math.max(MOBILE_DAY_START, timeToMinutes(reservation.start)),
      endMin: Math.min(MOBILE_DAY_END, timeToMinutes(reservation.end)),
    }))
    .filter(({ startMin, endMin }) => startMin < endMin)
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
        a.endMin - b.endMin ||
        a.reservation.createdAt.localeCompare(b.reservation.createdAt)
    );

  const positioned: PositionedMobileReservation[] = [];
  let cluster: typeof visible = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const assigned = cluster.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.startMin);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.endMin);
      } else {
        columnEnds[column] = item.endMin;
      }
      return { ...item, column };
    });
    const columnCount = columnEnds.length;

    for (const item of assigned) {
      positioned.push({
        ...item.reservation,
        top:
          ((item.startMin - MOBILE_DAY_START) / 60) *
          MOBILE_HOUR_HEIGHT,
        height: Math.max(
          ((item.endMin - item.startMin) / 60) * MOBILE_HOUR_HEIGHT,
          24
        ),
        column: item.column,
        columnCount,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of visible) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();

  return positioned;
}

export function mobileSlotFromOffset(offsetY: number): number {
  const raw =
    MOBILE_DAY_START + (Math.max(0, offsetY) / MOBILE_HOUR_HEIGHT) * 60;
  const snapped =
    Math.floor(raw / MOBILE_SNAP_MINUTES) * MOBILE_SNAP_MINUTES;
  return Math.max(
    MOBILE_DAY_START,
    Math.min(snapped, MOBILE_DAY_END - MOBILE_SNAP_MINUTES)
  );
}
