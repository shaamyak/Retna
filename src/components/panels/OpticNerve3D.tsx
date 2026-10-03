import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { DatasetPatient, ManualPatient, RNFLSectors } from '@/types'
import { useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'

interface Props {
  patient: DatasetPatient | ManualPatient
}

function getSectors(patient: DatasetPatient | ManualPatient): RNFLSectors {
  if (patient.source === 'dataset') {
    return (patient as DatasetPatient).rnfl
  }
  const mp = patient as ManualPatient
  return mp.rnflVisits.length > 0
    ? mp.rnflVisits[mp.rnflVisits.length - 1].sectors
    : { mean: null, superior: null, inferior: null, nasal: null, temporal: null }
}

/** Map RNFL value to color — red for thin, green for normal */
function rnflToColor(value: number | null): THREE.Color {
  if (value == null) return new THREE.Color(0x334155) // grey
  if (value < 55) return new THREE.Color(0xdc2626)  // critical red
  if (value < 70) return new THREE.Color(0xef4444)  // red
  if (value < 80) return new THREE.Color(0xf59e0b)  // amber
  if (value < 100) return new THREE.Color(0x10b981) // green
  return new THREE.Color(0x34d399)                   // bright green
}

interface SectorMeshProps {
  position: [number, number, number]
  color: THREE.Color
  label: string
  value: number | null
  height?: number
}

function SectorMesh({ position, color, label, value, height = 1 }: SectorMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.1
  })

  const normalizedHeight = value != null ? Math.max(0.2, (value / 120) * 2.5) : 0.3

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.1 : 1}
      >
        <cylinderGeometry args={[0.35, 0.4, normalizedHeight, 32]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.5}
          emissive={color}
          emissiveIntensity={hovered ? 0.4 : 0.15}
          transparent
          opacity={0.85}
        />
      </mesh>
      <Text
        position={[0, normalizedHeight / 2 + 0.3, 0]}
        fontSize={0.18}
        color="#94a3b8"
        anchorX="center"
        anchorY="middle"
      >
        {value != null ? `${value.toFixed(0)}µm` : '—'}
      </Text>
      <Text
        position={[0, -normalizedHeight / 2 - 0.3, 0]}
        fontSize={0.14}
        color="#64748b"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  )
}

function OpticDisk() {
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.z = state.clock.getElapsedTime() * 0.05
  })
  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <torusGeometry args={[1.0, 0.08, 16, 64]} />
      <meshStandardMaterial color="#1d4fe5" roughness={0.2} metalness={0.8} emissive="#163bcc" emissiveIntensity={0.3} />
    </mesh>
  )
}

export default function OpticNerve3D({ patient }: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const sectors = getSectors(patient)

  const sectorData = [
    { label: 'Sup', value: sectors.superior,  pos: [0, 0, -1.5] as [number, number, number] },
    { label: 'Inf', value: sectors.inferior,  pos: [0, 0,  1.5] as [number, number, number] },
    { label: 'Nas', value: sectors.nasal,     pos: [-1.5, 0, 0] as [number, number, number] },
    { label: 'Tem', value: sectors.temporal,  pos: [1.5, 0, 0] as [number, number, number] },
  ]

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">3D Optic Nerve Map</h2>
        <div className="flex gap-2">
          <button
            id="play-progression-btn"
            onClick={() => setIsPlaying(p => !p)}
            className="btn-ghost text-xs"
          >
            <Play className="w-3.5 h-3.5" />
            {isPlaying ? 'Pause' : 'Play Progression'}
          </button>
        </div>
      </div>

      <div className="h-64 rounded-xl overflow-hidden bg-slate-900">
        <Canvas camera={{ position: [3, 4, 3], fov: 45 }}>
          <ambientLight intensity={0.4} />
          <pointLight position={[5, 5, 5]} intensity={1.2} color="#5896f8" />
          <pointLight position={[-5, -5, -5]} intensity={0.5} color="#8b5cf6" />
          <OpticDisk />
          {sectorData.map(({ label, value, pos }) => (
            <SectorMesh
              key={label}
              label={label}
              value={value}
              position={pos}
              color={rnflToColor(value)}
            />
          ))}
          <OrbitControls enableDamping autoRotate={isPlaying} autoRotateSpeed={1.5} />
          <fog attach="fog" args={['#060c1a', 10, 25]} />
        </Canvas>
      </div>

      {/* RNFL sector legend */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {sectorData.map(({ label, value }) => (
          <div key={label} className="text-center">
            <div
              className="w-3 h-3 rounded-full mx-auto mb-1"
              style={{ backgroundColor: `#${rnflToColor(value).getHexString()}` }}
            />
            <div className="text-[10px] text-slate-500">{label}</div>
            <div className="text-[11px] font-mono text-slate-300">
              {value != null ? `${value.toFixed(0)}` : '—'}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[9px] text-slate-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>Normal (≥80)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>Watch (70–80)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>Alert (&lt;70)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-700 inline-block"/>Critical (&lt;55)</span>
      </div>
    </div>
  )
}
