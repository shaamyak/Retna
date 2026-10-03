import type { DatasetPatient, ManualPatient } from '@/types'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Image, Eye } from 'lucide-react'

interface Props {
  patient: DatasetPatient | ManualPatient
}

export default function FundusViewer({ patient }: Props) {
  const isDataset = patient.source === 'dataset'
  const [visitIndex, setVisitIndex] = useState(0)

  if (isDataset) {
    const ds = patient as DatasetPatient
    const visits = ds.visits.filter(v => v.cfp)

    if (visits.length === 0) {
      return (
        <div className="glass-card p-5">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Eye className="w-5 h-5 text-brand-400" />
            Fundus Photo Viewer
          </h2>
          <div className="h-48 rounded-xl bg-slate-800/40 flex items-center justify-center text-slate-500 text-sm">
            No fundus photo filenames in this record.
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            ℹ️ This dataset contains RNFL numbers and fundus photo filenames only. No OCT B-scan images are included.
            Place files in /public/fundus/ to view them.
          </p>
        </div>
      )
    }

    const currentVisit = visits[Math.min(visitIndex, visits.length - 1)]
    const imgSrc = `/fundus/${currentVisit.cfp}`

    return (
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2">
            <Eye className="w-5 h-5 text-brand-400" />
            Fundus Photo Viewer
          </h2>
          {visits.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVisitIndex(i => Math.max(0, i - 1))}
                disabled={visitIndex === 0}
                className="btn-ghost p-1 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 font-mono">
                Visit {currentVisit.visitNumber} · {currentVisit.intervalYears.toFixed(1)}yr
              </span>
              <button
                onClick={() => setVisitIndex(i => Math.min(visits.length - 1, i + 1))}
                disabled={visitIndex >= visits.length - 1}
                className="btn-ghost p-1 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <img
          src={imgSrc}
          alt={`Fundus photo ${currentVisit.cfp}`}
          className="w-full h-56 object-cover rounded-xl bg-slate-800"
          onError={(e) => {
            const target = e.currentTarget
            target.style.display = 'none'
            target.nextElementSibling?.classList.remove('hidden')
          }}
        />
        <div className="hidden h-56 rounded-xl bg-slate-800/40 flex items-center justify-center flex-col gap-2 text-slate-500">
          <Image className="w-10 h-10 text-slate-700" />
          <span className="text-sm">{currentVisit.cfp}</span>
          <span className="text-xs">Place in /public/fundus/ to view</span>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">
          ℹ️ Dataset: RNFL data is from baseline OCT only. Fundus photos are the only per-visit images available.
        </p>
      </div>
    )
  } else {
    const mp = patient as ManualPatient

    if (mp.octImages.length === 0) {
      return (
        <div className="glass-card p-5">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Eye className="w-5 h-5 text-brand-400" />
            OCT Image Viewer
          </h2>
          <div className="h-48 rounded-xl bg-slate-800/40 flex items-center justify-center text-slate-500 text-sm">
            No images uploaded for this patient.
          </div>
        </div>
      )
    }

    const current = mp.octImages[Math.min(visitIndex, mp.octImages.length - 1)]

    return (
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2">
            <Eye className="w-5 h-5 text-brand-400" />
            OCT / Image Viewer
          </h2>
          {mp.octImages.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVisitIndex(i => Math.max(0, i - 1))}
                disabled={visitIndex === 0}
                className="btn-ghost p-1"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400">{visitIndex + 1}/{mp.octImages.length}</span>
              <button
                onClick={() => setVisitIndex(i => Math.min(mp.octImages.length - 1, i + 1))}
                disabled={visitIndex >= mp.octImages.length - 1}
                className="btn-ghost p-1"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <img
          src={current}
          alt="OCT scan"
          className="w-full h-56 object-contain rounded-xl bg-slate-900"
        />
      </div>
    )
  }
}
