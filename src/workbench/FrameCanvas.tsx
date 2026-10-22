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

// One stretch for every photo, so a before and an after stay comparable (never fitted to a picture): a little more contrast,
// pivoting at 0.15 and not at mid-grey, because a land scene sits low in the range and a mid-grey pivot would darken most of it.
const STRETCH = { type: 'linear', slope: 1.2, intercept: -0.03 } as const

/**
 * The filter that `sharper` canvases point at, hidden: render it once while any of them is on screen. An unsharp mask (the
 * picture plus half of what it has over its own blur of 1.1 CSS px: the two weights add up to 1, so the average brightness is
 * kept), then the stretch. It is in CSS pixels, so a phone and a laptop see the same thing. It happens as the browser draws the
 * canvas: no pixel of a stored, hashed or reported picture is touched.
 */
export function SharperFilter() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
      <filter id="gs-sharper" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" result="soft" />
        <feComposite in="SourceGraphic" in2="soft" operator="arithmetic" k2="1.5" k3="-0.5" />
        <feComponentTransfer>
          <feFuncR {...STRETCH} />
          <feFuncG {...STRETCH} />
          <feFuncB {...STRETCH} />
        </feComponentTransfer>
      </filter>
    </svg>
  )
}
