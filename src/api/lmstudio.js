/**
 * LM Studio client - OpenAI-compatible, no API key
 * Używany przez Intuicję i Kronikarza
 * Max 2-3k kontekstu wystarczy dla tych ról
 */

const http = require('http');

const BASE_URL = process.env.LMSTUDIO_URL || 'http://localhost:1234';

// Modele per rola
// Jeden model w VRAM - tylko temperatura się zmienia per rola
const MODELS = {
    intuicja:  process.env.MODEL_INTUICJA  || 'qwen/qwen3.5-9b',
    kronikarz: process.env.MODEL_KRONIKARZ || 'qwen/qwen3.5-9b',
    kinia:     process.env.MODEL_KINIA     || 'qwen/qwen3.5-9b',
};

/**
 * POST do LM Studio - synchroniczny HTTP (no axios, no fetch polyfill potrzebny)
 */
function postJSON(path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 1234,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse error: ${data.substring(0, 200)}`)); }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Simple completion - dla Intuicji i Kronikarza
 * max_tokens: 500-800, temp niski
 */
async function complete(role, messages, maxTokens = 600) {
    const model = MODELS[role];
    const TEMPS = { intuicja: 0.1, kronikarz: 0.3, kinia: 0.7 };
    const temp = TEMPS[role] ?? 0.3;

    const response = await postJSON('/v1/chat/completions', {
        model,
        messages,
        temperature: temp,
        max_tokens: maxTokens,
        stream: false,
    });

    if (!response.choices?.[0]?.message?.content) {
        throw new Error(`LM Studio bad response: ${JSON.stringify(response).substring(0, 200)}`);
    }

    return response.choices[0].message.content;
}

/**
 * Streaming - dla lokalnej Kini (fallback gdy brak Claude API)
 */
function streamLocal(role, messages, onChunk, onDone) {
    const model = MODELS[role];
    const temp = 0.7;
    const payload = JSON.stringify({
        model,
        messages,
        temperature: temp,
        max_tokens: 4096,
        stream: true,
    });

    const options = {
        hostname: 'localhost',
        port: 1234,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        }
    };

    let fullResponse = '';

    const req = http.request(options, (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                    onDone(fullResponse);
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    const text = parsed.choices?.[0]?.delta?.content || '';
                    if (text) {
                        fullResponse += text;
                        onChunk(text);
                    }
                } catch (_) {}
            }
        });

        res.on('end', () => {
            if (fullResponse) onDone(fullResponse);
        });
    });

    req.on('error', (err) => onDone(null, err));
    req.write(payload);
    req.end();
}

module.exports = { complete, streamLocal, MODELS };
