'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const C = {
  bg: '#070a12',
  surf: '#0c1422',
  surf2: '#131d30',
  surf3: '#1e2d47',
  gold: '#f5a623',
  text: '#e4edf7',
  sub: '#7a90aa',
  muted: '#3e5470',
  green: '#15c678',
  red: '#f03a5a',
}

interface LeaderboardEntry {
  id: string
  entry_name: string
  total_score: number
  correct_picks: number
  user_id: string
  user_email?: string
}

interface BracketLeaderboardProps {
  contestId: string
  currentUserId: string | null
}

function SkeletonRow({ rank }: { rank: number }) {
  return (
    <tr>
      <td style={{ padding: '10px 12px', color: C.muted, fontFamily: 'Oswald, sans-serif' }}>{rank}</td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ height: 14, width: 120, background: C.surf3, borderRadius: 4 }} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ height: 14, width: 40, background: C.surf3, borderRadius: 4 }} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ height: 14, width: 30, background: C.surf3, borderRadius: 4 }} />
      </td>
    </tr>
  )
}

export default function BracketLeaderboard({ contestId, currentUserId }: BracketLeaderboardProps) {
  const supabase = createClientComponentClient()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLeaderboard = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_bracket_entries')
      .select('id, entry_name, total_score, correct_picks, user_id')
      .eq('contest_id', contestId)
      .order('total_score', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[BracketLeaderboard] fetch error:', error)
      return
    }

    setEntries(data ?? [])
    setLoading(false)
  }, [supabase, contestId])

  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 30000)
    return () => clearInterval(interval)
  }, [fetchLeaderboard])

  const headerStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: C.muted,
    fontFamily: 'Oswald, sans-serif',
    borderBottom: `1px solid ${C.surf3}`,
  }

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 13,
    color: C.text,
    fontFamily: 'Oswald, sans-serif',
  }

  return (
    <div style={{
      background: C.surf,
      border: `1px solid ${C.surf3}`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${C.surf3}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: C.text,
          fontFamily: 'Oswald, sans-serif',
        }}>
          LEADERBOARD
        </span>
        <span style={{ fontSize: 11, color: C.muted }}>Top 20 • refreshes every 30s</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, width: 40 }}>RANK</th>
            <th style={headerStyle}>ENTRY</th>
            <th style={{ ...headerStyle, width: 70 }}>SCORE</th>
            <th style={{ ...headerStyle, width: 80 }}>CORRECT</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} rank={i + 1} />)
            : entries.length === 0
              ? (
                <tr>
                  <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 13 }}>
                    No entries yet
                  </td>
                </tr>
              )
              : entries.map((entry, idx) => {
                const isMe = entry.user_id === currentUserId
                return (
                  <tr
                    key={entry.id}
                    style={{
                      background: isMe ? 'rgba(245,166,35,0.08)' : idx % 2 === 0 ? C.surf : C.surf2,
                      borderBottom: `1px solid ${C.surf3}`,
                    }}
                  >
                    <td style={{
                      ...cellStyle,
                      color: idx === 0 ? C.gold : idx === 1 ? C.sub : idx === 2 ? '#cd7f32' : C.muted,
                      fontWeight: 700,
                    }}>
                      {idx + 1}
                    </td>
                    <td style={{
                      ...cellStyle,
                      color: isMe ? C.gold : C.text,
                      fontWeight: isMe ? 700 : 500,
                    }}>
                      {entry.entry_name}
                      {isMe && (
                        <span style={{
                          marginLeft: 6,
                          fontSize: 9,
                          color: C.gold,
                          background: 'rgba(245,166,35,0.15)',
                          padding: '2px 5px',
                          borderRadius: 4,
                          verticalAlign: 'middle',
                        }}>
                          YOU
                        </span>
                      )}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: isMe ? C.gold : C.text }}>
                      {entry.total_score}
                    </td>
                    <td style={{ ...cellStyle, color: C.sub }}>
                      {entry.correct_picks}
                    </td>
                  </tr>
                )
              })
          }
        </tbody>
      </table>
    </div>
  )
}
