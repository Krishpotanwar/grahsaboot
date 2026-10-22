import { useEffect, useRef } from 'react'

// The "Sharper" viewing aid (EvidenceViewer.tsx): this class puts the filter that `SharperFilter` defines on a canvas. It is
// written out whole because Tailwind finds a class by reading the source; a test keeps its id and the filter's the same. There is
// no `image-rendering: pixelated` in it on purpose: the display grid is 3 to 4 times the 10 m pixels, so crisp squares would be
// 2 to 3 m stair-steps on a blur: they look like pixels and are not.
const SHARPER = '[filter:url(#gs-sharper)]'

export function FrameCanvas({
  rgba,
  width,
  height,
  label,
  className = 'h-auto w-full',
  sharper = false,
}: {
  rgba: Uint8ClampedArray
  width: number
  height: number
  label: string
  className?: string
  /** The viewing aid: the filter of `SharperFilter` over the picture. Display only, the pixels are not touched. */
  sharper?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = width
    c.height = height
    c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  }, [rgba, width, height])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className={`block ${className}${sharper ? ` ${SHARPER}` : ''}`}
    />
  )
}

// One stretch for every photo, so a before and an after stay comparable (never fitted to a picture): a little more contrast, pivoting
// near mid-grey (at 0.45), so it leaves the average tone where it was. It saturates only the tones at or above 0.95 (242 of 255)
// and at or below 0.041 (10 of 255). On the worked example (the Navi Mumbai airport photos, 512, 768 and 1024 px grids, pixel
// ratios 1 to 3) at most 0.74% of the picture's pixels end up with a channel at 0 or 255 with the aid on, against 0.05 to 0.08%
// without it. The line this replaced (1.2 x - 0.03) saturated everything from 0.858 up: 1.9% of the pixels, the bright roofs, sand
// and concrete merging into white. The numbers are pinned in FrameCanvas.test.ts: change one and the clipping, the edges and the
// gain have to be measured again.
const STRETCH = { type: 'linear', slope: 1.1, intercept: -0.045 } as const

// Where the unsharp mask counts, by how much of the blur's neighbourhood is picture (the blur's own opacity, w): not at all up to
// 0.95, in full at 1, in a straight line between. 21 knots 0.05 apart, so 20 zeros and a one.
const INSIDE = `${'0 '.repeat(20)}1`

/**
 * The filter that `sharper` canvases point at, hidden: render it once while any of them is on screen. An unsharp mask (the
 * picture plus 0.7 of what it has over its own blur of 1.1 CSS px: the two weights add up to 1, so the average brightness is
 * kept), then the stretch. It is in CSS pixels, so a phone and a laptop see the same thing. It happens as the browser draws the
 * canvas: no pixel of a stored, hashed or reported picture is touched.
 *
 * The mask counts only where the blur saw nothing but picture. Beside a transparent neighbour (the outside of the canvas, a no-data
 * hole) a premultiplied blur counts the neighbour as black, and the mix lifted the outermost pixels by up to 57 of 255 levels, over
 * their first four device pixels (measured at pixel ratio 2). The mask is the blur's own opacity read through `INSIDE`, so at an
 * edge it is zero and the bare picture shows; the sharpened picture is mixed over it. Measured, no edge moves by more than 2. (Filling
 * the holes before the blur, with a dilate, did the same and cost 4 to 10 times as much where there is no GPU.)
 */
export function SharperFilter() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
      <filter id="gs-sharper" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" result="soft" />
        <feComposite in="SourceGraphic" in2="soft" operator="arithmetic" k2="1.7" k3="-0.7" result="sharp" />
        <feComponentTransfer in="soft" result="inside">
          <feFuncA type="table" tableValues={INSIDE} />
        </feComponentTransfer>
        <feComposite in="sharp" in2="inside" operator="in" result="sharpInside" />
        <feComposite in="sharpInside" in2="SourceGraphic" operator="over" />
        <feComponentTransfer>
          <feFuncR {...STRETCH} />
          <feFuncG {...STRETCH} />
          <feFuncB {...STRETCH} />
        </feComponentTransfer>
      </filter>
    </svg>
  )
}
