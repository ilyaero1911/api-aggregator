/** Готовые сценарии: задача, промпт, пример входа и код для API. */
export type Scenario = {
  slug: string; icon: "receipt" | "chat" | "tag" | "history" | "send" | "book";
  title: [string, string]; lead: [string, string]; model: string;
  system: string; example: string; result: string;
  steps: [string, string][];
};

export const SCENARIOS: Scenario[] = [
  {
    slug: "product-descriptions", icon: "tag", model: "deepseek/deepseek-v3.2",
    title: ["Описания товаров для каталога", "Product descriptions for a catalog"],
    lead: ["Таблица с характеристиками на входе — продающее описание, title и description для SEO на выходе. Тысячи карточек за вечер.", "A spreadsheet of specs in, a selling description plus SEO title and meta out. Thousands of cards in an evening."],
    system: "Ты копирайтер интернет-магазина. По характеристикам товара напиши: 1) описание на 400–600 знаков без воды и клише, 2) SEO-title до 60 знаков, 3) meta description до 160 знаков. Ответ строго в JSON с полями description, title, meta.",
    example: "Чайник электрический, 1,7 л, стекло, подсветка, 2200 Вт, автоотключение, цвет графит",
    result: "{\"description\": \"Стеклянный чайник на 1,7 л вскипятит воду за пару минут благодаря мощности 2200 Вт…\", \"title\": \"Электрочайник стеклянный 1,7 л с подсветкой, графит\", \"meta\": \"Чайник 2200 Вт с подсветкой и автоотключением. Объём 1,7 л…\"}",
    steps: [["Выгрузите товары в CSV", "Export products to CSV"], ["Для каждой строки отправьте запрос с характеристиками", "Send one request per row"], ["Разберите JSON и загрузите обратно в каталог", "Parse JSON and upload back"]],
  },
  {
    slug: "review-replies", icon: "chat", model: "anthropic/claude-haiku-4.5",
    title: ["Ответы на отзывы покупателей", "Replies to customer reviews"],
    lead: ["Вежливый ответ, тема отзыва и флаг для менеджера: жалобы на брак, деньги и безопасность уходят человеку.", "A polite reply, the review topic and a flag for a manager: complaints about defects, money or safety go to a human."],
    system: "Ты отвечаешь на отзывы покупателей от имени магазина. Ответ тёплый, конкретный, без шаблонных фраз, до 400 знаков. Верни JSON: reply, topic (доставка, качество, цена, сервис, другое), escalate (true, если речь о браке, возврате денег или безопасности).",
    example: "Заказ пришёл через 9 дней вместо 3, коробка мятая, но сам товар отличный.",
    result: "{\"reply\": \"Спасибо, что дождались и оценили товар! Извините за задержку и помятую коробку — передали замечание службе доставки…\", \"topic\": \"доставка\", \"escalate\": false}",
    steps: [["Забирайте новые отзывы из маркетплейса", "Pull new reviews from the marketplace"], ["Отправляйте текст отзыва в модель", "Send the review text to the model"], ["Публикуйте ответ или передавайте менеджеру по флагу", "Publish the reply or hand off by flag"]],
  },
  {
    slug: "avito-ads", icon: "receipt", model: "openai/gpt-5-mini",
    title: ["Объявления для Авито", "Classified ads"],
    lead: ["Заголовок и описание для каждого товара или услуги из таблицы — сразу в файл автозагрузки. Дефекты б/у товаров описываются честно.", "A title and description for each item or service from a spreadsheet, ready for bulk upload. Defects of used items are described honestly."],
    system: "Составь объявление для Авито. Заголовок до 50 знаков без капса и восклицаний. Описание 500–900 знаков: главное в первых двух строках, затем характеристики списком, состояние честно, условия сделки. Верни JSON: title, description.",
    example: "iPhone 13, 128 ГБ, синий, аккумулятор 86%, царапина на рамке, полный комплект, Москва, самовывоз",
    result: "{\"title\": \"iPhone 13 128 ГБ синий, АКБ 86%\", \"description\": \"Продаю iPhone 13 на 128 ГБ в синем цвете. Работает без нареканий, аккумулятор 86%…\"}",
    steps: [["Соберите товары в таблицу", "Collect items in a table"], ["Сгенерируйте объявления пачкой", "Generate ads in batch"], ["Сохраните в XML автозагрузки", "Save to the bulk upload XML"]],
  },
  {
    slug: "meeting-minutes", icon: "history", model: "google/gemini-2.5-flash",
    title: ["Протокол встречи из записи", "Meeting minutes from a transcript"],
    lead: ["Расшифровка созвона превращается в протокол: решения, задачи с ответственными и сроками, открытые вопросы.", "A call transcript becomes minutes: decisions, tasks with owners and deadlines, open questions."],
    system: "Ты секретарь. По расшифровке встречи составь протокол в Markdown: ## Решения (списком), ## Задачи (таблица: задача, ответственный, срок), ## Открытые вопросы. Не выдумывай того, чего нет в тексте.",
    example: "Анна: давайте запустим рассылку в четверг. Олег: я подготовлю тексты к среде. Анна: а бюджет на рекламу пока не утверждён, вернёмся к нему в понедельник.",
    result: "## Решения\n- Рассылку запускаем в четверг.\n\n## Задачи\n| Задача | Ответственный | Срок |\n|---|---|---|\n| Подготовить тексты | Олег | среда |\n\n## Открытые вопросы\n- Бюджет на рекламу — обсудить в понедельник.",
    steps: [["Расшифруйте запись встречи", "Transcribe the recording"], ["Отправьте текст с инструкцией", "Send the text with the instruction"], ["Отправьте протокол участникам", "Share the minutes with attendees"]],
  },
  {
    slug: "crm-emails", icon: "send", model: "anthropic/claude-sonnet-4.5",
    title: ["Письма клиентам из CRM", "Emails to clients from CRM"],
    lead: ["Персональное письмо каждому клиенту по его истории: жалобы и возвраты уходят менеджеру, остальное отправляется само.", "A personal email for every client based on their history: complaints and refunds go to a manager, the rest is sent automatically."],
    system: "Напиши персональное письмо клиенту по данным из CRM. Тон дружелюбный и деловой, до 120 слов, одно конкретное предложение. Верни JSON: subject, body, needs_manager (true, если в истории есть жалоба или возврат).",
    example: "Клиент: Иван, покупал кофемашину 11 месяцев назад, гарантия заканчивается через месяц, жалоб не было.",
    result: "{\"subject\": \"Иван, гарантия на кофемашину скоро закончится\", \"body\": \"Здравствуйте, Иван! Через месяц заканчивается гарантия на вашу кофемашину…\", \"needs_manager\": false}",
    steps: [["Выгрузите сегмент клиентов из CRM", "Export a client segment from CRM"], ["Сгенерируйте письма", "Generate the emails"], ["Отправьте через рассыльщик, спорные — менеджеру", "Send via your mailer, edge cases to a manager"]],
  },
  {
    slug: "course-tests", icon: "book", model: "qwen/qwen3-235b-a22b",
    title: ["Тесты к урокам курса", "Quizzes for course lessons"],
    lead: ["Пять вопросов с пояснениями к каждому уроку. Вторая модель проверяет ответы, результат импортируется в LMS.", "Five questions with explanations for each lesson. A second model checks the answers; the result imports into your LMS."],
    system: "По тексту урока составь 5 вопросов с 4 вариантами ответа, один верный. К каждому вопросу дай короткое пояснение, почему ответ верный. Верни JSON-массив: question, options, correct, explanation.",
    example: "Урок: сложные проценты. Если вклад 100 000 ₽ под 10% годовых с ежегодной капитализацией, через 2 года будет 121 000 ₽.",
    result: "[{\"question\": \"Сколько будет на вкладе через 2 года?\", \"options\": [\"120 000\", \"121 000\", \"110 000\", \"122 000\"], \"correct\": 1, \"explanation\": \"100 000 × 1,1 × 1,1 = 121 000\"}]",
    steps: [["Разбейте курс на уроки", "Split the course into lessons"], ["Сгенерируйте вопросы", "Generate questions"], ["Проверьте второй моделью и импортируйте", "Validate with a second model and import"]],
  },
];

export function scenarioCode(s: Scenario, base: string) {
  return `from openai import OpenAI

client = OpenAI(base_url="${base}", api_key="…")

SYSTEM = """${s.system}"""

def run(text: str) -> str:
    resp = client.chat.completions.create(
        model="${s.model}",
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": text},
        ],
        temperature=0.4,
    )
    return resp.choices[0].message.content

print(run("${s.example.replace(/"/g, '\\"')}"))`;
}
