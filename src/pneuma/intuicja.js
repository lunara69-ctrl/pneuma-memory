/**
 * Intuicja - topic detection + memory retrieval
 *
 * NIE duplikuje wiedzy którą model już ma.
 * Tylko injectuje relevantny kontekst historyczny.
 */

const db = require('../db/db');

// Prosta mapa tematów → słowa kluczowe
// Upgrade: pgvector similarity later
const TOPIC_MAP = {
    'pneuma':       ['pneuma', 'kinia', 'kronikarz', 'intuicja', 'architektura'],
    'llm':          ['llm', 'model', 'claude', 'gemini', 'qwen', 'temperature', 'token', 'context', 'prompt'],
    'n8n':          ['n8n', 'workflow', 'node', 'webhook', 'automation'],
    'electron':     ['electron', 'chromium', 'ui', 'okno', 'apka', 'app'],
    'baza':         ['sqlite', 'postgres', 'pgvector', 'sql', 'baza', 'tabela'],
    'agent':        ['agent', 'worker', 'supervisor', 'bash', 'tool', 'wykonawcz'],
    'filozofia':    ['świadomość', 'życie', 'pamięć', 'przemijanie', 'ichi', 'ajahn'],
    'kod':          ['python', 'javascript', 'typescript', 'rust', 'kod', 'skrypt', 'funkcja'],
    'mcp':          ['mcp', 'server', 'protocol', 'tool', 'superassistant'],
    'lmstudio':     ['lmstudio', 'lm studio', 'vram', 'kv cache', 'preset', 'jinja'],
};

/**
 * Detect topic from user message
 * Returns top topic + extracted keywords
 */
function detectTopic(message) {
    const lower = message.toLowerCase();
    const scores = {};

    for (const [topic, keywords] of Object.entries(TOPIC_MAP)) {
        scores[topic] = keywords.filter(kw => lower.includes(kw)).length;
    }

    // Top topic
    const topTopic = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .filter(([_, score]) => score > 0)[0];

    // Extract matching keywords for SQL search
    const matchedKeywords = [];
    for (const keywords of Object.values(TOPIC_MAP)) {
        keywords.forEach(kw => {
            if (lower.includes(kw)) matchedKeywords.push(kw);
        });
    }

    return {
        topic: topTopic ? topTopic[0] : 'general',
        confidence: topTopic ? topTopic[1] : 0,
        keywords: [...new Set(matchedKeywords)].slice(0, 5)
    };
}

/**
 * Build memory block from DB
 * Returns string ready for injection + metadata
 */
async function buildMemoryBlock(userMessage, sessionId) {
    const { topic, keywords } = detectTopic(userMessage);

    // Fetch relevant context
    const relevantQA = keywords.length > 0
        ? db.searchQAByKeywords(keywords, 5)
        : db.getQAByTopic(topic, 5);

    const recentQA = db.getLastQA(sessionId, 3);
    const diaryEntries = db.getDiaryByTopic(topic, 3);

    // Deduplicate (recent might overlap with relevant)
    const recentIds = new Set(recentQA.map(r => r.id));
    const uniqueRelevant = relevantQA.filter(r => !recentIds.has(r.id));

    // Build block - only if there's something to inject
    const sections = [];

    if (recentQA.length > 0) {
        sections.push(`## Ostatnie Q-A tej sesji\n${
            recentQA.map(r =>
                `Q: ${r.question.substring(0, 200)}\nA: ${r.answer.substring(0, 300)}`
            ).join('\n---\n')
        }`);
    }

    if (uniqueRelevant.length > 0) {
        sections.push(`## Relevantne Q-A [temat: ${topic}]\n${
            uniqueRelevant.map(r =>
                `Q: ${r.question.substring(0, 200)}\nA: ${r.answer.substring(0, 300)}`
            ).join('\n---\n')
        }`);
    }

    if (diaryEntries.length > 0) {
        sections.push(`## Diary [${topic}]\n${
            diaryEntries.map(d =>
                `[${d.created_at}] ${d.summary}`
            ).join('\n')
        }`);
    }

    if (sections.length === 0) {
        return { memoryBlock: '', qaIds: [], diaryIds: [], topic };
    }

    const memoryBlock = `\n\n---MEMORY BLOCK---\n${sections.join('\n\n')}\n---END MEMORY---\n`;

    return {
        memoryBlock,
        qaIds: [...recentQA, ...uniqueRelevant].map(r => r.id),
        diaryIds: diaryEntries.map(d => d.id),
        topic
    };
}

module.exports = { detectTopic, buildMemoryBlock };
