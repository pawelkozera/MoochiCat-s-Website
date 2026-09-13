import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from './Modal'

type EventType = {
  code: string
  label: string
}

type EditableEvent = {
  id: string
  event_date: string
  event_type_code: string
  event_type_label: string
  private_description: string | null
  show_nickname: boolean
}

type EventFormModalProps = {
  initialDate: string
  eventToEdit?: EditableEvent
  onClose: () => void
  onSaved: () => void
}

export function EventFormModal({
  initialDate,
  eventToEdit,
  onClose,
  onSaved,
}: EventFormModalProps) {
  const isEditing = Boolean(eventToEdit)

  const [date, setDate] = useState(
    eventToEdit?.event_date ?? initialDate,
  )
  const [eventType, setEventType] = useState(
    eventToEdit?.event_type_code ?? '',
  )
  const [description, setDescription] = useState(
    eventToEdit?.private_description ?? '',
  )
  const [showNickname, setShowNickname] = useState(
    eventToEdit?.show_nickname ?? false,
  )

  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const existingTypeCode = eventToEdit?.event_type_code
  const existingTypeLabel = eventToEdit?.event_type_label

  useEffect(() => {
    let active = true

    async function loadTypes() {
      try {
        const { data, error } = await supabase
          .from('event_types')
          .select('code, label')
          .eq('is_active', true)
          .order('sort_order')

        if (error) throw error

        const types: EventType[] = [...(data ?? [])]

        // Allow keeping the event's existing inactive type.
        if (
          existingTypeCode &&
          !types.some((type) => type.code === existingTypeCode)
        ) {
          types.push({
            code: existingTypeCode,
            label: `${existingTypeLabel ?? existingTypeCode} (inactive)`,
          })
        }

        if (active) setEventTypes(types)
      } catch {
        if (active) {
          setLoadError(
            'Unable to load event types. Close this dialog and try again.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadTypes()

    return () => {
      active = false
    }
  }, [existingTypeCode, existingTypeLabel])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || loading || loadError) return

    setSaveError('')
    setSaving(true)

    const values = {
      p_event_date: date,
      p_event_type_code: eventType,
      p_private_description: description.trim() || null,
      p_show_nickname: showNickname,
    }

    try {
      const { error } = eventToEdit
        ? await supabase.rpc('update_event', {
            p_event_id: eventToEdit.id,
            ...values,
          })
        : await supabase.rpc('create_event', values)

      if (error) throw error
    } catch {
      setSaveError(
        'We could not confirm the save. Close this dialog and refresh the calendar before trying again.',
      )
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal
      variant="event-form"
      title={isEditing ? 'Edit event' : 'Add event'}
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={handleSubmit} className="event-form">
        <fieldset disabled={saving || loading || Boolean(loadError)}>
          <label htmlFor="event-date">Date</label>
          <input
            id="event-date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />

          <label htmlFor="event-type">Event type</label>
          <select
            id="event-type"
            required
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          >
            <option value="">
              {loading ? 'Loading event types…' : 'Select an event type'}
            </option>

            {eventTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.label}
              </option>
            ))}
          </select>

          <label htmlFor="event-description">Private description</label>
          <textarea
            id="event-description"
            rows={5}
            maxLength={2000}
            value={description}
            aria-describedby="description-help"
            placeholder="What would you like to share with the streamer?"
            onChange={(event) => setDescription(event.target.value)}
          />

          <small id="description-help">
            Only you and Lila can read this.
            {' '}{description.length}/2000
          </small>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showNickname}
              aria-describedby="nickname-help"
              onChange={(event) => setShowNickname(event.target.checked)}
            />
            Show my nickname
          </label>

          <small id="nickname-help">
            Only Lila can see your nickname
            when this is turned off.
          </small>
        </fieldset>

        {!loading && !loadError && eventTypes.length === 0 && (
          <p>No event types are available.</p>
        )}

        {(loadError || saveError) && (
          <p role="alert" className="error-message">
            {loadError || saveError}
          </p>
        )}

        <footer className="modal-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              saving ||
              loading ||
              Boolean(loadError) ||
              !eventType ||
              !date
            }
          >
            {saving
              ? 'Saving…'
              : isEditing
                ? 'Save changes'
                : 'Create event'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}