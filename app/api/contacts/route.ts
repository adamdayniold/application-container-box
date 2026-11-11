import { createContact, isContactInput, listContacts } from "@/app/lib/contacts";
import { withMetrics } from "@/app/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withMetrics("GET", "/api/contacts", async () => {
  return Response.json(await listContacts());
});

export const POST = withMetrics("POST", "/api/contacts", async (request: Request) => {
  const payload: unknown = await request.json().catch(() => null);
  if (!isContactInput(payload)) {
    return Response.json({ error: "Name, email, company, role, and a valid status are required." }, { status: 400 });
  }
  return Response.json(await createContact(payload), { status: 201 });
});
