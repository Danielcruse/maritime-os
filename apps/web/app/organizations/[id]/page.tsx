"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError, UploadedFile } from "../../../lib/api";
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
  evidenceStorageKeys: string[];
}

interface ResolvedSubject {
  userId: string;
  maritimeId: string;
  displayName: string;
}

interface ReputationSnapshot {
  score: string;
  sampleSize: number;
  scoreVersion: string;
  calculatedAt: string;
  metrics: {
    onTimeRate: number | null;
    cancellationRate: number | null;
    disputeRate: number | null;
    averageRating: number | null;
  };
}

interface Review {
  id: string;
  reviewerOrgId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export default function OrganizationPage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;

  const [org, setOrg] = useState<Organization | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [reputation, setReputation] = useState<ReputationSnapshot | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectMaritimeId, setSubjectMaritimeId] = useState("");
  const [resolvedSubject, setResolvedSubject] = useState<ResolvedSubject | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [credentialType, setCredentialType] = useState("");
  const [credentialExpiresAt, setCredentialExpiresAt] = useState("");
  const [credentialEvidenceFiles, setCredentialEvidenceFiles] = useState<FileList | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [revokeReasonByCredential, setRevokeReasonByCredential] = useState<Record<string, string>>({});
  const [credentialActionError, setCredentialActionError] = useState<string | null>(null);

  const [verificationFiles, setVerificationFiles] = useState<FileList | null>(null);
  const [submittingVerification, setSubmittingVerification] = useState(false);
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
      api.get<ReputationSnapshot | null>(`/organizations/${orgId}/reputation`).catch(() => null),
      api.get<Review[]>(`/organizations/${orgId}/reviews`).catch(() => []),
    ])
      .then(([orgData, myOrgs, listingsData, credentialsData, reputationData, reviewsData]) => {
        setOrg(orgData);
        setMyRole(myOrgs.find((o) => o.id === orgId)?.role ?? null);
        setListings(listingsData);
        setCredentials(credentialsData);
        setReputation(reputationData);
        setReviews(reviewsData);
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
    if (!verificationFiles || verificationFiles.length === 0) {
      setVerifyError("Choose at least one document to upload.");
      return;
    }
    setVerifyError(null);
    setSubmittingVerification(true);
    try {
      const uploaded: UploadedFile[] = await Promise.all(
        Array.from(verificationFiles).map((file) => api.upload(file)),
      );
      await api.post(`/organizations/${orgId}/verification`, {
        documentKeys: uploaded.map((f) => f.storageKey),
      });
      setVerifyMsg(`Verification case submitted with ${uploaded.length} document(s) — an admin will review it.`);
      setVerificationFiles(null);
    } catch (err) {
      setVerifyError(err instanceof ApiRequestError ? err.apiError.message : "Could not submit verification.");
    } finally {
      setSubmittingVerification(false);
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
      const evidence: UploadedFile[] = credentialEvidenceFiles
        ? await Promise.all(Array.from(credentialEvidenceFiles).map((file) => api.upload(file)))
        : [];
      await api.post(`/organizations/${orgId}/credentials`, {
        subjectUserId: resolvedSubject.userId,
        credentialType,
        expiresAt: credentialExpiresAt ? new Date(credentialExpiresAt).toISOString() : undefined,
        evidence: evidence.map((f) => ({ storageKey: f.storageKey, contentHash: f.contentHash })),
      });
      setSubjectMaritimeId("");
      setResolvedSubject(null);
      setCredentialType("");
      setCredentialExpiresAt("");
      setCredentialEvidenceFiles(null);
      load();
    } catch (err) {
      setIssueError(err instanceof ApiRequestError ? err.apiError.message : "Could not issue credential.");
    } finally {
      setIssuing(false);
    }
  }

  async function onViewFile(storageKey: string) {
    try {
      await api.openFile(storageKey);
    } catch (err) {
      setCredentialActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not open this file.");
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
      {isLoggedIn() && (
        <p style={muted}>
          <a href={`/audit/organization/${org.id}`} style={{ color: "#2f6fed" }}>
            View tamper-evident audit trail →
          </a>
        </p>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Reputation</h3>
        {!reputation || reputation.sampleSize < 3 ? (
          <p style={muted}>
            Not enough completed assignments yet to calculate a score
            {reputation ? ` (${reputation.sampleSize} so far, 3 needed)` : ""}.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0" }}>{Number(reputation.score).toFixed(1)} / 100</p>
            <p style={muted}>
              Based on {reputation.sampleSize} completed assignment{reputation.sampleSize === 1 ? "" : "s"} · score
              version {reputation.scoreVersion}
            </p>
            <p style={muted}>
              {reputation.metrics.averageRating !== null &&
                `Average rating ${reputation.metrics.averageRating.toFixed(1)}/5 · `}
              {reputation.metrics.onTimeRate !== null &&
                `${Math.round(reputation.metrics.onTimeRate * 100)}% on time · `}
              {reputation.metrics.disputeRate !== null && `${Math.round(reputation.metrics.disputeRate * 100)}% disputed`}
            </p>
          </>
        )}
      </div>

      <h2>Reviews</h2>
      {reviews.length === 0 && <p style={muted}>No reviews yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {reviews.map((r) => (
          <li key={r.id} style={card}>
            <strong>{"★".repeat(r.rating)}</strong>
            <span style={muted}>{"★".repeat(5 - r.rating)}</span>{" "}
            <span style={muted}>{new Date(r.createdAt).toLocaleDateString()}</span>
            {r.comment && <p style={{ margin: "4px 0 0" }}>{r.comment}</p>}
          </li>
        ))}
      </ul>

      {canManage && org.verificationStatus !== "verified" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Submit for verification</h3>
          <p style={muted}>Upload registration documents (PDF, DOC/DOCX, or an image) for an admin to review.</p>
          <form onSubmit={onSubmitVerification} style={form}>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setVerificationFiles(e.target.files)}
            />
            <button type="submit" style={secondaryButton} disabled={submittingVerification}>
              {submittingVerification ? "Uploading…" : "Submit verification case"}
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
                {c.evidenceStorageKeys.length > 0 && (
                  <p style={muted}>
                    Evidence:{" "}
                    {c.evidenceStorageKeys.map((key, i) => (
                      <span key={key}>
                        {i > 0 && ", "}
                        <button
                          onClick={() => onViewFile(key)}
                          style={{ background: "none", border: "none", color: "#2f6fed", cursor: "pointer", padding: 0 }}
                        >
                          file {i + 1}
                        </button>
                      </span>
                    ))}
                  </p>
                )}
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
                  <label style={muted}>
                    Supporting evidence (optional)
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => setCredentialEvidenceFiles(e.target.files)}
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
