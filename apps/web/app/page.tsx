"use client";

import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../lib/api";

interface Listing {
  id: string;
  title: string;
  cargoSummary: string;
  currency: string | null;
  status: string;
  createdAt: string;
}

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ items: Listing[] }>("/listings?status=open")
      .then((data) => setListings(data.items))
      .catch((err) => setError(err instanceof ApiRequestError ? err.apiError.message : "Could not load listings."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1>Open freight listings</h1>
      <p style={{ color: "#9fb0c7" }}>
        MVP marketplace view. Publishing, applying and awarding are implemented in the API — see{" "}
        <code>/api/docs</code> for the full contract. Register at <a href="/register">/register</a>.
      </p>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "#f08080" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {listings.map((listing) => (
          <li
            key={listing.id}
            style={{ border: "1px solid #1d2a3f", borderRadius: 8, padding: 16, marginBottom: 12 }}
          >
            <strong>{listing.title}</strong>
            <p style={{ margin: "4px 0", color: "#9fb0c7" }}>{listing.cargoSummary}</p>
            <small>
              {listing.currency ?? "—"} · {listing.status} · {new Date(listing.createdAt).toLocaleDateString()}
            </small>
          </li>
        ))}
        {!loading && listings.length === 0 && !error && <p>No open listings yet.</p>}
      </ul>
    </div>
  );
}
