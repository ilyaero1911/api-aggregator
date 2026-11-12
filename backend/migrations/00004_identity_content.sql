-- +goose Up
-- Внешние входы: GitHub, Яндекс, VK. google_sub остаётся для совместимости, новые входы — здесь.
CREATE TABLE user_identities (
    provider   text NOT NULL CHECK (provider IN ('github', 'yandex', 'vk')),
    subject    text NOT NULL,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email      text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);
CREATE INDEX user_identities_user ON user_identities (user_id);

-- Согласие на обработку персональных данных (152-ФЗ): когда и какую редакцию документа принял пользователь.
ALTER TABLE users ADD COLUMN pd_consent_at timestamptz;
ALTER TABLE users ADD COLUMN pd_consent_version text NOT NULL DEFAULT '';

-- Тексты, которые админ правит без деплоя: политика, оферта, согласие.
CREATE TABLE content_pages (
    slug       text PRIMARY KEY,
    title_ru   text NOT NULL,
    title_en   text NOT NULL,
    body_ru    text NOT NULL DEFAULT '',
    body_en    text NOT NULL DEFAULT '',
    version    integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Новости и объявления для пользователей кабинета.
CREATE TABLE announcements (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title_ru   text NOT NULL,
    title_en   text NOT NULL DEFAULT '',
    body_ru    text NOT NULL DEFAULT '',
    body_en    text NOT NULL DEFAULT '',
    kind       text NOT NULL DEFAULT 'info' CHECK (kind IN ('info', 'success', 'warning')),
    published  boolean NOT NULL DEFAULT false,
    pinned     boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE announcement_reads (
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    announcement_id uuid NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
    read_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, announcement_id)
);

-- Журнал действий пользователя (входы, ключи, платежи), виден ему самому.
CREATE TABLE user_events (
    id         bigserial PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL,
    details    text NOT NULL DEFAULT '',
    ip         text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_events_user ON user_events (user_id, id DESC);

INSERT INTO settings (key, value) VALUES
    ('footer_tagline_ru', '"Шлюз к нейросетям с оплатой в рублях."'),
    ('footer_tagline_en', '"An AI model gateway billed in rubles."'),
    ('company_name', '"ООО «Стрелка»"'),
    ('company_inn', '"0000000000"'),
    ('company_ogrn', '"0000000000000"'),
    ('company_address', '"Россия, г. Москва"'),
    ('company_email', '"support@strelka.local"'),
    ('company_phone', '""')
ON CONFLICT (key) DO NOTHING;

-- +goose StatementBegin
INSERT INTO content_pages (slug, title_ru, title_en, body_ru, body_en) VALUES
('privacy', 'Политика обработки персональных данных', 'Privacy policy',
'## 1. Общие положения
Настоящая политика определяет порядок обработки и защиты персональных данных пользователей сервиса {company} (далее — Оператор) в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».

## 2. Какие данные мы обрабатываем
- адрес электронной почты и имя;
- идентификатор аккаунта GitHub, Яндекс или VK, если вы входите через них;
- IP-адрес и сведения о браузере при входе;
- метаданные запросов к API: модель, число токенов, стоимость, время. Тексты запросов не сохраняются, если вы сами не включили это в настройках.

## 3. Цели обработки
Регистрация и вход, оказание услуг доступа к API, учёт оплат и расходов, поддержка пользователей, исполнение требований закона.

## 4. Правовые основания
Согласие субъекта персональных данных, договор (публичная оферта), обязанности, установленные законодательством РФ.

## 5. Хранение и локализация
Персональные данные граждан РФ записываются, систематизируются и хранятся в базах данных, находящихся на территории Российской Федерации (ч. 5 ст. 18 152-ФЗ). Данные хранятся до удаления аккаунта или отзыва согласия, если более долгий срок не требуется законом.

## 6. Передача третьим лицам
Тексты запросов передаются провайдерам языковых моделей только для получения ответа. Персональные данные (почта, имя) провайдерам не передаются.

## 7. Права пользователя
Вы можете запросить сведения об обработке, уточнение, блокирование или удаление своих данных и отозвать согласие, написав на {email}. Ответ направляется в течение 10 рабочих дней.

## 8. Контакты оператора
{company}, ИНН {inn}, ОГРН {ogrn}, {address}, {email}.',
'## 1. General
This policy describes how {company} (the Operator) processes and protects personal data in accordance with Russian Federal Law No. 152-FZ "On Personal Data".

## 2. Data we process
Email and name; GitHub, Yandex or VK account id if you sign in with them; IP address and browser data at sign-in; API request metadata (model, tokens, cost, time). Prompt text is not stored unless you enable it.

## 3. Purposes
Sign-up and sign-in, providing API access, billing, support, legal compliance.

## 4. Storage
Personal data of Russian citizens is stored in databases located in the Russian Federation.

## 5. Your rights
You can request information, correction or deletion of your data and withdraw consent by writing to {email}.

## 6. Contacts
{company}, TIN {inn}, {address}, {email}.'),
('terms', 'Публичная оферта', 'Terms of service',
'## 1. Предмет договора
{company} (Исполнитель) предоставляет Пользователю доступ к программному интерфейсу (API) языковых моделей, а Пользователь оплачивает услуги в порядке, описанном ниже.

## 2. Акцепт
Регистрация на сайте означает полное и безоговорочное принятие условий настоящей оферты (ст. 438 ГК РФ).

## 3. Стоимость и оплата
Стоимость указывается на сайте в рублях. Оплата производится авансом путём пополнения баланса или оплаты тарифа. Списание происходит по факту использования.

## 4. Возврат средств
Неиспользованный остаток баланса возвращается по заявлению Пользователя на {email} в течение 10 рабочих дней за вычетом расходов на перевод.

## 5. Ограничения
Запрещено использовать сервис для создания противоправного контента, нарушения прав третьих лиц и обхода ограничений провайдеров моделей.

## 6. Ответственность
Ответы моделей формируются автоматически; Исполнитель не отвечает за их содержание и за решения, принятые на их основе.

## 7. Реквизиты
{company}, ИНН {inn}, ОГРН {ogrn}, {address}, {email}.',
'## 1. Subject
{company} provides access to the language model API; the User pays for the services as described below.

## 2. Acceptance
Signing up means full acceptance of these terms.

## 3. Pricing
Prices are shown on the website. Payment is made in advance; usage is charged as it happens.

## 4. Refunds
Unused balance is refunded on request to {email}.

## 5. Contacts
{company}, TIN {inn}, {address}, {email}.'),
('consent', 'Согласие на обработку персональных данных', 'Consent to personal data processing',
'Регистрируясь на сайте, я свободно, своей волей и в своём интересе даю согласие {company} (ИНН {inn}, {address}) на обработку моих персональных данных: адреса электронной почты, имени, идентификаторов аккаунтов GitHub, Яндекс или VK, IP-адреса и сведений об использовании сервиса.

Цели обработки: регистрация и предоставление доступа к сервису, учёт оплат, поддержка, направление уведомлений, связанных с работой сервиса.

Действия с данными: сбор, запись, систематизация, накопление, хранение, уточнение, использование, блокирование, удаление и уничтожение, с использованием средств автоматизации и без них.

Согласие действует до удаления аккаунта и может быть отозвано письмом на {email}. Мне известно, что после отзыва согласия оператор вправе продолжить обработку в случаях, предусмотренных 152-ФЗ.',
'By signing up I consent to {company} processing my personal data (email, name, GitHub/Yandex/VK account ids, IP address and service usage data) for providing the service, billing, support and service notifications. The consent is valid until the account is deleted and can be withdrawn by writing to {email}.')
ON CONFLICT (slug) DO NOTHING;
-- +goose StatementEnd

-- +goose StatementBegin
INSERT INTO announcements (title_ru, title_en, body_ru, body_en, kind, published, pinned) VALUES
('Добро пожаловать в Strelka', 'Welcome to Strelka', 'Сейчас площадка работает в тестовом режиме: ответы моделей приходят от тестового провайдера, а оплата фиктивная. Будем рады отзывам.', 'The platform is in test mode: model answers come from a test provider and payments are simulated. Feedback is welcome.', 'info', true, true);
-- +goose StatementEnd

-- +goose Down
DROP TABLE user_events, announcement_reads, announcements, content_pages, user_identities;
ALTER TABLE users DROP COLUMN pd_consent_at, DROP COLUMN pd_consent_version;
DELETE FROM settings WHERE key IN ('footer_tagline_ru','footer_tagline_en','company_name','company_inn','company_ogrn','company_address','company_email','company_phone');
