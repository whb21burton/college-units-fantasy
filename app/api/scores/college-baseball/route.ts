import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date'); // format: YYYYMMDD

  const baseUrl = 'https://site.api.espn.com/apis/site/v2/sports';
  const sport = 'baseball/college-baseball';
  const url = date
    ? `${baseUrl}/${sport}/scoreboard?dates=${date}`
    : `${baseUrl}/${sport}/scoreboard`;

  const res = await fetch(url, { next: { revalidate: 30 } });
  const data = await res.json();

  const games = (data.events ?? []).map((event: any) => {
    const comp = event.competitions[0];
    const home = comp.competitors.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors.find((c: any) => c.homeAway === 'away');
    const status = comp.status.type;

    return {
      id: event.id,
      name: event.shortName,
      date: event.date,
      status: status.state,
      statusText: status.shortDetail,
      period: comp.status.period,
      broadcast: comp.broadcast ?? null,
      home: {
        id: home?.id,
        name: home?.team?.displayName,
        abbrev: home?.team?.abbreviation,
        logo: home?.team?.logo,
        score: home?.score ?? '0',
        rank: home?.curatedRank?.current ?? null,
      },
      away: {
        id: away?.id,
        name: away?.team?.displayName,
        abbrev: away?.team?.abbreviation,
        logo: away?.team?.logo,
        score: away?.score ?? '0',
        rank: away?.curatedRank?.current ?? null,
      },
    };
  });

  return NextResponse.json({ games, count: games.length, date: date ?? 'today' });
}
