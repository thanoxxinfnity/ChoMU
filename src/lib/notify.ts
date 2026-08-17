/**
 * A single, distinct notification fired only when a generation finishes
 * (success or error) — not a running/silent status like the foreground
 * service notification in backgroundGuard.ts. This is the "ding" that says
 * "come look, it's done," so the user doesn't have to keep the screen open
 * or guess when a background generation finished.
 */
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

let permissionChecked = false

async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (permissionChecked) return true
  try {
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') {
      const req = await LocalNotifications.requestPermissions()
      if (req.display !== 'granted') return false
    }
    permissionChecked = true
    return true
  } catch {
    return false
  }
}

export async function notifyGenerationDone(title: string, body: string): Promise<void> {
  const ok = await ensurePermission()
  if (!ok) return
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body,
          schedule: undefined, // fire immediately
        },
      ],
    })
  } catch {
    // best-effort — a missed notification shouldn't block the UI from showing the result
  }
}
