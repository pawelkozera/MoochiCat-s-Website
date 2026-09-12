import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Role = 'Admin' | 'Viewer'

type RoleState = {
  userId: string
  role: Role | null
  error: string | null
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [roleState, setRoleState] = useState<RoleState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return

        setSession(nextSession)
        setSessionLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return

    const currentUserId = userId
    let cancelled = false

    async function loadRole() {
      try {
        const { data, error } = await supabase.rpc('is_admin')

        if (error) throw error
        if (typeof data !== 'boolean') {
          throw new Error('Invalid role response.')
        }

        if (!cancelled) {
          setRoleState({
            userId: currentUserId,
            role: data ? 'Admin' : 'Viewer',
            error: null,
          })
        }
      } catch {
        if (!cancelled) {
          setRoleState({
            userId: currentUserId,
            role: null,
            error: 'Unable to load your role. Please refresh the page.',
          })
        }
      }
    }

    void loadRole()

    return () => {
      cancelled = true
    }
  }, [userId])

  async function signIn() {
    setError(null)
    setBusy(true)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'twitch',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      })

      if (error) throw error
    } catch {
      setError('Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setError(null)
    setBusy(true)

    try {
      const { error } = await supabase.auth.signOut()

      if (error) throw error

      setRoleState(null)
    } catch {
      setError('Sign-out failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const currentRoleState =
    userId && roleState?.userId === userId ? roleState : null

  const name = session?.user.user_metadata.name
  const nickname = typeof name === 'string' ? name : 'Viewer'

  return {
    user: session?.user ?? null,
    nickname,
    role: currentRoleState?.role ?? null,
    roleLoading: Boolean(userId && !currentRoleState),
    roleError: currentRoleState?.error ?? null,
    sessionLoading,
    busy,
    error,
    signIn,
    signOut,
  }
}