import crypto from "node:crypto";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "their", "to",
  "was", "we", "with", "will", "would", "this", "they", "our", "can", "not", "but"
]);

export function stableId(prefix, input) {
  return `${prefix}_${crypto.createHash("sha1").update(input).digest("hex").slice(0, 10)}`;
}

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function preprocessToSchema(text) {
  const sentences = String(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const buckets = {
    problems: [],
    decisions: [],
    actions: [],
    stakeholders: []
  };

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (/(problem|pain|issue|blocked|struggle|slow|confusing|risk|complain|cannot|can't)/.test(lower)) {
      buckets.problems.push(sentence);
    }
    if (/(decided|decision|agreed|approved|chose|priority|must|should|need to|require)/.test(lower)) {
      buckets.decisions.push(sentence);
    }
    if (/(action|follow up|owner|next|todo|launch|ship|measure|track|instrument)/.test(lower)) {
      buckets.actions.push(sentence);
    }
    if (/(customer|user|sales|support|engineering|design|legal|finance|pm|stakeholder|admin|manager)/.test(lower)) {
      buckets.stakeholders.push(sentence);
    }
  }

  return {
    problems: buckets.problems.slice(0, 8),
    decisions: buckets.decisions.slice(0, 8),
    actions: buckets.actions.slice(0, 8),
    stakeholders: buckets.stakeholders.slice(0, 8),
    summary: sentences.slice(0, 5).join(" ")
  };
}

export function chunkSource(source, maxTokens = 155, overlap = 35) {
  const words = String(source.text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks = [];
  let index = 0;

  for (let start = 0; start < words.length; start += maxTokens - overlap) {
    const slice = words.slice(start, start + maxTokens);
    if (!slice.length) break;
    const content = slice.join(" ");
    chunks.push({
      id: stableId("chk", `${source.id}:${index}:${content}`),
      sourceId: source.id,
      sourceTitle: source.title,
      sourceType: source.type,
      index,
      content,
      schema: preprocessToSchema(content),
      tokens: tokenize(content)
    });
    index += 1;
    if (start + maxTokens >= words.length) break;
  }

  return chunks;
}

export function buildIndex(sources) {
  const chunks = sources.flatMap((source) => chunkSource(source));
  const docFreq = new Map();

  for (const chunk of chunks) {
    for (const token of new Set(chunk.tokens)) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }

  return { chunks, docFreq, totalDocs: Math.max(chunks.length, 1) };
}

export function retrieve(index, query, topK = 7) {
  const queryTokens = tokenize(query);
  const querySet = new Set(queryTokens);

  return index.chunks
    .map((chunk) => {
      const counts = new Map();
      for (const token of chunk.tokens) counts.set(token, (counts.get(token) || 0) + 1);
      let score = 0;
      for (const token of querySet) {
        const tf = counts.get(token) || 0;
        if (!tf) continue;
        const idf = Math.log((index.totalDocs + 1) / ((index.docFreq.get(token) || 0) + 1)) + 1;
        score += (1 + Math.log(tf)) * idf;
      }
      const schemaBoost = ["problems", "decisions", "actions", "stakeholders"].reduce((sum, key) => {
        return sum + (chunk.schema[key].join(" ").toLowerCase().includes(query.toLowerCase()) ? 0.5 : 0);
      }, 0);
      return { ...chunk, score: score + schemaBoost };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function sourceSnippet(chunk, maxLength = 220) {
  if (chunk.content.length <= maxLength) return chunk.content;
  return `${chunk.content.slice(0, maxLength).trim()}...`;
}
