import { useEffect } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from './lib/theme'
import { I18nProvider } from './lib/i18n'
import { Sidebar } from './components/Sidebar'
import { MobileNav } from './components/MobileNav'
import { GeneratePage } from './pages/Generate'
import { HistoryPage } from './pages/History'
import { SettingsPage } from './pages/Settings'
import { collectFinishedNativeJobs, reconcileStalePendingAware } from './lib/jobRecovery'
import { clearStaleForegroundService } from './lib/backgroundGuard'

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="page-enter">
      <Routes location={location}>
        <Route path="/" element={<GeneratePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    // Collect anything the native service finished while ChoMU was closed
    // before deciding which records are genuinely stuck.
    const recover = async () => {
      await collectFinishedNativeJobs()
      await reconcileStalePendingAware()
    }
    recover()

    // Sweep away any "generating" notification left over from a session that
    // was killed before it could stop its own service.
    clearStaleForegroundService()

    // The service can also finish while the app sits in the background.
    const onVisible = () => {
      if (document.visibilityState === 'visible') recover()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  return (
    <I18nProvider>
      <ThemeProvider>
        <HashRouter>
          <div className="flex min-h-screen w-full">
            <Sidebar />
            <main className="flex-1 overflow-x-hidden px-4 py-6 pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-6 md:px-10 md:py-10">
              <AnimatedRoutes />
            </main>
          </div>
          <MobileNav />
        </HashRouter>
      </ThemeProvider>
    </I18nProvider>
  )
}
