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
import { createContact, getContact, getSummary, isContactInput, listContacts, parseListQuery, removeContact, updateContact } from "./contacts";
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
    countDocuments: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDb.mockResolvedValue({ collection: jest.fn().mockReturnValue(mockCollection) } as never);
  });

  function mockListChain(documents: unknown[], total: number) {
    const toArray = jest.fn().mockResolvedValue(documents);
    const limit = jest.fn().mockReturnValue({ toArray });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    mockCollection.find.mockReturnValue({ sort });
    mockCollection.countDocuments.mockResolvedValue(total);
    return { sort, skip, limit };
  }

  it("validates complete contact input", () => {
    expect(isContactInput(input)).toBe(true);
    expect(isContactInput({ ...input, email: " " })).toBe(false);
    expect(isContactInput({ ...input, status: "Prospect" })).toBe(false);
  });

  it("lists one page of contacts newest first, with the total, and serializes Mongo IDs", async () => {
    const { sort, skip, limit } = mockListChain([document], 41);

    await expect(listContacts({ page: 1, limit: 20, q: "" })).resolves.toEqual({
      items: [{ ...input, id: contactId.toHexString(), color: "violet" }],
      total: 41,
      page: 1,
      limit: 20,
    });
    expect(mockCollection.find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ _id: -1 });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(20);
  });

  it("filters by status and text (escaping regex characters) and skips earlier pages", async () => {
    const { skip, limit } = mockListChain([], 0);
    const pattern = { $regex: "a\\.b", $options: "i" };
    const filter = { status: "Lead", $or: [{ name: pattern }, { email: pattern }, { company: pattern }, { role: pattern }] };

    await listContacts({ page: 3, limit: 10, q: "a.b", status: "Lead" });

    expect(mockCollection.find).toHaveBeenCalledWith(filter);
    expect(mockCollection.countDocuments).toHaveBeenCalledWith(filter);
    expect(skip).toHaveBeenCalledWith(20);
    expect(limit).toHaveBeenCalledWith(10);
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

  it("parses list query parameters, with defaults and limits", () => {
    expect(parseListQuery(new URLSearchParams())).toEqual({ page: 1, limit: 20, q: "" });
    expect(parseListQuery(new URLSearchParams("page=3&limit=50&q=%20grace%20&status=Lead"))).toEqual({ page: 3, limit: 50, q: "grace", status: "Lead" });
    expect(parseListQuery(new URLSearchParams("page=0&limit=1000"))).toEqual({ page: 1, limit: 100, q: "" });
    expect(parseListQuery(new URLSearchParams("page=abc&limit=-5&status=Prospect"))).toEqual({ page: 1, limit: 20, q: "" });
    expect(parseListQuery(new URLSearchParams({ q: "x".repeat(150) })).q).toHaveLength(100);
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

  it("returns null when the unique index rejects a duplicate on create", async () => {
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.insertOne.mockRejectedValue({ code: 11000 });

    await expect(createContact(input)).resolves.toBeNull();
  });

  it("returns null when the unique index rejects a duplicate on update", async () => {
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.updateOne.mockRejectedValue({ code: 11000 });

    await expect(updateContact(contactId.toHexString(), input)).resolves.toBeNull();
  });

  it("does not hide other database errors on create", async () => {
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.insertOne.mockRejectedValue(new Error("disk full"));

    await expect(createContact(input)).rejects.toThrow("disk full");
  });

  it("summarises contact counts by status", async () => {
    mockCollection.countDocuments.mockImplementation(async (filter: { status?: string }) =>
      filter.status === "Active" ? 3 : filter.status === "Lead" ? 2 : 10);

    await expect(getSummary()).resolves.toEqual({ total: 10, active: 3, leads: 2 });
  });
});
