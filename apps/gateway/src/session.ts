export function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  return cookie.includes("better-auth.session_token");
}
