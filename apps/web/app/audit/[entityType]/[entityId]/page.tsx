"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError } from "../../../../lib/api";
import { isLoggedIn } from "../../../../lib/auth";
import { card, muted, errorText, successText, secondaryButton, badge } from "../../../../lib/ui";

interface AuditEventRow {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payloadHash: string;
  previousHash: string | null;
  chainAnchorId: string | null;
  createdAt: string;
}

interface InclusionProof {
  proof: string[];
  offChainMatches: boolean;
  onChainVerified: boolean | null;
}

export default function AuditTrailPage() {
  const params = useParams<{ entityType: string; entityId: string }>();
  const { entityType, entityId } = params;

  const [events, setEvents] = useState<AuditEventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [proofs, setProofs] = useState<Record<string, InclusionProof | "loading" | "error">>({});

  async function onVerifyInclusion(eventId: string, anchorId: string) {
    setProofs((p) => ({ ...p, [eventId]: "loading" }));
    try {
      const result = await api.get<InclusionProof>(`/chain/anchors/${anchorId}/proof/${eventId}`);
      setProofs((p) => ({ ...p, [eventId]: result }));
    } catch {
      setProofs((p) => ({ ...p, [eventId]: "error" }));
    }
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false);
      setForbidden(true);
      return;
    }
    api
      .get<AuditEventRow[]>(`/audit/${entityType}/${entityId}`)
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load audit trail."))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) return <p>Loading…</p>;

  if (forbidden) {
    return (
      <div>
        <h1>Audit trail</h1>
        <p style={muted}>
          <a href="/login">Log in</a> to view this. (This MVP lets any logged-in user view any entity's trail — see
          known limitations.)
        </p>
      </div>
    );
  }

  if (error) return <p style={errorText}>{error}</p>;

  return (
    <div>
      <h1>Audit trail</h1>
      <p style={muted}>
        <small>
          {entityType}:{entityId}
        </small>
      </p>
      <p style={muted}>
        Each event&apos;s hash covers its own content plus the previous event&apos;s hash, so altering or deleting a
        past entry breaks the chain for everything after it. An event anchored on-chain can be checked with a
        compact inclusion proof — a handful of sibling hashes, not the whole batch — verified both off-chain here
        and against the live smart contract itself.
      </p>

      {events && events.length === 0 && <p style={muted}>No events recorded yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {events?.map((e) => {
          const proofState = proofs[e.id];
          return (
            <li key={e.id} style={card}>
              <strong>{e.eventType}</strong>{" "}
              {e.chainAnchorId ? (
                <a href={`/chain/anchors/${e.chainAnchorId}`} style={badge}>
                  ✓ anchored on-chain
                </a>
              ) : (
                <span style={badge}>not yet anchored</span>
              )}
              <p style={muted}>{new Date(e.createdAt).toLocaleString()}</p>
              <p style={muted}>
                <small>
                  hash: {e.payloadHash.slice(0, 16)}… · prev:{" "}
                  {e.previousHash ? e.previousHash.slice(0, 16) + "…" : "(none — first event)"}
                </small>
              </p>

              {e.chainAnchorId && (
                <>
                  {!proofState && (
                    <button style={secondaryButton} onClick={() => onVerifyInclusion(e.id, e.chainAnchorId!)}>
                      Verify this event&apos;s inclusion
                    </button>
                  )}
                  {proofState === "loading" && <p style={muted}>Fetching proof and checking the chain…</p>}
                  {proofState === "error" && <p style={errorText}>Could not verify.</p>}
                  {proofState && proofState !== "loading" && proofState !== "error" && (
                    <div>
                      <p style={muted}>
                        <small>Compact proof: {proofState.proof.length} sibling hash(es)</small>
                      </p>
                      <p style={proofState.offChainMatches ? successText : errorText}>
                        {proofState.offChainMatches ? "✓" : "✗"} Off-chain recomputation{" "}
                        {proofState.offChainMatches ? "matches" : "does NOT match"} the anchored root
                      </p>
                      <p
                        style={
                          proofState.onChainVerified === true
                            ? successText
                            : proofState.onChainVerified === false
                              ? errorText
                              : muted
                        }
                      >
                        {proofState.onChainVerified === true
                          ? "✓ Verified directly by the live smart contract (free eth_call, not just our database)"
                          : proofState.onChainVerified === false
                            ? "✗ The smart contract rejected this proof"
                            : "— Chain unreachable, or this anchor's contract predates on-chain proof verification"}
                      </p>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
