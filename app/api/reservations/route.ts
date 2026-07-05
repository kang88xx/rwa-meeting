import { NextRequest, NextResponse } from "next/server";
import { createReservation, ensureColorsFor, readAll } from "@/lib/store";
import { validateReservationBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await readAll();
  // 등장하는 모든 예약자에게 색상이 배정되어 있도록 보장 (기존 데이터 포함)
  const colors = await ensureColorsFor(items.map((r) => r.organizer));
  // 최신순 정렬은 클라이언트에서 처리하므로 그대로 반환
  return NextResponse.json({ reservations: items, colors });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = validateReservationBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await createReservation(parsed.value);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // 새 예약자라면 이 시점에 색상이 배정됨 (이후 영구 고정)
  await ensureColorsFor([result.item.organizer]);

  return NextResponse.json({ reservation: result.item }, { status: 201 });
}
