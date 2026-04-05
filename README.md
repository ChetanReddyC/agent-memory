# Agent Memory

Persistent memory layer for AI coding agents. Compresses raw agent sessions into compact memory records (~200 tokens from ~50KB transcripts) and auto-injects relevant context into new sessions.

Built on top of [Entire.io](https://entire.io) checkpoints.

## Install

```bash
npm install -g https://github.com/ChetanReddyC/agent-memory/releases/download/v0.1.0/agent-memory-0.1.0.tgz
```

## Setup (one-time per repo)

```bash
cd your-repo-with-entire
agent-memory install
```

This sets up:
- **Auto-distill** — post-commit hook distills new Entire checkpoints into memory records
- **Auto-inject** — Claude Code hook injects relevant memories on every new session

## How It Works

```
Session ends → Entire captures checkpoint
                    ↓
         Post-commit hook fires
                    ↓
         Distiller compresses ~50KB transcript
         into ~200 token memory record
         (LLM-powered via Claude CLI, or heuristic fallback)
                    ↓
         Memory stored with embedding vector
                    ↓
New session starts → Hook fires
                    ↓
         Retriever scores all memories using 5 signals:
         file overlap + semantic similarity + error signature match
         + recency + importance
                    ↓
         Top memories injected into agent context
         Agent starts with full knowledge of past sessions
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `agent-memory install` | Set up auto-distill and auto-inject hooks |
| `agent-memory uninstall` | Remove all hooks |
| `agent-memory status` | Check hook status and memory count |
| `agent-memory distill --all` | Distill all checkpoints in the repo |
| `agent-memory distill <id>` | Distill a specific checkpoint |
| `agent-memory recall <prompt>` | Find relevant memories for a prompt |
| `agent-memory inject <prompt>` | Output formatted context block |
| `agent-memory list` | List all stored memories |
| `agent-memory show <id>` | View a specific memory record |
| `agent-memory stats` | Memory store statistics |

## Memory Record Structure

Each distilled memory contains 17 fields:

| Field | Description |
|-------|-------------|
| `intent` | What the user was trying to accomplish |
| `decisions` | Key decisions and root causes found |
| `failed_approaches` | What was tried and didn't work |
| `warnings` | Critical caveats for future sessions |
| `resolution` | Final outcome |
| `error_signatures` | Exact error messages/codes for precise matching |
| `cause_chain` | Debugging path: symptom → misdiagnosis → root cause |
| `file_dependencies` | "Changing X requires also updating Y" |
| `key_insight` | Single most important takeaway |

## Retrieval: 5-Signal Scoring

```
relevance = file_overlap (30%)
          + semantic_similarity (25%)
          + error_signature_match (20%)
          + recency (15%)
          + importance (10%)
```

- **File overlap** — matches on filename, catches reorganized files
- **Semantic similarity** — vector embeddings (all-MiniLM-L6-v2, 384-dim)
- **Error signature match** — exact match error codes against stored signatures
- **Recency** — exponential decay (yesterday=100, 1 month=30, 3 months=5)
- **Importance** — more decisions/warnings/failures = higher value

Memories below 15% relevance are never injected. Silence over noise.

## Embeddings Setup (Required for best performance)

Agent Memory uses the [Hugging Face Inference API](https://huggingface.co/docs/inference-providers) for semantic embeddings. Without this, retrieval quality will be degraded — falling back to keyword matching instead of vector similarity.

> **Note:** A ready-to-use HF_TOKEN is included in the message I sent along with this repo. Use that directly — no need to create your own.

Set the environment variable before using:

```bash
export HF_TOKEN="key_is_in_msg_i_sent!"
```

## Requirements

- Node.js 18+
- Git repository with [Entire.io](https://entire.io) checkpoints enabled
- Claude CLI (optional — enables LLM-powered distillation, falls back to heuristic)
- HF_TOKEN (optional — enables vector embeddings for semantic similarity, falls back to keyword matching)

## License

MIT
