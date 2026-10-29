export type Matchup = {
  first_id: string;
  second_id: string;
  n: number;
  first_wins: number;
  voters: number;
};
export function wilson(w: number, n: number) {
  if (!n) return [0, 1];
  const z = 1.96,
    p = w / n,
    d = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
export type PairTotal = Omit<Matchup, "voters">;
export function combineMatchups(matchups: PairTotal[]): PairTotal[] {
  // Activating the same pair in reverse order must not add a second prior.
  const pairs = new Map<string, PairTotal>();
  for (const m of matchups) {
    const reversed = m.first_id > m.second_id;
    const first_id = reversed ? m.second_id : m.first_id;
    const second_id = reversed ? m.first_id : m.second_id;
    const key = JSON.stringify([first_id, second_id]);
    const row = pairs.get(key) ?? {first_id, second_id, n:0, first_wins:0};
    row.n += m.n;
    row.first_wins += reversed ? m.n-m.first_wins : m.first_wins;
    pairs.set(key,row);
  }
  return [...pairs.values()].sort((a,b) => a.first_id.localeCompare(b.first_id) || a.second_id.localeCompare(b.second_id));
}
// Regularized Bradley–Terry: order-independent fit, one symmetric prior win per direction.
export function leaderboard(ids: string[], matchups: PairTotal[]) {
  matchups = combineMatchups(matchups);
  const played = new Map(ids.map((id) => [id, { wins: 0, n: 0 }]));
  for (const m of matchups) {
    const a = played.get(m.first_id),
      b = played.get(m.second_id);
    if (!a || !b) continue;
    a.wins += m.first_wins;
    a.n += m.n;
    b.wins += m.n - m.first_wins;
    b.n += m.n;
  }
  const scores = new Map(ids.map((id) => [id, 0]));
  for (let k = 0; k < 600; k++) {
    const grad = new Map(ids.map((id) => [id, -0.5 * scores.get(id)!]));
    for (const m of matchups) {
      if (!scores.has(m.first_id) || !scores.has(m.second_id)) continue;
      const p =
          1 /
          (1 + Math.exp(scores.get(m.second_id)! - scores.get(m.first_id)!)),
        g = m.first_wins + 1 - (m.n + 2) * p;
      grad.set(m.first_id, grad.get(m.first_id)! + g);
      grad.set(m.second_id, grad.get(m.second_id)! - g);
    }
    const scale =
      0.5 / Math.max(1, ...[...played.values()].map((x) => x.n + ids.length));
    for (const id of ids)
      scores.set(id, scores.get(id)! + scale * grad.get(id)!);
  }
  const neighbors = new Map(ids.map(id => [id, new Set<string>()]));
  for (const m of matchups) if(m.n>0 && neighbors.has(m.first_id) && neighbors.has(m.second_id)) {
    neighbors.get(m.first_id)!.add(m.second_id); neighbors.get(m.second_id)!.add(m.first_id);
  }
  const groups = new Map<string,number>(); let nextGroup=0;
  for (const id of [...ids].sort()) {
    if(groups.has(id) || !played.get(id)!.n) continue;
    nextGroup++; const queue=[id]; groups.set(id,nextGroup);
    for(let i=0;i<queue.length;i++) for(const other of neighbors.get(queue[i])!) if(!groups.has(other)) {groups.set(other,nextGroup);queue.push(other);}
  }
  const ranks=new Map<number,{count:number; rating:number; rank:number}>();
  return ids
    .map((id) => {
      const p = played.get(id)!;
      return {
        id,
        group: groups.get(id) ?? 0,
        ...p,
        rating: Math.round(1000 + (400 / Math.log(10)) * scores.get(id)!),
        interval: wilson(p.wins, p.n),
      };
    })
    .sort(
      (a, b) =>
        Number(b.n > 0) - Number(a.n > 0) ||
        a.group - b.group ||
        b.rating - a.rating ||
        a.id.localeCompare(b.id),
    ).map(row=>{
      if(!row.n) return {...row,rank:0};
      const previous=ranks.get(row.group);
      const count=(previous?.count??0)+1;
      const rank=previous?.rating===row.rating ? previous.rank : count;
      ranks.set(row.group,{count,rating:row.rating,rank});
      return {...row,rank};
    });
}
