import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import type { ManualPatient, Eye, Gender, GlaucomaCategory, GlaucomaStage, RNFLVisit, IOPReading, VFEntry } from '@/types'
import {
  User, Upload, Droplets, FileText, CheckCircle,
  ChevronRight, ChevronLeft, Save, AlertTriangle, X, Plus,
  Loader2, Scan, ShieldCheck, Info, Eye as EyeIcon
} from 'lucide-react'
import clsx from 'clsx'
import { v4 as uuidv4 } from 'uuid'
import { extractRNFL, runConsistencyChecks, requiresVerificationCheckbox, needsVerification } from '@/lib/rnflExtractor'
import type { ExtractionData, ExtractionField } from '@/lib/rnflExtractor'

// ── Validation helpers ────────────────────────────────────────────────────────

function validateRNFL(v: number | null): { error?: string; warn?: string } {
  if (v == null) return {}
  if (v < 20 || v > 200) return { error: 'RNFL must be 20–200 µm' }
  if (v < 40 || v > 120) return { warn: `Unusual value (${v} µm). Normal range ~40–120 µm.` }
  return {}
}
function validateIOP(v: number | null): { error?: string; warn?: string } {
  if (v == null) return {}
  if (v < 5 || v > 60) return { error: 'IOP must be 5–60 mmHg' }
  if (v > 35) return { warn: `Very elevated IOP (${v} mmHg). Please verify.` }
  return {}
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'info',      label: 'Patient Info', icon: User },
  { id: 'oct',       label: 'OCT & RNFL',   icon: Scan },
  { id: 'iop',       label: 'IOP',          icon: Droplets },
  { id: 'treatment', label: 'Notes',        icon: FileText },
  { id: 'review',    label: 'Review',       icon: CheckCircle },
]

// ── RNFL field state (extracted + editable) ──────────────────────────────────

interface RNFLField {
  value: number | ''
  confidence: 'high' | 'medium' | 'low' | 'manual' | null
}

function emptyRNFLField(): RNFLField { return { value: '', confidence: null } }

function extractionFieldToRNFLField(f: ExtractionField<number>): RNFLField {
  return { value: f.value ?? '', confidence: f.confidence }
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  age: number | ''
  gender: Gender
  laterality: Eye
  category: GlaucomaCategory
  cct: number | ''
  firstVisitDate: string
  targetIOP: number | ''
  octImages: string[]
  // RNFL (auto-extracted then editable)
  rnflMean:     RNFLField
  rnflSuperior: RNFLField
  rnflInferior: RNFLField
  rnflNasal:    RNFLField
  rnflTemporal: RNFLField
  extractedEye: 'OD' | 'OS' | null
  extractedDevice: string | null
  iopReadings: Array<{ date: string; value: number | '' }>
  treatmentNotes: string
  medications: string
  adherence: string
  // Derived
  verifiedCheckbox: boolean
  rnflEntryMode: 'upload' | 'manual'
}

function defaultForm(): FormState {
  return {
    name: '', age: '', gender: '' as Gender, laterality: '' as Eye,
    category: '' as GlaucomaCategory, cct: '', firstVisitDate: '',
    targetIOP: 15, octImages: [],
    rnflMean:     emptyRNFLField(),
    rnflSuperior: emptyRNFLField(),
    rnflInferior: emptyRNFLField(),
    rnflNasal:    emptyRNFLField(),
    rnflTemporal: emptyRNFLField(),
    extractedEye: null, extractedDevice: null,
    iopReadings: [{ date: '', value: '' }],
    treatmentNotes: '', medications: '', adherence: '',
    verifiedCheckbox: false,
    rnflEntryMode: 'upload',
  }
}

function patientToForm(p: ManualPatient): FormState {
  const latest = p.rnflVisits.length > 0 ? p.rnflVisits[p.rnflVisits.length - 1] : null
  return {
    name: p.name, age: p.age, gender: p.gender, laterality: p.laterality,
    category: p.category, cct: p.cct ?? '', firstVisitDate: p.firstVisitDate,
    targetIOP: 15, octImages: p.octImages,
    rnflMean:     { value: latest?.sectors.mean ?? '', confidence: 'manual' },
    rnflSuperior: { value: latest?.sectors.superior ?? '', confidence: 'manual' },
    rnflInferior: { value: latest?.sectors.inferior ?? '', confidence: 'manual' },
    rnflNasal:    { value: latest?.sectors.nasal ?? '', confidence: 'manual' },
    rnflTemporal: { value: latest?.sectors.temporal ?? '', confidence: 'manual' },
    extractedEye: null, extractedDevice: null,
    iopReadings: p.iopReadings.length > 0
      ? p.iopReadings.map(r => ({ date: r.date, value: r.value }))
      : [{ date: '', value: '' }],
    treatmentNotes: p.treatmentNotes, medications: p.medications, adherence: p.adherence,
    verifiedCheckbox: false,
    rnflEntryMode: p.octImages.length > 0 ? 'upload' : 'manual',
  }
}

// ── Stage derivation from RNFL mean (fallback without MD) ────────────────────
function deriveStageFromRNFL(rnfl: number | null): GlaucomaStage {
  if (rnfl == null) return 'Moderate'
  if (rnfl >= 80) return 'Suspect'
  if (rnfl >= 70) return 'Early'
  if (rnfl >= 55) return 'Moderate'
  return 'Advanced'
}

// ── localStorage key for one-time privacy notice ──────────────────────────────
const NOTICE_KEY = 'glaucomap-oct-notice-shown'

// ── Main Wizard ───────────────────────────────────────────────────────────────

export default function PatientFormWizard() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const { addPatient, updatePatient, userPatients, draftPatient, saveDraft, clearDraft } = useAppStore()

  const isEdit = !!id
  const existingPatient = id ? userPatients.find(p => p.id === id) : undefined

  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false)
  const hasDraft = !isEdit && !!draftPatient && !draftBannerDismissed

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(() =>
    existingPatient ? patientToForm(existingPatient) : defaultForm()
  )
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Extraction state
  const [extracting, setExtracting] = useState(false)
  const [extractWarnings, setExtractWarnings] = useState<string[]>([])
  const [extractErrors, setExtractErrors] = useState<string[]>([])
  const [extractFailed, setExtractFailed] = useState<string | null>(null)
  const [extractedOnce, setExtractedOnce] = useState(false)
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // One-time privacy notice
  useEffect(() => {
    if (!localStorage.getItem(NOTICE_KEY)) setShowPrivacyNotice(true)
  }, [])

  function dismissPrivacyNotice() {
    localStorage.setItem(NOTICE_KEY, '1')
    setShowPrivacyNotice(false)
  }

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const setRNFLField = (key: keyof Pick<FormState, 'rnflMean' | 'rnflSuperior' | 'rnflInferior' | 'rnflNasal' | 'rnflTemporal'>, value: number | '') =>
    setForm(f => ({ ...f, [key]: { value, confidence: 'manual' } }))

  // ── Draft ─────────────────────────────────────────────────────────────────

  const restoreDraft = () => {
    if (!draftPatient) return
    setForm(defaultForm()) // start fresh; could also try to load draft shape
    setDraftBannerDismissed(true)
  }
  const discardDraft = () => { clearDraft(); setDraftBannerDismissed(true) }
  const saveProgress = () => { saveDraft(form as any); alert('Draft saved.') }

  // ── Image upload & extraction ─────────────────────────────────────────────

  const handleImageFile = useCallback(async (file: File) => {
    // Compress first
    const reader = new FileReader()
    reader.onload = async e => {
      const raw = e.target?.result as string
      const img = new window.Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const MAX = 1200
        const scale = Math.min(MAX / img.width, MAX / img.height, 1)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        const compressed = canvas.toDataURL('image/jpeg', 0.85)

        // Save image
        setField('octImages', [compressed])
        setField('verifiedCheckbox', false)
        setExtractFailed(null)
        setExtractWarnings([])
        setExtractErrors([])

        // Privacy notice
        if (!localStorage.getItem(NOTICE_KEY)) {
          setShowPrivacyNotice(true)
          return
        }
        await runExtraction(compressed)
      }
      img.src = raw
    }
    reader.readAsDataURL(file)
  }, [form.laterality]) // eslint-disable-line

  async function runExtraction(dataUrl: string) {
    setExtracting(true)
    setExtractFailed(null)

    const result = await extractRNFL(dataUrl, form.laterality as 'OD' | 'OS' | '')
    setExtracting(false)

    if (!result.ok) {
      setExtractFailed(result.message)
      return
    }

    if (!result.data.foundReport) {
      setExtractFailed(
        'No RNFL values found on this image. Upload the RNFL thickness report page, or type the values below.'
      )
      return
    }

    // Populate RNFL fields
    const d = result.data
    setForm(f => ({
      ...f,
      rnflMean:     extractionFieldToRNFLField(d.average),
      rnflSuperior: extractionFieldToRNFLField(d.superior),
      rnflInferior: extractionFieldToRNFLField(d.inferior),
      rnflNasal:    extractionFieldToRNFLField(d.nasal),
      rnflTemporal: extractionFieldToRNFLField(d.temporal),
      extractedEye:    d.eye.value,
      extractedDevice: d.device.value,
      verifiedCheckbox: false,
    }))

    setExtractWarnings(result.warnings)
    setExtractErrors(result.errors)
    setExtractedOnce(true)
  }

  // ── Validation ────────────────────────────────────────────────────────────

  const validateStep = (): boolean => {
    const e: Record<string, string> = {}

    if (step === 0) {
      if (!form.name.trim())              e.name = 'Name is required'
      if (!form.age || form.age < 1 || form.age > 110) e.age = 'Age must be 1–110'
      if (!form.gender)                   e.gender = 'Select a gender'
      if (!form.laterality)               e.laterality = 'Select an eye'
      if (!form.category)                 e.category = 'Select a category'
      if (!form.firstVisitDate)           e.firstVisitDate = 'First visit date is required'
    }

    if (step === 1) {
      // Extraction consistency hard errors block progress
      if (form.rnflEntryMode === 'upload' && extractErrors.length > 0) e.extract = extractErrors.join(' ')
      // If any extracted field is low-conf and not verified
      const anyExtracted = form.rnflEntryMode === 'upload' && extractedOnce
      if (anyExtracted) {
        const fakeData: ExtractionData = {
          foundReport: true,
          average:  { value: toNum(form.rnflMean.value), confidence: form.rnflMean.confidence as any },
          superior: { value: toNum(form.rnflSuperior.value), confidence: form.rnflSuperior.confidence as any },
          inferior: { value: toNum(form.rnflInferior.value), confidence: form.rnflInferior.confidence as any },
          nasal:    { value: toNum(form.rnflNasal.value), confidence: form.rnflNasal.confidence as any },
          temporal: { value: toNum(form.rnflTemporal.value), confidence: form.rnflTemporal.confidence as any },
          eye:      { value: form.extractedEye, confidence: 'high' },
          device:   { value: form.extractedDevice, confidence: 'high' },
        }
        if (requiresVerificationCheckbox(fakeData) && !form.verifiedCheckbox) {
          e.verified = 'Please check "I have verified these values" before continuing'
        }
      }
      // Validate RNFL values
      ;(['rnflMean', 'rnflSuperior', 'rnflInferior', 'rnflNasal', 'rnflTemporal'] as const).forEach(k => {
        const v = form[k].value
        if (v !== '') {
          const r = validateRNFL(Number(v))
          if (r.error) e[k] = r.error
        }
      })
    }

    if (step === 2) {
      form.iopReadings.forEach((r, i) => {
        if (r.value !== '') {
          const v = validateIOP(Number(r.value))
          if (v.error) e[`iop_${i}`] = v.error
        }
      })
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  function toNum(v: number | ''): number | null { return v === '' ? null : Number(v) }

  const next = () => { if (validateStep()) setStep(s => Math.min(s + 1, STEPS.length - 1)) }
  const back = () => { setErrors({}); setStep(s => Math.max(0, s - 1)) }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validateStep()) return
    setIsAnalyzing(true)

    const patientId = id || uuidv4()

    const rnflSectors = {
      mean:     toNum(form.rnflMean.value),
      superior: toNum(form.rnflSuperior.value),
      inferior: toNum(form.rnflInferior.value),
      nasal:    toNum(form.rnflNasal.value),
      temporal: toNum(form.rnflTemporal.value),
    }

    const rnflVisits: RNFLVisit[] = rnflSectors.mean !== null
      ? [{ date: form.firstVisitDate, sectors: rnflSectors }]
      : []

    const iopReadings: IOPReading[] = form.iopReadings
      .filter(r => r.value !== '')
      .map(r => ({ date: r.date, value: Number(r.value) }))

    const stage = deriveStageFromRNFL(rnflSectors.mean)

    const patient: ManualPatient = {
      id: patientId,
      name: form.name,
      age: Number(form.age),
      gender: form.gender,
      laterality: form.laterality,
      stage,
      category: form.category,
      cct: toNum(form.cct),
      targetIOP: toNum(form.targetIOP) ?? undefined,
      firstVisitDate: form.firstVisitDate,
      entryDate: new Date().toISOString(),
      rnflVisits,
      iopReadings,
      vfEntries: [],
      treatmentNotes: form.treatmentNotes,
      medications: form.medications,
      adherence: form.adherence,
      octImages: form.octImages,
      source: 'manual',
      isDraft: false,
    }

    if (isEdit) updatePatient(patientId, patient)
    else addPatient(patient)
    clearDraft()

    setTimeout(() => {
      setIsAnalyzing(false)
      navigate(`/patient/${patientId}`)
    }, 1200)
  }

  // ── Analyzing overlay ─────────────────────────────────────────────────────

  if (isAnalyzing) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center mx-auto animate-pulse">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
          <div className="text-slate-200 font-semibold">Running risk analysis...</div>
          <div className="text-sm text-slate-500">Analysing RNFL, IOP and VF data</div>
          <div className="flex gap-1 justify-center">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full pb-12">
      {/* Privacy notice modal */}
      {showPrivacyNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
              <span className="font-semibold">Image Privacy Notice</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              When you upload an OCT report, the image is sent to an external AI service to read the printed numbers.
              Please use report pages <strong>without patient names, IDs, or dates of birth</strong>.
              The image is not stored by the AI service and is not logged by this app.
            </p>
            <button onClick={dismissPrivacyNotice} className="btn-primary w-full justify-center">
              I understand — continue
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              {isEdit ? 'Edit Patient Case' : 'New Patient Case'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Step {step + 1} of {STEPS.length}: {STEPS[step].label}</p>
          </div>
          <button onClick={saveProgress} className="btn-ghost text-xs">
            <Save className="w-3.5 h-3.5" />
            Save Draft
          </button>
        </div>

        {/* Draft banner */}
        {hasDraft && (
          <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-900/20 border border-amber-700/30">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-300 flex-1">You have an unsaved draft from a previous session.</span>
            <button onClick={restoreDraft} className="text-xs font-medium text-amber-400 hover:text-amber-300 underline">Continue draft</button>
            <button onClick={discardDraft} className="text-xs text-slate-500 hover:text-slate-300">Discard</button>
          </div>
        )}

        {/* Progress bar */}
        <div className="mt-3 h-1 bg-slate-800 rounded-full">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto">
        {/* Step pills */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.id} className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0',
                i === step ? 'bg-brand-600 text-white' :
                i < step   ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30' :
                'bg-slate-800/40 text-slate-500'
              )}>
                <Icon className="w-3 h-3" />
                {s.label}
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="animate-fade-in-up">
          {step === 0 && <StepInfo form={form} setField={setField} errors={errors} />}
          {step === 1 && (
            <StepOCTandRNFL
              form={form}
              setField={setField}
              setRNFLField={setRNFLField}
              errors={errors}
              extracting={extracting}
              extractWarnings={extractWarnings}
              extractErrors={extractErrors}
              extractFailed={extractFailed}
              extractedOnce={extractedOnce}
              fileRef={fileRef}
              onFileSelected={handleImageFile}
              onReExtract={() => form.octImages[0] && runExtraction(form.octImages[0])}
            />
          )}
          {step === 2 && <StepIOP form={form} setField={setField} errors={errors} />}
          {step === 3 && <StepTreatment form={form} setField={setField} />}
          {step === 4 && <StepReview form={form} onSubmit={handleSubmit} isEdit={isEdit} />}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button id="wizard-back-btn" onClick={back} disabled={step === 0}
            className="btn-secondary disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button id="wizard-next-btn" onClick={next} className="btn-primary">
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button id="wizard-submit-btn" onClick={handleSubmit} className="btn-primary">
              <CheckCircle className="w-4 h-4" />
              {isEdit ? 'Save Changes & Analyse' : 'Run AI Analysis'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 0: Patient Info ───────────────────────────────────────────────────────

function StepInfo({ form, setField, errors }: { form: FormState; setField: any; errors: Record<string, string> }) {
  return (
    <div className="glass-card p-6 space-y-4">
      <h2 className="section-title">Patient Information</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label mb-1 block">Name / Patient ID *</label>
          <input id="input-name" type="text" value={form.name} onChange={e => setField('name', e.target.value)}
            placeholder="e.g. Raj Kumar" className={clsx('input-field', errors.name && 'border-red-500')} />
          {errors.name && <FieldError msg={errors.name} />}
        </div>
        <div>
          <label className="label mb-1 block">Age *</label>
          <input id="input-age" type="number" value={form.age}
            onChange={e => setField('age', e.target.value === '' ? '' : Number(e.target.value))}
            min={1} max={110} placeholder="e.g. 58"
            className={clsx('input-field', errors.age && 'border-red-500')} />
          {errors.age && <FieldError msg={errors.age} />}
        </div>
        <div>
          <label className="label mb-1 block">Gender *</label>
          <select id="input-gender" value={form.gender} onChange={e => setField('gender', e.target.value)}
            className={clsx('input-field', errors.gender && 'border-red-500')}>
            <option value="">Select...</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
          {errors.gender && <FieldError msg={errors.gender} />}
        </div>
        <div>
          <label className="label mb-1 block">Eye *</label>
          <select id="input-laterality" value={form.laterality} onChange={e => setField('laterality', e.target.value)}
            className={clsx('input-field', errors.laterality && 'border-red-500')}>
            <option value="">Select...</option>
            <option value="OD">OD (Right Eye)</option>
            <option value="OS">OS (Left Eye)</option>
          </select>
          {errors.laterality && <FieldError msg={errors.laterality} />}
        </div>
        <div>
          <label className="label mb-1 block">Glaucoma Category *</label>
          <select id="input-category" value={form.category} onChange={e => setField('category', e.target.value)}
            className={clsx('input-field', errors.category && 'border-red-500')}>
            <option value="">Select...</option>
            <option value="OAG">OAG (Open Angle)</option>
            <option value="ACG">ACG (Angle Closure)</option>
            <option value="Other">Other</option>
          </select>
          {errors.category && <FieldError msg={errors.category} />}
        </div>
        <div>
          <label className="label mb-1 block">First Visit Date *</label>
          <input id="input-first-visit" type="date" value={form.firstVisitDate}
            onChange={e => setField('firstVisitDate', e.target.value)}
            className={clsx('input-field', errors.firstVisitDate && 'border-red-500')} />
          {errors.firstVisitDate && <FieldError msg={errors.firstVisitDate} />}
        </div>
        {/* Optional fields collapsed */}
        <div>
          <label className="label mb-1 block">CCT (optional)</label>
          <input id="input-cct" type="number" value={form.cct}
            onChange={e => setField('cct', e.target.value === '' ? '' : Number(e.target.value))}
            min={350} max={750} placeholder="e.g. 540 µm" className="input-field" />
          <p className="text-[10px] text-slate-600 mt-1">Central corneal thickness, 350–750 µm</p>
        </div>
        <div>
          <label className="label mb-1 block">Target IOP</label>
          <input id="input-target-iop" type="number" value={form.targetIOP}
            onChange={e => setField('targetIOP', e.target.value === '' ? '' : Number(e.target.value))}
            min={8} max={30} placeholder="15" className="input-field" />
          <p className="text-[10px] text-slate-600 mt-1">Default 15 mmHg — editable</p>
        </div>
      </div>
    </div>
  )
}

// ── Step 1: OCT Upload + RNFL Extraction ─────────────────────────────────────

function StepOCTandRNFL({
  form, setField, setRNFLField, errors,
  extracting, extractWarnings, extractErrors, extractFailed, extractedOnce,
  fileRef, onFileSelected, onReExtract,
}: {
  form: FormState; setField: any; setRNFLField: any; errors: Record<string, string>
  extracting: boolean; extractWarnings: string[]; extractErrors: string[]
  extractFailed: string | null; extractedOnce: boolean
  fileRef: React.RefObject<HTMLInputElement>; onFileSelected: (f: File) => void
  onReExtract: () => void
}) {
  const sectors: Array<{ key: keyof Pick<FormState, 'rnflMean' | 'rnflSuperior' | 'rnflInferior' | 'rnflNasal' | 'rnflTemporal'>; label: string; id: string }> = [
    { key: 'rnflMean',     label: 'Average',  id: 'rnfl-mean' },
    { key: 'rnflSuperior', label: 'Superior', id: 'rnfl-sup' },
    { key: 'rnflInferior', label: 'Inferior', id: 'rnfl-inf' },
    { key: 'rnflNasal',    label: 'Nasal',    id: 'rnfl-nas' },
    { key: 'rnflTemporal', label: 'Temporal', id: 'rnfl-tem' },
  ]

  // Determine if verification checkbox is needed
  const needsVerify = extractedOnce && sectors.some(s => {
    const f = form[s.key]
    return f.value === '' || f.confidence === 'low'
  })

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-3">
        <button
          onClick={() => setField('rnflEntryMode', 'upload')}
          className={clsx('flex-1 py-3 px-4 rounded-xl border text-sm font-medium transition-all', form.rnflEntryMode === 'upload' ? 'bg-brand-600/20 border-brand-500 text-brand-300' : 'bg-slate-800/40 border-white/10 text-slate-400 hover:bg-slate-800')}
        >
          Upload OCT report (auto-read)
        </button>
        <button
          onClick={() => setField('rnflEntryMode', 'manual')}
          className={clsx('flex-1 py-3 px-4 rounded-xl border text-sm font-medium transition-all', form.rnflEntryMode === 'manual' ? 'bg-brand-600/20 border-brand-500 text-brand-300' : 'bg-slate-800/40 border-white/10 text-slate-400 hover:bg-slate-800')}
        >
          Type RNFL values
        </button>
      </div>

      {form.rnflEntryMode === 'upload' && (
      <>
      {/* Upload area */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="section-title">OCT Report Image</h2>
        <p className="text-xs text-slate-500">
          Upload the <strong>RNFL thickness report page</strong> (the page that shows the numbers, not a B-scan).
          RNFL values will be extracted automatically. You can edit any value.
        </p>

        <div
          className={clsx(
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
            form.octImages.length === 0
              ? 'border-white/10 hover:border-brand-500/40'
              : 'border-emerald-700/40 bg-emerald-900/10'
          )}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFileSelected(f) }}
        >
          {form.octImages.length === 0 ? (
            <>
              <Upload className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-sm text-slate-400">Drop OCT report image here or click to browse</div>
              <div className="text-xs text-slate-600 mt-1">JPEG, PNG — max ~10 MB</div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <img src={form.octImages[0]} alt="OCT report" className="h-36 object-contain rounded-lg" />
              <div className="text-left space-y-2">
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Image loaded
                </div>
                {form.extractedDevice && (
                  <div className="text-xs text-slate-400">Device: {form.extractedDevice}</div>
                )}
                {form.extractedEye && (
                  <div className="text-xs text-slate-400">Eye on report: {form.extractedEye}</div>
                )}
                <button onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
                  className="btn-ghost text-xs">Change image</button>
              </div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelected(f) }} />

        {errors.image && <FieldError msg={errors.image} />}
      </div>

      {/* Extraction status */}
      {extracting && (
        <div className="glass-card p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-brand-400 animate-spin flex-shrink-0" />
          <div>
            <div className="text-sm text-slate-200 font-medium">Extracting RNFL values…</div>
            <div className="text-xs text-slate-500">Reading printed numbers from the report</div>
          </div>
        </div>
      )}

      {extractFailed && !extracting && (
        <div className="glass-card p-4 bg-amber-900/10 border border-amber-700/30 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">{extractFailed}</p>
          </div>
          <p className="text-xs text-slate-500 pl-6">Type the values below from your report.</p>
        </div>
      )}
      </>
      )}

      {/* RNFL values */}
      {(!extracting || form.rnflEntryMode === 'manual') && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">RNFL Thickness Values</h2>
              {form.rnflEntryMode === 'upload' && extractedOnce && !extractFailed && (
                <p className="text-xs text-brand-400 mt-0.5 flex items-center gap-1">
                  <Scan className="w-3 h-3" />
                  Extracted from scan. Please verify.
                </p>
              )}
              {(form.rnflEntryMode === 'manual' || !extractedOnce || extractFailed) && (
                <p className="text-xs text-slate-500 mt-0.5">Type from the report (µm)</p>
              )}
            </div>
            {form.rnflEntryMode === 'upload' && extractedOnce && (
              <button onClick={onReExtract} disabled={form.octImages.length === 0}
                className="btn-ghost text-xs disabled:opacity-30">
                <Scan className="w-3.5 h-3.5" />
                Re-extract
              </button>
            )}
          </div>

          {/* Consistency warnings */}
          {form.rnflEntryMode === 'upload' && extractWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-300 bg-amber-900/10 border border-amber-700/30 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {w}
            </div>
          ))}
          {form.rnflEntryMode === 'upload' && extractErrors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-red-300 bg-red-900/10 border border-red-700/30 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {e}
            </div>
          ))}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sectors.map(({ key, label, id }) => {
              const field = form[key]
              const v = field.value !== '' ? Number(field.value) : null
              const rnflVal = validateRNFL(v)
              const isLowConf = field.confidence === 'low'
              const isMissing = field.value === ''
              const needsAtt = isLowConf || isMissing

              return (
                <div key={key}>
                  <label className="label mb-1 block flex items-center gap-1">
                    {label} (µm)
                    {field.confidence && field.confidence !== 'manual' && (
                      <span className={clsx(
                        'text-[9px] px-1 rounded',
                        field.confidence === 'high' ? 'bg-emerald-900/40 text-emerald-400' :
                        field.confidence === 'medium' ? 'bg-blue-900/40 text-blue-400' :
                        'bg-amber-900/40 text-amber-400'
                      )}>
                        {field.confidence}
                      </span>
                    )}
                  </label>
                  <input
                    id={id}
                    type="number" step="1" min={20} max={200}
                    value={field.value}
                    onChange={e => setRNFLField(key, e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="—"
                    className={clsx(
                      'input-field',
                      errors[key] || rnflVal.error ? 'border-red-500' :
                      needsAtt ? 'border-amber-500/50' : ''
                    )}
                  />
                  {(errors[key] || rnflVal.error) && <FieldError msg={errors[key] || rnflVal.error!} />}
                  {rnflVal.warn && !rnflVal.error && <FieldWarn msg={rnflVal.warn} />}
                </div>
              )
            })}
          </div>

          {/* Verification checkbox */}
          {form.rnflEntryMode === 'upload' && needsVerify && (
            <label className="flex items-start gap-3 cursor-pointer mt-2">
              <input type="checkbox" checked={form.verifiedCheckbox}
                onChange={e => setField('verifiedCheckbox', e.target.checked)}
                className="mt-0.5 accent-brand-500" />
              <span className="text-xs text-slate-300 leading-relaxed">
                I have verified these values against the printed report. Low-confidence or missing fields have been checked.
              </span>
            </label>
          )}
          {errors.verified && <FieldError msg={errors.verified} />}
        </div>
      )}
    </div>
  )
}

// ── Step 2: IOP ────────────────────────────────────────────────────────────────

function StepIOP({ form, setField, errors }: { form: FormState; setField: any; errors: Record<string, string> }) {
  const addReading = () => setField('iopReadings', [...form.iopReadings, { date: '', value: '' }])
  const remove = (i: number) => setField('iopReadings', form.iopReadings.filter((_, idx) => idx !== i))

  return (
    <div className="glass-card p-6 space-y-4">
      <h2 className="section-title">IOP Readings</h2>
      <p className="text-xs text-slate-500">Enter intraocular pressure measurements (GAT or similar). Normal ≤ 21 mmHg.</p>

      {form.iopReadings.map((r, i) => (
        <div key={i} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="label mb-1 block">Date</label>
            <input id={`iop-date-${i}`} type="date" value={r.date}
              onChange={e => { const arr = [...form.iopReadings]; arr[i].date = e.target.value; setField('iopReadings', arr) }}
              className="input-field" />
          </div>
          <div className="w-32">
            <label className="label mb-1 block">IOP (mmHg)</label>
            <input id={`iop-value-${i}`} type="number" step="0.5" min={5} max={60}
              value={r.value}
              onChange={e => { const arr = [...form.iopReadings]; arr[i].value = e.target.value === '' ? '' : Number(e.target.value); setField('iopReadings', arr) }}
              className={clsx('input-field', errors[`iop_${i}`] && 'border-red-500')}
              placeholder="e.g. 18" />
            {errors[`iop_${i}`] && <FieldError msg={errors[`iop_${i}`]} />}
            {r.value !== '' && (() => { const w = validateIOP(Number(r.value)); return w.warn ? <FieldWarn msg={w.warn} /> : null })()}
          </div>
          {form.iopReadings.length > 1 && (
            <button onClick={() => remove(i)} className="btn-ghost p-2 text-red-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}

      <button id="add-iop-btn" onClick={addReading}
        className="btn-ghost text-sm w-full justify-center border border-dashed border-white/10 py-3">
        <Plus className="w-4 h-4" />
        Add IOP Reading
      </button>
    </div>
  )
}

// ── Step 3: Treatment Notes ────────────────────────────────────────────────────

function StepTreatment({ form, setField }: { form: FormState; setField: any }) {
  return (
    <div className="glass-card p-6 space-y-4">
      <h2 className="section-title">Treatment Notes (Optional)</h2>
      <div>
        <label className="label mb-1 block">Current Medications</label>
        <input id="input-medications" type="text" value={form.medications}
          onChange={e => setField('medications', e.target.value)}
          className="input-field" placeholder="e.g. Latanoprost 0.005%, Timolol 0.5%" />
      </div>
      <div>
        <label className="label mb-1 block">Adherence</label>
        <select id="input-adherence" value={form.adherence}
          onChange={e => setField('adherence', e.target.value)} className="input-field">
          <option value="">Select...</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      <div>
        <label className="label mb-1 block">Clinical Notes</label>
        <textarea id="input-notes" value={form.treatmentNotes}
          onChange={e => setField('treatmentNotes', e.target.value)}
          rows={4} className="input-field resize-none"
          placeholder="Surgical history, additional findings, referrals…" />
      </div>
    </div>
  )
}

// ── Step 4: Review ─────────────────────────────────────────────────────────────

function StepReview({ form, onSubmit, isEdit }: { form: FormState; onSubmit: () => void; isEdit: boolean }) {
  const rnflVal = form.rnflMean.value !== '' ? Number(form.rnflMean.value) : null
  const stage = deriveStageFromRNFL(rnflVal)
  const iopFilled = form.iopReadings.filter(r => r.value !== '').length

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <h2 className="section-title mb-4">Summary</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReviewRow label="Name"      value={form.name || '—'} />
          <ReviewRow label="Age"       value={form.age !== '' ? `${form.age} years` : '—'} />
          <ReviewRow label="Eye"       value={form.laterality || '—'} />
          <ReviewRow label="Category"  value={form.category || '—'} />
          <ReviewRow label="Stage"     value={`${stage} (derived)`} />
          <ReviewRow label="CCT"       value={form.cct !== '' ? `${form.cct} µm` : 'Not entered'} />
          <ReviewRow label="RNFL Avg"  value={form.rnflMean.value !== '' ? `${form.rnflMean.value} µm` : '—'} />
          <ReviewRow label="IOP Readings" value={`${iopFilled} entered`} />
          <ReviewRow label="OCT Image" value={form.octImages.length > 0 ? 'Uploaded' : 'None'} />
          <ReviewRow label="Medications" value={form.medications || 'Not entered'} />
        </div>
      </div>

      {iopFilled === 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-white/[0.06] text-xs text-slate-400">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          No IOP readings entered. IOP analysis will be limited.
        </div>
      )}
      {form.rnflMean.value === '' && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-white/[0.06] text-xs text-slate-400">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          No RNFL values — risk analysis will rely on IOP and age only.
        </div>
      )}

      <div className="glass-card p-4 bg-brand-600/10 border border-brand-500/20">
        <p className="text-xs text-brand-300 leading-relaxed">
          Clicking "{isEdit ? 'Save Changes & Analyse' : 'Run AI Analysis'}" will save this case and run the risk engine.
          Stage is derived from RNFL thickness. This is a decision-support tool only — results require clinical review.
        </p>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-slate-200 text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function FieldError({ msg }: { msg: string }) {
  return <p className="text-[10px] text-red-400 mt-1">{msg}</p>
}
function FieldWarn({ msg }: { msg: string }) {
  return <p className="text-[10px] text-amber-400 mt-1">{msg}</p>
}
