-- ============================================================
-- 2025 NCAA Baseball Tournament reseed
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Delete old matchup data for the 2025 baseball contest
--    (Replace the UUID below with your actual contest ID after running the seed)
DO $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM bracket_contests WHERE sport = 'baseball' AND season = 2025 LIMIT 1;
  IF cid IS NOT NULL THEN
    DELETE FROM user_bracket_picks
      WHERE entry_id IN (SELECT id FROM user_bracket_entries WHERE contest_id = cid);
    DELETE FROM user_bracket_entries WHERE contest_id = cid;
    DELETE FROM tournament_matchups  WHERE contest_id = cid;
  END IF;
END $$;

-- 2. Upsert the 2025 contest with full bracket_data (8 regionals)
INSERT INTO bracket_contests (
  name, sport, season, status,
  entry_fee_cents, prize_pool_cents, max_entries, entry_count,
  bracket_data, settings
)
VALUES (
  '2025 NCAA Baseball Tournament',
  'baseball',
  2025,
  'open',
  500,   -- $5 entry
  0,
  500,
  0,
  '{
    "regions": {
      "nashville":   { "name": "Nashville",   "teams": [{"id":"vand",   "name":"Vanderbilt",      "seed":1,"record":"45-12","conference":"SEC"},     {"id":"etsu",   "name":"E. Tennessee St",  "seed":2,"record":"42-15","conference":"SoCon"},   {"id":"wst",   "name":"Wright State",      "seed":3,"record":"36-19","conference":"HL"},      {"id":"lou",    "name":"Louisville",       "seed":4,"record":"39-18","conference":"ACC"}]     },
      "hattiesburg": { "name": "Hattiesburg", "teams": [{"id":"smiss",  "name":"Southern Miss",   "seed":1,"record":"43-14","conference":"Sun Belt"}, {"id":"ala",    "name":"Alabama",           "seed":2,"record":"40-16","conference":"SEC"},     {"id":"col",   "name":"Columbia",          "seed":3,"record":"34-22","conference":"Ivy"},      {"id":"mia",    "name":"Miami (FL)",       "seed":4,"record":"38-20","conference":"ACC"}]     },
      "tallahassee": { "name": "Tallahassee", "teams": [{"id":"fsu",    "name":"Florida State",   "seed":1,"record":"44-14","conference":"ACC"},     {"id":"bcu",    "name":"Bethune-Cookman",   "seed":2,"record":"38-22","conference":"SWAC"},    {"id":"neu",   "name":"Northeastern",      "seed":3,"record":"35-21","conference":"CAA"},      {"id":"miss",   "name":"Mississippi State","seed":4,"record":"37-20","conference":"SEC"}]     },
      "corvallis":   { "name": "Corvallis",   "teams": [{"id":"orst",   "name":"Oregon State",    "seed":1,"record":"42-16","conference":"Pac-12"},  {"id":"tcu",    "name":"TCU",               "seed":2,"record":"40-17","conference":"Big 12"},   {"id":"mich",  "name":"Michigan",          "seed":3,"record":"36-19","conference":"Big Ten"},   {"id":"usc",    "name":"USC",              "seed":4,"record":"35-21","conference":"Pac-12"}]   },
      "austin":      { "name": "Austin",      "teams": [{"id":"tex",    "name":"Texas",           "seed":1,"record":"44-13","conference":"Big 12"},  {"id":"uconn",  "name":"UConn",             "seed":2,"record":"39-18","conference":"Big East"},  {"id":"kst",   "name":"Kansas State",      "seed":3,"record":"35-22","conference":"Big 12"},   {"id":"utsa",   "name":"UTSA",             "seed":4,"record":"33-24","conference":"CUSA"}]     },
      "los_angeles": { "name": "Los Angeles", "teams": [{"id":"ucla",   "name":"UCLA",            "seed":1,"record":"42-15","conference":"Pac-12"},  {"id":"fres",   "name":"Fresno State",      "seed":2,"record":"38-19","conference":"MWC"},      {"id":"asu",   "name":"Arizona State",     "seed":3,"record":"36-20","conference":"Pac-12"},   {"id":"uci",    "name":"UC Irvine",        "seed":4,"record":"34-23","conference":"Big West"}] },
      "oxford":      { "name": "Oxford",      "teams": [{"id":"olemiss","name":"Ole Miss",         "seed":1,"record":"45-12","conference":"SEC"},     {"id":"wku",    "name":"Western Kentucky",  "seed":2,"record":"38-20","conference":"CUSA"},     {"id":"gtech", "name":"Georgia Tech",      "seed":3,"record":"35-21","conference":"ACC"},      {"id":"murr",   "name":"Murray State",     "seed":4,"record":"32-25","conference":"OVC"}]     },
      "athens":      { "name": "Athens",      "teams": [{"id":"uga",    "name":"Georgia",          "seed":1,"record":"44-14","conference":"SEC"},     {"id":"bing",   "name":"Binghamton",        "seed":2,"record":"37-21","conference":"AE"},       {"id":"okst",  "name":"Oklahoma State",    "seed":3,"record":"36-20","conference":"Big 12"},   {"id":"duke",   "name":"Duke",             "seed":4,"record":"34-23","conference":"ACC"}]     }
    },
    "sr_pairings": [
      ["nashville",   "austin"],
      ["hattiesburg", "los_angeles"],
      ["tallahassee", "oxford"],
      ["corvallis",   "athens"]
    ]
  }',
  '{"scoring":{"regional_win":10,"super_regional_win":20,"championship_win":40,"exact_series_bonus":5}}'
)
ON CONFLICT DO NOTHING;

-- 3. Insert Super Regional matchup placeholders (TBD teams — filled once regionals complete)
WITH cid AS (SELECT id FROM bracket_contests WHERE sport='baseball' AND season=2025 LIMIT 1)
INSERT INTO tournament_matchups (contest_id, region, round, matchup_index, team1, team2, status)
SELECT
  cid.id,
  v.region,
  'super_regional',
  v.idx,
  NULL,
  NULL,
  'upcoming'
FROM cid, (VALUES
  ('super_regional_0', 0),  -- Nashville winner vs Austin winner
  ('super_regional_1', 1),  -- Hattiesburg winner vs LA winner
  ('super_regional_2', 2),  -- Tallahassee winner vs Oxford winner
  ('super_regional_3', 3)   -- Corvallis winner vs Athens winner
) AS v(region, idx);

-- 4. Insert CWS Semifinal matchup placeholders
WITH cid AS (SELECT id FROM bracket_contests WHERE sport='baseball' AND season=2025 LIMIT 1)
INSERT INTO tournament_matchups (contest_id, region, round, matchup_index, team1, team2, status)
SELECT
  cid.id,
  v.region,
  'championship',
  v.idx,
  NULL,
  NULL,
  'upcoming'
FROM cid, (VALUES
  ('cws_semi_0', 0),
  ('cws_semi_1', 1),
  ('championship', 2)
) AS v(region, idx);

-- ============================================================
-- After running: note your contest ID from:
-- SELECT id FROM bracket_contests WHERE sport='baseball' AND season=2025;
-- ============================================================
