import type { Matchup } from './arena';
export function arenaView(
  prompts: {id: string; archived: boolean}[],
  active: {first_id: string; second_id: string},
  matchups: Matchup[],
  history: boolean,
) {
  const played = new Set(matchups.flatMap(m => [m.first_id, m.second_id]));
  const ids = history
    ? prompts.filter(p => !p.archived || played.has(p.id)).map(p => p.id)
    : [active.first_id, active.second_id].filter(id => prompts.some(p => p.id === id));
  const visible = new Set(ids);
  return {ids, matchups: matchups.filter(m => visible.has(m.first_id) && visible.has(m.second_id))};
}
export function promptLink(id: string) {
  return `/admin/prompts?revision=${encodeURIComponent(id)}#prompt-${encodeURIComponent(id)}`;
}
