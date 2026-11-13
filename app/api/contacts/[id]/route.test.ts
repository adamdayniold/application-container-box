/** @jest-environment node */

import { getContact, isContactInput, removeContact, updateContact } from "@/app/lib/contacts";
import { DELETE, GET, PUT } from "./route";

jest.mock("@/app/lib/contacts", () => ({
  getContact: jest.fn(),
  isContactInput: jest.fn(),
  removeContact: jest.fn(),
  updateContact: jest.fn(),
}));

const mockGetContact = jest.mocked(getContact);
const mockIsContactInput = jest.mocked(isContactInput);
const mockRemoveContact = jest.mocked(removeContact);
const mockUpdateContact = jest.mocked(updateContact);
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const input = { name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", role: "Engineer", status: "Active" as const };
const contact = { ...input, id: "1", color: "violet" };

describe("/api/contacts/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gets a contact or returns 404", async () => {
    mockGetContact.mockResolvedValue(contact);
    await expect((await GET(new Request("http://localhost"), context("1"))).json()).resolves.toEqual(contact);
    mockGetContact.mockResolvedValue(undefined);
    expect((await GET(new Request("http://localhost"), context("missing"))).status).toBe(404);
  });

  it("validates and updates a contact", async () => {
    mockIsContactInput.mockReturnValue(false);
    expect((await PUT(new Request("http://localhost", { method: "PUT", body: "{}" }), context("1"))).status).toBe(400);
    mockIsContactInput.mockReturnValue(true);
    mockUpdateContact.mockResolvedValue(contact);
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(input) }), context("1"));
    expect(mockUpdateContact).toHaveBeenCalledWith("1", input);
    await expect(response.json()).resolves.toEqual(contact);
  });

  it("returns 409 when the email belongs to another contact", async () => {
    mockIsContactInput.mockReturnValue(true);
    mockUpdateContact.mockResolvedValue(null);
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(input) }), context("1"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
  });

  it("deletes a contact or returns 404", async () => {
    mockRemoveContact.mockResolvedValue(true);
    expect((await DELETE(new Request("http://localhost"), context("1"))).status).toBe(204);
    mockRemoveContact.mockResolvedValue(false);
    expect((await DELETE(new Request("http://localhost"), context("missing"))).status).toBe(404);
  });
});
