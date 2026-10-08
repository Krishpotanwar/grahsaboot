import { useEffect, useState } from 'react'

/** `value` once it has stayed the same for `ms`; a value that changes again inside that time is never returned. */
export function useRested<T>(value: T, ms: number): T {
  const [rested, setRested] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setRested(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return rested
}
