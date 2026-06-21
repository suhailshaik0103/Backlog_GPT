import fs from "node:fs/promises";
import path from "node:path";
import { stableId } from "./rag.js";

const DATA_DIR = path.resolve("data");
const DB_PATH = path.join(DATA_DIR, "backlog-gpt.json");

const seedText = `Customer Success and Sales reviewed onboarding analytics. Trial customers struggle to translate kickoff calls into prioritized backlog items, and support says PMs ask for source links before trusting AI-generated specs. Engineering warned that long meeting transcripts exceed context windows unless they are compressed before generation. The team decided every generated requirement must cite source evidence, include acceptance criteria, and show stakeholder traceability. Next action: ship a lightweight local prototype that ingests notes, retrieves relevant chunks, and generates ranked requirements with confidence and effort.`;

const seed = {
  sources: [{
    id: stableId("src", "seed-source"),
    title: "Seed PM Interview Notes",
    type: "interview",
    text: seedText,
    createdAt: new Date().toISOString()
  }],
  runs: []
};

export async function readDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeDb(seed);
    return seed;
  }
}

export async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

export async function addSource({ title, type, text }) {
  const db = await readDb();
  const source = {
    id: stableId("src", `${title}:${text}:${Date.now()}`),
    title: title?.trim() || "Untitled source",
    type: type || "note",
    text: text?.trim() || "",
    createdAt: new Date().toISOString()
  };
  db.sources.unshift(source);
  await writeDb(db);
  return source;
}

export async function deleteSource(id) {
  const db = await readDb();
  db.sources = db.sources.filter((source) => source.id !== id);
  await writeDb(db);
  return { ok: true };
}

export async function saveRun(run) {
  const db = await readDb();
  db.runs.unshift({ ...run, id: run.id || stableId("run", `${run.productGoal}:${run.generatedAt}`) });
  db.runs = db.runs.slice(0, 20);
  await writeDb(db);
}
