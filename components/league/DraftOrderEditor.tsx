'use client'
import { useState, useRef } from 'react'

interface Team {
  userId: string
  teamName: string
  avatarUrl?: string
}

interface Props {
  teams: Team[]
  onSave: (orderedUserIds: string[]) => Promise<void>
  isCommissioner: boolean
}

export default function DraftOrderEditor({ teams, onSave, isCommissioner }: Props) {
  const [order, setOrder] = useState<Team[]>(teams)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dragOverIndex = useRef<number | null>(null)

  const handleDragStart = (index: number) => {
    setDraggingIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    dragOverIndex.current = index
  }

  const handleDrop = (index: number) => {
    if (draggingIndex === null || draggingIndex === index) return
    const newOrder = [...order]
    const [moved] = newOrder.splice(draggingIndex, 1)
    newOrder.splice(index, 0, moved)
    setOrder(newOrder)
    setDraggingIndex(null)
    dragOverIndex.current = null
    setSaved(false)
  }

  const handleDragEnd = () => {
    setDraggingIndex(null)
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(order.map(t => t.userId))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const randomize = () => {
    const shuffled = [...order].sort(() => Math.random() - 0.5)
    setOrder(shuffled)
    setSaved(false)
  }

  if (!isCommissioner) {
    return (
      <div style={{ padding: '16px' }}>
        <p style={{ color: '#7a90b0', fontSize: '14px' }}>Draft order is set by the commissioner.</p>
        <ol style={{ color: '#e8edf5', paddingLeft: '20px' }}>
          {order.map((t, i) => (
            <li key={t.userId} style={{ padding: '6px 0', color: i === 0 ? '#d4a828' : '#e8edf5' }}>
              {t.teamName}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p style={{ color: '#7a90b0', fontSize: '13px', margin: 0 }}>
          Drag teams to set draft order. Pick 1 drafts first.
        </p>
        <button
          onClick={randomize}
          style={{
            background: '#1e2d47', color: '#e8edf5', border: 'none',
            borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px'
          }}
        >
          🔀 Randomize
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
        {order.map((team, index) => (
          <div
            key={team.userId}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              background: draggingIndex === index ? '#1e2d47' : '#0c1220',
              border: draggingIndex === index ? '1px solid #d4a828' : '1px solid #1e2d47',
              borderRadius: '8px',
              cursor: 'grab',
              opacity: draggingIndex === index ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {/* Pick number */}
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: index === 0 ? '#d4a828' : '#1e2d47',
              color: index === 0 ? '#000' : '#7a90b0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 'bold', flexShrink: 0
            }}>
              {index + 1}
            </div>

            {/* Team name */}
            <span style={{ color: '#e8edf5', fontSize: '14px', flex: 1 }}>
              {team.teamName}
            </span>

            {/* Drag handle */}
            <span style={{ color: '#7a90b0', fontSize: '18px', cursor: 'grab' }}>⠿</span>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          background: saved ? '#2ecc71' : '#d4a828',
          color: '#000',
          border: 'none',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '15px',
          fontWeight: 'bold',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Draft Order'}
      </button>
    </div>
  )
}
