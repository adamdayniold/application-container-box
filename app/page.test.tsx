import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";

const contacts = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", role: "Engineer", status: "Active", color: "violet" },
  { id: "2", name: "Grace Hopper", email: "grace@example.com", company: "Navy", role: "Admiral", status: "Lead", color: "blue" },
] as const;
const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

function renderPage() {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => contacts });
  return render(<Home />);
}

describe("Home", () => {
  it("loads contacts and filters them by search and status", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ada Lovelace");
    expect(screen.getByText("Total contacts").parentElement).toHaveTextContent("2");
    await user.type(screen.getByLabelText("Search contacts"), "grace");
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.getByText(/No contacts match your search/)).toBeInTheDocument();
  });

  it("creates a contact", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ada Lovelace");
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...contacts[0], id: "3", name: "Alan Turing" }) });
    await user.click(screen.getByRole("button", { name: /add contact/i }));
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "Alan Turing");
    await user.type(inputs[2], "alan@example.com");
    await user.type(inputs[3], "Bletchley Park");
    await user.type(inputs[4], "Researcher");
    await user.click(screen.getByRole("button", { name: "Create contact" }));
    await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith("/api/contacts", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Alan Turing")).toBeInTheDocument();
  });

  it("deletes a contact after confirmation", async () => {
    renderPage();
    await screen.findByText("Ada Lovelace");
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete Ada Lovelace" }));
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
  });
});
