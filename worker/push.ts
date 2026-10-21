import { buildPushHTTPRequest } from "@pushforge/builder"

import type { Env } from "./db"

export type PushPayload = {
  title: string
  body: string
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string
  taskId?: string
  url?: string
}

type SubRow = { endpoint: string; p256dh: string; auth: string }

/** Send to every registered device; prunes subscriptions the push service says are gone. */
export async function pushAll(env: Env, payload: PushPayload) {
  const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subs").all<SubRow>()
  if (!results.length) return 0
  const privateJWK = JSON.parse(env.VAPID_PRIVATE_JWK)
  let sent = 0
  const gone: string[] = []
  await Promise.all(
    results.map(async (s) => {
      try {
        const req = await buildPushHTTPRequest({
          privateJWK,
          subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message: {
            payload,
            adminContact: env.VAPID_SUBJECT,
            options: { ttl: 3600, urgency: "high", topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) },
          },
        })
        const res = await fetch(req.endpoint, { method: "POST", headers: req.headers, body: req.body })
        if (res.status === 404 || res.status === 410) gone.push(s.endpoint)
        else if (res.ok) sent++
        else console.warn("push failed", res.status, await res.text())
      } catch (e) {
        console.warn("push error", e)
      }
    })
  )
  if (gone.length) {
    await env.DB.batch(gone.map((e) => env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(e)))
  }
  return sent
}
