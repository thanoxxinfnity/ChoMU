import { useEffect, useMemo, useRef, useState } from 'react'
import { Type, ImageUp, Wand2, Loader2, X, Download, AlertTriangle, Image as ImageIcon, Box } from 'lucide-react'
import clsx from 'clsx'
import { ModelViewer } from '../components/ModelViewer'
import { ZoomableImage } from '../components/ZoomableImage'
import { ExportMenu } from '../components/ExportMenu'
import { generateFromText, generateFromImage, NvidiaApiError } from '../lib/nvidia'
import { generateFromImageFal, FalApiError } from '../lib/fal'
import { generateImageFlux, PollinationsError } from '../lib/pollinations'
import { getApiKey, getFalApiKey } from '../lib/storage'
import { saveGeneration, newGenerationId, updateGeneration } from '../lib/history'
import { runInBackgroundGuard } from '../lib/backgroundGuard'
import { notifyGenerationDone } from '../lib/notify'
import { DEFAULT_PARAMS, type GenerationRecord } from '../lib/types'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

type Mode = 'text' | 'image' | 'flux'

export function GeneratePage() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('text')
  const [prompt, setPrompt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'checking-key' | 'generating' | 'done' | 'error'>('idle')
  const [error, setError] = useState<{ message: string; isKeyError: boolean } | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultSeed, setResultSeed] = useState<number | null>(null)
  const [warmingUp, setWarmingUp] = useState(false)
  const [imageProgress, setImageProgress] = useState<string | null>(null)
  const [fluxPrompt, setFluxPrompt] = useState('')
  const [fluxStatus, setFluxStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [fluxError, setFluxError] = useState<string | null>(null)
  const [fluxResultUrl, setFluxResultUrl] = useState<string | null>(null)
  const [fluxResultBlob, setFluxResultBlob] = useState<Blob | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentIdRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const canGenerate = useMemo(() => {
    if (status === 'generating' || status === 'checking-key') return false
    if (mode === 'text') return prompt.trim().length > 2
    return !!imageFile
  }, [mode, prompt, imageFile, status])

  const handlePickImage = (file: File) => {
    setImageFile(file)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleGenerate = async () => {
    setError(null)
    setStatus('checking-key')

    const falApiKey = mode === 'image' ? await getFalApiKey() : ''
    const useFal = mode === 'image' && !!falApiKey.trim()

    const apiKey = useFal ? '' : await getApiKey()
    if (!useFal && !apiKey.trim()) {
      setError({ message: t('generate.noApiKey'), isKeyError: true })
      setStatus('error')
      return
    }

    const id = newGenerationId()
    currentIdRef.current = id
    const record: GenerationRecord = {
      id,
      mode: mode as 'text' | 'image',
      prompt: mode === 'text' ? prompt.trim() : undefined,
      sourceImage: mode === 'image' ? imagePreview ?? undefined : undefined,
      status: 'pending',
      createdAt: Date.now(),
      params: DEFAULT_PARAMS,
    }
    await saveGeneration(record)

    setStatus('generating')
    setResultUrl(null)
    setResultBlob(null)
    setResultSeed(null)
    setWarmingUp(false)
    setImageProgress(null)
    const onRetry = () => setWarmingUp(true)
    try {
      const result = await runInBackgroundGuard(mode === 'text' ? prompt.trim() : 'from your image', () =>
        mode === 'text'
          ? generateFromText(apiKey, prompt.trim(), DEFAULT_PARAMS, onRetry)
          : useFal
            ? generateFromImageFal(falApiKey, imageFile as File, setImageProgress)
            : generateFromImage(apiKey, imageFile as File, DEFAULT_PARAMS, onRetry),
      )

      const seed: number | undefined = 'seed' in result ? (result.seed as number) : undefined
      const url = URL.createObjectURL(result.glb)
      setResultUrl(url)
      setResultBlob(result.glb)
      setResultSeed(seed ?? null)
      setStatus('done')
      await saveGeneration({
        ...record,
        status: 'success',
        finishedAt: Date.now(),
        seed,
        glbBlob: result.glb,
      })
      notifyGenerationDone('ChoMU', 'Your 3D model is ready.')
    } catch (e) {
      const err = e as NvidiaApiError & Partial<FalApiError>
      setError({ message: err.message, isKeyError: err.code === 'INVALID_KEY' })
      setStatus('error')
      await saveGeneration({ ...record, status: 'error', finishedAt: Date.now(), error: err.message })
      notifyGenerationDone('ChoMU', 'Generation failed — tap to see what happened.')
    } finally {
      setWarmingUp(false)
      setImageProgress(null)
    }
  }

  const handleGenerateImage = async () => {
    const prompt = fluxPrompt.trim()
    if (!prompt) return
    setFluxError(null)
    setFluxStatus('generating')
    setFluxResultUrl(null)
    setFluxResultBlob(null)

    const id = newGenerationId()
    const record: GenerationRecord = {
      id,
      kind: 'image',
      mode: 'text',
      prompt,
      status: 'pending',
      createdAt: Date.now(),
      params: {},
    }
    await saveGeneration(record)

    try {
      const blob = await runInBackgroundGuard(prompt, () => generateImageFlux(prompt))
      const url = URL.createObjectURL(blob)
      setFluxResultUrl(url)
      setFluxResultBlob(blob)
      setFluxStatus('done')

      const thumbnail = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      await saveGeneration({ ...record, status: 'success', finishedAt: Date.now(), imageBlob: blob, thumbnail })
      notifyGenerationDone('ChoMU', 'Your image is ready.')
    } catch (e) {
      const err = e as PollinationsError
      setFluxError(err.message)
      setFluxStatus('error')
      notifyGenerationDone('ChoMU', 'Image generation failed — tap to see what happened.')
      await saveGeneration({ ...record, status: 'error', finishedAt: Date.now(), error: err.message })
    }
  }

  /** Hands the FLUX result over to the Image-to-3D tab, matching the
   *  "Create → 3D" flow the user asked to mirror from VOID. */
  const handleMakeIt3D = () => {
    if (!fluxResultBlob) return
    const file = new File([fluxResultBlob], 'flux-generated.png', { type: fluxResultBlob.type || 'image/png' })
    handlePickImage(file)
    setMode('image')
  }

  return (
    <div className="mx-auto max-w-6xl pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('generate.title')}</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t('generate.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="flex gap-2 rounded-xl bg-black/5 p-1 dark:bg-white/5">
            <button
              onClick={() => setMode('text')}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition',
                mode === 'text'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white'
                  : 'text-neutral-500',
              )}
            >
              <Type className="h-4 w-4" /> {t('generate.tab.text')}
            </button>
            <button
              onClick={() => setMode('image')}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition',
                mode === 'image'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white'
                  : 'text-neutral-500',
              )}
            >
              <ImageUp className="h-4 w-4" /> {t('generate.tab.image')}
            </button>
            <button
              onClick={() => setMode('flux')}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition',
                mode === 'flux'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white'
                  : 'text-neutral-500',
              )}
            >
              <ImageIcon className="h-4 w-4" /> {t('generate.tab.flux')}
            </button>
          </div>

          {mode === 'flux' ? (
            <div className="space-y-2">
              <textarea
                value={fluxPrompt}
                onChange={(e) => setFluxPrompt(e.target.value)}
                placeholder={t('generate.flux.placeholder')}
                rows={4}
                className="w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none ring-violet-500/40 focus:ring-2 dark:border-white/10 dark:bg-neutral-900"
              />
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{t('generate.flux.hint')}</p>
            </div>
          ) : mode === 'text' ? (
            <div className="space-y-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('generate.prompt.placeholder')}
                rows={4}
                className="w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none ring-violet-500/40 focus:ring-2 dark:border-white/10 dark:bg-neutral-900"
              />
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handlePickImage(e.target.files[0])}
              />
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} className="h-56 w-full rounded-2xl object-cover" />
                  <button
                    onClick={() => {
                      setImageFile(null)
                      if (imagePreview) URL.revokeObjectURL(imagePreview)
                      setImagePreview(null)
                    }}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/15 text-neutral-400 transition hover:border-violet-400 hover:text-violet-500 dark:border-white/15"
                >
                  <ImageUp className="h-7 w-7" />
                  <span className="text-sm font-medium">{t('generate.image.pick')}</span>
                  <span className="text-xs">{t('generate.image.formats')}</span>
                </button>
              )}
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {t('generate.image.limitation')}
              </div>
            </div>
          )}

          {mode === 'flux' ? (
            <button
              onClick={handleGenerateImage}
              disabled={!fluxPrompt.trim() || fluxStatus === 'generating'}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 hover:shadow-xl hover:shadow-violet-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fluxStatus === 'generating' ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  {t('generate.generating')}
                </>
              ) : (
                <>
                  <ImageIcon className="h-4.5 w-4.5" />
                  {t('generate.flux.generate')}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 hover:shadow-xl hover:shadow-violet-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'generating' || status === 'checking-key' ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  {imageProgress || (warmingUp ? t('generate.warmingUp') : t('generate.generating'))}
                </>
              ) : (
                <>
                  <Wand2 className="h-4.5 w-4.5" />
                  {t('generate.now')}
                </>
              )}
            </button>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
              {error.message}
              {error.isKeyError && (
                <>
                  {' '}
                  <Link to="/settings" className="font-semibold underline">
                    {t('generate.openSettings')}
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {mode === 'flux' ? (
            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-black/5 lg:aspect-auto lg:h-[520px] dark:border-white/10 dark:bg-white/5">
              {fluxStatus === 'generating' ? (
                <div className="flex flex-col items-center gap-2 text-neutral-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">{t('generate.generating')}</span>
                </div>
              ) : fluxResultUrl ? (
                <ZoomableImage src={fluxResultUrl} className="h-full w-full" />
              ) : (
                <span className="text-sm text-neutral-400">{t('generate.waiting')}</span>
              )}
            </div>
          ) : (
            <ModelViewer
              url={resultUrl}
              className="aspect-square w-full lg:aspect-auto lg:h-[520px]"
              onThumbnail={(dataUrl) => {
                if (currentIdRef.current) updateGeneration(currentIdRef.current, { thumbnail: dataUrl })
              }}
            />
          )}

          {mode === 'flux' && fluxError && (
            <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">{fluxError}</div>
          )}

          {mode === 'flux' && fluxResultUrl && fluxResultBlob && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-xs dark:border-white/10 dark:bg-neutral-900">
              <button
                onClick={handleMakeIt3D}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 font-medium text-white"
              >
                <Box className="h-3.5 w-3.5" /> Make it 3D
              </button>
              <a
                href={fluxResultUrl}
                download="chomu-flux-image.png"
                className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 font-medium text-violet-600 dark:text-violet-300"
              >
                <Download className="h-3.5 w-3.5" /> {t('generate.export')}
              </a>
            </div>
          )}

          {mode !== 'flux' && resultUrl && resultBlob && (
            <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3 text-xs dark:border-white/10 dark:bg-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">
                {resultSeed != null && (
                  <>
                    {t('generate.seed')} <span className="font-mono text-neutral-700 dark:text-neutral-300">{resultSeed}</span>
                  </>
                )}
              </span>
              <ExportMenu
                glbBlob={resultBlob}
                baseName={mode === 'text' ? prompt.slice(0, 24) || 'model' : 'model'}
                trigger={
                  <span className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 font-medium text-violet-600 dark:text-violet-300">
                    <Download className="h-3.5 w-3.5" /> {t('generate.export')}
                  </span>
                }
              />
            </div>
          )}
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
        {t('generate.reliabilityNote')}
      </p>
    </div>
  )
}
