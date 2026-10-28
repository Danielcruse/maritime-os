"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError } from "../../../../lib/api";
import { isLoggedIn } from "../../../../lib/auth";
import { card, muted, errorText, badge } from "../../../../lib/ui";

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

export default function AuditTrailPage() {
  const params = useParams<{ entityType: string; entityId: string }>();
  const { entityType, entityId } = params;

  const [events, setEvents] = useState<AuditEventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

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
        past entry breaks the chain for everything after it. An event anchored on-chain has its batch independently
        verifiable — click through to check.
      </p>

      {events && events.length === 0 && <p style={muted}>No events recorded yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {events?.map((e) => (
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
                hash: {e.payloadHash.slice(0, 16)}… · prev: {e.previousHash ? e.previousHash.slice(0, 16) + "…" : "(none — first event)"}
              </small>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
