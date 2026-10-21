"use client"

import { CheckIcon, CopyIcon, LogOutIcon, RefreshCwIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { haptic, hapticsEnabled, isTouchDevice, setHapticsEnabled } from "@/lib/haptics"
import { type PushState, disablePush, enablePush, getPushState } from "@/lib/push"
import { logout } from "@/lib/store"
import { cn } from "@/lib/utils"
import { NAG_OPTIONS, type Prefs, type SettingsResponse } from "@/shared/types"

const select =
  "h-10 rounded-md border border-input bg-transparent px-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm dark:bg-input/30"

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" })

const PUSH_NOTE: Partial<Record<PushState, string>> = {
  "needs-install": "On iPhone, open this app from your Home Screen first: Share → Add to Home Screen.",
  denied: "Notifications are blocked for this site. Allow them in your browser settings.",
  unsupported: "This browser can't show notifications.",
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] grid-cols-1 gap-0 overflow-x-hidden overflow-y-auto p-0 sm:max-w-md">
        <DialogTitle className="px-5 pt-5 pb-1 text-base">Settings</DialogTitle>
        {open && <SettingsBody />}
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-5 py-4 last:border-b-0">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-40">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

function SettingsBody() {
  const [s, setS] = useState<SettingsResponse | null>(null)
  const [push, setPush] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const { theme, setTheme } = useTheme()
  const [touch] = useState(isTouchDevice)
  const [haptics, setHaptics] = useState(hapticsEnabled)

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
    getPushState().then(setPush)
  }, [])

  // Apply instantly, save in the background.
  function update(patch: Partial<Prefs>) {
    haptic("selection")
    setS((prev) => (prev ? { ...prev, ...patch } : prev))
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  async function rotate() {
    const res = await fetch("/api/mcp-token/rotate", { method: "POST" })
    if (res.ok) setS(await res.json())
    setConfirmRotate(false)
  }

  const masked = s ? s.mcpUrl.replace(/\/api\/mcp\/.+$/, "/api/mcp/••••••••") : "…"

  return (
    <div className="min-w-0 pb-2">
      <Section title="Reminders">
        <Row label="Notifications on this device" hint={push ? PUSH_NOTE[push] : undefined}>
          {push === "on" && (
            <Button variant="ghost" size="sm" onClick={() => fetch("/api/push/test", { method: "POST" })}>
              Test
            </Button>
          )}
          <Switch
            checked={push === "on"}
            disabled={busy || !push || (push !== "on" && push !== "off")}
            onCheckedChange={async (on) => {
              haptic("selection")
              setBusy(true)
              try {
                setPush(await (on ? enablePush() : disablePush()))
              } finally {
                setBusy(false)
              }
            }}
            aria-label="Notifications on this device"
          />
        </Row>
        {s && (
          <>
            <Row label="Overdue important tasks" hint="How often they keep bugging you">
              <select
                className={select}
                value={s.nagMinutes}
                onChange={(e) => update({ nagMinutes: Number(e.target.value) })}
                aria-label="Repeat interval"
              >
                {NAG_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    Every {m < 60 ? `${m} min` : `${m / 60} h`}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Quiet hours" hint={s.quietStart === s.quietEnd ? "Off" : "No notifications in between"}>
              <select
                className={select}
                value={s.quietStart}
                onChange={(e) => update({ quietStart: Number(e.target.value) })}
                aria-label="Quiet hours start"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">–</span>
              <select
                className={select}
                value={s.quietEnd}
                onChange={(e) => update({ quietEnd: Number(e.target.value) })}
                aria-label="Quiet hours end"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </Row>
            <Row
              label="Morning summary"
              hint={s.emailConfigured ? "Push + email" : "Push notification"}
            >
              {s.digestEnabled && (
                <input
                  type="time"
                  className={select}
                  value={s.digestTime}
                  onChange={(e) => e.target.value && update({ digestTime: e.target.value })}
                  aria-label="Summary time"
                />
              )}
              <Switch
                checked={s.digestEnabled}
                onCheckedChange={(v) => update({ digestEnabled: v })}
                aria-label="Morning summary"
              />
            </Row>
          </>
        )}
      </Section>

      <Section title="Claude (MCP)">
        <Row label="Let Claude manage this list" hint="Read, add, edit and complete tasks">
          <Switch
            checked={!!s?.mcpEnabled}
            disabled={!s}
            onCheckedChange={(v) => update({ mcpEnabled: v })}
            aria-label="Let Claude manage this list"
          />
        </Row>
        {s?.mcpEnabled && (
          <>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-2 text-xs">{masked}</code>
              <Button variant="outline" size="sm" className="h-9 md:h-8" onClick={() => s && copy(s.mcpUrl, "url")}>
                {copied === "url" ? <CheckIcon /> : <CopyIcon />}
                {copied === "url" ? "Copied" : "Copy URL"}
              </Button>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>
                <span className="text-foreground">Claude app or claude.ai:</span> Settings → Connectors → Add custom
                connector → paste the URL.
              </li>
              <li>
                <span className="text-foreground">Claude Code:</span>{" "}
                <button
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => s && copy(`claude mcp add --transport http todo ${s.mcpUrl}`, "cc")}
                >
                  {copied === "cc" ? "copied!" : "copy the terminal command"}
                </button>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">Keep the URL private; it works like a password.</p>
            {confirmRotate ? (
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted p-2.5 text-xs">
                <span>The old URL stops working. You&apos;ll need to update Claude.</span>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="destructive" onClick={rotate}>
                    New URL
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setConfirmRotate(true)}>
                <RefreshCwIcon />
                Generate a new URL
              </Button>
            )}
          </>
        )}
      </Section>

      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-[3px]">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                haptic("selection")
                setTheme(t)
              }}
              className={cn(
                "h-9 rounded-md text-sm capitalize text-muted-foreground md:h-8",
                theme === t && "bg-background text-foreground shadow-sm dark:bg-input/40"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      {touch && (
        <Section title="Feel">
          <Row label="Haptic feedback" hint="Little vibrations when you tap">
            <Switch
              checked={haptics}
              onCheckedChange={(on) => {
                setHapticsEnabled(on)
                setHaptics(on)
                haptic("medium")
              }}
              aria-label="Haptic feedback"
            />
          </Row>
        </Section>
      )}

      <Section title="Account">
        <Row label="Time zone" hint="Set automatically from this device">
          <span className="text-sm text-muted-foreground">{s?.timezone ?? "…"}</span>
        </Row>
        <Button variant="outline" className="h-10 self-start md:h-9" onClick={logout}>
          <LogOutIcon />
          Sign out of this device
        </Button>
      </Section>
    </div>
  )
}
