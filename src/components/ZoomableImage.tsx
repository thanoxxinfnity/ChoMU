import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

const MIN_SCALE = 1
const MAX_SCALE = 25

interface Point {
  x: number
  y: number
}

/** Pinch-to-zoom / scroll-to-zoom image viewer, up to 25x, with pan while zoomed in. */
export function ZoomableImage({ src, className }: { src: string; className?: string }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null)
  const panStart = useRef<{ pointer: Point; offset: Point } | null>(null)

  const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v))

  const zoomAt = (nextScale: number, anchor?: Point) => {
    const el = containerRef.current
    nextScale = clampScale(nextScale)
    if (!el) {
      setScale(nextScale)
      return
    }
    const rect = el.getBoundingClientRect()
    const cx = anchor ? anchor.x - rect.left - rect.width / 2 : 0
    const cy = anchor ? anchor.y - rect.top - rect.height / 2 : 0
    setScale((prevScale) => {
      const ratio = nextScale / prevScale
      setOffset((prev) => clampOffset({ x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio }, nextScale))
      return nextScale
    })
  }

  const clampOffset = (o: Point, s: number): Point => {
    const el = containerRef.current
    if (!el || s <= 1) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const maxX = (rect.width * (s - 1)) / 2
    const maxY = (rect.height * (s - 1)) / 2
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) }
  }

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.0025
    zoomAt(scale * (1 + delta), { x: e.clientX, y: e.clientY })
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()]
      pinchStart.current = { distance: dist(pts[0], pts[1]), scale }
      panStart.current = null
    } else if (pointers.current.size === 1 && scale > 1) {
      panStart.current = { pointer: { x: e.clientX, y: e.clientY }, offset }
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()]
      const newDist = dist(pts[0], pts[1])
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      zoomAt((pinchStart.current.scale * newDist) / pinchStart.current.distance, mid)
    } else if (pointers.current.size === 1 && panStart.current) {
      const dx = e.clientX - panStart.current.pointer.x
      const dy = e.clientY - panStart.current.pointer.y
      setOffset(clampOffset({ x: panStart.current.offset.x + dx, y: panStart.current.offset.y + dy }, scale))
    }
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 1) {
      const [remaining] = pointers.current.values()
      panStart.current = { pointer: remaining, offset }
    } else {
      panStart.current = null
    }
  }

  const reset = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className={clsx('group relative touch-none select-none overflow-hidden', className)}>
      <div
        ref={containerRef}
        className="h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={(e) => zoomAt(scale > 1 ? 1 : 4, { x: e.clientX, y: e.clientY })}
      >
        <img
          src={src}
          draggable={false}
          className="h-full w-full object-contain"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center' }}
        />
      </div>

      <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => zoomAt(scale / 1.6)}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="pointer-events-auto rounded-lg bg-black/60 px-2 py-1.5 text-[11px] font-medium text-white backdrop-blur">
          {scale.toFixed(1)}x
        </span>
        <button
          type="button"
          onClick={() => zoomAt(scale * 1.6)}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {scale > 1 && (
          <button
            type="button"
            onClick={reset}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
