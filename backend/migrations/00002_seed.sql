-- +goose Up
INSERT INTO settings (key, value) VALUES
    ('markup_bps', '2000'),                -- наценка к цене провайдера: 20 %
    ('signup_bonus_micro', '50000000'),    -- 50 ₽ на старт
    ('fx_fallback_usd_rub_micro', '95000000'), -- курс на случай, если ЦБ недоступен и кэша нет
    ('free_daily_requests', '50'),          -- бесплатные модели без тарифа
    ('min_topup_kopecks', '10000'),         -- минимальное пополнение 100 ₽
    ('registration_open', 'true');

INSERT INTO providers (id, name, kind, priority, mock_latency_ms, mock_error_rate) VALUES
    ('mock-primary', 'Mock Primary', 'mock', 10, 35, 0),
    ('mock-backup',  'Mock Backup',  'mock', 20, 80, 0);

INSERT INTO models (id, name, author, description, modality, capabilities, categories, context_length, max_output,
                    input_usd_micro, output_usd_micro, cache_read_usd_micro, image_usd_micro, open_weights, in_plans, released_at) VALUES
 ('anthropic/claude-opus-4.5', 'Claude Opus 4.5', 'Anthropic', 'Флагман для сложных рассуждений, агентов и кода.', 'text', '{vision,tools,reasoning}', '{coding,reasoning,long-context}', 200000, 64000, 5000000, 25000000, 500000, 0, false, false, '2025-11-24'),
 ('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5', 'Anthropic', 'Баланс скорости и качества, сильна в коде.', 'text', '{vision,tools,reasoning}', '{coding,long-context,daily}', 200000, 64000, 3000000, 15000000, 300000, 0, false, false, '2025-09-29'),
 ('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 'Anthropic', 'Быстрая и недорогая модель для потоковых задач.', 'text', '{vision,tools}', '{daily,cheap}', 200000, 64000, 1000000, 5000000, 100000, 0, false, false, '2025-10-15'),
 ('openai/gpt-5', 'GPT-5', 'OpenAI', 'Универсальная модель с рассуждениями.', 'text', '{vision,tools,reasoning}', '{coding,reasoning}', 400000, 128000, 1250000, 10000000, 125000, 0, false, false, '2025-08-07'),
 ('openai/gpt-5-mini', 'GPT-5 mini', 'OpenAI', 'Компактная версия GPT-5 для массовых запросов.', 'text', '{vision,tools,reasoning}', '{daily,cheap}', 400000, 128000, 250000, 2000000, 25000, 0, false, false, '2025-08-07'),
 ('openai/gpt-4.1', 'GPT-4.1', 'OpenAI', 'Длинный контекст и аккуратное следование инструкциям.', 'text', '{vision,tools}', '{long-context,coding}', 1047576, 32768, 2000000, 8000000, 500000, 0, false, false, '2025-04-14'),
 ('openai/gpt-oss-120b', 'gpt-oss-120b', 'OpenAI', 'Открытые веса, рассуждения, вызов инструментов.', 'text', '{tools,reasoning}', '{open-source,reasoning,cheap}', 131072, 32768, 90000, 450000, 0, 0, true, true, '2025-08-05'),
 ('google/gemini-2.5-pro', 'Gemini 2.5 Pro', 'Google', 'Мультимодальная модель с контекстом в миллион токенов.', 'text', '{vision,tools,reasoning}', '{long-context,reasoning,math}', 1048576, 65536, 1250000, 10000000, 310000, 0, false, false, '2025-06-17'),
 ('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'Google', 'Быстрая модель для повседневных задач.', 'text', '{vision,tools,reasoning}', '{daily,cheap,long-context}', 1048576, 65536, 300000, 2500000, 75000, 0, false, false, '2025-06-17'),
 ('deepseek/deepseek-v3.2', 'DeepSeek V3.2', 'DeepSeek', 'Открытая модель общего назначения, входит в тарифы.', 'text', '{tools}', '{open-source,coding,cheap,daily}', 163840, 65536, 280000, 420000, 28000, 0, true, true, '2025-09-29'),
 ('deepseek/deepseek-r1', 'DeepSeek R1', 'DeepSeek', 'Модель с явной цепочкой рассуждений.', 'text', '{reasoning}', '{open-source,math,reasoning}', 163840, 32768, 550000, 2190000, 0, 0, true, false, '2025-01-20'),
 ('deepseek/deepseek-v3.2:free', 'DeepSeek V3.2 (free)', 'DeepSeek', 'Бесплатная версия с ограничением запросов в день.', 'text', '{tools}', '{open-source,free}', 65536, 8192, 0, 0, 0, 0, true, true, '2025-09-29'),
 ('qwen/qwen3-coder', 'Qwen3 Coder', 'Qwen', 'Открытая модель для кода и агентов.', 'text', '{tools}', '{coding,open-source}', 262144, 65536, 220000, 950000, 0, 0, true, true, '2025-07-23'),
 ('qwen/qwen3-235b-a22b', 'Qwen3 235B A22B', 'Qwen', 'MoE-модель с режимом рассуждений.', 'text', '{tools,reasoning}', '{open-source,math,reasoning}', 131072, 32768, 130000, 600000, 0, 0, true, true, '2025-04-29'),
 ('meta-llama/llama-4-maverick', 'Llama 4 Maverick', 'Meta', 'Мультимодальная модель с открытыми весами.', 'text', '{vision,tools}', '{open-source,daily}', 1048576, 16384, 150000, 600000, 0, 0, true, false, '2025-04-05'),
 ('meta-llama/llama-3.3-70b:free', 'Llama 3.3 70B (free)', 'Meta', 'Бесплатная модель для экспериментов.', 'text', '{tools}', '{open-source,free}', 65536, 8192, 0, 0, 0, 0, true, true, '2024-12-06'),
 ('mistral/mistral-large', 'Mistral Large', 'Mistral', 'Флагман Mistral для многоязычных задач.', 'text', '{tools}', '{daily}', 131072, 16384, 2000000, 6000000, 0, 0, false, false, '2024-11-18'),
 ('mistral/codestral', 'Codestral', 'Mistral', 'Специализированная модель для автодополнения кода.', 'text', '{tools}', '{coding,cheap}', 256000, 16384, 300000, 900000, 0, 0, false, false, '2025-01-13'),
 ('moonshot/kimi-k2', 'Kimi K2', 'Moonshot AI', 'Агентная модель с открытыми весами.', 'text', '{tools}', '{coding,open-source}', 131072, 16384, 600000, 2500000, 0, 0, true, false, '2025-07-11'),
 ('x-ai/grok-4', 'Grok 4', 'xAI', 'Модель с рассуждениями и поиском.', 'text', '{vision,tools,reasoning}', '{reasoning,math}', 256000, 32768, 3000000, 15000000, 750000, 0, false, false, '2025-07-09'),
 ('openai/gpt-image-1', 'GPT Image 1', 'OpenAI', 'Генерация и редактирование изображений.', 'image', '{image-to-image}', '{images}', 32000, 0, 5000000, 0, 0, 40000, false, false, '2025-04-23'),
 ('google/imagen-4', 'Imagen 4', 'Google', 'Фотореалистичная генерация изображений.', 'image', '{}', '{images}', 4096, 0, 0, 0, 0, 40000, false, false, '2025-05-20'),
 ('black-forest-labs/flux-1.1-pro', 'FLUX 1.1 Pro', 'Black Forest Labs', 'Быстрая генерация изображений высокого качества.', 'image', '{image-to-image}', '{images}', 4096, 0, 0, 0, 0, 40000, false, false, '2024-10-02');

INSERT INTO model_endpoints (model_id, provider_id, upstream_model, priority)
SELECT id, 'mock-primary', id, 10 FROM models;
INSERT INTO model_endpoints (model_id, provider_id, upstream_model, priority)
SELECT id, 'mock-backup', id, 20 FROM models WHERE modality = 'text';

INSERT INTO plans (id, name_ru, name_en, description_ru, description_en, price_kopecks, period_days, token_quota,
                   daily_free_requests, concurrency, features_ru, features_en, highlighted, sort) VALUES
 ('starter', 'Старт', 'Starter', 'Чтобы попробовать API и собрать прототип.', 'Try the API and build a prototype.',
   0, 30, 0, 200, 1,
   '{"200 запросов в день к бесплатным моделям","Общая очередь","Один запрос одновременно","Оплата по факту для остальных моделей"}',
   '{"200 requests per day to free models","Shared queue","One concurrent request","Pay as you go for other models"}', false, 10),
 ('core-14', 'Core', 'Core', 'Для личных проектов и регулярной работы.', 'For personal projects and regular use.',
   49000, 14, 15000000, 300, 4,
   '{"15 млн токенов за 14 дней на модели тарифа","300 запросов в день к бесплатным моделям","4 запроса одновременно","Пополнение баланса в любой момент"}',
   '{"15M tokens per 14 days on plan models","300 free-model requests per day","4 concurrent requests","Top up any time"}', false, 20),
 ('pro-14', 'Core Pro', 'Core Pro', 'Для команд и больших объёмов.', 'For teams and high volume.',
   89000, 14, 28000000, 600, 16,
   '{"28 млн токенов за 14 дней на модели тарифа","600 запросов в день к бесплатным моделям","16 запросов одновременно","Приоритетная поддержка","Подробный отчёт по использованию"}',
   '{"28M tokens per 14 days on plan models","600 free-model requests per day","16 concurrent requests","Priority support","Detailed usage report"}', true, 30),
 ('core-30', 'Core', 'Core', 'Для личных проектов и регулярной работы.', 'For personal projects and regular use.',
   89000, 30, 32000000, 300, 4,
   '{"32 млн токенов за 30 дней на модели тарифа","300 запросов в день к бесплатным моделям","4 запроса одновременно","Пополнение баланса в любой момент"}',
   '{"32M tokens per 30 days on plan models","300 free-model requests per day","4 concurrent requests","Top up any time"}', false, 40),
 ('pro-30', 'Core Pro', 'Core Pro', 'Для команд и больших объёмов.', 'For teams and high volume.',
   159000, 30, 60000000, 600, 16,
   '{"60 млн токенов за 30 дней на модели тарифа","600 запросов в день к бесплатным моделям","16 запросов одновременно","Приоритетная поддержка","Подробный отчёт по использованию"}',
   '{"60M tokens per 30 days on plan models","600 free-model requests per day","16 concurrent requests","Priority support","Detailed usage report"}', true, 50);

-- +goose Down
DELETE FROM plans; DELETE FROM model_endpoints; DELETE FROM models; DELETE FROM providers; DELETE FROM settings;
