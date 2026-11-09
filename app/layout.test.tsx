import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("exports the page metadata", () => {
    expect(metadata).toMatchObject({ title: "Canvas Contacts", description: "A simple contact management workspace." });
  });

  it("wraps children in html and body", () => {
    const child = <p>Page content</p>;
    const tree = RootLayout({ children: child } as never);

    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("en");

    const body = tree.props.children;
    expect(body.type).toBe("body");
    expect(body.props.children).toBe(child);
  });
});
