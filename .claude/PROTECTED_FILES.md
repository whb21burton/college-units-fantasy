# Protected Files — DO NOT DELETE

## Core Data Pipeline (weekly/season leagues)
- `lib/sportsDataService.ts` — CFBD sync write path (CFBD API → Supabase)
- `lib/sportsDataReader.ts` — Supabase read path (cached_stats/cached_scores)
- `lib/cfbd-client.ts` — CFBD Bearer auth client
- `lib/efficiency.ts` — efficiency scoring utility
- `lib/odr.ts` — opponent difficulty rating utility
- `lib/playerPool.ts` — core player pool data model

## Cron Jobs (data sync)
- `app/api/cron/sync-stats/route.ts`
- `app/api/cron/sync-scores/route.ts`
- `app/api/cron/sync-rosters/route.ts`
- `app/api/cron/sync-schedule/route.ts`

## Scoring Routes
- `app/api/calculate-scores/route.ts`
- `app/api/game-stats/route.ts`
- `app/api/matchup-context/route.ts`
- `app/api/unit-stats/route.ts`
- `app/api/schedule/route.ts`
- `app/api/efficiency/route.ts`

## League Pages
- `app/league/[id]/page.tsx` — 4,849 line weekly league hub
- `app/league/[id]/draft/page.tsx`
- `app/league/[id]/lineup/page.tsx`
- `app/league/[id]/mock-draft/page.tsx`

## Wallet/Payment
- `lib/stripe.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/api/wallet/` — entire directory

## Auth/Compliance
- `lib/supabase-browser.ts`
- `lib/supabase-server.ts`
