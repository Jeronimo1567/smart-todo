"use client"

import { VAPID_PUBLIC_KEY } from "@/shared/types"

export type PushState = "unsupported" | "needs-install" | "off" | "on" | "denied"

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported"
  // iOS only allows web push once the app is added to the Home Screen.
  if (isIos() && !isStandalone()) return "needs-install"
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? "on" : "off"
}

export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission === "denied" ? "denied" : "off"
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW())
  if (!reg) return "unsupported"
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  })
  await fetch("/api/push/test", { method: "POST" })
  return "on"
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    await sub.unsubscribe()
  }
  return "off"
}
