import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../src/rag.js";
import { generateBacklog } from "../src/llm.js";

test("local generation creates source-attributed requirements", async () => {
  delete process.env.OPENAI_API_KEY;
  const sources = [{
    id: "src_1",
    title: "Planning review notes",
    type: "meeting",
    text: "Sales said enterprise prospects need every AI-generated requirement to show a source citation. Support reported PMs miss acceptance criteria after long calls. Engineering decided transcript chunks should be compressed into problems, decisions, and actions before generation."
  }];
  const run = await generateBacklog({
    productGoal: "Create a trusted backlog agent for PM planning",
    sources,
    index: buildIndex(sources)
  });

  assert.equal(run.mode, "local-rag");
  assert.ok(run.requirements.length > 0);
  assert.ok(run.requirements.every((req) => req.citations.length > 0));
  assert.equal(run.evaluation.length, 4);
});
