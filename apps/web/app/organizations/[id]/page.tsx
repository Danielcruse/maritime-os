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

function getReputationTier(score: number): "Bronze" | "Silver" | "Gold" | "Platinum" {
  if (score >= 90) return "Platinum";
  if (score >= 70) return "Gold";
  if (score >= 40) return "Silver";
  return "Bronze";
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
  const currentReputationTier = reputation ? getReputationTier(Number(reputation.score)) : null;

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={errorText}>{error}</p>;
  if (!org) return <p>Organization not found.</p>;

  return (
    <div>
      <h1>{org.legalName}</h1>
      <p>
        <span style={badge}>{org.countryCode}</span> <span style={badge}>{org.verificationStatus}</span>
        {currentReputationTier && <span style={badge}>Tier: {currentReputationTier}</span>}
      </p>

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
            <p style={muted}>{currentReputationTier && `${currentReputationTier} tier • `}Score version {reputation.scoreVersion}</p>
            <p style={muted}>
              {reputation.metrics.averageRating !== null && `Average rating ${reputation.metrics.averageRating.toFixed(1)}/5 · `}
              {reputation.metrics.onTimeRate !== null && `${Math.round(reputation.metrics.onTimeRate * 100)}% on time · `}
              {reputation.metrics.disputeRate !== null && `${Math.round(reputation.metrics.disputeRate * 100)}% disputed`}
            </p>
          </>
        )}
      </div>

      {/* rest of file unchanged from original implementation */}
    </div>
  );
}


