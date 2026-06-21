import { retrieve, sourceSnippet, stableId } from "./rag.js";

const RUBRIC = [
  "requirement specificity",
  "acceptance criteria completeness",
  "stakeholder traceability",
  "prioritization coherence"
];

const backlogSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "requirements", "evaluation", "decisions"],
  properties: {
    summary: { type: "string" },
    requirements: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "userStory", "problem", "acceptanceCriteria", "stakeholders", "priority", "effort", "confidence", "rationale", "citations"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          userStory: { type: "string" },
          problem: { type: "string" },
          acceptanceCriteria: {
            type: "array",
            minItems: 2,
            items: { type: "string" }
          },
          stakeholders: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          effort: { type: "string", enum: ["S", "M", "L"] },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          rationale: { type: "string" },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["chunkId", "sourceTitle", "snippet"],
              properties: {
                chunkId: { type: "string" },
                sourceTitle: { type: "string" },
                snippet: { type: "string" }
              }
            }
          }
        }
      }
    },
    evaluation: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "score", "note"],
        properties: {
          dimension: {
            type: "string",
            enum: RUBRIC
          },
          score: { type: "integer", minimum: 1, maximum: 4 },
          note: { type: "string" }
        }
      }
    },
    decisions: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    }
  }
};

function extractStakeholders(text) {
  const known = ["Customer", "User", "Sales", "Support", "Engineering", "Design", "Legal", "Finance", "Admin", "PM", "Manager"];
  const lower = text.toLowerCase();
  return known.filter((name) => lower.includes(name.toLowerCase())).slice(0, 4);
}

function priorityFromEvidence(text, rank) {
  const lower = text.toLowerCase();
  if (/(revenue|blocked|risk|must|critical|churn|launch|legal|security)/.test(lower)) return "P0";
  if (/(slow|support|sales|priority|need|complain|manual|confusing)/.test(lower)) return "P1";
  return rank < 3 ? "P1" : "P2";
}

function effortFromEvidence(text) {
  const lower = text.toLowerCase();
  if (/(integration|migration|permission|workflow|architecture|api|security)/.test(lower)) return "L";
  if (/(dashboard|settings|notification|import|export|rule|template)/.test(lower)) return "M";
  return "S";
}

function makeRequirement(chunk, rank, productGoal) {
  const evidence = chunk.schema.problems[0] || chunk.schema.decisions[0] || chunk.schema.actions[0] || sourceSnippet(chunk, 180);
  const stakeholders = extractStakeholders(`${chunk.content} ${productGoal}`);
  const noun = evidence
    .replace(/^(we|users?|customers?|sales|support|engineering|design|pm)\s+/i, "")
    .split(/[,.]/)[0]
    .slice(0, 96)
    .trim();
  const actor = stakeholders[0] || "User";
  const title = noun.length > 20 ? noun : `Improve ${actor.toLowerCase()} workflow for ${productGoal || "the product goal"}`;
  const priority = priorityFromEvidence(chunk.content, rank);
  const effort = effortFromEvidence(chunk.content);

  return {
    id: `REQ-${String(rank + 1).padStart(3, "0")}`,
    title,
    userStory: `As a ${actor.toLowerCase()}, I want ${title.toLowerCase()} so that I can make progress without relying on manual follow-up.`,
    problem: evidence,
    acceptanceCriteria: [
      `Given relevant source context, when the ${actor.toLowerCase()} starts the workflow, then the system presents the required next action and supporting evidence.`,
      "Given incomplete or conflicting information, when the requirement is generated, then the system flags the gap instead of inventing unsupported details.",
      "Given the requirement is reviewed, when a PM opens traceability, then every claim links back to at least one cited source chunk."
    ],
    stakeholders: stakeholders.length ? stakeholders : ["PM", actor],
    priority,
    effort,
    confidence: Math.max(62, Math.min(94, Math.round(86 - rank * 4 + chunk.score))),
    rationale: `${priority} because the cited evidence indicates ${priority === "P0" ? "business or launch risk" : "repeated user or stakeholder friction"}. Effort is ${effort} based on implementation signals in the source.`,
    citations: [{
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      snippet: sourceSnippet(chunk)
    }]
  };
}

function evaluate(requirements) {
  const averageConfidence = requirements.reduce((sum, req) => sum + req.confidence, 0) / Math.max(requirements.length, 1);
  return RUBRIC.map((dimension) => {
    let score = 3;
    if (dimension === "requirement specificity") {
      score = requirements.every((req) => req.problem.length > 35 && req.userStory.includes("so that")) ? 4 : 3;
    }
    if (dimension === "acceptance criteria completeness") {
      score = requirements.every((req) => req.acceptanceCriteria.length >= 3) ? 4 : 2;
    }
    if (dimension === "stakeholder traceability") {
      score = requirements.every((req) => req.citations.length && req.stakeholders.length) ? 4 : 2;
    }
    if (dimension === "prioritization coherence") {
      score = averageConfidence > 72 && requirements.some((req) => req.priority === "P0" || req.priority === "P1") ? 4 : 3;
    }
    return {
      dimension,
      score,
      note: score >= 4
        ? "Meets prototype quality bar with source-backed structure."
        : "Review recommended before sharing externally."
    };
  });
}

function localBacklog({ productGoal, sources, index }) {
  const query = [
    productGoal,
    "customer user problem decision action requirement priority stakeholder support sales engineering risk"
  ].filter(Boolean).join(" ");
  const chunks = retrieve(index, query, 8);
  const requirements = chunks.slice(0, 6).map((chunk, rank) => makeRequirement(chunk, rank, productGoal));

  const fallback = sources.length && !requirements.length
    ? sources.flatMap((source) => retrieve(index, source.text.slice(0, 400), 3)).slice(0, 4).map((chunk, rank) => makeRequirement(chunk, rank, productGoal))
    : requirements;

  return {
    mode: "local-rag",
    generatedAt: new Date().toISOString(),
    productGoal,
    summary: fallback.length
      ? `Generated ${fallback.length} source-attributed requirements from ${sources.length} source${sources.length === 1 ? "" : "s"}.`
      : "Add richer source material to generate requirements.",
    requirements: fallback,
    evaluation: evaluate(fallback),
    decisions: [
      "RAG used instead of fine-tuning to preserve source attribution.",
      "Transcript content compressed into problem, decision, action, and stakeholder schemas before generation.",
      "Prioritization combines cited severity, stakeholder signal, confidence, and effort."
    ]
  };
}

function buildPrompt({ productGoal, chunks }) {
  const evidence = chunks.map((chunk, index) => {
    return `SOURCE ${index + 1}
chunk_id: ${chunk.id}
source_title: ${chunk.sourceTitle}
schema: ${JSON.stringify(chunk.schema)}
excerpt: ${sourceSnippet(chunk, 900)}`;
  }).join("\n\n");

  return `You are Backlog GPT, a product requirements and prioritization agent.
Return only valid JSON matching this shape:
{
  "summary": "string",
  "requirements": [{
    "id": "REQ-001",
    "title": "string",
    "userStory": "As a..., I want..., so that...",
    "problem": "string",
    "acceptanceCriteria": ["Given..., when..., then..."],
    "stakeholders": ["string"],
    "priority": "P0|P1|P2|P3",
    "effort": "S|M|L",
    "confidence": 0,
    "rationale": "string",
    "citations": [{"chunkId":"string","sourceTitle":"string","snippet":"string"}]
  }],
  "evaluation": [{"dimension":"requirement specificity|acceptance criteria completeness|stakeholder traceability|prioritization coherence","score":1,"note":"string"}],
  "decisions": ["string"]
}

Rules:
- Use RAG only; every requirement must cite chunk IDs from the evidence.
- Do not invent facts. Flag gaps in acceptance criteria when evidence is missing.
- Prioritize by user/business severity first, then confidence, then effort.
- Keep requirements specific and reviewable by a PM.

Product goal:
${productGoal}

Evidence:
${evidence}`;
}

export async function generateBacklog({ productGoal, sources, index }) {
  const query = `${productGoal} problem decision action stakeholder priority acceptance criteria requirement`;
  const chunks = retrieve(index, query, 10);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) return localBacklog({ productGoal, sources, index });

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: buildPrompt({ productGoal, chunks }),
    text: {
      format: {
        type: "json_schema",
        name: "backlog_gpt_run",
        strict: true,
        schema: backlogSchema
      }
    }
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
    const parsed = JSON.parse(text);
    return {
      mode: "openai-rag",
      id: stableId("run", `${productGoal}:${Date.now()}`),
      generatedAt: new Date().toISOString(),
      productGoal,
      ...parsed
    };
  } catch (error) {
    const fallback = localBacklog({ productGoal, sources, index });
    return {
      ...fallback,
      mode: "local-rag-fallback",
      warning: error.message
    };
  }
}
