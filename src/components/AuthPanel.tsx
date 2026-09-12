type AuthPanelProps = {
  signedIn: boolean
  nickname: string
  role: 'Admin' | 'Viewer' | null
  sessionLoading: boolean
  roleLoading: boolean
  roleError: string | null
  busy: boolean
  error: string | null
  onSignIn: () => Promise<void>
  onSignOut: () => Promise<void>
}

export function AuthPanel({
  signedIn,
  nickname,
  role,
  sessionLoading,
  roleLoading,
  roleError,
  busy,
  error,
  onSignIn,
  onSignOut,
}: AuthPanelProps) {
  if (sessionLoading) {
    return <p role="status">Checking your session…</p>
  }

  return (
    <section aria-label="Your account">
      {signedIn ? (
        <>
          <p>
            Signed in as: <strong>{nickname}</strong>
          </p>

          <p aria-live="polite">
            Role:{' '}
            <strong>
              {roleLoading ? 'Loading…' : (role === 'Admin' ? 'Streamer' : role ?? 'Unavailable')}
            </strong>
          </p>

          {roleError && <p role="alert">{roleError}</p>}

          <button onClick={() => void onSignOut()} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      ) : (
        <>
          <p>Sign in to join the community.</p>

          <button onClick={() => void onSignIn()} disabled={busy}>
            {busy ? 'Redirecting…' : 'Sign in with Twitch'}
          </button>
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  )
}