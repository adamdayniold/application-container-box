jest.mock("mongodb", () => {
  class ObjectId {
    private readonly value: string;

    constructor(value = "507f1f77bcf86cd799439012") {
      this.value = value;
    }

    static isValid(value: string) {
      return /^[a-f0-9]{24}$/i.test(value);
    }

    toHexString() {
      return this.value;
    }
  }

  return { ObjectId };
});
jest.mock("./mongodb", () => ({ getDb: jest.fn() }));

import { ObjectId } from "mongodb";
import { createContact, getContact, isContactInput, listContacts, removeContact, updateContact } from "./contacts";
import { getDb } from "./mongodb";

const mockGetDb = jest.mocked(getDb);
const contactId = new ObjectId("507f1f77bcf86cd799439011");
const document = {
  _id: contactId,
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines",
  role: "Engineer",
  status: "Active" as const,
  color: "violet",
};
const input = {
  name: document.name,
  email: document.email,
  company: document.company,
  role: document.role,
  status: document.status,
};

describe("contacts data helpers", () => {
  const mockCollection = {
    find: jest.fn(),
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDb.mockResolvedValue({ collection: jest.fn().mockReturnValue(mockCollection) } as never);
  });

  it("validates complete contact input", () => {
    expect(isContactInput(input)).toBe(true);
    expect(isContactInput({ ...input, email: " " })).toBe(false);
    expect(isContactInput({ ...input, status: "Prospect" })).toBe(false);
  });

  it("lists contacts newest first and serializes Mongo IDs", async () => {
    const toArray = jest.fn().mockResolvedValue([document]);
    mockCollection.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ toArray }) });

    await expect(listContacts()).resolves.toEqual([{ ...input, id: contactId.toHexString(), color: "violet" }]);
    expect(mockCollection.find).toHaveBeenCalledWith();
  });

  it("returns no contact for an invalid or missing ID", async () => {
    await expect(getContact("not-an-id")).resolves.toBeUndefined();
    mockCollection.findOne.mockResolvedValue(null);
    await expect(getContact(contactId.toHexString())).resolves.toBeUndefined();
  });

  it("creates a contact with a generated ID and color", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.insertOne.mockResolvedValue({} as never);

    const created = await createContact(input);

    expect(created).toMatchObject({ ...input, color: "violet" });
    expect(created?.id).toMatch(/^[a-f0-9]{24}$/);
    expect(mockCollection.insertOne).toHaveBeenCalledWith(expect.objectContaining(input));
  });

  it("updates and removes existing contacts", async () => {
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 } as never);
    mockCollection.findOne.mockImplementation(async (filter: { email?: string }) => ("email" in filter ? null : document));
    mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 } as never);

    await expect(updateContact(contactId.toHexString(), input)).resolves.toEqual({ ...input, id: contactId.toHexString(), color: "violet" });
    await expect(removeContact(contactId.toHexString())).resolves.toBe(true);
    await expect(removeContact("invalid")).resolves.toBe(false);
  });

  it("does not update a contact to an email another contact already uses", async () => {
    mockCollection.findOne.mockResolvedValue({ ...document, _id: new ObjectId("507f1f77bcf86cd799439012") });

    await expect(updateContact(contactId.toHexString(), { ...input, email: " BOB@example.com " })).resolves.toBeNull();

    expect(mockCollection.findOne).toHaveBeenCalledWith(
      { email: "BOB@example.com", _id: { $ne: contactId } },
      { collation: { locale: "en", strength: 2 } },
    );
    expect(mockCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects malformed emails and over-long fields", () => {
    expect(isContactInput({ ...input, email: "not-an-email" })).toBe(false);
    expect(isContactInput({ ...input, email: "a@b" })).toBe(false);
    expect(isContactInput({ ...input, email: "a b@example.com" })).toBe(false);
    expect(isContactInput({ ...input, name: "x".repeat(101) })).toBe(false);
    expect(isContactInput({ ...input, email: `${"x".repeat(250)}@example.com` })).toBe(false);
  });

  it("does not create a contact when the email already exists, ignoring case", async () => {
    mockCollection.findOne.mockResolvedValue(document);

    await expect(createContact({ ...input, email: ` ${input.email.toUpperCase()} ` })).resolves.toBeNull();

    expect(mockCollection.findOne).toHaveBeenCalledWith(
      { email: input.email.toUpperCase() },
      { collation: { locale: "en", strength: 2 } },
    );
    expect(mockCollection.insertOne).not.toHaveBeenCalled();
  });
});
