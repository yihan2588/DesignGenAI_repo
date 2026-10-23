import Link from "next/link";
import { snapshot } from "@/lib/admin";
import { leaderboard } from "@/lib/arena";
export default async function Overview() {
  const d = await snapshot(),
    m = d.metrics;
  const rankings = leaderboard(
    d.prompts.filter((p) => !p.archived || d.matchups.some((m) => m.first_id === p.id || m.second_id === p.id)).map((p) => p.id),
    d.matchups,
  );
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
          <h2>Which approach gets the laugh?</h2>
          <p>
            Each row is an immutable prompt revision. Ranks apply within the same opponent group (G), where candidates are connected by saved comparisons.
          </p>
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
                        <b>{p.name}</b>
                        <small>
                          {p.id.slice(0, 8)} · {p.model}
                          {p.archived ? " · retired" : ""}
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
          <p className="footnote">
            Regularized Bradley–Terry scores, centered near 1000; no-vote
            candidates are unrated. Intervals describe raw win rates, assuming
            independent votes. Repeated voters/images and unequal matchups limit
            certainty. Scores across disconnected opponent groups are not
            comparable. {m.unmapped_votes} legacy votes lack verified revision
            provenance and are excluded.
          </p>
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
          <h3>The active matchup</h3>
          {[d.active.first_id, d.active.second_id].map((id, i) => (
            <div className="active-slot" key={id}>
              <span>{i + 1}</span>
              <div>
                <b>{d.prompts.find((p) => p.id === id)?.name}</b>
                <small>
                  {id.slice(0, 8)} · randomized to A/B for each image
                </small>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>Head-to-head results</h2>
        {d.matchups.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Candidate 1</th>
                  <th>Candidate 2</th>
                  <th>Wins 1 : 2</th>
                  <th>Voters</th>
                </tr>
              </thead>
              <tbody>
                {d.matchups.map((x) => (
                  <tr key={x.first_id + x.second_id}>
                    <td>
                      {d.prompts.find((p) => p.id === x.first_id)?.name}{" "}
                      <small>{x.first_id.slice(0, 8)}</small>
                    </td>
                    <td>
                      {d.prompts.find((p) => p.id === x.second_id)?.name}{" "}
                      <small>{x.second_id.slice(0, 8)}</small>
                    </td>
                    <td>
                      {x.first_wins} : {x.n - x.first_wins}
                    </td>
                    <td>{x.voters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>The first saved votes will appear here.</p>
        )}
      </section>
    </>
  );
}
