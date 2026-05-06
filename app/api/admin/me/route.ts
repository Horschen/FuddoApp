import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET saknas i miljövariablerna.");
  }
  return new TextEncoder().encode(secret);
}

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => c.trim().split("=", 2) as [string, string])
        .filter(([k]) => k)
    );

    const token = cookies["admin_session"];
    if (!token) {
      return NextResponse.json(
        { authenticated: false },
        { status: 200 }
      );
    }

    const secret = getAdminSessionSecret();

    try {
      const { payload } = await jwtVerify(token, secret);

      return NextResponse.json(
        {
          authenticated: true,
          memberId: payload.sub,
          role: payload.role,
          name: payload.name,
        },
        { status: 200 }
      );
    } catch (verifyError) {
      console.warn("Ogiltig admin_session:", verifyError);
      return NextResponse.json(
        { authenticated: false },
        { status: 200 }
      );
    }
  } catch (err) {
    console.error("Oväntat fel i /api/admin/me:", err);
    return NextResponse.json(
      { error: "Internt serverfel." },
      { status: 500 }
    );
  }
}