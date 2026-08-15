import { Loader2, CheckCircle2, XCircle, Clock, X } from 'lucide-react'
import { useQueueStore } from '../lib/queueStore'
import { Link } from 'react-router-dom'

export function QueuePanel() {
  const items = useQueueStore((s) => s.items)
  const removeItem = useQueueStore((s) => s.removeItem)
  const clearFinished = useQueueStore((s) => s.clearFinished)

  if (items.length === 0) return null

  const doneCount = items.filter((i) => i.status === 'done').length
  const total = items.length

  return (
    <div className="rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <span className="text-sm font-semibold">
          Queue <span className="text-neutral-400">· {doneCount}/{total} done</span>
        </span>
        <button onClick={clearFinished} className="text-xs font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
          Clear finished
        </button>
      </div>
      <div className="max-h-72 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <StatusIcon status={item.status} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {item.prompt || (item.mode === 'image' ? 'Image input' : '')}
            </span>
            {item.status === 'done' && item.glbUrl && (
              <Link to="/history" className="text-xs font-medium text-violet-600 dark:text-violet-300">
                View
              </Link>
            )}
            {(item.status === 'queued' || item.status === 'error' || item.status === 'done') && (
              <button onClick={() => removeItem(item.id)} className="text-neutral-300 hover:text-neutral-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'queued') return <Clock className="h-4 w-4 shrink-0 text-neutral-400" />
  if (status === 'generating') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-500" />
  if (status === 'warming-up') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
  return <XCircle className="h-4 w-4 shrink-0 text-red-500" />
}
