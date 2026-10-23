import Link from "next/link";
import { snapshot } from "@/lib/admin";
export default async function People({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams,
    page = Math.max(1, Math.min(100000, Math.floor(Number(params.page)) || 1)),
    d = await snapshot(page);
  return (
    <>
      <p className="eyebrow">THE PEOPLE BEHIND THE PREFERENCES</p>
      <h1>Every vote has a voice.</h1>
      <p>
        Read-only profiles and saved A/B preferences. A preference selects a
        winner, rather than a numeric rating.
      </p>
      <section className="panel">
        <h2>
          Profiles <span className="badge">{d.metrics.profiles}</span>
        </h2>
        {!d.profiles.length && <p>No profiles on this page. <Link href="/admin/people">Back to the first page →</Link></p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Google email</th>
                <th>Access</th>
                <th>Profile ID</th>
              </tr>
            </thead>
            <tbody>
              {d.profiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") ||
                      "Incomplete profile"}
                  </td>
                  <td>{p.email}</td>
                  <td>{p.is_superadmin ? "Superadmin" : "Member"}</td>
                  <td>
                    <code>{p.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Role changes require trusted database access. Members cannot promote
          themselves.
        </p>
      </section>
      <section className="panel">
        <h2>
          Vote ledger <span className="badge">{d.metrics.votes}</span>
        </h2>
        {!d.votes.length && <p>No votes on this page. <Link href="/admin/people">Back to the first page →</Link></p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Winner slot</th>
                <th>Voter ID</th>
                <th>Saved at (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {d.votes.map((v) => (
                <tr key={v.run_id + v.user_id}>
                  <td>
                    {v.title}
                    <small>{v.run_id}</small>
                  </td>
                  <td>
                    <span className="badge">{v.choice}</span>
                  </td>
                  <td>
                    <code>{v.user_id}</code>
                  </td>
                  <td>
                    {new Date(v.created_at)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="pagination">
        {page > 1 && <Link href={`?page=${page - 1}`}>← Previous</Link>}
        <span>Page {page}</span>
        {page * 50 < Math.max(d.metrics.profiles, d.metrics.votes) && (
          <Link href={`?page=${page + 1}`}>Next →</Link>
        )}
      </div>
    </>
  );
}
