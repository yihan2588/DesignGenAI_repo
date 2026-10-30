"use strict";
document.documentElement.classList.add("js");
const creative = {
  literal: ["Purr-forming at maximum productivity.", "This names the cat through wordplay, but the groupmate’s unearned credit is lost. Object relevance does not establish humor or intent fit."],
  oblique: ["Put my name on it.", "The caption omits the cat and laptop. The pose and the user’s context can supply the missing connection to unearned credit."],
  random: ["The moon owes me rent.", "Surprise alone is insufficient. With this image and spirit, the intended connection is not recoverable without inventing extra context."]
};
document.querySelectorAll('input[name="creative-case"]').forEach(input => input.addEventListener("change", () => {
  const pair = creative[input.value]; if (!pair) return;
  document.getElementById("creative-text").textContent = pair[0];
  document.getElementById("creative-reason").textContent = pair[1];
}));
const retrieval = {
  literal: {
    queries: "Queries: to-do lists; planning software; productivity workspace.",
    rows: [["Laptop with an elaborate planner", "Direct topic match", "The list has a project manager now."],["Desk covered in sticky notes", "Shared planning objects", "Progress, in several colors."],["Person holding a checklist", "Shared task vocabulary", "Added completing the list to the list."]],
    reason: "All candidates share planning objects. This may work, but it can miss a stronger visual analogy. These are illustrative possibilities, not a measured ranking."
  },
  relational: {
    queries: "Queries: to-do lists; preparation replacing action; elaborate readiness with no movement.",
    rows: [["Athlete still at the starting line", "Readiness without action", "Preparation is going incredibly well."],["Person comfortable behind bars", "Self-imposed confinement", "I built myself a system."],["Laptop with an elaborate planner", "Direct topic match", "The list has a project manager now."]],
    reason: "The relationship channels admit images without a planner. The writer must still choose a pairing with an understandable comic connection."
  }
};
document.querySelectorAll('input[name="retrieval-strategy"]').forEach(input => input.addEventListener("change", () => {
  const state = retrieval[input.value]; if (!state) return;
  document.getElementById("query-view").textContent = state.queries;
  document.querySelector("#retrieval-table tbody").replaceChildren(...state.rows.map(values => {
    const tr = document.createElement("tr");
    values.forEach((value,i) => {const td = document.createElement("td");td.dataset.label = ["Candidate scene","Why it enters the shortlist","Possible caption"][i];td.textContent = value;tr.appendChild(td);});
    return tr;
  }));
  document.getElementById("retrieval-reason").textContent = state.reason;
}));
const composeTime = document.getElementById("compose-time");
const critic = document.getElementById("extra-critic");
function updateLatency() {
  const mode = document.querySelector('input[name="latency-mode"]:checked').value;
  const composition = Math.max(.5, Math.min(12, Number(composeTime.value)||3.5));
  const interpretation = mode === "pic" ? 1.6 : 1.0;
  const search = mode === "pic" ? 0 : .4;
  const media = mode === "pic" ? 0 : .8;
  const edit = critic.checked ? 2 : 0;
  const total = interpretation + search + Math.max(composition,media) + .2 + edit;
  document.getElementById("compose-value").textContent = composition.toFixed(1)+" s";
  document.getElementById("latency-result").textContent = `${total.toFixed(1)} seconds for the illustrated ${mode === "pic" ? "picture" : "thought"} path; ${critic.checked ? 3 : 2} generation calls.${total > 15 ? " This example exceeds the 15-second generation deadline." : ""}`;
  const stages = [["Interpret", interpretation], ...(search ? [["Retrieve", search]] : []), [mode === "pic" ? "Compose" : "Compose / media", Math.max(composition, media)], ["Layout", .2], ...(edit ? [["Critic", edit]] : [])];
  document.getElementById("latency-bars").replaceChildren(...stages.map(([name,seconds]) => {
    const span = document.createElement("span"); span.style.flexGrow = String(seconds); span.title = `${name} ${seconds.toFixed(1)} s`; return span;
  }));
  document.getElementById("latency-bars").setAttribute("aria-label", "Proportional stage durations: " + stages.map(([name, seconds]) => `${name} ${seconds.toFixed(1)} s`).join(", "));
  document.getElementById("latency-legend").replaceChildren(...stages.map(([name,seconds]) => {
    const item = document.createElement("span"); item.textContent = `${name}: ${seconds.toFixed(1)} s`; return item;
  }));
  const base = mode === "pic" ? `1.6 interpretation + ${composition.toFixed(1)} composition` : `1.0 interpretation + 0.4 retrieval + max(${composition.toFixed(1)} composition, 0.8 media fetch)`;
  document.querySelector("#latency-formula code").textContent = `${base} + 0.2 layout${critic.checked ? " + 2.0 critic" : ""} = ${total.toFixed(1)} s`;
}
composeTime.addEventListener("input",updateLatency);
critic.addEventListener("change",updateLatency);
document.querySelectorAll('input[name="latency-mode"]').forEach(input=>input.addEventListener("change",updateLatency));
document.getElementById("reset-latency").addEventListener("click",()=>{composeTime.value="3.5";critic.checked=false;document.querySelector('input[name="latency-mode"][value="pic"]').checked=true;updateLatency();});
updateLatency();
const links=[...document.querySelectorAll(".rail nav a")];
function setCurrent(id) { links.forEach(link=>{ if(link.hash==="#"+id) link.setAttribute("aria-current","location"); else link.removeAttribute("aria-current"); }); }
setCurrent(location.hash.slice(1)||"start");
links.forEach(link=>link.addEventListener("click",()=>setCurrent(link.hash.slice(1))));
if("IntersectionObserver" in window) {
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)setCurrent(e.target.id);}),{rootMargin:"-5% 0px -75% 0px",threshold:0});
  document.querySelectorAll("main > section").forEach(section=>observer.observe(section));
}
let printOpen=[];
window.addEventListener("beforeprint",()=>{printOpen=[...document.querySelectorAll("details")].filter(d=>!d.open);printOpen.forEach(d=>d.open=true);});
window.addEventListener("afterprint",()=>{printOpen.forEach(d=>d.open=false);printOpen=[];});

// Two-list worked example. These ranks are authored teaching inputs.
const fusionRank = document.getElementById("fusion-rank");
fusionRank.addEventListener("change", () => {
  const present = fusionRank.value !== "absent";
  const rank = Number(fusionRank.value);
  const score = 1 / 69 + (present ? 1 / (60 + rank) : 0);
  document.getElementById("fusion-result").textContent = `B: 1/69${present ? ` + 1/${60 + rank}` : " + 0"} = ${score.toFixed(5)}. ${score > 1/61 ? "B outranks A through evidence from two lists." : "A outranks B: neither has support from the relationship list."}`;
});
const publicationStates = [
  "1. Draft: revision 7 exists privately. There is no public post.",
  "2. Publish: public snapshot 7 becomes visible. Publishing again with the same key does not create another post.",
  "3. Edit privately: revision 8 exists, but public snapshot 7 stays unchanged.",
  "4. Admin removes: snapshot 7 is hidden, reports are resolved, and the owner cannot republish it.",
  "5. Admin restores: public snapshot 7 returns to the gallery. Posts that were private before removal stay private."
];
let publicationIndex = 0;
function renderPublication() {
  document.getElementById("publication-step").textContent = publicationStates[publicationIndex];
  document.getElementById("publication-prev").disabled = publicationIndex === 0;
  document.getElementById("publication-next").disabled = publicationIndex === publicationStates.length - 1;
  document.querySelectorAll(".state-track li").forEach((item,index) => {
    if (index === publicationIndex) item.setAttribute("aria-current","step"); else item.removeAttribute("aria-current");
  });
}
document.getElementById("publication-prev").addEventListener("click", () => { publicationIndex = Math.max(0,publicationIndex-1); renderPublication(); });
document.getElementById("publication-next").addEventListener("click", () => { publicationIndex = Math.min(publicationStates.length-1,publicationIndex+1); renderPublication(); });
document.getElementById("publication-reset").addEventListener("click", () => { publicationIndex = 0; renderPublication(); });
renderPublication();
