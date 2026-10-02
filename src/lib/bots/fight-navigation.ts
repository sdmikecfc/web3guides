import type { StylePracticeQuery } from "./style-practice";

export const FIGHT_QUERY_KEYS = ["style", "rival", "tier", "part", "robot", "appearance", "seed", "session", "botId", "difficulty", "name", "family", "weapon", "plan", "mode", "collision"] as const;
export function fightRoomHref(combat: 5 | 6, values: Record<string, string | undefined>) {
  const query = new URLSearchParams({ view: "fight", combat: String(combat) });
  for (const key of FIGHT_QUERY_KEYS) if (values[key] !== undefined) query.set(key, values[key]!);
  return `/bots?${query.toString()}`;
}
export function styleQueryOf(params: Pick<URLSearchParams, "get">): StylePracticeQuery {
  return Object.fromEntries(FIGHT_QUERY_KEYS.map(key => [key, params.get(key) ?? undefined])) as StylePracticeQuery;
}
export function clearFightQuery(query: URLSearchParams) {
  query.delete("combat"); query.delete("replay"); for (const key of FIGHT_QUERY_KEYS) query.delete(key);
}
