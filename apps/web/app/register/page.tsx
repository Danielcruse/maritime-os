"use client";

import { useState } from "react";
import { api, ApiRequestError } from "../../lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("NG");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string; user: { id: string; email: string } }>(
        "/auth/register",
        { email, password, displayName, countryCode },
      );
      window.localStorage.setItem("accessToken", data.accessToken);
      window.localStorage.setItem("refreshToken", data.refreshToken);
      setResult(`Registered as ${data.user.email}. Maritime ID issued — check /me.`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Registration failed.");
    }
  }

  return (
    <div>
      <h1>Create your Maritime ID</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          placeholder="Password (12+ chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          placeholder="Country code (e.g. NG)"
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          maxLength={2}
          required
        />
        <button type="submit">Register</button>
      </form>
      {result && <p style={{ color: "#8fd19e" }}>{result}</p>}
      {error && <p style={{ color: "#f08080" }}>{error}</p>}
    </div>
  );
}
