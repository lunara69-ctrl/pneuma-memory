/**
 * Importer historii chatów z pliku MD (format claude.ai clipping)
 *
 * Format wejściowy:
 *   **You**
 *   treść pytania
 *   ---
 *   **Claude**
 *   treść odpowiedzi
 *   ---
 *
 * Użycie:
 *   node src/tools/importer.js <plik.md> [session_id]
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const { detectTopic } = require('../pneuma/intuicja');

function parseMarkdownChat(content) {
    const pairs = [];

    // Normalizuj separatory
    const normalized = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    // Split na bloki - szukamy "**You**" i "**Claude**"
    const blocks = normalized.split(/\n---\n/);

    let currentQuestion = null;

    for (const block of blocks) {
        const trimmed = block.trim();

        // Usuń frontmatter YAML
        if (trimmed.startsWith('---') && trimmed.includes('title:')) continue;

        if (trimmed.startsWith('**You**')) {
            const text = trimmed.replace(/^\*\*You\*\*\s*/m, '').trim();
            if (text) currentQuestion = text;

        } else if (trimmed.startsWith('**Claude**')) {
            const text = trimmed.replace(/^\*\*Claude\*\*\s*/m, '').trim();
            if (text && currentQuestion) {
                pairs.push({
                    question: currentQuestion,
                    answer: text
                });
                currentQuestion = null;
            }
        }
    }

    return pairs;
}

async function importFile(filePath, sessionId) {
    console.log(`\n[Importer] Plik: ${filePath}`);
    console.log(`[Importer] Session: ${sessionId}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const pairs = parseMarkdownChat(content);

    console.log(`[Importer] Znaleziono par Q-A: ${pairs.length}`);

    if (pairs.length === 0) {
        console.error('[Importer] Brak par do importu. Sprawdź format pliku.');
        return;
    }

    await db.getDb();

    let saved = 0;
    let skipped = 0;

    for (const pair of pairs) {
        // Skip bardzo krótkich (nawigacyjne, błędy)
        if (pair.question.length < 10 || pair.answer.length < 20) {
            skipped++;
            continue;
        }

        const { topic, keywords } = detectTopic(pair.question + ' ' + pair.answer);
        const tags = [...new Set([topic, ...keywords])].filter(t => t !== 'general').slice(0, 5);

        // Truncate do rozsądnych limitów (nie potrzebujemy całości w raw_qa)
        const q = pair.question.substring(0, 2000);
        const a = pair.answer.substring(0, 3000);

        db.saveQA(sessionId, q, a, topic, tags);
        saved++;

        // Progress
        if (saved % 10 === 0) process.stdout.write(`  ${saved}...`);
    }

    console.log(`\n[Importer] ✓ Zapisano: ${saved} | Pominięto: ${skipped}`);
    return saved;
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    if (!args[0]) {
        console.error('Użycie: node src/tools/importer.js <plik.md> [session_id]');
        process.exit(1);
    }

    const filePath = path.resolve(args[0]);
    const sessionId = args[1] || `import_${Date.now()}`;

    if (!fs.existsSync(filePath)) {
        console.error(`Plik nie istnieje: ${filePath}`);
        process.exit(1);
    }

    importFile(filePath, sessionId).then(() => {
        console.log('[Importer] Gotowe.');
        process.exit(0);
    }).catch(err => {
        console.error('[Importer] Błąd:', err.message);
        process.exit(1);
    });
}

module.exports = { importFile, parseMarkdownChat };
