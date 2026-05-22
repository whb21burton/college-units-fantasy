// ESPN College Baseball API Service
// Fetches NCAA tournament data and parses it for bracket sync

export type ESPNGameStatus =
  | 'scheduled' | 'in_progress' | 'final'
  | 'delayed' | 'rain_delay' | 'suspended' | 'cancelled'

export type RoundType =
  | 'regional' | 'super_regional'
  | 'cws_bracket_1' | 'cws_bracket_2'
  | 'national_championship'

export interface ESPNTeam {
  espnId:       string
  name:         string
  displayName:  string
  abbreviation: string
  logo:         string
  color:        string
  score:        number
  winner:       boolean
  seed?:        number
  record?:      string
}

export interface ESPNGame {
  espnGameId:     string
  name:           string
  shortName:      string
  homeTeam:       ESPNTeam
  awayTeam:       ESPNTeam
  status:         ESPNGameStatus
  inningDetail:   string
  scheduledStart: string
  completedAt:    string | null
  winner:         ESPNTeam | null
  tournamentNote: string
  venue:          string
  wasSuspended:   boolean
  isTournamentGame: boolean
  roundType:      RoundType | null
  regionalName:   string | null
}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball'

// Cache: 60s for live games, 5min for completed
const cache = new Map<string, { data: any; ts: number; ttl: number }>()

async function fetchWithCache(url: string, ttlMs: number): Promise<any> {
  const cached = cache.get(url)
  if (cached && Date.now() - cached.ts < cached.ttl) return cached.data
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`ESPN API error: ${res.status} ${url}`)
  const data = await res.json()
  cache.set(url, { data, ts: Date.now(), ttl: ttlMs })
  return data
}

function mapStatus(espnStatusName: string): ESPNGameStatus {
  const map: Record<string, ESPNGameStatus> = {
    STATUS_SCHEDULED:  'scheduled',
    STATUS_IN_PROGRESS:'in_progress',
    STATUS_FINAL:      'final',
    STATUS_DELAYED:    'delayed',
    STATUS_RAIN_DELAY: 'rain_delay',
    STATUS_SUSPENDED:  'suspended',
    STATUS_CANCELLED:  'cancelled',
  }
  return map[espnStatusName] ?? 'scheduled'
}

function parseRoundType(note: string): { roundType: RoundType | null; regionalName: string | null } {
  const n = (note ?? '').toLowerCase()
  if (n.includes('college world series') || n.includes('cws')) {
    if (n.includes('championship')) return { roundType: 'national_championship', regionalName: null }
    if (n.includes('bracket 2') || n.includes('losers')) return { roundType: 'cws_bracket_2', regionalName: null }
    return { roundType: 'cws_bracket_1', regionalName: null }
  }
  if (n.includes('super regional')) {
    const match = note.match(/^(\w[\w\s]+?)\s+Super Regional/i)
    return { roundType: 'super_regional', regionalName: match?.[1]?.trim() ?? null }
  }
  if (n.includes('regional')) {
    const match = note.match(/^(\w[\w\s]+?)\s+Regional/i)
    return { roundType: 'regional', regionalName: match?.[1]?.trim() ?? null }
  }
  return { roundType: null, regionalName: null }
}

function parseCompetitor(c: any): ESPNTeam {
  return {
    espnId:       c.team.id,
    name:         c.team.name,
    displayName:  c.team.displayName,
    abbreviation: c.team.abbreviation,
    logo:         c.team.logo ?? '',
    color:        c.team.color ?? '000000',
    score:        parseInt(c.score ?? '0', 10) || 0,
    winner:       c.winner === true,
    seed:         c.curatedRank?.current,
    record:       c.records?.[0]?.summary,
  }
}

function parseEvent(event: any): ESPNGame {
  const comp = event.competitions?.[0]
  if (!comp) throw new Error('No competition data')

  const competitors: any[] = comp.competitors ?? []
  const home = competitors.find((c: any) => c.homeAway === 'home')
  const away = competitors.find((c: any) => c.homeAway === 'away')

  const statusName  = comp.status?.type?.name ?? 'STATUS_SCHEDULED'
  const status      = mapStatus(statusName)
  const isCompleted = comp.status?.type?.completed === true

  const homeTeam = parseCompetitor(home)
  const awayTeam = parseCompetitor(away)

  const winner = isCompleted
    ? (homeTeam.winner ? homeTeam : awayTeam.winner ? awayTeam : null)
    : null

  const note = comp.notes?.[0]?.headline ?? ''
  const { roundType, regionalName } = parseRoundType(note)

  const isTournamentGame =
    roundType !== null ||
    note.toLowerCase().includes('regional') ||
    note.toLowerCase().includes('cws') ||
    note.toLowerCase().includes('college world series')

  return {
    espnGameId:      event.id,
    name:            event.name,
    shortName:       event.shortName,
    homeTeam,
    awayTeam,
    status,
    inningDetail:    comp.status?.type?.detail ?? '',
    scheduledStart:  event.date,
    completedAt:     isCompleted ? (comp.endDate ?? event.date) : null,
    winner,
    tournamentNote:  note,
    venue:           comp.venue?.fullName ?? '',
    wasSuspended:    comp.wasSuspended === true,
    isTournamentGame,
    roundType,
    regionalName,
  }
}

export async function fetchScoreboard(dateStr?: string): Promise<ESPNGame[]> {
  const isLive = !dateStr
  const ttl    = isLive ? 60_000 : 300_000
  const url    = dateStr
    ? `${ESPN_BASE}/scoreboard?dates=${dateStr}&limit=100`
    : `${ESPN_BASE}/scoreboard?limit=100`

  const data   = await fetchWithCache(url, ttl)
  const events: any[] = data.events ?? []

  return events
    .map((e: any) => { try { return parseEvent(e) } catch { return null } })
    .filter(Boolean) as ESPNGame[]
}

export async function fetchTournamentGames(dateStr?: string): Promise<ESPNGame[]> {
  const all = await fetchScoreboard(dateStr)
  return all.filter(g => g.isTournamentGame)
}

export async function fetchTournamentRange(startDate: string, endDate: string): Promise<ESPNGame[]> {
  const start = new Date(startDate)
  const end   = new Date(endDate)
  const dates: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0].replace(/-/g, ''))
  }

  const results = await Promise.allSettled(dates.map(d => fetchTournamentGames(d)))
  const games: ESPNGame[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') games.push(...r.value)
  }

  const seen = new Set<string>()
  return games.filter(g => {
    if (seen.has(g.espnGameId)) return false
    seen.add(g.espnGameId)
    return true
  })
}

export async function fetchGame(gameId: string): Promise<ESPNGame | null> {
  try {
    const url  = `${ESPN_BASE}/summary?event=${gameId}`
    const data = await fetchWithCache(url, 60_000)
    const header = data.header
    if (!header) return null
    const comp = header.competitions?.[0]
    if (!comp) return null
    return parseEvent({ ...header, competitions: [comp] })
  } catch {
    return null
  }
}

export function clearCache() {
  cache.clear()
}
