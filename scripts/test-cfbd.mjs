import { client, getPlayerSeasonStats, getTeamSeasonStats } from 'cfbd';

const KEY = 'a4+OeytlFtQ2E/zGw2cPW5Dp+6xhx9bN0iMKQo4i+6GQbDhBdbP96+S0kMl0LZbb';
client.setConfig({ headers: { Authorization: `Bearer ${KEY}` } });

const passR = await getPlayerSeasonStats({ query: { year: 2025, statType: 'passing' } });
const passData = passR.data || [];

const types = [...new Set(passData.map(d => d.statType))];
console.log('Passing stat types:', types);

const byPlayer = {};
for (const row of passData) {
  if (!byPlayer[row.player]) byPlayer[row.player] = { player: row.player, team: row.team, conference: row.conference };
  byPlayer[row.player][row.statType] = row.stat;
}
const sorted = Object.values(byPlayer).sort((a, b) => parseFloat(b.YDS ?? 0) - parseFloat(a.YDS ?? 0));
console.log('\nTop 10 QBs by passing yards:');
sorted.slice(0, 10).forEach(p => console.log(p));
