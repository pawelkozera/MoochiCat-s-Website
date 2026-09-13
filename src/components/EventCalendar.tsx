import { useCallback, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventSourceFuncArg } from '@fullcalendar/core'
import { supabase } from '../lib/supabase'
import { CalendarEventContent } from './CalendarEventContent'
import { EventFormModal } from './EventFormModal'
import { Modal } from './Modal'
import { useLivestreamDays } from '../hooks/useLivestreamDays'
import calendarCat from '../assets/calendar-cats.png'

type CalendarEvent = {
  id: string
  event_date: string
  event_type_code: string
  event_type_label: string
  event_type_color: string
  show_nickname: boolean
  author_nickname: string | null
  private_description: string | null
  is_owner: boolean
  status: 'published' | 'hidden'
}

type EventCalendarProps = {
  signedIn: boolean
  isStreamer: boolean
  streamMode: boolean
  authBusy: boolean
  onSignIn: () => Promise<void>
}

function toDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function EventCalendar({
  signedIn,
  isStreamer,
  streamMode,
  authBusy,
  onSignIn,
}: EventCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const {
    days: livestreamDays,
    loading: livestreamLoading,
    error: livestreamLoadError,
    setDateRange,
    refresh: refreshLivestreamDays,
  } = useLivestreamDays()

  const [dayActionDate, setDayActionDate] = useState<string | null>(null)
  const [markerSaving, setMarkerSaving] = useState(false)
  const [markerError, setMarkerError] = useState('')

  const handleDatesSet = useCallback(
    (info: DatesSetArg) => {
      setDateRange(
        info.startStr.slice(0, 10),
        info.endStr.slice(0, 10),
      )
    },
    [setDateRange],
  )

  const loadEvents = useCallback(
    async (range: EventSourceFuncArg) => {
      const { data, error } = await supabase.rpc('get_calendar_events', {
        p_start_date: range.startStr.slice(0, 10),
        p_end_date: range.endStr.slice(0, 10),
        p_stream_mode: streamMode,
      })

      if (error) {
        console.error('Calendar fetch failed:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        })

        throw new Error('Unable to load calendar events.')
      }

      return ((data ?? []) as CalendarEvent[])
        .filter((event) => !streamMode || event.status === 'published')
        .map((event) => {
          // Additional presentation protection; the API also filters data.
          const visibleEvent: CalendarEvent = streamMode
            ? {
                ...event,
                author_nickname: event.show_nickname
                  ? event.author_nickname
                  : null,
                private_description: null,
                is_owner: false,
              }
            : event

          const presetColor = visibleEvent.event_type_code === 'birthday'
            ? '#ffa2a6'
            : visibleEvent.event_type_code === 'achievement'
              ? '#c7e4b7'
              : null

          return {
            id: visibleEvent.id,
            title: [
              visibleEvent.status === 'hidden' ? '[Hidden]' : '',
              visibleEvent.event_type_label,
              visibleEvent.author_nickname
                ? `— ${visibleEvent.author_nickname}`
                : '',
            ]
              .filter(Boolean)
              .join(' '),
            start: visibleEvent.event_date,
            allDay: true,
            backgroundColor: presetColor ?? visibleEvent.event_type_color,
            borderColor: presetColor ?? visibleEvent.event_type_color,
            classNames: presetColor ? ['calendar-preset-event'] : [],
            textColor: '#111827',
            extendedProps: {
              details: visibleEvent,
            },
          }
        })
    },
    [streamMode],
  )

  function refreshEvents() {
    setError('')
    calendarRef.current?.getApi().refetchEvents()
    refreshLivestreamDays()
  }

  function handleSaved() {
    const wasEditing = editingEvent !== null

    setSelectedDate(null)
    setEditingEvent(null)
    setSelectedEvent(null)

    setNotice(
      wasEditing
        ? 'Your event has been updated.'
        : 'Your event has been added.',
    )

    refreshEvents()
  }

  function openCreateModal() {
    if (streamMode) return

    setNotice('')
    setSelectedDate(toDateString(new Date()))
  }

  function openEditModal() {
    if (streamMode || !selectedEvent?.is_owner || deleting) return

    setEditingEvent(selectedEvent)
    setSelectedEvent(null)
    setNotice('')
  }

  async function handleDeleteEvent() {
    if (
      streamMode ||
      !signedIn ||
      !selectedEvent ||
      deleting ||
      !(isStreamer || selectedEvent.is_owner)
    ) {
      return
    }

    const confirmed = window.confirm(
      'Delete this event permanently? This action cannot be undone.',
    )

    if (!confirmed) return

    setDeleting(true)
    setDeleteError('')

    try {
      const { error } = await supabase.rpc('delete_event', {
        p_event_id: selectedEvent.id,
      })

      if (error) throw error
    } catch {
      setDeleteError(
        'Unable to confirm deletion. Refresh the calendar before trying again.',
      )
      setDeleting(false)
      return
    }

    setDeleting(false)
    setSelectedEvent(null)
    setNotice('The event has been deleted.')
    refreshEvents()
  }

  function handleDayClick(date: string) {
    if (streamMode) return

    setNotice('')

    if (signedIn && isStreamer) {
      setMarkerError('')
      setDayActionDate(date)
    } else {
      setSelectedDate(date)
    }
  }

  async function handleLivestreamChange(enabled: boolean) {
    if (
      !dayActionDate ||
      !signedIn ||
      !isStreamer ||
      streamMode ||
      markerSaving ||
      livestreamLoading ||
      livestreamLoadError
    ) {
      return
    }

    setMarkerSaving(true)
    setMarkerError('')

    try {
      const { error } = await supabase.rpc('set_livestream_day', {
        p_stream_date: dayActionDate,
        p_enabled: enabled,
      })

      if (error) throw error
    } catch {
      setMarkerError(
        'Unable to confirm the change. Close this dialog and refresh the calendar.',
      )
      setMarkerSaving(false)
      return
    }

    setMarkerSaving(false)
    setDayActionDate(null)
    setNotice(
      enabled
        ? 'The day has been marked as a livestream day.'
        : 'The livestream marker has been removed.',
    )

    refreshLivestreamDays()
  }

  return (
    <section className="calendar-section" aria-label="Community calendar">
      <div className="calendar-intro">
        <div>
          <h2>Community calendar</h2>
          <p>
            {streamMode
              ? 'Explore moments shared by the community.'
              : signedIn && isStreamer
                ? 'Click a day to add an event or manage its livestream marker.'
                : 'Click a day to add an event, or select an event to see its details.'}
          </p>
        </div>

        <button type="button" onClick={refreshEvents}>
          Refresh
        </button>
      </div>

      {/* Provides a keyboard-accessible alternative to clicking a day. */}
      {!streamMode && (
        <button type="button" onClick={openCreateModal}>
          {signedIn ? 'Add event' : 'Sign in to add an event'}
        </button>
      )}

      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading events…</p>}

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      {livestreamLoading && (
        <p role="status">Loading livestream markers…</p>
      )}

      {livestreamLoadError && (
        <p role="alert" className="error-message">
          {livestreamLoadError}
        </p>
      )}

      <div className="calendar-board">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="en"
          firstDay={1}
          fixedWeekCount={false}
          showNonCurrentDates={false}
          dayHeaderFormat={{ weekday: 'long' }}
          dayHeaderContent={(info) => (
            <span aria-label={info.text}>
              <span className="calendar-weekday-full" aria-hidden="true">{info.text}</span>
              <span className="calendar-weekday-short" aria-hidden="true">
                {info.text.slice(0, 3)}
              </span>
            </span>
          )}
          height="auto"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          buttonText={{ today: 'Today' }}
          events={loadEvents}
          loading={setLoading}
          eventSourceSuccess={() => {
            setError('')
          }}
          eventSourceFailure={() => {
            setError('Unable to load events. Click Refresh to try again.')
          }}
          dateClick={(info) => handleDayClick(info.dateStr)}
          eventClick={(info) => {
            setDeleteError('')
            setSelectedEvent(
              info.event.extendedProps.details as CalendarEvent,
            )
          }}
          eventContent={CalendarEventContent}
          eventInteractive
          dayMaxEvents={3}
          datesSet={handleDatesSet}
          dayCellClassNames={(info) =>
            livestreamDays.has(toDateString(info.date))
              ? ['livestream-day']
              : []
          }
          dayCellContent={(info) => (
            <span className="calendar-day-heading">
              <span className="calendar-date-number">{info.dayNumberText}</span>

              {livestreamDays.has(toDateString(info.date)) && (
                <span className="livestream-label">
                  <span aria-hidden="true">● </span>
                  Livestream
                </span>
              )}
            </span>
          )}
        />

        <div className="calendar-mascot" aria-hidden="true">
          {/* Frame the cat lineup without the surrounding transparent canvas. */}
          <svg viewBox="16 1141 1892 394" focusable="false">
            <image href={calendarCat} width="2048" height="1535" />
          </svg>
        </div>
      </div>

      {/* Streamers choose between adding an event and managing the marker. */}
      {!streamMode && signedIn && isStreamer && dayActionDate && (
        <Modal
          title={`Day options — ${dayActionDate}`}
          onClose={() => setDayActionDate(null)}
          busy={markerSaving}
        >
          <p>Choose what you would like to do on this day.</p>

          <div className="day-actions">
            <button
              type="button"
              disabled={markerSaving}
              onClick={() => {
                setSelectedDate(dayActionDate)
                setDayActionDate(null)
              }}
            >
              Add event
            </button>

            <button
              type="button"
              className="livestream-action"
              disabled={
                markerSaving ||
                livestreamLoading ||
                Boolean(livestreamLoadError)
              }
              onClick={() => {
                void handleLivestreamChange(
                  !livestreamDays.has(dayActionDate),
                )
              }}
            >
              {markerSaving
                ? 'Saving…'
                : livestreamLoading
                  ? 'Loading marker…'
                  : livestreamLoadError
                    ? 'Livestream marker unavailable'
                    : livestreamDays.has(dayActionDate)
                      ? 'Remove livestream marker'
                      : 'Mark as livestream day'}
            </button>
          </div>

          {livestreamLoadError && (
            <p role="alert" className="error-message">
              Close this dialog and refresh the calendar before changing markers.
            </p>
          )}

          {markerError && (
            <p role="alert" className="error-message">
              {markerError}
            </p>
          )}
        </Modal>
      )}

      {!streamMode && selectedDate && (
        signedIn ? (
          <EventFormModal
            key={`create-${selectedDate}`}
            initialDate={selectedDate}
            onClose={() => setSelectedDate(null)}
            onSaved={handleSaved}
          />
        ) : (
          <Modal
            title="Sign in to add an event"
            onClose={() => setSelectedDate(null)}
            busy={authBusy}
          >
            <p>You can browse the calendar without an account.</p>
            <p>Sign in with Twitch to add your own event.</p>

            <button
              type="button"
              disabled={authBusy}
              onClick={() => void onSignIn()}
            >
              {authBusy ? 'Redirecting…' : 'Sign in with Twitch'}
            </button>
          </Modal>
        )
      )}

      {!streamMode && signedIn && editingEvent && (
        <EventFormModal
          key={`edit-${editingEvent.id}`}
          initialDate={editingEvent.event_date}
          eventToEdit={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={handleSaved}
        />
      )}

      {selectedEvent && (
        <Modal
          title={selectedEvent.event_type_label}
          onClose={() => setSelectedEvent(null)}
          busy={deleting}
        >
          <dl className="event-details">
            <dt>Date</dt>
            <dd>{selectedEvent.event_date}</dd>

            <dt>Shared by</dt>
            <dd>
              {streamMode && !selectedEvent.show_nickname
                ? 'Anonymous'
                : selectedEvent.author_nickname ?? 'Anonymous'}
            </dd>

            {!streamMode && selectedEvent.status === 'hidden' && (
              <>
                <dt>Status</dt>
                <dd>Hidden</dd>
              </>
            )}

            {isStreamer && !streamMode && (
              <>
                <dt>Nickname visibility</dt>
                <dd>
                  {selectedEvent.show_nickname
                    ? 'Visible to viewers'
                    : 'Hidden from viewers'}
                </dd>
              </>
            )}

            {!streamMode && selectedEvent.private_description !== null && (
              <>
                <dt>Private description</dt>
                <dd className="private-description">
                  {selectedEvent.private_description}
                </dd>
              </>
            )}
          </dl>

          {!streamMode && deleteError && (
            <p role="alert" className="error-message">
              {deleteError}
            </p>
          )}

          {!streamMode &&
            signedIn &&
            (isStreamer || selectedEvent.is_owner) && (
              <footer className="modal-actions">
                {selectedEvent.is_owner && (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={openEditModal}
                  >
                    Edit event
                  </button>
                )}

                <button
                  type="button"
                  className="danger-button"
                  disabled={deleting}
                  onClick={() => void handleDeleteEvent()}
                >
                  {deleting ? 'Deleting…' : 'Delete event'}
                </button>
              </footer>
            )}
        </Modal>
      )}
    </section>
  )
}
