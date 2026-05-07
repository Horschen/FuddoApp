import { jwtVerify } from "jose";

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET saknas i miljövariablerna.");
  }
  return new TextEncoder().encode(secret);
}

export async function getAdminActorStringFromRequest(
  req: Request
): Promise<string> {
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => c.trim().split("=", 2) as [string, string])
        .filter(([k]) => k)
    );

    const token = cookies["admin_session"];
    if (!token) return "Okänd (ingen session)";

    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);

    const role = (payload.role as string) ?? "okänd roll";
    const name = (payload.name as string) ?? "Okänd";
    return `${role} (${name})`;
  } catch (err) {
    console.warn("Kunde inte läsa admin_session:", err);
    return "Okänd (fel vid läsning av session)";
  }
}