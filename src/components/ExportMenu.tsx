import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ChevronRight, ArrowLeft, X } from 'lucide-react'
import { EXPORT_FORMATS, TEXTURE_RESOLUTIONS, exportModel, type ExportFormat, type TextureResolutionId } from '../lib/exporters'
import { saveFile } from '../lib/download'

/**
 * Rendered as a portalled sheet rather than an absolutely-positioned
 * dropdown.
 *
 * The dropdown opened downward from a row that sits near the bottom of the
 * page, so on a phone its lower options were pushed past the bottom of the
 * viewport and behind the fixed mobile nav (which sits at a higher stacking
 * level) — the texture-resolution step in particular had 4K and 8K entirely
 * unreachable. A portal to <body> with its own backdrop can't be clipped by
 * any ancestor, and anchoring it to the bottom of the screen on mobile keeps
 * every option on screen no matter how tall the list gets.
 */
export function ExportMenu({
  glbBlob,
  baseName,
  trigger,
}: {
  glbBlob: Blob
  baseName: string
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pendingFormat, setPendingFormat] = useState<ExportFormat | null>(null)
  const [exporting, setExporting] = useState(false)

  const safeName = (baseName || 'model').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'model'

  const close = () => {
    setOpen(false)
    setPendingFormat(null)
  }

  const runExport = async (format: ExportFormat, resolution: TextureResolutionId) => {
    setExporting(true)
    try {
      const blob = await exportModel(glbBlob, format, resolution)
      const meta = EXPORT_FORMATS.find((f) => f.id === format)!
      const suffix = resolution === 'original' ? '' : `_${resolution}`
      await saveFile(blob, `${safeName}${suffix}.${meta.ext}`)
    } finally {
      setExporting(false)
      close()
    }
  }

  const handlePick = (format: ExportFormat) => {
    const meta = EXPORT_FORMATS.find((f) => f.id === format)!
    if (meta.carriesTextures) {
      setPendingFormat(format)
    } else {
      runExport(format, 'original')
    }
  }

  const sheet = (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={close} />

      <div
        className="relative z-10 flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl border border-black/10 bg-white shadow-2xl sm:max-w-sm sm:rounded-2xl dark:border-white/10 dark:bg-neutral-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/5">
          {pendingFormat === null ? (
            <span className="text-sm font-semibold">Export model</span>
          ) : (
            <button
              onClick={() => setPendingFormat(null)}
              className="flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-neutral-300"
            >
              <ArrowLeft className="h-4 w-4" /> Texture resolution
            </button>
          )}
          <button onClick={close} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrolls internally so a long list stays fully reachable. */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {pendingFormat === null
            ? EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handlePick(f.id)}
                  disabled={exporting}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm transition hover:bg-black/5 active:bg-black/10 disabled:opacity-50 dark:hover:bg-white/5"
                >
                  {f.label}
                  {f.carriesTextures && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />}
                </button>
              ))
            : TEXTURE_RESOLUTIONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => runExport(pendingFormat, r.id)}
                  disabled={exporting}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm transition hover:bg-black/5 active:bg-black/10 disabled:opacity-50 dark:hover:bg-white/5"
                >
                  {r.label}
                  {exporting && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                </button>
              ))}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button onClick={() => setOpen(true)}>{trigger}</button>
      {open && createPortal(sheet, document.body)}
    </>
  )
}
