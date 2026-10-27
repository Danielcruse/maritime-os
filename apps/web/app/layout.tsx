import type { ReactNode } from "react";

export const metadata = {
  title: "Maritime OS",
  description: "Maritime marketplace, identity and trust platform (MVP)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0b1320", color: "#e7edf5" }}>
        <header
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #1d2a3f",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <a href="/" style={{ color: "#e7edf5", textDecoration: "none", fontWeight: 700, fontSize: 18 }}>
            Maritime OS
          </a>
          <nav style={{ display: "flex", gap: 16 }}>
            <a href="/dashboard" style={{ color: "#9fb0c7", textDecoration: "none" }}>
              Dashboard
            </a>
            <a href="/login" style={{ color: "#9fb0c7", textDecoration: "none" }}>
              Log in
            </a>
            <a href="/register" style={{ color: "#9fb0c7", textDecoration: "none" }}>
              Register
            </a>
          </nav>
        </header>
        <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px" }}>{children}</main>
      </body>
    </html>
  );
}
