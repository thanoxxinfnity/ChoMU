import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './lib/theme'
import { Sidebar } from './components/Sidebar'
import { MobileNav } from './components/MobileNav'
import { GeneratePage } from './pages/Generate'
import { HistoryPage } from './pages/History'
import { SettingsPage } from './pages/Settings'
import { reconcileStalePending } from './lib/history'

export default function App() {
  useEffect(() => {
    reconcileStalePending()
  }, [])

  return (
    <ThemeProvider>
      <HashRouter>
        <div className="flex min-h-screen w-full">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden px-4 py-6 pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-6 md:px-10 md:py-10">
            <Routes>
              <Route path="/" element={<GeneratePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
        <MobileNav />
      </HashRouter>
    </ThemeProvider>
  )
}
