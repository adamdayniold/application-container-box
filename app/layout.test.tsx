import { render, screen } from "@testing-library/react";
import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("exports the page metadata", () => {
    expect(metadata).toMatchObject({ title: "Canvas Contacts", description: "A simple contact management workspace." });
  });

  it("renders children inside the document body", () => {
    render(<RootLayout params={Promise.resolve({})}><p>Page content</p></RootLayout>);
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
