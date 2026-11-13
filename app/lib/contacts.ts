import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

export type ContactStatus = "Active" | "Lead" | "Inactive";

export type Contact = { id: string; name: string; email: string; company: string; role: string; status: ContactStatus; color: string };
export type ContactInput = Omit<Contact, "id" | "color">;
type ContactDocument = ContactInput & { _id: ObjectId; color: string };

const colors = ["violet", "orange", "teal", "blue", "pink", "yellow"];
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

export async function listContacts() {
  const contacts = await (await collection()).find().sort({ _id: -1 }).toArray();
  return contacts.map(serializeContact);
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
    && ["Active", "Lead", "Inactive"].includes(input.status as string);
}
