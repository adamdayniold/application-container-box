import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";

type Row = { id: string; name: string; email: string; company: string; role: string; status: string; color: string };
const contacts: Row[] = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", role: "Engineer", status: "Active", color: "violet" },
  { id: "2", name: "Grace Hopper", email: "grace@example.com", company: "Navy", role: "Admiral", status: "Lead", color: "blue" },
];
const manyContacts: Row[] = Array.from({ length: 23 }, (_, index) => ({
  id: String(index + 10),
  name: `Person ${String(index + 1).padStart(2, "0")}`,
  email: `person${index + 1}@example.com`,
  company: "Example Co",
  role: "Developer",
  status: "Active",
  color: "teal",
}));
const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

const response = (body: unknown) => ({ ok: true, json: async () => body });

// A tiny in-memory fake of the API, so the page can reload after a change.
function renderPage(summaryOverride?: { total: number; active: number; leads: number }, initialRows: Row[] = contacts) {
  let rows = [...initialRows];
  mockFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (init?.method === "POST") {
      const created = { ...contacts[0], id: "3", name: "Alan Turing" };
      rows = [created, ...rows];
      return response(created);
    }
    if (init?.method === "DELETE") {
      rows = rows.filter((row) => !url.endsWith(`/${row.id}`));
      return { ok: true };
    }
    if (url.startsWith("/api/contacts/summary")) {
      return response(summaryOverride ?? {
        total: rows.length,
        active: rows.filter((row) => row.status === "Active").length,
        leads: rows.filter((row) => row.status === "Lead").length,
      });
    }
    const params = new URL(url, "http://localhost").searchParams;
    const text = (params.get("q") ?? "").toLowerCase();
    const status = params.get("status");
    const matching = rows.filter((row) =>
      (!status || row.status === status) && [row.name, row.email, row.company, row.role].join(" ").toLowerCase().includes(text));
    const pageNumber = Number(params.get("page") ?? 1);
    const limit = Number(params.get("limit") ?? 10);
    return response({ items: matching.slice((pageNumber - 1) * limit, pageNumber * limit), total: matching.length, page: pageNumber, limit });
  });
  return render(<Home />);
}

describe("Home", () => {
  it("searches and filters on the server, once typing has paused", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ada Lovelace");
    await waitFor(() => expect(screen.getByText("Total contacts").parentElement).toHaveTextContent("2"));
    await user.type(screen.getByLabelText("Search contacts"), "grace");
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    const searches = mockFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("q="));
    expect(searches).toEqual(["/api/contacts?page=1&limit=10&q=grace"]);
    await user.click(screen.getByRole("button", { name: "Active" }));
    await screen.findByText(/No contacts match your search/);
    expect(mockFetch).toHaveBeenCalledWith("/api/contacts?page=1&limit=10&q=grace&status=Active");
    expect(screen.getByText("Total contacts").parentElement).toHaveTextContent("2");
  });

  it("pages through the contacts", async () => {
    const user = userEvent.setup();
    renderPage(undefined, manyContacts);
    await screen.findByText("Person 01");
    expect(screen.getByText("Showing 10 of 23 contacts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Person 11");
    expect(screen.queryByText("Person 01")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Person 21");
    expect(screen.getByText("Showing 3 of 23 contacts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("returns to the first page when the search changes", async () => {
    const user = userEvent.setup();
    renderPage(undefined, manyContacts);
    await screen.findByText("Person 01");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Person 11");
    await user.type(screen.getByLabelText("Search contacts"), "person 2");
    await screen.findByText("Showing 4 of 4 contacts");
    expect(screen.getByText("Person 20")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining("page=2&limit=10&q="));
  });

  it("steps back a page when the last contact on a page is deleted", async () => {
    const user = userEvent.setup();
    renderPage(undefined, manyContacts.slice(0, 11));
    await screen.findByText("Person 01");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Person 11");
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete Person 11" }));
    await screen.findByText("Showing 10 of 10 contacts");
    expect(screen.getByText("Person 01")).toBeInTheDocument();
  });

  it("shows the totals from the summary, not from the current page", async () => {
    renderPage({ total: 41, active: 30, leads: 7 });
    await screen.findByText("Ada Lovelace");
    await waitFor(() => expect(screen.getByText("Total contacts").parentElement).toHaveTextContent("41"));
    expect(screen.getByText("Active contacts").parentElement).toHaveTextContent("30");
    expect(screen.getByText("New leads").parentElement).toHaveTextContent("7");
  });

  it("creates a contact", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ada Lovelace");
    await user.click(screen.getByRole("button", { name: /add contact/i }));
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "Alan Turing");
    await user.type(inputs[2], "alan@example.com");
    await user.type(inputs[3], "Bletchley Park");
    await user.type(inputs[4], "Researcher");
    await user.click(screen.getByRole("button", { name: "Create contact" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/contacts", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Alan Turing")).toBeInTheDocument();
  });

  it("deletes a contact after confirmation", async () => {
    renderPage();
    await screen.findByText("Ada Lovelace");
    jest.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete Ada Lovelace" }));
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
  });
});
