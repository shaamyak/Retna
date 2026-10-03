import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function VisualFieldChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#f1f5f9', fontSize: 11 }}
        />
        <Line
          type="monotone" dataKey="md" stroke="#8b5cf6" strokeWidth={2}
          dot={{ r: 4, fill: '#8b5cf6', stroke: '#6d28d9', strokeWidth: 2 }}
          name="MD (dB)"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
