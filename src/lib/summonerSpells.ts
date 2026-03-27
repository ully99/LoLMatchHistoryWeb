/** Data Dragon spell 파일명 — summoner1Id/summoner2Id → 이미지 */
export const SUMMONER_SPELL_FILE: Record<number, string> = {
  4: "SummonerFlash",
  12: "SummonerHeal",
  14: "SummonerDot",
  3: "SummonerExhaust",
  6: "SummonerHaste",
  7: "SummonerHeal",
  11: "SummonerSmite",
  13: "SummonerMana",
  21: "SummonerBarrier",
  1: "SummonerBoost",
  2: "SummonerBoost",
  30: "SummonerPoroRecall",
  31: "SummonerPoroThrow",
  32: "SummonerSnowball",
  39: "SummonerSnowURFSnowball_Mark",
};

export function summonerSpellFile(id: number): string | null {
  return SUMMONER_SPELL_FILE[id] ?? null;
}
