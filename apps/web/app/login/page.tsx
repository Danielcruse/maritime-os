"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiRequestError } from "../../lib/api";
import { storeTokens } from "../../lib/auth";
import { form, button, errorText } from "../../lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string }>("/auth/login", {
        email,
        password,
      });
      storeTokens(data);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Log in</h1>
      <form onSubmit={onSubmit} style={form}>
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" style={button} disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      {error && <p style={errorText}>{error}</p>}
      <p>
        No account yet? <a href="/register">Register</a>
      </p>
    </div>
  );
}
