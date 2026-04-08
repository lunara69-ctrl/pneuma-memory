/**
 * Kinia API client
 * Primary: Anthropic Claude API (streaming)
 * Fallback: LM Studio local (gdy brak ANTHROPIC_API_KEY)
 *
 * Kluczowa zasada: NIE assemblujemy pełnego system prompt.
 * Memory block = tylko relevantny kontekst historyczny z Intuicji.
 */

const { streamLocal } = require('./lmstudio');

// Lazy load Anthropic - tylko gdy klucz jest
let anthropicClient = null;

function getAnthropicClient() {
    if (anthropicClient) return anthropicClient;
    if (!process.env.ANTHROPIC_API_KEY) return null;

    try {
        const Anthropic = require('@anthropic-ai/sdk');
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        return anthropicClient;
    } catch (_) {
        return null;
    }
}

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

/**
 * Stream response - automatycznie wybiera provider
 * memoryBlock: string z Intuicji (może być '')
 * onChunk(text), onDone(fullText, err?)
 */
async function streamWithMemory(userMessage, memoryBlock, systemPrompt, onChunk, onDone) {
    // Inject memory block do wiadomości użytkownika
    const messageWithMemory = memoryBlock
        ? `${userMessage}${memoryBlock}`
        : userMessage;

    const client = getAnthropicClient();

    if (client) {
        // --- Anthropic Claude API ---
        const sysPrompt = systemPrompt || process.env.SYSTEM_PROMPT || null;
        let fullResponse = '';

        try {
            const stream = await client.messages.stream({
                model: MODEL,
                max_tokens: 4096,
                ...(sysPrompt ? { system: sysPrompt } : {}),
                messages: [{ role: 'user', content: messageWithMemory }]
            });

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' &&
                    chunk.delta?.type === 'text_delta') {
                    const text = chunk.delta.text;
                    fullResponse += text;
                    onChunk(text);
                }
            }

            await stream.finalMessage();
            onDone(fullResponse);

        } catch (err) {
            console.error('[Claude API] Error:', err.message);
            onDone(null, err);
        }

    } else {
        // --- Fallback: LM Studio local ---
        console.log('[Kinia] No API key - using local LM Studio fallback');
        const messages = [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: messageWithMemory }
        ];
        streamLocal('kinia', messages, onChunk, onDone);
    }
}

module.exports = { streamWithMemory };
