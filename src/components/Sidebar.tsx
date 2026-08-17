import { NavLink } from 'react-router-dom'
import { Sparkles, History, Settings } from 'lucide-react'
import clsx from 'clsx'
import { useI18n } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

const NAV: { to: string; labelKey: TranslationKey; icon: typeof Sparkles; end: boolean }[] = [
  { to: '/', labelKey: 'nav.generate', icon: Sparkles, end: true },
  { to: '/history', labelKey: 'nav.history', icon: History, end: false },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, end: false },
]

export function Sidebar() {
  const { t } = useI18n()
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-black/5 bg-white/60 px-4 py-6 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/40 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-lg shadow-violet-500/30">
          <img src="/favicon-192.png" alt="" className="h-full w-full object-cover" />
        </div>
        <div>
          <div className="text-lg font-semibold tracking-tight">ChoMU</div>
          <div className="text-[11px] leading-none text-neutral-500 dark:text-neutral-400">{t('sidebar.tagline')}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all active:scale-[0.98]',
                isActive
                  ? 'bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 text-violet-700 dark:text-violet-300'
                  : 'text-neutral-600 hover:translate-x-0.5 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute -left-1 h-4 w-1 rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-500" />
                )}
                <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                {t(labelKey)}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-black/5 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 p-3 text-xs text-neutral-600 dark:border-white/10 dark:text-neutral-400">
        {t('sidebar.poweredBy')}
        <br />
        {t('sidebar.trellis')}
      </div>
    </aside>
  )
}
