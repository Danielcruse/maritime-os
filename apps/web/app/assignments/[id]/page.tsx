"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError } from "../../../lib/api";
import { isLoggedIn } from "../../../lib/auth";
import { card, muted, errorText, successText, button, secondaryButton, form, badge } from "../../../lib/ui";

interface AssignmentEvent {
  id: string;
  eventType: string;
  createdAt: string;
}

interface Evidence {
  id: string;
  storageKey: string;
  contentHash: string;
  createdAt: string;
}

interface Dispute {
  id: string;
  reason: string;
  status: string;
}

interface Assignment {
  id: string;
  listingId: string;
  awardedToOrgId: string;
  status: string;
  events: AssignmentEvent[];
  evidence: Evidence[];
  disputes: Dispute[];
}

interface Listing {
  id: string;
  title: string;
  organizationId: string;
}

interface MyOrg {
  id: string;
  role: string;
}

export default function AssignmentPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [myOrgs, setMyOrgs] = useState<MyOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [storageKey, setStorageKey] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  function load() {
    setLoading(true);
    const loggedIn = isLoggedIn();
    api
      .get<Assignment>(`/assignments/${assignmentId}`)
      .then((assignmentData) => {
        setAssignment(assignmentData);
        return Promise.all([
          api.get<Listing>(`/listings/${assignmentData.listingId}`),
          loggedIn ? api.get<MyOrg[]>("/me/organizations") : Promise.resolve([]),
        ]);
      })
      .then(([listingData, orgs]) => {
        setListing(listingData);
        setMyOrgs(orgs);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load assignment."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const assignedOrgId = myOrgs.find((o) => o.id === assignment?.awardedToOrgId)?.id;
  const employerOrg = myOrgs.find((o) => o.id === listing?.organizationId && (o.role === "owner" || o.role === "admin"));

  async function onSubmitEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!assignedOrgId || !assignment) return;
    setActionError(null);
    try {
      await api.post(`/assignments/${assignment.id}/evidence/organizations/${assignedOrgId}`, {
        storageKey,
        contentHash,
      });
      setStorageKey("");
      setContentHash("");
      setActionMsg("Evidence submitted.");
      load();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not submit evidence.");
    }
  }

  async function onConfirm() {
    if (!employerOrg || !assignment) return;
    setActionError(null);
    try {
      await api.post(`/assignments/${assignment.id}/confirm/organizations/${employerOrg.id}`);
      setActionMsg("Completion confirmed — points awarded.");
      load();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not confirm completion.");
    }
  }

  async function onOpenDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!assignment) return;
    setActionError(null);
    try {
      await api.post(`/assignments/${assignment.id}/disputes`, { reason: disputeReason });
      setDisputeReason("");
      setActionMsg("Dispute opened.");
      load();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not open dispute.");
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={errorText}>{error}</p>;
  if (!assignment) return <p>Assignment not found.</p>;

  const isParty = Boolean(assignedOrgId) || Boolean(employerOrg);

  return (
    <div>
      <h1>Assignment</h1>
      {listing && (
        <p>
          For listing: <a href={`/listings/${listing.id}`}>{listing.title}</a>
        </p>
      )}
      <p>
        <span style={badge}>{assignment.status}</span>
      </p>

      {assignedOrgId && (assignment.status === "active" || assignment.status === "evidence_submitted") && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Submit completion evidence</h3>
          <p style={muted}>No file upload yet — enter a placeholder storage key and content hash.</p>
          <form onSubmit={onSubmitEvidence} style={form}>
            <input
              placeholder="Storage key (e.g. evidence/pod.pdf)"
              value={storageKey}
              onChange={(e) => setStorageKey(e.target.value)}
              required
            />
            <input
              placeholder="Content hash (sha256 hex, 32-128 chars)"
              value={contentHash}
              onChange={(e) => setContentHash(e.target.value)}
              required
            />
            <button type="submit" style={button}>
              Submit evidence
            </button>
          </form>
        </div>
      )}

      {employerOrg && assignment.status === "evidence_submitted" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Confirm completion</h3>
          <p style={muted}>This awards points to the assigned organization and updates its reputation.</p>
          <button style={button} onClick={onConfirm}>
            Confirm completion
          </button>
        </div>
      )}

      {isParty && assignment.status !== "confirmed" && assignment.status !== "cancelled" && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Open a dispute</h3>
          <form onSubmit={onOpenDispute} style={form}>
            <textarea
              placeholder="Reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              required
            />
            <button type="submit" style={secondaryButton}>
              Open dispute
            </button>
          </form>
        </div>
      )}

      {actionMsg && <p style={successText}>{actionMsg}</p>}
      {actionError && <p style={errorText}>{actionError}</p>}

      <h2>Evidence</h2>
      {assignment.evidence.length === 0 && <p style={muted}>None submitted yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {assignment.evidence.map((ev) => (
          <li key={ev.id} style={card}>
            {ev.storageKey} <small style={muted}>({ev.contentHash.slice(0, 12)}…)</small>
          </li>
        ))}
      </ul>

      {assignment.disputes.length > 0 && (
        <>
          <h2>Disputes</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {assignment.disputes.map((d) => (
              <li key={d.id} style={card}>
                <span style={badge}>{d.status}</span> {d.reason}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>History</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {assignment.events.map((ev) => (
          <li key={ev.id} style={{ color: "#9fb0c7", marginBottom: 4 }}>
            {new Date(ev.createdAt).toLocaleString()} — {ev.eventType}
          </li>
        ))}
      </ul>
    </div>
  );
}
