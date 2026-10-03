import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import type { ManualPatient, DatasetPatient, PatientAnalysis } from '@/types'
import { analyzeManualPatient, analyzeDatasetPatient } from '@/lib/riskEngine'
import { TARGET_IOP_DEFAULT, SCENARIOS } from '@/config/scenarios'
import RNFLProjectionChart from '@/components/charts/RNFLProjectionChart'
import ForecastChart from '@/components/charts/ForecastChart'
import OpticNerve3D from '@/components/panels/OpticNerve3D'
import { Activity, Beaker, RotateCcw, AlertTriangle, ArrowRight, Save, Copy } from 'lucide-react'
import clsx from 'clsx'

const EyeStatus = ({ riskLevel }: { riskLevel: string }) => {
  let color = '#10b981' // emerald
  let pulseClass = ''
  if (riskLevel === 'Moderate') color = '#f59e0b' // amber
  if (riskLevel === 'High') color = '#f97316' // orange
  if (riskLevel === 'Critical') {
    color = '#ef4444' // red
    pulseClass = 'animate-pulse'
  }

  return (
    <svg width="24" height="24" viewBox="0 0 100 100" className="inline-block relative ml-3">
      <style>{`
        @keyframes slowBlink {
          0%, 96%, 100% { transform: scaleY(1); }
          98% { transform: scaleY(0.1); }
        }
        .eye-blink { transform-origin: center; animation: slowBlink 5s infinite; }
      `}</style>
      <g className="eye-blink">
        <path d="M 10 50 Q 50 10 90 50 Q 50 90 10 50 Z" fill="none" stroke={color} strokeWidth="4" />
        <circle cx="50" cy="50" r="15" fill={color} className={pulseClass} />
        <circle cx="55" cy="45" r="4" fill="white" />
      </g>
    </svg>
  )
}

const EyeIntro = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onComplete])

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 cursor-pointer"
      onClick={onComplete}
    >
      <style>{`
        @keyframes openEye {
          0% { transform: scaleY(0); }
          50%, 100% { transform: scaleY(1); }
        }
        @keyframes dilatePupil {
          0%, 40% { transform: scale(1); }
          60%, 100% { transform: scale(1.3); }
        }
        @keyframes scanRing {
          0% { stroke-dashoffset: 200; opacity: 0; }
          20% { opacity: 1; }
          80% { stroke-dashoffset: -200; opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes glowNerve {
          0%, 50% { fill-opacity: 0; }
          75% { fill-opacity: 0.8; }
          100% { fill-opacity: 0; }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(10px); }
          20%, 80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .eye-motion * { animation: none !important; transform: none !important; opacity: 1 !important; }
        }
      `}</style>
      
      <svg width="120" height="120" viewBox="0 0 100 100" className="eye-motion">
        <g style={{ transformOrigin: 'center', animation: 'openEye 2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}>
          <path d="M 5 50 Q 50 15 95 50 Q 50 85 5 50 Z" fill="#0f172a" stroke="#3b82f6" strokeWidth="2" />
          <circle cx="50" cy="50" r="22" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1" />
          <circle cx="50" cy="50" r="10" fill="#000" style={{ transformOrigin: 'center', animation: 'dilatePupil 2s ease-in-out forwards' }} />
          <circle cx="58" cy="42" r="4" fill="white" opacity="0.8" />
          <ellipse cx="50" cy="50" rx="20" ry="40" fill="none" stroke="#60a5fa" strokeWidth="2" opacity="0" strokeDasharray="200" style={{ animation: 'scanRing 2s linear forwards' }} />
          <circle cx="85" cy="50" r="6" fill="#60a5fa" fillOpacity="0" style={{ animation: 'glowNerve 2s ease-in-out forwards' }} />
        </g>
      </svg>

      <div style={{ animation: 'fadeInOut 2s forwards' }} className="text-center mt-6 eye-motion">
        <h2 className="text-2xl font-bold text-white tracking-tight">What-If Simulator</h2>
        <p className="text-slate-400 text-sm mt-1">Explore hypothetical scenarios</p>
      </div>
    </div>
  )
}

// Basic HTML Sector Heat Map for simulator side-by-side
function SectorHeatMapPrint({ sectors, eye }: { sectors: any, eye: string }) {
  if (!sectors) return <div className="w-40 h-40 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-full border-4 border-slate-700">No Data</div>
  const s = sectors
  return (
    <div className="relative w-40 h-40 mx-auto rounded-full border-4 border-slate-700 flex items-center justify-center text-sm font-bold bg-slate-800 text-slate-200">
      <div className="absolute top-2 left-0 right-0 text-center">{s.superior?.toFixed(0) || '-'}</div>
      <div className="absolute bottom-2 left-0 right-0 text-center">{s.inferior?.toFixed(0) || '-'}</div>
      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-center">
        {eye === 'OD' ? (s.temporal?.toFixed(0) || '-') : (s.nasal?.toFixed(0) || '-')}
        <span className="block text-[8px] font-normal text-slate-400 -mt-1">{eye === 'OD' ? 'T' : 'N'}</span>
      </div>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-center">
        {eye === 'OD' ? (s.nasal?.toFixed(0) || '-') : (s.temporal?.toFixed(0) || '-')}
        <span className="block text-[8px] font-normal text-slate-400 -mt-1">{eye === 'OD' ? 'N' : 'T'}</span>
      </div>
      <div className="text-xl flex flex-col items-center">
        {s.mean?.toFixed(0) || '-'}
        <span className="text-[9px] font-normal text-slate-400">AVG</span>
      </div>
    </div>
  )
}

export default function WhatIfSimulator() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedId = searchParams.get('patientId')

  const { userPatients, datasetPatients, getAnalysis, saveWhatIfScenario } = useAppStore()
  
  const allPatients = useMemo(() => {
    return [...userPatients, ...datasetPatients]
  }, [userPatients, datasetPatients])

  const [selectedId, setSelectedId] = useState<string>(preselectedId || (allPatients.length > 0 ? allPatients[0].id : ''))

  const patient = useMemo(() => allPatients.find(p => p.id === selectedId) || null, [allPatients, selectedId])
  const isDataset = patient?.source === 'dataset'
  
  const originalAnalysis = patient ? getAnalysis(patient.id) : null

  // Simulator Inputs
  const [showIntro, setShowIntro] = useState(true)
  const [iopChange, setIopChange] = useState<number>(0)
  const [targetIOP, setTargetIOP] = useState<number>(TARGET_IOP_DEFAULT)
  const [rnflChange, setRnflChange] = useState<number>(0)
  const [mdChange, setMdChange] = useState<number>(0)
  const [adherence, setAdherence] = useState<number>(100)
  const [horizonMonths, setHorizonMonths] = useState<number>(24)

  // Initialize from patient data when patient changes
  useEffect(() => {
    if (patient) {
      setIopChange(0)
      setRnflChange(0)
      setMdChange(0)
      setAdherence(100)
      setHorizonMonths(24)
      if (isDataset) {
        setTargetIOP(TARGET_IOP_DEFAULT)
      } else {
        setTargetIOP((patient as ManualPatient).targetIOP || TARGET_IOP_DEFAULT)
      }
    }
  }, [patient])

  const simulatedPatient = useMemo(() => {
    if (!patient) return null

    // Clone deep enough to modify
    const clone = JSON.parse(JSON.stringify(patient))
    
    // Apply IOP change scaled by adherence
    const effectiveIopChange = iopChange * (adherence / 100)
    
    if (isDataset) {
      const ds = clone as DatasetPatient
      // Modify visits
      ds.visits = ds.visits.map(v => ({
        ...v,
        iop: v.iop != null ? v.iop + effectiveIopChange : null,
        ms: v.ms != null && mdChange !== 0 ? v.ms + mdChange : v.ms
      }))
      if (ds.rnfl && ds.rnfl.mean != null && rnflChange !== 0) {
        const factor = (ds.rnfl.mean + rnflChange) / ds.rnfl.mean
        ds.rnfl.mean += rnflChange
        ds.rnfl.superior = ds.rnfl.superior != null ? ds.rnfl.superior * factor : null
        ds.rnfl.inferior = ds.rnfl.inferior != null ? ds.rnfl.inferior * factor : null
        ds.rnfl.nasal = ds.rnfl.nasal != null ? ds.rnfl.nasal * factor : null
        ds.rnfl.temporal = ds.rnfl.temporal != null ? ds.rnfl.temporal * factor : null
      }
      return ds
    } else {
      const mp = clone as ManualPatient
      mp.targetIOP = targetIOP
      mp.iopReadings = mp.iopReadings.map(r => ({ ...r, value: r.value + effectiveIopChange }))
      
      if (mp.rnflVisits.length > 0 && rnflChange !== 0) {
        const last = mp.rnflVisits[mp.rnflVisits.length - 1]
        if (last.sectors.mean != null) {
          const factor = (last.sectors.mean + rnflChange) / last.sectors.mean
          last.sectors.mean += rnflChange
          last.sectors.superior = last.sectors.superior != null ? last.sectors.superior * factor : null
          last.sectors.inferior = last.sectors.inferior != null ? last.sectors.inferior * factor : null
          last.sectors.nasal = last.sectors.nasal != null ? last.sectors.nasal * factor : null
          last.sectors.temporal = last.sectors.temporal != null ? last.sectors.temporal * factor : null
        }
      }
      
      if (mp.vfEntries.length > 0 && mdChange !== 0) {
        const last = mp.vfEntries[mp.vfEntries.length - 1]
        if (last.md != null) {
          last.md += mdChange
        }
      }
      
      return mp
    }
  }, [patient, iopChange, adherence, mdChange, rnflChange, targetIOP, isDataset])

  const simulatedAnalysis = useMemo(() => {
    if (!simulatedPatient) return null
    if (simulatedPatient.source === 'dataset') {
      return analyzeDatasetPatient(simulatedPatient as DatasetPatient)
    } else {
      return analyzeManualPatient(simulatedPatient as ManualPatient, targetIOP)
    }
  }, [simulatedPatient, targetIOP])

  if (allPatients.length === 0) {
    return (
      <>
        {showIntro && <EyeIntro onComplete={() => setShowIntro(false)} />}
        <div className="p-8 text-center text-slate-400">
          Add a patient case to run what-if simulations.
        </div>
      </>
    )
  }

  if (!patient || !originalAnalysis || !simulatedAnalysis) {
    return (
      <>
        {showIntro && <EyeIntro onComplete={() => setShowIntro(false)} />}
        <div className="p-8">Loading...</div>
      </>
    )
  }

  const displayName = isDataset ? `Subject ${(patient as DatasetPatient).subjectNumber}` : (patient as ManualPatient).name

  const riskBg: Record<string, string> = {
    Low: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    Moderate: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    High: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    Critical: 'bg-red-500/10 text-red-400 border border-red-500/20',
  }

  const mpOriginal = patient as ManualPatient;
  const mpSimulated = simulatedPatient as ManualPatient;
  const baselineRnflOriginal = isDataset ? (patient as DatasetPatient).rnfl.mean : (mpOriginal.rnflVisits.length > 0 ? mpOriginal.rnflVisits[mpOriginal.rnflVisits.length - 1].sectors.mean : null)
  const baselineRnflSimulated = isDataset ? (simulatedPatient as DatasetPatient).rnfl.mean : (mpSimulated.rnflVisits.length > 0 ? mpSimulated.rnflVisits[mpSimulated.rnflVisits.length - 1].sectors.mean : null)

  const originalSectors = isDataset ? (patient as DatasetPatient).rnfl : (mpOriginal.rnflVisits.length > 0 ? mpOriginal.rnflVisits[mpOriginal.rnflVisits.length - 1].sectors : {mean:null,superior:null,inferior:null,nasal:null,temporal:null})
  const simulatedSectors = isDataset ? (simulatedPatient as DatasetPatient).rnfl : (mpSimulated.rnflVisits.length > 0 ? mpSimulated.rnflVisits[mpSimulated.rnflVisits.length - 1].sectors : {mean:null,superior:null,inferior:null,nasal:null,temporal:null})

  // Presets
  const applyPreset = (type: string) => {
    if (type === 'lower_iop') { setIopChange(-5); setAdherence(100); }
    if (type === 'iop_spike') { setIopChange(5); setAdherence(100); }
    if (type === 'stop_treatment') { setAdherence(0); setIopChange(5); } // Approximation
    if (type === 'perfect_adherence') { setAdherence(100); }
  }

  const generateSummary = () => {
    let text = ''
    if (iopChange !== 0) {
      text += `Changing IOP by ${iopChange > 0 ? '+' : ''}${iopChange} mmHg (at ${adherence}% adherence) `
    }
    if (rnflChange !== 0) {
      text += `and adjusting baseline RNFL by ${rnflChange > 0 ? '+' : ''}${rnflChange} µm `
    }
    if (text === '') text = 'No changes simulated yet. '
    
    text += `shifts the risk score from ${originalAnalysis.riskScore.toFixed(0)} to ${simulatedAnalysis.riskScore.toFixed(0)}.`
    
    if (originalAnalysis.rnflThinningRate != null && simulatedAnalysis.rnflThinningRate != null && originalAnalysis.rnflThinningRate !== simulatedAnalysis.rnflThinningRate) {
      text += ` Projected RNFL loss rate changes from ${originalAnalysis.rnflThinningRate.toFixed(1)} to ${simulatedAnalysis.rnflThinningRate.toFixed(1)} µm/year (${(simulatedAnalysis.rnflThinningRate / 12).toFixed(2)} µm/mo).`
    }
    return text
  }

  return (
    <div className="flex flex-col h-full bg-slate-950/50 overflow-y-auto relative">
      {showIntro && <EyeIntro onComplete={() => setShowIntro(false)} />}
      
      {/* Disclaimer */}
      <div className="bg-amber-900/40 text-amber-300 px-4 py-2 text-sm flex items-center justify-center gap-2 border-b border-amber-700/50">
        <AlertTriangle className="w-4 h-4" />
        <strong>Hypothetical Simulation:</strong> Uses population-average assumptions. Not a prediction for this patient. Do not use for treatment decisions.
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Header & Patient Select */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <Beaker className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center">
                What-If Simulator
                <EyeStatus riskLevel={simulatedAnalysis.riskLevel} />
              </h1>
              <div className="text-slate-400 text-sm">Explore hypothetical clinical scenarios and their projected outcomes.</div>
            </div>
          </div>
          
          <select 
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {allPatients.map(p => (
              <option key={p.id} value={p.id}>
                {p.source === 'dataset' ? `Subject ${(p as DatasetPatient).subjectNumber}` : (p as ManualPatient).name}
                {!isDataset && (p as ManualPatient).isDemo ? ' (Demo)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-6">
          
          {/* Controls Sidebar (Left) */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-200">Simulation Variables</h3>
                <button onClick={() => { setIopChange(0); setRnflChange(0); setMdChange(0); setAdherence(100); }} className="btn-ghost text-xs">
                  <RotateCcw className="w-3 h-3" /> Reset All
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="flex justify-between text-sm text-slate-300 mb-2">
                    <span>IOP Change (mmHg)</span>
                    <span className="font-mono text-brand-400">{iopChange > 0 ? '+' : ''}{iopChange}</span>
                  </label>
                  <input type="range" min="-15" max="15" step="1" value={iopChange} onChange={e => setIopChange(Number(e.target.value))} className="w-full accent-brand-500" />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>-15</span><span>0</span><span>+15</span></div>
                </div>
                
                <div>
                  <label className="flex justify-between text-sm text-slate-300 mb-2">
                    <span>Target IOP</span>
                    <span className="font-mono text-brand-400">{targetIOP}</span>
                  </label>
                  <input type="range" min="8" max="30" step="1" value={targetIOP} onChange={e => setTargetIOP(Number(e.target.value))} className="w-full accent-brand-500" />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>8</span><span>30</span></div>
                </div>

                <div>
                  <label className="flex justify-between text-sm text-slate-300 mb-2">
                    <span>Treatment Adherence (%)</span>
                    <span className="font-mono text-brand-400">{adherence}%</span>
                  </label>
                  <input type="range" min="0" max="100" step="5" value={adherence} onChange={e => setAdherence(Number(e.target.value))} className="w-full accent-emerald-500" />
                  <div className="text-[10px] text-slate-500 mt-1">Scales the achieved IOP reduction.</div>
                </div>

                <div>
                  <label className="flex justify-between text-sm text-slate-300 mb-2">
                    <span>Baseline RNFL Shift (µm)</span>
                    <span className="font-mono text-brand-400">{rnflChange > 0 ? '+' : ''}{rnflChange}</span>
                  </label>
                  <input type="range" min="-30" max="30" step="1" value={rnflChange} onChange={e => setRnflChange(Number(e.target.value))} className="w-full accent-purple-500" />
                  <div className="text-[10px] text-slate-500 mt-1">Proportionally scales all sectors.</div>
                </div>
                
                <div>
                  <label className="flex justify-between text-sm text-slate-300 mb-2">
                    <span>Baseline MD Shift (dB)</span>
                    <span className="font-mono text-brand-400">{mdChange > 0 ? '+' : ''}{mdChange}</span>
                  </label>
                  <input type="range" min="-10" max="10" step="0.5" value={mdChange} onChange={e => setMdChange(Number(e.target.value))} className="w-full accent-purple-500" />
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <h3 className="font-semibold text-slate-200 mb-3 text-sm">Quick Presets</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => applyPreset('lower_iop')} className="btn-secondary text-xs py-1.5 justify-center">Lower IOP by 5</button>
                <button onClick={() => applyPreset('iop_spike')} className="btn-secondary text-xs py-1.5 justify-center">IOP Spike (+5)</button>
                <button onClick={() => applyPreset('stop_treatment')} className="btn-secondary text-xs py-1.5 justify-center">Stop Treatment</button>
                <button onClick={() => applyPreset('perfect_adherence')} className="btn-secondary text-xs py-1.5 justify-center">100% Adherence</button>
              </div>
            </div>

          </div>

          {/* Results (Right) */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            
            {/* Banner */}
            <div className="glass-card p-6 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 text-center">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Original</div>
                <div className={clsx('px-4 py-2 rounded-lg text-xl font-bold tracking-widest uppercase', riskBg[originalAnalysis.riskLevel])}>
                  {originalAnalysis.riskLevel} ({originalAnalysis.riskScore.toFixed(0)})
                </div>
              </div>
              <ArrowRight className="w-8 h-8 text-slate-600 hidden md:block" />
              <div className="text-center md:hidden w-full border-b border-white/5 my-2"></div>
              <div>
                <div className="text-xs text-brand-400 uppercase tracking-widest mb-2 font-bold flex items-center justify-center gap-1">
                  <Activity className="w-3 h-3" /> Simulated
                </div>
                <div className={clsx('px-4 py-2 rounded-lg text-xl font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(0,0,0,0.5)]', riskBg[simulatedAnalysis.riskLevel])}>
                  {simulatedAnalysis.riskLevel} ({simulatedAnalysis.riskScore.toFixed(0)})
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="text-sm text-slate-300 italic mb-4 border-l-2 border-brand-500 pl-3">
                "{generateSummary()}"
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs" onClick={() => navigator.clipboard.writeText(generateSummary())}>
                  <Copy className="w-3 h-3" /> Copy Summary
                </button>
                <button className="btn-secondary text-xs" onClick={() => saveWhatIfScenario(selectedId, { iopChange, targetIOP, rnflChange, mdChange, adherence, horizonMonths, summary: generateSummary(), simulatedAnalysis })}>
                  <Save className="w-3 h-3" /> Save this scenario
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* RNFL Chart */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-200 text-sm">Simulated RNFL Projection</h3>
                  <select value={horizonMonths} onChange={e => setHorizonMonths(Number(e.target.value))} className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-slate-300">
                    <option value={24}>24 months</option>
                    <option value={60}>60 months</option>
                    <option value={120}>120 months</option>
                  </select>
                </div>
                <div className="h-64">
                  {/* Reuse projection chart but we need to overlay original and simulated. 
                      Since RNFLProjectionChart takes single baseline, we can just render the simulated one and note it's simulated. */}
                  <RNFLProjectionChart 
                    baselineRnfl={baselineRnflSimulated} 
                    currentIop={simulatedAnalysis.meanIOP} 
                    targetIop={targetIOP} 
                    measuredSlope={simulatedAnalysis.rnflThinningRate} 
                  />
                </div>
              </div>

              {/* VF Chart */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-200 text-sm">Simulated VF Forecast</h3>
                </div>
                <div className="h-64">
                  {simulatedAnalysis.vfForecast ? (
                    <ForecastChart data={simulatedAnalysis.vfForecast} yLabel="dB" />
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm">Insufficient data</div>
                  )}
                </div>
              </div>
            </div>

            {/* Side-by-side Heat Maps */}
            <div className="glass-card p-5">
              <h3 className="font-semibold text-slate-200 text-sm mb-6">Sector Impacts</h3>
              <div className="flex items-center justify-center gap-12">
                <div className="text-center">
                  <div className="text-xs text-slate-500 uppercase tracking-widest mb-4">Original</div>
                  <SectorHeatMapPrint sectors={originalSectors} eye={patient.laterality} />
                </div>
                <ArrowRight className="w-6 h-6 text-slate-600" />
                <div className="text-center">
                  <div className="text-xs text-brand-400 font-bold uppercase tracking-widest mb-4">Simulated</div>
                  <SectorHeatMapPrint sectors={simulatedSectors} eye={patient.laterality} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
