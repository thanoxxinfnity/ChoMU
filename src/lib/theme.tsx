import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getTheme, setTheme as persistTheme } from './storage'
import type { ChomuSettings } from './types'

interface ThemeContextValue {
  theme: ChomuSettings['theme']
  resolvedTheme: 'light' | 'dark'
  setTheme: (t: ChomuSettings['theme']) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function resolve(theme: ChomuSettings['theme']): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ChomuSettings['theme']>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    getTheme().then((t) => {
      setThemeState(t)
      setResolvedTheme(resolve(t))
    })
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => setResolvedTheme(resolve('system'))
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [theme])

  const setTheme = (t: ChomuSettings['theme']) => {
    setThemeState(t)
    setResolvedTheme(resolve(t))
    persistTheme(t)
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
