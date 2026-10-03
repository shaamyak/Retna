import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import type { DatasetPatient, ManualPatient } from '@/types'
import { Printer, ArrowLeft } from 'lucide-react'
import ForecastChart from '@/components/charts/ForecastChart'
import RNFLProjectionChart from '@/components/charts/RNFLProjectionChart'
import IOPChart from '@/components/charts/IOPChart'
import VisualFieldChart from '@/components/charts/VisualFieldChart'
import { TARGET_IOP_DEFAULT } from '@/config/scenarios'

function SectorHeatMapPrint({ sectors, eye }: { sectors: any, eye: string }) {
  const s = sectors
  return (
    <div className="relative w-40 h-40 rounded-full border-4 border-slate-300 flex items-center justify-center text-sm font-bold bg-white text-slate-800">
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

export default function PrintReportView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userPatients, datasetPatients, analysisCache, whatIfScenarios } = useAppStore()

  const patient = useMemo(() => {
    return userPatients.find(p => p.id === id) || datasetPatients.find(p => p.id === id)
  }, [id, userPatients, datasetPatients])

  const analysis = patient ? analysisCache[patient.id] : undefined

  const [opts, setOpts] = useState({
    charts: true,
    modelSnapshot: true,
    scanImage: true,
    hideName: false,
    includeWhatIf: false
  })

  // Set body class for print overrides if needed, or rely on media queries
  useEffect(() => {
    document.body.classList.add('print-view-active')
    return () => document.body.classList.remove('print-view-active')
  }, [])

  if (!patient || !analysis) {
    return <div className="p-10 text-white">Patient not found or analysis pending.</div>
  }

  const isDataset = patient.source === 'dataset'
  const ds = isDataset ? patient as DatasetPatient : null
  const mp = !isDataset ? patient as ManualPatient : null

  const targetIOP = isDataset ? TARGET_IOP_DEFAULT : (mp!.targetIOP || TARGET_IOP_DEFAULT)
  const baselineRnfl = isDataset ? ds!.rnfl.mean : (mp!.rnflVisits.length > 0 ? mp!.rnflVisits[mp!.rnflVisits.length - 1].sectors.mean : null)

  const displayName = opts.hideName 
    ? `Patient ID: ${patient.id}`
    : isDataset 
      ? `Subject ${ds!.subjectNumber}` 
      : mp!.name

  const riskLevel = analysis.riskLevel
  const isDemo = !isDataset && mp!.isDemo

  // Combine and sort visits by date if manual
  const visitRows = useMemo(() => {
    if (isDataset) {
      return ds!.visits.map((v, i) => ({
        visitNo: i + 1,
        date: `Visit ${i + 1}`,
        rnfl: i === 0 ? ds!.rnfl : null,
        iop: v.iop,
        md: v.ms != null ? v.ms : null, // ms instead of md
        mdSource: 'Measured'
      }))
    } else {
      // Manual visits are independent, we merge them by date
      const dates = Array.from(new Set([
        ...mp!.rnflVisits.map(r => r.date),
        ...mp!.iopReadings.map(r => r.date),
        ...mp!.vfEntries.map(r => r.date)
      ])).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

      return dates.map((d, i) => {
        const rnfl = mp!.rnflVisits.find(r => r.date === d)?.sectors || null
        const iop = mp!.iopReadings.find(r => r.date === d)?.value || null
        const vf = mp!.vfEntries.find(r => r.date === d) || null
        return {
          visitNo: i + 1,
          date: new Date(d).toLocaleDateString(),
          rnfl,
          iop,
          md: vf?.md ?? null,
          mdSource: vf ? (vf.md != null ? 'Measured' : 'Estimated') : '' // Simplified for demo
        }
      })
    }
  }, [patient])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 print:bg-white print:text-black">
      
      {/* Options Panel (Hidden in Print) */}
      <div className="print-hide sticky top-0 z-50 bg-slate-900 border-b border-white/10 p-4 shadow-xl">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="btn-ghost text-sm">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-lg font-bold">Print Options</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={opts.charts} onChange={e => setOpts({...opts, charts: e.target.checked})} className="accent-brand-500" />
              Include charts and forecasts
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={opts.modelSnapshot} onChange={e => setOpts({...opts, modelSnapshot: e.target.checked})} className="accent-brand-500" />
              Include 3D model snapshot
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={opts.scanImage} onChange={e => setOpts({...opts, scanImage: e.target.checked})} className="accent-brand-500" />
              Include uploaded scan image(s)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={opts.hideName} onChange={e => setOpts({...opts, hideName: e.target.checked})} className="accent-brand-500" />
              Hide patient name (de-identified)
            </label>
            {whatIfScenarios[patient.id] && (
              <label className="flex items-center gap-2 cursor-pointer text-purple-400 font-medium">
                <input type="checkbox" checked={opts.includeWhatIf} onChange={e => setOpts({...opts, includeWhatIf: e.target.checked})} className="accent-purple-500" />
                Include saved what-if scenario
              </label>
            )}
          </div>
          <button onClick={handlePrint} className="btn-primary">
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Report Content - A4 size approx */}
      <div className="max-w-4xl mx-auto p-8 print:p-0 print:max-w-none print:w-full bg-white print:bg-transparent text-black shadow-lg my-8 print:my-0 print:shadow-none min-h-[297mm]">
        
        {/* Header */}
        <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-slate-900 print-force-colors">GlaucoMap Patient Report</h1>
            <div className="text-sm text-slate-600 mt-1">Generated: {new Date().toLocaleString()}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold text-base">{displayName}</div>
            <div className="text-slate-600">
              Age {patient.age} · {patient.gender === 'M' ? 'Male' : 'Female'} · {patient.laterality} Eye
            </div>
            {!isDataset && mp!.entryDate && (
              <div className="text-slate-600">Entry Date: {new Date(mp!.entryDate).toLocaleDateString()}</div>
            )}
          </div>
        </div>

        {/* Risk Summary */}
        <div className="print-break-inside-avoid text-center mb-10 py-6 px-4 bg-slate-50 border border-slate-200 rounded-xl print-force-colors">
          <div className="inline-block px-4 py-1 rounded-full text-xl font-bold uppercase tracking-widest mb-2 border-2 
            print-force-colors
            {riskLevel === 'Critical' ? 'bg-red-100 text-red-700 border-red-700' : 
             riskLevel === 'High' ? 'bg-orange-100 text-orange-700 border-orange-700' :
             riskLevel === 'Moderate' ? 'bg-amber-100 text-amber-700 border-amber-700' :
             'bg-emerald-100 text-emerald-700 border-emerald-700'}">
            {riskLevel} RISK ({analysis.riskScore.toFixed(0)}/100)
          </div>
          {analysis.modelProbability != null && (
            <div className="text-sm font-semibold text-slate-600 mb-2">
              Model Probability: {(analysis.modelProbability * 100).toFixed(1)}%
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mt-6 max-w-2xl mx-auto">
            {analysis.evidenceFactors.slice(0, 4).map((f, i) => (
              <div key={i} className="flex gap-2 text-sm items-start">
                <span className={`w-3 h-3 mt-1 rounded-full shrink-0 print-force-colors ${f.contribution === 'critical' || f.contribution === 'concerning' ? 'bg-red-500' : f.contribution === 'protective' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div>
                  <span className="font-semibold">{f.factor}:</span> {f.value} {f.unit}
                  <div className="text-xs text-slate-500">{f.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Visit Data Tables */}
        <div className="print-break-inside-avoid mb-10">
          <h2 className="text-lg font-bold border-b border-slate-300 pb-2 mb-4">Visit History & Clinical Measurements</h2>
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b-2 border-slate-300">
                <th className="py-2 px-2">Visit</th>
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2 text-center" colSpan={5}>RNFL Thickness (µm) <br/><span className="text-xs font-normal">Avg · S · N · I · T</span></th>
                <th className="py-2 px-2 text-center">IOP (mmHg)<br/><span className="text-xs font-normal">Target: {targetIOP}</span></th>
                <th className="py-2 px-2 text-center">Visual Field<br/><span className="text-xs font-normal">MD (dB)</span></th>
              </tr>
            </thead>
            <tbody>
              {visitRows.map((v, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="py-2 px-2 font-medium">{v.visitNo}</td>
                  <td className="py-2 px-2 text-slate-600">{v.date}</td>
                  <td className="py-2 px-2 text-center font-semibold">{v.rnfl?.mean?.toFixed(0) || '—'}</td>
                  <td className="py-2 px-1 text-center text-xs text-slate-500">{v.rnfl?.superior?.toFixed(0) || '—'}</td>
                  <td className="py-2 px-1 text-center text-xs text-slate-500">{v.rnfl?.nasal?.toFixed(0) || '—'}</td>
                  <td className="py-2 px-1 text-center text-xs text-slate-500">{v.rnfl?.inferior?.toFixed(0) || '—'}</td>
                  <td className="py-2 px-1 text-center text-xs text-slate-500">{v.rnfl?.temporal?.toFixed(0) || '—'}</td>
                  <td className="py-2 px-2 text-center font-semibold">{v.iop || '—'}</td>
                  <td className="py-2 px-2 text-center">
                    <span className="font-semibold">{v.md != null ? v.md.toFixed(1) : '—'}</span>
                    {v.md != null && <span className="block text-[9px] text-slate-400">{v.mdSource}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Charts Section */}
        {opts.charts && (
          <div className="print-page-break-before print-break-inside-avoid mb-10">
            <h2 className="text-lg font-bold border-b border-slate-300 pb-2 mb-4">Progression Trends & Forecasts</h2>
            
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div className="border border-slate-200 p-4 rounded-lg bg-slate-50">
                <h3 className="text-sm font-bold text-center mb-2">RNFL Thickness Projection</h3>
                <div style={{ height: '240px' }} className="print-force-colors text-black">
                  <RNFLProjectionChart 
                    baselineRnfl={baselineRnfl} 
                    currentIop={analysis.meanIOP} 
                    targetIop={targetIOP} 
                    measuredSlope={analysis.rnflThinningRate} 
                  />
                </div>
              </div>
              <div className="border border-slate-200 p-4 rounded-lg bg-slate-50">
                <h3 className="text-sm font-bold text-center mb-2">Visual Field Forecast</h3>
                <div style={{ height: '240px' }} className="print-force-colors text-black">
                  {analysis.vfForecast ? (
                    <ForecastChart data={analysis.vfForecast} yLabel="dB" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-slate-400">Insufficient VF data</div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-8">
              <div className="border border-slate-200 p-4 rounded-lg bg-slate-50">
                <h3 className="text-sm font-bold text-center mb-2">Measured IOP History</h3>
                <div style={{ height: '200px' }} className="print-force-colors text-black">
                  <IOPChart data={isDataset ? ds!.visits.map(v => ({ date: 'V', value: v.iop })) : mp!.iopReadings} />
                </div>
              </div>
              <div className="border border-slate-200 p-4 rounded-lg bg-slate-50">
                <h3 className="text-sm font-bold text-center mb-2">Measured Visual Field History</h3>
                <div style={{ height: '200px' }} className="print-force-colors text-black">
                  <VisualFieldChart data={isDataset ? ds!.visits.map(v => ({ date: 'V', md: v.ms })) : mp!.vfEntries} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Heat Map & Images */}
        {(opts.modelSnapshot || opts.scanImage) && (
          <div className="print-break-inside-avoid mb-10">
            <h2 className="text-lg font-bold border-b border-slate-300 pb-2 mb-4">Imaging & Topography</h2>
            <div className="flex gap-8 items-start">
              {opts.modelSnapshot && (
                <div className="w-1/2 border border-slate-200 p-4 rounded-lg bg-slate-50">
                  <h3 className="text-sm font-bold text-center mb-4">RNFL Sector Heat Map</h3>
                  <div className="flex justify-center print-force-colors">
                    <SectorHeatMapPrint
                      sectors={baselineRnfl != null && isDataset ? ds!.rnfl : (mp!.rnflVisits[mp!.rnflVisits.length-1]?.sectors || {mean:null, superior:null, inferior:null, nasal:null, temporal:null})} 
                      eye={patient.laterality} 
                    />
                  </div>
                </div>
              )}
              {opts.scanImage && !isDataset && mp!.octImages.length > 0 && (
                <div className="w-1/2 border border-slate-200 p-4 rounded-lg bg-slate-50">
                  <h3 className="text-sm font-bold text-center mb-4">OCT Scan Report</h3>
                  <img src={mp!.octImages[0]} alt="OCT Scan" className="max-w-full h-auto rounded" />
                </div>
              )}
              {opts.scanImage && (!mp || mp.octImages.length === 0) && (
                <div className="w-1/2 border border-slate-200 p-4 rounded-lg bg-slate-50 flex items-center justify-center h-48 text-slate-400 text-sm">
                  No scan image provided.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Saved What-If Scenario */}
        {opts.includeWhatIf && whatIfScenarios[patient.id] && (
          <div className="print-page-break-before print-break-inside-avoid mb-10 p-6 bg-purple-50 border border-purple-200 rounded-xl print-force-colors">
            <h2 className="text-lg font-bold border-b border-purple-300 pb-2 mb-4 text-purple-900 print-force-colors">Simulated Scenario (What-If)</h2>
            <div className="text-sm text-purple-800 italic mb-4 border-l-2 border-purple-400 pl-3">
              "{whatIfScenarios[patient.id].summary}"
            </div>
            <div className="text-sm text-slate-700">
              <span className="font-bold">Inputs:</span> IOP Change: {whatIfScenarios[patient.id].iopChange} mmHg | Target IOP: {whatIfScenarios[patient.id].targetIOP} | Adherence: {whatIfScenarios[patient.id].adherence}% | RNFL Shift: {whatIfScenarios[patient.id].rnflChange} µm
            </div>
            {whatIfScenarios[patient.id].simulatedAnalysis && (
              <div className="mt-4 text-sm text-slate-700">
                <span className="font-bold">Resulting Risk:</span> {whatIfScenarios[patient.id].simulatedAnalysis.riskLevel} ({whatIfScenarios[patient.id].simulatedAnalysis.riskScore.toFixed(0)})
              </div>
            )}
          </div>
        )}

        {/* Alerts & Clinical Context */}
        <div className="print-break-inside-avoid grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div>
            <h2 className="text-lg font-bold border-b border-slate-300 pb-2 mb-4">Automated Clinical Alerts</h2>
            {analysis.alerts.length > 0 ? (
              <ul className="space-y-3">
                {analysis.alerts.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 mt-1 print-force-colors">
                      {a.severity === 'critical' ? '🔴' : a.severity === 'alert' ? '🟠' : '🟡'}
                    </span>
                    <div>
                      <div className="font-semibold text-sm">{a.title}</div>
                      <div className="text-xs text-slate-600">{a.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-slate-500 italic">No automated alerts triggered for this patient.</div>
            )}
          </div>
          
          <div>
            <h2 className="text-lg font-bold border-b border-slate-300 pb-2 mb-4">Clinical Notes & Context</h2>
            {!isDataset ? (
              <div className="space-y-4 text-sm">
                <div>
                  <span className="font-semibold">Treatment & Notes:</span>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{mp!.treatmentNotes || 'Not provided'}</p>
                </div>
                <div>
                  <span className="font-semibold">Medications:</span>
                  <p className="mt-1 text-slate-700">{mp!.medications || 'Not provided'}</p>
                </div>
                <div>
                  <span className="font-semibold">Adherence:</span>
                  <p className="mt-1 text-slate-700">{mp!.adherence || 'Not provided'}</p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic">Dataset patients do not have qualitative clinical notes attached.</div>
            )}
          </div>
        </div>

      </div>

      {/* Fixed Footer for Print Pages */}
      <div className="hidden print:block print-fixed-footer">
        Decision-support tool, not a diagnosis. Estimated values are not measured results. 
        <br/>
        Page generated {new Date().toLocaleDateString()}
        {isDemo && <span className="block mt-1 font-bold tracking-widest text-slate-400">DEMO CASE (SYNTHETIC DATA)</span>}
      </div>

    </div>
  )
}
