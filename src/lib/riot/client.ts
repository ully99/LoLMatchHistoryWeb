import type { PlatformCode } from "./routing";
import { getPlatformHost, getRegionalHost } from "./routing";

const RIOT_HEADERS = (apiKey: string) => ({
  "X-Riot-Token": apiKey,
});

export class RiotApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public riotBody?: string
  ) {
    super(message);
    this.name = "RiotApiError";
  }
}

async function riotFetch<T>(
  url: string,
  apiKey: string
): Promise<T> {
  const res = await fetch(url, {
    headers: RIOT_HEADERS(apiKey),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new RiotApiError(
      `Riot API 오류 (${res.status})`,
      res.status,
      text.slice(0, 500)
    );
  }
  return JSON.parse(text) as T;
}

export interface SummonerDto {
  id: string;
  accountId: string;
  puuid: string;
  name: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

export async function getSummonerByPuuid(
  apiKey: string,
  platform: PlatformCode,
  puuid: string
): Promise<SummonerDto> {
  const host = getPlatformHost(platform);
  const path = `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
  return riotFetch<SummonerDto>(`https://${host}${path}`, apiKey);
}

export async function getSummonerByName(
  apiKey: string,
  platform: PlatformCode,
  summonerName: string
): Promise<SummonerDto> {
  const host = getPlatformHost(platform);
  const path = `/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
  return riotFetch<SummonerDto>(`https://${host}${path}`, apiKey);
}

export interface LeagueEntryDto {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  /** by-summoner 응답 */
  summonerId?: string;
  summonerName?: string;
  /** by-puuid 응답 */
  puuid?: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

/** league-v4: `/entries/by-puuid` — summoner id 대신 puuid 사용 (403 회피에 유리) */
export async function getLeagueEntriesByPuuid(
  apiKey: string,
  platform: PlatformCode,
  puuid: string
): Promise<LeagueEntryDto[]> {
  const host = getPlatformHost(platform);
  const path = `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
  return riotFetch<LeagueEntryDto[]>(`https://${host}${path}`, apiKey);
}

export async function getLeagueEntriesBySummonerId(
  apiKey: string,
  platform: PlatformCode,
  summonerId: string
): Promise<LeagueEntryDto[]> {
  const host = getPlatformHost(platform);
  const path = `/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`;
  return riotFetch<LeagueEntryDto[]>(`https://${host}${path}`, apiKey);
}

export interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export async function getAccountByRiotId(
  apiKey: string,
  platform: PlatformCode,
  gameName: string,
  tagLine: string
): Promise<AccountDto> {
  const host = getRegionalHost(platform);
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch<AccountDto>(`https://${host}${path}`, apiKey);
}

export async function getMatchIdsByPuuid(
  apiKey: string,
  platform: PlatformCode,
  puuid: string,
  count: number,
  start: number = 0
): Promise<string[]> {
  const host = getRegionalHost(platform);
  const q = new URLSearchParams({
    start: String(Math.max(0, Math.floor(start))),
    count: String(Math.min(100, Math.max(1, count))),
  });
  const path = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${q}`;
  return riotFetch<string[]>(`https://${host}${path}`, apiKey);
}

export interface MatchParticipantDto {
  puuid: string;
  /** 타임라인 participantFrames 키(1~10)와 대응 */
  participantId?: number;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  championName: string;
  championId: number;
  totalDamageDealtToChampions: number;
  goldEarned: number;
  visionScore: number;
  teamPosition: string;
  summonerName: string;
  riotIdGameName: string;
  riotIdTagline: string;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  summoner1Id?: number;
  summoner2Id?: number;
  perks?: {
    styles?: Array<{
      style?: number;
      selections?: Array<{ perk?: number }>;
    }>;
  };
  /** 적 챔피언에게 가한 CC 시간(초) — 서폿/탱 가중에 사용 */
  timeCCingOthers?: number;
  /** 아군에게 준 보호막 피해량 */
  totalDamageShieldedOnTeammates?: number;
  /** 총 힐량 */
  totalHeal?: number;
  /** 오브젝트(타워·용 등)에 가한 피해 — 정글 등 */
  damageDealtToObjectives?: number;
  /** 설치한 와드 수 */
  wardsPlaced?: number;
  /** 제거한 적 와드 수 */
  wardsKilled?: number;
  champLevel?: number;
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
}

export function participantItems(p: MatchParticipantDto): number[] {
  return [
    p.item0 ?? 0,
    p.item1 ?? 0,
    p.item2 ?? 0,
    p.item3 ?? 0,
    p.item4 ?? 0,
    p.item5 ?? 0,
    p.item6 ?? 0,
  ];
}

export interface TeamObjectiveKillsDto {
  first?: boolean;
  kills?: number;
}

export interface MatchTeamDto {
  teamId: number;
  win: boolean;
  objectives: {
    baron?: TeamObjectiveKillsDto;
    champion?: TeamObjectiveKillsDto;
    dragon?: TeamObjectiveKillsDto;
    horde?: TeamObjectiveKillsDto;
    inhibitor?: TeamObjectiveKillsDto;
    riftHerald?: TeamObjectiveKillsDto;
    tower?: TeamObjectiveKillsDto;
  };
}

export interface MatchInfoDto {
  gameDuration: number;
  gameEndTimestamp: number;
  gameMode: string;
  queueId: number;
  participants: MatchParticipantDto[];
  teams?: MatchTeamDto[];
}

export interface MatchDto {
  metadata: { matchId: string; participants: string[] };
  info: MatchInfoDto;
}

export async function getMatch(
  apiKey: string,
  platform: PlatformCode,
  matchId: string
): Promise<MatchDto> {
  const host = getRegionalHost(platform);
  const path = `/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  return riotFetch<MatchDto>(`https://${host}${path}`, apiKey);
}

/** match-v5 타임라인 participantFrames (필요 필드만; 나머지는 무시) */
export interface MatchTimelineDamageStatsDto {
  totalDamageDoneToChampions?: number;
  magicDamageDoneToChampions?: number;
  physicalDamageDoneToChampions?: number;
}

export interface MatchTimelineParticipantFrameDto {
  participantId?: number;
  currentGold?: number;
  totalGold?: number;
  level?: number;
  xp?: number;
  minionsKilled?: number;
  jungleMinionsKilled?: number;
  damageStats?: MatchTimelineDamageStatsDto;
}

export interface MatchTimelineFrameDto {
  timestamp: number;
  participantFrames: Record<string, MatchTimelineParticipantFrameDto>;
}

export interface MatchTimelineInfoDto {
  frames: MatchTimelineFrameDto[];
}

export interface MatchTimelineDto {
  info: MatchTimelineInfoDto;
}

export async function getMatchTimeline(
  apiKey: string,
  platform: PlatformCode,
  matchId: string
): Promise<MatchTimelineDto> {
  const host = getRegionalHost(platform);
  const path = `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`;
  return riotFetch<MatchTimelineDto>(`https://${host}${path}`, apiKey);
}
