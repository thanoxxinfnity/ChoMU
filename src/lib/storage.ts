import { Preferences } from '@capacitor/preferences'
import type { ChomuSettings } from './types'

const API_KEY_STORAGE_KEY = 'chomu.apiKey'
const THEME_STORAGE_KEY = 'chomu.theme'

/**
 * The NVIDIA API key never lives in source code — it is entered by the user
 * in Settings and persisted only in on-device storage (Capacitor Preferences,
 * which maps to SharedPreferences on Android / UserDefaults on iOS / localStorage
 * on web). It is never bundled, committed, or sent anywhere except as the
 * Authorization header of direct requests to NVIDIA's API.
 */
export async function getApiKey(): Promise<string> {
  const { value } = await Preferences.get({ key: API_KEY_STORAGE_KEY })
  return value ?? ''
}

export async function setApiKey(key: string): Promise<void> {
  await Preferences.set({ key: API_KEY_STORAGE_KEY, value: key.trim() })
}

export async function clearApiKey(): Promise<void> {
  await Preferences.remove({ key: API_KEY_STORAGE_KEY })
}

export async function getTheme(): Promise<ChomuSettings['theme']> {
  const { value } = await Preferences.get({ key: THEME_STORAGE_KEY })
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export async function setTheme(theme: ChomuSettings['theme']): Promise<void> {
  await Preferences.set({ key: THEME_STORAGE_KEY, value: theme })
}
