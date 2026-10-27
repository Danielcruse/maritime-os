export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem("accessToken"));
}

export function storeTokens(tokens: { accessToken: string; refreshToken: string }) {
  window.localStorage.setItem("accessToken", tokens.accessToken);
  window.localStorage.setItem("refreshToken", tokens.refreshToken);
}

export function logout() {
  window.localStorage.removeItem("accessToken");
  window.localStorage.removeItem("refreshToken");
  window.location.href = "/";
}
