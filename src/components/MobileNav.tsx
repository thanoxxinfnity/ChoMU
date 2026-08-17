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

export function MobileNav() {
  const { t } = useI18n()
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
    >
      {NAV.map(({ to, labelKey, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            clsx(
              'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-transform active:scale-95',
              isActive ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500 dark:text-neutral-400',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 h-1 w-6 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
              )}
              <Icon className="h-5 w-5" strokeWidth={2} />
              {t(labelKey)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
