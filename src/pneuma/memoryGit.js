/**
 * Memory Git Log
 * Commituje do lokalnego repo co było injected w danej sesji.
 * Cel: reproducibility - zawsze wiemy co model "widział"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

const GIT_DIR = path.join(__dirname, '../../memory-git');
const LOG_FILE = path.join(GIT_DIR, 'injections.jsonl');

function initGitRepo() {
    if (!fs.existsSync(path.join(GIT_DIR, '.git'))) {
        execSync('git init', { cwd: GIT_DIR });
        execSync('git config user.email "pneuma@local"', { cwd: GIT_DIR });
        execSync('git config user.name "Pneuma Memory"', { cwd: GIT_DIR });
        fs.writeFileSync(path.join(GIT_DIR, 'README.md'), '# Pneuma Memory Log\nEvery injection committed.\n');
        execSync('git add -A && git commit -m "init memory repo"', { cwd: GIT_DIR });
        console.log('[MemoryGit] Initialized memory repo');
    }
}

function logInjection(sessionId, userMessage, memoryBlock, qaIds, diaryIds, topic) {
    try {
        initGitRepo();

        const entry = {
            ts: new Date().toISOString(),
            session_id: sessionId,
            topic,
            question_preview: userMessage.substring(0, 100),
            memory_block_size: memoryBlock.length,
            qa_ids: qaIds,
            diary_ids: diaryIds,
            memory_block_preview: memoryBlock.substring(0, 300)
        };

        // Append to JSONL log
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

        // Also write full session file (overwrite)
        const sessionFile = path.join(GIT_DIR, `session_${sessionId}.json`);
        let sessions = [];
        if (fs.existsSync(sessionFile)) {
            sessions = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        }
        sessions.push(entry);
        fs.writeFileSync(sessionFile, JSON.stringify(sessions, null, 2));

        // Git commit
        const commitMsg = `[${sessionId}] topic:${topic} qa:${qaIds.length} diary:${diaryIds.length}`;
        execSync(`git add -A && git commit -m "${commitMsg}"`, { cwd: GIT_DIR });

        // Save to DB
        db.logMemoryInjection(sessionId, userMessage, memoryBlock.length, qaIds, diaryIds, topic);

        console.log(`[MemoryGit] Committed: ${commitMsg}`);

    } catch (err) {
        // Non-fatal - don't break the chat
        console.error('[MemoryGit] Error:', err.message);
    }
}

module.exports = { logInjection, initGitRepo };
