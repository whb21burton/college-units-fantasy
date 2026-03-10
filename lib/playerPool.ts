export type UnitType = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'K';
export type Tier = 'Elite' | 'Solid' | 'Depth';
export type Conference = 'SEC' | 'Big Ten' | 'Big 12' | 'ACC' | 'FBS Independents';

export interface DraftUnit {
  id: string;
  school: string;
  conference: Conference;
  unitType: UnitType;
  playerName?: string; // QB and K only
  tier: Tier;
  adp: number;         // average draft position (lower = better)
  projectedPoints: number;
}

// ── Roster slots & caps ──────────────────────────────────────
export const ROSTER_SLOTS = {
  starters: ['QB1', 'RB1', 'RB2', 'WR1', 'WR2', 'TE1', 'FLEX', 'DEF', 'K'],
  bench: ['QB_BENCH', 'BENCH1', 'BENCH2', 'BENCH3', 'BENCH4', 'BENCH5'],
};

export const POSITION_CAPS: Record<UnitType, number> = {
  QB: 3,
  RB: 4,
  WR: 4,
  TE: 2,
  DEF: 3,
  K: 3,
};

// ── Conferences ──────────────────────────────────────────────
export const CONFERENCES: Record<Conference, string[]> = {
  SEC: [
    'Alabama', 'Georgia', 'Texas', 'LSU', 'Tennessee', 'Ole Miss',
    'Mississippi State', 'Auburn', 'Arkansas', 'Missouri', 'Kentucky',
    'Vanderbilt', 'Florida', 'South Carolina', 'Texas A&M', 'Oklahoma',
  ],
  'Big Ten': [
    'Ohio State', 'Michigan', 'Penn State', 'Oregon', 'USC', 'UCLA',
    'Washington', 'Michigan State', 'Wisconsin', 'Iowa', 'Minnesota',
    'Indiana', 'Rutgers', 'Maryland', 'Nebraska', 'Illinois', 'Purdue', 'Northwestern',
  ],
  'Big 12': [
    'Arizona State', 'Iowa State', 'BYU', 'UCF', 'Cincinnati', 'Colorado',
    'Houston', 'Kansas', 'Kansas State', 'Oklahoma State', 'TCU',
    'Texas Tech', 'Utah', 'West Virginia', 'Baylor', 'Arizona',
  ],
  ACC: [
    'Clemson', 'Florida State', 'Miami', 'NC State', 'North Carolina', 'Duke',
    'Wake Forest', 'Louisville', 'Virginia Tech', 'Pittsburgh', 'Syracuse',
    'Boston College', 'Georgia Tech', 'Virginia', 'Cal', 'Stanford', 'SMU',
  ],
  'FBS Independents': [
    'Notre Dame', 'Army', 'Navy', 'Liberty', 'New Mexico State', 'Connecticut',
  ],
};

// ── Helper to build id ───────────────────────────────────────
function uid(school: string, unitType: UnitType, player?: string) {
  const base = `${school}-${unitType}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return player ? `${base}-${player.toLowerCase().replace(/\s+/g, '-')}` : base;
}

// ── Full Pool ────────────────────────────────────────────────
// ADP scale: 1 = first pick, higher = later round
// projectedPoints = estimated full-season fantasy points

export const FULL_POOL: DraftUnit[] = [

  // ═══════════════════════════════════════════════════════════
  // SEC
  // ═══════════════════════════════════════════════════════════

  // Alabama
  { id: uid('Alabama','QB','Ty Simpson'),      school:'Alabama', conference:'SEC', unitType:'QB', playerName:'Ty Simpson',      tier:'Elite', adp:3,   projectedPoints:320 },
  { id: uid('Alabama','QB','Eli Holstein'),    school:'Alabama', conference:'SEC', unitType:'QB', playerName:'Eli Holstein',    tier:'Solid', adp:28,  projectedPoints:210 },
  { id: uid('Alabama','QB','Backup QB'),       school:'Alabama', conference:'SEC', unitType:'QB', playerName:'Backup QB',       tier:'Depth', adp:95,  projectedPoints:80  },
  { id: uid('Alabama','RB'),                   school:'Alabama', conference:'SEC', unitType:'RB', tier:'Elite', adp:4,   projectedPoints:380 },
  { id: uid('Alabama','WR'),                   school:'Alabama', conference:'SEC', unitType:'WR', tier:'Elite', adp:5,   projectedPoints:360 },
  { id: uid('Alabama','TE'),                   school:'Alabama', conference:'SEC', unitType:'TE', tier:'Solid', adp:22,  projectedPoints:190 },
  { id: uid('Alabama','DEF'),                  school:'Alabama', conference:'SEC', unitType:'DEF',tier:'Elite', adp:8,   projectedPoints:280 },
  { id: uid('Alabama','K','Will Reichard'),    school:'Alabama', conference:'SEC', unitType:'K',  playerName:'Will Reichard',   tier:'Elite', adp:18,  projectedPoints:140 },

  // Georgia
  { id: uid('Georgia','QB','Carson Beck'),     school:'Georgia', conference:'SEC', unitType:'QB', playerName:'Carson Beck',     tier:'Elite', adp:5,   projectedPoints:310 },
  { id: uid('Georgia','QB','Gunner Stockton'), school:'Georgia', conference:'SEC', unitType:'QB', playerName:'Gunner Stockton', tier:'Solid', adp:32,  projectedPoints:200 },
  { id: uid('Georgia','QB','Backup QB'),       school:'Georgia', conference:'SEC', unitType:'QB', playerName:'Backup QB',       tier:'Depth', adp:98,  projectedPoints:75  },
  { id: uid('Georgia','RB'),                   school:'Georgia', conference:'SEC', unitType:'RB', tier:'Elite', adp:2,   projectedPoints:420 },
  { id: uid('Georgia','WR'),                   school:'Georgia', conference:'SEC', unitType:'WR', tier:'Elite', adp:6,   projectedPoints:350 },
  { id: uid('Georgia','TE'),                   school:'Georgia', conference:'SEC', unitType:'TE', tier:'Elite', adp:10,  projectedPoints:240 },
  { id: uid('Georgia','DEF'),                  school:'Georgia', conference:'SEC', unitType:'DEF',tier:'Elite', adp:3,   projectedPoints:320 },
  { id: uid('Georgia','K','Peyton Woodring'),  school:'Georgia', conference:'SEC', unitType:'K',  playerName:'Peyton Woodring', tier:'Elite', adp:15,  projectedPoints:145 },

  // Texas
  { id: uid('Texas','QB','Quinn Ewers'),       school:'Texas', conference:'SEC', unitType:'QB', playerName:'Quinn Ewers',       tier:'Elite', adp:2,   projectedPoints:340 },
  { id: uid('Texas','QB','Arch Manning'),      school:'Texas', conference:'SEC', unitType:'QB', playerName:'Arch Manning',      tier:'Elite', adp:1,   projectedPoints:360 },
  { id: uid('Texas','QB','Backup QB'),         school:'Texas', conference:'SEC', unitType:'QB', playerName:'Backup QB',         tier:'Depth', adp:92,  projectedPoints:85  },
  { id: uid('Texas','RB'),                     school:'Texas', conference:'SEC', unitType:'RB', tier:'Elite', adp:6,   projectedPoints:370 },
  { id: uid('Texas','WR'),                     school:'Texas', conference:'SEC', unitType:'WR', tier:'Elite', adp:4,   projectedPoints:370 },
  { id: uid('Texas','TE'),                     school:'Texas', conference:'SEC', unitType:'TE', tier:'Solid', adp:20,  projectedPoints:200 },
  { id: uid('Texas','DEF'),                    school:'Texas', conference:'SEC', unitType:'DEF',tier:'Elite', adp:6,   projectedPoints:295 },
  { id: uid('Texas','K','Bert Auburn'),        school:'Texas', conference:'SEC', unitType:'K',  playerName:'Bert Auburn',       tier:'Solid', adp:30,  projectedPoints:125 },

  // LSU
  { id: uid('LSU','QB','Garrett Nussmeier'),   school:'LSU', conference:'SEC', unitType:'QB', playerName:'Garrett Nussmeier',   tier:'Elite', adp:7,   projectedPoints:305 },
  { id: uid('LSU','QB','Rickie Collins'),      school:'LSU', conference:'SEC', unitType:'QB', playerName:'Rickie Collins',      tier:'Solid', adp:40,  projectedPoints:185 },
  { id: uid('LSU','QB','Backup QB'),           school:'LSU', conference:'SEC', unitType:'QB', playerName:'Backup QB',           tier:'Depth', adp:105, projectedPoints:70  },
  { id: uid('LSU','RB'),                       school:'LSU', conference:'SEC', unitType:'RB', tier:'Solid', adp:18,  projectedPoints:290 },
  { id: uid('LSU','WR'),                       school:'LSU', conference:'SEC', unitType:'WR', tier:'Elite', adp:9,   projectedPoints:340 },
  { id: uid('LSU','TE'),                       school:'LSU', conference:'SEC', unitType:'TE', tier:'Solid', adp:25,  projectedPoints:180 },
  { id: uid('LSU','DEF'),                      school:'LSU', conference:'SEC', unitType:'DEF',tier:'Solid', adp:18,  projectedPoints:240 },
  { id: uid('LSU','K','Damian Ramos'),         school:'LSU', conference:'SEC', unitType:'K',  playerName:'Damian Ramos',        tier:'Solid', adp:35,  projectedPoints:120 },

  // Tennessee
  { id: uid('Tennessee','QB','Nico Iamaleava'),school:'Tennessee', conference:'SEC', unitType:'QB', playerName:'Nico Iamaleava',tier:'Elite', adp:6,   projectedPoints:315 },
  { id: uid('Tennessee','QB','Backup QB 2'),   school:'Tennessee', conference:'SEC', unitType:'QB', playerName:'Backup QB',     tier:'Solid', adp:45,  projectedPoints:175 },
  { id: uid('Tennessee','QB','Backup QB 3'),   school:'Tennessee', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',   tier:'Depth', adp:108, projectedPoints:65  },
  { id: uid('Tennessee','RB'),                 school:'Tennessee', conference:'SEC', unitType:'RB', tier:'Solid', adp:20,  projectedPoints:280 },
  { id: uid('Tennessee','WR'),                 school:'Tennessee', conference:'SEC', unitType:'WR', tier:'Solid', adp:16,  projectedPoints:300 },
  { id: uid('Tennessee','TE'),                 school:'Tennessee', conference:'SEC', unitType:'TE', tier:'Solid', adp:28,  projectedPoints:175 },
  { id: uid('Tennessee','DEF'),                school:'Tennessee', conference:'SEC', unitType:'DEF',tier:'Solid', adp:20,  projectedPoints:235 },
  { id: uid('Tennessee','K','Holden Fowler'),  school:'Tennessee', conference:'SEC', unitType:'K',  playerName:'Holden Fowler', tier:'Solid', adp:38,  projectedPoints:118 },

  // Ole Miss
  { id: uid('Ole Miss','QB','Jaxson Dart'),    school:'Ole Miss', conference:'SEC', unitType:'QB', playerName:'Jaxson Dart',    tier:'Elite', adp:9,   projectedPoints:300 },
  { id: uid('Ole Miss','QB','Backup QB 2'),    school:'Ole Miss', conference:'SEC', unitType:'QB', playerName:'Backup QB',      tier:'Solid', adp:50,  projectedPoints:170 },
  { id: uid('Ole Miss','QB','Backup QB 3'),    school:'Ole Miss', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',    tier:'Depth', adp:112, projectedPoints:60  },
  { id: uid('Ole Miss','RB'),                  school:'Ole Miss', conference:'SEC', unitType:'RB', tier:'Solid', adp:22,  projectedPoints:275 },
  { id: uid('Ole Miss','WR'),                  school:'Ole Miss', conference:'SEC', unitType:'WR', tier:'Solid', adp:20,  projectedPoints:290 },
  { id: uid('Ole Miss','TE'),                  school:'Ole Miss', conference:'SEC', unitType:'TE', tier:'Depth', adp:55,  projectedPoints:130 },
  { id: uid('Ole Miss','DEF'),                 school:'Ole Miss', conference:'SEC', unitType:'DEF',tier:'Solid', adp:25,  projectedPoints:220 },
  { id: uid('Ole Miss','K','Caden Costa'),     school:'Ole Miss', conference:'SEC', unitType:'K',  playerName:'Caden Costa',    tier:'Solid', adp:42,  projectedPoints:115 },

  // Oklahoma
  { id: uid('Oklahoma','QB','John Mateer'),    school:'Oklahoma', conference:'SEC', unitType:'QB', playerName:'John Mateer',    tier:'Elite', adp:8,   projectedPoints:308 },
  { id: uid('Oklahoma','QB','Backup QB 2'),    school:'Oklahoma', conference:'SEC', unitType:'QB', playerName:'Backup QB',      tier:'Solid', adp:48,  projectedPoints:172 },
  { id: uid('Oklahoma','QB','Backup QB 3'),    school:'Oklahoma', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',    tier:'Depth', adp:110, projectedPoints:62  },
  { id: uid('Oklahoma','RB'),                  school:'Oklahoma', conference:'SEC', unitType:'RB', tier:'Solid', adp:24,  projectedPoints:270 },
  { id: uid('Oklahoma','WR'),                  school:'Oklahoma', conference:'SEC', unitType:'WR', tier:'Solid', adp:22,  projectedPoints:285 },
  { id: uid('Oklahoma','TE'),                  school:'Oklahoma', conference:'SEC', unitType:'TE', tier:'Solid', adp:32,  projectedPoints:165 },
  { id: uid('Oklahoma','DEF'),                 school:'Oklahoma', conference:'SEC', unitType:'DEF',tier:'Elite', adp:12,  projectedPoints:260 },
  { id: uid('Oklahoma','K','Zach Schmit'),     school:'Oklahoma', conference:'SEC', unitType:'K',  playerName:'Zach Schmit',    tier:'Solid', adp:40,  projectedPoints:116 },

  // Auburn
  { id: uid('Auburn','QB','Payton Thorne'),    school:'Auburn', conference:'SEC', unitType:'QB', playerName:'Payton Thorne',    tier:'Solid', adp:35,  projectedPoints:215 },
  { id: uid('Auburn','QB','Backup QB 2'),      school:'Auburn', conference:'SEC', unitType:'QB', playerName:'Backup QB',        tier:'Solid', adp:60,  projectedPoints:160 },
  { id: uid('Auburn','QB','Backup QB 3'),      school:'Auburn', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',      tier:'Depth', adp:118, projectedPoints:55  },
  { id: uid('Auburn','RB'),                    school:'Auburn', conference:'SEC', unitType:'RB', tier:'Solid', adp:30,  projectedPoints:255 },
  { id: uid('Auburn','WR'),                    school:'Auburn', conference:'SEC', unitType:'WR', tier:'Solid', adp:28,  projectedPoints:265 },
  { id: uid('Auburn','TE'),                    school:'Auburn', conference:'SEC', unitType:'TE', tier:'Depth', adp:60,  projectedPoints:120 },
  { id: uid('Auburn','DEF'),                   school:'Auburn', conference:'SEC', unitType:'DEF',tier:'Solid', adp:30,  projectedPoints:210 },
  { id: uid('Auburn','K','Alex McPherson'),    school:'Auburn', conference:'SEC', unitType:'K',  playerName:'Alex McPherson',   tier:'Solid', adp:45,  projectedPoints:112 },

  // Arkansas
  { id: uid('Arkansas','QB','Taylen Green'),   school:'Arkansas', conference:'SEC', unitType:'QB', playerName:'Taylen Green',   tier:'Solid', adp:38,  projectedPoints:208 },
  { id: uid('Arkansas','QB','Backup QB 2'),    school:'Arkansas', conference:'SEC', unitType:'QB', playerName:'Backup QB',      tier:'Depth', adp:65,  projectedPoints:150 },
  { id: uid('Arkansas','QB','Backup QB 3'),    school:'Arkansas', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',    tier:'Depth', adp:120, projectedPoints:52  },
  { id: uid('Arkansas','RB'),                  school:'Arkansas', conference:'SEC', unitType:'RB', tier:'Solid', adp:32,  projectedPoints:248 },
  { id: uid('Arkansas','WR'),                  school:'Arkansas', conference:'SEC', unitType:'WR', tier:'Solid', adp:30,  projectedPoints:260 },
  { id: uid('Arkansas','TE'),                  school:'Arkansas', conference:'SEC', unitType:'TE', tier:'Depth', adp:62,  projectedPoints:118 },
  { id: uid('Arkansas','DEF'),                 school:'Arkansas', conference:'SEC', unitType:'DEF',tier:'Solid', adp:32,  projectedPoints:205 },
  { id: uid('Arkansas','K','Cam Little'),      school:'Arkansas', conference:'SEC', unitType:'K',  playerName:'Cam Little',     tier:'Elite', adp:20,  projectedPoints:138 },

  // Missouri
  { id: uid('Missouri','QB','Brady Cook'),     school:'Missouri', conference:'SEC', unitType:'QB', playerName:'Brady Cook',     tier:'Solid', adp:42,  projectedPoints:200 },
  { id: uid('Missouri','QB','Backup QB 2'),    school:'Missouri', conference:'SEC', unitType:'QB', playerName:'Backup QB',      tier:'Depth', adp:68,  projectedPoints:145 },
  { id: uid('Missouri','QB','Backup QB 3'),    school:'Missouri', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',    tier:'Depth', adp:122, projectedPoints:50  },
  { id: uid('Missouri','RB'),                  school:'Missouri', conference:'SEC', unitType:'RB', tier:'Solid', adp:34,  projectedPoints:245 },
  { id: uid('Missouri','WR'),                  school:'Missouri', conference:'SEC', unitType:'WR', tier:'Solid', adp:32,  projectedPoints:255 },
  { id: uid('Missouri','TE'),                  school:'Missouri', conference:'SEC', unitType:'TE', tier:'Depth', adp:65,  projectedPoints:115 },
  { id: uid('Missouri','DEF'),                 school:'Missouri', conference:'SEC', unitType:'DEF',tier:'Solid', adp:35,  projectedPoints:200 },
  { id: uid('Missouri','K','Harrison Mevis'),  school:'Missouri', conference:'SEC', unitType:'K',  playerName:'Harrison Mevis', tier:'Elite', adp:22,  projectedPoints:136 },

  // Kentucky
  { id: uid('Kentucky','QB','Brock Vandagriff'),school:'Kentucky',conference:'SEC', unitType:'QB', playerName:'Brock Vandagriff',tier:'Solid',adp:44, projectedPoints:195 },
  { id: uid('Kentucky','QB','Backup QB 2'),    school:'Kentucky', conference:'SEC', unitType:'QB', playerName:'Backup QB',      tier:'Depth', adp:70,  projectedPoints:140 },
  { id: uid('Kentucky','QB','Backup QB 3'),    school:'Kentucky', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',    tier:'Depth', adp:124, projectedPoints:48  },
  { id: uid('Kentucky','RB'),                  school:'Kentucky', conference:'SEC', unitType:'RB', tier:'Solid', adp:36,  projectedPoints:240 },
  { id: uid('Kentucky','WR'),                  school:'Kentucky', conference:'SEC', unitType:'WR', tier:'Depth', adp:45,  projectedPoints:230 },
  { id: uid('Kentucky','TE'),                  school:'Kentucky', conference:'SEC', unitType:'TE', tier:'Depth', adp:68,  projectedPoints:110 },
  { id: uid('Kentucky','DEF'),                 school:'Kentucky', conference:'SEC', unitType:'DEF',tier:'Solid', adp:38,  projectedPoints:195 },
  { id: uid('Kentucky','K','Alex Raynor'),     school:'Kentucky', conference:'SEC', unitType:'K',  playerName:'Alex Raynor',    tier:'Solid', adp:48,  projectedPoints:108 },

  // Florida
  { id: uid('Florida','QB','DJ Lagway'),       school:'Florida', conference:'SEC', unitType:'QB', playerName:'DJ Lagway',       tier:'Elite', adp:10,  projectedPoints:295 },
  { id: uid('Florida','QB','Backup QB 2'),     school:'Florida', conference:'SEC', unitType:'QB', playerName:'Backup QB',       tier:'Solid', adp:52,  projectedPoints:168 },
  { id: uid('Florida','QB','Backup QB 3'),     school:'Florida', conference:'SEC', unitType:'QB', playerName:'Backup QB 3',     tier:'Depth', adp:115, projectedPoints:58  },
  { id: uid('Florida','RB'),                   school:'Florida', conference:'SEC', unitType:'RB', tier:'Solid', adp:26,  projectedPoints:262 },
  { id: uid('Florida','WR'),                   school:'Florida', conference:'SEC', unitType:'WR', tier:'Solid', adp:24,  projectedPoints:272 },
  { id: uid('Florida','TE'),                   school:'Florida', conference:'SEC', unitType:'TE', tier:'Solid', adp:30,  projectedPoints:168 },
  { id: uid('Florida','DEF'),                  school:'Florida', conference:'SEC', unitType:'DEF',tier:'Solid', adp:28,  projectedPoints:215 },
  { id: uid('Florida','K','Trey Smack'),       school:'Florida', conference:'SEC', unitType:'K',  playerName:'Trey Smack',      tier:'Solid', adp:44,  projectedPoints:113 },

  // Texas A&M
  { id: uid('Texas A&M','QB','Marcel Reed'),   school:'Texas A&M',conference:'SEC', unitType:'QB', playerName:'Marcel Reed',    tier:'Solid', adp:36,  projectedPoints:212 },
  { id: uid('Texas A&M','QB','Backup QB 2'),   school:'Texas A&M',conference:'SEC', unitType:'QB', playerName:'Backup QB',      tier:'Depth', adp:62,  projectedPoints:155 },
  { id: uid('Texas A&M','QB','Backup QB 3'),   school:'Texas A&M',conference:'SEC', unitType:'QB', playerName:'Backup QB 3',    tier:'Depth', adp:116, projectedPoints:56  },
  { id: uid('Texas A&M','RB'),                 school:'Texas A&M',conference:'SEC', unitType:'RB', tier:'Solid', adp:28,  projectedPoints:258 },
  { id: uid('Texas A&M','WR'),                 school:'Texas A&M',conference:'SEC', unitType:'WR', tier:'Solid', adp:26,  projectedPoints:268 },
  { id: uid('Texas A&M','TE'),                 school:'Texas A&M',conference:'SEC', unitType:'TE', tier:'Solid', adp:35,  projectedPoints:162 },
  { id: uid('Texas A&M','DEF'),                school:'Texas A&M',conference:'SEC', unitType:'DEF',tier:'Elite', adp:10,  projectedPoints:265 },
  { id: uid('Texas A&M','K','Randy Bond'),     school:'Texas A&M',conference:'SEC', unitType:'K',  playerName:'Randy Bond',     tier:'Solid', adp:46,  projectedPoints:110 },

  // Mississippi State, South Carolina, Vanderbilt (Depth teams)
  ...(['Mississippi State','South Carolina','Vanderbilt'] as const).flatMap((school, i) => [
    { id: uid(school,'QB',`Starter QB`),  school, conference:'SEC' as Conference, unitType:'QB' as UnitType, playerName:'Starter QB',  tier:'Depth' as Tier, adp:70+i*5,  projectedPoints:160-i*10 },
    { id: uid(school,'QB',`Backup QB`),   school, conference:'SEC' as Conference, unitType:'QB' as UnitType, playerName:'Backup QB',   tier:'Depth' as Tier, adp:90+i*5,  projectedPoints:110-i*5  },
    { id: uid(school,'QB',`Third QB`),    school, conference:'SEC' as Conference, unitType:'QB' as UnitType, playerName:'Third QB',    tier:'Depth' as Tier, adp:130+i*5, projectedPoints:45-i*5   },
    { id: uid(school,'RB'),               school, conference:'SEC' as Conference, unitType:'RB' as UnitType, tier:'Depth' as Tier, adp:55+i*5,  projectedPoints:200-i*10 },
    { id: uid(school,'WR'),               school, conference:'SEC' as Conference, unitType:'WR' as UnitType, tier:'Depth' as Tier, adp:55+i*5,  projectedPoints:210-i*10 },
    { id: uid(school,'TE'),               school, conference:'SEC' as Conference, unitType:'TE' as UnitType, tier:'Depth' as Tier, adp:80+i*5,  projectedPoints:95-i*5   },
    { id: uid(school,'DEF'),              school, conference:'SEC' as Conference, unitType:'DEF' as UnitType,tier:'Depth' as Tier, adp:60+i*5,  projectedPoints:175-i*10 },
    { id: uid(school,'K',`Kicker`),       school, conference:'SEC' as Conference, unitType:'K' as UnitType,  playerName:'Kicker',      tier:'Depth' as Tier, adp:75+i*5,  projectedPoints:95-i*5   },
  ]),

  // ═══════════════════════════════════════════════════════════
  // BIG TEN
  // ═══════════════════════════════════════════════════════════

  // Ohio State
  { id: uid('Ohio State','QB','Will Howard'),  school:'Ohio State',conference:'Big Ten',unitType:'QB',playerName:'Will Howard',   tier:'Elite',adp:4,   projectedPoints:330 },
  { id: uid('Ohio State','QB','Devin Brown'),  school:'Ohio State',conference:'Big Ten',unitType:'QB',playerName:'Devin Brown',   tier:'Solid',adp:30,  projectedPoints:205 },
  { id: uid('Ohio State','QB','Backup QB'),    school:'Ohio State',conference:'Big Ten',unitType:'QB',playerName:'Backup QB',     tier:'Depth',adp:100, projectedPoints:72  },
  { id: uid('Ohio State','RB'),                school:'Ohio State',conference:'Big Ten',unitType:'RB',tier:'Elite',adp:1,   projectedPoints:430 },
  { id: uid('Ohio State','WR'),                school:'Ohio State',conference:'Big Ten',unitType:'WR',tier:'Elite',adp:2,   projectedPoints:410 },
  { id: uid('Ohio State','TE'),                school:'Ohio State',conference:'Big Ten',unitType:'TE',tier:'Elite',adp:8,   projectedPoints:250 },
  { id: uid('Ohio State','DEF'),               school:'Ohio State',conference:'Big Ten',unitType:'DEF',tier:'Elite',adp:2,  projectedPoints:330 },
  { id: uid('Ohio State','K','Jayden Fielding'),school:'Ohio State',conference:'Big Ten',unitType:'K',playerName:'Jayden Fielding',tier:'Elite',adp:12, projectedPoints:148 },

  // Michigan
  { id: uid('Michigan','QB','Alex Orji'),      school:'Michigan',conference:'Big Ten',unitType:'QB',playerName:'Alex Orji',      tier:'Solid',adp:22,  projectedPoints:240 },
  { id: uid('Michigan','QB','Davis Warren'),   school:'Michigan',conference:'Big Ten',unitType:'QB',playerName:'Davis Warren',   tier:'Solid',adp:42,  projectedPoints:182 },
  { id: uid('Michigan','QB','Backup QB'),      school:'Michigan',conference:'Big Ten',unitType:'QB',playerName:'Backup QB',      tier:'Depth',adp:102, projectedPoints:70  },
  { id: uid('Michigan','RB'),                  school:'Michigan',conference:'Big Ten',unitType:'RB',tier:'Elite',adp:8,   projectedPoints:360 },
  { id: uid('Michigan','WR'),                  school:'Michigan',conference:'Big Ten',unitType:'WR',tier:'Solid',adp:14,  projectedPoints:310 },
  { id: uid('Michigan','TE'),                  school:'Michigan',conference:'Big Ten',unitType:'TE',tier:'Solid',adp:18,  projectedPoints:210 },
  { id: uid('Michigan','DEF'),                 school:'Michigan',conference:'Big Ten',unitType:'DEF',tier:'Elite',adp:5,  projectedPoints:305 },
  { id: uid('Michigan','K','James Turner'),    school:'Michigan',conference:'Big Ten',unitType:'K',playerName:'James Turner',    tier:'Solid',adp:28,  projectedPoints:128 },

  // Penn State
  { id: uid('Penn State','QB','Drew Allar'),   school:'Penn State',conference:'Big Ten',unitType:'QB',playerName:'Drew Allar',   tier:'Elite',adp:11,  projectedPoints:292 },
  { id: uid('Penn State','QB','Beau Pribula'), school:'Penn State',conference:'Big Ten',unitType:'QB',playerName:'Beau Pribula', tier:'Solid',adp:38,  projectedPoints:195 },
  { id: uid('Penn State','QB','Backup QB'),    school:'Penn State',conference:'Big Ten',unitType:'QB',playerName:'Backup QB',    tier:'Depth',adp:104, projectedPoints:68  },
  { id: uid('Penn State','RB'),                school:'Penn State',conference:'Big Ten',unitType:'RB',tier:'Elite',adp:10,  projectedPoints:345 },
  { id: uid('Penn State','WR'),                school:'Penn State',conference:'Big Ten',unitType:'WR',tier:'Elite',adp:10,  projectedPoints:330 },
  { id: uid('Penn State','TE'),                school:'Penn State',conference:'Big Ten',unitType:'TE',tier:'Solid',adp:22,  projectedPoints:195 },
  { id: uid('Penn State','DEF'),               school:'Penn State',conference:'Big Ten',unitType:'DEF',tier:'Elite',adp:7,  projectedPoints:288 },
  { id: uid('Penn State','K','Ryan Barker'),   school:'Penn State',conference:'Big Ten',unitType:'K',playerName:'Ryan Barker',   tier:'Solid',adp:32,  projectedPoints:122 },

  // Oregon
  { id: uid('Oregon','QB','Dillon Gabriel'),   school:'Oregon',conference:'Big Ten',unitType:'QB',playerName:'Dillon Gabriel',   tier:'Elite',adp:12,  projectedPoints:288 },
  { id: uid('Oregon','QB','Backup QB 2'),      school:'Oregon',conference:'Big Ten',unitType:'QB',playerName:'Backup QB',        tier:'Solid',adp:46,  projectedPoints:178 },
  { id: uid('Oregon','QB','Backup QB 3'),      school:'Oregon',conference:'Big Ten',unitType:'QB',playerName:'Backup QB 3',      tier:'Depth',adp:106, projectedPoints:66  },
  { id: uid('Oregon','RB'),                    school:'Oregon',conference:'Big Ten',unitType:'RB',tier:'Elite',adp:12,  projectedPoints:340 },
  { id: uid('Oregon','WR'),                    school:'Oregon',conference:'Big Ten',unitType:'WR',tier:'Elite',adp:12,  projectedPoints:325 },
  { id: uid('Oregon','TE'),                    school:'Oregon',conference:'Big Ten',unitType:'TE',tier:'Solid',adp:24,  projectedPoints:188 },
  { id: uid('Oregon','DEF'),                   school:'Oregon',conference:'Big Ten',unitType:'DEF',tier:'Solid',adp:15, projectedPoints:250 },
  { id: uid('Oregon','K','Atticus Seyfried'),  school:'Oregon',conference:'Big Ten',unitType:'K',playerName:'Atticus Seyfried',  tier:'Solid',adp:34,  projectedPoints:120 },

  // Indiana
  { id: uid('Indiana','QB','Fernando Mendoza'),school:'Indiana',conference:'Big Ten',unitType:'QB',playerName:'Fernando Mendoza',tier:'Elite',adp:13,  projectedPoints:285 },
  { id: uid('Indiana','QB','Backup QB 2'),     school:'Indiana',conference:'Big Ten',unitType:'QB',playerName:'Backup QB',       tier:'Solid',adp:48,  projectedPoints:175 },
  { id: uid('Indiana','QB','Backup QB 3'),     school:'Indiana',conference:'Big Ten',unitType:'QB',playerName:'Backup QB 3',     tier:'Depth',adp:108, projectedPoints:64  },
  { id: uid('Indiana','RB'),                   school:'Indiana',conference:'Big Ten',unitType:'RB',tier:'Solid',adp:14,  projectedPoints:335 },
  { id: uid('Indiana','WR'),                   school:'Indiana',conference:'Big Ten',unitType:'WR',tier:'Solid',adp:15,  projectedPoints:318 },
  { id: uid('Indiana','TE'),                   school:'Indiana',conference:'Big Ten',unitType:'TE',tier:'Solid',adp:26,  projectedPoints:185 },
  { id: uid('Indiana','DEF'),                  school:'Indiana',conference:'Big Ten',unitType:'DEF',tier:'Elite',adp:9,  projectedPoints:285 },
  { id: uid('Indiana','K','James Evans'),      school:'Indiana',conference:'Big Ten',unitType:'K',playerName:'James Evans',      tier:'Solid',adp:36,  projectedPoints:118 },

  // USC
  { id: uid('USC','QB','Miller Moss'),         school:'USC',conference:'Big Ten',unitType:'QB',playerName:'Miller Moss',         tier:'Elite',adp:14,  projectedPoints:282 },
  { id: uid('USC','QB','Backup QB 2'),         school:'USC',conference:'Big Ten',unitType:'QB',playerName:'Backup QB',           tier:'Solid',adp:50,  projectedPoints:172 },
  { id: uid('USC','QB','Backup QB 3'),         school:'USC',conference:'Big Ten',unitType:'QB',playerName:'Backup QB 3',         tier:'Depth',adp:110, projectedPoints:62  },
  { id: uid('USC','RB'),                       school:'USC',conference:'Big Ten',unitType:'RB',tier:'Solid',adp:16,  projectedPoints:328 },
  { id: uid('USC','WR'),                       school:'USC',conference:'Big Ten',unitType:'WR',tier:'Elite',adp:8,   projectedPoints:345 },
  { id: uid('USC','TE'),                       school:'USC',conference:'Big Ten',unitType:'TE',tier:'Solid',adp:28,  projectedPoints:180 },
  { id: uid('USC','DEF'),                      school:'USC',conference:'Big Ten',unitType:'DEF',tier:'Solid',adp:22, projectedPoints:228 },
  { id: uid('USC','K','Denis Lynch'),          school:'USC',conference:'Big Ten',unitType:'K',playerName:'Denis Lynch',          tier:'Solid',adp:38,  projectedPoints:115 },

  // Wisconsin
  { id: uid('Wisconsin','QB','Tyler Van Dyke'),school:'Wisconsin',conference:'Big Ten',unitType:'QB',playerName:'Tyler Van Dyke',tier:'Solid',adp:25,  projectedPoints:238 },
  { id: uid('Wisconsin','QB','Backup QB 2'),   school:'Wisconsin',conference:'Big Ten',unitType:'QB',playerName:'Backup QB',     tier:'Depth',adp:55,  projectedPoints:165 },
  { id: uid('Wisconsin','QB','Backup QB 3'),   school:'Wisconsin',conference:'Big Ten',unitType:'QB',playerName:'Backup QB 3',   tier:'Depth',adp:112, projectedPoints:60  },
  { id: uid('Wisconsin','RB'),                 school:'Wisconsin',conference:'Big Ten',unitType:'RB',tier:'Elite',adp:7,   projectedPoints:365 },
  { id: uid('Wisconsin','WR'),                 school:'Wisconsin',conference:'Big Ten',unitType:'WR',tier:'Depth',adp:40,  projectedPoints:235 },
  { id: uid('Wisconsin','TE'),                 school:'Wisconsin',conference:'Big Ten',unitType:'TE',tier:'Solid',adp:30,  projectedPoints:172 },
  { id: uid('Wisconsin','DEF'),                school:'Wisconsin',conference:'Big Ten',unitType:'DEF',tier:'Solid',adp:24, projectedPoints:222 },
  { id: uid('Wisconsin','K','Nathanial Vakos'),school:'Wisconsin',conference:'Big Ten',unitType:'K',playerName:'Nathanial Vakos',tier:'Solid',adp:40,  projectedPoints:112 },

  // Remaining Big Ten (Iowa, Minnesota, UCLA, Washington, Michigan State, Rutgers, Maryland, Nebraska, Illinois, Purdue, Northwestern)
  ...([
    { school:'Iowa',          qb:'Cade McNamara', rbAdp:20, wrAdp:42, defTier:'Solid' as Tier, qbTier:'Solid' as Tier },
    { school:'Minnesota',     qb:'Max Brosmer',   rbAdp:22, wrAdp:44, defTier:'Solid' as Tier, qbTier:'Solid' as Tier },
    { school:'UCLA',          qb:'Ethan Garbers',  rbAdp:24, wrAdp:46, defTier:'Depth' as Tier, qbTier:'Solid' as Tier },
    { school:'Washington',    qb:'Will Rogers',    rbAdp:26, wrAdp:48, defTier:'Depth' as Tier, qbTier:'Solid' as Tier },
    { school:'Michigan State',qb:'Aidan Chiles',   rbAdp:28, wrAdp:50, defTier:'Depth' as Tier, qbTier:'Solid' as Tier },
    { school:'Nebraska',      qb:'Dylan Raiola',   rbAdp:30, wrAdp:52, defTier:'Depth' as Tier, qbTier:'Solid' as Tier },
    { school:'Maryland',      qb:'Billy Edwards',  rbAdp:35, wrAdp:55, defTier:'Depth' as Tier, qbTier:'Depth' as Tier },
    { school:'Illinois',      qb:'Luke Altmyer',   rbAdp:38, wrAdp:58, defTier:'Depth' as Tier, qbTier:'Depth' as Tier },
    { school:'Rutgers',       qb:'Athan Kaliakmanis',rbAdp:42,wrAdp:62,defTier:'Depth' as Tier, qbTier:'Depth' as Tier },
    { school:'Purdue',        qb:'Ryan Browne',    rbAdp:45, wrAdp:65, defTier:'Depth' as Tier, qbTier:'Depth' as Tier },
    { school:'Northwestern',  qb:'Mike Wright',    rbAdp:48, wrAdp:68, defTier:'Depth' as Tier, qbTier:'Depth' as Tier },
  ] as const).flatMap(({ school, qb, rbAdp, wrAdp, defTier, qbTier }, i) => [
    { id: uid(school,'QB',qb),         school, conference:'Big Ten' as Conference, unitType:'QB' as UnitType, playerName:qb,       tier:qbTier,          adp:25+i*3,  projectedPoints:230-i*8  },
    { id: uid(school,'QB','Backup QB'),school, conference:'Big Ten' as Conference, unitType:'QB' as UnitType, playerName:'Backup QB',tier:'Depth' as Tier,adp:55+i*3,  projectedPoints:150-i*5  },
    { id: uid(school,'QB','Third QB'), school, conference:'Big Ten' as Conference, unitType:'QB' as UnitType, playerName:'Third QB', tier:'Depth' as Tier,adp:115+i*2, projectedPoints:55-i*3   },
    { id: uid(school,'RB'),            school, conference:'Big Ten' as Conference, unitType:'RB' as UnitType, tier:'Solid' as Tier,  adp:rbAdp,           projectedPoints:290-i*12 },
    { id: uid(school,'WR'),            school, conference:'Big Ten' as Conference, unitType:'WR' as UnitType, tier:'Depth' as Tier,  adp:wrAdp,           projectedPoints:255-i*10 },
    { id: uid(school,'TE'),            school, conference:'Big Ten' as Conference, unitType:'TE' as UnitType, tier:'Depth' as Tier,  adp:70+i*3,          projectedPoints:130-i*5  },
    { id: uid(school,'DEF'),           school, conference:'Big Ten' as Conference, unitType:'DEF' as UnitType,tier:defTier,          adp:35+i*3,          projectedPoints:210-i*8  },
    { id: uid(school,'K','Kicker'),    school, conference:'Big Ten' as Conference, unitType:'K' as UnitType,  playerName:'Kicker',   tier:'Depth' as Tier, adp:55+i*3,  projectedPoints:100-i*4  },
  ]),

  // ═══════════════════════════════════════════════════════════
  // BIG 12
  // ═══════════════════════════════════════════════════════════
  ...([
    { school:'Colorado',      qb:'Shedeur Sanders', rbAdp:15, wrAdp:18, defTier:'Solid' as Tier,  qbTier:'Elite' as Tier, qbAdp:15 },
    { school:'Iowa State',    qb:'Rocco Becht',     rbAdp:18, wrAdp:22, defTier:'Elite' as Tier,  qbTier:'Elite' as Tier, qbAdp:16 },
    { school:'Kansas State',  qb:'Avery Johnson',   rbAdp:20, wrAdp:25, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier, qbAdp:20 },
    { school:'BYU',           qb:'Jake Retzlaff',   rbAdp:22, wrAdp:28, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier, qbAdp:22 },
    { school:'Utah',          qb:'Cameron Rising',  rbAdp:24, wrAdp:30, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier, qbAdp:24 },
    { school:'TCU',           qb:'Josh Hoover',     rbAdp:26, wrAdp:32, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier, qbAdp:26 },
    { school:'Oklahoma State',qb:'Alan Bowman',     rbAdp:28, wrAdp:35, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier, qbAdp:28 },
    { school:'Texas Tech',    qb:'Behren Morton',   rbAdp:30, wrAdp:38, defTier:'Depth' as Tier,  qbTier:'Solid' as Tier, qbAdp:30 },
    { school:'Arizona State', qb:'Sam Leavitt',     rbAdp:32, wrAdp:40, defTier:'Depth' as Tier,  qbTier:'Solid' as Tier, qbAdp:32 },
    { school:'West Virginia', qb:'Garrett Greene',  rbAdp:34, wrAdp:42, defTier:'Depth' as Tier,  qbTier:'Solid' as Tier, qbAdp:34 },
    { school:'Baylor',        qb:'Sawyer Robertson',rbAdp:36, wrAdp:45, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier, qbAdp:38 },
    { school:'Cincinnati',    qb:'Brendan Sorsby',  rbAdp:38, wrAdp:48, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier, qbAdp:40 },
    { school:'UCF',           qb:'KJ Jefferson',    rbAdp:40, wrAdp:50, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier, qbAdp:42 },
    { school:'Houston',       qb:'Zeon Chriss',     rbAdp:42, wrAdp:52, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier, qbAdp:44 },
    { school:'Kansas',        qb:'Jalon Daniels',   rbAdp:44, wrAdp:55, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier, qbAdp:46 },
    { school:'Arizona',       qb:'Noah Fifita',     rbAdp:46, wrAdp:58, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier, qbAdp:48 },
  ] as const).flatMap(({ school, qb, rbAdp, wrAdp, defTier, qbTier, qbAdp }, i) => [
    { id: uid(school,'QB',qb),          school, conference:'Big 12' as Conference, unitType:'QB' as UnitType,  playerName:qb,        tier:qbTier,           adp:qbAdp,    projectedPoints:280-i*8  },
    { id: uid(school,'QB','Backup QB'), school, conference:'Big 12' as Conference, unitType:'QB' as UnitType,  playerName:'Backup QB',tier:'Depth' as Tier,  adp:65+i*2,   projectedPoints:148-i*4  },
    { id: uid(school,'QB','Third QB'),  school, conference:'Big 12' as Conference, unitType:'QB' as UnitType,  playerName:'Third QB', tier:'Depth' as Tier,  adp:125+i*2,  projectedPoints:52-i*2   },
    { id: uid(school,'RB'),             school, conference:'Big 12' as Conference, unitType:'RB' as UnitType,  tier:'Solid' as Tier,  adp:rbAdp,             projectedPoints:310-i*10 },
    { id: uid(school,'WR'),             school, conference:'Big 12' as Conference, unitType:'WR' as UnitType,  tier:'Solid' as Tier,  adp:wrAdp,             projectedPoints:295-i*10 },
    { id: uid(school,'TE'),             school, conference:'Big 12' as Conference, unitType:'TE' as UnitType,  tier:'Depth' as Tier,  adp:72+i*2,            projectedPoints:128-i*4  },
    { id: uid(school,'DEF'),            school, conference:'Big 12' as Conference, unitType:'DEF' as UnitType, tier:defTier,          adp:40+i*3,            projectedPoints:225-i*8  },
    { id: uid(school,'K','Kicker'),     school, conference:'Big 12' as Conference, unitType:'K' as UnitType,   playerName:'Kicker',   tier:'Depth' as Tier,  adp:58+i*2,   projectedPoints:105-i*3  },
  ]),

  // ═══════════════════════════════════════════════════════════
  // ACC
  // ═══════════════════════════════════════════════════════════
  ...([
    { school:'Clemson',        qb:'Cade Klubnik',     rbAdp:16, wrAdp:20, defTier:'Elite' as Tier,  qbTier:'Elite' as Tier,  qbAdp:14 },
    { school:'Miami',          qb:'Cam Ward',         rbAdp:18, wrAdp:22, defTier:'Elite' as Tier,  qbTier:'Elite' as Tier,  qbAdp:17 },
    { school:'Florida State',  qb:'DJ Uiagalelei',    rbAdp:20, wrAdp:26, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier,  qbAdp:19 },
    { school:'SMU',            qb:'Kevin Jennings',   rbAdp:22, wrAdp:28, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier,  qbAdp:21 },
    { school:'Louisville',     qb:'Lincoln Kienholz', rbAdp:14, wrAdp:18, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier,  qbAdp:23 },
    { school:'North Carolina', qb:'Max Johnson',      rbAdp:24, wrAdp:30, defTier:'Depth' as Tier,  qbTier:'Solid' as Tier,  qbAdp:27 },
    { school:'Duke',           qb:'Maalik Murphy',    rbAdp:26, wrAdp:32, defTier:'Depth' as Tier,  qbTier:'Solid' as Tier,  qbAdp:29 },
    { school:'NC State',       qb:'Brennan Armstrong',rbAdp:28, wrAdp:35, defTier:'Solid' as Tier,  qbTier:'Solid' as Tier,  qbAdp:31 },
    { school:'Pittsburgh',     qb:'Eli Holstein',     rbAdp:30, wrAdp:38, defTier:'Depth' as Tier,  qbTier:'Solid' as Tier,  qbAdp:33 },
    { school:'Virginia Tech',  qb:'Kyron Drones',     rbAdp:32, wrAdp:40, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:37 },
    { school:'Wake Forest',    qb:'Michael Kern',     rbAdp:34, wrAdp:42, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:39 },
    { school:'Georgia Tech',   qb:'Haynes King',      rbAdp:36, wrAdp:45, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:41 },
    { school:'Syracuse',       qb:'Kyle McCord',      rbAdp:38, wrAdp:48, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:43 },
    { school:'Boston College', qb:'Thomas Castellanos',rbAdp:40,wrAdp:50, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:45 },
    { school:'Stanford',       qb:'Ashton Daniels',   rbAdp:42, wrAdp:52, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:47 },
    { school:'Cal',            qb:'Fernando Mendoza', rbAdp:44, wrAdp:55, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:49 },
    { school:'Virginia',       qb:'Anthony Colandrea',rbAdp:46, wrAdp:58, defTier:'Depth' as Tier,  qbTier:'Depth' as Tier,  qbAdp:51 },
  ] as const).flatMap(({ school, qb, rbAdp, wrAdp, defTier, qbTier, qbAdp }, i) => [
    { id: uid(school,'QB',qb),          school, conference:'ACC' as Conference, unitType:'QB' as UnitType,  playerName:qb,         tier:qbTier,           adp:qbAdp,    projectedPoints:275-i*7  },
    { id: uid(school,'QB','Backup QB'), school, conference:'ACC' as Conference, unitType:'QB' as UnitType,  playerName:'Backup QB', tier:'Depth' as Tier,  adp:68+i*2,   projectedPoints:145-i*4  },
    { id: uid(school,'QB','Third QB'),  school, conference:'ACC' as Conference, unitType:'QB' as UnitType,  playerName:'Third QB',  tier:'Depth' as Tier,  adp:128+i*2,  projectedPoints:50-i*2   },
    { id: uid(school,'RB'),             school, conference:'ACC' as Conference, unitType:'RB' as UnitType,  tier:'Solid' as Tier,   adp:rbAdp,             projectedPoints:305-i*10 },
    { id: uid(school,'WR'),             school, conference:'ACC' as Conference, unitType:'WR' as UnitType,  tier:'Solid' as Tier,   adp:wrAdp,             projectedPoints:288-i*10 },
    { id: uid(school,'TE'),             school, conference:'ACC' as Conference, unitType:'TE' as UnitType,  tier:'Depth' as Tier,   adp:74+i*2,            projectedPoints:125-i*4  },
    { id: uid(school,'DEF'),            school, conference:'ACC' as Conference, unitType:'DEF' as UnitType, tier:defTier,           adp:42+i*3,            projectedPoints:220-i*8  },
    { id: uid(school,'K','Kicker'),     school, conference:'ACC' as Conference, unitType:'K' as UnitType,   playerName:'Kicker',    tier:'Depth' as Tier,  adp:60+i*2,   projectedPoints:102-i*3  },
  ]),

  // ═══════════════════════════════════════════════════════════
  // FBS INDEPENDENTS
  // ═══════════════════════════════════════════════════════════

  // Notre Dame
  { id: uid('Notre Dame','QB','Riley Leonard'),   school:'Notre Dame', conference:'FBS Independents', unitType:'QB', playerName:'Riley Leonard',   tier:'Elite', adp:16,  projectedPoints:278 },
  { id: uid('Notre Dame','QB','Backup QB'),        school:'Notre Dame', conference:'FBS Independents', unitType:'QB', playerName:'Backup QB',        tier:'Solid', adp:52,  projectedPoints:168 },
  { id: uid('Notre Dame','QB','Third QB'),         school:'Notre Dame', conference:'FBS Independents', unitType:'QB', playerName:'Third QB',         tier:'Depth', adp:118, projectedPoints:58  },
  { id: uid('Notre Dame','RB'),                    school:'Notre Dame', conference:'FBS Independents', unitType:'RB', tier:'Elite', adp:9,   projectedPoints:352 },
  { id: uid('Notre Dame','WR'),                    school:'Notre Dame', conference:'FBS Independents', unitType:'WR', tier:'Elite', adp:11,  projectedPoints:328 },
  { id: uid('Notre Dame','TE'),                    school:'Notre Dame', conference:'FBS Independents', unitType:'TE', tier:'Elite', adp:12,  projectedPoints:238 },
  { id: uid('Notre Dame','DEF'),                   school:'Notre Dame', conference:'FBS Independents', unitType:'DEF',tier:'Elite', adp:4,   projectedPoints:318 },
  { id: uid('Notre Dame','K','Mitch Jeter'),       school:'Notre Dame', conference:'FBS Independents', unitType:'K',  playerName:'Mitch Jeter',      tier:'Elite', adp:16,  projectedPoints:142 },

  // Remaining FBS Independents (Army, Navy, Liberty, New Mexico State, Connecticut)
  ...([
    { school:'Army',             qb:'Bryson Daily',    rbAdp:38, wrAdp:52, defTier:'Solid' as Tier, qbTier:'Solid' as Tier, qbAdp:36 },
    { school:'Navy',             qb:'Blake Horvath',   rbAdp:42, wrAdp:56, defTier:'Solid' as Tier, qbTier:'Solid' as Tier, qbAdp:40 },
    { school:'Liberty',          qb:'Kaidon Salter',   rbAdp:46, wrAdp:60, defTier:'Depth' as Tier, qbTier:'Solid' as Tier, qbAdp:44 },
    { school:'New Mexico State', qb:'Diego Pavia',     rbAdp:55, wrAdp:70, defTier:'Depth' as Tier, qbTier:'Depth' as Tier, qbAdp:55 },
    { school:'Connecticut',      qb:'TaQuan Roberson', rbAdp:60, wrAdp:75, defTier:'Depth' as Tier, qbTier:'Depth' as Tier, qbAdp:60 },
  ] as const).flatMap(({ school, qb, rbAdp, wrAdp, defTier, qbTier, qbAdp }, i) => [
    { id: uid(school,'QB',qb),          school, conference:'FBS Independents' as Conference, unitType:'QB' as UnitType,  playerName:qb,         tier:qbTier,           adp:qbAdp,    projectedPoints:245-i*10 },
    { id: uid(school,'QB','Backup QB'), school, conference:'FBS Independents' as Conference, unitType:'QB' as UnitType,  playerName:'Backup QB', tier:'Depth' as Tier,  adp:78+i*4,   projectedPoints:140-i*6  },
    { id: uid(school,'QB','Third QB'),  school, conference:'FBS Independents' as Conference, unitType:'QB' as UnitType,  playerName:'Third QB',  tier:'Depth' as Tier,  adp:138+i*3,  projectedPoints:48-i*4   },
    { id: uid(school,'RB'),             school, conference:'FBS Independents' as Conference, unitType:'RB' as UnitType,  tier:'Solid' as Tier,   adp:rbAdp,             projectedPoints:270-i*15 },
    { id: uid(school,'WR'),             school, conference:'FBS Independents' as Conference, unitType:'WR' as UnitType,  tier:'Depth' as Tier,   adp:wrAdp,             projectedPoints:248-i*15 },
    { id: uid(school,'TE'),             school, conference:'FBS Independents' as Conference, unitType:'TE' as UnitType,  tier:'Depth' as Tier,   adp:85+i*4,            projectedPoints:118-i*6  },
    { id: uid(school,'DEF'),            school, conference:'FBS Independents' as Conference, unitType:'DEF' as UnitType, tier:defTier,           adp:48+i*4,            projectedPoints:205-i*10 },
    { id: uid(school,'K','Kicker'),     school, conference:'FBS Independents' as Conference, unitType:'K' as UnitType,   playerName:'Kicker',    tier:'Depth' as Tier,  adp:68+i*4,   projectedPoints:98-i*5   },
  ]),
];

// ── Filter function ──────────────────────────────────────────
export function buildPlayerPool(conferences: Conference[], teams: string[]): DraftUnit[] {
  return FULL_POOL.filter(unit =>
    conferences.includes(unit.conference) && teams.includes(unit.school)
  ).sort((a, b) => a.adp - b.adp);
}

// ── Scoring system ───────────────────────────────────────────
export const SCORING = {
  QB: {
    passTD: 4, passYardsPerYard: 0.1, rushTD: 6,
    interception: -2, fumbleLost: -2,
  },
  RB_WR_TE: {
    rushYardsPerYard: 0.1, recYardsPerYard: 0.1,
    reception: 1, anyTD: 6, fumbleLost: -2,
  },
  K: {
    fg50plus: 5, fg4049: 4, fg039: 3,
    pat: 1, patMiss: -2, fgMiss: -1,
  },
  DEF: {
    sack: 1, interception: 2, fumbleRecovery: 2,
    defensiveTD: 6, safety: 2, shutout: 10,
    pointsAllowed0: 10, pointsAllowed16: 7, pointsAllowed713: 4,
    pointsAllowed1420: 1, pointsAllowed2127: 0, pointsAllowed28plus: -1,
  },
};