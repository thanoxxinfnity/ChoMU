/**
 * Text-to-3D that runs in native Android code instead of in the WebView.
 *
 * Everything the web layer does dies with the WebView: if the user swipes
 * ChoMU away, switches to another app long enough for the OS to reclaim it,
 * or the screen-off doze kicks in, the in-flight fetch and its promise are
 * destroyed and the generation is simply lost — that's the "never got a
 * response and timed out" report. The foreground-service guard in
 * backgroundGuard.ts only raised the process priority; it could not keep a
 * JS promise alive through the WebView being torn down.
 *
 * GenerationService.java owns the request instead: it does the HTTP call,
 * the retries and the decode on its own thread, writes the finished GLB to
 * the app's private storage, and posts a notification. Nothing in that chain
 * needs the UI to still exist. This module hands work over to it and, on the
 * next launch, collects whatever finished while ChoMU was gone.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

export interface NativeJob {
  jobId: string
  status: 'pending' | 'success' | 'error'
  prompt: string
  updatedAt: number
  glbPath?: string
  error?: string
  seed?: number
  attempt?: number
}

interface ChomuGeneratorPlugin {
  startGeneration(options: {
    jobId: string
    prompt: string
    apiKey: string
    ssSteps?: number
    slatSteps?: number
  }): Promise<{ started: boolean }>
  getJobs(): Promise<{ jobs: NativeJob[] }>
  consumeJob(options: { jobId: string }): Promise<{
    base64?: string
    status?: string
    prompt?: string
    seed?: number
    error?: string
  }>
}

const ChomuGenerator = registerPlugin<ChomuGeneratorPlugin>('ChomuGenerator')

export function isNativeGenerationAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function startNativeGeneration(options: {
  jobId: string
  prompt: string
  apiKey: string
  ssSteps?: number
  slatSteps?: number
}): Promise<void> {
  await ChomuGenerator.startGeneration(options)
}

export async function listNativeJobs(): Promise<NativeJob[]> {
  if (!isNativeGenerationAvailable()) return []
  try {
    const { jobs } = await ChomuGenerator.getJobs()
    return jobs ?? []
  } catch {
    return []
  }
}

/** Reads a finished job's GLB and removes it from native storage. */
export async function consumeNativeJob(jobId: string): Promise<{
  glb?: Blob
  status?: string
  prompt?: string
  seed?: number
  error?: string
}> {
  const result = await ChomuGenerator.consumeJob({ jobId })
  let glb: Blob | undefined
  if (result.base64) {
    const binary = atob(result.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    glb = new Blob([bytes], { type: 'model/gltf-binary' })
  }
  return { glb, status: result.status, prompt: result.prompt, seed: result.seed, error: result.error }
}

/**
 * Waits for a native job to reach a terminal state while the UI is still
 * open, so a generation started in this session updates the screen live
 * rather than only appearing after a restart. If the app dies first, the
 * service keeps going regardless and the result is picked up by
 * collectFinishedNativeJobs() on the next launch.
 */
export async function awaitNativeJob(
  jobId: string,
  onProgress?: (attempt: number) => void,
  pollMs = 2000,
): Promise<NativeJob> {
  for (;;) {
    const jobs = await listNativeJobs()
    const job = jobs.find((j) => j.jobId === jobId)
    if (job) {
      if (job.status === 'success' || job.status === 'error') return job
      if (job.attempt && job.attempt > 1) onProgress?.(job.attempt)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
