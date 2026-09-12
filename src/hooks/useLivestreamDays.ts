import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type DateRange = {
  start: string
  end: string
}

export function useLivestreamDays() {
  const [range, setRange] = useState<DateRange | null>(null)
  const [days, setDays] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  const start = range?.start
  const end = range?.end

  const setDateRange = useCallback((nextStart: string, nextEnd: string) => {
    setRange((current) => {
      if (current?.start === nextStart && current.end === nextEnd) {
        return current
      }

      return { start: nextStart, end: nextEnd }
    })
  }, [])

  const refresh = useCallback(() => {
    setRevision((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!start || !end) return

    let active = true

    async function loadDays() {
      setLoading(true)
      setError('')

      try {
        const { data, error } = await supabase.rpc('get_livestream_days', {
          p_start_date: start,
          p_end_date: end,
        })

        if (error) throw error

        if (active) {
          const rows = (data ?? []) as { stream_date: string }[]
          setDays(new Set(rows.map((row) => row.stream_date)))
        }
      } catch {
        if (active) {
          setDays(new Set())
          setError('Unable to load livestream markers. Click Refresh to retry.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDays()

    return () => {
      active = false
    }
  }, [start, end, revision])

  return {
    days,
    loading,
    error,
    setDateRange,
    refresh,
  }
}