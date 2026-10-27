"use client";

import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../../lib/api";
import { isLoggedIn } from "../../lib/auth";
import { card, muted, errorText, successText, button, secondaryButton, form, badge } from "../../lib/ui";

interface VerificationCase {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationCountryCode: string;
  decision: string;
  reasonCode: string | null;
  notes: string | null;
  documentKeys: string[];
  createdAt: string;
  decidedAt: string | null;
}

export default function AdminPage() {
  const [cases, setCases] = useState<VerificationCase[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const [notesByCase, setNotesByCase] = useState<Record<string, string>>({});
  const [reasonByCase, setReasonByCase] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    setForbidden(false);
    setError(null);
    api
      .get<VerificationCase[]>(showDecided ? "/admin/verification-cases" : "/admin/verification-cases?decision=pending")
      .then(setCases)
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 403) {
          setForbidden(true);
        } else {
          setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load verification cases.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false);
      setForbidden(true);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDecided]);

  async function onViewDocument(storageKey: string) {
    try {
      await api.openFile(storageKey);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not open this document.");
    }
  }

  async function onDecide(caseId: string, decision: "approved" | "rejected" | "more_info_requested") {
    setActionError(null);
    setActionMsg(null);
    try {
      await api.post(`/admin/verification-cases/${caseId}/decision`, {
        decision,
        reasonCode: reasonByCase[caseId] || undefined,
        notes: notesByCase[caseId] || undefined,
      });
      setActionMsg(`Case ${decision}.`);
      load();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Could not record decision.");
    }
  }

  if (loading) return <p>Loading…</p>;

  if (forbidden) {
    return (
      <div>
        <h1>Admin</h1>
        <p style={errorText}>
          Administrator role required. This MVP's admin check is a hard-coded allowlist of user ids in
          <code> ADMIN_USER_IDS</code> — see <code>docs/security.md</code>.
        </p>
        {!isLoggedIn() && (
          <p style={muted}>
            <a href="/login">Log in</a> first.
          </p>
        )}
      </div>
    );
  }

  if (error) return <p style={errorText}>{error}</p>;

  return (
    <div>
      <h1>Verification queue</h1>
      <p style={muted}>
        <a href="#" onClick={(e) => { e.preventDefault(); setShowDecided(!showDecided); }} style={{ color: "#2f6fed" }}>
          {showDecided ? "Show pending only" : "Show all cases"}
        </a>
      </p>

      {actionMsg && <p style={successText}>{actionMsg}</p>}
      {actionError && <p style={errorText}>{actionError}</p>}

      {cases && cases.length === 0 && <p style={muted}>No cases to review.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {cases?.map((c) => (
          <li key={c.id} style={card}>
            <strong>{c.organizationName}</strong> <span style={badge}>{c.organizationCountryCode}</span>{" "}
            <span style={badge}>{c.decision}</span>
            <p style={muted}>
              Submitted documents:{" "}
              {c.documentKeys.length === 0
                ? "(none)"
                : c.documentKeys.map((key, i) => (
                    <span key={key}>
                      {i > 0 && ", "}
                      <button
                        onClick={() => onViewDocument(key)}
                        style={{ background: "none", border: "none", color: "#2f6fed", cursor: "pointer", padding: 0 }}
                      >
                        {key.slice(key.indexOf("__") + 2)}
                      </button>
                    </span>
                  ))}{" "}
              · {new Date(c.createdAt).toLocaleString()}
            </p>
            {c.notes && <p style={muted}>Notes: {c.notes}</p>}

            {c.decision === "pending" && (
              <div style={form}>
                <input
                  placeholder="Reason code (optional)"
                  value={reasonByCase[c.id] ?? ""}
                  onChange={(e) => setReasonByCase({ ...reasonByCase, [c.id]: e.target.value })}
                />
                <input
                  placeholder="Notes (optional)"
                  value={notesByCase[c.id] ?? ""}
                  onChange={(e) => setNotesByCase({ ...notesByCase, [c.id]: e.target.value })}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={button} onClick={() => onDecide(c.id, "approved")}>
                    Approve
                  </button>
                  <button style={secondaryButton} onClick={() => onDecide(c.id, "rejected")}>
                    Reject
                  </button>
                  <button style={secondaryButton} onClick={() => onDecide(c.id, "more_info_requested")}>
                    Request more info
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
