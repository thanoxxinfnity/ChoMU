/**
 * Reconnects the web UI to work the native service did while ChoMU wasn't
 * running.
 *
 * GenerationService keeps going after the app is killed and leaves finished
 * results on disk. Nothing in the web layer knows about them until this runs
 * on startup, reads them out, and folds them into the normal IndexedDB
 * history — so a model generated while the app was closed is simply there in
 * the Gallery when the user comes back.
 */
import {
  listNativeJobs,
  getNativeJobState,
  consumeNativeJob,
  clearOrphanedNotifications,
  isNativeGenerationAvailable,
} from './nativeGenerator'
import { getGeneration, saveGeneration, updateGeneration, listGenerations } from './history'
import type { GenerationRecord } from './types'

/** Job IDs are reused as history record IDs, so results map back directly. */
export async function collectFinishedNativeJobs(): Promise<number> {
  if (!isNativeGenerationAvailable()) return 0

  const { jobs, serviceRunning } = await getNativeJobState()

  // A leftover "generating" notification with no service behind it is stale.
  if (!serviceRunning) await clearOrphanedNotifications()

  // Likewise a "pending" job file: if the process died mid-request there is
  // nothing left to finish it, so report it rather than leave it hanging.
  const orphanedPending = serviceRunning ? [] : jobs.filter((j) => j.status === 'pending')
  for (const job of orphanedPending) {
    const message =
      'This generation was interrupted before it finished — the app was force-stopped or the system reclaimed it. Try again.'
    const existing = await getGeneration(job.jobId)
    if (existing && existing.status === 'pending') {
      await updateGeneration(job.jobId, { status: 'error', finishedAt: Date.now(), error: message })
    }
    await consumeNativeJob(job.jobId).catch(() => undefined)
  }

  const finished = jobs.filter((j) => j.status === 'success' || j.status === 'error')
  let collected = 0

  for (const job of finished) {
    try {
      const result = await consumeNativeJob(job.jobId)
      const existing = await getGeneration(job.jobId)

      if (result.status === 'success' && result.glb) {
        const record: GenerationRecord = {
          ...(existing ?? {
            id: job.jobId,
            mode: 'text',
            prompt: job.prompt,
            createdAt: job.updatedAt,
            params: {},
          }),
          id: job.jobId,
          status: 'success',
          finishedAt: Date.now(),
          seed: result.seed,
          glbBlob: result.glb,
        }
        await saveGeneration(record)
      } else {
        const message = result.error ?? job.error ?? 'Generation failed.'
        if (existing) {
          await updateGeneration(job.jobId, { status: 'error', finishedAt: Date.now(), error: message })
        } else {
          await saveGeneration({
            id: job.jobId,
            mode: 'text',
            prompt: job.prompt,
            status: 'error',
            createdAt: job.updatedAt,
            finishedAt: Date.now(),
            error: message,
            params: {},
          })
        }
      }
      collected++
    } catch (e) {
      console.warn('[ChoMU] could not collect native job', job.jobId, e)
    }
  }

  return collected
}

/**
 * A record is only genuinely stuck if no native job is still working on it.
 * Sweeping purely on age (as this used to) would wrongly fail a generation
 * the service is still retrying in the background.
 */
const STALE_PENDING_MS = 30 * 60 * 1000

export async function reconcileStalePendingAware(): Promise<void> {
  const [all, nativeJobs] = await Promise.all([listGenerations(), listNativeJobs()])
  const stillRunning = new Set(nativeJobs.filter((j) => j.status === 'pending').map((j) => j.jobId))
  const cutoff = Date.now() - STALE_PENDING_MS

  const stale = all.filter((r) => r.status === 'pending' && r.createdAt < cutoff && !stillRunning.has(r.id))

  await Promise.all(
    stale.map((r) =>
      updateGeneration(r.id, {
        status: 'error',
        finishedAt: Date.now(),
        error:
          'This generation never finished. If it was started before background generation was available, re-run it — generations now continue natively even if ChoMU is closed.',
      }),
    ),
  )
}
