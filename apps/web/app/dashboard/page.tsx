"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiRequestError } from "../../lib/api";
import { isLoggedIn, logout } from "../../lib/auth";
import { card, muted, errorText, button, form, badge } from "../../lib/ui";

interface Me {
  id: string;
  email: string;
  maritimeId?: string;
  displayName?: string;
  countryCode?: string;
  pointsBalance?: string;
}

interface MyOrg {
  id: string;
  legalName: string;
  countryCode: string;
  verificationStatus: string;
  role: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<MyOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [legalName, setLegalName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [orgCountryCode, setOrgCountryCode] = useState("NG");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([api.get<Me>("/me"), api.get<MyOrg[]>("/me/organizations")])
      .then(([meData, orgsData]) => {
        setMe(meData);
        setOrgs(orgsData);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load your dashboard."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  async function onCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.post("/organizations", {
        legalName,
        registrationNumber: registrationNumber || undefined,
        countryCode: orgCountryCode,
      });
      setLegalName("");
      setRegistrationNumber("");
      load();
    } catch (err) {
      setCreateError(err instanceof ApiRequestError ? err.apiError.message : "Could not create organization.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={errorText}>{error}</p>;

  return (
    <div>
      <h1>Dashboard</h1>
      {me && (
        <div style={card}>
          <strong>{me.displayName ?? me.email}</strong>
          <p style={muted}>
            Maritime ID: {me.maritimeId ?? "—"} · Points: {me.pointsBalance ?? "0"}
          </p>
          <button style={{ background: "none", border: "none", color: "#9fb0c7", cursor: "pointer", padding: 0 }} onClick={logout}>
            Log out
          </button>
        </div>
      )}

      <h2>Your organizations</h2>
      {orgs.length === 0 && <p style={muted}>You're not a member of any organization yet. Create one below.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {orgs.map((org) => (
          <li key={org.id} style={card}>
            <a href={`/organizations/${org.id}`} style={{ color: "#e7edf5", fontWeight: 600, textDecoration: "none" }}>
              {org.legalName}
            </a>{" "}
            <span style={badge}>{org.role}</span> <span style={badge}>{org.verificationStatus}</span>
            <p style={muted}>{org.countryCode}</p>
          </li>
        ))}
      </ul>

      <h2>Create an organization</h2>
      <form onSubmit={onCreateOrg} style={form}>
        <input placeholder="Legal name" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
        <input
          placeholder="Registration number (optional)"
          value={registrationNumber}
          onChange={(e) => setRegistrationNumber(e.target.value)}
        />
        <input
          placeholder="Country code (e.g. NG)"
          value={orgCountryCode}
          onChange={(e) => setOrgCountryCode(e.target.value.toUpperCase())}
          maxLength={2}
          required
        />
        <button type="submit" style={button} disabled={creating}>
          {creating ? "Creating…" : "Create organization"}
        </button>
      </form>
      {createError && <p style={errorText}>{createError}</p>}
    </div>
  );
}
