# Pneuma Memory — Quickstart

Uruchomienie w 5 minut.

---

## Wymagania

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **LM Studio** — [lmstudio.ai](https://lmstudio.ai) z modelem `google/gemma-4-4b-it` (lub `qwen/qwen3.5-9b`)
- **Chrome / Chromium**
- RAM: min. 8GB (4GB system + 4GB dla modelu 4B)

---

## Krok 1 — Sklonuj i zainstaluj

```bash
git clone https://github.com/your-org/pneuma-memory.git
cd pneuma-memory
npm install
cp .env.example .env
```

---

## Krok 2 — Uruchom LM Studio

1. Pobierz i zainstaluj [LM Studio](https://lmstudio.ai)
2. Pobierz model: `google/gemma-4-4b-it` (lub `qwen/qwen3.5-9b`)
3. Załaduj model → włącz serwer na porcie `1234`
4. Sprawdź: `curl http://localhost:1234/v1/models`

---

## Krok 3 — Uruchom serwer Pneumy

### Windows
```
start.bat          ← dwuklik
```

### Linux / Mac
```bash
node server.js
```

Sprawdź:
```bash
curl http://localhost:3333/api/status
# {"ok":true,"port":3333,"version":"0.2.0"}
```

---

## Krok 4 — Zainstaluj wtyczkę Chrome

1. Otwórz `chrome://extensions`
2. Włącz **Developer mode**
3. Kliknij **Load unpacked** → wybierz folder `extension/`
4. Kliknij ikonkę **P** na pasku Chrome → otworzy się side panel

---

## Krok 5 — Pierwszy test

1. Otwórz `claude.ai` (lub `chatgpt.com`)
2. W side panelu powinna pojawić się zielona kropka: `localhost:3333`
3. Napisz wiadomość i wyślij
4. Side panel pokaże sekcję **Intuicja** z podglądem memory block (jeśli masz coś w bazie)
5. Po odpowiedzi AI — sekcja **Kronikarz** z podglądem do zatwierdzenia

Przy pierwszym użyciu baza jest pusta — Kronikarz zacznie budować historię od teraz.

---

## Import istniejących rozmów

Masz eksporty z claude.ai w formacie Markdown (`**You**` / `**Claude**`)?

```bash
node src/tools/importer.js "ścieżka/do/rozmowy.md" "nazwa_sesji"
```

Lub przez UI: http://localhost:3333/import

---

## Docker (alternatywa)

```bash
docker-compose up -d
```

Serwer będzie dostępny na `http://localhost:3333`.  
LM Studio musi działać na hoście — w `.env` ustaw `LMSTUDIO_URL=http://host.docker.internal:1234`.

---

## Weryfikacja po 5 minutach

```bash
# Status serwera
curl http://localhost:3333/api/status

# Test memory block
curl -X POST http://localhost:3333/api/memory \
  -H "Content-Type: application/json" \
  -d '{"message":"testowe pytanie","sessionId":"test"}'

# Podejrzyj bazę
curl http://localhost:3333/api/status
```

Jeśli wszystko zwraca JSON — działa.

---

## Problemy?

**Port 3333 zajęty:** `start.bat` zwalnia go automatycznie. Ręcznie: `taskkill /F /IM node.exe`

**LM Studio nie odpowiada:** Sprawdź czy serwer jest włączony (zielona kropka w LM Studio) i model załadowany.

**Wtyczka nie widzi serwera:** Sprawdź czy serwer działa (`curl localhost:3333/api/status`). CORS jest skonfigurowany — nie potrzeba dodatkowych ustawień.

**Brak memory block:** Baza jest pusta. Wyślij kilka wiadomości przez wtyczkę i zatwierdź w Kronikarz — po kilku turach Intuicja zacznie znajdować pasujące Q-A.
