import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Search, Eye, Users, AlertTriangle, Activity, Trash2, CheckSquare, X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import type { RiskLevel, ManualPatient } from '@/types'
import PatientCard from '@/components/PatientCard'
import clsx from 'clsx'
import { DEMO_PATIENTS } from '@/data/demoCases'

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  
  const { 
    userPatients, filterState, setFilter, resetFilter, analysisCache, 
    loadDemoPatients, removeDemoPatients, deletePatient, deleteMultiplePatients,
    deleteAllPatients, addPatient
  } = useAppStore()

  // Selection Mode
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Delete Dialog State
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; ids: string[]; type: 'single' | 'multiple' | 'all' }>({ isOpen: false, ids: [], type: 'single' })
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('')
  const [alsoRemoveDemos, setAlsoRemoveDemos] = useState(false)

  // Toast / Undo State
  const [undoToast, setUndoToast] = useState<{ patients: ManualPatient[], timerId: ReturnType<typeof setTimeout> | null } | null>(null)

  useEffect(() => {
    if (location.state?.deletedPatient) {
      showUndoToast([location.state.deletedPatient])
      // Clear location state
      window.history.replaceState({}, document.title)
    }
    return () => {
      if (undoToast?.timerId) clearTimeout(undoToast.timerId)
    }
  }, [location.state])

  const showUndoToast = (patients: ManualPatient[]) => {
    if (undoToast?.timerId) clearTimeout(undoToast.timerId)
    const timerId = setTimeout(() => {
      setUndoToast(null)
    }, 8000)
    setUndoToast({ patients, timerId })
  }

  const handleUndo = () => {
    if (undoToast) {
      if (undoToast.timerId) clearTimeout(undoToast.timerId)
      undoToast.patients.forEach(p => addPatient(p))
      setUndoToast(null)
    }
  }

  const filtered = useMemo(() => {
    let list = [...userPatients]
    const f = filterState

    if (f.search) {
      const q = f.search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.includes(q) ||
        p.laterality.toLowerCase().includes(q)
      )
    }
    if (f.laterality !== 'Both') list = list.filter(p => p.laterality === f.laterality)
    if (f.riskLevel !== 'All') {
      list = list.filter(p => {
        const a = analysisCache[p.id]
        return a?.riskLevel === f.riskLevel
      })
    }

    // Sort
    list.sort((a, b) => {
      const aA = analysisCache[a.id]
      const bA = analysisCache[b.id]
      switch (f.sortBy) {
        case 'risk-desc': {
          const order: Record<RiskLevel, number> = { Critical: 3, High: 2, Moderate: 1, Low: 0 }
          return (order[bA?.riskLevel ?? 'Low'] ?? 0) - (order[aA?.riskLevel ?? 'Low'] ?? 0)
        }
        case 'age-desc': return b.age - a.age
        case 'iop-desc': return (bA?.maxIOP ?? 0) - (aA?.maxIOP ?? 0)
        case 'rnfl-asc': {
          const aRNFL = a.rnflVisits.length > 0 ? (a.rnflVisits[a.rnflVisits.length - 1].sectors.mean ?? 999) : 999
          const bRNFL = b.rnflVisits.length > 0 ? (b.rnflVisits[b.rnflVisits.length - 1].sectors.mean ?? 999) : 999
          return aRNFL - bRNFL
        }
        default: return new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
      }
    })
    return list
  }, [userPatients, filterState, analysisCache])

  const stats = useMemo(() => {
    const analyses = userPatients.map(p => analysisCache[p.id]).filter(Boolean)
    return {
      total: userPatients.length,
      critical: analyses.filter(a => a!.riskLevel === 'Critical').length,
      high: analyses.filter(a => a!.riskLevel === 'High').length,
      withAlerts: analyses.filter(a => a!.alerts.length > 0).length,
    }
  }, [userPatients, analysisCache])

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const executeDelete = () => {
    if (deleteConfirm.type === 'single') {
      const p = userPatients.find(x => x.id === deleteConfirm.ids[0])
      if (p) {
        deletePatient(p.id)
        showUndoToast([p])
      }
    } else if (deleteConfirm.type === 'multiple') {
      const ps = userPatients.filter(x => deleteConfirm.ids.includes(x.id))
      deleteMultiplePatients(deleteConfirm.ids)
      showUndoToast(ps)
      setSelectedIds(new Set())
      setIsSelectionMode(false)
    } else if (deleteConfirm.type === 'all') {
      const ps = userPatients.filter(x => alsoRemoveDemos || !x.isDemo)
      deleteAllPatients(!alsoRemoveDemos)
      showUndoToast(ps)
      setDeleteAllConfirmText('')
      setAlsoRemoveDemos(false)
    }
    setDeleteConfirm({ isOpen: false, ids: [], type: 'single' })
  }

  return (
    <div className="min-h-full pb-10">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">My Patients</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {userPatients.length === 0
                ? 'No patients yet'
                : `${userPatients.length} patient${userPatients.length === 1 ? '' : 's'} entered`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {userPatients.length > 0 && !isSelectionMode && (
              <div className="group relative">
                <button className="btn-ghost text-xs border border-white/5 bg-white/5 mr-2">
                  Options ▾
                </button>
                <div className="absolute right-2 top-full mt-1 hidden group-hover:block bg-slate-900 border border-slate-700 rounded shadow-xl z-50 overflow-hidden w-48">
                  <button onClick={() => setIsSelectionMode(true)} className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">
                    Select Patients
                  </button>
                  {userPatients.some(p => p.isDemo) && (
                    <button onClick={removeDemoPatients} className="w-full text-left px-4 py-2 text-xs text-fuchsia-400 hover:bg-slate-800">
                      Remove Demo Cases
                    </button>
                  )}
                  <button onClick={() => setDeleteConfirm({ isOpen: true, ids: [], type: 'all' })} className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-slate-800">
                    Delete All Patients
                  </button>
                </div>
              </div>
            )}

            {isSelectionMode && (
              <>
                <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="btn-ghost text-xs mr-2">
                  Cancel
                </button>
                {selectedIds.size > 0 && (
                  <button 
                    onClick={() => setDeleteConfirm({ isOpen: true, ids: Array.from(selectedIds), type: 'multiple' })} 
                    className="btn-secondary text-xs mr-2 border-red-500/50 text-red-400 hover:bg-red-500/10"
                  >
                    Delete Selected ({selectedIds.size})
                  </button>
                )}
              </>
            )}

            <button onClick={() => loadDemoPatients(DEMO_PATIENTS)} className="btn-secondary text-xs mr-2">
              Load 3 demo cases
            </button>
            <button id="dashboard-new-patient-btn" onClick={() => navigate('/new-patient')} className="btn-primary">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Patient Case</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {userPatients.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users}         label="Total Patients" value={stats.total}     color="brand" />
            <StatCard icon={AlertTriangle} label="Critical Risk"  value={stats.critical}  color="red"   />
            <StatCard icon={Activity}      label="High Risk"      value={stats.high}       color="orange"/>
            <StatCard icon={Eye}           label="With Alerts"    value={stats.withAlerts} color="amber" />
          </div>
        )}

        {userPatients.length === 0 ? (
          <EmptyState onAdd={() => navigate('/new-patient')} onLoadDemos={() => loadDemoPatients(DEMO_PATIENTS)} />
        ) : (
          <>
            <div className="glass-card p-4 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="search-input"
                  type="text"
                  placeholder="Search by name or eye..."
                  value={filterState.search}
                  onChange={e => setFilter({ search: e.target.value })}
                  className="input-field pl-9"
                />
              </div>

              <select value={filterState.laterality} onChange={e => setFilter({ laterality: e.target.value as any })} className="input-field w-28">
                <option value="Both">Both Eyes</option>
                <option value="OD">OD only</option>
                <option value="OS">OS only</option>
              </select>

              <select value={filterState.riskLevel} onChange={e => setFilter({ riskLevel: e.target.value as any })} className="input-field w-32">
                <option value="All">All Risks</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Moderate">Moderate</option>
                <option value="Low">Low</option>
              </select>

              <select value={filterState.sortBy} onChange={e => setFilter({ sortBy: e.target.value as any })} className="input-field w-44 hidden sm:block">
                <option value="recent">Most Recent</option>
                <option value="risk-desc">Highest Risk</option>
                <option value="age-desc">Oldest First</option>
                <option value="iop-desc">Highest IOP</option>
                <option value="rnfl-asc">Thinnest RNFL</option>
              </select>

              <button onClick={resetFilter} className="btn-ghost text-xs">Reset</button>

              {isSelectionMode && filtered.length > 0 && (
                <div className="flex items-center ml-auto gap-2">
                  <label className="text-sm text-slate-300 flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.size === filtered.length} 
                      onChange={toggleSelectAll} 
                      className="mr-2 accent-brand-500 w-4 h-4"
                    />
                    Select All
                  </label>
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="glass-card py-12 flex flex-col items-center gap-3 text-center">
                <Eye className="w-8 h-8 text-slate-600" />
                <div className="text-slate-400 font-medium">No patients match your filters</div>
                <div className="text-sm text-slate-500">Try adjusting your search or filter criteria</div>
                <button onClick={resetFilter} className="btn-ghost text-sm mt-1">Clear filters</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(p => (
                  <PatientCard 
                    key={p.id} 
                    patient={p} 
                    analysis={analysisCache[p.id]} 
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedIds.has(p.id)}
                    onToggleSelect={() => toggleSelect(p.id)}
                    onDelete={() => setDeleteConfirm({ isOpen: true, ids: [p.id], type: 'single' })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDeleteConfirm({ isOpen: false, ids: [], type: 'single' })}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                {deleteConfirm.type === 'single' ? 'Delete Patient?' : 
                 deleteConfirm.type === 'multiple' ? `Delete ${deleteConfirm.ids.length} Patients?` :
                 'Delete All My Patients?'}
              </h3>
              
              <div className="text-slate-300 text-sm space-y-4">
                {deleteConfirm.type === 'single' && (
                  <p>Delete <strong>{userPatients.find(x => x.id === deleteConfirm.ids[0])?.name || deleteConfirm.ids[0]}</strong>? This permanently removes their visits, scans, analysis and notes from this device.</p>
                )}
                {deleteConfirm.type === 'multiple' && (
                  <p>Are you sure you want to delete {deleteConfirm.ids.length} selected patients? This permanently removes their data.</p>
                )}
                {deleteConfirm.type === 'all' && (
                  <>
                    <p>Are you sure you want to permanently delete ALL manually entered patients?</p>
                    <label className="flex items-center gap-2 mt-4 cursor-pointer">
                      <input type="checkbox" checked={alsoRemoveDemos} onChange={e => setAlsoRemoveDemos(e.target.checked)} className="accent-red-500 w-4 h-4" />
                      Also remove demo cases
                    </label>
                    <div className="mt-4 bg-black/30 p-3 rounded border border-slate-800">
                      <label className="block text-xs text-slate-500 mb-1">Type DELETE to confirm:</label>
                      <input 
                        type="text" 
                        value={deleteAllConfirmText} 
                        onChange={e => setDeleteAllConfirmText(e.target.value)} 
                        className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm" 
                        placeholder="DELETE"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-950 flex justify-end gap-3 border-t border-slate-800">
              <button onClick={() => setDeleteConfirm({ isOpen: false, ids: [], type: 'single' })} className="btn-ghost">
                Cancel
              </button>
              <button 
                onClick={executeDelete} 
                disabled={deleteConfirm.type === 'all' && deleteAllConfirmText !== 'DELETE'}
                className="btn-primary bg-red-600 hover:bg-red-500 border-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-5">
          <span className="text-sm font-medium">
            {undoToast.patients.length === 1 ? 'Patient deleted.' : `${undoToast.patients.length} patients deleted.`}
          </span>
          <button onClick={handleUndo} className="text-brand-400 hover:text-brand-300 font-bold text-sm underline">
            Undo
          </button>
          <button onClick={() => setUndoToast(null)} className="text-slate-500 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    brand:  'text-brand-400 bg-brand-900/30',
    red:    'text-red-400 bg-red-900/30',
    orange: 'text-orange-400 bg-orange-900/30',
    amber:  'text-amber-400 bg-amber-900/30',
  }
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', colorMap[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-white font-mono">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}

function EmptyState({ onAdd, onLoadDemos }: { onAdd: () => void, onLoadDemos: () => void }) {
  return (
    <div className="glass-card py-20 flex flex-col items-center gap-5 text-center">
      <div className="w-20 h-20 rounded-2xl bg-brand-900/20 border border-brand-700/20 flex items-center justify-center">
        <Users className="w-10 h-10 text-brand-600" />
      </div>
      <div>
        <div className="text-slate-200 font-semibold text-lg">No patients yet</div>
        <div className="text-sm text-slate-500 mt-1">
          Click the button below to enter your first patient case, or load synthetic data to explore the app.
        </div>
      </div>
      <div className="flex gap-3 mt-2">
        <button onClick={onLoadDemos} className="btn-secondary">Load 3 demo cases</button>
        <button onClick={onAdd} className="btn-primary">
          <Plus className="w-4 h-4" />
          New Patient Case
        </button>
      </div>
    </div>
  )
}
