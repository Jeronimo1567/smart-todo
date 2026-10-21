// Service worker: instant app start (cached shell) + push reminders.

const SHELL = "shell-v2"
const STATIC = "static-v1"

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return

  // Hashed build assets never change: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) c.put(req, res.clone())
        return res
      })
    )
    return
  }

  // The page itself: serve the cached copy instantly, refresh it in the background.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req, { ignoreSearch: true })
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) c.put(new URL(req.url).pathname, res.clone())
            return res
          })
          .catch(() => hit)
        if (hit) {
          e.waitUntil(fresh)
          return hit
        }
        return fresh
      })
    )
  }
})

self.addEventListener("push", (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { title: "MCP Todo", body: e.data && e.data.text() }
  }
  const actions = data.taskId
    ? [
        { action: "done", title: "Done" },
        { action: "snooze", title: "Snooze 1h" },
      ]
    : []
  e.waitUntil(
    self.registration.showNotification(data.title || "MCP Todo", {
      body: data.body || "",
      tag: data.tag,
      renotify: !!data.tag,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      data,
      actions,
    })
  )
})

self.addEventListener("notificationclick", (e) => {
  const data = e.notification.data || {}
  e.notification.close()
  if (data.taskId && (e.action === "done" || e.action === "snooze")) {
    e.waitUntil(
      fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.taskId, action: e.action }),
      })
    )
    return
  }
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === location.origin)
      if (open) return open.focus()
      return self.clients.openWindow(data.url || "/")
    })
  )
})
