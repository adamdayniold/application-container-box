import { getSummary } from "@/app/lib/contacts";
import { withMetrics } from "@/app/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withMetrics("GET", "/api/contacts/summary", async () => {
  return Response.json(await getSummary());
});
