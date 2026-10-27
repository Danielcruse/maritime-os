const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
}

export class ApiRequestError extends Error {
  constructor(public readonly apiError: ApiError, public readonly status: number) {
    super(apiError.message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiRequestError(body.error ?? { code: "UNKNOWN", message: "Request failed.", requestId: "" }, res.status);
  }

  return body.data as T;
}

export interface UploadedFile {
  storageKey: string;
  contentHash: string;
  size: number;
  contentType: string;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),

  // No "Content-Type": "application/json" here — the browser must set the
  // multipart boundary itself, which it only does when Content-Type is left unset.
  async upload(file: File): Promise<UploadedFile> {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/uploads`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiRequestError(body.error ?? { code: "UNKNOWN", message: "Upload failed.", requestId: "" }, res.status);
    }
    return body.data as UploadedFile;
  },

  // Downloads require a bearer token, so a plain <a href> won't carry auth —
  // fetch it ourselves and open the resulting blob in a new tab. The tab is
  // opened synchronously, before the `await`, so browsers still attribute it
  // to the click that triggered this call instead of silently popup-blocking
  // it (which happens if window.open runs after an async gap).
  async openFile(storageKey: string): Promise<void> {
    const newTab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
      const res = await fetch(`${API_BASE_URL}/uploads/${encodeURIComponent(storageKey)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiRequestError(
          body.error ?? { code: "UNKNOWN", message: "Could not open this file.", requestId: "" },
          res.status,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (newTab) newTab.location.href = url;
      else window.open(url, "_blank");
    } catch (err) {
      newTab?.close();
      throw err;
    }
  },
};
