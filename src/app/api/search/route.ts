import { NextRequest, NextResponse } from "next/server";
import { analyzeMatch } from "@/lib/match-analysis";
import {
  getAccountByRiotId,
  getLeagueEntriesByPuuid,
  getMatch,
  getMatchIdsByPuuid,
  getSummonerByPuuid,
  getSummonerByName,
  LeagueEntryDto,
  MatchDto,
  RiotApiError,
  SummonerDto,
} from "@/lib/riot/client";
import { parsePlatform } from "@/lib/riot/routing";

export const dynamic = "force-dynamic";

function parseSearchQuery(raw: string): { kind: "riot"; game: string; tag: string } | { kind: "name"; name: string } {
  const t = raw.trim();
  const hash = t.indexOf("#");
  if (hash > 0) {
    return {
      kind: "riot",
      game: t.slice(0, hash).trim(),
      tag: t.slice(hash + 1).trim(),
    };
  }
  return { kind: "name", name: t };
}

function toRankSummary(entry: LeagueEntryDto | null) {
  if (!entry) return null;
  const total = entry.wins + entry.losses;
  const winRate = total > 0 ? (entry.wins / total) * 100 : 0;
  return {
    queueType: entry.queueType,
    tier: entry.tier,
    rank: entry.rank,
    leaguePoints: entry.leaguePoints,
    wins: entry.wins,
    losses: entry.losses,
    winRate: Math.round(winRate * 10) / 10,
  };
}

function pickRankInfo(entries: LeagueEntryDto[]) {
  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null;
  const flex = entries.find((e) => e.queueType === "RANKED_FLEX_SR") ?? null;
  return {
    solo: toRankSummary(solo),
    flex: toRankSummary(flex),
    primary: toRankSummary(solo ?? flex),
  };
}

function buildRecentStats(matches: MatchDto[], searchedPuuid: string) {
  const mine = matches
    .map((m) => m.info.participants.find((p) => p.puuid === searchedPuuid))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  if (!mine.length) return null;

  const games = mine.length;
  const wins = mine.filter((p) => p.win).length;
  const losses = games - wins;
  const sum = mine.reduce(
    (acc, p) => {
      acc.k += p.kills;
      acc.d += p.deaths;
      acc.a += p.assists;
      const pos = (p.teamPosition || "").toUpperCase() || "NONE";
      acc.positionCount.set(pos, (acc.positionCount.get(pos) ?? 0) + 1);
      const c = acc.championCount.get(p.championName) ?? {
        championName: p.championName,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
      c.games += 1;
      c.wins += p.win ? 1 : 0;
      c.kills += p.kills;
      c.deaths += p.deaths;
      c.assists += p.assists;
      acc.championCount.set(p.championName, c);
      return acc;
    },
    {
      k: 0,
      d: 0,
      a: 0,
      positionCount: new Map<string, number>(),
      championCount: new Map<
        string,
        {
          championName: string;
          games: number;
          wins: number;
          kills: number;
          deaths: number;
          assists: number;
        }
      >(),
    }
  );

  const posOrder = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
  const favoritePositions = posOrder.map((position) => {
    const count = sum.positionCount.get(position) ?? 0;
    const ratio = games > 0 ? (count / games) * 100 : 0;
    return {
      position,
      count,
      ratio: Math.round(ratio * 10) / 10,
    };
  });

  const topChampions = [...sum.championCount.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, 3)
    .map((c) => ({
      championName: c.championName,
      games: c.games,
      wins: c.wins,
      losses: c.games - c.wins,
      avgKills: Math.round((c.kills / c.games) * 10) / 10,
      avgDeaths: Math.round((c.deaths / c.games) * 10) / 10,
      avgAssists: Math.round((c.assists / c.games) * 10) / 10,
    }));

  const winRate = games > 0 ? (wins / games) * 100 : 0;
  return {
    games,
    wins,
    losses,
    winRate: Math.round(winRate * 10) / 10,
    avgKills: Math.round((sum.k / games) * 10) / 10,
    avgDeaths: Math.round((sum.d / games) * 10) / 10,
    avgAssists: Math.round((sum.a / games) * 10) / 10,
    favoritePositions,
    topChampions,
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.RIOT_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "RIOT_API_KEY가 .env.local에 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const name = request.nextUrl.searchParams.get("q") ?? "";
  const platform = parsePlatform(request.nextUrl.searchParams.get("region"));
  const countParam = request.nextUrl.searchParams.get("count");
  const count = Math.min(20, Math.max(1, Number(countParam) || 10));
  const startParam = request.nextUrl.searchParams.get("start");
  const start = Math.max(0, Math.floor(Number(startParam) || 0));

  if (!name.trim()) {
    return NextResponse.json({ error: "소환사 이름 또는 Riot ID를 입력하세요." }, { status: 400 });
  }

  let puuid: string;
  let label: string;
  let summoner: SummonerDto;

  try {
    const parsed = parseSearchQuery(name);
    if (parsed.kind === "riot") {
      if (!parsed.game || !parsed.tag) {
        return NextResponse.json(
          { error: "Riot ID는 게임닉#태그 형식이어야 합니다. (예: Hide on bush#KR1)" },
          { status: 400 }
        );
      }
      const acc = await getAccountByRiotId(apiKey, platform, parsed.game, parsed.tag);
      puuid = acc.puuid;
      label = `${acc.gameName}#${acc.tagLine}`;
      summoner = await getSummonerByPuuid(apiKey, platform, puuid);
    } else {
      const sum = await getSummonerByName(apiKey, platform, parsed.name);
      puuid = sum.puuid;
      label = sum.name;
      summoner = sum;
    }
  } catch (e) {
    if (e instanceof RiotApiError) {
      if (e.status === 404) {
        return NextResponse.json({ error: "소환사를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json(
        { error: e.message, detail: e.riotBody },
        { status: e.status >= 500 ? 502 : e.status }
      );
    }
    throw e;
  }

  let matchIds: string[];
  try {
    matchIds = await getMatchIdsByPuuid(apiKey, platform, puuid, count, start);
  } catch (e) {
    if (e instanceof RiotApiError) {
      return NextResponse.json(
        { error: "매치 목록을 가져오지 못했습니다.", detail: e.riotBody },
        { status: 502 }
      );
    }
    throw e;
  }

  async function fetchRank(): Promise<{ entries: LeagueEntryDto[]; error?: string }> {
    try {
      const entries = await getLeagueEntriesByPuuid(apiKey!, platform, puuid);
      return { entries };
    } catch (e) {
      if (e instanceof RiotApiError) {
        const bodyPreview = e.riotBody ? e.riotBody.slice(0, 120) : "";
        const hint =
          e.status === 403
            ? "랭크 API(league-v4) 호출 권한이 없습니다. Riot Developer Portal에서 League(Leagues) 관련 접근 권한을 확인해 주세요."
            : e.status === 429
              ? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
              : "";
        return {
          entries: [],
          error: `랭크 API 실패 (HTTP ${e.status})${hint ? `: ${hint}` : ""}${bodyPreview ? ` — ${bodyPreview}` : ""}`,
        };
      }
      return { entries: [], error: String(e) };
    }
  }

  if (matchIds.length === 0) {
    const { entries: rankEntries, error: rankError } = await fetchRank();
    return NextResponse.json({
      puuid,
      displayName: label,
      platform,
      profile: {
        summonerLevel: summoner.summonerLevel,
        profileIconId: summoner.profileIconId,
        rank: pickRankInfo(rankEntries),
        rankError: rankError ?? null,
      },
      matches: [],
      message: "최근 전적이 없습니다.",
    });
  }

  const [matchesPayload, rankResult] = await Promise.all([
    Promise.all(
    matchIds.map(async (id) => {
      try {
        const m = await getMatch(apiKey, platform, id);
          return {
            raw: m,
            analyzed: analyzeMatch(m, puuid),
          };
      } catch {
        return null;
      }
    })
    ),
    fetchRank(),
  ]);
  const { entries: rankEntries, error: rankError } = rankResult;

  const valid = matchesPayload.filter((x): x is NonNullable<typeof x> => Boolean(x));
  const matches = valid.map((x) => x.analyzed).filter(Boolean);
  const rawMatches = valid.map((x) => x.raw);
  const recentStats = buildRecentStats(rawMatches, puuid);

  return NextResponse.json({
    puuid,
    displayName: label,
    platform,
    profile: {
      summonerLevel: summoner.summonerLevel,
      profileIconId: summoner.profileIconId,
      rank: pickRankInfo(rankEntries),
      rankError: rankError ?? null,
    },
    recentStats,
    matches,
  });
}
