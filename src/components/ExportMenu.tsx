import { useState, type ReactNode } from 'react'
import { Loader2, ChevronRight, ArrowLeft } from 'lucide-react'
import { EXPORT_FORMATS, TEXTURE_RESOLUTIONS, exportModel, type ExportFormat, type TextureResolutionId } from '../lib/exporters'
import { saveFile } from '../lib/download'

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

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}>{trigger}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-neutral-800">
            {pendingFormat === null ? (
              EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handlePick(f.id)}
                  disabled={exporting}
                  className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
                >
                  {f.label}
                  {f.carriesTextures && <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />}
                </button>
              ))
            ) : (
              <>
                <button
                  onClick={() => setPendingFormat(null)}
                  className="flex w-full items-center gap-1.5 border-b border-black/5 px-3.5 py-2 text-left text-xs font-medium text-neutral-500 hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <ArrowLeft className="h-3 w-3" /> Texture resolution
                </button>
                {TEXTURE_RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => runExport(pendingFormat, r.id)}
                    disabled={exporting}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
                  >
                    {r.label}
                    {exporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
