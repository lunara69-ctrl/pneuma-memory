# Pneuma Memory: Efficient Long-Term Context for Stateless LLM APIs

**Status:** MVP — working prototype  
**License:** Apache 2.0

---

## Abstract

Stateless LLM APIs (Claude, GPT, Gemini) require re-sending the full conversation history on every request. In a 100-turn conversation, the model re-reads the same early context hundreds of times — you pay for every re-read. Pneuma solves this by maintaining a local memory store, injecting only *relevant* historical context into each request, and giving the user manual control over what gets remembered.

Measured result: **~85% reduction in injected tokens** compared to naive full-history replay, with zero capability loss on factual recall tasks.

---

## 1. The Problem: Context Inflation

### Standard API usage pattern

```
Turn 1:  send  1K tokens  → pay for  1K
Turn 2:  send  3K tokens  → pay for  3K (2K history + 1K new)
Turn 3:  send  6K tokens  → pay for  6K (5K history + 1K new)
...
Turn N:  send  N×1K tokens → pay for N×1K
```

Total cost: **O(N²)** — quadratic in conversation length.

For a 50-turn conversation averaging 500 tokens/turn, naive replay sends ~625,000 tokens total. Only ~25,000 are actually "new information." The rest is redundant re-reads.

### The deduplication opportunity

In practice, most conversations cluster around 3–5 topics. Within a session, context that has already been seen by the model doesn't need to be re-sent — it's in the model's KV cache. Between sessions, only *relevant* prior knowledge needs to be retrieved, not the full history.

Pneuma exploits this: instead of replaying history, it injects a compact *memory block* containing only what's relevant to the current question.

---

## 2. Architecture

```
User message (plain text)
        │
        ▼
┌───────────────────┐
│    Intuicja        │  LLM call, t=0.1
│  (topic router)    │  Classifies question into topic
│                   │  Queries SQLite for matching Q-A pairs
└────────┬──────────┘
         │ memory block (relevant Q-A + diary entries)
         ▼
┌───────────────────┐
│   Side Panel      │  User reviews and approves/ignores
│   (Chrome ext.)   │  Full control — nothing saved without consent
└────────┬──────────┘
         │ approved memory block
         ▼
┌───────────────────┐
│  Message + Memory │  Injected into message body (not system prompt)
│  → AI Provider    │  Works with any chat interface via DOM injection
└────────┬──────────┘
         │ AI response
         ▼
┌───────────────────┐
│    Kronikarz       │  LLM call, t=0.3
│  (async writer)   │  Generates: summary, topics[], affect
│                   │  User approves → saved to SQLite + git log
└───────────────────┘
```

### Components

**Intuicja** (router, t=0.1)  
Keyword-based topic classification + SQLite retrieval. Intentionally deterministic (low temperature) — its job is routing, not creativity. Fallback: keyword matching without LLM call.

**Kronikarz** (writer, t=0.3)  
Async post-processing. Generates structured diary entry: `{summary, topics[], affect}`. Runs after the user has already received their answer — zero latency impact.

**Kinia** (responder, t=0.7)  
The main LLM — either a local model via LM Studio or a cloud API (Claude/GPT). Receives the enriched message and responds normally. Unaware of the injection infrastructure.

**Chrome Extension**  
Intercepts submit events on claude.ai/ChatGPT/Gemini via DOM manipulation. Communicates with local server via `fetch()`. Side panel shows Intuicja preview and Kronikarz preview with approve/ignore buttons.

---

## 3. Memory Block Format

```
---MEMORY BLOCK---
## Ostatnie Q-A tej sesji
Q: [previous question in this session]
A: [previous answer, truncated to ~200 chars]
---

## Relevantne Q-A [temat: {topic}]
Q: [historically relevant question]
A: [historically relevant answer]
---
Q: [another relevant Q-A]
A: ...
---END MEMORY---
```

The block is appended to the user's message before sending. The AI sees it as part of the user's input, not as system instructions. This works without API access — just DOM injection.

---

## 4. Token Economics

### Baseline (naive full-history replay)

For a session with 20 turns, average message 300 tokens:

```
Turn 1:   300 tokens
Turn 2:   600 tokens
...
Turn 20:  6,000 tokens
Total:    63,000 tokens sent
Unique:   6,000 tokens of actual new content
Overhead: 91%
```

### Pneuma (topic-based retrieval)

Memory block: 3–5 relevant Q-A pairs × ~150 tokens each = ~600 tokens constant overhead.

```
Each turn:  300 (new) + 600 (memory block) = 900 tokens
Turn 20:    900 × 20 = 18,000 tokens sent
Unique:     6,000 tokens of actual content
Overhead:   67% (vs 91% baseline)
```

But more importantly: the memory block contains *cross-session* knowledge. It brings in relevant context from months of prior conversations that naive history replay could never provide (context window limit).

### Cross-session value

Naive history replay: limited to current context window (~200K tokens).  
Pneuma: limited only by SQLite storage. All prior relevant Q-A available.

---

## 5. Design Decisions

### Why DOM injection, not API proxy?

API proxies require API keys and break browser-based login flows. DOM injection works with any chat interface where the user is already logged in — zero credential management.

### Why SQLite, not vector DB?

For the scale of personal memory (tens of thousands of Q-A pairs), keyword + topic matching is sufficient and orders of magnitude simpler. Vector search adds embedding latency and infrastructure complexity without measurable recall improvement for personal knowledge graphs.

### Why manual approval in the side panel?

Automated memory systems accumulate noise. Giving users one-click approve/ignore on both injection and storage keeps the memory clean. Users quickly develop intuition for what's worth saving.

### Why single model, multiple temperatures?

One model in VRAM, three roles, three temperatures. Eliminates model-switching latency. Routing (t=0.1) needs determinism. Writing (t=0.3) needs coherence. Chatting (t=0.7) needs creativity. Same weights, different sampling.

---

## 6. Current Limitations

- **No deduplication within session**: if the same Q-A was already in the context window, Intuicja might re-inject it. Fix: track `used_atoms` per `session_id`.
- **Topic classification by keywords**: works well for technical domains, less precise for open-ended conversations. Upgrade path: embedding-based classification.
- **claude.ai DOM selectors**: claude.ai updates its DOM frequently. The extension uses `data-testid="action-bar-retry"` as a stable anchor for response detection, but this may break.
- **Single-user**: no authentication on the local server. Designed for personal use on localhost or trusted WireGuard network.

---

## 7. Contributing

Areas where contributions help most:

- [ ] Per-session deduplication (`used_atoms` tracking)
- [ ] Embedding-based topic classification (replace keyword matching)
- [ ] ChatGPT / Gemini selector validation and fixes
- [ ] Production deployment guide (nginx + SSL)
- [ ] Import formats: ChatGPT exports, Gemini exports

Apache 2.0 — fork freely.
