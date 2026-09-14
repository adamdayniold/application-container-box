import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canvas Contacts",
  description: "A simple contact management workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
