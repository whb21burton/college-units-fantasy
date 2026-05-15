'use client'

import type { TournamentMatchup, Team, UserBracketPick } from '@/lib/bracketTypes'
import MatchupCard from './MatchupCard'

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

interface RegionalPodProps {
  regionName: string
  matchups: TournamentMatchup[]
  userPicks: UserBracketPick[]
  onPick: (matchupId: string, team: Team, predictedSeries?: '2-0' | '2-1') => void
  isLocked: boolean
  mirrored?: boolean
}

function Arrow({ mirrored }: { mirrored?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      color: C.muted,
      fontSize: 16,
      padding: '0 2px',
      alignSelf: 'center',
      transform: mirrored ? 'scaleX(-1)' : 'none',
    }}>
      →
    </div>
  )
}

function RoundLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.5,
      color: C.muted,
      fontFamily: 'Oswald, sans-serif',
      textAlign: 'center',
      paddingBottom: 6,
      borderBottom: `1px solid ${C.surf3}`,
      marginBottom: 8,
    }}>
      {label}
    </div>
  )
}

export default function RegionalPod({ regionName, matchups, userPicks, onPick, isLocked, mirrored }: RegionalPodProps) {
  const byIndex = (idx: number) => matchups.find(m => m.matchup_index === idx) ?? null

  const g1 = byIndex(0) // WB Game 1: #1 vs #4
  const g2 = byIndex(1) // WB Game 2: #2 vs #3
  const g3 = byIndex(2) // LB Game 3: L1 vs L2
  const g4 = byIndex(3) // WB Final Game 4: W1 vs W2
  const g5 = byIndex(4) // LB Final Game 5: LB winner vs WB loser
  const g6 = byIndex(5) // Regional Final Game 6

  const pickFor = (matchup: TournamentMatchup | null): UserBracketPick | null => {
    if (!matchup) return null
    return userPicks.find(p => p.matchup_id === matchup.id) ?? null
  }

  const renderMatchup = (matchup: TournamentMatchup | null) => {
    if (!matchup) return (
      <div style={{
        minWidth: 200,
        maxWidth: 300,
        height: 80,
        background: C.surf2,
        borderRadius: 8,
        border: `1.5px solid ${C.surf3}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: C.muted, fontSize: 11 }}>–</span>
      </div>
    )
    return (
      <MatchupCard
        matchup={matchup}
        userPick={pickFor(matchup)}
        onPick={onPick}
        isLocked={isLocked}
        showSeriesPicker={false}
      />
    )
  }

  // Column definitions for normal (left-to-right) layout:
  // Col 0: Winners Bracket (G1, G2)
  // Col 1: WB Final (G4) + arrow
  // Col 2: Losers Bracket (G3, G5)
  // Col 3: Regional Final (G6)

  const col0 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RoundLabel label="WINNERS BRACKET" />
      {renderMatchup(g1)}
      {renderMatchup(g2)}
    </div>
  )

  const col1 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
      <RoundLabel label="WB FINAL" />
      {renderMatchup(g4)}
    </div>
  )

  const col2 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RoundLabel label="LOSERS BRACKET" />
      {renderMatchup(g3)}
      {renderMatchup(g5)}
    </div>
  )

  const col3 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
      <RoundLabel label="REG. FINAL" />
      {renderMatchup(g6)}
    </div>
  )

  const columns = mirrored
    ? [col3, col2, col1, col0]
    : [col0, col1, col2, col3]

  return (
    <div style={{
      background: C.surf,
      border: `1px solid ${C.surf3}`,
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: C.gold,
        fontFamily: 'Oswald, sans-serif',
        textTransform: 'uppercase',
        borderBottom: `1px solid ${C.surf3}`,
        paddingBottom: 8,
      }}>
        {regionName} Regional
      </div>
      <div style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        overflowX: 'auto',
      }}>
        {columns.map((col, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {col}
            {i < columns.length - 1 && <Arrow mirrored={mirrored} />}
          </div>
        ))}
      </div>
    </div>
  )
}
