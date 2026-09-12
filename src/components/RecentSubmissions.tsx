import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from './Modal'

type Submission = {
  id: string
  event_date: string
  created_at: string
  event_type_label: string
  author_nickname: string
  show_nickname: boolean
  private_description: string | null
  status: 'published' | 'hidden'
}

function formatEventDate(value: string) {
  // Event dates have no time zone.
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function RecentSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let active = true
    let pending = false

    async function loadSubmissions() {
      if (!active || pending) return

      pending = true
      setLoading(true)

      try {
        const { data, error } = await supabase.rpc(
          'get_recent_submissions',
        )

        if (error) throw error
        if (!active) return

        setSubmissions((data ?? []) as Submission[])
        setError('')
      } catch {
        if (!active) return

        // Clear private data if access can no longer be confirmed.
        setSubmissions([])
        setSelectedId(null)
        setError('Unable to load recent submissions. Try refreshing.')
      } finally {
        pending = false
        if (active) setLoading(false)
      }
    }

    const manualRefresh = () => {
      void loadSubmissions()
    }

    refreshRef.current = manualRefresh

    void loadSubmissions()


    return () => {
      active = false

      if (refreshRef.current === manualRefresh) {
        refreshRef.current = null
      }
    }
  }, [])

  // Preview follows refreshed data instead of retaining an old copy.
  const selectedSubmission =
    submissions.find((submission) => submission.id === selectedId) ?? null

  return (
    <section
      className="recent-submissions"
      aria-labelledby="recent-submissions-title"
    >
      <header className="feed-header">
        <div>
          <h2 id="recent-submissions-title">Recent submissions</h2>
          <p>
            Latest 20 submissions across all dates. Streamer view only.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => refreshRef.current?.()}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      {loading && submissions.length === 0 && (
        <p role="status">Loading recent submissions…</p>
      )}

      {!loading && !error && submissions.length === 0 && (
        <p>No events have been submitted yet.</p>
      )}

      {submissions.length > 0 && (
        <div className="feed-table-wrapper">
          <table className="feed-table">
            <caption className="feed-caption">
              Events ordered by submission time, newest first
            </caption>

            <thead>
              <tr>
                <th scope="col">Event date</th>
                <th scope="col">Event type</th>
                <th scope="col">Submitted by</th>
                <th scope="col">Nickname visibility</th>
                <th scope="col">Submitted</th>
                <th scope="col">Details</th>
              </tr>
            </thead>

            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.id}>
                  <td>
                    <time dateTime={submission.event_date}>
                      {formatEventDate(submission.event_date)}
                    </time>
                  </td>

                  <td>{submission.event_type_label}</td>

                  <td>{submission.author_nickname}</td>

                  <td>
                    <span
                      className={
                        submission.show_nickname
                          ? 'feed-visibility'
                          : 'feed-visibility feed-visibility-private'
                      }
                    >
                      {submission.show_nickname ? 'Public' : 'Anonymous'}
                    </span>
                  </td>

                  <td>
                    <time dateTime={submission.created_at}>
                      {formatTimestamp(submission.created_at)}
                    </time>
                  </td>

                  <td>
                    <button
                      type="button"
                      aria-label={
                        `Preview ${submission.event_type_label} on ` +
                        formatEventDate(submission.event_date)
                      }
                      onClick={() => setSelectedId(submission.id)}
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedSubmission && (
        <Modal
          title={selectedSubmission.event_type_label}
          onClose={() => setSelectedId(null)}
        >
          <dl className="event-details">
            <dt>Event date</dt>
            <dd>
              {formatEventDate(selectedSubmission.event_date)}
            </dd>

            <dt>Submitted</dt>
            <dd>
              {formatTimestamp(selectedSubmission.created_at)}
            </dd>

            <dt>Submitted by</dt>
            <dd>{selectedSubmission.author_nickname}</dd>

            <dt>Nickname visibility</dt>
            <dd>
              {selectedSubmission.show_nickname
                ? 'Visible to viewers'
                : 'Hidden from viewers — submitted anonymously'}
            </dd>

            <dt>Private description</dt>
            <dd className="private-description">
              {selectedSubmission.private_description ||
                'No description provided.'}
            </dd>

            {selectedSubmission.status === 'hidden' && (
              <>
                <dt>Status</dt>
                <dd>Hidden</dd>
              </>
            )}
          </dl>
        </Modal>
      )}
    </section>
  )
}