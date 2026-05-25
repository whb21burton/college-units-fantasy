// data/cws2026.ts
import type { Team } from '@/lib/bracketTypes'

export interface Regional {
  key: string
  display: string
  teams: Team[]
}

export const REGIONS_2026: Record<string, Regional> = {
  // LEFT SIDE
  ucla:         { key: 'ucla',         display: 'Los Angeles',   teams: [{ id: 'ucla',   name: 'UCLA',              seed: 1, record: '51-6'   }, { id: 'vt',     name: 'Virginia Tech',     seed: 2, record: '30-24' }, { id: 'cp',     name: 'Cal Poly',          seed: 3, record: '36-22' }, { id: 'smc',    name: 'Saint Mary\'s',     seed: 4, record: '34-25' }] },
  west_virginia:{ key: 'west_virginia', display: 'Morgantown',    teams: [{ id: 'wvu',   name: 'West Virginia',     seed: 1, record: '39-14' }, { id: 'wake',   name: 'Wake Forest',       seed: 2, record: '38-19' }, { id: 'uk',     name: 'Kentucky',          seed: 3, record: '31-21' }, { id: 'bing',   name: 'Binghamton',        seed: 4, record: '31-20' }] },
  southern_miss:{ key: 'southern_miss', display: 'Hattiesburg',   teams: [{ id: 'usm',   name: 'Southern Miss.',    seed: 1, record: '44-15' }, { id: 'uva',    name: 'Virginia',          seed: 2, record: '36-21' }, { id: 'jsu',    name: 'Jacksonville St.',  seed: 3, record: '46-13' }, { id: 'ualr',   name: 'Little Rock',       seed: 4, record: '36-26' }] },
  florida:      { key: 'florida',       display: 'Gainesville',   teams: [{ id: 'uf',    name: 'Florida',           seed: 1, record: '39-19' }, { id: 'miami',  name: 'Miami (FL)',        seed: 2, record: '38-18' }, { id: 'troy',   name: 'Troy',              seed: 3, record: '32-29' }, { id: 'rider',  name: 'Rider',             seed: 4, record: '33-18' }] },
  north_carolina:{ key: 'north_carolina', display: 'Chapel Hill',   teams: [{ id: 'unc', name: 'North Carolina',   seed: 1, record: '45-11-1' }, { id: 'tenn',  name: 'Tennessee',         seed: 2, record: '38-20' }, { id: 'ecu',    name: 'East Carolina',     seed: 3, record: '36-22-1' }, { id: 'vcu',   name: 'VCU',               seed: 4, record: '37-23' }] },
  texas_am:     { key: 'texas_am',      display: 'College Station', teams: [{ id: 'tamu',  name: 'Texas A&M',        seed: 1, record: '39-14' }, { id: 'usc',    name: 'Southern California', seed: 2, record: '43-15' }, { id: 'txst',  name: 'Texas St.',         seed: 3, record: '36-24' }, { id: 'lamar', name: 'Lamar University',  seed: 4, record: '34-25' }] },
  nebraska:     { key: 'nebraska',      display: 'Lincoln',       teams: [{ id: 'neb',   name: 'Nebraska',          seed: 1, record: '42-15' }, { id: 'miss',   name: 'Ole Miss',          seed: 2, record: '36-21' }, { id: 'asu',    name: 'Arizona St.',       seed: 3, record: '37-19' }, { id: 'sdsu',   name: 'South Dakota St.', seed: 4, record: '24-31' }] },
  auburn:       { key: 'auburn',        display: 'Auburn',        teams: [{ id: 'au',    name: 'Auburn',            seed: 1, record: '38-19' }, { id: 'ucf',    name: 'UCF',               seed: 2, record: '31-21' }, { id: 'ncst',   name: 'NC State',          seed: 3, record: '32-22' }, { id: 'mil',    name: 'Milwaukee',         seed: 4, record: '25-31' }] },
  // RIGHT SIDE
  georgia_tech: { key: 'georgia_tech',  display: 'Atlanta',       teams: [{ id: 'gt',    name: 'Georgia Tech',      seed: 1, record: '48-9'  }, { id: 'ou',     name: 'Oklahoma',          seed: 2, record: '32-21' }, { id: 'cit',    name: 'The Citadel',       seed: 3, record: '35-24' }, { id: 'uic',    name: 'UIC',               seed: 4, record: '27-27-1' }] },
  kansas:       { key: 'kansas',        display: 'Lawrence',      teams: [{ id: 'ku',    name: 'Kansas',            seed: 1, record: '42-16' }, { id: 'ark',    name: 'Arkansas',          seed: 2, record: '39-20' }, { id: 'most',   name: 'Missouri St.',      seed: 3, record: '34-19' }, { id: 'neu',    name: 'Northeastern',      seed: 4, record: '36-20' }] },
  florida_state:{ key: 'florida_state', display: 'Tallahassee',   teams: [{ id: 'fsu',   name: 'Florida St.',       seed: 1, record: '38-17' }, { id: 'ccu',    name: 'Coastal Carolina',  seed: 2, record: '37-21' }, { id: 'niu',    name: 'NIU',               seed: 3, record: '35-17' }, { id: 'stjn',  name: 'St. John\'s',       seed: 4, record: '33-24' }] },
  alabama:      { key: 'alabama',       display: 'Tuscaloosa',    teams: [{ id: 'bama',  name: 'Alabama',           seed: 1, record: '37-19' }, { id: 'okst',   name: 'Oklahoma St.',      seed: 2, record: '37-20' }, { id: 'uscu',   name: 'USC Upstate',       seed: 3, record: '33-28' }, { id: 'alst',  name: 'Alabama St.',       seed: 4, record: '34-21' }] },
  texas:        { key: 'texas',         display: 'Austin',        teams: [{ id: 'tex',   name: 'Texas',             seed: 1, record: '40-13' }, { id: 'ucsb',   name: 'UC Santa Barbara',  seed: 2, record: '38-18' }, { id: 'trl',    name: 'Tarleton St.',      seed: 3, record: '37-19' }, { id: 'hc',     name: 'Holy Cross',        seed: 4, record: '25-28' }] },
  oregon:       { key: 'oregon',        display: 'Eugene',        teams: [{ id: 'ore',   name: 'Oregon',            seed: 1, record: '40-16' }, { id: 'orst',   name: 'Oregon St.',        seed: 2, record: '43-12' }, { id: 'wsu',    name: 'Washington St.',    seed: 3, record: '30-26' }, { id: 'yale',   name: 'Yale',              seed: 4, record: '30-13-1' }] },
  mississippi_st:{ key: 'mississippi_st', display: 'Starkville',    teams: [{ id: 'msu', name: 'Mississippi St.',  seed: 1, record: '40-17' }, { id: 'cin',   name: 'Cincinnati',        seed: 2, record: '37-20' }, { id: 'ull',    name: 'Louisiana',         seed: 3, record: '39-23' }, { id: 'lip',    name: 'Lipscomb',          seed: 4, record: '29-24' }] },
  georgia:      { key: 'georgia',       display: 'Athens',        teams: [{ id: 'uga',   name: 'Georgia',           seed: 1, record: '46-12' }, { id: 'bc',     name: 'Boston College',    seed: 2, record: '36-21' }, { id: 'lib',    name: 'Liberty',           seed: 3, record: '41-19' }, { id: 'liu',    name: 'LIU',               seed: 4, record: '30-20' }] },
}

// Super Regional pairings (left side)
export const LEFT_SR_2026 = [
  { idx: 0, label: 'Super Regional 1', top: 'ucla',          bot: 'west_virginia' },
  { idx: 1, label: 'Super Regional 2', top: 'southern_miss', bot: 'florida' },
  { idx: 2, label: 'Super Regional 3', top: 'north_carolina', bot: 'texas_am' },
  { idx: 3, label: 'Super Regional 4', top: 'nebraska',      bot: 'auburn' },
]

// Super Regional pairings (right side)
export const RIGHT_SR_2026 = [
  { idx: 4, label: 'Super Regional 5', top: 'georgia_tech',  bot: 'kansas' },
  { idx: 5, label: 'Super Regional 6', top: 'florida_state', bot: 'alabama' },
  { idx: 6, label: 'Super Regional 7', top: 'texas',         bot: 'oregon' },
  { idx: 7, label: 'Super Regional 8', top: 'mississippi_st', bot: 'georgia' },
]

// CWS Semi pairings
export const CWS_SEMIS_2026 = [
  { semiIdx: 0, leftSR: 0, rightSR: 4 },
  { semiIdx: 1, leftSR: 1, rightSR: 5 },
  { semiIdx: 2, leftSR: 2, rightSR: 6 },
  { semiIdx: 3, leftSR: 3, rightSR: 7 },
]
