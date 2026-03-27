import { NextRequest, NextResponse } from "next/server";
import { goldDiffFromTimeline } from "@/lib/goldTimeline";
import { getMatch, getMatchTimeline, RiotApiError } from "@/lib/riot/client";
import { parsePlatform } from "@/lib/riot/routing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const apiKey = process.env.RIOT_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "RIOT_API_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const matchId = request.nextUrl.searchParams.get("matchId")?.trim();
  const region = parsePlatform(request.nextUrl.searchParams.get("region"));
  if (!matchId) {
    return NextResponse.json({ error: "matchId가 필요합니다." }, { status: 400 });
  }

  try {
    const [match, timeline] = await Promise.all([
      getMatch(apiKey, region, matchId),
      getMatchTimeline(apiKey, region, matchId),
    ]);
    const goldDiff = goldDiffFromTimeline(timeline, match);
    return NextResponse.json({ goldDiff });
  } catch (e) {
    if (e instanceof RiotApiError) {
      return NextResponse.json(
        { error: e.message, detail: e.riotBody },
        { status: e.status >= 500 ? 502 : e.status }
      );
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
