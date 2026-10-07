import { useEffect, useRef } from 'react'

export function FrameCanvas({
  rgba,
  width,
  height,
  label,
  className = '',
}: {
  rgba: Uint8ClampedArray
  width: number
  height: number
  label: string
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = width
    c.height = height
    c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  }, [rgba, width, height])
  return <canvas ref={ref} role="img" aria-label={label} className={`block h-auto w-full ${className}`} />
}
