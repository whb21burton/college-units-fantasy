'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Team } from '@/lib/bracketTypes'

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

function seedColor(seed: number): string {
  if (seed === 1) return '#f5a623'
  if (seed === 2) return '#3b82f6'
  if (seed === 3) return '#8b5cf6'
  return '#6b7280'
}

/* ── Static team data ──────────────────────────────────── */
const REGIONS: Record<string, { display: string; teams: Team[] }> = {
  nashville:   { display: 'Nashville',   teams: [{ id: 'vand',    name: 'Vanderbilt',       seed: 1, record: '45-12' }, { id: 'etsu',   name: 'E. Tennessee St',  seed: 2, record: '42-15' }, { id: 'wst',    name: 'Wright State',     seed: 3, record: '36-19' }, { id: 'lou',    name: 'Louisville',       seed: 4, record: '39-18' }] },
  hattiesburg: { display: 'Hattiesburg', teams: [{ id: 'smiss',   name: 'Southern Miss',    seed: 1, record: '43-14' }, { id: 'ala',    name: 'Alabama',           seed: 2, record: '40-16' }, { id: 'col',    name: 'Columbia',         seed: 3, record: '34-22' }, { id: 'mia',    name: 'Miami (FL)',        seed: 4, record: '38-20' }] },
  tallahassee: { display: 'Tallahassee', teams: [{ id: 'fsu',     name: 'Florida State',    seed: 1, record: '44-14' }, { id: 'bcu',    name: 'Bethune-Cookman',   seed: 2, record: '38-22' }, { id: 'neu',    name: 'Northeastern',     seed: 3, record: '35-21' }, { id: 'miss',   name: 'Mississippi St',   seed: 4, record: '37-20' }] },
  corvallis:   { display: 'Corvallis',   teams: [{ id: 'orst',    name: 'Oregon State',     seed: 1, record: '42-16' }, { id: 'tcu',    name: 'TCU',               seed: 2, record: '40-17' }, { id: 'mich',   name: 'Michigan',         seed: 3, record: '36-19' }, { id: 'usc',    name: 'USC',              seed: 4, record: '35-21' }] },
  austin:      { display: 'Austin',      teams: [{ id: 'tex',     name: 'Texas',            seed: 1, record: '44-13' }, { id: 'uconn',  name: 'UConn',             seed: 2, record: '39-18' }, { id: 'kst',    name: 'Kansas State',     seed: 3, record: '35-22' }, { id: 'utsa',   name: 'UTSA',             seed: 4, record: '33-24' }] },
  los_angeles: { display: 'Los Angeles', teams: [{ id: 'ucla',    name: 'UCLA',             seed: 1, record: '42-15' }, { id: 'fres',   name: 'Fresno State',      seed: 2, record: '38-19' }, { id: 'asu',    name: 'Arizona State',    seed: 3, record: '36-20' }, { id: 'uci',    name: 'UC Irvine',        seed: 4, record: '34-23' }] },
  oxford:      { display: 'Oxford',      teams: [{ id: 'olemiss', name: 'Ole Miss',          seed: 1, record: '45-12' }, { id: 'wku',    name: 'Western Kentucky',  seed: 2, record: '38-20' }, { id: 'gtech',  name: 'Georgia Tech',     seed: 3, record: '35-21' }, { id: 'murr',   name: 'Murray State',     seed: 4, record: '32-25' }] },
  athens:      { display: 'Athens',      teams: [{ id: 'uga',     name: 'Georgia',           seed: 1, record: '44-14' }, { id: 'bing',   name: 'Binghamton',        seed: 2, record: '37-21' }, { id: 'okst',   name: 'Oklahoma State',   seed: 3, record: '36-20' }, { id: 'duke',   name: 'Duke',             seed: 4, record: '34-23' }] },
}

function getRegions(dbTeams: any[]): Record<string, { display: string; teams: Team[] }> {
  if (dbTeams.length === 0) return REGIONS
  const result: Record<string, { display: string; teams: Team[] }> = {}
  const regionKeys = ['nashville','hattiesburg','tallahassee','corvallis','austin','los_angeles','oxford','athens']
  for (const key of regionKeys) {
    const regionTeams = dbTeams
      .filter(t => t.region_key === key && t.team_name)
      .sort((a: any, b: any) => a.seed - b.seed)
      .map((t: any) => ({ id: t.team_id || `${t.region_key}_${t.seed}`, name: t.team_name, seed: t.seed, record: t.record || '' }))
    if (regionTeams.length > 0) {
      const display = dbTeams.find((t: any) => t.region_key === key)?.region_display ?? key
      result[key] = { display, teams: regionTeams }
    } else {
      result[key] = REGIONS[key]
    }
  }
  return result
}

// SR pairings: two left-side regionals → one SR in col 2
// Two right-side regionals → one SR in col 4
const LEFT_SR: Array<{ idx: number; label: string; top: string; bot: string }> = [
  { idx: 0, label: 'Super Regional 1', top: 'nashville',   bot: 'hattiesburg' },
  { idx: 1, label: 'Super Regional 2', top: 'tallahassee', bot: 'corvallis'   },
]
const RIGHT_SR: Array<{ idx: number; label: string; top: string; bot: string }> = [
  { idx: 2, label: 'Super Regional 3', top: 'austin',      bot: 'los_angeles' },
  { idx: 3, label: 'Super Regional 4', top: 'oxford',      bot: 'athens'      },
]
// CWS semi pairings: SR idx → semi slot
// Semi 0: SR0 winner vs SR2 winner   Semi 1: SR1 winner vs SR3 winner
const CWS_SEMIS: Array<{ semiIdx: number; leftSR: number; rightSR: number }> = [
  { semiIdx: 0, leftSR: 0, rightSR: 2 },
  { semiIdx: 1, leftSR: 1, rightSR: 3 },
]

type BracketPicks = {
  regionals:      Record<string, Team>
  superRegionals: Record<number, Team>
  semifinals:     Record<number, Team>
  champion:       Team | null
  seriesResult:   '2-0' | '2-1' | null
}

function empty(): BracketPicks {
  return { regionals: {}, superRegionals: {}, semifinals: {}, champion: null, seriesResult: null }
}

function countPicks(p: BracketPicks): number {
  return Object.keys(p.regionals).length
    + Object.keys(p.superRegionals).length
    + Object.keys(p.semifinals).length
    + (p.champion ? 1 : 0)
    + (p.seriesResult ? 1 : 0)
}

const TOTAL = 16 // 8 reg + 4 SR + 2 semi + 1 champ + 1 series

type Tab = 'bracket' | 'leaderboard' | 'chat' | 'invite'
type MSection = 'left' | 'super-left' | 'cws' | 'super-right' | 'right'
type PickResult = 'correct' | 'incorrect' | 'pending'

function getPickResult(pickedId: string | undefined, winnerId: string | undefined): PickResult {
  if (!pickedId || !winnerId) return 'pending'
  return pickedId === winnerId ? 'correct' : 'incorrect'
}

/* ── Sub-components ────────────────────────────────────── */

function TeamCard({ team, isPicked, onPick, isLocked, result, isMobile }: {
  team: Team; isPicked: boolean; onPick: () => void; isLocked: boolean; result?: PickResult; isMobile?: boolean
}) {
  const sc = seedColor(team.seed)
  const borderColor = isPicked
    ? (result === 'correct' ? C.green : result === 'incorrect' ? C.red : sc)
    : C.surf3
  const bg = isPicked
    ? (result === 'correct' ? 'rgba(21,198,120,.12)' : result === 'incorrect' ? 'rgba(240,58,90,.12)' : sc + '18')
    : C.surf2
  const labelColor = result === 'correct' ? C.green : result === 'incorrect' ? C.red : sc
  return (
    <div
      onClick={isLocked ? undefined : onPick}
      style={{
        padding: isMobile ? '12px 10px' : '9px 8px',
        minHeight: isMobile ? 64 : undefined,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6, cursor: isLocked ? 'default' : 'pointer',
        transition: 'all .15s', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: isMobile ? 20 : 17, color: sc, marginBottom: 1, lineHeight: 1 }}>
        {team.seed}
      </div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: isMobile ? 11 : 10, color: isPicked ? sc : C.text, lineHeight: 1.2, letterSpacing: 0.3 }}>
        {team.name}
      </div>
      {team.record && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, marginTop: 2 }}>{team.record}</div>
      )}
      {isPicked && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 7, color: labelColor, marginTop: 3, letterSpacing: 1 }}>
          {result === 'correct' ? '✓ CORRECT' : result === 'incorrect' ? '✗ WRONG' : 'ADVANCES ›'}
        </div>
      )}
    </div>
  )
}

function RegionalPod({ regionKey, picks, onPick, isLocked, arrow, matchupResults, hasSubmitted, isMobile, regions }: {
  regionKey: string; picks: BracketPicks; onPick: (k: string, t: Team) => void; isLocked: boolean; arrow?: 'right' | 'left'
  matchupResults?: Record<string, any>; hasSubmitted?: boolean; isMobile?: boolean
  regions?: Record<string, { display: string; teams: Team[] }>
}) {
  const r = (regions ?? REGIONS)[regionKey]
  if (!r) return null
  const pickedId = picks.regionals[regionKey]?.id
  const resultWinner = matchupResults?.[`regional_${regionKey}`]?.winner
  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: isMobile ? '12px 12px 14px' : '10px 10px 12px' }}>
      <div style={{
        fontFamily: 'Oswald,sans-serif', fontSize: isMobile ? 13 : 9, letterSpacing: 2, color: C.gold,
        textTransform: 'uppercase', marginBottom: isMobile ? 10 : 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        ...(isMobile ? { paddingBottom: 6, borderBottom: `1px solid ${C.surf3}` } : {}),
      }}>
        <span>{r.display}</span>
        {arrow === 'right' && <span style={{ color: C.surf3, fontSize: 14 }}>›</span>}
        {arrow === 'left'  && <span style={{ color: C.surf3, fontSize: 14 }}>‹</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 8 : 4 }}>
        {r.teams.map(t => {
          const result: PickResult | undefined = (hasSubmitted && resultWinner && pickedId === t.id)
            ? getPickResult(t.id, resultWinner)
            : undefined
          return (
            <TeamCard key={t.id} team={t} isPicked={pickedId === t.id} onPick={() => onPick(regionKey, t)} isLocked={isLocked} result={result} isMobile={isMobile} />
          )
        })}
      </div>
    </div>
  )
}

function SRSlot({ team, label, isPicked, onPick, isLocked, result }: {
  team: Team | undefined; label: string; isPicked: boolean; onPick: () => void; isLocked: boolean; result?: PickResult
}) {
  const borderColor = isPicked
    ? (result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.gold)
    : C.surf3
  const bg = isPicked
    ? (result === 'correct' ? 'rgba(21,198,120,.1)' : result === 'incorrect' ? 'rgba(240,58,90,.1)' : 'rgba(245,166,35,.1)')
    : C.surf
  const labelColor = result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.gold
  return (
    <div
      onClick={team && !isLocked ? onPick : undefined}
      style={{
        padding: '9px 12px',
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6, cursor: team && !isLocked ? 'pointer' : 'default',
        minHeight: 44, display: 'flex', alignItems: 'center', gap: 8,
        transition: 'all .15s',
      }}
    >
      {team ? (
        <>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: seedColor(team.seed) + '22',
            border: `1px solid ${seedColor(team.seed)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Anton,sans-serif', fontSize: 10, color: seedColor(team.seed),
          }}>{team.seed}</div>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: isPicked ? labelColor : C.text }}>{team.name}</div>
            {isPicked && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 7, color: labelColor, letterSpacing: 1 }}>
              {result === 'correct' ? '✓ CORRECT' : result === 'incorrect' ? '✗ WRONG' : 'ADVANCES'}
            </div>}
          </div>
          {isPicked && <span style={{ marginLeft: 'auto', color: labelColor, fontSize: 13 }}>
            {result === 'correct' ? '✓' : result === 'incorrect' ? '✗' : '✓'}
          </span>}
        </>
      ) : (
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>
          {label} Winner
        </span>
      )}
    </div>
  )
}

function SRBox({ sr, picks, onPick, isLocked, matchupResults, hasSubmitted, regions }: {
  sr: (typeof LEFT_SR)[0]; picks: BracketPicks; onPick: (idx: number, t: Team) => void; isLocked: boolean
  matchupResults?: Record<string, any>; hasSubmitted?: boolean
  regions?: Record<string, { display: string; teams: Team[] }>
}) {
  const topWinner = picks.regionals[sr.top]
  const botWinner = picks.regionals[sr.bot]
  const srWinner  = picks.superRegionals[sr.idx]
  const topDisplay = (regions ?? REGIONS)[sr.top]?.display ?? sr.top
  const botDisplay = (regions ?? REGIONS)[sr.bot]?.display ?? sr.bot
  const srResultWinner = matchupResults?.[`super_${sr.idx}`]?.winner
  const topIsPicked = !!(srWinner && topWinner && srWinner.id === topWinner.id)
  const botIsPicked = !!(srWinner && botWinner && srWinner.id === botWinner.id)
  const topResult: PickResult | undefined = (hasSubmitted && srResultWinner && topIsPicked && topWinner)
    ? getPickResult(topWinner.id, srResultWinner) : undefined
  const botResult: PickResult | undefined = (hasSubmitted && srResultWinner && botIsPicked && botWinner)
    ? getPickResult(botWinner.id, srResultWinner) : undefined

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        padding: '6px 10px', background: C.surf2,
        borderBottom: `1px solid ${C.surf3}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.gold, letterSpacing: 2, textTransform: 'uppercase' }}>
          {sr.label}
        </span>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 7, color: C.muted }}>Best of 3</span>
      </div>
      <div style={{ padding: '8px' }}>
        <SRSlot
          team={topWinner}
          label={topDisplay}
          isPicked={topIsPicked}
          onPick={() => topWinner && onPick(sr.idx, topWinner)}
          isLocked={isLocked}
          result={topResult}
        />
        <div style={{ textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, padding: '4px 0' }}>VS</div>
        <SRSlot
          team={botWinner}
          label={botDisplay}
          isPicked={botIsPicked}
          onPick={() => botWinner && onPick(sr.idx, botWinner)}
          isLocked={isLocked}
          result={botResult}
        />
      </div>
    </div>
  )
}

function CWSMatchupBox({ label, t1, t2, picked, onPick, isLocked, resultWinner, hasSubmitted }: {
  label: string; t1: Team | null; t2: Team | null; picked: Team | null; onPick: (t: Team) => void; isLocked: boolean
  resultWinner?: string; hasSubmitted?: boolean
}) {
  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: C.surf2, borderBottom: `1px solid ${C.surf3}` }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</span>
      </div>
      {([t1, t2] as (Team | null)[]).map((team, i) => {
        const sel = picked?.id === team?.id
        const result: PickResult | undefined = (hasSubmitted && resultWinner && sel && team)
          ? getPickResult(team.id, resultWinner) : undefined
        const rowBg = sel
          ? (result === 'correct' ? 'rgba(21,198,120,.08)' : result === 'incorrect' ? 'rgba(240,58,90,.08)' : 'rgba(245,166,35,.08)')
          : 'transparent'
        const nameColor = sel
          ? (result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.gold)
          : C.text
        const checkIcon = result === 'correct' ? '✓' : result === 'incorrect' ? '✗' : '✓'
        const checkColor = result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.gold
        return (
          <div key={i}
            onClick={team && !isLocked ? () => onPick(team) : undefined}
            style={{
              padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: i === 0 ? `1px solid ${C.surf3}` : 'none',
              background: rowBg,
              cursor: team && !isLocked ? 'pointer' : 'default',
              transition: 'background .12s',
            }}
          >
            {team ? (
              <>
                <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.muted, width: 14 }}>{team.seed}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: nameColor, flex: 1 }}>{team.name}</span>
                {sel && <span style={{ color: checkColor, fontSize: 12 }}>{checkIcon}</span>}
              </>
            ) : (
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>TBD</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChampSlot({ team, isPicked, onPick, isLocked, result }: {
  team: Team | null; isPicked: boolean; onPick: () => void; isLocked: boolean; result?: PickResult
}) {
  const borderColor = isPicked
    ? (result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.gold)
    : C.surf3
  const bg = isPicked
    ? (result === 'correct' ? 'rgba(21,198,120,.12)' : result === 'incorrect' ? 'rgba(240,58,90,.12)' : 'rgba(245,166,35,.12)')
    : C.surf
  const nameColor = isPicked
    ? (result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.gold)
    : C.text
  return (
    <div
      onClick={team && !isLocked ? onPick : undefined}
      style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6, cursor: team && !isLocked ? 'pointer' : 'default',
        transition: 'all .15s', minHeight: 48,
      }}
    >
      {team ? (
        <>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: seedColor(team.seed) + '22', border: `1.5px solid ${seedColor(team.seed)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Anton,sans-serif', fontSize: 12, color: seedColor(team.seed),
          }}>{team.seed}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: nameColor }}>{team.name}</div>
            {isPicked && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: nameColor, letterSpacing: 1 }}>
              {result === 'correct' ? '✓ CORRECT CHAMPION' : result === 'incorrect' ? '✗ WRONG CHAMPION' : 'NATIONAL CHAMPION'}
            </div>}
          </div>
          {isPicked && <span style={{ color: nameColor, fontSize: 18 }}>
            {result === 'correct' ? '✓' : result === 'incorrect' ? '✗' : '★'}
          </span>}
        </>
      ) : (
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>TBD</span>
      )}
    </div>
  )
}

/* ── Column wrapper helpers ─────────────────────────────── */

function ColHeader({ line1, line2, align = 'left' }: { line1: string; line2: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <div style={{ marginBottom: 10, textAlign: align }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, letterSpacing: 2, textTransform: 'uppercase' }}>{line1}</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, marginTop: 2 }}>{line2}</div>
    </div>
  )
}

function ConnectorPair({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderRight: `2px solid ${C.surf3}`,
      paddingRight: 0,
      display: 'flex', flexDirection: 'column', gap: 10,
      flex: 1,
    }}>
      {children}
    </div>
  )
}

function ConnectorPairRight({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderLeft: `2px solid ${C.surf3}`,
      paddingLeft: 0,
      display: 'flex', flexDirection: 'column', gap: 10,
      flex: 1,
    }}>
      {children}
    </div>
  )
}

/* ── Progress bar ───────────────────────────────────────── */
function ProgressBar({ n, total }: { n: number; total: number }) {
  const done = n >= total
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1 }}>
          {n} / {total} picks made
        </span>
        {done && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.green }}>✓ Ready to submit</span>}
      </div>
      <div style={{ height: 4, background: C.surf3, borderRadius: 2 }}>
        <div style={{
          height: '100%',
          width: `${(n / total) * 100}%`,
          background: `linear-gradient(90deg, ${C.gold}, ${C.green})`,
          borderRadius: 2, transition: 'width .3s',
        }} />
      </div>
    </div>
  )
}

/* ── Read-only bracket viewer ───────────────────────────── */
function ReadOnlyBracket({ picks, matchupResults }: { picks: any; matchupResults: Record<string, any> }) {
  if (!picks) return <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12, textAlign: 'center', padding: 40 }}>No picks saved</div>

  const sections = [
    { title: '🏟️ Regionals (3 pts each)', items: Object.entries(picks.regionals ?? {}).map(([region, team]: any) => ({ label: region.replace(/_/g, ' '), team, key: `regional_${region}` })) },
    { title: '⚔️ Super Regionals (5 pts each)', items: Object.entries(picks.superRegionals ?? {}).map(([idx, team]: any) => ({ label: `Super Regional ${parseInt(idx) + 1}`, team, key: `super_${idx}` })) },
    { title: '🏟️ CWS Semifinals (10 pts each)', items: Object.entries(picks.semifinals ?? {}).map(([idx, team]: any) => ({ label: `Semifinal ${parseInt(idx) + 1}`, team, key: `semi_${idx}` })) },
    { title: '🏆 Champion (15 pts)', items: picks.champion ? [{ label: 'National Champion', team: picks.champion, key: 'champion' }] : [] },
  ]

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      {sections.map(section => section.items.length === 0 ? null : (
        <div key={section.title} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
            {section.title}
          </div>
          {section.items.map(({ label, team, key }) => {
            const winner = matchupResults[key]?.winner
            const result: PickResult = winner ? (team?.id === winner ? 'correct' : 'incorrect') : 'pending'
            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', marginBottom: 4, background: C.surf, border: `1px solid ${result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.surf3}`, borderRadius: 6 }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, textTransform: 'capitalize' }}>{label}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: result === 'correct' ? C.green : result === 'incorrect' ? C.red : C.text }}>
                  {team?.name ?? 'No pick'}
                  {result === 'correct' && ' ✓'}
                  {result === 'incorrect' && ' ✗'}
                </span>
              </div>
            )
          })}
          {picks.seriesResult && section.title.includes('Champion') && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 6, marginTop: 4 }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>Series Result</span>
              <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.gold }}>{picks.seriesResult}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Leaderboard Tab ────────────────────────────────────── */
function LeaderboardTab({ contestId, userId, contest, isLocked, matchupResults }: {
  contestId: string; userId: string | null; contest: any; isLocked: boolean
  matchupResults: Record<string, any>
}) {
  const supabase = createClientComponentClient()
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingEntry, setViewingEntry] = useState<any>(null)

  const POINTS = { regional: 3, super_regional: 5, cws_semifinal: 10, championship: 15, series_bonus: 5 }
  const MAX_SCORE = (8 * POINTS.regional) + (4 * POINTS.super_regional) + (2 * POINTS.cws_semifinal) + POINTS.championship + POINTS.series_bonus

  useEffect(() => {
    supabase
      .from('user_bracket_entries')
      .select('id, entry_name, user_id, total_score, correct_picks, submitted_at, is_submitted, bracket_data')
      .eq('contest_id', contestId)
      .eq('is_submitted', true)
      .order('total_score', { ascending: false })
      .order('submitted_at', { ascending: true })
      .then(({ data }) => { setEntries(data ?? []); setLoading(false) })
  }, [contestId])

  const entryFeeCents   = contest?.entry_fee_cents ?? 0
  const payoutStructure = contest?.settings?.payout_structure ?? 'winner_take_all'
  const totalEntries    = entries.length
  const netPool         = Math.floor(entryFeeCents * totalEntries * 0.95)

  function getAdaptedStructure(structure: string, n: number): string {
    if (structure === 'top3') {
      if (n <= 1) return 'winner_take_all'
      if (n === 2) return 'top2'
      return 'top3'
    }
    if (structure === 'top2') {
      if (n <= 1) return 'winner_take_all'
      return 'top2'
    }
    return structure
  }

  function getPayoutForRank(rank: number): number {
    if (netPool === 0) return 0
    if (payoutStructure === 'double_up') {
      const winners = Math.floor(totalEntries / 2)
      const hasMiddle = totalEntries % 2 !== 0
      if (hasMiddle && rank === winners + 1) return entryFeeCents
      if (rank <= winners) return Math.floor(entryFeeCents * 1.95)
      return 0
    }
    const adapted = getAdaptedStructure(payoutStructure, totalEntries)
    if (adapted === 'winner_take_all') return rank === 1 ? netPool : 0
    if (adapted === 'top2') {
      if (rank === 1) return Math.floor(netPool * 0.70)
      if (rank === 2) return Math.floor(netPool * 0.30)
      return 0
    }
    if (adapted === 'top3') {
      if (rank === 1) return Math.floor(netPool * 0.60)
      if (rank === 2) return Math.floor(netPool * 0.25)
      if (rank === 3) return Math.floor(netPool * 0.15)
      return 0
    }
    return 0
  }

  function isInMoney(rank: number): boolean {
    if (payoutStructure === 'double_up') {
      const winners = Math.floor(totalEntries / 2)
      const hasMiddle = totalEntries % 2 !== 0
      return rank <= winners + (hasMiddle ? 1 : 0)
    }
    const adapted = getAdaptedStructure(payoutStructure, totalEntries)
    if (adapted === 'top3') return rank <= 3
    if (adapted === 'top2') return rank <= 2
    return rank === 1
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
      Loading leaderboard…
    </div>
  )
  if (entries.length === 0) return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🏅</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.muted }}>
        No entries yet — be the first to submit!
      </div>
    </div>
  )

  const adaptedStructure = getAdaptedStructure(payoutStructure, totalEntries)
  const structureLabel = adaptedStructure === 'winner_take_all' ? 'Winner Take All'
    : adaptedStructure === 'top2' ? 'Top 2 Pay'
    : adaptedStructure === 'top3' ? 'Top 3 Pay'
    : 'Double Up'

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
          🏅 Leaderboard
        </div>
        <div style={{ display: 'flex', gap: 16, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
          <span>{entries.length} entries</span>
          <span>Max score: {MAX_SCORE} pts</span>
          {netPool > 0 && <span>Prize pool: ${(netPool / 100).toFixed(2)}</span>}
        </div>
        {adaptedStructure !== payoutStructure && entries.length > 0 && (
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.gold, marginTop: 4 }}>
            ⚡ Paying as {structureLabel} ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
          </div>
        )}
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 90px', gap: 8, padding: '6px 10px', marginBottom: 4 }}>
        {['#', 'BRACKET', 'SCORE', 'PRIZE'].map((h, i) => (
          <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textAlign: i >= 2 ? (i === 3 ? 'right' : 'center') : 'left' }}>{h}</div>
        ))}
      </div>

      {entries.map((entry, i) => {
        const rank     = i + 1
        const isMe     = entry.user_id === userId
        const inMoney  = isInMoney(rank)
        const prize    = getPayoutForRank(rank)
        const score    = entry.total_score ?? 0
        const pct      = MAX_SCORE > 0 ? Math.round((score / MAX_SCORE) * 100) : 0
        const champion = entry.bracket_data?.champion

        return (
          <div key={entry.id}
            onClick={() => setViewingEntry(entry)}
            style={{
              display: 'grid', gridTemplateColumns: '32px 1fr 80px 90px', gap: 8,
              padding: '12px 10px', marginBottom: 4,
              background: isMe ? 'rgba(245,166,35,.08)' : C.surf,
              border: `1px solid ${isMe ? C.gold : inMoney ? 'rgba(21,198,120,.2)' : C.surf3}`,
              borderRadius: 8, alignItems: 'center', cursor: 'pointer',
            }}
            title="Click to view bracket"
          >
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, textAlign: 'center', color: rank === 1 ? C.gold : rank === 2 ? '#aaaaaa' : rank === 3 ? '#cd7f32' : C.muted }}>
              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
            </div>

            <div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: isMe ? C.gold : C.text, marginBottom: 2 }}>
                {entry.entry_name} {isMe && <span style={{ fontSize: 9, color: C.gold }}>(You)</span>}
              </div>
              {isLocked && champion && (
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <span>🏆</span>
                  <span style={{ color: C.sub }}>{champion.name}</span>
                </div>
              )}
              <div style={{ height: 4, background: C.surf3, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: isLocked ? `linear-gradient(90deg, ${C.gold}, ${C.green})` : C.surf3,
                  borderRadius: 2, transition: 'width 0.5s ease',
                }} />
              </div>
              {isLocked && (
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 2 }}>
                  {score}/{MAX_SCORE} pts ({pct}%)
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: isLocked ? C.text : C.muted }}>
                {isLocked ? score : '—'}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted }}>
                {isLocked ? 'pts' : 'pending'}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              {netPool === 0 ? (
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>Free</div>
              ) : inMoney ? (
                <>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.green }}>${(prize / 100).toFixed(2)}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.green, letterSpacing: 1 }}>✓ IN MONEY</div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.red }}>—</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.red, letterSpacing: 1 }}>✗ OUT</div>
                </>
              )}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 20, padding: '12px 14px', background: C.surf2, borderRadius: 8 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Scoring</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {([
            ['Regional', '3 pts'],
            ['Super Regional', '5 pts'],
            ['CWS Semifinal', '10 pts'],
            ['Champion', '15 pts'],
            ['Series Result', '+5 bonus'],
            ['Max Score', `${MAX_SCORE} pts`],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, padding: '2px 0' }}>
              <span>{label}</span>
              <span style={{ color: C.gold }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {viewingEntry && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column' as const }}>
          <div style={{ background: C.surf, borderBottom: `1px solid ${C.surf3}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, letterSpacing: 1 }}>
                {viewingEntry.entry_name}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                Score: {viewingEntry.total_score ?? 0} pts · Submitted {new Date(viewingEntry.submitted_at).toLocaleDateString()}
              </div>
            </div>
            <button onClick={() => setViewingEntry(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 24 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <ReadOnlyBracket picks={viewingEntry.bracket_data} matchupResults={matchupResults} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────── */
export default function BracketPage() {
  const params        = useParams()
  const searchParams  = useSearchParams()
  const contestId     = params.id as string
  const isEmbed       = searchParams.get('embed') === '1'
  const supabase      = createClientComponentClient()

  const [userId,         setUserId]         = useState<string | null>(null)
  const [contest,        setContest]        = useState<any>(null)
  const [picks,          setPicks]          = useState<BracketPicks>(empty())
  const [tab,            setTab]            = useState<Tab>('bracket')
  const [mSection,       setMSection]       = useState<MSection>('left')
  const [loading,        setLoading]        = useState(true)
  const [submitting,     setSubmitting]     = useState(false)
  const [hasPaid,        setHasPaid]        = useState(false)
  const [isLocked,       setIsLocked]       = useState(false)
  const [leagueId,       setLeagueId]       = useState<string | null>(null)
  const [isPublicLeague, setIsPublicLeague] = useState(false)
  const [inviteCode,     setInviteCode]     = useState<string | null>(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [matchupResults, setMatchupResults] = useState<Record<string, any>>({})
  const [walletBalance,  setWalletBalance]  = useState<number>(0)
  const [showWalletModal,   setShowWalletModal]   = useState(false)
  const [showAddEntryModal, setShowAddEntryModal] = useState(false)
  const [originalPicks,  setOriginalPicks]  = useState<BracketPicks | null>(null)
  const [chatMessages,   setChatMessages]   = useState<any[]>([])
  const [chatInput,      setChatInput]      = useState('')
  // Multi-entry
  const [myEntries,      setMyEntries]      = useState<any[]>([])
  const [activeEntryNum, setActiveEntryNum] = useState(1)
  const [maxPerAccount,  setMaxPerAccount]  = useState(1)
  const [entryFeeCents,  setEntryFeeCents]  = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [isMobile,  setIsMobile]  = useState(false)
  const [dbTeams,   setDbTeams]   = useState<any[]>([])
  const swipeTouchStart = useRef<number>(0)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    const { data: c } = await supabase.from('bracket_contests').select('*').eq('id', contestId).single()
    if (c) {
      setContest(c)
      setEntryFeeCents(c.entry_fee_cents ?? 0)
      setMaxPerAccount(c.settings?.max_per_account ?? 1)
      if (c.status === 'locked' || c.status === 'active' || c.status === 'completed') setIsLocked(true)
      if (c.locks_at && new Date(c.locks_at) < new Date()) setIsLocked(true)
    }

    const { data: lockSetting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'brackets_locked')
      .single()
    if (lockSetting?.value === 'true') setIsLocked(true)

    const { data: teamData } = await supabase
      .from('bracket_teams')
      .select('*')
      .eq('contest_id', 'global')
      .order('region_key')
      .order('seed')
    if (teamData && teamData.length > 0) setDbTeams(teamData)

    try {
      const walletRes = await fetch('/api/wallet')
      if (walletRes.ok) {
        const walletData = await walletRes.json()
        setWalletBalance(walletData.wallet?.balance ?? 0)
      }
    } catch {}

    setLoading(false)
  }, [supabase, contestId])

  useEffect(() => {
    console.log('[bracket] contestId:', contestId)
    loadData()
  }, [loadData])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const BRACKET_MSECTIONS: MSection[] = ['left', 'super-left', 'cws', 'super-right', 'right']

  function handleBracketTouchStart(e: React.TouchEvent) {
    swipeTouchStart.current = e.touches[0].clientX
  }

  function handleBracketTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - swipeTouchStart.current
    if (Math.abs(dx) < 50) return
    const currentIdx = BRACKET_MSECTIONS.indexOf(mSection)
    if (dx < -50 && currentIdx < BRACKET_MSECTIONS.length - 1) {
      setMSection(BRACKET_MSECTIONS[currentIdx + 1])
    }
    if (dx > 50 && currentIdx > 0) {
      setMSection(BRACKET_MSECTIONS[currentIdx - 1])
    }
  }

  // Load entries + owning league data
  useEffect(() => {
    if (!userId || !contestId) return

    supabase
      .from('user_bracket_entries')
      .select('*')
      .eq('contest_id', contestId)
      .eq('user_id', userId)
      .order('entry_number', { ascending: true })
      .then(({ data: entries }) => {
        const list = entries ?? []
        setMyEntries(list)
        const first = list[0]
        if (first?.bracket_data) {
          setPicks(first.bracket_data)
          setOriginalPicks(first.is_submitted ? first.bracket_data : null)
        }
        if (first) setActiveEntryNum(first.entry_number ?? 1)
      })

    supabase
      .from('leagues')
      .select('id, buy_in, is_public, invite_code, commissioner_id')
      .eq('league_type', 'bracket')
      .contains('settings', { bracket_contest_id: contestId })
      .single()
      .then(({ data }) => {
        if (data) {
          setLeagueId(data.id)
          setIsPublicLeague(data.is_public ?? false)
          setInviteCode(data.invite_code ?? null)
          setIsCommissioner(data.commissioner_id === userId)
        }
      })
  }, [userId, contestId])

  // Check hasPaid — runs after leagueId is resolved
  useEffect(() => {
    if (!userId || !contestId) return

    async function checkPaid() {
      // Check 1: existing bracket entry
      const { data: entry } = await supabase
        .from('user_bracket_entries')
        .select('id')
        .eq('contest_id', contestId)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()

      if (entry) { setHasPaid(true); return }

      // Check 2: league membership (private bracket leagues)
      if (leagueId) {
        const { data: member } = await supabase
          .from('league_members')
          .select('id')
          .eq('league_id', leagueId)
          .eq('user_id', userId)
          .maybeSingle()

        if (member) {
          setHasPaid(true)
          await supabase.from('user_bracket_entries').upsert({
            contest_id:   contestId,
            user_id:      userId,
            entry_name:   'My Bracket',
            entry_number: 1,
            is_submitted: false,
          }, { onConflict: 'contest_id,user_id,entry_number' })
          return
        }
      }

      // Check 3: contest_entry transaction
      const { data: tx } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'contest_entry')
        .eq('status', 'completed')
        .or(`description.ilike.%${contestId}%,league_id.eq.${leagueId ?? '00000000-0000-0000-0000-000000000000'}`)
        .maybeSingle()

      if (tx) setHasPaid(true)
    }

    checkPaid()
  }, [userId, contestId, leagueId])

  // Fetch matchup results for highlights after lock
  useEffect(() => {
    if (!isLocked || !contestId) return
    supabase
      .from('tournament_matchups')
      .select('round_type, regional_name, matchup_index, winner, championship_series_result')
      .eq('contest_id', contestId)
      .then(({ data }) => {
        if (!data) return
        const results: Record<string, any> = {}
        for (const m of data) {
          if (!m.winner) continue
          if (m.round_type === 'regional') {
            const key = `regional_${(m.regional_name ?? '').toLowerCase().replace(/[\s-]+/g, '_')}`
            results[key] = { winner: m.winner }
          } else if (m.round_type === 'super_regional') {
            results[`super_${m.matchup_index}`] = { winner: m.winner }
          } else if (m.round_type === 'cws_semifinal') {
            results[`semi_${m.matchup_index}`] = { winner: m.winner }
          } else if (m.round_type === 'championship') {
            results['champion'] = { winner: m.winner }
            if (m.championship_series_result) results['series_result'] = { result: m.championship_series_result }
          }
        }
        setMatchupResults(results)
      })
  }, [contestId, isLocked])

  // Chat: subscribe to bracket_messages
  useEffect(() => {
    if (!userId) return
    supabase.from('bracket_messages')
      .select('*')
      .eq('contest_id', contestId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setChatMessages(data ?? []))

    const ch = supabase.channel('bracket-chat-' + contestId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'bracket_messages',
        filter: 'contest_id=eq.' + contestId,
      }, (payload) => {
        setChatMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [supabase, contestId, userId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // When switching entry tabs, load that entry's picks
  useEffect(() => {
    const entry = myEntries.find(e => (e.entry_number ?? 1) === activeEntryNum)
    if (entry?.bracket_data) {
      setPicks(entry.bracket_data)
      setOriginalPicks(entry.bracket_data)
    } else {
      setPicks(empty())
      setOriginalPicks(null)
    }
  }, [activeEntryNum, myEntries])

  /* ── Pick handlers ── */
  function pickRegional(key: string, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, regionals: { ...prev.regionals, [key]: team } }
      // Cascade: find which SR this regional feeds and clear it if the winner changed
      const allSR = [...LEFT_SR, ...RIGHT_SR]
      const srDef = allSR.find(s => s.top === key || s.bot === key)
      if (srDef) {
        const srW = prev.superRegionals[srDef.idx]
        // If previous SR winner came from this regional but is a different team, clear downstream
        const prevReg = prev.regionals[key]
        if (prevReg && srW && srW.id === prevReg.id && team.id !== prevReg.id) {
          const { [srDef.idx]: _sr, ...restSR } = next.superRegionals
          next.superRegionals = restSR
          // Find CWS semi that used this SR
          const semiDef = CWS_SEMIS.find(s => s.leftSR === srDef.idx || s.rightSR === srDef.idx)
          if (semiDef) {
            const semiW = prev.semifinals[semiDef.semiIdx]
            const srW2 = prev.superRegionals[srDef.idx]
            if (semiW && srW2 && semiW.id === srW2.id) {
              const { [semiDef.semiIdx]: _s, ...restSemi } = next.semifinals
              next.semifinals = restSemi
              next.champion = null
              next.seriesResult = null
            }
          }
        }
      }
      return next
    })
  }

  function pickSR(idx: number, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, superRegionals: { ...prev.superRegionals, [idx]: team } }
      const semiDef = CWS_SEMIS.find(s => s.leftSR === idx || s.rightSR === idx)
      if (semiDef) {
        const semiW = prev.semifinals[semiDef.semiIdx]
        const prevSR = prev.superRegionals[idx]
        if (semiW && prevSR && semiW.id === prevSR.id && team.id !== prevSR.id) {
          const { [semiDef.semiIdx]: _, ...restSemi } = next.semifinals
          next.semifinals = restSemi
          next.champion = null
          next.seriesResult = null
        }
      }
      return next
    })
  }

  function pickSemi(semiIdx: number, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, semifinals: { ...prev.semifinals, [semiIdx]: team } }
      const prevSemi = prev.semifinals[semiIdx]
      if (prev.champion && prevSemi && prev.champion.id === prevSemi.id && team.id !== prevSemi.id) {
        next.champion = null
        next.seriesResult = null
      }
      return next
    })
  }

  function pickChampion(team: Team) {
    if (isLocked) return
    setPicks(prev => ({ ...prev, champion: team }))
  }

  /* ── Bracket chat ── */
  async function sendBracketChat() {
    if (!chatInput.trim() || !userId) return
    const msg = chatInput.trim()
    setChatInput('')
    const { data: { user } } = await supabase.auth.getUser()
    const displayName = activeEntry?.entry_name ?? user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'Player'
    await supabase.from('bracket_messages').insert({
      contest_id:   contestId,
      user_id:      userId,
      message:      msg,
      display_name: displayName,
    })
  }

  /* ── Direct submit (no modal — uses name already saved at join time) ── */
  async function handleSubmitDirect() {
    if (!userId || !contestId || totalPicks < TOTAL) return
    setSubmitting(true)
    try {
      if (!hasPaid && entryFeeCents > 0 && !isPublicLeague) {
        if (walletBalance < entryFeeCents) {
          alert(`Not enough funds. Need $${(entryFeeCents / 100).toFixed(2)}, you have $${(walletBalance / 100).toFixed(2)}.`)
          setSubmitting(false)
          return
        }
        if (leagueId) {
          const payRes = await fetch('/api/wallet/join-contest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ league_id: leagueId, team_name: bracketName }),
          })
          if (!payRes.ok) { const d = await payRes.json(); alert(d.error ?? 'Payment failed'); setSubmitting(false); return }
        } else {
          const payRes = await fetch('/api/wallet/bracket-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contestId, buyInCents: entryFeeCents }),
          })
          if (!payRes.ok) { const d = await payRes.json(); alert(d.error ?? 'Payment failed'); setSubmitting(false); return }
        }
        setWalletBalance(prev => prev - entryFeeCents)
        setHasPaid(true)
      }

      const { error } = await supabase
        .from('user_bracket_entries')
        .update({ bracket_data: picks, is_submitted: true, submitted_at: new Date().toISOString() })
        .eq('contest_id', contestId)
        .eq('user_id', userId)
        .eq('entry_number', activeEntryNum)

      if (error) throw error

      if (!hasSubmitted) {
        supabase.rpc('increment_entry_count', { contest_id: contestId }).then(() => {})
      }

      setMyEntries(prev => prev.map(e =>
        (e.entry_number ?? 1) === activeEntryNum ? { ...e, is_submitted: true, bracket_data: picks } : e
      ))
      setOriginalPicks(picks)
      alert(`🏆 Bracket "${bracketName}" submitted! Good luck!`)
    } catch (err: any) {
      alert('Error: ' + (err?.message ?? 'Submission failed'))
    }
    setSubmitting(false)
  }

  /* ── Resubmit (picks changed after submission — no name change, no payment) ── */
  async function handleResubmit() {
    if (totalPicks < TOTAL) {
      alert(`⚠️ Your bracket is incomplete (${totalPicks}/16 picks). Please fill out all picks before resubmitting. Your original bracket has been kept.`)
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('user_bracket_entries')
        .update({ bracket_data: picks, submitted_at: new Date().toISOString() })
        .eq('contest_id', contestId)
        .eq('user_id', userId)
        .eq('entry_number', activeEntryNum)
      if (error) throw error
      setMyEntries(prev => prev.map(e =>
        (e.entry_number ?? 1) === activeEntryNum ? { ...e, bracket_data: picks } : e
      ))
      setOriginalPicks(picks)
      alert('✅ Bracket resubmitted successfully! Your updated picks have been saved.')
    } catch (err: any) {
      alert(`Error resubmitting: ${err?.message ?? 'Unknown error'}. Your original bracket has been kept.`)
    }
    setSubmitting(false)
  }

  /* ── Add a second/third/etc entry ── */
  async function handleAddEntry() {
    if (myEntries.length >= maxPerAccount || isLocked) return
    if (entryFeeCents > 0) {
      if (walletBalance < entryFeeCents) {
        alert(`Not enough funds. Need $${(entryFeeCents / 100).toFixed(2)}, you have $${(walletBalance / 100).toFixed(2)}.`)
        return
      }
      const payRes = await fetch(leagueId ? '/api/wallet/join-contest' : '/api/wallet/bracket-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leagueId
          ? { league_id: leagueId, team_name: `${myEntries[0]?.entry_name ?? 'My Bracket'} (${myEntries.length + 1})` }
          : { contestId, buyInCents: entryFeeCents, entryNumber: myEntries.length + 1 }
        ),
      })
      if (!payRes.ok) {
        const d = await payRes.json()
        alert(d.error ?? 'Payment failed')
        return
      }
      setWalletBalance(prev => prev - entryFeeCents)
    }

    const nextNum = myEntries.length + 1
    const baseName = myEntries[0]?.entry_name ?? 'My Bracket'
    const newName = nextNum === 1 ? baseName : `${baseName} (${nextNum})`

    const { data: newEntry } = await supabase
      .from('user_bracket_entries')
      .insert({ contest_id: contestId, user_id: userId, entry_name: newName, entry_number: nextNum, is_submitted: false })
      .select()
      .single()

    if (newEntry) {
      setMyEntries(prev => [...prev, newEntry])
      setActiveEntryNum(nextNum)
      setPicks(empty())
      setOriginalPicks(null)
    }
  }

  /* ── Derived CWS teams ── */
  const cwsT = (srIdx: number) => picks.superRegionals[srIdx] ?? null
  const semi0t1 = cwsT(CWS_SEMIS[0].leftSR)
  const semi0t2 = cwsT(CWS_SEMIS[0].rightSR)
  const semi1t1 = cwsT(CWS_SEMIS[1].leftSR)
  const semi1t2 = cwsT(CWS_SEMIS[1].rightSR)
  const champT1 = picks.semifinals[0] ?? null
  const champT2 = picks.semifinals[1] ?? null

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 14, letterSpacing: 2 }}>LOADING BRACKET…</span>
    </div>
  )
  if (!contest) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.red, fontFamily: 'Oswald,sans-serif' }}>Contest not found.</span>
    </div>
  )

  const activeRegions = getRegions(dbTeams)
  const totalPicks   = countPicks(picks)
  const activeEntry  = myEntries.find(e => (e.entry_number ?? 1) === activeEntryNum) ?? null
  const hasSubmitted = activeEntry?.is_submitted ?? false
  const bracketName  = activeEntry?.entry_name ?? 'My Bracket'
  const picksChanged = hasSubmitted && originalPicks !== null && JSON.stringify(picks) !== JSON.stringify(originalPicks)

  /* ── Bracket columns (shared by desktop & mobile) ── */
  const leftRegionalsCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 10 }}>
      {!isMobile && <ColHeader line1="Regionals" line2="Double Elimination" />}
      <ConnectorPair>
        <RegionalPod regionKey="nashville"   picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
        <RegionalPod regionKey="hattiesburg" picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
      </ConnectorPair>
      <ConnectorPair>
        <RegionalPod regionKey="tallahassee" picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
        <RegionalPod regionKey="corvallis"   picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
      </ConnectorPair>
    </div>
  )

  const leftSRCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="Super Regionals" line2="Best of 3" />
      {LEFT_SR.map(sr => <SRBox key={sr.idx} sr={sr} picks={picks} onPick={pickSR} isLocked={isLocked} matchupResults={matchupResults} hasSubmitted={hasSubmitted} regions={activeRegions} />)}
    </div>
  )

  const cwsCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="College World Series" line2="Omaha, Nebraska" align="center" />

      <CWSMatchupBox
        label="CWS Semifinal 1"
        t1={semi0t1} t2={semi0t2}
        picked={picks.semifinals[0] ?? null}
        onPick={t => pickSemi(0, t)}
        isLocked={isLocked}
        resultWinner={matchupResults['semi_0']?.winner}
        hasSubmitted={hasSubmitted}
      />

      {/* Championship */}
      <div style={{ background: C.surf, border: `2px solid ${C.gold}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          padding: '8px 12px', background: 'rgba(245,166,35,.08)',
          borderBottom: '1px solid rgba(245,166,35,.3)',
          textAlign: 'center',
          fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 3, color: C.gold,
        }}>
          🏆 NATIONAL CHAMPIONSHIP
        </div>
        <div style={{ padding: '10px' }}>
          <ChampSlot team={champT1} isPicked={picks.champion?.id === champT1?.id} onPick={() => champT1 && pickChampion(champT1)} isLocked={isLocked}
            result={(hasSubmitted && matchupResults['champion']?.winner && picks.champion?.id === champT1?.id && champT1)
              ? getPickResult(champT1.id, matchupResults['champion'].winner) : undefined} />
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.muted, textAlign: 'center', padding: '6px 0' }}>VS</div>
          <ChampSlot team={champT2} isPicked={picks.champion?.id === champT2?.id} onPick={() => champT2 && pickChampion(champT2)} isLocked={isLocked}
            result={(hasSubmitted && matchupResults['champion']?.winner && picks.champion?.id === champT2?.id && champT2)
              ? getPickResult(champT2.id, matchupResults['champion'].winner) : undefined} />

          {picks.champion && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.surf3}` }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 8, textAlign: 'center' }}>
                SERIES RESULT
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['2-0', '2-1'] as const).map(s => {
                  const isSelected = picks.seriesResult === s
                  const seriesAnswer = matchupResults['series_result']?.result
                  const seriesResult: PickResult | undefined = (hasSubmitted && seriesAnswer && isSelected)
                    ? (s === seriesAnswer ? 'correct' : 'incorrect') : undefined
                  const btnBorder = isSelected
                    ? (seriesResult === 'correct' ? C.green : seriesResult === 'incorrect' ? C.red : C.gold)
                    : C.surf3
                  const btnBg = isSelected
                    ? (seriesResult === 'correct' ? 'rgba(21,198,120,.15)' : seriesResult === 'incorrect' ? 'rgba(240,58,90,.15)' : 'rgba(245,166,35,.15)')
                    : C.surf2
                  const btnColor = isSelected
                    ? (seriesResult === 'correct' ? C.green : seriesResult === 'incorrect' ? C.red : C.gold)
                    : C.muted
                  return (
                  <button key={s}
                    onClick={isLocked ? undefined : () => setPicks(p => ({ ...p, seriesResult: s }))}
                    style={{
                      flex: 1, padding: '7px 0',
                      border: `1px solid ${btnBorder}`,
                      background: btnBg,
                      borderRadius: 6, cursor: isLocked ? 'default' : 'pointer',
                      fontFamily: 'Anton,sans-serif', fontSize: 13,
                      color: btnColor,
                      transition: 'all .15s',
                    }}>{s}{seriesResult === 'correct' ? ' ✓' : seriesResult === 'incorrect' ? ' ✗' : ''}</button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <CWSMatchupBox
        label="CWS Semifinal 2"
        t1={semi1t1} t2={semi1t2}
        picked={picks.semifinals[1] ?? null}
        onPick={t => pickSemi(1, t)}
        isLocked={isLocked}
        resultWinner={matchupResults['semi_1']?.winner}
        hasSubmitted={hasSubmitted}
      />

      {/* How to Play */}
      <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.gold, letterSpacing: 1, marginBottom: 8 }}>
          HOW TO PLAY
        </div>
        <ol style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, lineHeight: 2.1, paddingLeft: 14, margin: 0 }}>
          <li>Pick 1 team to win each Regional (8 total)</li>
          <li>Pick 1 team to win each Super Regional (4 total)</li>
          <li>Pick 1 team to win each CWS Semifinal (2 total)</li>
          <li>Pick the National Champion + series result</li>
        </ol>
        <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '14px 16px', marginTop: 12 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 10 }}>
            📊 Scoring
          </div>
          {([
            ['Regional Winner',        '3 pts each'],
            ['Super Regional Winner',  '5 pts each'],
            ['CWS Semifinal Winner',   '10 pts each'],
            ['National Champion',      '15 pts'],
            ['Correct Series Result',  '+5 bonus pts'],
          ] as [string, string][]).map(([label, pts]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, marginBottom: 6 }}>
              <span>{label}</span>
              <span style={{ color: C.gold, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>{pts}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.surf3}`, marginTop: 8, paddingTop: 8, fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>
            Max score: {(8 * 3) + (4 * 5) + (2 * 10) + 15 + 5} pts
            <span style={{ marginLeft: 4 }}>(8 reg + 4 super + 2 semis + champion + series)</span>
          </div>
        </div>
      </div>
    </div>
  )

  const rightSRCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="Super Regionals" line2="Best of 3" align="right" />
      {RIGHT_SR.map(sr => <SRBox key={sr.idx} sr={sr} picks={picks} onPick={pickSR} isLocked={isLocked} matchupResults={matchupResults} hasSubmitted={hasSubmitted} regions={activeRegions} />)}
    </div>
  )

  const rightRegionalsCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 10 }}>
      {!isMobile && <ColHeader line1="Regionals" line2="Double Elimination" align="right" />}
      <ConnectorPairRight>
        <RegionalPod regionKey="austin"      picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
        <RegionalPod regionKey="los_angeles" picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
      </ConnectorPairRight>
      <ConnectorPairRight>
        <RegionalPod regionKey="oxford"  picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
        <RegionalPod regionKey="athens"  picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" matchupResults={matchupResults} hasSubmitted={hasSubmitted} isMobile={isMobile} regions={activeRegions} />
      </ConnectorPairRight>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column' as const, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>

      {/* ── Sticky header ── */}
      {isMobile ? (
        <div style={{ position: 'sticky', top: 0, zIndex: 100, background: C.surf, borderBottom: `1px solid ${C.surf3}` }}>
          {/* Row 1: contest name + entries */}
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.text, letterSpacing: 1, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
              {contest.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub }}>
                {myEntries.length}/{maxPerAccount}
              </span>
              {!isLocked && myEntries.length < maxPerAccount && hasPaid && (
                <button onClick={() => setShowAddEntryModal(true)}
                  style={{ padding: '4px 10px', background: 'none', border: `1px solid ${C.gold}`, borderRadius: 5, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.gold }}>
                  + Entry
                </button>
              )}
            </div>
          </div>
          {/* Row 2: submit / status */}
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'center' }}>
            {isLocked ? (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.red, letterSpacing: 1 }}>🔒 Bracket Locked</div>
            ) : hasSubmitted && !picksChanged ? (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green, letterSpacing: 1 }}>✓ Bracket Submitted</div>
            ) : hasSubmitted && picksChanged ? (
              <button onClick={handleResubmit} disabled={submitting}
                style={{ padding: '6px 20px', background: submitting ? C.surf3 : C.gold, border: 'none', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 2, color: submitting ? C.muted : C.bg, textTransform: 'uppercase' as const }}>
                {submitting ? 'Saving...' : 'Resubmit'}
              </button>
            ) : (
              <button onClick={() => totalPicks >= TOTAL ? handleSubmitDirect() : undefined}
                disabled={totalPicks < TOTAL || submitting}
                style={{ padding: '6px 20px', background: totalPicks >= TOTAL && !submitting ? C.gold : C.surf3, border: 'none', borderRadius: 6, cursor: totalPicks >= TOTAL && !submitting ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 2, color: totalPicks >= TOTAL && !submitting ? C.bg : C.muted, textTransform: 'uppercase' as const }}>
                {submitting ? 'Submitting...' : totalPicks >= TOTAL ? 'Submit' : `${TOTAL - totalPicks}/16 picks`}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: C.surf, borderBottom: `1px solid ${C.surf3}`,
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>
            {contest.name}
          </div>
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            {isLocked ? (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red, letterSpacing: 1 }}>🔒 Bracket Locked</div>
            ) : hasSubmitted && !picksChanged ? (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.green, letterSpacing: 1 }}>✓ Bracket Submitted</div>
            ) : hasSubmitted && picksChanged ? (
              <button onClick={handleResubmit} disabled={submitting}
                style={{ padding: '8px 24px', background: submitting ? C.surf3 : C.gold, border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: submitting ? C.muted : C.bg, textTransform: 'uppercase' as const }}>
                {submitting ? 'Resubmitting...' : 'Resubmit Bracket'}
              </button>
            ) : (
              <button onClick={() => totalPicks >= TOTAL ? handleSubmitDirect() : undefined}
                disabled={totalPicks < TOTAL || submitting}
                style={{ padding: '8px 24px', background: totalPicks >= TOTAL && !submitting ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: totalPicks >= TOTAL && !submitting ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: totalPicks >= TOTAL && !submitting ? C.bg : C.muted, textTransform: 'uppercase' as const }}>
                {submitting ? 'Submitting...' : totalPicks >= TOTAL ? 'Submit Bracket' : `${TOTAL - totalPicks} picks left`}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
              {myEntries.length}/{maxPerAccount} {maxPerAccount === 1 ? 'entry' : 'entries'}
            </div>
            {!isLocked && myEntries.length < maxPerAccount && hasPaid && (
              <button onClick={() => setShowAddEntryModal(true)}
                style={{ padding: '6px 14px', background: 'none', border: `1px solid ${C.gold}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.gold }}>
                + Entry
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      {myEntries.length > 1 ? (
        /* Multi-entry: entry tabs + leaderboard + chat in one bar */
        <div style={{ background: C.surf, borderBottom: `1px solid ${C.surf3}`, display: 'flex', overflowX: 'auto' }}>
          {myEntries.map(entry => {
            const num = entry.entry_number ?? 1
            const active = activeEntryNum === num && tab === 'bracket'
            return (
              <button key={num}
                onClick={() => { setActiveEntryNum(num); setTab('bracket') }}
                style={{
                  padding: '9px 16px', flexShrink: 0,
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${active ? C.gold : 'transparent'}`,
                  cursor: 'pointer',
                  fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
                  color: active ? C.gold : C.muted,
                  textTransform: 'uppercase' as const,
                }}>
                {entry.entry_name}
                {entry.is_submitted && <span style={{ color: C.green, marginLeft: 4 }}>✓</span>}
              </button>
            )
          })}
          <button onClick={() => setTab('leaderboard')}
            style={{ padding: '9px 16px', flexShrink: 0, background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'leaderboard' ? C.gold : 'transparent'}`, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: tab === 'leaderboard' ? C.gold : C.muted }}>
            🏅 Leaderboard
          </button>
          <button onClick={() => setTab('chat')}
            style={{ padding: '9px 16px', flexShrink: 0, background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'chat' ? C.gold : 'transparent'}`, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: tab === 'chat' ? C.gold : C.muted }}>
            💬 Chat
          </button>
          {isEmbed && isCommissioner && inviteCode && (
            <button onClick={() => setTab('invite')}
              style={{ padding: '9px 16px', flexShrink: 0, background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'invite' ? C.gold : 'transparent'}`, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: tab === 'invite' ? C.gold : C.muted, textTransform: 'uppercase' as const }}>
              🔑 Invite
            </button>
          )}
        </div>
      ) : (
        /* Single entry: original bracket/leaderboard/chat tabs */
        <div style={{ background: C.surf, borderBottom: `1px solid ${C.surf3}`, padding: '6px 20px', display: 'flex', gap: 6 }}>
          {(['bracket', 'leaderboard', 'chat'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 18px',
              background: tab === t ? C.gold : 'transparent',
              color: tab === t ? C.bg : C.sub,
              border: 'none', borderRadius: 5,
              fontFamily: 'Oswald,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: 1.5,
              cursor: 'pointer', textTransform: 'uppercase', transition: 'all .15s',
            }}>{t}</button>
          ))}
          {isEmbed && isCommissioner && inviteCode && (
            <button onClick={() => setTab('invite')} style={{
              padding: '7px 18px',
              background: tab === 'invite' ? C.gold : 'transparent',
              color: tab === 'invite' ? C.bg : C.sub,
              border: 'none', borderRadius: 5,
              fontFamily: 'Oswald,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: 1.5,
              cursor: 'pointer', textTransform: 'uppercase', transition: 'all .15s',
            }}>🔑 Invite</button>
          )}
        </div>
      )}

      {/* ── Leaderboard ── */}
      {tab === 'leaderboard' && (
        <LeaderboardTab
          contestId={contestId}
          userId={userId}
          contest={contest}
          isLocked={isLocked}
          matchupResults={matchupResults}
        />
      )}

      {/* ── Chat ── */}
      {tab === 'chat' && (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 20px 0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)' }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
            Bracket Chat
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8 }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
                No messages yet. Start the conversation!
              </div>
            )}
            {chatMessages.map((m: any, i: number) => {
              const isMe = m.user_id === userId
              const showName = !isMe && (i === 0 || chatMessages[i - 1]?.user_id !== m.user_id)
              return (
                <div key={m.id || i} style={{
                  display: 'flex',
                  flexDirection: 'column' as const,
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  marginBottom: 2,
                }}>
                  {showName && (
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 3, marginLeft: 12 }}>
                      {m.display_name || 'Player'}
                    </div>
                  )}
                  <div style={{
                    maxWidth: '75%',
                    padding: '9px 13px',
                    borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isMe ? C.gold : C.surf2,
                    border: isMe ? 'none' : `1px solid ${C.surf3}`,
                    fontFamily: 'Inter,sans-serif',
                    fontSize: 14,
                    color: isMe ? C.bg : C.text,
                    lineHeight: 1.4,
                    wordBreak: 'break-word' as const,
                    animation: 'msgPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}>
                    {m.message}
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
          <div style={{ borderTop: `1px solid ${C.surf3}`, paddingTop: 10, paddingBottom: 16, display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Message... 😊"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBracketChat() } }}
              inputMode="text"
              autoComplete="off"
              autoCorrect="on"
              style={{ flex: 1, padding: '9px 11px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Inter,sans-serif', fontSize: '16px', outline: 'none' }}
            />
            <button
              onClick={sendBracketChat}
              disabled={!chatInput.trim()}
              style={{ padding: '9px 13px', background: chatInput.trim() ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: chatInput.trim() ? 'pointer' : 'default', fontFamily: 'Anton,sans-serif', fontSize: 14, color: chatInput.trim() ? C.bg : C.muted }}
            >↑</button>
          </div>
        </div>
      )}

      {/* ── Invite ── */}
      {tab === 'invite' && (
        <div style={{ padding: '32px 24px', maxWidth: 500 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
            🔑 Invite Code
          </div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginBottom: 24 }}>
            Share this code or link so others can join your private bracket league.
          </div>
          <div style={{ background: C.surf, border: `2px solid ${C.gold}`, borderRadius: 12, padding: '24px', textAlign: 'center' as const, marginBottom: 20 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
              Invite Code
            </div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 48, letterSpacing: 12, color: C.gold, marginBottom: 8 }}>
              {inviteCode}
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
              Others enter this at collegeunitsfantasy.com/join
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteCode!); alert('Code copied!') }}
              style={{ width: '100%', padding: '12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 2, color: C.sub, textTransform: 'uppercase' as const }}>
              📋 Copy Code
            </button>
            <button
              onClick={() => { const url = `${window.location.origin}/join/${inviteCode}`; navigator.clipboard.writeText(url); alert('Link copied!') }}
              style={{ width: '100%', padding: '12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 2, color: C.sub, textTransform: 'uppercase' as const }}>
              🔗 Copy Invite Link
            </button>
            <button
              onClick={() => {
                const url = `${window.location.origin}/join/${inviteCode}`
                if (navigator.share) {
                  navigator.share({ title: 'Join my bracket!', text: `Use code ${inviteCode} to join my bracket on College Units Fantasy!`, url })
                } else {
                  navigator.clipboard.writeText(url); alert('Link copied!')
                }
              }}
              style={{ width: '100%', padding: '12px', background: 'rgba(245,166,35,.1)', border: `1px solid ${C.gold}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.gold, textTransform: 'uppercase' as const }}>
              📤 Share Invite
            </button>
          </div>
          <div style={{ marginTop: 16, padding: '10px 14px', background: C.surf2, borderRadius: 8, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, wordBreak: 'break-all' as const }}>
            {typeof window !== 'undefined' ? `${window.location.origin}/join/${inviteCode}` : ''}
          </div>
        </div>
      )}

      {/* ── Bracket — Desktop ── */}
      {tab === 'bracket' && (
        <>
          {/* Desktop (≥ 900px): 5-column grid, horizontally scrollable */}
          <div className="bracket-desktop" style={{ overflowX: 'auto', padding: '16px 16px 120px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 200px 260px 200px 1fr',
              gap: 12,
              minWidth: 1050,
              alignItems: 'start',
            }}>
              {leftRegionalsCol}
              {leftSRCol}
              {cwsCol}
              {rightSRCol}
              {rightRegionalsCol}
            </div>
          </div>

          {/* Mobile (< 900px): tabbed sections */}
          <div className="bracket-mobile" style={{ display: 'none' }}>
            {/* Mobile section tabs */}
            <div className="bracket-section-tabs" style={{
              display: 'flex', overflowX: 'auto',
              background: C.surf, borderBottom: `1px solid ${C.surf3}`,
              scrollbarWidth: 'none' as any, msOverflowStyle: 'none' as any,
            }}>
              {([
                ['left',        'L. Regionals'],
                ['super-left',  'Super Reg L'],
                ['cws',         'CWS'],
                ['super-right', 'Super Reg R'],
                ['right',       'R. Regionals'],
              ] as [MSection, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setMSection(k)} style={{
                  padding: '10px 16px', flexShrink: 0, whiteSpace: 'nowrap',
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${mSection === k ? C.gold : 'transparent'}`,
                  fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1,
                  color: mSection === k ? C.gold : C.sub,
                  cursor: 'pointer', textTransform: 'uppercase',
                }}>{label}</button>
              ))}
            </div>
            <div
              onTouchStart={handleBracketTouchStart}
              onTouchEnd={handleBracketTouchEnd}
              style={{ padding: '0 12px 120px' }}
            >
              <div style={{ padding: '12px 4px 4px', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.muted, textTransform: 'uppercase' }}>
                {mSection.replace(/-/g, ' ')}
              </div>
              {mSection === 'left'        && leftRegionalsCol}
              {mSection === 'super-left'  && leftSRCol}
              {mSection === 'cws'         && cwsCol}
              {mSection === 'super-right' && rightSRCol}
              {mSection === 'right'       && rightRegionalsCol}
            </div>
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 900px) {
          .bracket-desktop { display: none !important; }
          .bracket-mobile  { display: block !important; }
        }
        .bracket-section-tabs::-webkit-scrollbar { display: none; }
        @keyframes msgPop {
          from { transform: scale(0.85); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>

      {/* ── Add Entry confirmation modal ── */}
      {showAddEntryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#0c1422', border: '1px solid #1e2d47', borderRadius: 14, padding: 28, maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🏆</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: '#e4edf7', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>
              Add Another Entry?
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: '#7a90aa', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              You will be charged another entry fee of{' '}
              <strong style={{ color: '#f5a623' }}>${(entryFeeCents/100).toFixed(2)}</strong>{' '}
              to submit a second bracket.
              <br/>
              Your wallet balance: <strong style={{ color: walletBalance >= entryFeeCents ? '#15c678' : '#f03a5a' }}>${(walletBalance/100).toFixed(2)}</strong>
            </div>
            {walletBalance < entryFeeCents && (
              <div style={{ padding: '8px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#f03a5a', marginBottom: 12, textAlign: 'center' }}>
                ⚠️ Not enough funds
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddEntryModal(false)}
                style={{ flex: 1, padding: '12px', background: 'none', border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa' }}>
                Cancel
              </button>
              <button
                onClick={() => { setShowAddEntryModal(false); handleAddEntry() }}
                disabled={walletBalance < entryFeeCents}
                style={{ flex: 2, padding: '12px', background: walletBalance >= entryFeeCents ? '#f5a623' : '#1e2d47', border: 'none', borderRadius: 8, cursor: walletBalance >= entryFeeCents ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: walletBalance >= entryFeeCents ? '#070a12' : '#3e5470', textTransform: 'uppercase' as const }}>
                Pay ${(entryFeeCents/100).toFixed(2)} & Add Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet modal ── */}
      {showWalletModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowWalletModal(false)}
        >
          <div
            style={{ background: '#0c1422', border: '1px solid #1e2d47', borderRadius: 14, padding: 28, maxWidth: 380, width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: '#f5a623', letterSpacing: 1, marginBottom: 16 }}>💰 Your Wallet</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: '#f5a623', marginBottom: 8 }}>
              ${((walletBalance ?? 0) / 100).toFixed(2)}
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa', marginBottom: 20 }}>Available balance</div>
            <button
              onClick={() => { setShowWalletModal(false); window.open('/wallet', '_blank') }}
              style={{ width: '100%', padding: '12px', background: '#f5a623', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: '#070a12' }}
            >
              Add Funds (opens in new tab)
            </button>
            <button
              onClick={() => setShowWalletModal(false)}
              style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa', marginTop: 8 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
