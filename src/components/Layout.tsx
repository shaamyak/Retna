import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  Eye, LayoutDashboard, FlaskConical,
  MessageSquare, Plus, ChevronRight, AlertTriangle, Beaker
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import clsx from 'clsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/progression-lab', icon: FlaskConical, label: 'Progression Lab' },
  { to: '/ai-companion', icon: MessageSquare, label: 'AI Companion' },
  { to: '/simulator', icon: Beaker, label: 'What-If Simulator' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { userPatients, datasetPatients, analysisCache } = useAppStore()

  const criticalCount = Object.values(analysisCache).filter(
    a => a.riskLevel === 'Critical'
  ).length

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-mesh">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-slate-950/80 backdrop-blur-md">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center glow-brand">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight">GlaucoMap</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Decision Support</div>
            </div>
          </div>
        </div>

        {/* New Patient Button */}
        <div className="px-3 pt-4">
          <button
            onClick={() => navigate('/new-patient')}
            className="btn-primary w-full justify-center text-sm py-2.5"
            id="new-patient-btn"
          >
            <Plus className="w-4 h-4" />
            New Patient Case
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hidden">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                  isActive
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                )
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
            </NavLink>
          ))}
        </nav>

        {/* Stats Footer */}
        <div className="px-4 py-4 border-t border-white/[0.06] space-y-2">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Dataset Eyes</span>
            <span className="text-slate-300 font-mono">{datasetPatients.length}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Manual Cases</span>
            <span className="text-slate-300 font-mono">{userPatients.length}</span>
          </div>
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded-lg bg-red-900/20 border border-red-700/30">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-xs text-red-300">{criticalCount} Critical Risk</span>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="px-4 pb-4">
          <div className="text-[9px] text-slate-600 leading-relaxed bg-slate-800/30 rounded-lg p-2 border border-white/[0.04]">
            ⚠️ DECISION-SUPPORT PROTOTYPE ONLY. Not a diagnostic device. All outputs require clinical review.
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
