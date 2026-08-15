import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, CheckCircle2, XCircle, Loader2, Monitor, Sun, Moon, Trash2 } from 'lucide-react'
import { getApiKey, setApiKey as persistApiKey, clearApiKey } from '../lib/storage'
import { testApiKey } from '../lib/nvidia'
import { useTheme } from '../lib/theme'
import clsx from 'clsx'

export function SettingsPage() {
  const [apiKey, setApiKeyState] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    getApiKey().then(setApiKeyState)
  }, [])

  const handleSave = async () => {
    await persistApiKey(apiKey)
    setSaved(true)
    setTestResult(null)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    // test whatever is currently saved/typed, saving first so it's consistent
    await persistApiKey(apiKey)
    const result = await testApiKey(apiKey)
    setTestResult(result)
    setTesting(false)
  }

  const handleClear = async () => {
    await clearApiKey()
    setApiKeyState('')
    setTestResult(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-24 md:pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Manage your NVIDIA API key and app preferences.
        </p>
      </div>

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4.5 w-4.5 text-violet-500" />
          <h2 className="text-sm font-semibold">NVIDIA NIM API Key</h2>
        </div>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          ChoMU calls NVIDIA's hosted <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">microsoft/trellis</code>{' '}
          NIM endpoint directly with this key. It is stored only on this device and is never bundled into the app or
          sent anywhere except NVIDIA's API. Get a free key at{' '}
          <span className="text-violet-500">build.nvidia.com</span>.
        </p>

        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKeyState(e.target.value)}
            placeholder="nvapi-..."
            className="w-full rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 pr-11 font-mono text-sm outline-none ring-violet-500/40 focus:ring-2 dark:border-white/10 dark:bg-neutral-950"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleSave}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/25 transition hover:opacity-90"
          >
            {saved ? 'Saved ✓' : 'Save key'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !apiKey.trim()}
            className="flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
          >
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            Test API key
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </button>
        </div>

        {testResult && (
          <div
            className={clsx(
              'mt-4 flex items-start gap-2 rounded-xl p-3 text-sm',
              testResult.ok
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-700 dark:text-red-400',
            )}
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <h2 className="mb-4 text-sm font-semibold">Appearance</h2>
        <div className="flex gap-2">
          {(
            [
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Monitor },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition',
                theme === id
                  ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300'
                  : 'border-black/10 text-neutral-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5',
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        <strong>Known NVIDIA-side limitation:</strong> as of now, NVIDIA's hosted TRELLIS endpoint only accepts its
        own preset gallery images for Image-to-3D — custom image uploads are rejected server-side
        (<code>Expected: example_id, got: asset_id</code>). Text-to-3D is fully working. ChoMU will surface this
        exact error if it happens, and will start working automatically the moment NVIDIA lifts the restriction — no
        app update needed.
      </section>
    </div>
  )
}
