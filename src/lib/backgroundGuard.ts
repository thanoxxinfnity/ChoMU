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
 *
 * If the OS blocks the foreground service from actually starting (denied
 * notification permission, or an OEM battery-optimization restriction on
 * MIUI/ColorOS/FuntouchOS/OxygenOS), that used to fail completely silently
 * — the code just proceeded to run the request unprotected, and the user
 * only found out 8 minutes later via the generic stale-pending timeout,
 * with no way to know beforehand that this specific generation wasn't
 * actually guarded. `onProtectionStatus` now reports that up front so the
 * caller can warn the user immediately, before they background the app.
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
 * Stops a foreground service stranded by a previous run.
 *
 * This module's `activeCount` lives in the WebView, so it is always 0 on a
 * fresh load — meaning nothing this process started is in flight, and any
 * service still alive from a killed session is an orphan whose "ChoMU is
 * generating" notification would otherwise sit there indefinitely (observed
 * lingering for 11 hours). Called once at startup.
 */
export async function clearStaleForegroundService(): Promise<void> {
  if (!isSupported() || activeCount > 0) return
  try {
    await ForegroundService.stopForegroundService()
  } catch {
    // Nothing was running — the normal case.
  }
}

/**
 * Runs `task` guarded by a foreground-service notification so it can survive
 * the app being backgrounded. Safe to call from multiple in-flight
 * generations at once — the notification body updates to reflect the
 * latest one, and the service only stops once all of them finish.
 *
 * @param onProtectionStatus Called once, before `task()` starts, with
 *   whether the foreground service actually started and — if not — why.
 *   Use this to warn the user immediately instead of finding out only
 *   after a background-kill 8 minutes later.
 */
export async function runInBackgroundGuard<T>(
  body: string,
  task: () => Promise<T>,
  onProtectionStatus?: (active: boolean, reason?: string) => void,
): Promise<T> {
  if (!isSupported()) {
    onProtectionStatus?.(true)
    return task()
  }

  let protectionStarted = false
  let failureReason: string | undefined

  try {
    const { display } = await ForegroundService.checkPermissions()
    if (display !== 'granted') {
      const result = await ForegroundService.requestPermissions()
      if (result.display !== 'granted') {
        failureReason =
          'Notification permission denied — Android requires it to keep ChoMU alive in the background.'
      }
    }
  } catch (err) {
    failureReason = `Could not check/request notification permission: ${(err as Error).message}`
  }

  if (!failureReason) {
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
      protectionStarted = true
    } catch (err) {
      activeCount = Math.max(0, activeCount - 1)
      failureReason =
        `Foreground service could not start: ${(err as Error).message}. ` +
        "Your device's battery settings may be blocking it — check Settings > Apps > ChoMU > Battery, " +
        'and allow autostart/background activity if your device has that option ' +
        '(common on Xiaomi/Oppo/Vivo/OnePlus).'
    }
  }

  if (!protectionStarted && failureReason) {
    console.warn(`[ChoMU] background protection unavailable: ${failureReason}`)
  }

  onProtectionStatus?.(protectionStarted, failureReason)

  try {
    return await task()
  } finally {
    if (protectionStarted) {
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
}
