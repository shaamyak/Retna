import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { IOP_THRESHOLDS } from '@/config/alerts'

export default function IOPChart({ data, targetIOP = 15 }: { data: any[], targetIOP?: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
        <YAxis domain={[5, 40]} tick={{ fontSize: 10, fill: '#64748b' }} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#f1f5f9', fontSize: 11 }}
        />
        <ReferenceLine y={targetIOP} stroke="#22c55e" strokeDasharray="4 4" label={{ value: `Target ${targetIOP}`, position: 'right', fill: '#22c55e', fontSize: 9 }} />
        <ReferenceLine y={IOP_THRESHOLDS.ELEVATED} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '21', position: 'right', fill: '#f59e0b', fontSize: 9 }} />
        <Line
          type="monotone" dataKey="iop" stroke="#5896f8" strokeWidth={2}
          dot={{ r: 4, fill: '#5896f8', stroke: '#1d4fe5', strokeWidth: 2 }}
          name="IOP (mmHg)"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
