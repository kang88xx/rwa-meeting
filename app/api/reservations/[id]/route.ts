import { NextRequest, NextResponse } from "next/server";
import {
  deleteReservation,
  ensureColorsFor,
  updateReservation,
} from "@/lib/store";
import { validateReservationBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const result = await updateReservation(id, parsed.value);
  if (!result.ok) {
    const status = "notFound" in result && result.notFound ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  // 수정으로 예약자 이름이 바뀐 경우에도 색상 보장
  await ensureColorsFor([result.item.organizer]);

  return NextResponse.json({ reservation: result.item });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deleteReservation(id);
  if (!ok) {
    return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
