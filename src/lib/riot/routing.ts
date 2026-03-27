/** Riot 플랫폼 코드 → 호스트 (소환사 API 등) / 리전 호스트 (매치·계정 API) */

export type PlatformCode =
  | "kr"
  | "jp1"
  | "na1"
  | "euw1"
  | "eun1"
  | "br1"
  | "la1"
  | "la2"
  | "oc1"
  | "tr1"
  | "ru"
  | "sg2"
  | "tw2"
  | "vn2";

const PLATFORM_HOST: Record<PlatformCode, string> = {
  kr: "kr.api.riotgames.com",
  jp1: "jp1.api.riotgames.com",
  na1: "na1.api.riotgames.com",
  euw1: "euw1.api.riotgames.com",
  eun1: "eun1.api.riotgames.com",
  br1: "br1.api.riotgames.com",
  la1: "la1.api.riotgames.com",
  la2: "la2.api.riotgames.com",
  oc1: "oc1.api.riotgames.com",
  tr1: "tr1.api.riotgames.com",
  ru: "ru.api.riotgames.com",
  sg2: "sg2.api.riotgames.com",
  tw2: "tw2.api.riotgames.com",
  vn2: "vn2.api.riotgames.com",
};

/** 매치 v5 / 계정 v1 등 리전 라우팅 호스트 */
const REGIONAL_HOST: Record<PlatformCode, string> = {
  kr: "asia.api.riotgames.com",
  jp1: "asia.api.riotgames.com",
  na1: "americas.api.riotgames.com",
  euw1: "europe.api.riotgames.com",
  eun1: "europe.api.riotgames.com",
  br1: "americas.api.riotgames.com",
  la1: "americas.api.riotgames.com",
  la2: "americas.api.riotgames.com",
  oc1: "americas.api.riotgames.com",
  tr1: "europe.api.riotgames.com",
  ru: "europe.api.riotgames.com",
  sg2: "sea.api.riotgames.com",
  tw2: "sea.api.riotgames.com",
  vn2: "sea.api.riotgames.com",
};

export function isPlatformCode(s: string): s is PlatformCode {
  return s in PLATFORM_HOST;
}

export function getPlatformHost(platform: PlatformCode): string {
  return PLATFORM_HOST[platform];
}

export function getRegionalHost(platform: PlatformCode): string {
  return REGIONAL_HOST[platform];
}

export function parsePlatform(input: string | null): PlatformCode {
  if (!input) return "kr";
  const lower = input.toLowerCase() as PlatformCode;
  return isPlatformCode(lower) ? lower : "kr";
}
