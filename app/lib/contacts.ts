import { Filter, ObjectId } from "mongodb";
import { getDb } from "./mongodb";

export type ContactStatus = "Active" | "Lead" | "Inactive";

export type Contact = { id: string; name: string; email: string; company: string; role: string; status: ContactStatus; color: string };
export type ContactInput = Omit<Contact, "id" | "color">;
export type ListQuery = { page: number; limit: number; q: string; status?: ContactStatus };
type ContactDocument = ContactInput & { _id: ObjectId; color: string };

const colors = ["violet", "orange", "teal", "blue", "pink", "yellow"];
const statuses: ContactStatus[] = ["Active", "Lead", "Inactive"];
const maxLength = { name: 100, email: 254, company: 100, role: 100 };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function collection() {
  return getDb().then((db) => db.collection<ContactDocument>("contacts"));
}

function serializeContact(contact: ContactDocument): Contact {
  const { _id, ...contactData } = contact;
  return { id: _id.toHexString(), ...contactData };
}

function toObjectId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function positiveInt(value: string | null, fallback: number) {
  const number = Number(value);
  return value !== null && Number.isInteger(number) && number >= 1 ? number : fallback;
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listContacts({ page, limit, q, status }: ListQuery) {
  const contacts = await collection();
  const filter: Filter<ContactDocument> = {};
  if (status) filter.status = status;
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: "i" };
    filter.$or = [{ name: pattern }, { email: pattern }, { company: pattern }, { role: pattern }];
  }
  const [documents, total] = await Promise.all([
    contacts.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    contacts.countDocuments(filter),
  ]);
  return { items: documents.map(serializeContact), total, page, limit };
}

export async function getSummary() {
  const contacts = await collection();
  const [total, active, leads] = await Promise.all([
    contacts.countDocuments({}),
    contacts.countDocuments({ status: "Active" }),
    contacts.countDocuments({ status: "Lead" }),
  ]);
  return { total, active, leads };
}

export async function getContact(id: string) {
  const objectId = toObjectId(id);
  if (!objectId) return undefined;
  const contact = await (await collection()).findOne({ _id: objectId });
  return contact ? serializeContact(contact) : undefined;
}

export async function createContact(input: ContactInput) {
  const contacts = await collection();
  const email = input.email.trim();
  const existing = await contacts.findOne({ email }, { collation: { locale: "en", strength: 2 } });
  if (existing) return null;
  const document: ContactDocument = { _id: new ObjectId(), ...input, email, color: colors[Math.floor(Math.random() * colors.length)] };
  await contacts.insertOne(document);
  return serializeContact(document);
}

export async function updateContact(id: string, input: ContactInput) {
  const objectId = toObjectId(id);
  if (!objectId) return undefined;
  const contacts = await collection();
  const email = input.email.trim();
  const duplicate = await contacts.findOne({ email, _id: { $ne: objectId } }, { collation: { locale: "en", strength: 2 } });
  if (duplicate) return null;
  const result = await contacts.updateOne({ _id: objectId }, { $set: { ...input, email } });
  if (!result.matchedCount) return undefined;
  return getContact(id);
}

export async function removeContact(id: string) {
  const objectId = toObjectId(id);
  if (!objectId) return false;
  const result = await (await collection()).deleteOne({ _id: objectId });
  return result.deletedCount === 1;
}

export function isContactInput(value: unknown): value is ContactInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  const textFieldsValid = (["name", "email", "company", "role"] as const).every((field) => {
    const text = input[field];
    return typeof text === "string" && text.trim() !== "" && text.length <= maxLength[field];
  });
  return textFieldsValid
    && emailPattern.test((input.email as string).trim())
    && statuses.includes(input.status as ContactStatus);
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  const status = params.get("status");
  return {
    page: positiveInt(params.get("page"), 1),
    limit: Math.min(positiveInt(params.get("limit"), 20), 100),
    q: (params.get("q") ?? "").trim().slice(0, 100),
    status: statuses.find((candidate) => candidate === status),
  };
}
