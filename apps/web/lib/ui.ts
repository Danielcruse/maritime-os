import type { CSSProperties } from "react";

export const card: CSSProperties = {
  border: "1px solid #1d2a3f",
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
};

export const muted: CSSProperties = { color: "#9fb0c7" };
export const errorText: CSSProperties = { color: "#f08080" };
export const successText: CSSProperties = { color: "#8fd19e" };

export const button: CSSProperties = {
  background: "#2f6fed",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  cursor: "pointer",
};

export const secondaryButton: CSSProperties = {
  ...button,
  background: "transparent",
  border: "1px solid #2f6fed",
};

export const form: CSSProperties = { display: "grid", gap: 12, maxWidth: 420 };

export const badge: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 12,
  fontSize: 12,
  border: "1px solid #1d2a3f",
};
