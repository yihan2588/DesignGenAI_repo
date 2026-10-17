"""Render the completed annotation audit without copying corpus text into Git."""
from __future__ import annotations

import argparse
from html import escape
import json
from pathlib import Path

from .annotations import read_jsonl


def render(root: Path) -> Path:
    summary = json.loads((root / 'summary.json').read_text())
    rows = read_jsonl(root / 'annotated-1000.jsonl')
    decisions = summary['decisions']
    pilot = summary['pilot']
    scale = summary['scale']
    data = json.dumps(rows, ensure_ascii=False).replace('<', '\\u003c')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HumorLLM — 1,000-entry annotation audit</title>
<style>
:root{--paper:#f8f5ee;--ink:#25312b;--muted:#526158;--line:#cbd0c5;--green:#185f4b}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 system-ui,sans-serif}
main{max-width:1100px;margin:auto;padding:35px 28px 80px}h1,h2{font-family:Georgia,serif;line-height:1.15;font-weight:500}h1{font-size:clamp(2.3rem,5vw,3.7rem);margin:20px 0}h2{font-size:1.8rem}
p{max-width:78ch}.small{font-size:14px;color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin:28px 0}.stat{padding:17px;background:#fffdf7;border:1px solid var(--line);border-radius:8px}.stat strong{display:block;font-size:30px;color:var(--green)}
.note{border-left:4px solid #9a441f;padding:10px 18px;background:#f1ebdf}.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:25px 0}label{display:grid;gap:5px;font-size:14px}input,select,button{font:inherit;min-height:44px;border:1px solid #718676;border-radius:5px;padding:7px 12px;background:#fffdf7;color:var(--ink)}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}input{max-width:100%;width:300px}:focus-visible{outline:3px solid #9a441f;outline-offset:3px}
details{padding:15px 18px;margin:12px 0;background:#fffdf7;border:1px solid var(--line);border-radius:7px}summary{cursor:pointer;font-weight:650}.tag{font-size:12px;padding:2px 7px;border:1px solid var(--line);border-radius:10px;margin-left:8px}.include{color:#185f4b}.exclude{color:#8b301e}.review{color:#765017}blockquote{margin:18px 0;padding-left:15px;border-left:2px solid var(--line)}dl{display:grid;grid-template-columns:130px 1fr;gap:8px 17px}dt{font-weight:650;font-size:14px}dd{margin:0;overflow-wrap:anywhere}code{font-size:13px;overflow-wrap:anywhere}a{color:var(--green);text-underline-offset:3px}.progress{min-height:30px}
@media(max-width:600px){main{padding:20px 16px}.stats{grid-template-columns:1fr 1fr}.toolbar{display:grid;grid-template-columns:1fr}input{width:100%}dl{display:block}dt{margin-top:15px}.tag{display:inline-block;margin-left:0;margin-right:5px}summary{line-height:1.8}}
@media print{.toolbar{display:none}body{background:white}main{max-width:none;padding:0}.stats{grid-template-columns:repeat(4,1fr)}details{break-inside:avoid}}
</style><main>
<p class="small">HumorLLM / private research corpus / 16 October 2026</p>
<h1>1,000 annotated jokes.<br>A record of what we checked.</h1>
<p>Three GPT-6 Luna workers annotated a stratified 200-entry pilot. The coordinator reviewed its source text and core semantic fields, revised the instructions, then dispatched the remaining 800 entries with a fresh overlap check.</p>
<div class="stats"><div class="stat"><strong>1000</strong>unique source entries</div><div class="stat"><strong>__INCLUDE__</strong>include candidates</div><div class="stat"><strong>__REVIEW__</strong>held for review</div><div class="stat"><strong>__EXCLUDE__</strong>excluded from the candidate subset</div></div>
<p>Among the include candidates, <strong>__SITUATIONAL__</strong> have a proposed reusable situation, <strong>__WORDPLAY__</strong> depend on particular words or sounds, and <strong>__LOW__</strong> have low situational transferability. These are model interpretations; none establishes support from an actual image.</p>
<div class="note"><strong>Model annotations, not human gold labels.</strong><p>Include means a candidate for private retrieval experiments under the stated policy. It does not prove funniness, image relevance, legal clearance, or production readiness. Uncertain records are held out. Human review and retrieval-usefulness tests remain outstanding.</p></div>
<h2>What the consistency checks showed</h2>
<p>The pilot had 30 shared records, each independently annotated by all three workers: <strong>__PILOT_PAIR__% pairwise decision agreement</strong> and <strong>__PILOT_UNAN__ / 30 unanimous decisions</strong>. Coordinator review revised <strong>__PILOT_EDITS__ / 200 records</strong>, including missed meanings and category/risk inconsistencies. The original worker outputs remain preserved.</p>
<p>The v2 expansion used 30 different shared records: <strong>__SCALE_PAIR__% pairwise decision agreement</strong> and <strong>__SCALE_UNAN__ / 30 unanimous decisions</strong>. These are consistency measures, not measured accuracy, and the two small samples differ. __REVIEW_SCOPE__</p>
<p class="small">__AGREEMENT_LIMITATIONS__ __REVIEW_SELECTION__</p>
<p class="small">Sampling balances the source binary label and two length bands, 250 records per stratum. It does not estimate the prevalence of good or bad records in the whole source. Source labels were not used as inclusion decisions. Gemini API calls in this annotation task: 0; sub-agents use Codex capacity.</p>
<h2>Inspect the records</h2>
<p>Each record retains the original joke, its source ID/hash, semantic interpretation, decision, risk flags, and review scope. The original text is displayed as data. Search is local; nothing is sent to a service.</p>
<div class="toolbar"><label>Decision<select id="decision"><option value="all">All decisions</option><option value="include">Include candidates</option><option value="review" selected>Held for review</option><option value="exclude">Excluded</option></select></label><label>Find text or ID<input id="search" type="search" placeholder="Search source text or annotation"></label><label>Review scope<select id="scope"><option value="all">Any review scope</option><option value="primary">Coordinator reviewed</option><option value="worker">Worker annotation only</option></select></label><button id="reset">Reset filters</button></div>
<p id="count" class="progress" role="status"></p><div id="records"></div>
<div class="toolbar"><button id="previous">Previous page</button><button id="next">Next page</button><span id="page" class="small"></span></div>
<noscript><p>JavaScript is disabled. The summary above remains readable. Open the JSONL files below for the complete annotations and review records.</p></noscript>
<h2>Files and next checks</h2><ul><li><a href="annotated-1000.jsonl">All 1,000 annotated records</a></li><li><a href="curated-research.jsonl">Include candidates for private research</a></li><li><a href="review-queue.jsonl">Held records</a></li><li><a href="summary.json">Machine-readable audit summary</a></li><li><a href="manifest.json">Source and dispatch manifest</a></li></ul>
<p>Before production or expansion to 10,000, obtain human review of representative included records and disputed interpretations; compare lexical, full-joke dense, and structured retrieval on the same records; audit held-out-caption overlap; and check source-use constraints. No embeddings, database imports, caption-quality experiment, or deployment were performed by this annotation task.</p>
<p class="small">Source: <a href="https://github.com/gorovuha/CleanComedy">CleanComedy English, gorovuha/CleanComedy</a>. The repository declares CC-BY-4.0. Attribution is retained; upstream per-item provenance remains a separate qualification. Source CSV SHA-256: <code>__SOURCE_HASH__</code>.</p>
</main><script id="data" type="application/json">__DATA__</script><script>
'use strict';const rows=JSON.parse(document.getElementById('data').textContent),$=id=>document.getElementById(id);let page=0;const size=25;
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function draw(){const q=$('search').value.toLocaleLowerCase().trim(),d=$('decision').value,s=$('scope').value;const selected=rows.filter(r=>(d==='all'||r.annotation.decision===d)&&(s==='all'||(s==='primary')===r.review.coordinator_reviewed)&&(!q||[r.id,r.text,r.annotation.situation,r.annotation.twist,r.annotation.reason].join(' ').toLocaleLowerCase().includes(q)));const pages=Math.max(1,Math.ceil(selected.length/size));page=Math.min(page,pages-1);$('count').textContent=selected.length+' matching records. Showing '+(selected.length?page*size+1:0)+'–'+Math.min((page+1)*size,selected.length)+'.';$('records').innerHTML=selected.slice(page*size,(page+1)*size).map(r=>{const a=r.annotation;return '<details><summary>'+esc(r.id)+' <span class="tag '+esc(a.decision)+'">'+esc(a.decision)+'</span> <span class="tag">'+esc(a.mechanism)+'</span> <span class="tag">'+esc(a.transferability)+'</span></summary><blockquote>'+esc(r.text)+'</blockquote><dl>'+[['Situation',a.situation],['Expectation',a.expectation],['Twist',a.twist],['Entities',a.entities.join(', ')||'None'],['Risk flags',a.risk_flags.join(', ')||'None recorded'],['Decision reason',a.reason],['Confidence',a.confidence+' (model self-assessment)'],['Review scope',r.review.scope],['Human review','Not performed'],['Source row',r.source_row],['Source hash',r.text_sha256]].map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl></details>';}).join('');$('previous').disabled=page===0;$('next').disabled=page>=pages-1;$('page').textContent='Page '+(page+1)+' / '+pages;}
for(const id of ['decision','search','scope'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;draw();});$('previous').addEventListener('click',()=>{page--;draw();});$('next').addEventListener('click',()=>{page++;draw();});$('reset').addEventListener('click',()=>{$('decision').value='review';$('scope').value='all';$('search').value='';page=0;draw();});draw();
</script></html>'''
    values = {
        '__INCLUDE__': decisions.get('include', 0), '__REVIEW__': decisions.get('review', 0),
        '__EXCLUDE__': decisions.get('exclude', 0),
        '__SITUATIONAL__': summary['include_transferability'].get('situational', 0),
        '__WORDPLAY__': summary['include_transferability'].get('wordplay_only', 0),
        '__LOW__': summary['include_transferability'].get('low', 0),
        '__PILOT_PAIR__': round(pilot['raw_agreement']['decision_pairwise_agreement'] * 100, 1),
        '__PILOT_UNAN__': pilot['raw_agreement']['decision_unanimous'],
        '__PILOT_EDITS__': pilot['revised_records'],
        '__SCALE_PAIR__': round(scale['raw_agreement']['decision_pairwise_agreement'] * 100, 1),
        '__SCALE_UNAN__': scale['raw_agreement']['decision_unanimous'],
        '__REVIEW_SCOPE__': summary['review_scope_description'],
        '__AGREEMENT_LIMITATIONS__': ' '.join(summary['agreement_limitations']),
        '__REVIEW_SELECTION__': summary['review_selection'],
        '__SOURCE_HASH__': summary['source_sha256'],
    }
    for marker, value in values.items():
        page = page.replace(marker, escape(str(value)))
    page = page.replace('__DATA__', data)
    target = root / 'report.html'
    target.write_text(page)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    args = parser.parse_args()
    print(render(args.root))


if __name__ == '__main__':
    main()
