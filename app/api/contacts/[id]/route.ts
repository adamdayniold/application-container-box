import { getContact, isContactInput, removeContact, updateContact } from "@/app/lib/contacts";
import { withMetrics } from "@/app/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withMetrics("GET", "/api/contacts/[id]", async (_request: Request, context: RouteContext<"/api/contacts/[id]">) => {
  const { id } = await context.params;
  const contact = await getContact(id);
  return contact ? Response.json(contact) : Response.json({ error: "Contact not found." }, { status: 404 });
});

export const PUT = withMetrics("PUT", "/api/contacts/[id]", async (request: Request, context: RouteContext<"/api/contacts/[id]">) => {
  const { id } = await context.params;
  const payload: unknown = await request.json().catch(() => null);
  if (!isContactInput(payload)) {
    return Response.json({ error: "Name, email, company, role, and a valid status are required." }, { status: 400 });
  }
  const contact = await updateContact(id, payload);
  return contact ? Response.json(contact) : Response.json({ error: "Contact not found." }, { status: 404 });
});

export const DELETE = withMetrics("DELETE", "/api/contacts/[id]", async (_request: Request, context: RouteContext<"/api/contacts/[id]">) => {
  const { id } = await context.params;
  return await removeContact(id) ? new Response(null, { status: 204 }) : Response.json({ error: "Contact not found." }, { status: 404 });
});
