import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ManualPatient, DatasetPatient, PatientAnalysis, FilterState, ModelData } from '@/types'
import { analyzeManualPatient, analyzeDatasetPatient, setModelData } from '@/lib/riskEngine'
import { TARGET_IOP_DEFAULT } from '@/config/scenarios'

// ─── App Store ────────────────────────────────────────────────────────────────

interface AppState {
  // Dataset patients (loaded from JSON, read-only)
  datasetPatients: DatasetPatient[]
  datasetLoaded: boolean

  // Manual patients (persisted)
  userPatients: ManualPatient[]
  draftPatient: Partial<ManualPatient> | null

  // Analysis cache
  analysisCache: Record<string, PatientAnalysis>

  // Model
  modelData: ModelData | null

  // UI
  filterState: FilterState
  targetIOP: number

  // Actions
  loadDatasetPatients: (patients: DatasetPatient[]) => void
  loadModelData: (model: ModelData) => void

  addPatient: (patient: ManualPatient) => void
  updatePatient: (id: string, updates: Partial<ManualPatient>) => void
  deletePatient: (id: string) => void
  deleteMultiplePatients: (ids: string[]) => void
  deleteAllPatients: (includeDemo: boolean) => void
  saveDraft: (draft: Partial<ManualPatient>) => void
  clearDraft: () => void

  loadDemoPatients: (patients: ManualPatient[]) => void
  removeDemoPatients: () => void

  runAnalysis: (patientId: string) => PatientAnalysis | null
  getAnalysis: (patientId: string) => PatientAnalysis | null

  setFilter: (filter: Partial<FilterState>) => void
  resetFilter: () => void
  setTargetIOP: (iop: number) => void

  whatIfScenarios: Record<string, any>
  saveWhatIfScenario: (patientId: string, scenario: any) => void
}

const defaultFilter: FilterState = {
  search: '',
  laterality: 'Both',
  riskLevel: 'All',
  sortBy: 'recent',
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      datasetPatients: [],
      datasetLoaded: false,
      userPatients: [],
      draftPatient: null,
      analysisCache: {},
      modelData: null,
      filterState: defaultFilter,
      targetIOP: TARGET_IOP_DEFAULT,
      whatIfScenarios: {},

      loadDatasetPatients: (patients) => {
        set({ datasetPatients: patients, datasetLoaded: true })
        // Run analysis for all dataset patients asynchronously
        setTimeout(() => {
          const cache: Record<string, PatientAnalysis> = {}
          for (const p of patients) {
            cache[p.id] = analyzeDatasetPatient(p, get().targetIOP)
          }
          set(state => ({ analysisCache: { ...state.analysisCache, ...cache } }))
        }, 0)
      },

      loadModelData: (model) => {
        set({ modelData: model })
        setModelData(model)
      },

      addPatient: (patient) => {
        set(state => ({ userPatients: [...state.userPatients, patient] }))
        // Automatically run analysis
        get().runAnalysis(patient.id)
      },

      updatePatient: (id, updates) => {
        set(state => ({
          userPatients: state.userPatients.map(p => p.id === id ? { ...p, ...updates } : p)
        }))
        get().runAnalysis(id)
      },

      deletePatient: (id) => {
        set(state => {
          const newWhatIf = { ...state.whatIfScenarios }
          delete newWhatIf[id]
          return {
            userPatients: state.userPatients.filter(p => p.id !== id),
            analysisCache: Object.fromEntries(
              Object.entries(state.analysisCache).filter(([k]) => k !== id)
            ),
            whatIfScenarios: newWhatIf,
            draftPatient: state.draftPatient?.id === id ? null : state.draftPatient
          }
        })
      },
      
      deleteMultiplePatients: (ids) => {
        const idSet = new Set(ids)
        set(state => {
          const newWhatIf = { ...state.whatIfScenarios }
          ids.forEach(id => delete newWhatIf[id])
          return {
            userPatients: state.userPatients.filter(p => !idSet.has(p.id)),
            analysisCache: Object.fromEntries(
              Object.entries(state.analysisCache).filter(([k]) => !idSet.has(k))
            ),
            whatIfScenarios: newWhatIf,
            draftPatient: state.draftPatient && idSet.has(state.draftPatient.id as string) ? null : state.draftPatient
          }
        })
      },
      
      deleteAllPatients: (includeDemo) => {
        set(state => {
          const keepPatients = includeDemo ? [] : state.userPatients.filter(p => p.isDemo)
          const keepIds = new Set(keepPatients.map(p => p.id))
          
          const newWhatIf = { ...state.whatIfScenarios }
          Object.keys(newWhatIf).forEach(k => { if (!keepIds.has(k)) delete newWhatIf[k] })
          
          return {
            userPatients: keepPatients,
            analysisCache: Object.fromEntries(
              Object.entries(state.analysisCache).filter(([k]) => keepIds.has(k))
            ),
            whatIfScenarios: newWhatIf,
            draftPatient: state.draftPatient && !keepIds.has(state.draftPatient.id as string) ? null : state.draftPatient
          }
        })
      },

      loadDemoPatients: (patients) => {
        set(state => {
          const filtered = state.userPatients.filter(p => !p.isDemo)
          return { userPatients: [...filtered, ...patients] }
        })
        patients.forEach(p => get().runAnalysis(p.id))
      },

      removeDemoPatients: () => {
        set(state => {
          const demoIds = new Set(state.userPatients.filter(p => p.isDemo).map(p => p.id))
          return {
            userPatients: state.userPatients.filter(p => !p.isDemo),
            analysisCache: Object.fromEntries(
              Object.entries(state.analysisCache).filter(([k]) => !demoIds.has(k))
            )
          }
        })
      },

      saveDraft: (draft) => set({ draftPatient: draft }),
      clearDraft: () => set({ draftPatient: null }),

      runAnalysis: (patientId) => {
        const state = get()

        // Check dataset patients
        const datasetPat = state.datasetPatients.find(p => p.id === patientId)
        if (datasetPat) {
          const analysis = analyzeDatasetPatient(datasetPat, state.targetIOP)
          set(s => ({ analysisCache: { ...s.analysisCache, [patientId]: analysis } }))
          return analysis
        }

        // Check user patients
        const userPat = state.userPatients.find(p => p.id === patientId)
        if (userPat) {
          const analysis = analyzeManualPatient(userPat, state.targetIOP)
          set(s => ({ analysisCache: { ...s.analysisCache, [patientId]: analysis } }))
          return analysis
        }

        return null
      },

      getAnalysis: (patientId) => {
        const cached = get().analysisCache[patientId]
        if (cached) return cached
        return get().runAnalysis(patientId)
      },

      setFilter: (filter) => {
        set(state => ({ filterState: { ...state.filterState, ...filter } }))
      },

      resetFilter: () => set({ filterState: defaultFilter }),

      setTargetIOP: (iop) => {
        set({ targetIOP: iop })
        // Re-run analysis with new target IOP
        const { datasetPatients, userPatients } = get()
        const cache: Record<string, PatientAnalysis> = {}
        for (const p of datasetPatients) {
          cache[p.id] = analyzeDatasetPatient(p, iop)
        }
        for (const p of userPatients) {
          cache[p.id] = analyzeManualPatient(p, iop)
        }
        set({ analysisCache: cache })
      },
      saveWhatIfScenario: (patientId, scenario) => {
        set((state) => ({
          whatIfScenarios: {
            ...state.whatIfScenarios,
            [patientId]: scenario
          }
        }))
      },
    }),
    {
      name: 'glaucoma-user-patients',
      partialize: (state) => ({
        userPatients: state.userPatients,
        draftPatient: state.draftPatient,
        targetIOP: state.targetIOP,
        filterState: state.filterState,
        whatIfScenarios: state.whatIfScenarios,
      }),
    }
  )
)
