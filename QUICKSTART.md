# Pneuma Memory — Quickstart

Up and running in 5 minutes.

---

## Requirements

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **LM Studio** — [lmstudio.ai](https://lmstudio.ai) with `google/gemma-4-4b-it` loaded (or `qwen/qwen3.5-9b`)
- **Chrome / Chromium**
- RAM: 8GB minimum (4GB system + 4GB for the 4B model)

---

## Step 1 — Clone and install

```bash
git clone https://github.com/lunara69-ctrl/pneuma-memory.git
cd pneuma-memory
npm install
cp .env.example .env
```

---

## Step 2 — Start LM Studio

1. Download and install [LM Studio](https://lmstudio.ai)
2. Download model: `google/gemma-4-4b-it` (or `qwen/qwen3.5-9b` for better recall)
3. Load the model → enable the local server on port `1234`
4. Verify: `curl http://localhost:1234/v1/models`

---

## Step 3 — Start the Pneuma server

### Windows
```
start.bat          ← double-click
```

### Linux / Mac
```bash
node server.js
```

Verify:
```bash
curl http://localhost:3333/api/status
# {"ok":true,"port":3333,"version":"0.2.0"}
```

---

## Step 4 — Install the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the **P** icon on the Chrome toolbar → side panel opens

---

## Step 5 — First test

1. Open `claude.ai` (or `chatgpt.com`)
2. Side panel should show a green dot: `localhost:3333`
3. Type a message and send
4. **Intuicja** section shows a memory block preview (empty on first use — builds over time)
5. After the AI responds — **Kronikarz** section shows the Q+A preview with Save / Ignore buttons

The database starts empty. Approve a few Kronikarz entries and Intuicja will start injecting relevant context on future messages.

---

## Import existing conversations

Have claude.ai Markdown exports (`**You**` / `**Claude**` format)?

```bash
node src/tools/importer.js "path/to/conversation.md" "session_name"
```

Or via web UI: http://localhost:3333/import

---

## Docker (alternative)

```bash
docker-compose up -d
```

Server available at `http://localhost:3333`.
LM Studio must run on the host — set `LMSTUDIO_URL=http://host.docker.internal:1234` in `.env`.

---

## Troubleshooting

**Port 3333 busy:** `start.bat` releases it automatically. Manual: `taskkill /F /IM node.exe` (Windows)

**LM Studio not responding:** Check that the server is running (green dot in LM Studio) and a model is loaded.

**Extension shows "server offline":** Verify the server is running (`curl localhost:3333/api/status`). CORS is configured — no extra setup needed.

**No memory block injected:** Database is empty on first use. Approve a few Kronikarz saves — after a few turns Intuicja will start finding matches.

**Want better recall?** Switch to `qwen/qwen3.5-9b` in `.env` (requires ~6GB VRAM).
