const pkg = require('cfbd');
const { client, getSp, getElo, getRankings, getGames } = pkg;

client.setConfig({ headers: { Authorization: `Bearer a4+OeytlFtQ2E/zGw2cPW5Dp+6xhx9bN0iMKQo4i+6GQbDhBdbP96+S0kMl0LZbb` } });

async function main() {
  // SP+ ratings - includes preseason projections
  const spR = await getSp({ query: { year: 2025 } });
  const spData = spR.data || [];
  console.log('SP+ sample (first 5):');
  spData.slice(0, 5).forEach(t => console.log(t));

  console.log('\nSP+ fields:', spData[0] ? Object.keys(spData[0]) : 'no data');

  // Does SP+ have preseason=true rows?
  const preseason = spData.filter(t => t.rating != null);
  console.log(`\nTotal SP+ rows for 2025: ${spData.length}`);

  // Check SP+ for 2026 (preseason)
  const sp26R = await getSp({ query: { year: 2026 } });
  const sp26 = sp26R.data || [];
  console.log(`\n2026 SP+ rows: ${sp26.length}`);
  if (sp26.length > 0) {
    console.log('2026 SP+ sample:', sp26.slice(0, 3));
  }

  // ELO ratings
  const eloR = await getElo({ query: { year: 2025 } });
  const eloData = eloR.data || [];
  console.log(`\nELO rows for 2025: ${eloData.length}`);
  console.log('ELO fields:', eloData[0] ? Object.keys(eloData[0]) : 'no data');
  console.log('ELO sample:', eloData.slice(0, 3));

  // 2026 schedule - is it published yet?
  const games26R = await getGames({ query: { year: 2026, week: 1 } });
  const games26 = games26R.data || [];
  console.log(`\n2026 Week 1 games available: ${games26.length}`);
  if (games26.length > 0) console.log('Sample game:', games26[0]);
}

main().catch(console.error);
