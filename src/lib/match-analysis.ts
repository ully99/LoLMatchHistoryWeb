import type { MatchDto, MatchInfoDto, MatchParticipantDto } from "./riot/client";
import { participantItems } from "./riot/client";
import { compressInbunDisplay } from "./inbunCompress";

export interface PlayerHighlight {
  puuid: string;
  displayName: string;
  championName: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  teamId: number;
  /** 원시 퍼포먼스 점수 */
  score: number;
  /** 판 기준 0~10 정규화 (표시용) */
  displayScore: number;
  funTitles: string[];
}

const POS_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

function normalizePosition(raw: string): string {
  const u = (raw || "").toUpperCase();
  if (u === "MID" || u === "NONE") return "MIDDLE";
  return u;
}

function displayName(p: MatchParticipantDto): string {
  const g = p.riotIdGameName?.trim();
  const t = p.riotIdTagline?.trim();
  if (g && t) return `${g}#${t}`;
  if (p.summonerName?.trim()) return p.summonerName.trim();
  return "알 수 없음";
}

/**
 * 팀 내 비교용 퍼포먼스 점수.
 * 서폿은 CC·보호막·힐·딜·시야, 정글은 오브젝트 딜을 반영.
 */
export function performanceScore(p: MatchParticipantDto): number {
  const deaths = Math.max(1, p.deaths);
  const kda = (p.kills + p.assists * 0.85) / deaths;
  const dmg = p.totalDamageDealtToChampions;
  const gold = p.goldEarned;
  const cs =
    (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
  const pos = normalizePosition(p.teamPosition);

  const shared = kda * 12 + gold / 720 + cs / 40;

  if (pos === "UTILITY") {
    const cc = (p.timeCCingOthers ?? 0) / 8;
    const shield = (p.totalDamageShieldedOnTeammates ?? 0) / 700;
    const heal = (p.totalHeal ?? 0) / 900;
    const dmgPart = dmg / 2200;
    const vis = (p.visionScore ?? 0) / 52;
    return shared * 0.4 + cc + shield + heal + dmgPart + vis * 0.75;
  }

  if (pos === "JUNGLE") {
    const obj = (p.damageDealtToObjectives ?? 0) / 1400;
    return shared + dmg / 1050 + obj * 1.15;
  }

  return shared + dmg / 980;
}

/** 한 판 10명 기준으로 점수를 0~10 스케일로 정규화 */
function normalizeDisplayScores(
  parts: MatchParticipantDto[],
  scoreFn: (p: MatchParticipantDto) => number
): Map<string, number> {
  const scores = parts.map((p) => ({ puuid: p.puuid, s: scoreFn(p) }));
  const vals = scores.map((x) => x.s);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1e-6;
  const map = new Map<string, number>();
  for (const { puuid, s } of scores) {
    map.set(puuid, Math.round(((s - min) / span) * 100) / 10);
  }
  return map;
}

/**
 * 인분(1.0에 가까울수록 판 전체 평균 기여).
 * 일반 포지션: 평균 딜 대비 비율.
 * 서포(UTILITY): 딜·CS 의존 완화, 어시·시야·CC·실드·힐·데스를 10인 평균 대비로 혼합.
 */
function computeInbunPortion(
  p: MatchParticipantDto,
  avgDamageAll: number,
  parts: MatchParticipantDto[]
): number {
  const dmgPart =
    p.totalDamageDealtToChampions / Math.max(1, avgDamageAll);
  if (normalizePosition(p.teamPosition) !== "UTILITY") {
    return dmgPart;
  }

  const n = Math.max(1, parts.length);
  const avgAssists = parts.reduce((s, x) => s + x.assists, 0) / n;
  const avgVision =
    parts.reduce((s, x) => s + (x.visionScore ?? 0), 0) / n;
  const avgDeaths = parts.reduce((s, x) => s + x.deaths, 0) / n;
  const avgCc =
    parts.reduce((s, x) => s + (x.timeCCingOthers ?? 0), 0) / n;
  const avgShield = parts.reduce(
    (s, x) => s + (x.totalDamageShieldedOnTeammates ?? 0),
    0
  ) / n;
  const avgHeal = parts.reduce((s, x) => s + (x.totalHeal ?? 0), 0) / n;
  const teamKills = Math.max(
    1,
    parts.filter((x) => x.teamId === p.teamId).reduce((s, x) => s + x.kills, 0)
  );
  const kp = (p.kills + p.assists) / teamKills;
  const avgKp =
    parts.reduce((s, x) => {
      const tk = Math.max(
        1,
        parts
          .filter((y) => y.teamId === x.teamId)
          .reduce((a, y) => a + y.kills, 0)
      );
      return s + (x.kills + x.assists) / tk;
    }, 0) / n;

  const astPart = p.assists / Math.max(1e-6, avgAssists);
  const visPart = (p.visionScore ?? 0) / Math.max(1e-6, avgVision);
  const deathPart =
    (2 * avgDeaths) / (p.deaths + avgDeaths + 1e-6);
  const ccPart = (p.timeCCingOthers ?? 0) / Math.max(1e-6, avgCc);
  const shPart =
    (p.totalDamageShieldedOnTeammates ?? 0) / Math.max(1e-6, avgShield);
  const hlPart = (p.totalHeal ?? 0) / Math.max(1e-6, avgHeal);
  const kpPart = kp / Math.max(1e-6, avgKp);

  return (
    0.02 * dmgPart +
    0.21 * astPart +
    0.23 * visPart +
    0.11 * ccPart +
    0.08 * shPart +
    0.07 * hlPart +
    0.14 * kpPart +
    0.14 * deathPart
  );
}

export interface ParticipantSummary {
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
  /** 미니언 + 정글 CS */
  cs: number;
  wardsPlaced: number;
  wardsKilled: number;
  visionScore: number;
  /** item0~6 (0은 빈 슬롯) */
  items: number[];
  score: number;
  /** 같은 팀 안 순위(1=인분 최고) — MVP/범인·칭호 */
  rankInTeam: number;
  /** 10명 중 전체 순위 (1=점수 1위) */
  rankOverall: number;
  /** 판 전체 기준 0~10 정규화 점수 */
  displayScore: number;
  /** 재미 칭호 (0번째가 메인, 나머지는 지표 디스) */
  funTitles: string[];
  /** 인분(표시값): 원시 인분을 압축한 뒤 저장, 순위·MVP/범인과 동일 기준 */
  damagePortion: number;
  /** 팀 킬 중 킬+어시 비율 % */
  killParticipation: number;
  participantId: number;
  summoner1Id: number;
  summoner2Id: number;
  /** 주 룬(케이스톤) perk id — DDragon /img/perk/{id}.png */
  primaryPerkId: number;
  /** 보조 스타일 트리 id */
  subStyleId: number;
}

function teamRankBy(
  p: ParticipantSummary,
  teammates: ParticipantSummary[],
  key: "damage" | "cs" | "wardsPlaced" | "deaths" | "visionScore",
  higherIsBetter: boolean
): number {
  const sorted = [...teammates].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    return higherIsBetter ? bv - av : av - bv;
  });
  return sorted.findIndex((x) => x.puuid === p.puuid) + 1;
}

/** 메인 칭호 + 지표별 디스칭호 (최대 6개) */
export function deriveFunTitles(
  p: ParticipantSummary,
  teammates: ParticipantSummary[],
  durationSec: number
): string[] {
  const pos = normalizePosition(p.teamPosition);
  const won = p.win;
  const ro = p.rankOverall ?? 10;
  const ds = p.displayScore;
  const scores = teammates.map((t) => t.displayScore);
  const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  const maxS = Math.max(...scores);
  const minS = Math.min(...scores);
  const spread = maxS - minS;
  const dmgR = teamRankBy(p, teammates, "damage", true);
  const csR = teamRankBy(p, teammates, "cs", true);
  const visR = teamRankBy(p, teammates, "visionScore", true);
  const teamDmgAvg =
    teammates.reduce((s, t) => s + t.damage, 0) / Math.max(1, teammates.length);

  const tags: string[] = [];

  if (p.deaths >= 8) tags.push("상대팀 ATM");
  if (p.deaths >= 10) tags.push("데스 발전기");
  if (p.deaths === 0 && durationSec >= 600) tags.push("데스 0");
  if (p.kills >= 10) tags.push("킬 먹방");
  if (p.assists >= 15) tags.push("어시 장인");
  if (ds >= 8 && ro >= 7) tags.push("전략적 죽음");
  if (ds >= 5.5 && ro <= 4) tags.push("나쁘지 않게함");
  if (ds <= 2.2 && ro >= 7) tags.push("하는 게 없음");
  if (p.damage < teamDmgAvg * 0.55 && ro >= 7) tags.push("딜 삭제됨");
  if (p.killParticipation <= 25 && ro >= 7) tags.push("교전 구경꾼");

  if (pos !== "UTILITY" && csR <= 2 && dmgR >= 4) {
    tags.push("CS충");
  }
  if (pos !== "UTILITY" && csR >= 4 && ro >= 7) {
    tags.push("CS 유기");
  }

  if (pos === "UTILITY") {
    const minW = Math.max(8, Math.floor(durationSec / 150));
    if (p.wardsPlaced < minW) tags.push("와드 파업");
    if (p.visionScore < 40 && durationSec > 900) tags.push("시야 봉인");
    if (visR >= 4) tags.push("유틸 실종");
    if (dmgR == 1) tags.push("탈 도구 선언");
  }

  if (pos === "BOTTOM")
  {
    if (dmgR >= 4 && p.damage < teamDmgAvg * 0.75) tags.push("원딜 딜량 파산");
    if (dmgR== 1) tags.push("왕자");
    if (p.deaths >= 7 && dmgR >= 3) tags.push("포지셔닝 실종");
  }
    
    
  
  


  if (pos === "MIDDLE")
  {
    if (dmgR >= 4 && p.damage < teamDmgAvg * 0.7) tags.push("미드 존재감 증발");
    if (dmgR == 1) tags.push("황족");
    if (p.deaths >= 7) tags.push("라인전 파산");
  }
    
  if (pos === "JUNGLE")
  {
    if (dmgR >= 4 && p.damage < teamDmgAvg * 0.65) tags.push("정글 관광객");
    if (dmgR == 1) tags.push("김병만");
    if (p.killParticipation <= 35 && ro >= 7) tags.push("갱킹 로그아웃");
  }
     
  if (pos === "TOP")
  {
    if (p.deaths >= 6 && dmgR >= 3) tags.push("탑신병자");
    if (dmgR == 1) tags.push("탑 클래스");
    if (p.deaths >= 8) tags.push("사이드에서 증발");
  }
     
    
  

  /** 메인 칭호: 전체 순위(rankOverall 1~10) 기준 */
  let primary = "";
  if (won) {
    if (ds >= 7.2) {
      primary = "이번 판 주역";
    } else if (ds >= 6.0 && ro >= 7) {
      primary = "팀 서열은 낮아도 잘함";
    } else if (ro <= 3 && ds >= 5.5) {
      primary = "무난하게 잘함";
    } else if (ro >= 9) {
      primary = "무임승차";
    } else if (ro <= 2 && ds >= 6.5 && avg < 4.8 && spread > 3) {
      primary = "머리채 잡고 버스 끌고 감";
    } else if (ro <= 2) {
      primary = "이번 판 버스기사";
    } else if (ro <= 4) {
      primary = "그래도 잘함";
    } else if (ro <= 6) {
      primary = "승리에 기여함";
    } else if (ds >= 5.2) {
      primary = "묵묵히 잘함";
    } else {
      primary = "승객";
    }
    if (ro >= 8) {
      primary = "창문깨고 버스 뛰쳐나가다가 머리채 잡힌 놈";
    }
  } else {
    if (ro === 10 && p.damagePortion <= 0.75 && p.deaths >= 8 && p.killParticipation <= 30) {
      primary = "없는 사람";
    } else if (ds >= 5.5 && ro <= 5) {
      primary = "잘했는데 팀이 못함";
    } else if (ro === 10 && ds <= 2.2) {
      primary = "고아의 왕";
    } else if (ro >= 9) {
      primary = "러지";
    } else if (ro >= 7 && ds <= 2.8) {
      primary = "고아";
    } else if (ro <= 3) {
      primary = "고아원장";
    } else if (ro <= 5) {
      primary = "노력은 함";
    } else if (ds >= 4.8 && ro <= 5) {
      primary = "팀 탓이 큼";
    } else if (ds >= 4.0) {
      primary = "그나마 선방";
    } else {
      primary = "게임 로그아웃";
    }
  }

  const merged = [primary, ...tags];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of merged) {
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 6);
}

function perkIdsFrom(p: MatchParticipantDto): { primaryPerkId: number; subStyleId: number } {
  const styles = p.perks?.styles ?? [];
  const primaryPerkId = styles[0]?.selections?.[0]?.perk ?? 0;
  const subStyleId = styles[1]?.style ?? 0;
  return { primaryPerkId, subStyleId };
}

export interface TeamSideSummary {
  teamId: number;
  kills: number;
  gold: number;
  tower: number;
  dragon: number;
  baron: number;
  herald: number;
}

function buildTeamsSummary(info: MatchInfoDto): {
  blue: TeamSideSummary;
  red: TeamSideSummary;
} {
  const parts = info.participants;
  const t100 = parts.filter((p) => p.teamId === 100);
  const t200 = parts.filter((p) => p.teamId === 200);
  const dto100 = info.teams?.find((t) => t.teamId === 100);
  const dto200 = info.teams?.find((t) => t.teamId === 200);
  const o100 = dto100?.objectives;
  const o200 = dto200?.objectives;
  return {
    blue: {
      teamId: 100,
      kills: t100.reduce((s, p) => s + p.kills, 0),
      gold: t100.reduce((s, p) => s + p.goldEarned, 0),
      tower: o100?.tower?.kills ?? 0,
      dragon: o100?.dragon?.kills ?? 0,
      baron: o100?.baron?.kills ?? 0,
      herald: o100?.riftHerald?.kills ?? 0,
    },
    red: {
      teamId: 200,
      kills: t200.reduce((s, p) => s + p.kills, 0),
      gold: t200.reduce((s, p) => s + p.goldEarned, 0),
      tower: o200?.tower?.kills ?? 0,
      dragon: o200?.dragon?.kills ?? 0,
      baron: o200?.baron?.kills ?? 0,
      herald: o200?.riftHerald?.kills ?? 0,
    },
  };
}

function summarizeParticipant(
  p: MatchParticipantDto,
  score: number,
  rankInTeam: number,
  displayScore: number,
  funTitles: string[],
  rankOverall: number,
  damagePortion: number,
  killParticipation: number
): ParticipantSummary {
  const { primaryPerkId, subStyleId } = perkIdsFrom(p);
  return {
    puuid: p.puuid,
    displayName: displayName(p),
    championName: p.championName,
    championId: p.championId,
    champLevel: p.champLevel ?? 0,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    teamId: p.teamId,
    win: p.win,
    teamPosition: p.teamPosition || "",
    damage: p.totalDamageDealtToChampions,
    gold: p.goldEarned,
    cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
    wardsPlaced: p.wardsPlaced ?? 0,
    wardsKilled: p.wardsKilled ?? 0,
    visionScore: p.visionScore ?? 0,
    items: participantItems(p),
    score,
    rankInTeam,
    rankOverall,
    displayScore,
    funTitles,
    damagePortion,
    killParticipation,
    participantId: p.participantId ?? 0,
    summoner1Id: p.summoner1Id ?? 0,
    summoner2Id: p.summoner2Id ?? 0,
    primaryPerkId,
    subStyleId,
  };
}

/** 팀 내 순위: 인분(damagePortion)과 전체 순위와 동일한 동점 처리 */
function teamRankMapFromSummaries(
  team: MatchParticipantDto[],
  summaryByPuuid: Map<string, ParticipantSummary>
): Map<string, number> {
  const sorted = [...team].sort((a, b) => {
    const sa = summaryByPuuid.get(a.puuid)!;
    const sb = summaryByPuuid.get(b.puuid)!;
    const d = sb.damagePortion - sa.damagePortion;
    if (Math.abs(d) > 1e-9) return d;
    const ds = sb.displayScore - sa.displayScore;
    if (Math.abs(ds) > 1e-9) return ds;
    const s = sb.score - sa.score;
    if (Math.abs(s) > 1e-9) return s;
    return a.puuid.localeCompare(b.puuid);
  });
  const map = new Map<string, number>();
  sorted.forEach((p, i) => map.set(p.puuid, i + 1));
  return map;
}

/** 10명 전체 순위: 인분(damagePortion) 우선, 동점이면 기존 점수 보조 */
function computeOverallRanks(summaries: ParticipantSummary[]): Map<string, number> {
  const sorted = [...summaries].sort((a, b) => {
    const d = b.damagePortion - a.damagePortion;
    if (Math.abs(d) > 1e-9) return d;
    const ds = b.displayScore - a.displayScore;
    if (Math.abs(ds) > 1e-9) return ds;
    const s = b.score - a.score;
    if (Math.abs(s) > 1e-9) return s;
    return a.puuid.localeCompare(b.puuid);
  });
  const map = new Map<string, number>();
  sorted.forEach((p, i) => map.set(p.puuid, i + 1));
  return map;
}

export interface LaneRow {
  position: string;
  blue: ParticipantSummary | null;
  red: ParticipantSummary | null;
  /** 같은 라인 양쪽 내부 퍼포먼스 점수 비율 (블루 쪽) — 중앙 막대만 */
  blueRatio: number;
}

function buildLaneRows(
  participants: MatchParticipantDto[],
  summaryByPuuid: Map<string, ParticipantSummary>
): LaneRow[] {
  const blue = participants.filter((p) => p.teamId === 100);
  const red = participants.filter((p) => p.teamId === 200);
  const rows: LaneRow[] = [];

  for (const lane of POS_ORDER) {
    const b = blue.find((p) => normalizePosition(p.teamPosition) === lane);
    const r = red.find((p) => normalizePosition(p.teamPosition) === lane);
    const bs = b ? summaryByPuuid.get(b.puuid) ?? null : null;
    const rs = r ? summaryByPuuid.get(r.puuid) ?? null : null;
    const bScore = bs?.score ?? 0;
    const rScore = rs?.score ?? 0;
    const sum = bScore + rScore + 1e-6;
    rows.push({
      position: lane,
      blue: bs,
      red: rs,
      blueRatio: bScore / sum,
    });
  }

  return rows;
}

function pickCarry(
  team: MatchParticipantDto[],
  displayMap: Map<string, number>
): PlayerHighlight | null {
  if (team.length === 0) return null;
  let best = team[0];
  let bestScore = performanceScore(best);
  for (let i = 1; i < team.length; i++) {
    const s = performanceScore(team[i]);
    if (s > bestScore) {
      best = team[i];
      bestScore = s;
    }
  }
  return {
    puuid: best.puuid,
    displayName: displayName(best),
    championName: best.championName,
    championId: best.championId,
    kills: best.kills,
    deaths: best.deaths,
    assists: best.assists,
    teamId: best.teamId,
    score: Math.round(bestScore * 100) / 100,
    displayScore: displayMap.get(best.puuid) ?? 0,
    funTitles: ["MVP"],
  };
}

function pickBlame(
  team: MatchParticipantDto[],
  displayMap: Map<string, number>
): PlayerHighlight | null {
  if (team.length === 0) return null;
  let worst = team[0];
  let worstScore = performanceScore(worst);
  for (let i = 1; i < team.length; i++) {
    const s = performanceScore(team[i]);
    if (s < worstScore) {
      worst = team[i];
      worstScore = s;
    }
  }
  return {
    puuid: worst.puuid,
    displayName: displayName(worst),
    championName: worst.championName,
    championId: worst.championId,
    kills: worst.kills,
    deaths: worst.deaths,
    assists: worst.assists,
    teamId: worst.teamId,
    score: Math.round(worstScore * 100) / 100,
    displayScore: displayMap.get(worst.puuid) ?? 0,
    funTitles: ["범인"],
  };
}

function enrichHighlight(
  h: PlayerHighlight | null,
  summaryByPuuid: Map<string, ParticipantSummary>
): PlayerHighlight | null {
  if (!h) return null;
  const s = summaryByPuuid.get(h.puuid);
  return { ...h, funTitles: s?.funTitles?.length ? s.funTitles : h.funTitles };
}

const REMAKE_SEC = 300;

export interface AnalyzedMatch {
  matchId: string;
  durationSec: number;
  /** 종료 시각(ms). 시즌 필터·통계에 사용 */
  gameEndTimestamp: number;
  queueId: number;
  gameMode: string;
  win: boolean;
  searchedPuuid: string;
  carry: PlayerHighlight | null;
  blame: PlayerHighlight | null;
  participants: ParticipantSummary[];
  laneRows: LaneRow[];
  teamsSummary: {
    blue: TeamSideSummary;
    red: TeamSideSummary;
  };
}

export function analyzeMatch(
  match: MatchDto,
  searchedPuuid: string
): AnalyzedMatch | null {
  const { info } = match;
  if (info.gameDuration < REMAKE_SEC) return null;

  const self = info.participants.find((p) => p.puuid === searchedPuuid);
  if (!self) return null;

  const parts = info.participants;
  const displayMap = normalizeDisplayScores(parts, performanceScore);

  const winTeam = parts.filter((p) => p.win);
  const loseTeam = parts.filter((p) => !p.win);

  const winningSide = winTeam[0]?.teamId;
  const winningPlayers =
    winningSide === undefined
      ? []
      : parts.filter((p) => p.teamId === winningSide);

  const losingSide = loseTeam[0]?.teamId;
  const losingPlayers =
    losingSide === undefined
      ? []
      : parts.filter((p) => p.teamId === losingSide);

  const team100 = parts.filter((p) => p.teamId === 100);
  const team200 = parts.filter((p) => p.teamId === 200);

  const totalDamageAll = parts.reduce((s, p) => s + p.totalDamageDealtToChampions, 0);
  const avgDamageAll = totalDamageAll / Math.max(1, parts.length);

  const teamKills = new Map<number, number>();
  for (const p of parts) {
    teamKills.set(p.teamId, (teamKills.get(p.teamId) ?? 0) + p.kills);
  }

  const rawInbunByPuuid = new Map<string, number>();
  for (const p of parts) {
    rawInbunByPuuid.set(p.puuid, computeInbunPortion(p, avgDamageAll, parts));
  }

  const summaryByPuuid = new Map<string, ParticipantSummary>();
  for (const p of parts) {
    const s = performanceScore(p);
    const disp = displayMap.get(p.puuid) ?? 0;
    const tk = Math.max(1, teamKills.get(p.teamId) ?? 1);
    const raw = rawInbunByPuuid.get(p.puuid)!;
    const damagePortion = compressInbunDisplay(raw);
    const killParticipation = ((p.kills + p.assists) / tk) * 100;
    summaryByPuuid.set(
      p.puuid,
      summarizeParticipant(p, s, 0, disp, [], 0, damagePortion, killParticipation)
    );
  }

  const rank100 = teamRankMapFromSummaries(team100, summaryByPuuid);
  const rank200 = teamRankMapFromSummaries(team200, summaryByPuuid);
  for (const p of parts) {
    const rank =
      p.teamId === 100 ? rank100.get(p.puuid)! : rank200.get(p.puuid)!;
    const cur = summaryByPuuid.get(p.puuid)!;
    summaryByPuuid.set(p.puuid, { ...cur, rankInTeam: rank });
  }

  const allSummaries = parts.map((p) => summaryByPuuid.get(p.puuid)!);
  const overallMap = computeOverallRanks(allSummaries);
  for (const p of parts) {
    const cur = summaryByPuuid.get(p.puuid)!;
    summaryByPuuid.set(p.puuid, {
      ...cur,
      rankOverall: overallMap.get(p.puuid)!,
    });
  }

  const summ100 = team100.map((p) => summaryByPuuid.get(p.puuid)!);
  const summ200 = team200.map((p) => summaryByPuuid.get(p.puuid)!);
  const dur = info.gameDuration;
  for (const p of team100) {
    const cur = summaryByPuuid.get(p.puuid)!;
    summaryByPuuid.set(p.puuid, {
      ...cur,
      funTitles: deriveFunTitles(cur, summ100, dur),
    });
  }
  for (const p of team200) {
    const cur = summaryByPuuid.get(p.puuid)!;
    summaryByPuuid.set(p.puuid, {
      ...cur,
      funTitles: deriveFunTitles(cur, summ200, dur),
    });
  }

  const carry = enrichHighlight(
    pickCarry(winningPlayers, displayMap),
    summaryByPuuid
  );
  const blame = enrichHighlight(
    pickBlame(losingPlayers, displayMap),
    summaryByPuuid
  );

  const participants = parts.map((p) => summaryByPuuid.get(p.puuid)!);
  const laneRows = buildLaneRows(parts, summaryByPuuid);

  return {
    matchId: match.metadata.matchId,
    durationSec: info.gameDuration,
    gameEndTimestamp: info.gameEndTimestamp,
    queueId: info.queueId,
    gameMode: info.gameMode,
    win: self.win,
    searchedPuuid,
    carry,
    blame,
    participants,
    laneRows,
    teamsSummary: buildTeamsSummary(info),
  };
}
