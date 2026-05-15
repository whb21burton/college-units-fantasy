'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TournamentMatchup, Team, UserBracketPick } from '@/lib/bracketTypes'

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

interface MatchupCardProps {
  matchup: TournamentMatchup
  userPick: UserBracketPick | null
  onPick: (matchupId: string, team: Team, predictedSeries?: '2-0' | '2-1') => void
  isLocked: boolean
  showSeriesPicker: boolean
}

export default function MatchupCard({ matchup, userPick, onPick, isLocked, showSeriesPicker }: MatchupCardProps) {
  const [justPicked, setJustPicked] = useState<string | null>(null)

  const pickedTeamId = userPick?.picked_team?.id ?? null
  const isCompleted = matchup.status === 'completed'
  const isActive = matchup.status === 'active'

  const getCardBorderColor = () => {
    if (!isCompleted || !userPick) return pickedTeamId ? C.gold : C.surf3
    if (userPick.is_correct === true) return C.green
    if (userPick.is_correct === false) return C.red
    return C.surf3
  }

  const getCardBg = () => {
    if (!isCompleted || !userPick) return C.surf2
    if (userPick.is_correct === true) return 'rgba(21,198,120,0.08)'
    if (userPick.is_correct === false) return 'rgba(240,58,90,0.08)'
    return C.surf2
  }

  const handleTeamClick = (team: Team) => {
    if (isLocked || isCompleted) return
    if (!team) return
    setJustPicked(team.id)
    setTimeout(() => setJustPicked(null), 600)
    onPick(matchup.id, team, userPick?.predicted_series ?? undefined)
  }

  const handleSeriesPick = (series: '2-0' | '2-1') => {
    if (isLocked || !pickedTeamId) return
    const pickedTeam = pickedTeamId === matchup.team1?.id ? matchup.team1 : matchup.team2
    if (!pickedTeam) return
    onPick(matchup.id, pickedTeam, series)
  }

  const renderTeamRow = (team: Team | null, position: 'top' | 'bottom') => {
    const isPicked = pickedTeamId === team?.id
    const isWinner = isCompleted && matchup.winner?.id === team?.id
    const isLoser = isCompleted && matchup.winner && matchup.winner.id !== team?.id

    return (
      <motion.div
        whileTap={!isLocked && !isCompleted && team ? { scale: 0.97 } : {}}
        animate={justPicked === team?.id ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={{ duration: 0.25 }}
        onClick={() => team && handleTeamClick(team)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          cursor: !isLocked && !isCompleted && team ? 'pointer' : 'default',
          borderRadius: 6,
          background: isPicked ? 'rgba(245,166,35,0.12)' : 'transparent',
          opacity: isLoser ? 0.45 : 1,
          position: 'relative',
          borderBottom: position === 'top' ? `1px solid ${C.surf3}` : 'none',
          transition: 'background 0.15s',
        }}
      >
        {isPicked && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: C.gold,
              flexShrink: 0,
              boxShadow: `0 0 6px ${C.gold}`,
            }}
          />
        )}
        <span style={{
          fontSize: 11,
          color: C.muted,
          fontWeight: 700,
          minWidth: 18,
          fontFamily: 'Oswald, sans-serif',
        }}>
          {team ? `#${team.seed}` : ''}
        </span>
        <span style={{
          flex: 1,
          fontSize: 13,
          color: team ? (isPicked ? C.gold : isWinner ? C.green : C.text) : C.muted,
          fontWeight: isPicked || isWinner ? 700 : 500,
          fontFamily: 'Oswald, sans-serif',
          letterSpacing: 0.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {team ? team.name : 'TBD'}
        </span>
        {team?.record && (
          <span style={{ fontSize: 10, color: C.sub, flexShrink: 0 }}>
            {team.record}
          </span>
        )}
        {isWinner && (
          <span style={{ fontSize: 10, color: C.green, fontWeight: 700, flexShrink: 0 }}>✓</span>
        )}
      </motion.div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, maxWidth: 300 }}>
      <motion.div
        animate={justPicked ? {
          boxShadow: [`0 0 0px ${C.gold}00`, `0 0 16px ${C.gold}66`, `0 0 4px ${C.gold}22`],
        } : {}}
        transition={{ duration: 0.4 }}
        style={{
          background: getCardBg(),
          border: `1.5px solid ${getCardBorderColor()}`,
          borderRadius: 8,
          overflow: 'hidden',
          transition: 'border-color 0.2s, background 0.2s',
        }}
      >
        {/* Status badge */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 10px',
          background: C.surf3,
          minHeight: 20,
        }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1.2,
            color: C.sub,
            fontFamily: 'Oswald, sans-serif',
          }}>
            G{matchup.matchup_index + 1}
          </span>
          {isActive && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: C.red,
              fontFamily: 'Oswald, sans-serif',
            }}>
              LIVE
            </span>
          )}
          {isCompleted && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: C.muted,
              fontFamily: 'Oswald, sans-serif',
            }}>
              FINAL {matchup.series_result ?? ''}
            </span>
          )}
        </div>

        {renderTeamRow(matchup.team1, 'top')}
        {renderTeamRow(matchup.team2, 'bottom')}
      </motion.div>

      {/* Series picker */}
      <AnimatePresence>
        {showSeriesPicker && pickedTeamId && !isLocked && !isCompleted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', gap: 6, overflow: 'hidden' }}
          >
            {(['2-0', '2-1'] as const).map(series => (
              <button
                key={series}
                onClick={() => handleSeriesPick(series)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  background: userPick?.predicted_series === series ? C.gold : C.surf3,
                  color: userPick?.predicted_series === series ? C.bg : C.sub,
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'Oswald, sans-serif',
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {series}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
