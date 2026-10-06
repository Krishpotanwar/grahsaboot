import { useCallback, useEffect, useRef, useState } from 'react'
import { InvestigationError, type Investigation } from './investigation.ts'
import { getStore } from './store.ts'

export function useInvestigation(id: string): {
  inv: Investigation | null | undefined
  update: (fn: (i: Investigation) => Investigation) => boolean
  error: string | null
} {
  const [inv, setInv] = useState<Investigation | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  // The latest investigation, read synchronously by `update`. React state is for rendering only.
  const latest = useRef<Investigation | null>(null)
  useEffect(() => {
    let live = true
    latest.current = null
    setInv(undefined)
    setError(null)
    getStore()
      .get(id)
      .then(
        (v) => {
          if (!live) return
          latest.current = v ?? null
          setInv(v ?? null)
        },
        () => {
          if (!live) return
          setInv(null)
          setError('STORE_FAILED')
        },
      )
    return () => {
      live = false
    }
  }, [id])
  const update = useCallback((fn: (i: Investigation) => Investigation): boolean => {
    const prev = latest.current
    if (!prev) return false
    let next: Investigation
    try {
      next = fn(prev)
    } catch (e) {
      if (e instanceof InvestigationError) {
        setError(e.message)
        return false
      }
      throw e
    }
    setError(null)
    if (next === prev) return true
    latest.current = next
    setInv(next)
    getStore()
      .put(next)
      .catch(() => setError('SAVE_FAILED'))
    return true
  }, [])
  return { inv, update, error }
}
