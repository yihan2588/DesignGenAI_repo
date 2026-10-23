import Link from "next/link";
import { snapshot } from "@/lib/admin";
import { arenaView, promptLink } from "@/lib/arena-view";
import { combineMatchups, leaderboard } from "@/lib/arena";
export default async function Overview({searchParams}: {searchParams: Promise<{view?: string}>}) {
  const history = (await searchParams).view === "history";
  const d = await snapshot(), m = d.metrics;
  const view = arenaView(d.prompts, d.active, d.matchups, history);
  const rankings = leaderboard(view.ids, view.matchups);
  const headToHead = combineMatchups(view.matchups);
  const max = Math.max(1, ...d.daily.map((x) => x.votes));
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">THE EXPERIMENT AT A GLANCE</p>
          <h1>What’s landing?</h1>
          <p>One image. Two takes. A collective sense of humor.</p>
        </div>
        <Link className="button" href="/admin/prompts">
          Tune the experiment ↗
        </Link>
      </header>
      <section className="metrics">
        {[
          ["Image entries", m.images, "The visual starting points"],
          ["Caption pairs", m.ready, `${m.failed} failed generations`],
          ["Preferences cast", m.votes, `${m.voters} distinct voters`],
          ["People", m.profiles, "Google-linked profiles"],
        ].map(([label, n, caption]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{n}</strong>
            <small>{caption}</small>
          </article>
        ))}
      </section>
      <div className="overview-grid">
        <section className="panel arena">
          <p className="eyebrow">THE CAPTION ARENA</p>
          <h2>{history ? "Configuration history" : "Your active A/B test"}</h2>
          <nav className="view-tabs" aria-label="Results scope">
            <Link href="/admin" aria-current={!history ? "page" : undefined}>Active pair</Link>
            <Link href="/admin?view=history" aria-current={history ? "page" : undefined}>All historical results</Link>
          </nav>
          <p>{history
            ? "Past votes stay attached to the exact configuration that generated each caption. Retired configurations are preserved in Prompt Lab’s history. Select a name to inspect it or create a new version."
            : "Only comparisons between the two currently selected configurations are shown here. Select a name to view or edit its prompt in Prompt Lab."}</p>
          {!view.matchups.length && <p className="empty-note">No votes for this pair yet. Votes from previous experiments are under <Link href="/admin?view=history">All historical results</Link>.</p>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank / configuration</th>
                  <th>Arena score</th>
                  <th>Win rate · 95% interval</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => {
                  const p = d.prompts.find((p) => p.id === r.id)!;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="rank">{r.n ? `G${r.group} · #${r.rank}` : "—"}</span>
                        <Link className="configuration-link" href={promptLink(p.id)}>{p.name}</Link>
                        <small>
                          {p.id.slice(0, 8)} · {p.model}
                          {p.archived ? " · retired — view in history" : " · available in Prompt Lab"}
                        </small>
                      </td>
                      <td>{r.n ? r.rating : "Unrated"}</td>
                      <td>
                        {r.n ? (
                          <>
                            <div className="confidence">
                              <span
                                style={{
                                  left: `${100 * r.interval[0]}%`,
                                  width: `${100 * (r.interval[1] - r.interval[0])}%`,
                                }}
                              />
                              <i style={{ left: `${(100 * r.wins) / r.n}%` }} />
                            </div>
                            <small>
                              {Math.round((100 * r.wins) / r.n)}% ·{" "}
                              {r.interval
                                .map((x) => Math.round(x * 100))
                                .join("–")}
                              %{r.n < 30 ? " · small sample" : ""}
                            </small>
                          </>
                        ) : (
                          "Awaiting votes"
                        )}
                      </td>
                      <td>{r.n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details><summary>How scores are calculated</summary><p className="footnote">
            Regularized Bradley–Terry scores, centered near 1000; no-vote
            candidates are unrated. Intervals describe raw win rates, assuming
            independent votes. Repeated voters/images and unequal matchups limit
            certainty. Scores across disconnected opponent groups are not
            comparable. {m.unmapped_votes} legacy votes lack verified revision
            provenance and are excluded.
          </p></details>
        </section>
        <section className="panel activity">
          <p className="eyebrow">PULSE / LAST 14 DAYS</p>
          <h2>A little audience participation.</h2>
          <div
            className="bar-chart"
            role="img"
            aria-label={
              d.daily.map((x) => `${x.day}: ${x.votes} votes`).join("; ") ||
              "No votes in the last 14 days"
            }
          >
            {d.daily.length ? (
              d.daily.map((x) => (
                <div key={x.day}>
                  <span>{x.votes}</span>
                  <i
                    style={{
                      height: `${Math.max(3, (150 * x.votes) / max)}px`,
                    }}
                  />
                  <small>{x.day.slice(5)}</small>
                </div>
              ))
            ) : (
              <p>No recent votes yet.</p>
            )}
          </div>
          <p className="footnote">UTC dates · days with votes shown</p>
          <hr />
          <h3>Selected for new uploads</h3>
          {[d.active.first_id, d.active.second_id].map((id, i) => (
            <div className="active-slot" key={id}>
              <span>{i + 1}</span>
              <div>
                <Link className="configuration-link" href={promptLink(id)}>{d.prompts.find((p) => p.id === id)?.name}</Link>
                <small>
                  {id.slice(0, 8)} · randomized to A/B for each image
                </small>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>{history ? "Historical head-to-head results" : "Active pair · head-to-head"}</h2>
        {view.matchups.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Candidate 1</th>
                  <th>Candidate 2</th>
                  <th>Wins 1 : 2</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {headToHead.map((x) => (
                  <tr key={x.first_id + x.second_id}>
                    <td>
                      <Link href={promptLink(x.first_id)}>{d.prompts.find((p) => p.id === x.first_id)?.name}</Link>{" "}
                      <small>{x.first_id.slice(0, 8)}</small>
                    </td>
                    <td>
                      <Link href={promptLink(x.second_id)}>{d.prompts.find((p) => p.id === x.second_id)?.name}</Link>{" "}
                      <small>{x.second_id.slice(0, 8)}</small>
                    </td>
                    <td>
                      {x.first_wins} : {x.n - x.first_wins}
                    </td>
                    <td>{x.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No saved votes for the selected configurations yet.</p>
        )}
      </section>
    </>
  );
}
