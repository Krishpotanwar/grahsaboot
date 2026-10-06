import { useId, useRef, useState, type FormEvent } from 'react'
import { parseCoordinates } from '../geo/coords.ts'
import { nominatim, type Place } from '../search/nominatim.ts'
import { copy } from './copy.ts'
import { Button } from './kit.tsx'

type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'results'; places: Place[] }
  | { kind: 'swapped'; lat: number; lon: number }
  | { kind: 'error' }

const point = (lat: number, lon: number): Place => ({
  name: copy.search.coordsResult(lat, lon),
  lat,
  lon,
  bbox: null,
})

export function SearchBox({ onSelect }: { onSelect(place: Place): void }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const ac = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const pick = (p: Place) => {
    setState({ kind: 'idle' })
    onSelect(p)
    // The result or fix button that was just pressed unmounts; without this focus falls to <body> (WCAG 2.4.3).
    input.current?.focus()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (state.kind === 'busy') return
    const c = parseCoordinates(q)
    if (c)
      return c.swappedHint ? setState({ kind: 'swapped', lat: c.lat, lon: c.lon }) : pick(point(c.lat, c.lon))
    ac.current?.abort()
    ac.current = new AbortController()
    setState({ kind: 'busy' })
    try {
      setState({ kind: 'results', places: await nominatim.search(q, ac.current.signal) })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setState({ kind: 'error' })
    }
  }

  return (
    <div className="grid gap-3">
      <form onSubmit={submit} className="grid gap-2" role="search">
        <label htmlFor={id} className="font-mono text-xs uppercase tracking-[0.14em] text-fg-2">
          {copy.search.label}
        </label>
        {/* The button is laid over the input's right edge; pr-24 keeps typed text clear of it. 16 px text: iOS Safari zooms the page on focus below that. */}
        <div className="relative">
          <input
            ref={input}
            id={id}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={copy.search.placeholder}
            autoComplete="off"
            inputMode="search"
            className="h-[52px] w-full text-ellipsis rounded-[6px] border border-control bg-bg pl-4 pr-24 font-mono text-base text-fg placeholder:text-fg-2 focus:border-accent"
          />
          {/* aria-disabled, not disabled: a disabled button that has focus drops it to <body>. submit() ignores the press while busy. */}
          <Button
            type="submit"
            variant="primary"
            aria-disabled={state.kind === 'busy'}
            className="absolute right-1 top-1 aria-disabled:opacity-40"
          >
            {copy.search.submit}
          </Button>
        </div>
      </form>
      <div aria-live="polite">
        {state.kind === 'results' && state.places.length === 0 && (
          <p className="text-sm text-fg-2">{copy.search.none}</p>
        )}
        {state.kind === 'results' && state.places.length > 0 && (
          <ul aria-label={copy.search.results} className="grid gap-px border border-line bg-line">
            {state.places.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  className="w-full bg-bg px-3 py-3 text-left hover:bg-panel"
                  onClick={() => pick(p)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {state.kind === 'swapped' && (
          <div className="grid gap-2 text-sm">
            <p className="text-warn">{copy.search.swapped(state.lat, state.lon)}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => pick(point(state.lon, state.lat))}>{copy.search.useSwapped}</Button>
              <Button onClick={() => pick(point(state.lat, state.lon))}>{copy.search.useAsTyped}</Button>
            </div>
          </div>
        )}
        {state.kind === 'error' && <p className="text-sm text-bad">{copy.search.failed}</p>}
        <p className="mt-2 text-xs text-fg-2">{copy.search.attribution}</p>
      </div>
    </div>
  )
}
