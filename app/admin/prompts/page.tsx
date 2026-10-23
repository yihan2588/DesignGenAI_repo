import Link from "next/link";
import { isUuid } from "@/lib/humor/schemas";
import { BASELINE_PROMPT, PLAN_PROMPT, candidatePrompt } from "@/lib/humor/prompts";
import { snapshot } from "@/lib/admin";
import { METADATA_PROMPT } from "@/lib/humor/metadata";
import { MODELS } from "@/lib/humor/configured";
import { Editor } from "../editor";
import type { Revision } from "@/lib/admin-types";
function Fields({ p }: { p?: Revision }) {
  return (
    <>
      <label>
        Name
        <input
          name="name"
          maxLength={80}
          required
          defaultValue={p?.name ?? ""}
        />
      </label>
      <p className="footnote">Use a unique name, including retired configurations. Capitalization and extra spaces do not make a name different.</p>
      <div className="form-row">
        <label>
          Gemini model
          <select name="model" defaultValue={p?.model ?? MODELS[0]}>
            {MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Temperature
          <input
            name="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            required
            defaultValue={p?.temperature ?? 1}
          />
        </label>
      </div>
      <p className="footnote">
        Gemini 3.6+ models ignore custom temperatures; use 3.1 Flash-Lite or 2.5
        for temperature experiments. Model access depends on the configured
        Gemini project.
      </p>
      <label>
        System prompt
        <textarea
          name="system_prompt"
          maxLength={12000}
          rows={3}
          defaultValue={p?.system_prompt ?? ""}
        />
      </label>
      <label>
        Caption prompt
        <textarea
          name="prompt"
          maxLength={12000}
          rows={12}
          required
          defaultValue={
            p?.prompt ?? "Write a funny, grounded caption for this image."
          }
        />
      </label>
      <p className="footnote">
        These two fields are the complete caption instructions sent to Gemini.
        Put any visual analysis, audience, topic, or candidate-selection directions here.
        Both candidates use the same generation path; no retrieval or hidden creative prompt is added.
        The app requires one JSON caption string and validates the 240-character limit.
        If captions are identical, candidate 2 is retried once with “Do not repeat this caption” and candidate 1’s text.
      </p>
    </>
  );
}
function Configuration({p, selected, active}: {p: Revision; selected: boolean; active: boolean}) {
  const legacy = p.prompt.startsWith("Historical humor-mvp-3 ");
  const historicalPlan = p.archived && p.engine === "planned";
  const clonePrompt = legacy || historicalPlan
    ? historicalPlan
      ? "Audience: English-speaking college students. Privately identify concrete visible details, find an incongruity, consider three different grounded joke angles, and draft three captions. Select the strongest for visual relevance, surprise, clarity and brevity. Do not invent sensitive personal attributes or copy joke overlays. Return only JSON with a single caption string, at most 240 characters."
      : BASELINE_PROMPT
    : p.prompt;
  return <section className="panel configuration-card" id={`prompt-${p.id}`}>
    <p className="eyebrow">{active ? "● ACTIVE" : p.archived ? "RETIRED · HISTORY" : "○ AVAILABLE"} · {p.id.slice(0,8)}</p>
    <h2>{p.name}</h2>
    <small>Created {new Date(p.created_at).toLocaleDateString("en-US", {timeZone: "America/New_York"})}</small>
    {p.archived && <p>This configuration is retired. Its past votes are preserved.
      Reuse it below to create an editable new configuration; historical results stay unchanged.</p>}
    {(legacy || historicalPlan) && <details open={selected}>
      <summary>Inspect original generation instructions</summary>
      <p>{legacy ? "This predates Prompt Lab. The old app used fixed generation code at commit 13edf43." : "This retired revision used fixed visual-planning instructions in addition to its saved prompt."}
        {historicalPlan ? " It analyzed the image, then generated and selected from three captions." : " It generated a caption directly."}
        The reusable prompt below adapts this method to the current single-request format.</p>
      {!legacy && <><h3>Saved caption instructions</h3><pre>{p.prompt}</pre></>}
      {historicalPlan ? <><h3>Image analysis</h3><pre>{PLAN_PROMPT}</pre><h3>Caption selection template</h3><pre>{candidatePrompt("[image analysis from the previous request]")}</pre></> : <pre>{BASELINE_PROMPT}</pre>}
    </details>}
    <details open={selected}>
      <summary>{p.archived ? "Reuse as a new configuration" : "View / edit configuration"}</summary>
      {!p.archived && <p>Saving overwrites this configuration. If selected in the live A/B test, new uploads use the changes immediately. Only manual retirement moves it to history.</p>}
      <Editor action="save_prompt" initial={p.archived ? {parent_id:p.id} : {id:p.id}} label={p.archived ? "Create reusable configuration" : "Save changes"}>
        <Fields p={{...p, name:p.archived ? `${p.name} · new`.slice(0,80) : p.name, prompt:clonePrompt}} />
      </Editor>
    </details>
    {!p.archived && <details>
      <summary className="danger">Retire configuration</summary>
      <p>Moves it to history. Past votes and prompts are preserved. Replace an active configuration before retiring it.</p>
      <Editor action="delete_prompt" initial={{id:p.id}} label="Move to history" />
    </details>}
  </section>;
}
export default async function Prompts({searchParams}: {searchParams: Promise<{revision?: string; history?: string}>}) {
  const params = await searchParams;
  const selected = isUuid(params.revision) ? params.revision : undefined;
  const d = await snapshot(), available = d.prompts.filter(p => !p.archived), retired = d.prompts.filter(p => p.archived);
  const selectedPrompt = d.prompts.find(p => p.id === selected);
  const active = new Set([d.active.first_id,d.active.second_id]);
  return <>
    <header className="page-heading"><div><p className="eyebrow">PROMPT LAB</p><h1>Find your funny.</h1><p>View, edit and compare your caption configurations.</p></div><Link href="/admin">View comparison results ↗</Link></header>
    {selected && !selectedPrompt && <section className="panel">This configuration could not be found. Choose one from the library below.</section>}
    <section className="panel experiment"><h2>Live A/B test</h2>
      <p>Choose exactly two configurations for new uploads. Existing captions keep the instructions and names used when they were generated. Votes accumulate per configuration across edits.
        Candidate 1 and 2 are randomized to left/right A/B positions. Names are revealed after voting.
        <a href="https://design-gen-ai-repo.vercel.app/upload"> Test a new upload ↗</a></p>
      <Editor action="activate" label="Activate this pair"><div className="form-row">
        {["first_id","second_id"].map((name,i) => <label key={name}>Candidate {i+1}<select name={name} defaultValue={i ? d.active.second_id : d.active.first_id}>
          {available.map(p => <option key={p.id} value={p.id}>{p.name} · {p.id.slice(0,8)}</option>)}
        </select></label>)}
      </div></Editor>
    </section>
    <h2>Your configurations <span className="badge">{available.length}</span></h2>
    <div className="prompt-grid">{available.map(p => <Configuration key={p.id} p={p} selected={selected===p.id} active={active.has(p.id)} />)}</div>
    <details className="panel configuration-history" open={params.history==="1" || Boolean(selectedPrompt?.archived)}>
      <summary>Configuration history · {retired.length} retired</summary>
      <p>These include older app experiments and retired drafts. They cannot be selected for new uploads;
        inspect their saved instructions or reuse them as a new configuration.</p>
      <div className="prompt-grid">{retired.map(p => <Configuration key={p.id} p={p} selected={selected===p.id} active={false} />)}</div>
    </details>
    <details className="panel"><summary>Create a configuration</summary><Editor action="save_prompt" label="Create configuration"><Fields /></Editor></details>
    <details className="panel"><summary>How requests are assembled</summary>
      <p>The editable system and caption prompts are sent as written alongside the image. Both configurations use the same path, with no retrieval or hidden creative prompt.</p>
      <h3>Shared image metadata request</h3><p>This separate request only supplies a neutral title and description; neither caption receives its output.</p><pre>{METADATA_PROMPT}</pre>
      <p>Metadata model: gemini-3.1-flash-lite; temperature: 1; system prompt: empty.</p>
    </details>
  </>;
}
