import { NavLink } from 'react-router-dom'
import { Sparkles, History, Settings, Boxes } from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/', label: 'Generate', icon: Sparkles, end: true },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-black/5 bg-white/60 px-4 py-6 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/40 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
          <Boxes className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-lg font-semibold tracking-tight">ChoMU</div>
          <div className="text-[11px] leading-none text-neutral-500 dark:text-neutral-400">AI 3D Generator</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 text-violet-700 dark:text-violet-300'
                  : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5',
              )
            }
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-black/5 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 p-3 text-xs text-neutral-600 dark:border-white/10 dark:text-neutral-400">
        Powered by NVIDIA NIM
        <br />
        Microsoft TRELLIS
      </div>
    </aside>
  )
}
