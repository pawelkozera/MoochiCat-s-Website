import { useState } from 'react'
import { AuthPanel } from './components/AuthPanel'
import { EventCalendar } from './components/EventCalendar'
import { useAuth } from './hooks/useAuth'
import { RecentSubmissions } from './components/RecentSubmissions'
import './App.css'
import './calendar.css'

export default function App() {
  const auth = useAuth()

  const [streamModeRequested, setStreamModeRequested] = useState(false)

  // The existing auth hook still returns "Admin".
  const isStreamer = auth.role === 'Admin'
  const streamMode = isStreamer && streamModeRequested

  function toggleStreamMode() {
    if (streamMode) {
      const confirmed = window.confirm(
        'Turn off stream mode? Private descriptions and hidden nicknames may become visible.',
      )

      if (!confirmed) return
    }

    setStreamModeRequested(!streamMode)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>MoochiCat's Community</h1>
          <p>Your community. Your moments.</p>
        </div>

        {streamMode ? (
          <p className="stream-mode-badge" role="status">
            Stream mode is on
          </p>
        ) : (
          <AuthPanel
            signedIn={auth.user !== null}
            nickname={auth.nickname}
            role={auth.role}
            sessionLoading={auth.sessionLoading}
            roleLoading={auth.roleLoading}
            roleError={auth.roleError}
            busy={auth.busy}
            error={auth.error}
            onSignIn={auth.signIn}
            onSignOut={auth.signOut}
          />
        )}
      </header>

      {isStreamer && (
        <div className="stream-mode-controls">
          <button
            type="button"
            aria-pressed={streamMode}
            onClick={toggleStreamMode}
          >
            {streamMode ? 'Turn off stream mode' : 'Turn on stream mode'}
          </button>

          <span>
            {streamMode
              ? 'Public calendar view. Private details are hidden.'
              : 'Private details may be visible.'}
          </span>
        </div>
      )}

      {!auth.sessionLoading && (
        <EventCalendar
          key={`${auth.user?.id ?? 'guest'}-${streamMode}`}
          signedIn={auth.user !== null}
          isStreamer={isStreamer}
          streamMode={streamMode}
          authBusy={auth.busy}
          onSignIn={auth.signIn}
        />
      )}

      {!auth.sessionLoading &&
      !auth.roleLoading &&
      auth.user &&
      isStreamer &&
      !streamMode && (
        <RecentSubmissions key={auth.user.id} />
      )}
    </main>
  )
}