"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError } from "../../../../lib/api";
import { card, muted, errorText, successText, badge } from "../../../../lib/ui";

interface Anchor {
  id: string;
  batchRoot: string;
  chainId: number;
  contractAddress: string;
  txHash: string | null;
  blockNumber: string | null;
  status: string;
  eventCount: number;
  createdAt: string;
  confirmedAt: string | null;
}

interface AnchoredEvent {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payloadHash: string;
  createdAt: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Must match ChainAnchorService.buildMerkleRoot exactly (same sort, same
// pairwise sha256-of-concatenated-hex, same odd-count duplication) — this is
// a from-scratch client-side recomputation, not a call back to the API, so
// it actually proves the batch root rather than just redisplaying it.
async function recomputeMerkleRoot(leafHashes: string[]): Promise<string> {
  let level = [...leafHashes].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(await sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

export default function ChainAnchorPage() {
  const params = useParams<{ id: string }>();
  const anchorId = params.id;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [events, setEvents] = useState<AnchoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recomputedRoot, setRecomputedRoot] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Anchor>(`/chain/anchors/${anchorId}`),
      api.get<AnchoredEvent[]>(`/chain/anchors/${anchorId}/events`),
    ])
      .then(async ([anchorData, eventsData]) => {
        setAnchor(anchorData);
        setEvents(eventsData);
        setVerifying(true);
        const root = await recomputeMerkleRoot(eventsData.map((e) => e.payloadHash));
        setRecomputedRoot(root);
        setVerifying(false);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load this anchor."))
      .finally(() => setLoading(false));
  }, [anchorId]);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={errorText}>{error}</p>;
  if (!anchor) return <p>Anchor not found.</p>;

  const rootMatches = recomputedRoot === anchor.batchRoot;

  return (
    <div>
      <h1>Chain anchor</h1>
      <div style={card}>
        <p>
          <span style={badge}>{anchor.status}</span> · {anchor.eventCount} events · chain {anchor.chainId}
        </p>
        <p style={muted}>
          Submitted {new Date(anchor.createdAt).toLocaleString()}
          {anchor.confirmedAt && ` · confirmed ${new Date(anchor.confirmedAt).toLocaleString()}`}
        </p>
        {anchor.txHash && (
          <p style={muted}>
            <small>
              Tx: {anchor.txHash}
              {anchor.blockNumber && ` (block ${anchor.blockNumber})`}
            </small>
          </p>
        )}
        <p style={muted}>
          <small>Contract: {anchor.contractAddress}</small>
        </p>
        <p style={muted}>
          <small>Batch root: {anchor.batchRoot}</small>
        </p>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Independent verification</h3>
        <p style={muted}>
          This recomputes the Merkle root from the {events.length} event hashes below, entirely in your browser —
          it does not trust the server's claim that the root matches.
        </p>
        {verifying ? (
          <p style={muted}>Recomputing…</p>
        ) : rootMatches ? (
          <p style={successText}>✓ Recomputed root matches the anchored batch root.</p>
        ) : (
          <p style={errorText}>✗ Recomputed root does NOT match — this batch may be corrupted or tampered with.</p>
        )}
      </div>

      <h2>Events covered ({events.length})</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {events.map((e) => (
          <li key={e.id} style={{ borderBottom: "1px solid #1d2a3f", padding: "6px 0", fontSize: 13 }}>
            <span style={muted}>{new Date(e.createdAt).toLocaleString()}</span> — <strong>{e.eventType}</strong>{" "}
            <span style={muted}>
              ({e.entityType}:{e.entityId.slice(0, 8)}…)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
