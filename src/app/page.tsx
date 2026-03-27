"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { summonerSpellFile } from "@/lib/summonerSpells";

type MatchTimelinePayload = {
  goldDiff: { minute: number; diff: number }[];
};

type PlayerHighlight = {
  puuid: string;
  displayName: string;
  championName: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  teamId: number;
  score: number;
  displayScore: number;
  funTitles: string[];
};

type ParticipantRow = {
  puuid: string;
  displayName: string;
  championName: string;
  championId: number;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  teamId: number;
  win: boolean;
  teamPosition: string;
  damage: number;
  gold: number;
  cs: number;
  wardsPlaced: number;
  wardsKilled: number;
  items: number[];
  score: number;
  rankInTeam: number;
  /** 10명 중 전체 순위 (1~10) — 구버전 응답에는 없을 수 있음 */
  rankOverall?: number;
  displayScore: number;
  funTitles: string[];
  /** 인분(표시): 서버에서 계산된 기여 지표 */
  damagePortion?: number;
  /** 팀 킬 대비 킬관여 % */
  killParticipation?: number;
  participantId?: number;
  summoner1Id?: number;
  summoner2Id?: number;
  primaryPerkId?: number;
  subStyleId?: number;
};

type TeamSideStats = {
  teamId: number;
  kills: number;
  gold: number;
  tower: number;
  dragon: number;
  baron: number;
  herald: number;
};

type LaneRow = {
  position: string;
  blue: ParticipantRow | null;
  red: ParticipantRow | null;
  blueRatio: number;
};

type MatchRow = {
  matchId: string;
  durationSec: number;
  /** 매치 종료 시각(ms) — 시즌 필터용 (구버전 응답에는 없을 수 있음) */
  gameEndTimestamp?: number;
  queueId: number;
  gameMode: string;
  win: boolean;
  carry: PlayerHighlight | null;
  blame: PlayerHighlight | null;
  participants: ParticipantRow[];
  laneRows: LaneRow[];
  teamsSummary?: {
    blue: TeamSideStats;
    red: TeamSideStats;
  };
};

type SearchResponse = {
  puuid?: string;
  displayName?: string;
  platform?: string;
  profile?: {
    summonerLevel: number;
    profileIconId: number;
    rankError?: string | null;
    rank: {
      solo: {
        queueType: string;
        tier: string;
        rank: string;
        leaguePoints: number;
        wins: number;
        losses: number;
        winRate: number;
      } | null;
      flex: {
        queueType: string;
        tier: string;
        rank: string;
        leaguePoints: number;
        wins: number;
        losses: number;
        winRate: number;
      } | null;
      primary: {
        queueType: string;
        tier: string;
        rank: string;
        leaguePoints: number;
        wins: number;
        losses: number;
        winRate: number;
      } | null;
    } | null;
  };
  recentStats?: {
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    favoritePositions: { position: string; count: number; ratio: number }[];
    topChampions: {
      championName: string;
      games: number;
      wins: number;
      losses: number;
      avgKills: number;
      avgDeaths: number;
      avgAssists: number;
    }[];
  } | null;
  matches?: MatchRow[];
  message?: string;
  error?: string;
  detail?: string;
};

/** 검색·더보기 한 번에 가져오는 매치 수 (고정) */
const MATCH_PAGE_SIZE = 10;

const PLATFORMS = [
  { value: "kr", label: "한국 (KR)", short: "KR" },
  { value: "jp1", label: "일본 (JP1)", short: "JP" },
  { value: "na1", label: "북미 (NA1)", short: "NA" },
  { value: "euw1", label: "서유럽 (EUW1)", short: "EUW" },
  { value: "eun1", label: "북동유럽 (EUN1)", short: "EUNE" },
] as const;

const DD_VERSION = "15.5.1";

function spellIconUrl(spellId: number): string | null {
  if (!spellId) return null;
  const file = summonerSpellFile(spellId);
  if (!file) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/spell/${file}.png`;
}

function perkIconUrl(perkId: number): string | null {
  if (!perkId) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/perk/${perkId}.png`;
}

function GoldDiffChart({
  points,
  blueWin,
}: {
  points: { minute: number; diff: number }[];
  blueWin: boolean;
}) {
  if (!points.length) return null;
  // API 값은 (블루 - 레드) 기준이므로, 화면은 (승리 - 패배) 기준으로 변환
  const adjustedPoints = points.map((p) => ({
    minute: p.minute,
    diff: blueWin ? p.diff : -p.diff,
  }));
  const diffs = adjustedPoints.map((p) => p.diff);
  const rawMin = Math.min(...diffs);
  const rawMax = Math.max(...diffs);
  const minD = Math.min(rawMin, 0);
  const maxD = Math.max(rawMax, 0);
  const span = maxD - minD || 1;
  const w = 320;
  const h = 72;
  const pad = 4;
  const toX = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const toY = (d: number) => pad + ((maxD - d) / span) * (h - pad * 2);
  const zeroY = toY(0);

  const fillBlue = "rgba(56, 189, 248, 0.38)";
  const fillRed = "rgba(244, 63, 94, 0.38)";
  const fillPaths: { d: string; fill: string }[] = [];

  const addQuad = (xa: number, ya: number, xb: number, yb: number, fill: string) => {
    fillPaths.push({
      d: `M ${xa.toFixed(1)} ${zeroY.toFixed(1)} L ${xa.toFixed(1)} ${ya.toFixed(1)} L ${xb.toFixed(1)} ${yb.toFixed(1)} L ${xb.toFixed(1)} ${zeroY.toFixed(1)} Z`,
      fill,
    });
  };

  for (let i = 0; i < adjustedPoints.length - 1; i++) {
    const d0 = adjustedPoints[i].diff;
    const d1 = adjustedPoints[i + 1].diff;
    const x0 = toX(i);
    const x1 = toX(i + 1);
    const y0 = toY(d0);
    const y1 = toY(d1);
    if (d0 === 0 && d1 === 0) continue;

    if (d0 >= 0 && d1 >= 0) {
      addQuad(x0, y0, x1, y1, fillBlue);
    } else if (d0 <= 0 && d1 <= 0) {
      addQuad(x0, y0, x1, y1, fillRed);
    } else {
      const dDen = d0 - d1;
      const xi = dDen === 0 ? x0 : x0 + (d0 / dDen) * (x1 - x0);
      if (d0 > 0 && d1 < 0) {
        addQuad(x0, y0, xi, zeroY, fillBlue);
        addQuad(xi, zeroY, x1, y1, fillRed);
      } else {
        addQuad(x0, y0, xi, zeroY, fillRed);
        addQuad(xi, zeroY, x1, y1, fillBlue);
      }
    }
  }

  const lineD = adjustedPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.diff).toFixed(1)}`)
    .join(" ");

  const fmt = (n: number) => {
    const a = Math.abs(Math.round(n));
    if (a >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  };

  const lastMin = adjustedPoints[adjustedPoints.length - 1]?.minute ?? 0;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[280px]">
        <p className="mb-1 text-center text-[10px] font-medium text-zinc-500">골드 차이 (승리 − 패배)</p>
        <div className="mx-auto flex w-[380px] items-start justify-center gap-1.5 sm:gap-2">
          <div className="relative w-[320px] shrink-0">
            <svg width={w} height={h} className="block shrink-0">
              {fillPaths.map((fp, i) => (
                <path key={i} d={fp.d} fill={fp.fill} stroke="none" />
              ))}
              <line
                x1={pad}
                y1={zeroY}
                x2={w - pad}
                y2={zeroY}
                stroke="rgb(113 113 122)"
                strokeOpacity={0.45}
                strokeWidth={1}
              />
              <path
                d={lineD}
                fill="none"
                stroke="rgb(161 161 170)"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div
              className="pointer-events-none absolute left-0 right-0 flex justify-between text-[9px] tabular-nums text-zinc-500"
              style={{ top: `${Math.min(h - 12, zeroY + 2)}px` }}
            >
              <span>0분</span>
              <span>{lastMin.toFixed(0)}분</span>
            </div>
          </div>
          <div className="flex h-[72px] w-11 shrink-0 flex-col justify-between text-left text-[9px] font-mono tabular-nums leading-tight">
            <div className="text-sky-300/95">
              <span className="text-zinc-500">최대</span>
              <p>{fmt(rawMax)}</p>
            </div>
            <div className="text-rose-300/95">
              <span className="text-zinc-500">최소</span>
              <p>{fmt(rawMin)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchTeamsBanner({
  blue,
  red,
  blueWin,
}: {
  blue: TeamSideStats;
  red: TeamSideStats;
  blueWin: boolean;
}) {
  const fmtK = (g: number) => `${(g / 1000).toFixed(1)}k`;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#12161f] px-2 py-2 text-[11px]">
      <div className={`min-w-0 flex-1 ${blueWin ? "text-sky-300" : "text-rose-300/90"}`}>
        <p className="font-bold">{blueWin ? "승리 블루팀" : "패배 블루팀"}</p>
        <p className="mt-0.5 text-zinc-400">
          타워 {blue.tower} · 용 {blue.dragon} · 전령 {blue.herald} · 바론 {blue.baron}
        </p>
        <p className="font-mono text-zinc-200">{fmtK(blue.gold)}</p>
      </div>
      <div className="shrink-0 px-2 text-center">
        <p className="text-lg font-bold tabular-nums text-white">
          {blue.kills} <span className="text-zinc-600">vs</span> {red.kills}
        </p>
      </div>
      <div className={`min-w-0 flex-1 text-right ${!blueWin ? "text-sky-300" : "text-rose-300/90"}`}>
        <p className="font-bold">{!blueWin ? "승리 레드팀" : "패배 레드팀"}</p>
        <p className="mt-0.5 text-zinc-400">
          타워 {red.tower} · 용 {red.dragon} · 전령 {red.herald} · 바론 {red.baron}
        </p>
        <p className="font-mono text-zinc-200">{fmtK(red.gold)}</p>
      </div>
    </div>
  );
}

function SpellPerkMini({
  summoner1Id,
  summoner2Id,
}: {
  summoner1Id?: number;
  summoner2Id?: number;
}) {
  const s1 = summoner1Id ? spellIconUrl(summoner1Id) : null;
  const s2 = summoner2Id ? spellIconUrl(summoner2Id) : null;
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <div className="flex gap-0.5">
        {s1 ? (
          <div className="relative h-4 w-4 overflow-hidden rounded border border-zinc-600/60 bg-zinc-900">
            <Image src={s1} alt="" width={16} height={16} className="object-cover" unoptimized />
          </div>
        ) : null}
        {s2 ? (
          <div className="relative h-4 w-4 overflow-hidden rounded border border-zinc-600/60 bg-zinc-900">
            <Image src={s2} alt="" width={16} height={16} className="object-cover" unoptimized />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const LANE_KO: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서폿",
};

const LANE_SHORT: Record<string, string> = {
  TOP: "TOP",
  MIDDLE: "MID",
  JUNGLE: "JUG",
  BOTTOM: "AD",
  UTILITY: "SUB",
};

function LanePositionTag({ position }: { position: string }) {
  const p = position.toUpperCase();
  const label = LANE_KO[p] ?? p;
  const short = LANE_SHORT[p] ?? p;

  return (
    <span
      className="inline-flex h-5 min-w-8 items-center justify-center rounded border border-zinc-600/50 bg-zinc-900/80 px-1 font-mono text-[10px] font-semibold tracking-wide text-zinc-200"
      title={label}
    >
      {short}
    </span>
  );
}

function champIconSrc(championName: string) {
  const safe = championName.replace(/['\s]/g, "");
  return `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/champion/${safe}.png`;
}

function itemIconSrc(itemId: number) {
  if (itemId <= 0) return "";
  return `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/item/${itemId}.png`;
}

function profileIconSrc(iconId: number) {
  return `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/profileicon/${iconId}.png`;
}

function specialRankLabel(
  rankOverall: number | undefined,
  rankInTeam: number | undefined,
  win: boolean
): "MVP" | "범인" | null {
  if (rankInTeam == null && rankOverall == null) return null;
  if (win && rankInTeam === 1) return "MVP";
  if (!win && rankInTeam === 5) return "범인";
  return null;
}

function displayRankLabel(
  rankOverall: number | undefined,
  rankInTeam: number | undefined,
  win: boolean
): string {
  const special = specialRankLabel(rankOverall, rankInTeam, win);
  if (special) return special;
  return `${rankOverall ?? "—"}등`;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatMatchDate(ts?: number): string {
  if (ts == null || ts <= 0) return "—";
  const d = new Date(ts);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${mo}/${day}`;
}

function normalizeLaneKey(raw: string): string {
  const u = (raw || "").toUpperCase();
  if (u === "MID" || u === "NONE") return "MIDDLE";
  return u;
}

function laneRatioLabelForPlayer(m: MatchRow, searched: ParticipantRow): string {
  const pos = normalizeLaneKey(searched.teamPosition);
  const lane = m.laneRows.find((l) => l.position === pos);
  if (!lane) return "—";
  const isBlue = searched.teamId === 100;
  const r = isBlue ? lane.blueRatio : 1 - lane.blueRatio;
  const a = Math.max(0, Math.min(10, Math.round(r * 10)));
  const b = 10 - a;
  return `${a}:${b}`;
}

function teamLuckLabel(searched: ParticipantRow): string {
  const r = searched.rankOverall ?? 10;
  if (searched.win) {
    if (r <= 3) return "좋음";
    if (r >= 7) return "보통";
    return "보통";
  }
  if (r >= 7) return "나쁨";
  if (r <= 4) return "보통";
  return "나쁨";
}

function kdaRatioOne(k: number, d: number, a: number): string {
  if (d === 0) return (k + a).toFixed(2);
  return ((k + a) / d).toFixed(2);
}

function toPositionShort(position?: string) {
  if (!position) return "—";
  const key = position.toUpperCase();
  return LANE_SHORT[key] ?? key;
}

function queueIdLabel(queueId: number) {
  if (queueId === 420) return "솔로랭크";
  if (queueId === 440) return "자유랭크";
  return null;
}

function normalizePositionForStats(raw?: string) {
  const p = (raw || "").toUpperCase().trim();
  if (!p) return "NONE";
  if (p === "MID") return "MIDDLE";
  return p;
}

function computeRecentStatsClient(
  matches: MatchRow[],
  searchedPuuid: string | undefined
): SearchResponse["recentStats"] {
  if (!searchedPuuid) return null;
  const mine = matches
    .map((m) => m.participants.find((p) => p.puuid === searchedPuuid))
    .filter((p): p is ParticipantRow => Boolean(p));

  if (!mine.length) return null;

  const games = mine.length;
  const wins = mine.filter((p) => p.win).length;
  const losses = games - wins;
  const sumKills = mine.reduce((s, p) => s + p.kills, 0);
  const sumDeaths = mine.reduce((s, p) => s + p.deaths, 0);
  const sumAssists = mine.reduce((s, p) => s + p.assists, 0);
  const winRate = Math.round(((wins / games) * 100) * 10) / 10;

  const posOrder = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
  const posCount = new Map<string, number>();
  for (const p of mine) {
    const pos = normalizePositionForStats(p.teamPosition);
    posCount.set(pos, (posCount.get(pos) ?? 0) + 1);
  }

  const favoritePositions = posOrder.map((position) => {
    const count = posCount.get(position) ?? 0;
    const ratio = games > 0 ? (count / games) * 100 : 0;
    return {
      position,
      count,
      ratio: Math.round(ratio * 10) / 10,
    };
  });

  const champMap = new Map<
    string,
    { championName: string; games: number; wins: number; kills: number; deaths: number; assists: number }
  >();
  for (const p of mine) {
    const k = p.championName;
    const cur =
      champMap.get(k) ?? {
        championName: k,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
    cur.games += 1;
    cur.wins += p.win ? 1 : 0;
    cur.kills += p.kills;
    cur.deaths += p.deaths;
    cur.assists += p.assists;
    champMap.set(k, cur);
  }

  const topChampions = [...champMap.values()]
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

  return {
    games,
    wins,
    losses,
    winRate,
    avgKills: Math.round((sumKills / games) * 10) / 10,
    avgDeaths: Math.round((sumDeaths / games) * 10) / 10,
    avgAssists: Math.round((sumAssists / games) * 10) / 10,
    favoritePositions,
    topChampions,
  };
}

function formatTier(tier?: string) {
  if (!tier) return "Unranked";
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function rankEmblemSrc(tier?: string) {
  const t = (tier || "").toLowerCase();
  if (!t) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${t}.png`;
}

type RankEntryRow = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  winRate: number;
};

/** 티어 문양이 보이는 박스 한 변 길이 (원하는 크기로 조절) */
const RANK_EMBLEM_PX = 150;
/** CD 엠블럼 PNG는 캔버스 여백이 커서, 박스 안에서 확대해 문양이 꽉 차게 */
const RANK_EMBLEM_FILL_SCALE = 2;

/** 프로필 카드 오른쪽 랭크 영역 */
const RANK_COLUMN_CLASS =
  "flex w-full max-w-[min(100%,380px)] flex-col rounded-lg border border-white/10 bg-[#101521] p-2 sm:p-2.5 lg:w-[340px] lg:shrink-0";

function RankSinglePanel({ entry }: { entry: RankEntryRow | null }) {
  const panelShell =
    "flex w-full rounded-lg border border-white/10 bg-[#0d1118] px-2 py-2 sm:px-2.5";

  if (!entry) {
    return (
      <div className={`${panelShell} items-center justify-center py-4`}>
        <span className="text-base font-semibold text-zinc-400">Unranked</span>
      </div>
    );
  }
  const emblem = rankEmblemSrc(entry.tier);
  return (
    <div className={panelShell}>
      <div className="flex min-w-0 flex-row items-center gap-3 sm:gap-4">
        {emblem ? (
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ width: RANK_EMBLEM_PX, height: RANK_EMBLEM_PX }}
          >
            <Image
              src={emblem}
              alt=""
              fill
              className="origin-center object-cover object-center"
              style={{ transform: `scale(${RANK_EMBLEM_FILL_SCALE})` }}
              sizes={`${RANK_EMBLEM_PX}px`}
              unoptimized
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 text-right">
          <p className="text-lg font-bold leading-tight text-sky-300 sm:text-xl">
            {formatTier(entry.tier)} {entry.rank}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 sm:text-sm">{entry.leaguePoints} LP</p>
          <p className="mt-1 text-[11px] text-zinc-300 sm:text-xs">
            승률 {entry.winRate.toFixed(0)}% ({entry.wins}승 {entry.losses}패)
          </p>
        </div>
      </div>
    </div>
  );
}

function LaneContribBar({ ratio, position }: { ratio: number; position: string }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-center">
        <LanePositionTag position={position} />
      </div>
      <div className="mb-0.5 text-center text-[9px] font-medium text-zinc-500">라인전</div>
      <div className="rounded-full border border-zinc-600/50 bg-[#0a0c10] p-px shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
          <div className="bg-gradient-to-b from-sky-400 to-sky-700" style={{ width: `${pct}%` }} />
          <div className="bg-gradient-to-b from-rose-400 to-rose-800" style={{ width: `${100 - pct}%` }} />
        </div>
      </div>
      <div className="mt-0.5 text-center font-mono text-[8px] tabular-nums text-zinc-600">
        {pct.toFixed(0)}:{(100 - pct).toFixed(0)}
      </div>
    </div>
  );
}

function PersonalDamageBar({
  damage,
  maxTeamDamage,
  accent,
  align = "edge",
}: {
  damage: number;
  maxTeamDamage: number;
  accent: "blue" | "red";
  /** edge: 팀 방향(블루 왼쪽·레드 오른쪽), center: 컬럼 가운데 정렬 */
  align?: "edge" | "center";
}) {
  const pct = maxTeamDamage > 0 ? Math.min(100, (damage / maxTeamDamage) * 100) : 0;
  const fill =
    accent === "blue"
      ? "bg-gradient-to-r from-sky-600/90 to-sky-400"
      : align === "center"
        ? "bg-gradient-to-r from-rose-600/90 to-rose-400"
        : "bg-gradient-to-l from-rose-600/90 to-rose-400";
  const centered = align === "center";
  return (
    <div className={`w-full min-w-0 max-w-[4.25rem] ${centered ? "mx-auto" : ""}`}>
      <div
        className={`mb-px flex gap-1 whitespace-nowrap text-[9px] ${
          centered ? "justify-center" : "justify-between"
        } ${accent === "blue" ? "text-sky-500/80" : "text-rose-500/80"}`}
      >
        <span>딜</span>
        <span
          className={`font-mono tabular-nums ${accent === "blue" ? "text-sky-200" : "text-rose-200"}`}
        >
          {damage.toLocaleString()}
        </span>
      </div>
      <div
        className={`rounded border border-zinc-600/50 bg-zinc-950/90 p-px shadow-inner ${
          centered ? "text-center" : accent === "blue" ? "text-left" : "text-right"
        }`}
      >
        <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-900">
          <div className={`h-full rounded-sm ${fill}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function ItemStrip({ items }: { items: number[] }) {
  const main = items.slice(0, 6);
  const trinket = items[6] ?? 0;
  return (
    <div className="flex shrink-0 flex-col gap-px">
      <div className="grid grid-cols-3 gap-px">
        {main.map((id, i) => (
          <div
            key={i}
            className="relative h-6 w-6 overflow-hidden rounded border border-zinc-700/80 bg-[#1a1d24]"
          >
            {id > 0 ? (
              <Image
                src={itemIconSrc(id)}
                alt=""
                width={24}
                height={24}
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        <div className="h-6 w-6 overflow-hidden rounded border border-zinc-700/80 bg-[#1a1d24]">
          {trinket > 0 ? (
            <Image
              src={itemIconSrc(trinket)}
              alt=""
              width={24}
              height={24}
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChampIcon({ championName }: { championName: string }) {
  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-white/12">
      <Image
        src={champIconSrc(championName)}
        alt=""
        fill
        className="object-cover object-center"
        sizes="40px"
        unoptimized
      />
    </div>
  );
}

function OpGgLanePlayer({
  player,
  side,
  maxTeamDamage,
  durationSec,
  onSummonerClick,
}: {
  player: ParticipantRow;
  side: "blue" | "red";
  maxTeamDamage: number;
  durationSec: number;
  onSummonerClick?: (displayName: string) => void;
}) {
  const kdaRatio =
    player.deaths === 0
      ? (player.kills + player.assists).toFixed(2)
      : ((player.kills + player.assists) / player.deaths).toFixed(2);
  const cpm = durationSec > 0 ? (player.cs / (durationSec / 60)).toFixed(1) : "0.0";
  const isBlue = side === "blue";
  const winAccent: "blue" | "red" = player.win ? "blue" : "red";

  const teamText = player.win ? "text-sky-200" : "text-rose-200";
  const teamMuted = player.win ? "text-sky-400/90" : "text-rose-400/90";
  const teamLink = player.win
    ? "text-sky-300 underline decoration-sky-500/50 underline-offset-2 hover:text-sky-200"
    : "text-rose-300 underline decoration-rose-500/50 underline-offset-2 hover:text-rose-200";

  const statsBlock = (
    <div className="flex min-w-0 w-full flex-col items-center gap-0.5 text-center">
      <div className={`space-y-px font-mono text-[10px] leading-tight ${teamText}`}>
        <div className="whitespace-nowrap">
          {player.kills}/{player.deaths}/{player.assists} ({kdaRatio})
        </div>
        <div className={`whitespace-nowrap ${teamMuted}`}>
          CS {player.cs} ({cpm}/m)
        </div>
      </div>
      <PersonalDamageBar damage={player.damage} maxTeamDamage={maxTeamDamage} accent={winAccent} align="center" />
      <div className={`whitespace-nowrap font-mono text-[9px] ${player.win ? "text-sky-500/80" : "text-rose-500/80"}`}>
        와드 {player.wardsPlaced}/{player.wardsKilled}
      </div>
    </div>
  );

  const summonerBlock = (
    <div className={`flex min-w-0 w-full max-w-full flex-col gap-0.5 ${isBlue ? "items-start" : "items-end"}`}>
      <div className={`flex min-w-0 items-center gap-0.5 ${isBlue ? "flex-row" : "flex-row"}`}>
        {isBlue ? (
          <SpellPerkMini
            summoner1Id={player.summoner1Id}
            summoner2Id={player.summoner2Id}
          />
        ) : null}
        <div className={`relative shrink-0 ${isBlue ? "" : "ml-auto"}`}>
          <ChampIcon championName={player.championName} />
          <span
            className={`absolute -bottom-0.5 ${isBlue ? "-right-0.5" : "-left-0.5"} rounded border border-zinc-600 bg-zinc-900 px-0.5 font-mono text-[9px] text-zinc-300`}
          >
            {player.champLevel || "—"}
          </span>
        </div>
        {!isBlue ? (
          <SpellPerkMini
            summoner1Id={player.summoner1Id}
            summoner2Id={player.summoner2Id}
          />
        ) : null}
      </div>
      {onSummonerClick ? (
        <button
          type="button"
          onClick={() => onSummonerClick(player.displayName)}
          title={player.displayName}
          className={`block w-full min-w-0 truncate text-[10px] ${teamLink} ${isBlue ? "text-left" : "text-right"}`}
        >
          {player.displayName}
        </button>
      ) : (
        <p className={`block w-full min-w-0 truncate text-[10px] ${teamText} ${isBlue ? "text-left" : "text-right"}`}>
          {player.displayName}
        </p>
      )}
    </div>
  );

  const rankColumn = (
    <div className="flex min-w-0 w-full flex-col items-center justify-center gap-0.5 text-center">
      {(() => {
        const special = specialRankLabel(player.rankOverall, player.rankInTeam, player.win);
        const cls = special
          ? special === "MVP"
            ? "border-amber-400/80 bg-amber-500/20 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.22)]"
            : "border-rose-400/90 bg-rose-600/25 text-rose-100 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.25)]"
          : player.win
            ? "border-sky-600/35 text-sky-200"
            : "border-rose-600/35 text-rose-200";
        return (
      <span
        className={`whitespace-nowrap rounded border px-1.5 py-px font-mono text-[10px] leading-tight ${cls}`}
      >
        {displayRankLabel(player.rankOverall, player.rankInTeam, player.win)}
      </span>
        );
      })()}
      <span
        className={`whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums ${
          player.win ? "text-sky-200" : "text-rose-200"
        }`}
      >
        인분 {(player.damagePortion ?? 0).toFixed(2)}
      </span>
    </div>
  );

  const bottomTitles =
    player.funTitles.length > 0 ? (
      <div
        className={`mt-1.5 flex min-w-0 flex-wrap gap-1 border-t border-white/5 pt-1.5 ${
          isBlue ? "justify-start" : "justify-end"
        }`}
      >
        {player.funTitles.map((t) => (
          <span
            key={t}
            className={`rounded border px-1.5 py-px text-[9px] leading-tight ${
              player.win
                ? "border-sky-500/35 bg-sky-950/40 text-sky-100"
                : "border-rose-500/35 bg-rose-950/40 text-rose-100"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    ) : null;

  const cellBg = player.win
    ? "border-sky-500/30 bg-sky-950/60 shadow-[inset_0_1px_0_rgba(56,189,248,0.12)]"
    : "border-rose-500/30 bg-rose-950/60 shadow-[inset_0_1px_0_rgba(244,63,94,0.12)]";

  return (
    <div className={`min-w-0 rounded-md border px-2 py-1.5 ${cellBg}`}>
      <div
        className={`grid min-h-0 w-full items-center gap-x-1.5 gap-y-0.5 ${
          isBlue
            ? "grid-cols-[minmax(0,4.25rem)_minmax(0,1fr)_minmax(0,4.5rem)_minmax(0,7rem)]"
            : "grid-cols-[minmax(0,7rem)_minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,4.25rem)]"
        }`}
      >
        {isBlue ? (
          <>
            <ItemStrip items={player.items} />
            {statsBlock}
            {summonerBlock}
            {rankColumn}
          </>
        ) : (
          <>
            {rankColumn}
            {summonerBlock}
            {statsBlock}
            <ItemStrip items={player.items} />
          </>
        )}
      </div>
      {bottomTitles}
    </div>
  );
}

function teamsSummaryFromMatch(m: MatchRow): { blue: TeamSideStats; red: TeamSideStats } {
  if (m.teamsSummary) return m.teamsSummary;
  const b = m.participants.filter((p) => p.teamId === 100);
  const r = m.participants.filter((p) => p.teamId === 200);
  const agg = (parts: ParticipantRow[], teamId: number): TeamSideStats => ({
    teamId,
    kills: parts.reduce((s, p) => s + p.kills, 0),
    gold: parts.reduce((s, p) => s + p.gold, 0),
    tower: 0,
    dragon: 0,
    baron: 0,
    herald: 0,
  });
  return { blue: agg(b, 100), red: agg(r, 200) };
}

function MatchLaneDetailHeaders() {
  const baseHead = "text-center text-[10px] font-medium text-zinc-500";
  const rankHead = "text-center text-[11px] font-semibold text-zinc-400";
  return (
    <div className="mb-2 hidden flex-row items-stretch lg:flex">
      <div className="min-w-0 flex-1 border-r border-white/5 pr-2">
        <div className="grid w-full grid-cols-[minmax(0,4.25rem)_minmax(0,1fr)_minmax(0,4.5rem)_minmax(0,7rem)] gap-x-1.5 px-2">
          <div className={baseHead}>아이템</div>
          <div className={baseHead}>KDA · CS · 딜</div>
          <div className={baseHead}>챔프 · 스펠</div>
          <div className={rankHead}>순위 · 인분</div>
        </div>
      </div>
      <div className="w-24 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 border-l border-white/5 pl-2">
        <div className="grid w-full grid-cols-[minmax(0,7rem)_minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,4.25rem)] gap-x-1.5 px-2">
          <div className={rankHead}>순위 · 인분</div>
          <div className={baseHead}>챔프 · 스펠</div>
          <div className={baseHead}>KDA · CS · 딜</div>
          <div className={baseHead}>아이템</div>
        </div>
      </div>
    </div>
  );
}

function MatchLaneBlock({
  lane,
  maxBlueDmg,
  maxRedDmg,
  durationSec,
  onSummonerClick,
}: {
  lane: LaneRow;
  maxBlueDmg: number;
  maxRedDmg: number;
  durationSec: number;
  onSummonerClick?: (displayName: string) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-700/35 bg-gradient-to-b from-[#151a22] to-[#0d1016] px-2 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="min-w-0 flex-1 border-b border-white/5 pb-2 lg:border-b-0 lg:border-r lg:border-white/5 lg:pb-0 lg:pr-2">
          {lane.blue ? (
            <OpGgLanePlayer
              player={lane.blue}
              side="blue"
              maxTeamDamage={maxBlueDmg}
              durationSec={durationSec}
              onSummonerClick={onSummonerClick}
            />
          ) : (
            <p className="text-xs text-zinc-600">—</p>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-col justify-center px-1 lg:w-24 lg:px-1">
          <LaneContribBar ratio={lane.blueRatio} position={lane.position} />
        </div>
        <div className="min-w-0 flex-1 border-t border-white/5 pt-2 lg:border-l lg:border-t-0 lg:border-white/5 lg:pl-2 lg:pt-0">
          {lane.red ? (
            <OpGgLanePlayer
              player={lane.red}
              side="red"
              maxTeamDamage={maxRedDmg}
              durationSec={durationSec}
              onSummonerClick={onSummonerClick}
            />
          ) : (
            <p className="text-xs text-zinc-600">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummonerSearchBar({
  q,
  onQChange,
  region,
  onRegionChange,
  loading,
  onSearch,
  size = "hero",
}: {
  q: string;
  onQChange: (v: string) => void;
  region: string;
  onRegionChange: (v: string) => void;
  loading: boolean;
  onSearch: () => void;
  size?: "hero" | "compact";
}) {
  const hero = size === "hero";
  return (
    <div
      className={`flex w-full max-w-full overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.35)] ring-1 ring-black/5 ${
        hero ? "min-h-[3.25rem] sm:min-h-[3.5rem]" : "min-h-11"
      }`}
    >
      <div className="relative flex shrink-0 items-stretch border-r border-zinc-200/60">
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          aria-label="서버"
          className={`h-full cursor-pointer appearance-none border-0 bg-transparent font-semibold text-zinc-900 outline-none ring-0 transition hover:bg-zinc-50/80 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
            hero ? "min-w-[4.5rem] pl-4 pr-9 text-sm" : "min-w-[4rem] pl-3 pr-8 text-xs"
          }`}
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.short}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => onQChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        placeholder="소환사명 또는 Hide on bush#KR1"
        autoComplete="off"
        enterKeyHint="search"
        className={`min-w-0 flex-1 border-0 bg-transparent text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
          hero ? "px-4 text-base" : "px-3 text-sm"
        }`}
      />
      <button
        type="button"
        onClick={onSearch}
        disabled={loading}
        className={`flex shrink-0 items-center justify-center text-zinc-800 outline-none transition hover:bg-zinc-100 focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 ${
          hero ? "pl-2 pr-4" : "pl-1 pr-3"
        }`}
        aria-label={loading ? "검색 중" : "검색"}
      >
        {loading ? (
          <span
            className={`inline-block animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 ${
              hero ? "h-5 w-5" : "h-4 w-4"
            }`}
          />
        ) : (
          <svg
            className={hero ? "h-6 w-6" : "h-5 w-5"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Home() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("kr");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());
  const [historyTab, setHistoryTab] = useState<"ALL" | "SOLO" | "FLEX">("ALL");
  const [loadedCount, setLoadedCount] = useState(MATCH_PAGE_SIZE);
  const [rankQueueTab, setRankQueueTab] = useState<"SOLO" | "FLEX">("SOLO");
  const [timelineByMatch, setTimelineByMatch] = useState<
    Record<string, MatchTimelinePayload | "loading" | "error">
  >({});

  const fetchMatchTimeline = useCallback(
    async (matchId: string) => {
      setTimelineByMatch((prev) => {
        const cur = prev[matchId];
        if (cur && typeof cur === "object" && "goldDiff" in cur) return prev;
        if (cur === "loading") return prev;
        return { ...prev, [matchId]: "loading" };
      });
      try {
        const res = await fetch(
          `/api/match-timeline?matchId=${encodeURIComponent(matchId)}&region=${encodeURIComponent(region)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          goldDiff?: { minute: number; diff: number }[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "타임라인을 불러오지 못했습니다.");
        setTimelineByMatch((prev) => ({
          ...prev,
          [matchId]: {
            goldDiff: json.goldDiff ?? [],
          },
        }));
      } catch {
        setTimelineByMatch((prev) => ({
          ...prev,
          [matchId]: "error",
        }));
      }
    },
    [region]
  );

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setRankQueueTab("SOLO");
  }, [data?.puuid]);

  const refreshCooldownMs = 120000;
  const remainingRefreshSec = Math.max(0, Math.ceil((lastRefreshAt + refreshCooldownMs - nowTs) / 1000));
  const canRefresh = remainingRefreshSec <= 0;

  const runSearch = useCallback(
    async (nextQ?: string, forceRefresh = false) => {
      const query = (nextQ !== undefined ? nextQ : q).trim();
      if (!query) return;
      if (forceRefresh && !canRefresh) return;
      if (nextQ !== undefined) setQ(nextQ);
      if (forceRefresh) setLastRefreshAt(Date.now());
      setLoadedCount(MATCH_PAGE_SIZE);
      setLoading(true);
      if (!data?.displayName) {
        setData(null);
      }
      try {
        const params = new URLSearchParams({
          q: query,
          region,
          count: String(MATCH_PAGE_SIZE),
        });
        if (forceRefresh) {
          params.set("_ts", String(Date.now()));
        }
        const res = await fetch(`/api/search?${params}`, { cache: "no-store" });
        const json = (await res.json()) as SearchResponse;
        setData(json);
      } catch {
        setData({ error: "요청에 실패했습니다.", matches: [] });
      } finally {
        setLoading(false);
      }
    },
    [canRefresh, q, region, data]
  );

  const matchesForTab = useMemo(() => {
    const ms = data?.matches ?? [];
    if (historyTab === "ALL") return ms;
    if (historyTab === "SOLO") return ms.filter((m) => m.queueId === 420);
    return ms.filter((m) => m.queueId === 440);
  }, [data?.matches, historyTab]);

  const recentStatsForTab = useMemo(
    () => computeRecentStatsClient(matchesForTab, data?.puuid),
    [matchesForTab, data?.puuid]
  );

  const goHome = useCallback(() => {
    setData(null);
    setQ("");
    setLoading(false);
    setLoadedCount(MATCH_PAGE_SIZE);
    setTimelineByMatch({});
    setHistoryTab("ALL");
    setRankQueueTab("SOLO");
    setLastRefreshAt(0);
  }, []);

  const onHomeLinkClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      goHome();
    },
    [goHome]
  );

  const hasProfile = Boolean(data?.displayName);
  const searchBarProps = {
    q,
    onQChange: setQ,
    region,
    onRegionChange: setRegion,
    loading,
    onSearch: () => runSearch(),
  } as const;

  return (
    <div className="flex min-h-screen flex-col bg-[#1c1c1f] text-zinc-100">
      {!hasProfile ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-10 sm:pb-24 sm:pt-16">
          <div className="w-full max-w-[min(100%,28rem)] space-y-8 text-center">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                <Link
                  href="/"
                  onClick={onHomeLinkClick}
                  className="rounded-sm outline-none ring-0 transition hover:text-zinc-200 focus:outline-none focus-visible:outline-none"
                >
                  MD.GG
                </Link>
              </h1>
              <p className="text-sm leading-relaxed text-zinc-400 sm:text-[15px]">
                남탓을 하고 싶으신가요? 검색을 시작해보세요.
              </p>
            </div>
            <SummonerSearchBar {...searchBarProps} size="hero" />
            {data?.error && (
              <div className="rounded-xl border border-red-500/35 bg-red-950/50 px-4 py-3 text-left text-sm text-red-100 shadow-lg">
                {data.error}
                {data.detail && (
                  <pre className="mt-2 max-h-32 overflow-auto text-xs text-red-300/85">{data.detail}</pre>
                )}
              </div>
            )}
            {data?.message && !data.error && (
              <p className="text-sm text-zinc-400">{data.message}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <header className="sticky top-0 z-30 border-b border-white/10 bg-[#121826]/95 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
              <Link
                href="/"
                onClick={onHomeLinkClick}
                className="shrink-0 rounded-sm text-base font-bold tracking-tight text-white outline-none ring-0 transition hover:text-zinc-200 focus:outline-none focus-visible:outline-none sm:text-lg"
              >
                MD.GG
              </Link>
              <div className="min-w-0 flex-1">
                <SummonerSearchBar {...searchBarProps} size="compact" />
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 bg-[#0b0e13] px-3 py-4 sm:px-4">
            {data?.error && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {data.error}
                {data.detail && (
                  <pre className="mt-2 max-h-32 overflow-auto text-xs text-red-300/80">{data.detail}</pre>
                )}
              </div>
            )}

            {data?.message && !data.error && <p className="text-sm text-zinc-400">{data.message}</p>}

        {data && !data.error && data.displayName && (
          <div className="mb-3 rounded-lg border border-white/10 bg-[#151925] p-3 sm:p-4">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 sm:h-24 sm:w-24">
                  {data.profile?.profileIconId ? (
                    <Image
                      src={profileIconSrc(data.profile.profileIconId)}
                      alt=""
                      fill
                      className="object-cover object-center"
                      sizes="96px"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
                  <p className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">{data.displayName}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 sm:text-sm">
                    <span className="uppercase">{data.platform}</span>
                    <span>레벨 {data.profile?.summonerLevel ?? "—"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => runSearch(undefined, true)}
                    disabled={loading || !q.trim() || !canRefresh}
                    className="mt-0.5 w-fit min-h-9 min-w-[6.5rem] rounded-md border border-white/20 bg-zinc-900/80 px-4 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {canRefresh ? "갱신" : `갱신 ${remainingRefreshSec}s`}
                  </button>
                </div>
              </div>

              <div className="flex min-w-0 shrink-0 justify-end lg:justify-end">
                {data.profile?.rankError ? (
                  <div className={RANK_COLUMN_CLASS}>
                    <div className="px-1 py-2 text-center">
                      <p className="text-[11px] text-zinc-500">랭크</p>
                      <p className="mt-1 break-all text-[11px] font-mono text-rose-300">{data.profile.rankError}</p>
                    </div>
                  </div>
                ) : (
                  <div className={RANK_COLUMN_CLASS}>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-[12px] sm:text-[13px]">
                        <div className="flex items-center gap-2 font-medium">
                          <button
                            type="button"
                            onClick={() => setRankQueueTab("SOLO")}
                            className={
                              rankQueueTab === "SOLO"
                                ? "text-white"
                                : "text-zinc-500 transition hover:text-zinc-300"
                            }
                          >
                            솔로랭크
                          </button>
                          <span className="text-zinc-600">|</span>
                          <button
                            type="button"
                            onClick={() => setRankQueueTab("FLEX")}
                            className={
                              rankQueueTab === "FLEX"
                                ? "text-white"
                                : "text-zinc-500 transition hover:text-zinc-300"
                            }
                          >
                            자유랭크
                          </button>
                        </div>
                      </div>
                      <RankSinglePanel
                        entry={
                          data.profile?.rank?.primary
                            ? rankQueueTab === "SOLO"
                              ? data.profile.rank.solo
                              : data.profile.rank.flex
                            : null
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {data && !data.error && data.matches && data.matches.length > 0 && (
          recentStatsForTab ? (
            <section className="mb-3 rounded-lg border border-white/10 bg-[#161a27] p-3">
              <h2 className="mb-2 text-sm font-semibold text-zinc-200">최근 게임 통계</h2>
              <div className="grid gap-3 lg:grid-cols-[1.1fr_1.4fr_1fr]">
                <div className="rounded border border-white/10 bg-[#101522] p-2">
                  <p className="text-xs text-zinc-500">
                    {recentStatsForTab.games}전 {recentStatsForTab.wins}승 {recentStatsForTab.losses}패
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="relative h-16 w-16 shrink-0 rounded-full"
                      style={{
                        background: `conic-gradient(#60a5fa ${recentStatsForTab.winRate}%, #f43f5e 0)`,
                      }}
                    >
                      <div className="absolute inset-[6px] grid place-items-center rounded-full bg-[#101522]">
                        <span className="text-lg font-bold text-sky-300">{Math.round(recentStatsForTab.winRate)}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-400">승률</p>
                      <p className="font-mono text-sm text-zinc-200">
                        {recentStatsForTab.avgKills.toFixed(1)} /{" "}
                        <span className="text-rose-300">{recentStatsForTab.avgDeaths.toFixed(1)}</span> /{" "}
                        {recentStatsForTab.avgAssists.toFixed(1)}
                      </p>
                      <p className="text-xs text-zinc-400">평균 KDA</p>
                    </div>
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-[#101522] p-2">
                  <p className="mb-1 text-xs text-zinc-500">플레이한 챔피언 (최근)</p>
                  <div className="flex flex-col gap-1">
                    {recentStatsForTab.topChampions.map((c) => (
                      <div key={c.championName} className="flex items-center gap-2 text-xs">
                        <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded border border-white/10">
                          <Image
                            src={champIconSrc(c.championName)}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="24px"
                            unoptimized
                          />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-zinc-200">{c.championName}</span>
                        <span className="text-zinc-400">{c.games}전</span>
                        <span className="text-sky-300">{((c.wins / c.games) * 100).toFixed(0)}%</span>
                        <span className="font-mono text-zinc-400">
                          {c.avgKills.toFixed(1)}/{c.avgDeaths.toFixed(1)}/{c.avgAssists.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-[#101522] p-2">
                  <p className="mb-2 text-xs text-zinc-500">선호 포지션 (랭크)</p>
                  <div className="flex items-end gap-2">
                    {(() => {
                      const maxRatio = Math.max(
                        ...recentStatsForTab.favoritePositions.map((p) => p.ratio),
                        1
                      );
                      return recentStatsForTab.favoritePositions.map((p) => {
                        const barAreaH = 44; // 바가 놓이는 기준선 높이
                        const barH = Math.max(10, Math.round((p.ratio / maxRatio) * barAreaH));
                        return (
                          <div key={p.position} className="flex flex-1 flex-col items-center">
                            <div className="flex h-[44px] w-full items-end justify-center">
                              <div className="w-full rounded bg-zinc-700/60" style={{ height: barH }} />
                            </div>
                            <span className="mt-1 text-center text-[10px] font-mono text-zinc-400">
                              {p.count} ({p.ratio.toFixed(0)}%)
                            </span>
                            <span className="text-[10px] text-zinc-300">{toPositionShort(p.position)}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="mb-3 rounded-lg border border-white/10 bg-[#161a27] p-3">
              <h2 className="mb-2 text-sm font-semibold text-zinc-200">최근 게임 통계</h2>
              <div className="rounded border border-white/10 bg-[#101522] p-4 text-sm text-zinc-400">
                해당 모드 최근 전적이 없습니다.
              </div>
            </section>
          )
        )}

        {data?.matches?.length ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryTab("ALL")}
            className={`rounded border px-2 py-1 text-[12px] font-semibold ${
              historyTab === "ALL" ? "border-sky-500/40 bg-sky-950/40 text-sky-200" : "border-white/15 bg-zinc-900/20 text-zinc-300"
            }`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab("SOLO")}
            className={`rounded border px-2 py-1 text-[12px] font-semibold ${
              historyTab === "SOLO" ? "border-sky-500/40 bg-sky-950/40 text-sky-200" : "border-white/15 bg-zinc-900/20 text-zinc-300"
            }`}
          >
            솔로 랭크
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab("FLEX")}
            className={`rounded border px-2 py-1 text-[12px] font-semibold ${
              historyTab === "FLEX" ? "border-sky-500/40 bg-sky-950/40 text-sky-200" : "border-white/15 bg-zinc-900/20 text-zinc-300"
            }`}
          >
            자유 랭크
          </button>
        </div>

        <ul className="flex flex-col gap-4">
          {data?.matches
            ?.filter((m) => {
              if (historyTab === "ALL") return true;
              if (historyTab === "SOLO") return m.queueId === 420;
              return m.queueId === 440;
            })
            .map((m) => {
            const matchTimeline = timelineByMatch[m.matchId];
            const searched =
              m.participants.find((p) => p.puuid === data?.puuid) ?? m.participants[0];
            const maxBlueDmg = Math.max(
              1,
              ...m.participants.filter((p) => p.teamId === 100).map((p) => p.damage)
            );
            const maxRedDmg = Math.max(
              1,
              ...m.participants.filter((p) => p.teamId === 200).map((p) => p.damage)
            );
            const blueWin = m.participants.find((p) => p.teamId === 100)?.win ?? false;
            const redWin = m.participants.find((p) => p.teamId === 200)?.win ?? false;
            const rowBg = m.win ? "bg-[#28344E]" : "bg-[#593439]";
            const cpm =
              m.durationSec > 0 && searched
                ? (searched.cs / (m.durationSec / 60)).toFixed(2)
                : "0.00";
            const blueTeam = m.participants.filter((p) => p.teamId === 100);
            const redTeam = m.participants.filter((p) => p.teamId === 200);
            const teamSum = teamsSummaryFromMatch(m);
            return (
              <li
                key={m.matchId}
                className="overflow-hidden rounded-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.35)]"
              >
                <details
                  className="group"
                  onToggle={(e) => {
                    if (e.currentTarget.open) void fetchMatchTimeline(m.matchId);
                  }}
                >
                  <summary
                    className={`list-none cursor-pointer border-b border-black/20 px-2 py-2.5 sm:px-3 ${rowBg} [&::-webkit-details-marker]:hidden`}
                  >
                    <div className="flex min-w-0 flex-col gap-2.5 lg:flex-row lg:items-stretch lg:justify-between lg:gap-3">
                      <div className="flex min-w-0 flex-wrap items-start gap-3 sm:gap-4">
                        <div className="flex shrink-0 flex-col gap-0.5 text-[11px] leading-tight text-zinc-200">
                          <span className="font-bold text-white">
                            {queueIdLabel(m.queueId) ?? m.gameMode}
                          </span>
                          <span className="text-[#9E9E9E]">{formatMatchDate(m.gameEndTimestamp)}</span>
                          <span
                            className={`font-bold uppercase tracking-wide ${
                              m.win ? "text-sky-300" : "text-rose-300"
                            }`}
                          >
                            {m.win ? "WIN" : "LOSS"}
                          </span>
                          <span className="text-[#9E9E9E]">{formatDuration(m.durationSec)}</span>
                        </div>

                        <div className="flex min-w-0 items-start gap-2">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-white/15 bg-black/20">
                            <Image
                              src={champIconSrc(searched?.championName ?? "Aatrox")}
                              alt=""
                              fill
                              className="object-cover object-center"
                              sizes="56px"
                              unoptimized
                            />
                            <span className="absolute bottom-0 right-0 rounded-tl border border-white/10 bg-black/70 px-1 font-mono text-[10px] leading-none text-zinc-200">
                              {searched?.champLevel ?? "—"}
                            </span>
                          </div>
                          <div className="flex min-h-[56px] min-w-0 flex-col justify-center gap-1">
                            <div className="inline-flex w-fit items-center gap-1.5 rounded border border-white/15 bg-black/25 px-1.5 py-0.5">
                              <span className="font-mono text-[12px] font-bold text-white">
                                {displayRankLabel(
                                  searched?.rankOverall,
                                  searched?.rankInTeam,
                                  searched?.win ?? false
                                )}
                              </span>
                              <LanePositionTag position={searched?.teamPosition ?? ""} />
                            </div>
                            {searched ? (
                              <SpellPerkMini
                                summoner1Id={searched.summoner1Id}
                                summoner2Id={searched.summoner2Id}
                              />
                            ) : null}
                          </div>
                        </div>

                        <div className="grid min-w-[10rem] grid-cols-3 gap-3 text-center sm:min-w-[13rem]">
                          <div>
                            <div className="text-[11px] text-[#9E9E9E] sm:text-xs">인분</div>
                            <div className="font-mono text-sm font-bold tabular-nums text-white sm:text-[15px]">
                              {(searched?.damagePortion ?? 0).toFixed(2)} 인분
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#9E9E9E] sm:text-xs">라인전</div>
                            <div className="font-mono text-sm font-bold tabular-nums text-white sm:text-[15px]">
                              {searched ? laneRatioLabelForPlayer(m, searched) : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#9E9E9E] sm:text-xs">팀운</div>
                            <div className="text-sm font-bold text-white sm:text-[15px]">
                              {searched ? teamLuckLabel(searched) : "—"}
                            </div>
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-col justify-center gap-0.5 text-[11px]">
                          <div className="font-mono text-white">
                            <span>{searched?.kills ?? 0}</span>
                            <span className="text-zinc-500"> / </span>
                            <span className="text-rose-300">{searched?.deaths ?? 0}</span>
                            <span className="text-zinc-500"> / </span>
                            <span>{searched?.assists ?? 0}</span>
                            <span className="ml-1 text-zinc-400">
                              ({kdaRatioOne(searched?.kills ?? 0, searched?.deaths ?? 0, searched?.assists ?? 0)}:1)
                            </span>
                          </div>
                          <div className="text-[#9E9E9E]">{searched?.cs ?? 0} ({cpm}/m) CS</div>
                          <div className="text-[#9E9E9E]">
                            인분 {(searched?.damagePortion ?? 0).toFixed(2)} · {searched?.rankOverall ?? "—"}등
                          </div>
                        </div>

                        <div className="hidden min-w-0 flex-1 flex-col gap-1 sm:flex">
                          <div className="flex flex-wrap gap-0.5">
                            {blueTeam.map((p) => (
                              <div key={p.puuid} className="relative h-6 w-6 shrink-0 overflow-hidden rounded border border-sky-500/30">
                                <Image
                                  src={champIconSrc(p.championName)}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="24px"
                                  unoptimized
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap justify-end gap-0.5">
                            {redTeam.map((p) => (
                              <div key={p.puuid} className="relative h-6 w-6 shrink-0 overflow-hidden rounded border border-rose-500/30">
                                <Image
                                  src={champIconSrc(p.championName)}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="24px"
                                  unoptimized
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-row items-start justify-between gap-2 sm:flex-col sm:items-end">
                        <span
                          className="select-none text-zinc-400 transition-transform duration-200 group-open:rotate-180"
                          aria-hidden
                        >
                          ▼
                        </span>
                        <span className="max-w-[160px] truncate font-mono text-[9px] text-[#9E9E9E] sm:text-right">
                          {m.matchId}
                        </span>
                      </div>
                    </div>

                    {searched?.funTitles && searched.funTitles.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1 border-t border-white/10 pt-2">
                        {searched.funTitles.map((t) => (
                          <span
                            key={t}
                            className="rounded border border-white/15 bg-black/25 px-1.5 py-px text-[10px] text-zinc-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </summary>

                  <div className="grid gap-2 px-3 py-2 sm:grid-cols-2">
                  <div className="rounded border border-sky-500/25 bg-sky-950/20 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300/90">MVP</p>
                    {m.carry ? (
                      <div className="flex gap-2">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded border border-white/10">
                          <Image
                            src={champIconSrc(m.carry.championName)}
                            alt=""
                            fill
                            className="object-cover object-center"
                            sizes="44px"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => runSearch(m.carry!.displayName)}
                            className="truncate text-left text-sm font-medium text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
                          >
                            {m.carry.displayName}
                          </button>
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {m.carry.funTitles.map((t) => (
                              <span
                                key={t}
                                className="rounded border border-sky-500/35 bg-sky-950/50 px-1.5 py-px text-[10px] text-sky-100"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] text-zinc-500">
                            KDA {m.carry.kills}/{m.carry.deaths}/{m.carry.assists} · 인분{" "}
                            {(m.participants.find((p) => p.puuid === m.carry!.puuid)?.damagePortion ?? 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">—</p>
                    )}
                  </div>

                  <div className="rounded border border-rose-500/25 bg-rose-950/20 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-rose-300/90">범인</p>
                    {m.blame ? (
                      <div className="flex gap-2">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded border border-white/10">
                          <Image
                            src={champIconSrc(m.blame.championName)}
                            alt=""
                            fill
                            className="object-cover object-center"
                            sizes="44px"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => runSearch(m.blame!.displayName)}
                            className="truncate text-left text-sm font-medium text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
                          >
                            {m.blame.displayName}
                          </button>
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {m.blame.funTitles.map((t) => (
                              <span
                                key={t}
                                className="rounded border border-rose-500/35 bg-rose-950/50 px-1.5 py-px text-[10px] text-rose-100"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] text-zinc-500">
                            KDA {m.blame.kills}/{m.blame.deaths}/{m.blame.assists} · 인분{" "}
                            {(m.participants.find((p) => p.puuid === m.blame!.puuid)?.damagePortion ?? 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">—</p>
                    )}
                  </div>
                  </div>

                  {m.laneRows && m.laneRows.length > 0 && (
                    <div className="border-t border-white/10 px-2 py-2 text-xs sm:px-3">
                      <p className="text-zinc-500">상세</p>
                      <MatchTeamsBanner blue={teamSum.blue} red={teamSum.red} blueWin={blueWin} />
                      <div className="mb-3 flex min-h-[4rem] flex-col items-center justify-center">
                        {matchTimeline === "loading" ? (
                          <p className="text-[10px] text-zinc-500">타임라인 불러오는 중…</p>
                        ) : matchTimeline === "error" ? (
                          <p className="text-[10px] text-rose-400/90">타임라인을 불러오지 못했습니다.</p>
                        ) : matchTimeline &&
                          typeof matchTimeline === "object" &&
                          "goldDiff" in matchTimeline ? (
                          <GoldDiffChart
                            points={matchTimeline.goldDiff}
                            blueWin={blueWin}
                          />
                        ) : null}
                      </div>
                      <div className="px-2">
                        <div className="mb-2 flex w-full flex-row items-center gap-2">
                          <div className="hidden min-w-0 flex-1 pr-2 text-center lg:block lg:text-left">
                            <span className="text-xs font-bold tracking-wide text-sky-400">블루 팀</span>
                            <span className="ml-1.5 text-[10px] font-semibold text-zinc-400">
                              {blueWin ? "승리팀" : "패배팀"}
                            </span>
                          </div>
                          <div className="hidden w-24 shrink-0 lg:block" aria-hidden />
                          <div className="hidden min-w-0 flex-1 pl-2 text-center lg:block lg:text-right">
                            <span className="text-xs font-bold tracking-wide text-rose-400">레드 팀</span>
                            <span className="ml-1.5 text-[10px] font-semibold text-zinc-400">
                              {redWin ? "승리팀" : "패배팀"}
                            </span>
                          </div>
                          <div className="flex w-full justify-between gap-2 lg:hidden">
                            <span className="text-xs font-bold tracking-wide text-sky-400">
                              블루 팀
                              <span className="ml-1 font-semibold text-zinc-400">
                                {blueWin ? "승리팀" : "패배팀"}
                              </span>
                            </span>
                            <span className="text-xs font-bold tracking-wide text-rose-400">
                              레드 팀
                              <span className="ml-1 font-semibold text-zinc-400">
                                {redWin ? "승리팀" : "패배팀"}
                              </span>
                            </span>
                          </div>
                        </div>
                        <MatchLaneDetailHeaders />
                      </div>
                      <div className="mt-2">
                        <div className="flex flex-col gap-2">
                          {m.laneRows.map((lane) => (
                            <MatchLaneBlock
                              key={lane.position}
                              lane={lane}
                              maxBlueDmg={maxBlueDmg}
                              maxRedDmg={maxRedDmg}
                              durationSec={m.durationSec}
                              onSummonerClick={(name) => runSearch(name)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-white/10 px-3 py-2 text-xs">
                    <p className="text-zinc-500">전체 표</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-white/10 text-zinc-400">
                            <th className="pb-2 pr-2 font-medium">플레이어</th>
                            <th className="pb-2 pr-2 font-medium">포지션</th>
                            <th className="pb-2 pr-2 font-medium">등수</th>
                            <th className="pb-2 pr-2 font-medium">인분</th>
                            <th className="pb-2 pr-2 font-medium">K/D/A</th>
                            <th className="pb-2 pr-2 font-medium">CS</th>
                            <th className="pb-2 pr-2 font-medium">딜</th>
                            <th className="pb-2 pr-2 font-medium">골드</th>
                            <th className="pb-2 pr-2 font-medium">와드</th>
                            <th className="pb-2 font-medium">원점수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.participants.map((p) => (
                            <tr
                              key={p.puuid + m.matchId}
                              className={
                                p.win ? "border-t border-white/5 text-zinc-300" : "border-t border-white/5 text-zinc-500"
                              }
                            >
                              <td className="py-1.5 pr-2 align-top">
                                <button
                                  type="button"
                                  onClick={() => runSearch(p.displayName)}
                                  className={`text-left underline decoration-white/20 underline-offset-2 hover:opacity-90 ${
                                    p.win ? "text-sky-200" : "text-rose-200/80"
                                  }`}
                                >
                                  {p.displayName}
                                </button>
                                <span className="ml-1 text-zinc-600">{p.championName}</span>
                              </td>
                              <td className="py-1.5 pr-2 align-top">{toPositionShort(p.teamPosition)}</td>
                              <td className="py-1.5 pr-2 align-top font-mono tabular-nums">
                                {displayRankLabel(p.rankOverall, p.rankInTeam, p.win)}
                              </td>
                              <td className="py-1.5 pr-2 align-top font-mono tabular-nums">
                                {(p.damagePortion ?? 0).toFixed(2)}
                              </td>
                              <td className="py-1.5 pr-2 align-top font-mono whitespace-nowrap">
                                {p.kills}/{p.deaths}/{p.assists}
                              </td>
                              <td className="py-1.5 pr-2 align-top font-mono">{p.cs}</td>
                              <td className="py-1.5 pr-2 align-top">{p.damage.toLocaleString()}</td>
                              <td className="py-1.5 pr-2 align-top">{p.gold.toLocaleString()}</td>
                              <td className="py-1.5 pr-2 align-top font-mono whitespace-nowrap text-zinc-400">
                                {p.wardsPlaced}/{p.wardsKilled}
                              </td>
                              <td className="py-1.5 align-top font-mono">{Math.round(p.score * 100) / 100}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {m.participants.some((p) => p.funTitles?.length) && (
                      <div className="mt-3 space-y-1.5 border-t border-white/5 pt-2">
                        {m.participants.map((p) =>
                          p.funTitles?.length ? (
                            <div key={p.puuid + "-tags"} className="flex flex-wrap items-center gap-1 text-[10px]">
                              <span className={`shrink-0 ${p.win ? "text-sky-400/80" : "text-rose-400/80"}`}>
                                {toPositionShort(p.teamPosition)} {p.championName}
                              </span>
                              {p.funTitles.map((t) => (
                                <span
                                  key={p.puuid + t}
                                  className="rounded border border-white/10 bg-zinc-900/50 px-1.5 py-px text-zinc-400"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>

            <div className="mt-4 flex justify-center">
              <button
                type="button"
            onClick={async () => {
              if (!q.trim()) return;
              if (loading) return;
              if (loadedCount >= 100) return;
              try {
                // 기존 목록에서 이어 붙이기(append)용: start=현재 요청 시작 오프셋
                setLoading(true);
                const params = new URLSearchParams({
                  q,
                  region,
                  count: "10",
                  start: String(loadedCount),
                });
                const res = await fetch(`/api/search?${params}`, { cache: "no-store" });
                const json = (await res.json()) as SearchResponse;
                const newMatches = json.matches ?? [];
                if (!newMatches.length) return;
                setData((prev) => {
                  if (!prev || !prev.matches) return json;
                  const existing = new Set(prev.matches.map((m) => m.matchId));
                  const appended = newMatches.filter((m) => !existing.has(m.matchId));
                  return { ...prev, matches: [...prev.matches, ...appended] };
                });
                setLoadedCount((v) => Math.min(100, v + 10));
              } catch {
                // silent
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading || loadedCount >= 100 || !q.trim()}
                className="rounded border border-white/20 bg-zinc-900/30 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                더보기
              </button>
            </div>
          </>
        ) : null}
          </main>
        </>
      )}

      <footer className="mt-auto border-t border-white/10 bg-[#1c1c1f] py-4 text-center text-[10px] text-zinc-600">
        Riot Games API · Data Dragon · 비공식
      </footer>
    </div>
  );
}
