import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addSource, deleteSource, readDb, saveRun } from "./store.js";
import { buildIndex, retrieve } from "./rag.js";
import { generateBacklog } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res, status, data, headers = {}) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": typeof data === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    const db = await readDb();
    const index = buildIndex(db.sources);
    return send(res, 200, {
      sources: db.sources,
      runs: db.runs,
      chunkCount: index.chunks.length,
      llmMode: process.env.OPENAI_API_KEY ? "OpenAI API enabled" : "Local RAG fallback"
    });
  }

  if (req.method === "POST" && url.pathname === "/api/sources") {
    const body = await readBody(req);
    if (!body.text || body.text.trim().length < 30) return send(res, 422, { error: "Add at least 30 characters of source evidence." });
    const source = await addSource(body);
    return send(res, 201, source);
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/sources/")) {
    return send(res, 200, await deleteSource(url.pathname.split("/").pop()));
  }

  if (req.method === "POST" && url.pathname === "/api/retrieve") {
    const body = await readBody(req);
    const db = await readDb();
    const index = buildIndex(db.sources);
    return send(res, 200, { chunks: retrieve(index, body.query || "", 8) });
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    const body = await readBody(req);
    const db = await readDb();
    if (!db.sources.length) return send(res, 422, { error: "Add at least one source before generating." });
    const productGoal = body.productGoal?.trim() || "Prioritize the next product backlog";
    const index = buildIndex(db.sources);
    const run = await generateBacklog({ productGoal, sources: db.sources, index });
    await saveRun(run);
    return send(res, 200, run);
  }

  return send(res, 404, { error: "Not found" });
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": mime[".html"] });
    res.end(fallback);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Backlog GPT running at http://${HOST}:${PORT}`);
});
