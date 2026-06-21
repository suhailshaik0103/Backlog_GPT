const state = {
  sources: [],
  lastRun: null
};

const els = {
  mode: document.querySelector("#mode"),
  chunkCount: document.querySelector("#chunkCount"),
  sourceForm: document.querySelector("#sourceForm"),
  sources: document.querySelector("#sources"),
  generateForm: document.querySelector("#generateForm"),
  requirements: document.querySelector("#requirements"),
  traceability: document.querySelector("#traceability"),
  evaluation: document.querySelector("#evaluation"),
  exportBtn: document.querySelector("#exportBtn"),
  alert: document.querySelector("#alert")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showAlert(message) {
  els.alert.textContent = message;
  els.alert.hidden = !message;
}

function truncate(text, limit = 126) {
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}

function renderSources() {
  els.sources.innerHTML = "";
  if (!state.sources.length) {
    els.sources.innerHTML = `<div class="empty">No source evidence yet.</div>`;
    return;
  }

  for (const source of state.sources) {
    const item = document.querySelector("#sourceTemplate").content.firstElementChild.cloneNode(true);
    item.querySelector("h3").textContent = source.title;
    item.querySelector("p").textContent = `${source.type} · ${truncate(source.text)}`;
    const button = item.querySelector("button");
    button.addEventListener("click", async () => {
      await api(`/api/sources/${source.id}`, { method: "DELETE" });
      await loadState();
    });
    els.sources.append(item);
  }
}

function pill(text, className = "") {
  const span = document.createElement("span");
  span.className = `pill ${className}`.trim();
  span.textContent = text;
  return span;
}

function renderRequirements(run) {
  els.requirements.innerHTML = "";
  if (!run?.requirements?.length) {
    els.requirements.innerHTML = `<div class="empty">Generate a backlog to see requirements.</div>`;
    return;
  }

  const intro = document.createElement("div");
  intro.className = "empty";
  intro.textContent = `${run.summary} Mode: ${run.mode}.`;
  els.requirements.append(intro);

  for (const req of run.requirements) {
    const article = document.createElement("article");
    article.className = "requirement";

    const head = document.createElement("div");
    head.className = "req-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${req.id} · ${req.title}`;
    const story = document.createElement("p");
    story.textContent = req.userStory;
    titleWrap.append(title, story);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(
      pill(req.priority, "priority"),
      pill(`Effort ${req.effort}`),
      pill(`${req.confidence}% confidence`)
    );
    head.append(titleWrap, meta);

    const problem = document.createElement("p");
    problem.textContent = req.problem;

    const criteria = document.createElement("ol");
    criteria.className = "criteria";
    for (const ac of req.acceptanceCriteria || []) {
      const li = document.createElement("li");
      li.textContent = ac;
      criteria.append(li);
    }

    const stakeholders = document.createElement("div");
    stakeholders.className = "meta";
    for (const stakeholder of req.stakeholders || []) stakeholders.append(pill(stakeholder));

    const rationale = document.createElement("p");
    rationale.textContent = req.rationale;

    const citation = document.createElement("div");
    citation.className = "citation";
    const firstCitation = req.citations?.[0];
    citation.textContent = firstCitation
      ? `${firstCitation.sourceTitle}: ${firstCitation.snippet}`
      : "No citation attached.";

    article.append(head, problem, criteria, stakeholders, rationale, citation);
    els.requirements.append(article);
  }
}

function renderTraceability(run) {
  els.traceability.innerHTML = "";
  if (!run?.requirements?.length) {
    els.traceability.innerHTML = `<div class="empty">Traceability appears after generation.</div>`;
    return;
  }

  for (const req of run.requirements) {
    const row = document.createElement("article");
    row.className = "trace-row";
    const title = document.createElement("h3");
    title.textContent = `${req.id} · ${req.title}`;
    const details = document.createElement("p");
    details.textContent = `Stakeholders: ${(req.stakeholders || []).join(", ")}. Cited chunks: ${(req.citations || []).map((c) => c.chunkId).join(", ")}.`;
    const source = document.createElement("div");
    source.className = "citation";
    source.textContent = req.citations?.map((c) => `${c.sourceTitle}: ${c.snippet}`).join(" ") || "No source citation.";
    row.append(title, details, source);
    els.traceability.append(row);
  }
}

function renderEvaluation(run) {
  els.evaluation.innerHTML = "";
  if (!run?.evaluation?.length) {
    els.evaluation.innerHTML = `<div class="empty">Evaluation appears after generation.</div>`;
    return;
  }

  for (const item of run.evaluation) {
    const row = document.createElement("article");
    row.className = "score-row";
    const title = document.createElement("h3");
    title.textContent = item.dimension;
    const track = document.createElement("div");
    track.className = "score-track";
    track.setAttribute("aria-label", `${item.score} out of 4`);
    const fill = document.createElement("div");
    fill.className = "score-fill";
    fill.style.width = `${Math.max(0, Math.min(100, (item.score / 4) * 100))}%`;
    track.append(fill);
    const note = document.createElement("p");
    note.textContent = `${item.score}/4 · ${item.note}`;
    row.append(title, track, note);
    els.evaluation.append(row);
  }
}

function renderRun(run) {
  state.lastRun = run;
  els.exportBtn.disabled = !run;
  renderRequirements(run);
  renderTraceability(run);
  renderEvaluation(run);
}

async function loadState() {
  const data = await api("/api/state");
  state.sources = data.sources;
  els.mode.textContent = data.llmMode;
  els.chunkCount.textContent = `${data.chunkCount} chunks`;
  renderSources();
  renderRun(state.lastRun || data.runs?.[0] || null);
}

els.sourceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert("");
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/sources", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    event.currentTarget.reset();
    await loadState();
  } catch (error) {
    showAlert(error.message);
  }
});

els.generateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert("");
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Generating";
  try {
    const form = new FormData(event.currentTarget);
    const run = await api("/api/generate", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    if (run.warning) showAlert(`OpenAI call fell back to local RAG: ${run.warning}`);
    renderRun(run);
    await loadState();
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Generate";
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((candidate) => {
      const selected = candidate === tab;
      candidate.classList.toggle("active", selected);
      candidate.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      const selected = panel.id === tab.dataset.tab;
      panel.classList.toggle("active", selected);
      panel.hidden = !selected;
    });
  });
});

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.lastRun, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "backlog-gpt-run.json";
  link.click();
  URL.revokeObjectURL(url);
});

renderRun(null);
loadState().catch((error) => showAlert(error.message));
