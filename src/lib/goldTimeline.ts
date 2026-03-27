import type {
  MatchDto,
  MatchParticipantDto,
  MatchTimelineDto,
} from "./riot/client";

function participantRows(
  parts: MatchParticipantDto[]
): { participantId: number; teamId: number }[] {
  return parts.map((p, i) => ({
    participantId: p.participantId ?? i + 1,
    teamId: p.teamId,
  }));
}

/** 블루(100) 골드 합 − 레드(200) 골드 합, 프레임마다 1점 */
export function goldDiffFromTimeline(
  timeline: MatchTimelineDto,
  match: MatchDto
): { minute: number; diff: number }[] {
  const rows = participantRows(match.info.participants);
  const idToTeam = new Map<number, number>();
  for (const r of rows) {
    idToTeam.set(r.participantId, r.teamId);
  }
  const out: { minute: number; diff: number }[] = [];
  for (const frame of timeline.info.frames) {
    let g100 = 0;
    let g200 = 0;
    for (const [pidStr, pf] of Object.entries(frame.participantFrames)) {
      const pid = Number(pidStr);
      const team = idToTeam.get(pid);
      const gold = pf.totalGold ?? 0;
      if (team === 100) g100 += gold;
      else if (team === 200) g200 += gold;
    }
    const minute = frame.timestamp / 60000;
    out.push({ minute, diff: g100 - g200 });
  }
  return out;
}
