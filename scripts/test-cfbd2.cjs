const pkg = require('cfbd');
const { client, getPlayerSeasonStats, getTeamStats } = pkg;

client.setConfig({ headers: { Authorization: `Bearer a4+OeytlFtQ2E/zGw2cPW5Dp+6xhx9bN0iMKQo4i+6GQbDhBdbP96+S0kMl0LZbb` } });

const P4_CONFS = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents'];

async function main() {
  // === Team stats: all stat names ===
  const teamR = await getTeamStats({ query: { year: 2025, conference: 'SEC' } });
  const statNames = [...new Set((teamR.data || []).map(d => d.statName))].sort();
  console.log('ALL team stat names:\n', statNames.join('\n'));

  // === Player stats for one P4 conf – SEC QBs ===
  const pR = await getPlayerSeasonStats({ query: { year: 2025, conference: 'SEC' } });
  const rows = pR.data || [];

  // Group by player+category
  const map = {};
  for (const row of rows) {
    const key = `${row.team}|${row.player}|${row.position}|${row.category}`;
    if (!map[key]) map[key] = { player: row.player, team: row.team, conf: row.conference, position: row.position, category: row.category };
    map[key][row.statType] = row.stat;
  }
  const entries = Object.values(map);

  // Top QBs by passing YDS
  const qbs = entries.filter(e => e.category === 'passing' && e.position === 'QB')
    .sort((a, b) => parseFloat(b.YDS || 0) - parseFloat(a.YDS || 0));
  console.log('\n--- SEC QBs by passing YDS ---');
  qbs.slice(0, 10).forEach(q => console.log(`${q.player} (${q.team}): ${q.YDS} yds, ${q.TD} TDs, ${q.INT} INTs, ${q.CAR} rush att, ${q['rush_yds'] || '?'} rush yds`));

  // Top RBs (rushing)
  const rbs = entries.filter(e => e.category === 'rushing' && (e.position === 'RB' || e.position === 'QB'))
    .sort((a, b) => parseFloat(b.YDS || 0) - parseFloat(a.YDS || 0));
  console.log('\n--- SEC RBs by rushing YDS ---');
  rbs.slice(0, 10).forEach(r => console.log(`${r.player} (${r.team}, ${r.position}): ${r.YDS} yds, ${r.TD} TDs, ${r.CAR} carries`));

  // Top WRs (receiving)
  const wrs = entries.filter(e => e.category === 'receiving' && e.position === 'WR')
    .sort((a, b) => parseFloat(b.YDS || 0) - parseFloat(a.YDS || 0));
  console.log('\n--- SEC WRs by receiving YDS ---');
  wrs.slice(0, 8).forEach(r => console.log(`${r.player} (${r.team}): ${r.YDS} yds, ${r.TD} TDs, ${r.REC} rec`));

  // TEs
  const tes = entries.filter(e => e.category === 'receiving' && e.position === 'TE')
    .sort((a, b) => parseFloat(b.YDS || 0) - parseFloat(a.YDS || 0));
  console.log('\n--- SEC TEs by receiving YDS ---');
  tes.slice(0, 8).forEach(r => console.log(`${r.player} (${r.team}): ${r.YDS} yds, ${r.TD} TDs, ${r.REC} rec`));

  // Kickers
  const ks = entries.filter(e => e.category === 'kicking' && (e.position === 'K' || e.position === 'PK'))
    .sort((a, b) => parseFloat(b.PTS || 0) - parseFloat(a.PTS || 0));
  console.log('\n--- SEC Kickers by PTS ---');
  ks.slice(0, 8).forEach(k => console.log(`${k.player} (${k.team}): ${k.PTS} pts, ${k.FGM}/${k.FGA} FGs, ${k.XPM} XPs`));

  // Team rushing/receiving/def stats for RB/WR/TE/DEF units
  const secTeam = teamR.data || [];
  const secTeamNames = [...new Set(secTeam.map(d => d.team))];
  console.log('\n--- SEC team stat sample (Georgia) ---');
  secTeam.filter(d => d.team === 'Georgia').forEach(d => console.log(`  ${d.statName}: ${d.statValue}`));
}

main().catch(console.error);
