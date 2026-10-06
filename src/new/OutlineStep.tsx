import { useEffect, useState, type FormEvent } from 'react'
import { parseCoordinates, type ParsedCoords } from '../geo/coords.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { startDrawing } from '../map/draw.ts'
import { useMapStage } from '../map/MapStage.tsx'
import { copy, issueMessage } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, TextField } from '../ui/kit.tsx'
import { draftToAoi } from './draft.ts'
import { squareAround } from '../geo/square.ts'
import type { StepProps } from './PlaceStep.tsx'

export function OutlineStep({ draft, setDraft, onBack, onNext }: StepProps) {
  const { map, tier } = useMapStage()
  const [round, setRound] = useState(0)
  const aoi = draftToAoi(draft)
  const result = aoi ? summarizeAoi(aoi) : null

  useEffect(() => {
    if (!map || tier === 0) return
    let session: { stop(): void } | null = null
    // Restarts after a theme switch too: a new style drops the draw layers.
    const begin = () => {
      session?.stop()
      session = startDrawing(map, draft.kind, (coords) =>
        setDraft((d) => (d.kind === 'site' ? { ...d, ring: coords } : { ...d, line: coords })),
      )
    }
    // getStyle() is set as soon as the style JSON is in; isStyleLoaded() also waits for tiles, and a draw session asked for during a fly-to would never start.
    if (map.getStyle()) begin()
    map.on('style.load', begin)
    return () => {
      map.off('style.load', begin)
      session?.stop()
    }
  }, [map, tier, draft.kind, round, setDraft])

  const setKind = (kind: 'site' | 'road') => setDraft((d) => ({ ...d, kind, ring: null, line: null }))

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.outline.title}</h1>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{flow.outline.kindLegend}</legend>
        {(['site', 'road'] as const).map((k) => (
          <label
            key={k}
            className="flex min-h-11 cursor-pointer items-start gap-3 border border-line p-3 has-[:checked]:border-accent"
          >
            <input
              type="radio"
              name="kind"
              value={k}
              checked={draft.kind === k}
              onChange={() => setKind(k)}
              className="mt-1 accent-[var(--gs-accent)]"
            />
            <span>
              <span className="block font-medium">
                {k === 'site' ? flow.outline.site : flow.outline.road}
              </span>
              <span className="block text-sm text-fg-2">
                {k === 'site' ? flow.outline.siteHelp : flow.outline.roadHelp}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {draft.kind === 'road' && (
        <TextField
          label={flow.outline.width}
          help={flow.outline.widthHelp}
          type="number"
          inputMode="numeric"
          min={5}
          max={200}
          step={1}
          value={String(draft.widthM)}
          onChange={(e) => {
            const widthM = Number(e.target.value)
            setDraft((d) => ({ ...d, widthM }))
          }}
        />
      )}
      {tier > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
          <p>{draft.kind === 'site' ? flow.outline.drawSite : flow.outline.drawRoad}</p>
          <Button
            size="sm"
            onClick={() => {
              setDraft((d) => ({ ...d, ring: null, line: null }))
              setRound((r) => r + 1)
            }}
          >
            {flow.outline.redraw}
          </Button>
        </div>
      )}
      <details open={tier === 0} className="border border-line p-3">
        {/* -m-3 p-3: the whole 48 px band is the touch target (44 px minimum), laid out exactly as a bare 24 px summary. */}
        <summary className="-m-3 cursor-pointer p-3 font-medium">{flow.outline.byCoords}</summary>
        <div className="mt-4">
          {draft.kind === 'site' ? (
            <SquareForm draft={draft} setDraft={setDraft} />
          ) : (
            <LineForm setDraft={setDraft} />
          )}
        </div>
      </details>
      <div aria-live="polite" className="text-sm">
        {!result && <p className="text-fg-2">{flow.outline.none}</p>}
        {result?.ok && (
          <p className="font-mono num">
            {result.summary.kind === 'site'
              ? flow.outline.summarySite(result.summary.areaKm2, result.summary.extentKm)
              : flow.outline.summaryRoad(result.summary.lengthKm ?? 0, result.summary.parts.length)}
          </p>
        )}
        {result && !result.ok && (
          // role="alert" on the <ul> itself would replace its list role and fail axe's listitem rule, so the alert wraps it.
          <div role="alert">
            <ul className="grid gap-1 text-bad">
              {result.issues.map((i) => (
                <li key={i.code}>{issueMessage(i)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex justify-between">
        <Button onClick={onBack}>{copy.common.back}</Button>
        <Button variant="primary" disabled={!result?.ok} onClick={onNext}>
          {copy.common.next}
        </Button>
      </div>
    </div>
  )
}

// A pair that looks reversed (lat 68-90, lon 6-37) is a question, never a silent fix: nothing is applied until one of the two buttons is pressed.
type How = 'swapped' | 'typed'
const resolve = (c: ParsedCoords, how?: How) =>
  how === 'swapped' && c.swappedHint ? { lat: c.lon, lon: c.lat } : { lat: c.lat, lon: c.lon }
const asText = (c: { lat: number; lon: number }) => `${c.lat}, ${c.lon}`

function SwappedQuestion({ at, onAnswer }: { at: ParsedCoords; onAnswer(how: How): void }) {
  return (
    <div role="status" className="grid gap-2 text-sm">
      <p className="text-warn">{copy.search.swapped(at.lat, at.lon)}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onAnswer('swapped')}>{copy.search.useSwapped}</Button>
        <Button onClick={() => onAnswer('typed')}>{copy.search.useAsTyped}</Button>
      </div>
    </div>
  )
}

function SquareForm({ draft, setDraft }: Pick<StepProps, 'draft' | 'setDraft'>) {
  const [centre, setCentre] = useState(
    draft.place ? `${draft.place.lat.toFixed(6)}, ${draft.place.lon.toFixed(6)}` : '',
  )
  const [side, setSide] = useState('500')
  const [err, setErr] = useState<string | null>(null)
  const [asked, setAsked] = useState<ParsedCoords | null>(null)
  const submit = (how?: How) => {
    const c = parseCoordinates(centre)
    const s = Number(side)
    if (!c) return setErr(flow.outline.badPoint)
    if (!(s >= 100 && s <= 3000)) return setErr(flow.outline.sideHelp)
    setErr(null)
    if (c.swappedHint && !how) return setAsked(c)
    setAsked(null)
    const at = resolve(c, how)
    if (how === 'swapped') setCentre(asText(at))
    setDraft((d) => ({ ...d, ring: squareAround(at.lon, at.lat, s) }))
  }
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        submit()
      }}
      className="grid gap-4"
    >
      <TextField
        label={flow.outline.centre}
        value={centre}
        onChange={(e) => {
          setCentre(e.target.value)
          setAsked(null)
        }}
        error={err === flow.outline.badPoint ? err : null}
      />
      <TextField
        label={flow.outline.side}
        help={flow.outline.sideHelp}
        type="number"
        inputMode="numeric"
        value={side}
        onChange={(e) => setSide(e.target.value)}
        error={err === flow.outline.sideHelp ? err : null}
      />
      {asked && <SwappedQuestion at={asked} onAnswer={submit} />}
      <Button type="submit">{flow.outline.useSquare}</Button>
    </form>
  )
}

function LineForm({ setDraft }: Pick<StepProps, 'setDraft'>) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [asked, setAsked] = useState<ParsedCoords | null>(null)
  const submit = (how?: How) => {
    const p = parseCoordinates(a),
      q = parseCoordinates(b)
    if (!p || !q) return setErr(flow.outline.badPoint)
    setErr(null)
    const hinted = p.swappedHint ? p : q.swappedHint ? q : null
    if (hinted && !how) return setAsked(hinted)
    setAsked(null)
    const from = resolve(p, how),
      to = resolve(q, how)
    if (how === 'swapped') {
      if (p.swappedHint) setA(asText(from))
      if (q.swappedHint) setB(asText(to))
    }
    setDraft((d) => ({
      ...d,
      line: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    }))
  }
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        submit()
      }}
      className="grid gap-4"
    >
      <TextField
        label={flow.outline.start}
        value={a}
        onChange={(e) => {
          setA(e.target.value)
          setAsked(null)
        }}
      />
      <TextField
        label={flow.outline.end}
        value={b}
        onChange={(e) => {
          setB(e.target.value)
          setAsked(null)
        }}
        error={err}
      />
      {asked && <SwappedQuestion at={asked} onAnswer={submit} />}
      <Button type="submit">{flow.outline.useLine}</Button>
    </form>
  )
}
