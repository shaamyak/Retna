import { useParams, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { ArrowLeft, Edit, Copy, AlertTriangle, CheckCircle, Info, TrendingDown, Eye, Activity, Printer, Beaker, Trash2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import type { DatasetPatient, ManualPatient, PatientAnalysis, RiskLevel } from '@/types'
import clsx from 'clsx'
import ForecastChart from '@/components/charts/ForecastChart'
import RNFLProjectionChart from '@/components/charts/RNFLProjectionChart'
import { TARGET_IOP_DEFAULT } from '@/config/scenarios'
import RNFLPanel from '@/components/panels/RNFLPanel'
import IOPPanel from '@/components/panels/IOPPanel'
import VFPanel from '@/components/panels/VFPanel'
import FundusViewer from '@/components/panels/FundusViewer'
import OpticNerve3D from '@/components/panels/OpticNerve3D'
import EvidenceBreakdown from '@/components/panels/EvidenceBreakdown'
import AlertsPanel from '@/components/panels/AlertsPanel'
import AICompanionPanel from '@/components/panels/AICompanionPanel'
import ValidationPanel from '@/components/panels/ValidationPanel'

const riskBg: Record<RiskLevel, string> = {
  Low:      'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  Moderate: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  High:     'bg-orange-500/10 border-orange-500/20 text-orange-300',
  Critical: 'bg-red-500/10 border-red-500/30 text-red-300',
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { datasetPatients, userPatients, getAnalysis, deletePatient } = useAppStore()
  const [copied, setCopied] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = () => {
    if (patient) {
      deletePatient(patient.id)
      navigate('/', { state: { deletedPatient: patient } })
    }
  }

  const patient: DatasetPatient | ManualPatient | null = useMemo(() => {
    if (!id) return null
    return datasetPatients.find(p => p.id === id) ||
           userPatients.find(p => p.id === id) ||
           null
  }, [id, datasetPatients, userPatients])

  const analysis: PatientAnalysis | null = id ? getAnalysis(id) ?? null : null

  const copyReport = () => {
    if (!analysis || !patient) return
    const text = [
      `GlaucoMap Report — ${new Date().toLocaleDateString()}`,
      `Patient: ${patient.source === 'dataset' ? `Subject ${(patient as DatasetPatient).subjectNumber}` : (patient as ManualPatient).name}`,
      `Eye: ${patient.laterality} | Age: ${patient.age}`,
      `Risk Level: ${analysis.riskLevel}`,
      ``,
      `AI Summary:`,
      analysis.aiSummary,
      ``,
      `Evidence Factors:`,
      ...analysis.evidenceFactors.map(f => `• ${f.factor}: ${f.value} ${f.unit} — ${f.contribution}`),
      ``,
      `Alerts:`,
      ...analysis.alerts.map(a => `⚠ [${a.severity.toUpperCase()}] ${a.title}: ${a.detail}`),
      ``,
      `DISCLAIMER: This is a decision-support prototype only. Not a diagnostic device.`,
      `All clinical decisions must be made by qualified ophthalmologists.`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-slate-400 text-lg font-medium">Patient not found</div>
          <button onClick={() => navigate('/')} className="btn-secondary mt-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const isDataset = patient.source === 'dataset'
  const ds = isDataset ? patient as DatasetPatient : null
  const mp = !isDataset ? patient as ManualPatient : null
  const riskLevel = analysis?.riskLevel ?? 'Low'
  const targetIOP = isDataset ? TARGET_IOP_DEFAULT : (mp!.targetIOP || TARGET_IOP_DEFAULT)
  const baselineRnfl = isDataset ? ds!.rnfl.mean : (mp!.rnflVisits.length > 0 ? mp!.rnflVisits[mp!.rnflVisits.length - 1].sectors.mean : null)

  const displayName = isDataset
    ? `Subject ${ds!.subjectNumber} · ${ds!.laterality}`
    : `${mp!.name} · ${mp!.laterality}`

  return (
    <div className="min-h-full pb-12">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button id="back-btn" onClick={() => navigate(-1)} className="btn-ghost">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">{displayName}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={clsx('badge border', riskBg[riskLevel])}>
                  {riskLevel} Risk
                </span>
                <span className={clsx(
                  'badge',
                  isDataset ? 'bg-blue-900/40 text-blue-300 border border-blue-700/30' :
                    'bg-purple-900/40 text-purple-300 border border-purple-700/30'
                )}>
                  {isDataset ? 'Dataset' : 'Manually Entered'}
                </span>
                {!isDataset && mp!.entryDate && (
                  <span className="text-xs text-slate-500">
                    Added {new Date(mp!.entryDate).toLocaleDateString()}
                  </span>
                )}
                {isDataset && ds!.progressionFlags.any && (
                  <span className="badge bg-purple-900/40 text-purple-300 border border-purple-700/30">
                    Progressed (Dataset)
                  </span>
                )}
                {!isDataset && mp!.isDemo && (
                  <span className="badge bg-fuchsia-900/40 text-fuchsia-300 border border-fuchsia-700/30">
                    Demo case (synthetic data)
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isDataset && (
              <>
                <button
                  id="delete-patient-btn"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-secondary border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  id="edit-patient-btn"
                onClick={() => navigate(`/edit-patient/${patient.id}`)}
                className="btn-secondary"
              >
                <Edit className="w-4 h-4" />
                Edit Patient
              </button>
              </>
            )}
            <button
              id="run-what-if-btn"
              onClick={() => navigate(`/simulator?patientId=${patient.id}`)}
              className="btn-secondary"
            >
              <Beaker className="w-4 h-4 text-purple-400" />
              Run what-if
            </button>
            <button
              id="print-report-btn"
              onClick={() => navigate(`/patient/${patient.id}/print`)}
              className="btn-secondary"
            >
              <Printer className="w-4 h-4" />
              Print report
            </button>
            <button
              id="copy-report-btn"
              onClick={copyReport}
              className="btn-secondary"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Disclaimer bar */}
      <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-amber-900/20 border border-amber-700/30 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-300/90">
          <strong>Decision-Support Prototype:</strong> All outputs are generated from structured data and statistical models.
          This tool does not diagnose glaucoma. Every risk indication must be verified by a qualified ophthalmologist.
        </p>
      </div>

      <div className="px-6 mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column (2/3) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Demographics */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4">Patient Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoField label="Age" value={`${patient.age} years`} />
              <InfoField label="Gender" value={patient.gender === 'M' ? 'Male' : 'Female'} />
              <InfoField label="Eye" value={patient.laterality} />
              <InfoField label="Category" value={
                isDataset ? ds!.category : mp!.category
              } />
              {isDataset && <InfoField label="Total Visits" value={ds!.totalVisits.toString()} />}
              {isDataset && ds!.cct && <InfoField label="CCT" value={`${ds!.cct} µm`} />}
              {isDataset && ds!.derivedStage && (
                <InfoField label="Stage (derived)" value={`${ds!.derivedStage} *`} dimmed />
              )}
              {!isDataset && mp!.stage && <InfoField label="Stage" value={mp!.stage} />}
              {!isDataset && mp!.cct && <InfoField label="CCT" value={`${mp!.cct} µm`} />}
              {analysis?.modelProbability != null && (
                <InfoField label="Model Prob." value={`${(analysis.modelProbability * 100).toFixed(0)}%`} />
              )}
            </div>
            {isDataset && (
              <p className="text-[10px] text-slate-600 mt-3">* Stage derived from baseline mean sensitivity tercile; labeled "approximate".</p>
            )}
            {!isDataset && mp!.vfEntries.length === 0 && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-slate-800/60 text-xs text-slate-500 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Add visual field data for more accurate 24-month prediction.
              </div>
            )}
            {!isDataset && mp!.rnflVisits.length < 2 && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-slate-800/60 text-xs text-slate-500 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Add a follow-up visit to calculate thinning rate.
              </div>
            )}
          </div>

          {/* Fundus Viewer */}
          <FundusViewer patient={patient} />

          {/* RNFL Panel */}
          <RNFLPanel patient={patient} />

          {/* IOP Panel */}
          <IOPPanel patient={patient} analysis={analysis} />

          {/* VF Panel */}
          <VFPanel patient={patient} />

          {/* 24-Month Forecast */}
          {analysis && (
            <div className="glass-card p-5 space-y-4">
              <h2 className="section-title flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-brand-400" />
                24-Month Progression Forecast
              </h2>
              <p className="text-xs text-slate-500">
                Three scenarios: current treatment rate · intensified (IOP lowered ~5 mmHg) · untreated.
                Slopes assume ~10% change per mmHg IOP change (OHTS/EMGT literature).
                Confidence bands are ±1.96 SE. Shaded region is untreated scenario.
              </p>
              {analysis.vfForecast && (
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Visual Field {isDataset ? '(MS — Mean Sensitivity; ~comparable to MD, not identical)' : '(MD)'}
                    {analysis.vfForecast.confidence !== 'high' && (
                      <span className="badge bg-amber-900/40 text-amber-300 border-amber-700/30 ml-1">
                        {analysis.vfForecast.confidence} confidence
                      </span>
                    )}
                  </div>
                  {analysis.vfForecast.confidenceNote && (
                    <p className="text-[10px] text-amber-400/80 mb-2">{analysis.vfForecast.confidenceNote}</p>
                  )}
                  <ForecastChart data={analysis.vfForecast} yLabel="dB" />
                </div>
              )}
              {analysis.rnflForecast && (
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    RNFL Thickness Projection
                  </div>
                  <RNFLProjectionChart 
                    baselineRnfl={baselineRnfl} 
                    currentIop={analysis.meanIOP} 
                    targetIop={targetIOP} 
                    measuredSlope={analysis.rnflThinningRate} 
                  />
                </div>
              )}
            </div>
          )}

          {/* Retrospective validation (dataset only) */}
          {isDataset && analysis && (
            <ValidationPanel patient={ds!} analysis={analysis} />
          )}
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* 3D Optic Nerve */}
          <OpticNerve3D patient={patient} />

          {/* Evidence Breakdown */}
          {analysis && <EvidenceBreakdown analysis={analysis} />}

          {/* Alerts */}
          {analysis && <AlertsPanel alerts={analysis.alerts} />}

          {/* AI Summary */}
          {analysis && <AICompanionPanel analysis={analysis} patient={patient} />}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                Delete Patient?
              </h3>
              <p className="text-slate-300 text-sm">
                Delete <strong>{(!isDataset && patient) ? (patient as any).name : patient?.id}</strong>? This permanently removes their visits, scans, analysis and notes from this device.
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-950 flex justify-end gap-3 border-t border-slate-800">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-ghost">
                Cancel
              </button>
              <button onClick={handleDelete} className="btn-primary bg-red-600 hover:bg-red-500 border-red-500 text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoField({ label, value, dimmed }: { label: string; value: string; dimmed?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={clsx('text-sm font-medium mt-0.5', dimmed ? 'text-slate-500 italic' : 'text-slate-200')}>
        {value}
      </div>
    </div>
  )
}
