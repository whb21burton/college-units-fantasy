import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Manually parse .env.local from project root (avoids dotenv dependency)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    // Strip leading/trailing whitespace and inline comments (e.g. "value  # comment")
    let val = trimmed.slice(eqIdx + 1).trim();
    // Remove inline comment: find first unquoted ' #' or '\t#'
    const commentMatch = val.match(/\s+#\s/);
    if (commentMatch && commentMatch.index !== undefined) {
      val = val.slice(0, commentMatch.index).trim();
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

async function main() {
  const supabase = createAdminClient();

  // ── 1. Count of TE players in cached_players ──────────────────────────────
  console.log('\n=== 1. TE player count in cached_players ===');
  const { count: teCount, error: countErr } = await supabase
    .from('cached_players')
    .select('*', { count: 'exact', head: true })
    .eq('position', 'TE');
  if (countErr) console.error('Error:', countErr.message);
  else console.log(`Total TE players: ${teCount}`);

  // ── 2. Sample TE player names and schools ────────────────────────────────
  console.log('\n=== 2. Sample TE players (up to 10) ===');
  const { data: teSample, error: sampleErr } = await supabase
    .from('cached_players')
    .select('school, player_name, season')
    .eq('position', 'TE')
    .limit(10);
  if (sampleErr) console.error('Error:', sampleErr.message);
  else console.table(teSample);

  // ── 3. Check unit_TE rows in cached_stats ─────────────────────────────────
  console.log('\n=== 3. unit_TE rows in cached_stats (up to 10) ===');
  const { data: unitTeRows, error: unitTeErr } = await supabase
    .from('cached_stats')
    .select('school, player_name, stat_type, value, week, season, game_id')
    .eq('stat_type', 'unit_TE')
    .limit(10);
  if (unitTeErr) console.error('Error:', unitTeErr.message);
  else {
    if (!unitTeRows || unitTeRows.length === 0) {
      console.log('No unit_TE rows found in cached_stats.');
    } else {
      console.table(unitTeRows);
    }
  }

  // ── 4. Any stat_type values that look TE-related ──────────────────────────
  console.log('\n=== 4. Distinct stat_types containing "TE" (sample) ===');
  const { data: teStatTypes, error: teStatErr } = await supabase
    .from('cached_stats')
    .select('stat_type')
    .ilike('stat_type', '%TE%')
    .limit(20);
  if (teStatErr) console.error('Error:', teStatErr.message);
  else {
    const unique = [...new Set((teStatTypes ?? []).map((r: any) => r.stat_type))];
    console.log('stat_types containing TE:', unique);
  }

  // ── 5. Receiving stats rows for players who are TE in cached_players ──────
  console.log('\n=== 5. Receiving stats for known TE player names (first 5 TEs) ===');
  const { data: teNames, error: teNamesErr } = await supabase
    .from('cached_players')
    .select('school, player_name')
    .eq('position', 'TE')
    .limit(5);
  if (teNamesErr) {
    console.error('Error fetching TE names:', teNamesErr.message);
  } else if (teNames && teNames.length > 0) {
    for (const te of teNames) {
      const { data: stats, error: statsErr } = await supabase
        .from('cached_stats')
        .select('school, player_name, stat_type, value, week, season')
        .eq('player_name', te.player_name)
        .in('stat_type', ['receiving_yds', 'receiving_rec', 'receiving_td', 'receiving_long'])
        .limit(5);
      if (statsErr) {
        console.error(`Error for ${te.player_name}:`, statsErr.message);
      } else {
        console.log(`\nPlayer: ${te.player_name} (${te.school})`);
        if (!stats || stats.length === 0) {
          console.log('  No receiving stats found.');
        } else {
          console.table(stats);
        }
      }
    }
  }

  // ── 6. posMap key check: sample cached_stats player_name vs cached_players ─
  console.log('\n=== 6. All distinct stat_types in cached_stats (sample 50) ===');
  const { data: allStatTypes, error: astErr } = await supabase
    .from('cached_stats')
    .select('stat_type')
    .limit(200);
  if (astErr) {
    console.error('Error:', astErr.message);
  } else {
    const unique = [...new Set((allStatTypes ?? []).map((r: any) => r.stat_type))].sort();
    console.log('All unique stat_types found:', unique);
  }

  console.log('\n=== 6b. Any stats for Alabama TE players (any stat_type) ===');
  const { data: alabamaTEs } = await supabase
    .from('cached_players')
    .select('player_name')
    .eq('school', 'Alabama')
    .eq('position', 'TE')
    .limit(10);
  if (alabamaTEs && alabamaTEs.length > 0) {
    for (const te of alabamaTEs) {
      const { data: anyStats } = await supabase
        .from('cached_stats')
        .select('school, player_name, stat_type, value, week, season')
        .eq('player_name', te.player_name)
        .limit(5);
      if (anyStats && anyStats.length > 0) {
        console.log(`\nAny stats for ${te.player_name}:`);
        console.table(anyStats);
      } else {
        console.log(`No stats at all for ${te.player_name}`);
      }
    }
  }

  console.log('\n=== 6c. Sample all cached_stats rows (first 20, any type) ===');
  const { data: allRows, error: allErr } = await supabase
    .from('cached_stats')
    .select('school, player_name, stat_type, value, week, season')
    .not('player_name', 'is', null)
    .limit(20);
  if (allErr) console.error('Error:', allErr.message);
  else console.table(allRows);

  console.log('\n=== 6d. Count of rows per stat_type (player-level, not team/unit) ===');
  // Grab a large sample to count non-team, non-unit types
  const { data: typeRows, error: typeErr } = await supabase
    .from('cached_stats')
    .select('stat_type')
    .not('player_name', 'is', null)
    .limit(500);
  if (typeErr) console.error('Error:', typeErr.message);
  else {
    const counts: Record<string, number> = {};
    for (const r of (typeRows ?? [])) {
      counts[r.stat_type] = (counts[r.stat_type] ?? 0) + 1;
    }
    console.log('stat_type counts (player-level rows):', counts);
  }

  // ── 7. Check a specific school — any unit_TE or zero-value rows ───────────
  console.log('\n=== 7. All cached_stats rows with stat_type LIKE "%unit%" (sample 20) ===');
  const { data: unitRows, error: unitErr } = await supabase
    .from('cached_stats')
    .select('school, player_name, stat_type, value, week, season')
    .ilike('stat_type', '%unit%')
    .limit(20);
  if (unitErr) console.error('Error:', unitErr.message);
  else {
    if (!unitRows || unitRows.length === 0) {
      console.log('No rows with stat_type containing "unit" found.');
    } else {
      console.table(unitRows);
    }
  }
}

main().catch(console.error);
