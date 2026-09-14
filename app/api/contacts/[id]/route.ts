import { getContact, isContactInput, removeContact, updateContact } from "@/app/lib/contacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/contacts/[id]">) {
  const { id } = await context.params;
  const contact = await getContact(id);
  return contact ? Response.json(contact) : Response.json({ error: "Contact not found." }, { status: 404 });
}

export async function PUT(request: Request, context: RouteContext<"/api/contacts/[id]">) {
  const { id } = await context.params;
  const payload: unknown = await request.json().catch(() => null);
  if (!isContactInput(payload)) {
    return Response.json({ error: "Name, email, company, role, and a valid status are required." }, { status: 400 });
  }
  const contact = await updateContact(id, payload);
  return contact ? Response.json(contact) : Response.json({ error: "Contact not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/contacts/[id]">) {
  const { id } = await context.params;
  return await removeContact(id) ? new Response(null, { status: 204 }) : Response.json({ error: "Contact not found." }, { status: 404 });
}
