import { useEffect, useMemo, useRef, useState } from 'react'
import { Type, ImageUp, Wand2, Loader2, ChevronDown, X, Download, AlertTriangle, ListPlus, Sparkle, Image as ImageIcon, Box } from 'lucide-react'
import clsx from 'clsx'
import { ModelViewer } from '../components/ModelViewer'
import { ZoomableImage } from '../components/ZoomableImage'
import { ExportMenu } from '../components/ExportMenu'
import { QueuePanel } from '../components/QueuePanel'
import { generateFromText, generateFromImage, generateSample, NvidiaApiError } from '../lib/nvidia'
import { generateImageFlux, PollinationsError } from '../lib/pollinations'
import { getApiKey } from '../lib/storage'
import { saveGeneration, newGenerationId, updateGeneration } from '../lib/history'
import { runInBackgroundGuard } from '../lib/backgroundGuard'
import { useQueueStore } from '../lib/queueStore'
import { DEFAULT_PARAMS, SPEED_PRESETS, type GenerationParams, type GenerationRecord, type SpeedPresetId } from '../lib/types'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

type Mode = 'text' | 'image' | 'flux'

export function GeneratePage() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('text')
  const [prompt, setPrompt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [params, setParams] = useState<GenerationParams>(DEFAULT_PARAMS)
  const [speedPreset, setSpeedPreset] = useState<SpeedPresetId>('balanced')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [status, setStatus] = useState<'idle' | 'checking-key' | 'generating' | 'done' | 'error'>('idle')
  const [error, setError] = useState<{ message: string; isKeyError: boolean } | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultSeed, setResultSeed] = useState<number | null>(null)
  const [warmingUp, setWarmingUp] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [fluxPrompt, setFluxPrompt] = useState('')
  const [fluxStatus, setFluxStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [fluxError, setFluxError] = useState<string | null>(null)
  const [fluxResultUrl, setFluxResultUrl] = useState<string | null>(null)
  const [fluxResultBlob, setFluxResultBlob] = useState<Blob | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentIdRef = useRef<string | null>(null)
  const enqueueText = useQueueStore((s) => s.enqueueText)
  const enqueueImage = useQueueStore((s) => s.enqueueImage)

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

  const batchLines = useMemo(
    () => prompt.split('\n').map((l) => l.trim()).filter(Boolean),
    [prompt],
  )

  const handleQueue = async () => {
    if (mode === 'text') {
      await enqueueText(batchMode ? batchLines : [prompt], params)
      setPrompt('')
    } else if (imageFile) {
      await enqueueImage(imageFile, params)
      setImageFile(null)
      setImagePreview(null)
    }
  }

  const handlePickImage = (file: File) => {
    setImageFile(file)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleGenerate = async () => {
    setError(null)
    setStatus('checking-key')
    const apiKey = await getApiKey()
    if (!apiKey.trim()) {
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
      params,
    }
    await saveGeneration(record)

    setStatus('generating')
    setResultUrl(null)
    setResultBlob(null)
    setWarmingUp(false)
    const onRetry = () => setWarmingUp(true)
    try {
      const result = await runInBackgroundGuard(mode === 'text' ? prompt.trim() : 'from your image', () =>
        mode === 'text'
          ? generateFromText(apiKey, prompt.trim(), params, onRetry)
          : generateFromImage(apiKey, imageFile as File, params, onRetry),
      )

      const url = URL.createObjectURL(result.glb)
      setResultUrl(url)
      setResultBlob(result.glb)
      setResultSeed(result.seed)
      setStatus('done')
      await saveGeneration({
        ...record,
        status: 'success',
        finishedAt: Date.now(),
        seed: result.seed,
        glbBlob: result.glb,
      })
    } catch (e) {
      const err = e as NvidiaApiError
      setError({ message: err.message, isKeyError: err.code === 'INVALID_KEY' })
      setStatus('error')
      await saveGeneration({ ...record, status: 'error', finishedAt: Date.now(), error: err.message })
    } finally {
      setWarmingUp(false)
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
    } catch (e) {
      const err = e as PollinationsError
      setFluxError(err.message)
      setFluxStatus('error')
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

  const handleTrySample = async () => {
    setError(null)
    setStatus('checking-key')
    const apiKey = await getApiKey()
    if (!apiKey.trim()) {
      setError({ message: t('generate.noApiKey'), isKeyError: true })
      setStatus('error')
      return
    }

    const id = newGenerationId()
    currentIdRef.current = id
    const record: GenerationRecord = {
      id,
      mode: 'image',
      prompt: t('generate.sample.label'),
      status: 'pending',
      createdAt: Date.now(),
      params,
    }
    await saveGeneration(record)

    setStatus('generating')
    setResultUrl(null)
    setResultBlob(null)
    setWarmingUp(false)
    const onRetry = () => setWarmingUp(true)
    try {
      const result = await runInBackgroundGuard(t('generate.sample.label'), () => generateSample(apiKey, onRetry))
      const url = URL.createObjectURL(result.glb)
      setResultUrl(url)
      setResultBlob(result.glb)
      setResultSeed(result.seed)
      setStatus('done')
      await saveGeneration({ ...record, status: 'success', finishedAt: Date.now(), seed: result.seed, glbBlob: result.glb })
    } catch (e) {
      const err = e as NvidiaApiError
      setError({ message: err.message, isKeyError: err.code === 'INVALID_KEY' })
      setStatus('error')
      await saveGeneration({ ...record, status: 'error', finishedAt: Date.now(), error: err.message })
    } finally {
      setWarmingUp(false)
    }
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
                placeholder={batchMode ? t('generate.batchPlaceholder') : t('generate.prompt.placeholder')}
                rows={batchMode ? 6 : 4}
                className="w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none ring-violet-500/40 focus:ring-2 dark:border-white/10 dark:bg-neutral-900"
              />
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <input type="checkbox" checked={batchMode} onChange={(e) => setBatchMode(e.target.checked)} className="accent-violet-600" />
                {t('generate.batchMode')}
                {batchMode && batchLines.length > 0 && (
                  <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-600 dark:text-violet-300">
                    {batchLines.length} {t('generate.queued')}
                  </span>
                )}
              </label>
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

          {mode !== 'flux' && (
          <>
          <div>
            <div className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Speed</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(SPEED_PRESETS) as [SpeedPresetId, (typeof SPEED_PRESETS)[SpeedPresetId]][]).map(
                ([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSpeedPreset(id)
                      setParams((p) => ({
                        ...p,
                        ssSamplingSteps: preset.ssSamplingSteps,
                        slatSamplingSteps: preset.slatSamplingSteps,
                      }))
                    }}
                    className={clsx(
                      'rounded-xl border px-2 py-2.5 text-center transition',
                      speedPreset === id
                        ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300'
                        : 'border-black/10 text-neutral-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5',
                    )}
                  >
                    <div className="text-sm font-semibold">{preset.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight opacity-80">{preset.description}</div>
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 dark:border-white/10">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            >
              {t('generate.advanced')}
              <ChevronDown className={clsx('h-4 w-4 transition-transform', showAdvanced && 'rotate-180')} />
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-4 border-t border-black/10 p-4 dark:border-white/10">
                <ParamSlider
                  label="Seed"
                  value={params.seed ?? 0}
                  min={0}
                  max={999999}
                  step={1}
                  onChange={(v) => setParams((p) => ({ ...p, seed: v }))}
                />
                <ParamSlider
                  label="Structure sampling steps"
                  value={params.ssSamplingSteps ?? 12}
                  min={10}
                  max={50}
                  step={1}
                  onChange={(v) => setParams((p) => ({ ...p, ssSamplingSteps: v }))}
                />
                <ParamSlider
                  label="Structure CFG scale"
                  value={params.ssCfgScale ?? 7.5}
                  min={1.1}
                  max={10}
                  step={0.1}
                  onChange={(v) => setParams((p) => ({ ...p, ssCfgScale: v }))}
                />
                <ParamSlider
                  label="Detail sampling steps"
                  value={params.slatSamplingSteps ?? 12}
                  min={10}
                  max={50}
                  step={1}
                  onChange={(v) => setParams((p) => ({ ...p, slatSamplingSteps: v }))}
                />
                <ParamSlider
                  label="Detail CFG scale"
                  value={params.slatCfgScale ?? 3}
                  min={1.1}
                  max={10}
                  step={0.1}
                  onChange={(v) => setParams((p) => ({ ...p, slatCfgScale: v }))}
                />
              </div>
            )}
          </div>
          </>
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
          <div className="flex gap-2">
            {!batchMode && (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 hover:shadow-xl hover:shadow-violet-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === 'generating' || status === 'checking-key' ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    {warmingUp ? t('generate.warmingUp') : t('generate.generating')}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4.5 w-4.5" />
                    {t('generate.now')}
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleQueue}
              disabled={batchMode ? batchLines.length === 0 : !canGenerate}
              className={clsx(
                'flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                batchMode
                  ? 'flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/25 hover:opacity-90'
                  : 'flex-1 border border-black/10 text-neutral-700 hover:bg-black/5 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/5',
              )}
            >
              <ListPlus className="h-4.5 w-4.5" />
              {batchMode
                ? `${t('generate.queueN')} ${batchLines.length || ''} ${t('generate.prompts')}${batchLines.length === 1 ? '' : 's'}`
                : t('generate.addToQueue')}
            </button>
          </div>
          )}

          <div>
            <button
              onClick={handleTrySample}
              disabled={status === 'generating' || status === 'checking-key'}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300 py-3 text-sm font-medium text-violet-600 transition hover:bg-violet-500/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-800 dark:text-violet-300"
            >
              <Sparkle className="h-4 w-4" />
              {t('generate.sample.button')}
            </button>
            <p className="mt-1.5 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              {t('generate.sample.hint')}
            </p>
          </div>

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

          <QueuePanel />
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
                {t('generate.seed')} <span className="font-mono text-neutral-700 dark:text-neutral-300">{resultSeed}</span>
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

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-1">
      <span className="flex justify-between text-neutral-500 dark:text-neutral-400">
        {label}
        <span className="font-mono text-neutral-700 dark:text-neutral-300">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-violet-600"
      />
    </label>
  )
}
