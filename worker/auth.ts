// Single-user auth: one password, then a signed cookie that lasts ~400 days
// (the browser maximum) and is silently renewed, so you never log in again.

import type { Env } from "./db"

const COOKIE = "s"
const MAX_AGE = 400 * 24 * 3600 // seconds
const RENEW_AFTER = 7 * 24 * 3600 * 1000 // re-issue once a week

const enc = new TextEncoder()
let keyCache: { secret: string; key: CryptoKey } | null = null

async function hmacKey(secret: string) {
  if (keyCache?.secret === secret) return keyCache.key
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])
  keyCache = { secret, key }
  return key
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Constant-time string compare (via HMAC so lengths don't leak either). */
export async function safeEqual(a: string, b: string, secret: string) {
  const key = await hmacKey(secret)
  const [x, y] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ])
  const ua = new Uint8Array(x)
  const ub = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

export async function issueCookie(env: Env) {
  const issued = Date.now().toString(36)
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), enc.encode(issued))
  return `${COOKIE}=${issued}.${b64url(sig)}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

export const clearCookie = `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`

/** Returns null if not signed in, otherwise whether the cookie should be renewed. */
export async function checkSession(req: Request, env: Env): Promise<{ renew: boolean } | null> {
  const raw = req.headers.get("Cookie")?.match(/(?:^|;\s*)s=([^;]+)/)?.[1]
  if (!raw) return null
  const [issued, sig] = raw.split(".")
  if (!issued || !sig) return null
  let ok = false
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(env.SESSION_SECRET), b64urlDecode(sig), enc.encode(issued))
  } catch {
    return null
  }
  if (!ok) return null
  const age = Date.now() - parseInt(issued, 36)
  if (!(age >= 0) || age > MAX_AGE * 1000) return null
  return { renew: age > RENEW_AFTER }
}
