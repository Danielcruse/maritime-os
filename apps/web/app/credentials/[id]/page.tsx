"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiRequestError } from "../../../lib/api";
import { card, muted, errorText, successText, badge } from "../../../lib/ui";

interface VerifyResult {
  credentialId: string;
  credentialType: string;
  issuerOrgId: string;
  issuedAt: string;
  expiresAt: string | null;
  status: string;
  signatureValid: boolean | null;
}

interface Organization {
  legalName: string;
}

export default function VerifyCredentialPage() {
  const params = useParams<{ id: string }>();
  const credentialId = params.id;

  const [result, setResult] = useState<VerifyResult | null>(null);
  const [issuer, setIssuer] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<VerifyResult>(`/credentials/${credentialId}/verify`)
      .then((data) => {
        setResult(data);
        return api.get<Organization>(`/organizations/${data.issuerOrgId}`).catch(() => null);
      })
      .then((org) => setIssuer(org))
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not verify this credential."))
      .finally(() => setLoading(false));
  }, [credentialId]);

  if (loading) return <p>Verifying…</p>;
  if (error) return <p style={errorText}>{error}</p>;
  if (!result) return <p>Credential not found.</p>;

  const ok = result.status === "active" && result.signatureValid !== false;

  return (
    <div>
      <h1>Credential verification</h1>
      <div style={card}>
        <p style={ok ? successText : errorText}>
          {ok ? "✓ Valid" : "✗ Not currently valid"} — <span style={badge}>{result.status}</span>
        </p>
        <p>
          <strong>{result.credentialType}</strong>
        </p>
        <p style={muted}>Issued by {issuer?.legalName ?? result.issuerOrgId}</p>
        <p style={muted}>
          Issued {new Date(result.issuedAt).toLocaleDateString()}
          {result.expiresAt && ` · Expires ${new Date(result.expiresAt).toLocaleDateString()}`}
        </p>
        <p style={muted}>
          Signature:{" "}
          {result.signatureValid === null
            ? "not checked (server has no public key configured)"
            : result.signatureValid
              ? "valid (Ed25519)"
              : "INVALID — this credential's signature does not match its content"}
        </p>
        <p style={muted}>
          <small>Credential ID: {result.credentialId}</small>
        </p>
      </div>
    </div>
  );
}
