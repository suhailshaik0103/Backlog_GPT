# Backlog GPT

Local prototype for an AI-powered product requirements and prioritization agent.

## What It Does

- Ingests PM evidence such as interviews, meetings, PRDs, research, and support notes.
- Chunks source material and compresses each chunk into problem, decision, action, and stakeholder schemas.
- Retrieves relevant evidence before generation so every requirement has citations.
- Generates prioritized backlog requirements with user stories, acceptance criteria, stakeholders, confidence, effort, and rationale.
- Evaluates output quality against specificity, acceptance criteria completeness, stakeholder traceability, and prioritization coherence.

## Run Locally

Install Node.js 20 or newer, then run:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

## OpenAI API Mode

The app works without an API key using a deterministic local RAG fallback. To use the real LLM orchestration path:

```bash
OPENAI_API_KEY=your_key_here OPENAI_MODEL=gpt-4.1-mini npm start
```

The server calls the OpenAI Responses API with structured JSON output. If the API call fails, it returns a local RAG fallback response and shows a warning in the UI.

## Verify

```bash
npm test
```
