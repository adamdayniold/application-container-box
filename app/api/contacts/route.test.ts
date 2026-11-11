/** @jest-environment node */

import { createContact, isContactInput, listContacts } from "@/app/lib/contacts";
import { metrics } from "@/app/lib/metrics";
import { GET, POST } from "./route";

jest.mock("@/app/lib/contacts", () => ({
  createContact: jest.fn(),
  isContactInput: jest.fn(),
  listContacts: jest.fn(),
}));

const mockListContacts = jest.mocked(listContacts);
const mockCreateContact = jest.mocked(createContact);
const mockIsContactInput = jest.mocked(isContactInput);
const input = { name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", role: "Engineer", status: "Active" as const };
const contact = { ...input, id: "1", color: "violet" };

describe("/api/contacts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns all contacts", async () => {
    mockListContacts.mockResolvedValue([contact]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([contact]);
  });

  it("rejects invalid contact payloads", async () => {
    mockIsContactInput.mockReturnValue(false);
    const response = await POST(new Request("http://localhost/api/contacts", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it("creates valid contacts", async () => {
    mockIsContactInput.mockReturnValue(true);
    mockCreateContact.mockResolvedValue(contact);
    const response = await POST(new Request("http://localhost/api/contacts", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(201);
    expect(mockCreateContact).toHaveBeenCalledWith(input);
    await expect(response.json()).resolves.toEqual(contact);
  });

  it("records metrics for requests, under the route pattern", async () => {
    metrics.requests.reset();
    mockIsContactInput.mockReturnValue(false);
    await POST(new Request("http://localhost/api/contacts", { method: "POST", body: "{}" }));
    const text = await metrics.registry.metrics();
    expect(text).toMatch(/http_requests_total\{[^}]*method="POST"[^}]*route="\/api\/contacts"[^}]*status="400"[^}]*\} 1/);
  });
});
