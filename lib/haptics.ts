"use client"

// Haptic feedback on phones (Vibration API on Android, the iOS 18+ switch trick on iPhone).
// Must be called from inside a tap handler. Does nothing on desktop or when turned off in Settings.

import { WebHaptics } from "web-haptics"

export type Haptic = "success" | "warning" | "error" | "light" | "medium" | "heavy" | "selection" | "rigid"

const KEY = "todo:haptics"
let instance: WebHaptics | null = null

export function hapticsEnabled() {
  try {
    return localStorage.getItem(KEY) !== "0"
  } catch {
    return true
  }
}

export function setHapticsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0")
  } catch {}
}

export function isTouchDevice() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
}

export function haptic(kind: Haptic = "light") {
  if (!isTouchDevice() || !hapticsEnabled()) return
  instance ??= new WebHaptics()
  void instance.trigger(kind)
}
