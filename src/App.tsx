import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import PatientDetail from '@/pages/PatientDetail'
import ProgressionLab from '@/pages/ProgressionLab'
import AICompanion from '@/pages/AICompanion'
import PatientFormWizard from '@/pages/PatientFormWizard'
import PrintReportView from '@/pages/PrintReportView'
import WhatIfSimulator from '@/pages/WhatIfSimulator'
import { useAppStore } from '@/store/appStore'

export default function App() {
  const { loadDatasetPatients, loadModelData, datasetLoaded } = useAppStore()

  useEffect(() => {
    if (!datasetLoaded) {
      // Load dataset patients
      fetch('/data/patients.json')
        .then(r => r.json())
        .then(data => loadDatasetPatients(data))
        .catch(err => {
          console.warn('patients.json not found — run Python pipeline first.', err)
          loadDatasetPatients([])
        })
    }

    // Load model data
    fetch('/data/model.json')
      .then(r => r.json())
      .then(model => loadModelData(model))
      .catch(() => {
        console.warn('model.json not found — run Python pipeline first.')
      })
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="patient/:id" element={<PatientDetail />} />
        <Route path="new-patient" element={<PatientFormWizard />} />
        <Route path="edit-patient/:id" element={<PatientFormWizard />} />
        <Route path="progression-lab" element={<ProgressionLab />} />
        <Route path="ai-companion" element={<AICompanion />} />
        <Route path="simulator" element={<WhatIfSimulator />} />
      </Route>
      <Route path="/patient/:id/print" element={<PrintReportView />} />
    </Routes>
  )
}
