-- Журнал запросов. Текста промпта здесь нет.
-- Детальные строки живут 13 месяцев, срез по месяцу, порядок: арендатор и время.

CREATE TABLE IF NOT EXISTS requests (
    ts DateTime,
    generation_id String,
    tenant String,
    key String,
    user String,
    model String,
    provider String,
    endpoint String,
    prompt_tokens UInt32,
    completion_tokens UInt32,
    cached_tokens UInt32,
    cache_write_tokens UInt32,
    reasoning_tokens UInt32,
    price_minor Int64,
    cost_minor Int64,
    rub_per_usd Int64,
    latency_ms UInt32,
    ttft_ms UInt32,
    status LowCardinality(String),
    error_code String,
    finish_reason LowCardinality(String),
    stream UInt8,
    cancelled UInt8,
    cache_hit UInt8,
    app String,
    ip_hash String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (tenant, ts)
TTL ts + INTERVAL 13 MONTH;
