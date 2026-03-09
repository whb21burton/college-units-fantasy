const pkg = require('cfbd');
const { client, getPlayerSeasonStats, getTeamStats, getAdvancedSeasonStats } = pkg;

const KEY = 'a4+OeytlFtQ2E/zGw2cPW5Dp+6xhx9bN0iMKQo4i+6GQbDhBdbP96+S0kMl0LZbb';
client.setConfig({ headers: { Authorization: `Bearer ${KEY}` } });

async function main() {
  // --- Passing ---
  const passR = await getPlayerSeasonStats({ query: { year: 2025, statType: 'passing' } });
  const passData = passR.data || [];
  const passTypes = [...new Set(passData.map(d => d.statType))];
  console.log('Passing stat types:', passTypes);

  const qbMap = {};
  for (const row of passData) {
    if (!qbMap[row.player]) qbMap[row.player] = { player: row.player, team: row.team, conf: row.conference };
    qbMap[row.player][row.statType] = row.stat;
  }
  const qbs = Object.values(qbMap).sort((a, b) => parseFloat(b.YDS || 0) - parseFloat(a.YDS || 0));
  console.log('\nTop 10 QBs by passing yards:');
  qbs.slice(0, 10).forEach(p => console.log(p));

  // --- Kicking ---
  const kickR = await getPlayerSeasonStats({ query: { year: 2025, statType: 'kicking' } });
  const kickData = kickR.data || [];
  const kickTypes = [...new Set(kickData.map(d => d.statType))];
  console.log('\nKicking stat types:', kickTypes);

  const kMap = {};
  for (const row of kickData) {
    if (!kMap[row.player]) kMap[row.player] = { player: row.player, team: row.team, conf: row.conference };
    kMap[row.player][row.statType] = row.stat;
  }
  const ks = Object.values(kMap).sort((a, b) => parseFloat(b.PTS || 0) - parseFloat(a.PTS || 0));
  console.log('\nTop 10 Kickers by PTS:');
  ks.slice(0, 10).forEach(p => console.log(p));

  // --- Team stats sample ---
  const teamR = await getTeamStats({ query: { year: 2025, conference: 'SEC' } });
  const teamData = teamR.data || [];
  const statTypes = [...new Set(teamData.map(d => d.statName))];
  console.log('\nTeam stat types (sample):', statTypes.slice(0, 20));
  // Show rushing yards by team
  const rushTeams = teamData.filter(d => d.statName === 'rushingYards').sort((a, b) => parseFloat(b.statValue || 0) - parseFloat(a.statValue || 0));
  console.log('\nSEC teams by rushing yards:');
  rushTeams.slice(0, 8).forEach(t => console.log(t.team, t.statValue));
}

main().catch(console.error);
