import { useLayoutEffect, useRef } from 'react'
import kernelUrl from '../../lib/hairline/kernel.js?url'
import { useMediaQuery } from '../../lib/useMediaQuery.ts'
import { useMapStage } from '../../map/MapStage.tsx'
import './figure.css'
import { figureMode, runFigure, type FigureDef } from './run.ts'
import { STILL } from './still.ts'

let kernel: Promise<void> | null = null
/** The kernel is another author's script, kept as it came: it sets the global HL. It is fetched once, from our own origin, when a live figure first needs it. */
const loadKernel = () =>
  (kernel ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = kernelUrl
    s.onload = () => resolve()
    s.onerror = () => {
      kernel = null // a later figure may try again
      s.remove()
      reject(new Error('The figure engine did not load.'))
    }
    document.head.append(s)
  }))

/** The figure reads HL when its module is evaluated, so the kernel comes first. Both are lazy: nothing of this is in the first page. */
const loadPrints = async (): Promise<FigureDef> => {
  await loadKernel()
  return (await import('./prints.js')).default
}

/**
 * A hairline drawing of a tray of six prints, one for each year: a picture for the time-lapse's start screen and nothing more. It is
 * hidden from assistive technology, holds no words and takes no focus. At rest it is a still drawing; only the pointer moves it, and
 * only where the device can run the engine and the person has not asked for less motion (tier 0 and reduced motion keep the still
 * drawing, and fetch no engine at all).
 */
export function Figure({ className = '' }: { className?: string }) {
  const { tier } = useMapStage()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const mode = figureMode({ engine: tier > 0, reduced })
  const host = useRef<HTMLDivElement>(null)

  // Before the first paint, so the drawing is there with the page; the engine replaces it with the same pose when it arrives.
  useLayoutEffect(() => {
    const stage = host.current!
    const svg = stage.firstElementChild as SVGSVGElement
    const still = () => {
      svg.innerHTML = STILL
      stage.dataset.figure = 'still'
    }
    still()
    if (mode === 'still') return
    return runFigure({
      stage,
      svg,
      load: loadPrints,
      onLive: () => (stage.dataset.figure = 'live'),
      onError: (e) => {
        console.warn('The figure engine did not start; the still drawing stays.', e)
        still()
      },
    })
  }, [mode])

  return (
    <div ref={host} data-hairline="prints" aria-hidden="true" className={`no-print ${className}`}>
      <svg viewBox="0 0 400 320" aria-hidden="true" focusable="false" />
    </div>
  )
}
