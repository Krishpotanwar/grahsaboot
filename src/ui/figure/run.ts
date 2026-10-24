/** What a figure hands the page once it is drawn: `set` moves its one slider number, `destroy` leaves its svg empty and nothing running. */
export interface FigureHandle {
  set(value: number): void
  destroy(): void
}

/** What a figure is given: its host, its svg, and a read-out it may write to. Nothing here shows the read-out. */
export interface FigureEnv {
  stage: Element
  svg: SVGSVGElement
  read: { textContent: string | null }
}

export interface FigureDef {
  name: string
  /** The slider's number at 0, 0.5 and 1; the page has no slider, so a figure is started at the middle one. */
  range: readonly [number, number, number]
  mount(env: FigureEnv, value: number): FigureHandle
}

/** A still drawing where no engine is wanted (tier 0) and for a person who asked for less motion; the live figure otherwise. */
export const figureMode = ({ engine, reduced }: { engine: boolean; reduced: boolean }): 'still' | 'live' =>
  engine && !reduced ? 'live' : 'still'

/**
 * Starts a figure on `svg` once `load` has brought it, and returns the function that ends it. A page that goes first is never
 * given a figure afterwards. The still drawing stays until the figure is there to replace it, and stays for good when it is not.
 */
export function runFigure({
  stage,
  svg,
  load,
  onLive,
  onError,
}: {
  stage: Element
  svg: SVGSVGElement
  load: () => Promise<FigureDef>
  onLive?: () => void
  onError: (e: unknown) => void
}): () => void {
  let gone = false
  let live: FigureHandle | null = null
  load()
    .then((def) => {
      if (gone) return
      svg.replaceChildren() // the figure draws the same pose the still drawing shows
      live = def.mount({ stage, svg, read: { textContent: '' } }, def.range[1])
      onLive?.()
    })
    .catch((e: unknown) => {
      if (!gone) onError(e)
    })
  return () => {
    gone = true
    live?.destroy()
    live = null
  }
}
