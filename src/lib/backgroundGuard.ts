/**
 * Keeps a generation request alive if the user backgrounds the app while it's
 * running. Plain fetch()/CapacitorHttp promises get suspended (and eventually
 * the whole process killed) once Android decides the app is no longer worth
 * keeping alive — that's what caused generations to get stuck at "pending"
 * forever with no error, even though the request was long dead. Wrapping the
 * request in an Android foreground service (with a visible notification)
 * gives the process the same OS priority as a foreground app for the
 * duration of the call, so the request actually gets to finish and its
 * result gets saved. No-op on web/iOS, where this isn't available or needed.
 */
import { Capacitor } from '@capacitor/core'
import { ForegroundService, Importance } from '@capawesome-team/capacitor-android-foreground-service'

const NOTIFICATION_ID = 4201
const CHANNEL_ID = 'chomu-generation'
let channelReady = false
let activeCount = 0

function isSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function ensureChannel(): Promise<void> {
  if (channelReady) return
  try {
    await ForegroundService.createNotificationChannel({
      id: CHANNEL_ID,
      name: 'Generation progress',
      description: 'Keeps ChoMU generating in the background',
      importance: Importance.Low, // no sound/heads-up, just a persistent status
    })
  } catch {
    // channel may already exist from a previous app run — fine either way
  }
  channelReady = true
}

/**
 * Runs `task` guarded by a foreground-service notification so it can survive
 * the app being backgrounded. Safe to call from multiple in-flight
 * generations (e.g. the queue) at once — the notification body updates to
 * reflect the latest one, and the service only stops once all of them finish.
 */
export async function runInBackgroundGuard<T>(body: string, task: () => Promise<T>): Promise<T> {
  if (!isSupported()) return task()

  try {
    const { display } = await ForegroundService.checkPermissions()
    if (display !== 'granted') await ForegroundService.requestPermissions()
  } catch {
    // permission API not available on this OS version — proceed without it,
    // startForegroundService below will simply no-op if it truly can't run
  }

  await ensureChannel()

  activeCount += 1
  try {
    if (activeCount === 1) {
      await ForegroundService.startForegroundService({
        id: NOTIFICATION_ID,
        title: 'ChoMU is generating',
        body,
        smallIcon: 'ic_stat_chomu',
        notificationChannelId: CHANNEL_ID,
        silent: true,
      })
    } else {
      await ForegroundService.updateForegroundService({
        id: NOTIFICATION_ID,
        title: 'ChoMU is generating',
        body,
        smallIcon: 'ic_stat_chomu',
        notificationChannelId: CHANNEL_ID,
      })
    }
  } catch {
    // if the service genuinely can't start (permission denied, OEM restriction),
    // fall through and run the request anyway — better than blocking generation
  }

  try {
    return await task()
  } finally {
    activeCount = Math.max(0, activeCount - 1)
    if (activeCount === 0) {
      try {
        await ForegroundService.stopForegroundService()
      } catch {
        // already stopped / never started — fine
      }
    }
  }
}
