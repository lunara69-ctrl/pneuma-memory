-- Pneuma SQLite Schema - Debug Mode
-- Kolejność ma znaczenie

-- Surowe pary Q-A (historia rozmów)
CREATE TABLE IF NOT EXISTS raw_qa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    topic TEXT,
    tags TEXT,       -- JSON array: ["electron","pneuma","llm"]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Diary - wpisy Kronikarza (skrót + esencja rozmowy)
CREATE TABLE IF NOT EXISTS diary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    summary TEXT NOT NULL,      -- krótki TL;DR
    essay TEXT,                 -- głębszy zapis filozoficzny (opcjonalny)
    topics TEXT,                -- JSON array tematów
    affect TEXT,                -- nastrój: curious/focused/philosophical/frustrated
    source_qa_id INTEGER REFERENCES raw_qa(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Memory git log - co było injected w danej sesji
CREATE TABLE IF NOT EXISTS memory_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    question_preview TEXT,      -- pierwsze 100 znaków pytania
    memory_block_size INTEGER,  -- ile tokenów approx
    qa_ids_injected TEXT,       -- JSON array ID z raw_qa
    diary_ids_injected TEXT,    -- JSON array ID z diary
    topic_detected TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indeksy dla szybkości
CREATE INDEX IF NOT EXISTS idx_raw_qa_topic ON raw_qa(topic);
CREATE INDEX IF NOT EXISTS idx_raw_qa_session ON raw_qa(session_id);
CREATE INDEX IF NOT EXISTS idx_diary_topics ON diary(topics);
CREATE INDEX IF NOT EXISTS idx_memory_log_session ON memory_log(session_id);
