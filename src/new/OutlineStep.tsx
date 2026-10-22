import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { config } from '../config.ts'
import { parseCoordinates, type ParsedCoords } from '../geo/coords.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import { fitAoi } from '../map/aoiLayer.ts'
import { MIN_CORNERS, startDrawing, type DrawSession } from '../map/draw.ts'
import { useMapStage } from '../map/MapStage.tsx'
import { copy, issueMessage } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button, TextField } from '../ui/kit.tsx'
import { LookCloser } from '../ui/LookCloser.tsx'
import { Optional } from '../ui/Optional.tsx'
import { LazyContextToggle } from './contextGate.ts'
import { draftToAoi, type Draft } from './draft.ts'
import { sizeNote } from './sizeNote.ts'
import { squareAround } from '../geo/square.ts'
import type { StepProps } from './PlaceStep.tsx'

export function OutlineStep({ draft, setDraft, onBack, onNext }: StepProps) {
  const { map, tier, mapReady, mapFailed } = useMapStage()
  const [round, setRound] = useState(0)
  // The corners placed so far, and the session that can take one back or finish the outline from them.
  const [corners, setCorners] = useState(0)
  const session = useRef<DrawSession | null>(null)
  const aoi = draftToAoi(draft)
  const result = aoi ? summarizeAoi(aoi) : null

  useEffect(() => {
    if (!map || tier === 0) return
    // Restarts after a theme switch too: a new style drops the draw layers.
    const begin = () => {
      session.current?.stop()
      setCorners(0)
      session.current = startDrawing(
        map,
        draft.kind,
        (coords) => setDraft((d) => (d.kind === 'site' ? { ...d, ring: coords } : { ...d, line: coords })),
        setCorners,
      )
    }
    // getStyle() is set as soon as the style JSON is in; isStyleLoaded() also waits for tiles, and a draw session asked for during a fly-to would never start.
    if (map.getStyle()) begin()
    map.on('style.load', begin)
    return () => {
      map.off('style.load', begin)
      session.current?.stop()
      session.current = null
      setCorners(0)
    }
  }, [map, tier, draft.kind, round, setDraft])

  const setKind = (kind: 'site' | 'road') => setDraft((d) => ({ ...d, kind, ring: null, line: null }))
  // A form makes its outline without a click on the map, so show where it went (a drawn outline is already under the cursor).
  const setByForm = (outline: Pick<Draft, 'ring'> | Pick<Draft, 'line'>) => {
    setDraft((d) => ({ ...d, ...outline }))
    const made = draftToAoi({ ...draft, ...outline })
    const r = made && summarizeAoi(made)
    if (map && r?.ok) fitAoi(map, r.summary.bbox, matchMedia('(prefers-reduced-motion: reduce)').matches)
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.outline.title}</h1>
      {/* One line, kept even when empty so nothing below it moves: the map failed > the map is loading. */}
      {tier > 0 && (
        <p
          role={mapFailed ? 'alert' : 'status'}
          className={`-mt-3 min-h-5 text-sm ${mapFailed ? 'text-bad' : 'text-fg-2'}`}
        >
          {mapFailed ? flow.outline.mapFailed : !mapReady ? flow.outline.mapLoading : ''}
        </p>
      )}
      {config.contextImagery && LazyContextToggle && tier > 0 && !mapFailed && (
        // Directly under the title and the map's line, never over the map. Its room is kept whatever the state says, so nothing
        // below it ever moves: the tallest state is a cloudy, old photo with the zoom-in sentence, and how tall that is depends on the
        // width of THIS column (not the screen's: it is 380 px at 1024 px and 975 px at 1023). Measured: 214, 194, 174, 154 and 134 px
        // from the narrowest column up (the first is a column under 291 px, a 320 px screen); tests/e2e/context-view.spec.ts holds
        // every state to it and pins each band. The bands are in rem and the column in px, so text enlarged past about 125 % can still
        // move the form in that tallest state. A new place starts the toggle afresh.
        <div className="@container">
          <div className="min-h-[13.5rem] @[18.25rem]:min-h-[12.25rem] @[24rem]:min-h-[10.9rem] @[31rem]:min-h-[9.7rem] @[61rem]:min-h-[8.4rem]">
            {/* Code that cannot be loaded leaves the step as it was, not blank. */}
            <Optional>
              <Suspense fallback={null}>
                <LazyContextToggle key={draft.place ? `${draft.place.lat},${draft.place.lon}` : ''} />
              </Suspense>
            </Optional>
          </div>
        </div>
      )}
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
      {tier > 0 && !mapFailed && (
        <div className="grid gap-3 text-sm text-fg-2">
          <p>{draft.kind === 'site' ? flow.outline.drawSite : flow.outline.drawRoad}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={corners === 0} onClick={() => session.current?.undo()}>
              {flow.outline.undo}
            </Button>
            <Button disabled={corners < MIN_CORNERS[draft.kind]} onClick={() => session.current?.finish()}>
              {flow.outline.finish}
            </Button>
            <Button
              onClick={() => {
                setDraft((d) => ({ ...d, ring: null, line: null }))
                setRound((r) => r + 1)
              }}
            >
              {flow.outline.redraw}
            </Button>
          </div>
        </div>
      )}
      <details open={tier === 0 || mapFailed} className="border border-line p-3">
        {/* -m-3 p-3: the whole 48 px band is the touch target (44 px minimum), laid out exactly as a bare 24 px summary. */}
        <summary className="-m-3 cursor-pointer p-3 font-medium">{flow.outline.byCoords}</summary>
        <div className="mt-4">
          {draft.kind === 'site' ? (
            <SquareForm draft={draft} onOutline={setByForm} />
          ) : (
            <LineForm onOutline={setByForm} />
          )}
        </div>
      </details>
      <div aria-live="polite" className="text-sm">
        {!result && <p className="text-fg-2">{flow.outline.none}</p>}
        {result?.ok && (
          <>
            <p className="font-mono num">
              {result.summary.kind === 'site'
                ? flow.outline.summarySite(result.summary.areaKm2, result.summary.extentKm)
                : flow.outline.summaryRoad(result.summary.lengthKm ?? 0, result.summary.parts.length)}
            </p>
            {/* What 10 m can show of it: said, never a block. An outline the rules refuse gets that message instead. */}
            <SizeLine note={sizeNote(result.summary, draft.widthM)} />
          </>
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
      {/* Once there is an outline to look at from the ground: outside the live region above, so it is not read out when it appears. */}
      {result?.ok && <LookCloser bbox={result.summary.bbox} className="border border-line p-3" />}
      <div className="flex justify-between">
        <Button onClick={onBack}>{copy.common.back}</Button>
        <Button variant="primary" disabled={!result?.ok} onClick={onNext}>
          {copy.common.next}
        </Button>
      </div>
    </div>
  )
}

function SizeLine({ note }: { note: ReturnType<typeof sizeNote> }) {
  return <p className={`mt-1 ${note.willShow ? 'text-fg-2' : 'text-warn'}`}>{note.text}</p>
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

type FormProps = { onOutline(outline: Pick<Draft, 'ring'> | Pick<Draft, 'line'>): void }

function SquareForm({ draft, onOutline }: FormProps & Pick<StepProps, 'draft'>) {
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
    onOutline({ ring: squareAround(at.lon, at.lat, s) })
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

function LineForm({ onOutline }: FormProps) {
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
    onOutline({
      line: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    })
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
