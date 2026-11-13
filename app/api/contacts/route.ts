import { createContact, isContactInput, listContacts, parseListQuery } from "@/app/lib/contacts";
import { withMetrics } from "@/app/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withMetrics("GET", "/api/contacts", async (request: Request) => {
  const query = parseListQuery(new URL(request.url).searchParams);
  return Response.json(await listContacts(query));
});

export const POST = withMetrics("POST", "/api/contacts", async (request: Request) => {
  const payload: unknown = await request.json().catch(() => null);
  if (!isContactInput(payload)) {
    return Response.json({ error: "Name, email, company, role, and a valid status are required." }, { status: 400 });
  }
  const contact = await createContact(payload);
  if (!contact) {
    return Response.json({ error: "A contact with this email already exists." }, { status: 409 });
  }
  return Response.json(contact, { status: 201 });
});
