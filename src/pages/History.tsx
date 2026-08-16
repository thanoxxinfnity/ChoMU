import { useEffect, useMemo, useState } from 'react'
import { Trash2, Download, X, Type, ImageUp, AlertCircle, Clock, Boxes, Image as ImageIcon } from 'lucide-react'
import { listGenerations, deleteGeneration, updateGeneration, reconcileStalePending } from '../lib/history'
import type { GenerationRecord } from '../lib/types'
import { ModelViewer } from '../components/ModelViewer'
import { ExportMenu } from '../components/ExportMenu'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useI18n } from '../lib/i18n'

export function HistoryPage() {
  const { t } = useI18n()
  const [records, setRecords] = useState<GenerationRecord[]>([])
  const [selected, setSelected] = useState<GenerationRecord | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    await reconcileStalePending()
    setRecords(await listGenerations())
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const selectedUrl = useMemo(() => {
    if (!selected?.glbBlob) return null
    return URL.createObjectURL(selected.glbBlob)
  }, [selected])

  const selectedImageUrl = useMemo(() => {
    if (!selected?.imageBlob) return null
    return URL.createObjectURL(selected.imageBlob)
  }, [selected])

  useEffect(() => () => { if (selectedUrl) URL.revokeObjectURL(selectedUrl) }, [selectedUrl])
  useEffect(() => () => { if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl) }, [selectedImageUrl])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await deleteGeneration(id)
    if (selected?.id === id) setSelected(null)
    refresh()
  }

  return (
    <div className="mx-auto max-w-6xl pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('history.title')}</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t('history.subtitle')}</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">Loading…</div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/10 py-20 text-center dark:border-white/10">
          <Boxes className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
          <p className="text-sm text-neutral-500">{t('history.empty')}</p>
          <Link
            to="/"
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white"
          >
            {t('history.generateFirst')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {records.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(r)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(r)}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border border-black/10 bg-white text-left shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-neutral-900"
            >
              {r.status === 'success' && r.thumbnail ? (
                <img src={r.thumbnail} className="h-full w-full object-cover" />
              ) : r.status === 'error' ? (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-red-500/5 text-red-400">
                  <AlertCircle className="h-6 w-6" />
                  <span className="text-[11px]">{t('history.failed')}</span>
                </div>
              ) : r.status === 'pending' ? (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-neutral-400">
                  <Clock className="h-6 w-6 animate-pulse" />
                  <span className="text-[11px]">{t('history.pending')}</span>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
                  <Boxes className="h-8 w-8 text-violet-400" />
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                {r.kind === 'image' ? (
                  <ImageIcon className="h-3 w-3 text-white/80" />
                ) : r.mode === 'text' ? (
                  <Type className="h-3 w-3 text-white/80" />
                ) : (
                  <ImageUp className="h-3 w-3 text-white/80" />
                )}
                <span className="truncate text-[11px] text-white/90">{r.prompt || 'Image input'}</span>
              </div>

              <button
                onClick={(e) => handleDelete(r.id, e)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-3 dark:border-white/10">
              <span className="truncate text-sm font-medium">{selected.prompt || 'Image-to-3D generation'}</span>
              <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              {selected.status === 'success' && selected.kind === 'image' && selectedImageUrl ? (
                <>
                  <img src={selectedImageUrl} className="h-80 w-full rounded-xl object-contain bg-black/5 dark:bg-white/5" />
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {new Date(selected.createdAt).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={selectedImageUrl}
                        download="chomu-flux-image.png"
                        className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 font-medium text-violet-600 dark:text-violet-300"
                      >
                        <Download className="h-3.5 w-3.5" /> {t('generate.export')}
                      </a>
                      <button
                        onClick={() => handleDelete(selected.id)}
                        className={clsx(
                          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-red-500 hover:bg-red-500/10',
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t('history.delete')}
                      </button>
                    </div>
                  </div>
                </>
              ) : selected.status === 'success' && selectedUrl ? (
                <>
                  <ModelViewer
                    url={selectedUrl}
                    className="h-80 w-full"
                    onThumbnail={(dataUrl) => {
                      if (!selected.thumbnail) {
                        updateGeneration(selected.id, { thumbnail: dataUrl })
                        setRecords((prev) => prev.map((r) => (r.id === selected.id ? { ...r, thumbnail: dataUrl } : r)))
                      }
                    }}
                  />
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {new Date(selected.createdAt).toLocaleString()} · seed {selected.seed}
                    </span>
                    <div className="flex items-center gap-2">
                      <ExportMenu
                        glbBlob={selected.glbBlob!}
                        baseName={selected.prompt || 'model'}
                        trigger={
                          <span className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 font-medium text-violet-600 dark:text-violet-300">
                            <Download className="h-3.5 w-3.5" /> {t('generate.export')}
                          </span>
                        }
                      />
                      <button
                        onClick={() => handleDelete(selected.id)}
                        className={clsx(
                          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-red-500 hover:bg-red-500/10',
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t('history.delete')}
                      </button>
                    </div>
                  </div>
                </>
              ) : selected.status === 'error' ? (
                <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
                  {selected.error || 'Generation failed.'}
                </div>
              ) : (
                <div className="py-16 text-center text-sm text-neutral-400">Still pending…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
