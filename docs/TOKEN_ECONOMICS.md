# Token Economics

## The Problem

LLM APIs are stateless. Every request re-sends the full conversation history.

```
Turn 1:  [Q1]                    → 200 tokens
Turn 2:  [Q1, A1, Q2]            → 600 tokens
Turn 3:  [Q1, A1, Q2, A2, Q3]   → 1,200 tokens
...
Turn N:  full history + QN       → O(N²) tokens
```

For a 30-turn conversation (avg 300 tokens/turn):
- **Tokens sent:** ~135,000
- **Tokens of actual new content:** ~9,000
- **Redundancy:** 93%

At Claude Sonnet pricing (~$3/MTok input), that 30-turn conversation costs ~$0.40.  
With Pneuma-style delta injection: ~$0.05. **~87% savings.**

---

## Pneuma's Model

Instead of replaying history, inject a compact memory block:

```
Each turn: [new question] + [memory block ~500 tokens]
```

### Memory block composition (typical)

| Component | Tokens | Purpose |
|-----------|--------|---------|
| Last 3 session Q-A | ~300 | Short-term continuity |
| 3-5 historical Q-A by topic | ~400 | Long-term knowledge |
| 1-2 diary entries | ~150 | Condensed context |
| **Total** | **~850** | Constant overhead |

### Cost comparison (30-turn session, 300 tok/turn)

| Approach | Total tokens sent | Cost @ $3/MTok |
|----------|------------------|----------------|
| Full history replay | 135,000 | $0.40 |
| Pneuma (memory block) | 30 × (300 + 850) = 34,500 | $0.10 |
| **Savings** | **74%** | **$0.30** |

---

## The Cross-Session Multiplier

Full history replay is limited to the current context window (~200K tokens for Claude).  
A 200K context fills up after ~300 turns of average conversation.

Pneuma has no such limit. The SQLite database can hold years of conversations.  
Intuicja retrieves relevant atoms from *any* past session — including conversations from 6 months ago.

**Example:** You ask about KV cache today. Pneuma injects the best Q-A from your conversation about LM Studio 3 months ago. Full history replay would never reach that far.

---

## Local Model Cost

Running `gemma-4-4b` locally via LM Studio:

| Component | Cost |
|-----------|------|
| Intuicja call (~1K tokens) | $0.00 (local) |
| Kronikarz call (~2K tokens) | $0.00 (local) |
| Electricity (4B model, ~5W overhead) | ~$0.001/hour |
| **Effective cost per turn** | **~$0.0001** |

Even with Claude API for the main response (Kinia), Intuicja and Kronikarz running locally add essentially zero cost.

---

## When Full History Replay Wins

Pneuma's approach trades breadth for precision. Full history replay is better when:

1. **Coherence is critical** — complex multi-step reasoning where every prior step matters
2. **Short sessions** — under 10 turns, context inflation is negligible
3. **No prior history** — empty database, no memory to inject

Use Pneuma for: research, learning, multi-session projects, anything where you return to the same topics across many separate chats.

Use full history replay for: one-shot tasks, code debugging sessions where every line of context matters, conversations that must be fully coherent end-to-end.
