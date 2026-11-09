import {getDb} from "@/app/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
