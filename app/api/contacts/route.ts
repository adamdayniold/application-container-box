import { createContact, isContactInput, listContacts } from "@/app/lib/contacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await listContacts());
}

export async function POST(request: Request) {
  const payload: unknown = await request.json().catch(() => null);
  if (!isContactInput(payload)) {
    return Response.json({ error: "Name, email, company, role, and a valid status are required." }, { status: 400 });
  }
  return Response.json(await createContact(payload), { status: 201 });
}
