"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError } from "../../../lib/api";
import { isLoggedIn } from "../../../lib/auth";
import { card, muted, errorText, successText, button, secondaryButton, form, badge } from "../../../lib/ui";

interface Organization {
  id: string;
  legalName: string;
  countryCode: string;
  verificationStatus: string;
  createdAt: string;
}

interface Listing {
  id: string;
  title: string;
  cargoSummary: string;
  status: string;
  currency: string | null;
  createdAt: string;
}

interface Credential {
  id: string;
  credentialType: string;
  status: string;
  subjectMaritimeId?: string;
  subjectDisplayName?: string;
  issuedAt: string;
  expiresAt: string | null;
}

interface ResolvedSubject {
  userId: string;
  maritimeId: string;
  displayName: string;
}

export default function OrganizationPage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;

  const [org, setOrg] = useState<Organization | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectMaritimeId, setSubjectMaritimeId] = useState("");
  const [resolvedSubject, setResolvedSubject] = useState<ResolvedSubject | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [credentialType, setCredentialType] = useState("");
  const [credentialExpiresAt, setCredentialExpiresAt] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [revokeReasonByCredential, setRevokeReasonByCredential] = useState<Record<string, string>>({});
  const [credentialActionError, setCredentialActionError] = useState<string | null>(null);

  const [docKeys, setDocKeys] = useState("");
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [originPort, setOriginPort] = useState("");
  const [destinationPort, setDestinationPort] = useState("");
  const [cargoSummary, setCargoSummary] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [listingError, setListingError] = useState<string | null>(null);
  const [creatingListing, setCreatingListing] = useState(false);

  function load() {
    setLoading(true);
    const loggedIn = isLoggedIn();
    Promise.all([
      api.get<Organization>(`/organizations/${orgId}`),
      loggedIn ? api.get<{ id: string; role: string }[]>("/me/organizations") : Promise.resolve([]),
      loggedIn
        ? api.get<Listing[]>(`/listings/organizations/${orgId}`).catch(() => [])
        : Promise.resolve([]),
      loggedIn
        ? api.get<Credential[]>(`/organizations/${orgId}/credentials`).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([orgData, myOrgs, listingsData, credentialsData]) => {
        setOrg(orgData);
        setMyRole(myOrgs.find((o) => o.id === orgId)?.role ?? null);
        setListings(listingsData);
        setCredentials(credentialsData);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load organization."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const canManage = myRole === "owner" || myRole === "admin";

  async function onSubmitVerification(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError(null);
    try {
      await api.post(`/organizations/${orgId}/verification`, {
        documentKeys: docKeys
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      });
      setVerifyMsg("Verification case submitted — an admin will review it.");
      setDocKeys("");
    } catch (err) {
      setVerifyError(err instanceof ApiRequestError ? err.apiError.message : "Could not submit verification.");
    }
  }

  async function onCreateListing(e: React.FormEvent) {
    e.preventDefault();
    setListingError(null);
    setCreatingListing(true);
    try {
      await api.post(`/listings/organizations/${orgId}`, {
        title,
        origin: { countryCode: org?.countryCode ?? "NG", portCode: originPort },
        destination: { countryCode: org?.countryCode ?? "NG", portCode: destinationPort },
        cargoSummary,
        currency,
      });
      setTitle("");
      setOriginPort("");
      setDestinationPort("");
      setCargoSummary("");
      load();
    } catch (err) {
      setListingError(err instanceof ApiRequestError ? err.apiError.message : "Could not create listing.");
    } finally {
      setCreatingListing(false);
    }
  }

  async function onPublish(listingId: string) {
    try {
      await api.post(`/listings/${listingId}/publish/organizations/${orgId}`);
      load();
    } catch (err) {
      setListingError(err instanceof ApiRequestError ? err.apiError.message : "Could not publish listing.");
    }
  }

  async function onLookupSubject(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setResolvedSubject(null);
    setLookingUp(true);
    try {
      const subject = await api.get<ResolvedSubject>(`/credentials/subjects/${subjectMaritimeId.trim()}`);
      setResolvedSubject(subject);
    } catch (err) {
      setLookupError(err instanceof ApiRequestError ? err.apiError.message : "Could not find that Maritime ID.");
    } finally {
      setLookingUp(false);
    }
  }

  async function onIssueCredential(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedSubject) return;
    setIssueError(null);
    setIssuing(true);
    try {
      await api.post(`/organizations/${orgId}/credentials`, {
        subjectUserId: resolvedSubject.userId,
        credentialType,
        expiresAt: credentialExpiresAt ? new Date(credentialExpiresAt).toISOString() : undefined,
      });
      setSubjectMaritimeId("");
      setResolvedSubject(null);
      setCredentialType("");
      setCredentialExpiresAt("");
      load();
    } catch (err) {
      setIssueError(err instanceof ApiRequestError ? err.apiError.message : "Could not issue credential.");
    } finally {
      setIssuing(false);
    }
  }

  async function onRevoke(credentialId: string) {
    setCredentialActionError(null);
    const reason = revokeReasonByCredential[credentialId];
    if (!reason) {
      setCredentialActionError("A reason is required to revoke a credential.");
      return;
    }
    try {
      await api.post(`/organizations/${orgId}/credentials/${credentialId}/revoke`, { reason });
      load();
    } catch (err) {
      setCredentialActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not revoke credential.");
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={errorText}>{error}</p>;
  if (!org) return <p>Organization not found.</p>;

  return (
    <div>
      <h1>{org.legalName}</h1>
      <p>
        <span style={badge}>{org.countryCode}</span> <span style={badge}>{org.verificationStatus}</span>
      </p>

      {canManage && org.verificationStatus !== "verified" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Submit for verification</h3>
          <p style={muted}>
            No document upload yet (see known limitations) — enter placeholder storage keys, comma-separated.
          </p>
          <form onSubmit={onSubmitVerification} style={form}>
            <input
              placeholder="docs/registration.pdf, docs/license.pdf"
              value={docKeys}
              onChange={(e) => setDocKeys(e.target.value)}
              required
            />
            <button type="submit" style={secondaryButton}>
              Submit verification case
            </button>
          </form>
          {verifyMsg && <p style={successText}>{verifyMsg}</p>}
          {verifyError && <p style={errorText}>{verifyError}</p>}
        </div>
      )}

      {canManage && (
        <>
          <h2>Your listings</h2>
          {listings.length === 0 && <p style={muted}>No listings yet.</p>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {listings.map((listing) => (
              <li key={listing.id} style={card}>
                <a href={`/listings/${listing.id}`} style={{ color: "#e7edf5", fontWeight: 600, textDecoration: "none" }}>
                  {listing.title}
                </a>{" "}
                <span style={badge}>{listing.status}</span>
                <p style={muted}>{listing.cargoSummary}</p>
                {listing.status === "draft" && (
                  <button style={button} onClick={() => onPublish(listing.id)}>
                    Publish
                  </button>
                )}
              </li>
            ))}
          </ul>

          <h2>Create a listing</h2>
          {org.verificationStatus !== "verified" ? (
            <p style={muted}>Organization must be verified before publishing listings.</p>
          ) : (
            <form onSubmit={onCreateListing} style={form}>
              <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <input
                placeholder="Origin port code (e.g. NGLOS)"
                value={originPort}
                onChange={(e) => setOriginPort(e.target.value.toUpperCase())}
                required
              />
              <input
                placeholder="Destination port code (e.g. GHTEM)"
                value={destinationPort}
                onChange={(e) => setDestinationPort(e.target.value.toUpperCase())}
                required
              />
              <input
                placeholder="Cargo summary"
                value={cargoSummary}
                onChange={(e) => setCargoSummary(e.target.value)}
                required
              />
              <input
                placeholder="Currency (e.g. USD)"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
              <button type="submit" style={button} disabled={creatingListing}>
                {creatingListing ? "Creating…" : "Create listing (draft)"}
              </button>
            </form>
          )}
          {listingError && <p style={errorText}>{listingError}</p>}

          <h2>Credentials issued</h2>
          <p style={muted}>
            Any verified organization can issue credentials in this MVP — there's no separate authorized-issuer
            tier yet (see known limitations).
          </p>
          {credentials.length === 0 && <p style={muted}>None issued yet.</p>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {credentials.map((c) => (
              <li key={c.id} style={card}>
                <strong>{c.credentialType}</strong> <span style={badge}>{c.status}</span>
                <p style={muted}>
                  To {c.subjectDisplayName ?? "?"} ({c.subjectMaritimeId ?? "?"}) ·{" "}
                  {new Date(c.issuedAt).toLocaleDateString()}
                  {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                </p>
                <a href={`/credentials/${c.id}`} style={{ color: "#2f6fed" }}>
                  View verification page
                </a>
                {c.status === "active" && (
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <input
                      placeholder="Reason for revoking"
                      value={revokeReasonByCredential[c.id] ?? ""}
                      onChange={(e) => setRevokeReasonByCredential({ ...revokeReasonByCredential, [c.id]: e.target.value })}
                    />
                    <button style={secondaryButton} onClick={() => onRevoke(c.id)}>
                      Revoke
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {credentialActionError && <p style={errorText}>{credentialActionError}</p>}

          <h2>Issue a credential</h2>
          {org.verificationStatus !== "verified" ? (
            <p style={muted}>Organization must be verified before issuing credentials.</p>
          ) : (
            <>
              <form onSubmit={onLookupSubject} style={{ display: "flex", gap: 8, maxWidth: 420 }}>
                <input
                  placeholder="Subject's Maritime ID (e.g. MID-NG-ABC123)"
                  value={subjectMaritimeId}
                  onChange={(e) => {
                    setSubjectMaritimeId(e.target.value.toUpperCase());
                    setResolvedSubject(null);
                  }}
                  required
                  style={{ flex: 1 }}
                />
                <button type="submit" style={secondaryButton} disabled={lookingUp}>
                  {lookingUp ? "Looking up…" : "Look up"}
                </button>
              </form>
              {lookupError && <p style={errorText}>{lookupError}</p>}
              {resolvedSubject && (
                <p style={successText}>
                  Found: {resolvedSubject.displayName} ({resolvedSubject.maritimeId})
                </p>
              )}

              {resolvedSubject && (
                <form onSubmit={onIssueCredential} style={form}>
                  <input
                    placeholder="Credential type (e.g. certified-marine-surveyor)"
                    value={credentialType}
                    onChange={(e) => setCredentialType(e.target.value)}
                    required
                  />
                  <label style={muted}>
                    Expires (optional)
                    <input
                      type="date"
                      value={credentialExpiresAt}
                      onChange={(e) => setCredentialExpiresAt(e.target.value)}
                      style={{ display: "block", marginTop: 4 }}
                    />
                  </label>
                  <button type="submit" style={button} disabled={issuing}>
                    {issuing ? "Issuing…" : `Issue to ${resolvedSubject.displayName}`}
                  </button>
                </form>
              )}
              {issueError && <p style={errorText}>{issueError}</p>}
            </>
          )}
        </>
      )}

      {!isLoggedIn() && (
        <p style={muted}>
          <a href="/login">Log in</a> to manage this organization.
        </p>
      )}
    </div>
  );
}
