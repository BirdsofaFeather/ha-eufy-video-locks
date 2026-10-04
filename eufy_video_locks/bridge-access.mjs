// Modified for configurable public distribution, October 2026.
// Private access for this installation. Never log credentials or accept query tokens.
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

export function parseCredentials(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("Bridge access file is invalid"); }
  if (value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.httpToken ?? "") ||
      !/^[a-f0-9]{64}$/.test(value.rtspPassword ?? "") || value.httpToken === value.rtspPassword) {
    throw new Error("Bridge access file is missing valid separate credentials");
  }
  return value;
}

export function loadCredentials() {
  try { return parseCredentials(readFileSync("/data/bridge-auth-private.json", "utf8")); }
  catch { throw new Error("Private bridge credentials unavailable; refusing to start"); }
}

export function hasCredential(req, credentials) {
  const supplied = req.headers?.authorization;
  if (typeof supplied !== "string" || !/^Bearer [a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(supplied.slice(7), "hex"), Buffer.from(credentials.httpToken, "hex"));
}

export function allowsHttp(req, credentials) {
  // Only same-container health and ffmpeg producer traffic bypass authentication.
  // Never trust forwarding headers to identify localhost.
  const ip = req.socket?.remoteAddress;
  const loopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (loopback && req.method === "GET" &&
      (pathname === "/healthz" || /^\/stream\/[A-Za-z0-9_-]+$/.test(pathname))) return true;
  return hasCredential(req, credentials);
}
