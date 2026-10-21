"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { haptic } from "@/lib/haptics"
import { login } from "@/lib/store"

import { Logo } from "./sidebar"

export function Login() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const ok = await login(password)
          setBusy(false)
          setError(!ok)
          if (!ok) haptic("error")
        }}
      >
        <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <Logo className="size-6" />
          MCP Enabled Todo List
        </div>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error}
          className="h-10 text-base md:text-sm"
        />
        {error && <p className="text-sm text-destructive">Wrong password.</p>}
        <Button type="submit" size="lg" disabled={busy || !password}>
          Sign in
        </Button>
        <p className="text-xs text-muted-foreground">You&apos;ll stay signed in on this device.</p>
      </form>
    </div>
  )
}
