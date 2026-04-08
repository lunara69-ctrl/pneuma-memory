/**
 * Kronikarz - async writer via LM Studio (qwen3.5-9b-heretic, t=0.3)
 * Max ~2k kontekstu: Q-A pair → summary + affect + topics
 * Fire-and-forget, nie blokuje streamu
 */

const db = require('../db/db');
const { complete } = require('../api/lmstudio');

const SUMMARY_PROMPT = (question, answer) => [
    {
        role: 'system',
        content: 'Jesteś Kronikarzem. Analizujesz pary pytanie-odpowiedź i piszesz krótkie podsumowanie. Odpowiadaj TYLKO JSON, bez komentarzy.'
    },
    {
        role: 'user',
        content: `Przeanalizuj tę parę Q-A i zwróć JSON:

Q: ${question.substring(0, 600)}

A: ${answer.substring(0, 1000)}

Zwróć dokładnie:
{
  "summary": "1-2 zdania TL;DR",
  "topics": ["temat1", "temat2"],
  "affect": "philosophical|focused|debugging|playful|curious"
}`
    }
];

async function chronicle(sessionId, question, answer, detectedTopic) {
    try {
        // 1. Zapisz surową parę Q-A
        const tags = detectedTopic !== 'general' ? [detectedTopic] : [];
        const qaId = db.saveQA(sessionId, question, answer, detectedTopic, tags);

        // 2. LM Studio call - summary (max 300 tokenów output wystarczy)
        let summary = `Q: "${question.substring(0, 80)}..." → odpowiedź`;
        let topics = [detectedTopic];
        let affect = 'curious';

        try {
            const raw = await complete('kronikarz', SUMMARY_PROMPT(question, answer), 300);

            // Extract JSON - czasem model opakowuje w markdown
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                summary = parsed.summary || summary;
                topics = parsed.topics || topics;
                affect = parsed.affect || affect;
            }
        } catch (llmErr) {
            // LLM fail nie blokuje zapisu - fallback do prostego summary
            console.warn('[Kronikarz] LLM summary failed, using fallback:', llmErr.message);
        }

        // 3. Zapisz diary
        db.saveDiary(sessionId, summary, null, topics, affect, qaId);

        console.log(`[Kronikarz] ✓ QA #${qaId} | ${affect} | topics: ${topics.join(',')}`);
        return qaId;

    } catch (err) {
        console.error('[Kronikarz] Error:', err.message);
    }
}

module.exports = { chronicle };
