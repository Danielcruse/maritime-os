"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError } from "../../../lib/api";
import { isLoggedIn } from "../../../lib/auth";
import { card, muted, errorText, button, secondaryButton, form, badge } from "../../../lib/ui";

interface Listing {
  id: string;
  organizationId: string;
  title: string;
  cargoSummary: string;
  status: string;
  currency: string | null;
  origin: unknown;
  destination: unknown;
  createdAt: string;
}

interface Application {
  id: string;
  applicantOrgId: string;
  quoteAmount: string;
  currency: string;
  status: string;
  message: string | null;
  createdAt: string;
}

interface MyOrg {
  id: string;
  legalName: string;
  verificationStatus: string;
  role: string;
}

interface Assignment {
  id: string;
  status: string;
}

function portLabel(value: unknown): string {
  if (value && typeof value === "object" && "portCode" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).portCode);
  }
  return JSON.stringify(value);
}

export default function ListingPage() {
  const params = useParams<{ id: string }>();
  const listingId = params.id;

  const [listing, setListing] = useState<Listing | null>(null);
  const [myOrgs, setMyOrgs] = useState<MyOrg[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [applicantOrgId, setApplicantOrgId] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [applyCurrency, setApplyCurrency] = useState("USD");
  const [message, setMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const myOwnerOrg = myOrgs.find((o) => o.id === listing?.organizationId && (o.role === "owner" || o.role === "admin"));

  function load() {
    setLoading(true);
    const loggedIn = isLoggedIn();
    Promise.all([
      api.get<Listing>(`/listings/${listingId}`),
      loggedIn ? api.get<MyOrg[]>("/me/organizations") : Promise.resolve([]),
      loggedIn ? api.get<Assignment | null>(`/listings/${listingId}/assignment`).catch(() => null) : Promise.resolve(null),
    ])
      .then(([listingData, orgs, assignmentData]) => {
        setListing(listingData);
        setMyOrgs(orgs);
        setAssignment(assignmentData);
        const owner = orgs.find((o) => o.id === listingData.organizationId && (o.role === "owner" || o.role === "admin"));
        if (owner) {
          api
            .get<Application[]>(`/listings/${listingId}/applications/organizations/${owner.id}`)
            .then(setApplications)
            .catch(() => setApplications([]));
        }
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load listing."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  async function onApply(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setApplying(true);
    try {
      await api.post(`/listings/${listingId}/applications/organizations/${applicantOrgId}`, {
        quoteAmount,
        currency: applyCurrency,
        message: message || undefined,
      });
      setApplyMsg("Application submitted.");
      setQuoteAmount("");
      setMessage("");
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not submit application.");
    } finally {
      setApplying(false);
    }
  }

  async function onAward(applicationId: string) {
    if (!myOwnerOrg || !listing) return;
    setActionError(null);
    try {
      const awarded = await api.post<{ id: string }>(
        `/listings/${listing.id}/applications/${applicationId}/award/organizations/${myOwnerOrg.id}`,
      );
      window.location.href = `/assignments/${awarded.id}`;
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not award this application.");
    }
  }

  async function onPublish() {
    if (!myOwnerOrg || !listing) return;
    try {
      await api.post(`/listings/${listing.id}/publish/organizations/${myOwnerOrg.id}`);
      load();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not publish listing.");
    }
  }

  async function onCancel() {
    if (!myOwnerOrg || !listing) return;
    try {
      await api.post(`/listings/${listing.id}/cancel/organizations/${myOwnerOrg.id}`);
      load();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not cancel listing.");
    }
  }

  const applicantEligibleOrgs = myOrgs.filter(
    (o) => o.verificationStatus === "verified" && o.id !== listing?.organizationId,
  );

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={errorText}>{error}</p>;
  if (!listing) return <p>Listing not found.</p>;

  return (
    <div>
      <h1>{listing.title}</h1>
      <p>
        <span style={badge}>{listing.status}</span> <span style={badge}>{listing.currency ?? "—"}</span>
      </p>
      <p style={muted}>{listing.cargoSummary}</p>
      <p style={muted}>
        {portLabel(listing.origin)} → {portLabel(listing.destination)}
      </p>

      {assignment && (
        <p>
          Awarded — <a href={`/assignments/${assignment.id}`}>view assignment ({assignment.status})</a>
        </p>
      )}

      {myOwnerOrg && listing.status === "draft" && (
        <button style={button} onClick={onPublish}>
          Publish listing
        </button>
      )}
      {myOwnerOrg && (listing.status === "draft" || listing.status === "open") && (
        <button style={secondaryButton} onClick={onCancel}>
          Cancel listing
        </button>
      )}

      {myOwnerOrg && (
        <>
          <h2>Applications</h2>
          {applications.length === 0 && <p style={muted}>No applications yet.</p>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {applications.map((app) => (
              <li key={app.id} style={card}>
                <span style={badge}>{app.status}</span> {app.quoteAmount} {app.currency}
                {app.message && <p style={muted}>{app.message}</p>}
                {listing.status === "open" && (app.status === "submitted" || app.status === "shortlisted") && (
                  <div>
                    <button style={button} onClick={() => onAward(app.id)}>
                      Award
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!myOwnerOrg && listing.status === "open" && isLoggedIn() && (
        <>
          <h2>Apply</h2>
          {applicantEligibleOrgs.length === 0 ? (
            <p style={muted}>
              You need a verified organization to apply. Manage your orgs from the{" "}
              <a href="/dashboard">dashboard</a>.
            </p>
          ) : (
            <form onSubmit={onApply} style={form}>
              <select value={applicantOrgId} onChange={(e) => setApplicantOrgId(e.target.value)} required>
                <option value="">Applying as…</option>
                {applicantEligibleOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.legalName}
                  </option>
                ))}
              </select>
              <input
                placeholder="Quote amount"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
                required
              />
              <input
                placeholder="Currency (e.g. USD)"
                value={applyCurrency}
                onChange={(e) => setApplyCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
              <textarea placeholder="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
              <button type="submit" style={button} disabled={applying}>
                {applying ? "Submitting…" : "Submit application"}
              </button>
            </form>
          )}
          {applyMsg && <p style={muted}>{applyMsg}</p>}
        </>
      )}

      {!isLoggedIn() && (
        <p style={muted}>
          <a href="/login">Log in</a> to apply to this listing.
        </p>
      )}

      {actionError && <p style={errorText}>{actionError}</p>}
    </div>
  );
}
