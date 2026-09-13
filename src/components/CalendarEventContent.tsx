import type { EventContentArg } from '@fullcalendar/core'
import birthdayCat from '../assets/presets/birthday-cat.png'
import achievementCat from '../assets/presets/achievement-cat.png'

const artwork: Record<string, { src: string; viewBox: string }> = {
  birthday: { src: birthdayCat, viewBox: '1183 503 83 72' },
  achievement: { src: achievementCat, viewBox: '1183 501 78 74' },
}

export function CalendarEventContent({ event }: EventContentArg) {
  const typeCode = event.extendedProps.details?.event_type_code as string | undefined
  const icon = typeCode ? artwork[typeCode] : undefined

  if (!icon) return <span className="fc-event-title">{event.title}</span>

  return (
    <span className="calendar-preset" title={event.title}>
      {/* Frame the original PNG without its surrounding transparent canvas. */}
      <svg className="calendar-preset-cat" viewBox={icon.viewBox} aria-hidden="true" focusable="false">
        <image href={icon.src} width="2048" height="1535" />
      </svg>
      <span className="calendar-preset-text">
        <span className="calendar-preset-title">
          {event.extendedProps.details?.status === 'hidden' && '[Hidden] '}
          {event.extendedProps.details?.event_type_label}
        </span>

        {event.extendedProps.details?.author_nickname && (
          <span className="calendar-preset-nickname">
            {event.extendedProps.details.author_nickname}
          </span>
        )}
      </span>
    </span>
  )
}
