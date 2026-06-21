import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex, chunkSource, retrieve } from "../src/rag.js";

const source = {
  id: "src_1",
  title: "Customer onboarding interview",
  type: "interview",
  text: "Customer support said PMs need source links for generated requirements. Engineering decided long transcripts must be chunked before generation. Sales needs prioritized acceptance criteria for enterprise reviews."
};

test("chunks source evidence with schema pre-processing", () => {
  const chunks = chunkSource(source, 24, 4);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].sourceTitle, source.title);
  assert.ok(chunks.some((chunk) => chunk.schema.decisions.length > 0));
});

test("retrieves relevant chunks for a PM query", () => {
  const index = buildIndex([source]);
  const results = retrieve(index, "source links requirements PM", 3);
  assert.ok(results.length > 0);
  assert.equal(results[0].sourceId, "src_1");
  assert.match(results[0].content, /source links|requirements/i);
});
