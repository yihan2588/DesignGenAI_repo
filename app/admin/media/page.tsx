import Link from "next/link";
import Image from "next/image";
import { snapshot } from "@/lib/admin";
import { imageUrl } from "@/lib/humor/data";
import { Editor } from "../editor";
export default async function Media({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams,
    page = Math.max(1, Math.min(100000, Math.floor(Number(params.page)) || 1)),
    d = await snapshot(page);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">MEDIA LIBRARY</p>
          <h1>The raw material.</h1>
          <p>One entry holds an image and all its generated caption pairs.</p>
        </div>
        <Link className="button" href="/admin/media/new">
          Upload & generate ↗
        </Link>
      </header>
      <div className="media-grid">
        {d.media.map((i) => (
          <article className="panel media-entry" key={i.id}>
            <Image
              unoptimized
              src={imageUrl(i.storage_path)}
              alt={i.alt_text}
              width={600}
              height={350}
            />
            <div>
              <small>
                {i.id.slice(0, 8)} · {i.runs.length} pair(s)
              </small>
              <h2>{i.title}</h2>
              {i.runs.map((r) => (
                <div className="saved-pair" key={r.id}>
                  <span className="badge">{r.status}</span>
                  {r.caption_a && (
                    <p>
                      <b>A</b> {r.caption_a}
                    </p>
                  )}
                  {r.caption_b && (
                    <p>
                      <b>B</b> {r.caption_b}
                    </p>
                  )}
                  {r.status !== "ready" && (
                    <Link href={`/runs/${r.id}`}>Open saved run ↗</Link>
                  )}
                </div>
              ))}
              <details>
                <summary>Edit image details</summary>
                <Editor action="update_media" initial={{ id: i.id }}>
                  <label>
                    Title
                    <input
                      name="title"
                      maxLength={100}
                      required
                      defaultValue={i.title}
                    />
                  </label>
                  <label>
                    Accessible description
                    <textarea
                      name="alt_text"
                      maxLength={300}
                      required
                      defaultValue={i.alt_text}
                    />
                  </label>
                </Editor>
              </details>
              <details>
                <summary className="danger">Delete entire entry</summary>
                <p>
                  Permanently removes this image entry, every caption pair and
                  their votes. Type DELETE to confirm.
                </p>
                <Editor
                  action="delete_media"
                  initial={{ id: i.id }}
                  label="Delete entry permanently"
                >
                  <label>
                    Confirmation
                    <input
                      name="confirmation"
                      required
                      pattern="DELETE"
                      autoComplete="off"
                    />
                  </label>
                </Editor>
              </details>
            </div>
          </article>
        ))}
      </div>
      {!d.media.length && (
        <section className="panel">No entries on this page.</section>
      )}
      <div className="pagination">
        {page > 1 && <Link href={`?page=${page - 1}`}>← Previous</Link>}
        <span>Page {page}</span>
        {page * 50 < d.metrics.images && (
          <Link href={`?page=${page + 1}`}>Next →</Link>
        )}
      </div>
    </>
  );
}
