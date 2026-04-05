# Agent Memory

Persistent memory layer for AI coding agents built on [Entire.io](https://entire.io) checkpoints. Agents never retrace steps, repeat mistakes, or forget what they already figured out.

**The problem:** Every new AI coding session starts from zero — no knowledge of previous sessions. The agent re-investigates problems already solved, repeats failed approaches, and misses warnings from past work.

**The solution:** Agent Memory compresses raw sessions (~50KB) into compact memory records (~200 tokens) and auto-injects relevant context into new sessions. The agent starts with full knowledge of what happened before.

## Install

```bash
npm install -g https://github.com/ChetanReddyC/agent-memory/releases/download/v0.1.0/agent-memory-0.1.0.tgz
```

## Quick Start

```bash
cd your-repo-with-entire
agent-memory install    # one-time setup — hooks handle everything after this
```
## Embeddings Setup

Agent Memory uses the [Hugging Face Inference API](https://huggingface.co/docs/inference-providers) for semantic embeddings. Without this, retrieval falls back to keyword matching — still functional but less precise for differently-worded queries.

> **Note:** A ready-to-use HF_TOKEN is included in the message I sent along with this repo. Use that directly — no need to create your own.

Set the environment variable before using:

**Mac / Linux:**
```bash
export HF_TOKEN="key_is_in_msg_i_sent!"
```

**Windows (PowerShell):**
```powershell
$env:HF_TOKEN="key_is_in_msg_i_sent!"
```

**Windows (CMD):**
```cmd
set HF_TOKEN=key_is_in_msg_i_sent!
```

That's it. From now on:
- **Every commit** → new sessions auto-distilled into memory records (silent, background)
- **Every new Claude Code session** → relevant memories auto-injected based on your first prompt

Zero commands needed after setup.

## How It Works

```
You commit code
      ↓
Post-commit hook → distills any new Entire checkpoints (background, silent)
      ↓
50KB transcript → 200 token structured memory (LLM-powered via Claude CLI)
      ↓
You start a new Claude Code session
      ↓
UserPromptSubmit hook → scores all memories against your prompt
      ↓
Top relevant memories injected → agent starts with full context
```

### What gets captured per session

Each memory record extracts 9 key fields from the raw transcript:

| Field | What it captures |
|-------|-----------------|
| `intent` | What the user was trying to accomplish |
| `decisions` | Key decisions and root causes found |
| `failed_approaches` | What was tried and didn't work |
| `warnings` | Critical caveats for future sessions |
| `resolution` | Final outcome |
| `error_signatures` | Exact error messages/codes (e.g. `401 CART_SESSION_MISSING`) |
| `cause_chain` | Full debugging path: symptom → misdiagnosis → actual root cause |
| `file_dependencies` | Concrete coupling rules: "changing X requires updating Y" |
| `key_insight` | Single most important takeaway from the entire session |

### How retrieval works

When a new session starts, your prompt is scored against all stored memories using 5 signals:

| Signal | Weight | How it works |
|--------|--------|-------------|
| File overlap | 30% | Matches filenames you're currently working on against files in memories |
| Semantic similarity | 25% | Vector embeddings (HF Inference API, all-MiniLM-L6-v2) compare meaning |
| Error signature match | 20% | Exact match error codes from your prompt against stored error signatures |
| Recency | 15% | Exponential decay — recent sessions score higher |
| Importance | 10% | Sessions with more decisions/warnings/failures are more valuable |

Both distillation and retrieval are **LLM-powered**:
- **Distillation** uses Claude CLI (Sonnet) to extract clean, actionable memory records
- **Retrieval** uses Claude CLI (Haiku) to refine your prompt — extracting error codes, file hints, and search intent before scoring

Memories below the relevance threshold are never injected. Silence over noise.

## CLI Commands

| Command | Description |
|---------|-------------|
| `agent-memory install` | Set up auto-distill + auto-inject hooks |
| `agent-memory uninstall` | Remove all hooks |
| `agent-memory status` | Check hook status, memory count, undistilled checkpoints |
| `agent-memory distill --all` | Distill all checkpoints in the repo |
| `agent-memory recall <prompt>` | Find relevant memories for a prompt |
| `agent-memory inject <prompt>` | Output formatted context block for agent injection |
| `agent-memory list` | List all stored memories |
| `agent-memory show <id>` | View a specific memory record with all 17 fields |
| `agent-memory stats` | Memory store statistics |



## Requirements

- Node.js 18+
- Git repository with [Entire.io](https://entire.io) checkpoints enabled
- Claude CLI (optional — enables LLM-powered distillation and query refinement, falls back to heuristics)
- HF_TOKEN (optional — enables vector embeddings, falls back to keyword matching)

## Architecture

```
agent-memory/
├── src/
│   ├── distiller/        ← Reads Entire JSONL → produces MemoryRecord (LLM or heuristic)
│   ├── retriever/        ← 5-signal scoring + LLM query refinement + embeddings
│   ├── injector/         ← Formats memories for agent context injection
│   ├── store/            ← File-based JSON persistence per checkpoint
│   ├── hooks/            ← Git post-commit + Claude Code UserPromptSubmit hooks
│   └── cli.ts            ← CLI entry point with all commands
└── tests/                ← 66 tests across 5 modules
```

## Beyond Keyword Matching — How Retrieval Actually Works

Traditional search matches words. Agent Memory understands meaning.

When you type a prompt, the system doesn't just look for matching keywords. It runs a **3-stage LLM-powered pipeline** before scoring:

**Stage 1: LLM Query Refinement**

Your raw prompt gets analyzed by Claude (Haiku) which extracts structured search intent:

```
Raw prompt: "the checkout stopped working after we recreated the admin"

LLM extracts:
  refined_query: "checkout failure after admin account recreation on DigitalOcean"
  error_codes: ["401", "500"]              ← inferred, not in your prompt
  file_hints: ["checkout.ts", "auth.ts"]   ← inferred from context
```

The LLM understood "stopped working" implies errors, and "admin recreation" relates to auth — even though you never mentioned error codes or filenames.

**Stage 2: Vector Embedding**

The refined query gets embedded into a 384-dimensional vector (via HF Inference API, all-MiniLM-L6-v2). This captures semantic meaning — "server returning unauthorized" matches against a memory about "401 auth failure" even with zero shared words.

**Stage 3: Multi-Signal Scoring**

Five signals combine to rank every memory:

```
Prompt: "server returning unauthorized when trying to purchase items"
                    ↓
Memory: "Cart 401 debug — CF_KV_NAMESPACE_ID changed after admin recreation"

  file_overlap:      23%  (some shared checkout files)
  semantic_sim:      78%  (meaning is similar despite different words)
  error_match:      100%  (LLM extracted "401" → exact match on error_signatures)
  recency:           92%  (2 days ago)
  importance:       100%  (5 decisions, 5 warnings)
                    ────
  final score:       68%  → INJECTED
```

Compare to a CSS memory:
```
Memory: "Fix video styling on homepage"

  file_overlap:       0%
  semantic_sim:       3%
  error_match:        0%
  recency:           98%
  importance:        10%
                    ────
  final score:       12%  → FILTERED OUT (below threshold)
```

**Real examples that work:**

| You type | No shared keywords with memory | Still matches because |
|----------|-------------------------------|----------------------|
| "deployment issues" | Memory says "DO hosting problems" | Embeddings understand meaning |
| "server returning unauthorized" | Memory says "401 CART_SESSION_MISSING" | LLM extracts "401", exact match on error_signatures |
| "checkout broke after admin setup" | Memory says "CF_KV_NAMESPACE_ID stale" | LLM infers the connection, semantic similarity high |
| "fix the video styling" | Memory about KV credentials | Score too low → nothing injected (correct!) |

## Complementing Entire's Semantic Layer

Agent Memory is designed to work **alongside** Entire's upcoming semantic search — not replace it. They solve different problems:

```
Developer asks a question
        ↓
┌─── Agent Memory (fast, structured) ──────┐
│  Instant answers from distilled records  │
│  Key insight, cause chain, warnings      │
│  ~200 tokens per memory, scored & ranked │
└──────────────┬───────────────────────────┘
               ↓
       Need full context?
               ↓
┌─── Entire Semantic Layer (deep, raw) ────┐
│  Full transcript search & narrative      │
│  Complete session replay via `explain`   │
│  ~50KB per session, chronological        │
└──────────────────────────────────────────┘
```

| | Entire's Semantic Layer | Agent Memory |
|---|---|---|
| **Searches** | Raw transcripts (~50KB each) | Distilled records (~200 tokens each) |
| **Best for** | Exploring "what happened?" | Answering "what was the fix?" |
| **Speed** | Searches full transcripts | Instant — pre-scored structured data |
| **Scale** | Heavy at 1000+ sessions | Constant ~2KB injection regardless of scale |
| **Output** | Chronological narrative | Actionable: decisions, cause chains, warnings |

**Together they're more powerful than either alone:**

1. **Solo dev, 2am, prod is down** — Agent Memory surfaces the root cause in 5 seconds ("CF_KV_NAMESPACE_ID changed"). If they need the full debugging story, drill into the transcript via Entire.

2. **Team of 8, new engineer joins** — Agent Memory surfaces 3 critical warnings in 30 seconds across 500 sessions. The new engineer knows the landmines before touching any code. If they want full context on any warning, Entire provides the narrative.

3. **Recurring bug, 3rd occurrence** — Agent Memory shows the cause chain from all 3 occurrences, failed approaches to avoid, and file dependencies to check. No re-investigation needed.

Our distilled records serve as a **searchable index** for Entire's raw checkpoint data. The index is fast, structured, and machine-injectable. The raw data is deep, complete, and human-readable. Both layers working together = agents that never forget and developers who never waste time.

## License

MIT
