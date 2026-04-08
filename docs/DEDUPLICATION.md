# Deduplication in Pneuma

## Current State (MVP)

The current implementation deduplicates between *sessions* but not within a session.

**What works now:**
- Each session has a unique `session_id` (e.g. `ext_mnpul42z`)
- `getLastQA(sessionId, 3)` only returns the last 3 Q-A from the *current* session
- Historical Q-A comes from *other* sessions via topic matching
- Result: no cross-session duplication — you don't re-inject what was already discussed in a different chat

**What's missing:**
- Within a long session, the same historical Q-A atom might get re-injected on multiple turns
- No tracking of which atoms were already in the context window this session

---

## The Full Deduplication Algorithm (TODO)

### Session atom tracking

Every time an atom (Q-A pair by `id`) is injected, record it:

```sql
CREATE TABLE session_atoms (
  session_id TEXT,
  qa_id      INTEGER,
  injected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, qa_id)
);
```

### Modified `buildMemoryBlock()`

Before injecting a Q-A pair, check if it was already used this session:

```js
function getQAByTopicDeduped(topic, sessionId, limit) {
  const usedIds = db.exec(
    'SELECT qa_id FROM session_atoms WHERE session_id = ?',
    [sessionId]
  ).map(r => r[0]);

  const candidates = getQAByTopic(topic, limit * 2); // fetch more
  return candidates
    .filter(qa => !usedIds.includes(qa.id))
    .slice(0, limit);
}
```

### Mark atoms as used after injection

```js
// After successful injection:
chrome.runtime.sendMessage({
  type: 'injection_confirmed',
  qaIds: [...injectedIds],
  sessionId
});
// Server records them in session_atoms
```

---

## Why This Matters

Claude's context window for a single chat is ~200K tokens. Without deduplication:

```
Turn 5:  inject atom_A (first time — useful)
Turn 10: inject atom_A again (already in context — wasted tokens)
Turn 15: inject atom_A again (still in context — still wasted)
```

With session deduplication:

```
Turn 5:  inject atom_A → record in session_atoms
Turn 10: atom_A filtered out → inject atom_B instead (new info)
Turn 15: atom_B filtered out → inject atom_C (more new info)
```

Each turn brings fresh context instead of repeating known facts.

---

## Session Boundary

When does a session end?
- User opens a new chat tab → new `session_id` generated
- User clicks "New Session" in built-in UI → explicit reset
- Session IDs are UUIDs tied to the browser tab's `sessionStorage`

After session boundary: atom tracking resets. The same atoms can be injected again in a new conversation — they're no longer "in context."

---

## Long-Term Memory vs Session Memory

```
┌─────────────────────────────────────────────┐
│  SQLite DB (long-term memory)                │
│  All Q-A ever saved, across all sessions     │
│                                             │
│  session_1: atom_A, atom_B, atom_C          │
│  session_2: atom_D, atom_E                  │
│  session_3: atom_F, atom_A (re-injected)    │
└─────────────────────────────────────────────┘
         │
         │ Intuicja queries by topic
         ▼
┌─────────────────────────────────────────────┐
│  Session atom filter                         │
│  For current session_id: skip already-used  │
│                                             │
│  session_3 turn 1: [A, B, D] injected      │
│  session_3 turn 2: [C, E, F] injected      │
│  session_3 turn 3: [new atoms only]         │
└─────────────────────────────────────────────┘
```
