import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { fmtDate } from '../lib/format.ts'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { explore } from '../ui/copy-explore.ts'
import { Button } from '../ui/kit.tsx'
import { FrameCanvas } from '../workbench/FrameCanvas.tsx'
import type { TimeLapseFrame } from './load.ts'
import { canPlay, keyAction, PACE_MS, stepIndex, type Step } from './playback.ts'

/** A frame with the year of its slot. A list of them is oldest year first. */
export interface YearFrame {
  year: number
  frame: TimeLapseFrame
}

/**
 * The player: ONE surface, a plain canvas on every device, so the pictures need no map and no 3D graphics. It shows the year, the
 * date and the satellite, plays a loop at a pace to look at (and not at all for a person who asked for less motion, who steps),
 * and speaks (polite) on a step, a pause and a load, never on a frame of a loop that is playing. Frames that arrive while it is on
 * join it. The pictures are display only: nothing here keeps, hashes or reports one.
 */
export function Player({
  frames,
  width,
  height,
  name,
  done,
  say,
  strip,
}: {
  /** At least one, oldest year first. */
  frames: readonly YearFrame[]
  /** The display grid every frame is drawn on. */
  width: number
  height: number
  name: string
  /** The load has ended: a loop that can play starts by itself, once. */
  done: boolean
  say: (text: string) => void
  /** The year strip, given the year on show. */
  strip: (current: number) => ReactNode
}) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const play = canPlay(frames.length, reduced)
  // The year on show is the cursor, not an index, so a frame that arrives before it does not change the picture under the eye.
  const [at, setAt] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const hint = useId()
  const found = frames.findIndex((f) => f.year === at)
  const i = found >= 0 ? found : frames.length - 1 // until a choice is made: the newest
  const shown = frames[i]!
  const describe = (k: number) =>
    explore.frameStatus(k + 1, frames.length, fmtDate(frames[k]!.frame.date), frames[k]!.frame.clearPct)

  // The loop: one frame every PACE_MS while playing, round to the first after the last.
  useEffect(() => {
    if (!playing || !play) return
    const t = setInterval(
      () =>
        setAt((a) => {
          const k = frames.findIndex((f) => f.year === a)
          return frames[stepIndex(k < 0 ? frames.length - 1 : k, frames.length, 'next')]!.year
        }),
      PACE_MS,
    )
    return () => clearInterval(t)
  }, [playing, play, frames])

  // Once the load has ended, a loop that can play starts at the oldest year. Never under reduced motion.
  const began = useRef(false)
  useEffect(() => {
    if (!done) began.current = false
    else if (play && !began.current) {
      began.current = true
      setAt(frames[0]!.year)
      setPlaying(true)
    }
  }, [done, play, frames])

  // A hidden tab pauses; so does a change to reduced motion while it plays.
  useEffect(() => {
    const hide = () => document.hidden && setPlaying(false)
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])
  useEffect(() => {
    if (!play) setPlaying(false)
  }, [play])

  const go = (to: Step | number) => {
    const k = typeof to === 'number' ? to : stepIndex(i, frames.length, to)
    setPlaying(false) // a person who steps has taken over
    setAt(frames[k]!.year)
    say(describe(k))
  }
  const toggle = () => {
    if (playing) {
      setPlaying(false)
      say(explore.paused(describe(i)))
    } else if (play) setPlaying(true)
  }
  // On the picture only, so a key typed anywhere else is the page's; a shortcut with a modifier (Alt+Left is Back) is the browser's.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const action = keyAction(e.key)
    if (!action || e.altKey || e.ctrlKey || e.metaKey) return
    if (action === 'toggle') {
      if (!play) return
      toggle()
    } else go(action)
    e.preventDefault()
  }

  return (
    <div className="grid gap-4">
      <div className="grid max-w-[40rem] gap-4">
        <div
          role="group"
          aria-label={explore.stageLabel}
          aria-describedby={hint}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="overflow-hidden rounded-[6px] border border-line bg-panel"
        >
          <FrameCanvas
            rgba={shown.frame.rgba}
            width={width}
            height={height}
            label={explore.pictureLabel(name, fmtDate(shown.frame.date))}
            className="h-auto w-full"
          />
        </div>
        <div className="grid gap-1">
          <p className="num text-[2rem] font-bold leading-none tracking-[-0.03em]">{shown.year}</p>
          <p className="text-sm text-fg-2">
            {explore.caption(fmtDate(shown.frame.date), shown.frame.sceneId, shown.frame.clearPct)}
          </p>
          {i === frames.length - 1 && shown.frame.ageDays > 75 && (
            <p className="text-sm text-fg-2">{explore.age(shown.frame.ageDays)}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {play && (
            <Button variant="primary" onClick={toggle}>
              {playing ? explore.pause : explore.play}
            </Button>
          )}
          <Button onClick={() => go('prev')} disabled={frames.length < 2}>
            {explore.previous}
          </Button>
          <Button onClick={() => go('next')} disabled={frames.length < 2}>
            {explore.next}
          </Button>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={i}
            disabled={frames.length < 2}
            aria-label={explore.slider}
            aria-valuetext={`${shown.year}, ${fmtDate(shown.frame.date)}`}
            // A slider that has focus is read out as its value changes: the loop stops for it, as it does for a step.
            onFocus={() => setPlaying(false)}
            onChange={(e) => go(Number(e.currentTarget.value))}
            className="h-11 min-w-40 flex-1 cursor-pointer accent-accent disabled:cursor-default disabled:opacity-40"
          />
        </div>
      </div>
      {strip(shown.year)}
      <p id={hint} className="text-sm text-fg-2 pointer-coarse:hidden">
        {play ? explore.keysHint : explore.keysHintStill}
      </p>
    </div>
  )
}
