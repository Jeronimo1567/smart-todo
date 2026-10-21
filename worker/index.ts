// Cloudflare Worker: serves /api/* (static app files are served by Workers Assets
// without touching this code) and runs the reminder cron.

import type { SettingsResponse, SyncOp } from "../shared/types"
import { checkSession, clearCookie, issueCookie, safeEqual } from "./auth"
import { type Env, applyOps, changesSince, getMcpToken, getPrefs, getTimezone, setSetting, updatePrefs } from "./db"
import { handleMcp } from "./mcp"
import { pushAll } from "./push"
import { runReminders } from "./reminders"

const json = (data: unknown, init: ResponseInit = {}) =>
  Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } })

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname

  // MCP: the secret token in the URL is the credential (works as a claude.ai custom connector).
  if (path.startsWith("/api/mcp/")) {
    const token = path.slice("/api/mcp/".length)
    const [expected, prefs] = await Promise.all([getMcpToken(env), getPrefs(env)])
    if (!prefs.mcpEnabled || !(await safeEqual(token, expected, env.SESSION_SECRET))) {
      return new Response("Not found", { status: 404 })
    }
    return handleMcp(req, env)
  }

  if (path === "/api/login" && req.method === "POST") {
    const { password } = await req.json<{ password?: string }>().catch(() => ({ password: "" }))
    if (!password || !(await safeEqual(password, env.APP_PASSWORD, env.SESSION_SECRET))) {
      await new Promise((r) => setTimeout(r, 400)) // slow down guessing
      return json({ error: "Wrong password" }, { status: 401 })
    }
    return json({ ok: true }, { headers: { "Set-Cookie": await issueCookie(env) } })
  }

  if (path === "/api/logout" && req.method === "POST") {
    return json({ ok: true }, { headers: { "Set-Cookie": clearCookie } })
  }

  const session = await checkSession(req, env)
  if (!session) return json({ error: "Unauthorized" }, { status: 401 })
  const headers: HeadersInit = session.renew ? { "Set-Cookie": await issueCookie(env) } : {}

  switch (`${req.method} ${path}`) {
    case "GET /api/sync": {
      const since = Number(url.searchParams.get("since") ?? -1)
      return json(await changesSince(env, since), { headers })
    }
    case "POST /api/sync": {
      const body = await req.json<{ ops?: SyncOp[]; since?: number }>()
      const ops = Array.isArray(body.ops) ? body.ops.slice(0, 500) : []
      await applyOps(env, ops)
      return json(await changesSince(env, Number(body.since ?? -1)), { headers })
    }
    case "GET /api/settings":
      return json(await settingsResponse(env, url), { headers })
    case "POST /api/settings": {
      const body = await req.json<Record<string, unknown>>()
      if (typeof body.timezone === "string") {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: body.timezone })
          await setSetting(env, "timezone", body.timezone)
        } catch {
          return json({ error: "Bad time zone" }, { status: 400 })
        }
      }
      await updatePrefs(env, body)
      return json(await settingsResponse(env, url), { headers })
    }
    // New secret MCP URL; the old one stops working immediately.
    case "POST /api/mcp-token/rotate": {
      const bytes = crypto.getRandomValues(new Uint8Array(24))
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
      await setSetting(env, "mcp_token", token)
      return json(await settingsResponse(env, url), { headers })
    }
    case "POST /api/push/subscribe": {
      const sub = await req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>()
      if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
        return json({ error: "Bad subscription" }, { status: 400 })
      }
      await env.DB.prepare(
        `INSERT INTO push_subs (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
      )
        .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now())
        .run()
      return json({ ok: true }, { headers })
    }
    case "POST /api/push/unsubscribe": {
      const { endpoint } = await req.json<{ endpoint?: string }>()
      if (endpoint) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint).run()
      return json({ ok: true }, { headers })
    }
    case "POST /api/push/test": {
      const sent = await pushAll(env, { title: "Reminders are on", body: "This is how important tasks will bug you.", tag: "test" })
      return json({ sent }, { headers })
    }
    // Buttons on a notification ("Done", "Snooze 1h"), called from the service worker.
    case "POST /api/action": {
      const { id, action } = await req.json<{ id?: string; action?: string }>()
      if (!id) return json({ error: "Missing id" }, { status: 400 })
      const now = Date.now()
      const patch = action === "done" ? { doneAt: now } : action === "snooze" ? { snoozedUntil: now + 3_600_000 } : null
      if (!patch) return json({ error: "Unknown action" }, { status: 400 })
      await applyOps(env, [{ t: "task", id, patch }], now)
      return json({ ok: true }, { headers })
    }
  }
  return json({ error: "Not found" }, { status: 404 })
}

async function settingsResponse(env: Env, url: URL): Promise<SettingsResponse> {
  const [prefs, timezone, token] = await Promise.all([getPrefs(env), getTimezone(env), getMcpToken(env)])
  return {
    ...prefs,
    timezone,
    mcpUrl: `${url.origin}/api/mcp/${token}`,
    emailConfigured: !!(env.RESEND_API_KEY && env.DIGEST_EMAIL),
  }
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url)
      } catch (e) {
        console.error(e)
        return json({ error: "Server error" }, { status: 500 })
      }
    }
    return env.ASSETS.fetch(req)
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runReminders(env))
  },
} satisfies ExportedHandler<Env>
