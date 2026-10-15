# F0–F4: дорожная карта и привязка бэклога

15.10.2026 · ID24_API-10. План скорректирован относительно просроченного 05.10, а не объявлен выполненным задним числом. Даты до Release0.5 согласуются с seminar-05, после него — прогноз с gates и резервом.

| Фаза | Окно / спринты | Результат | Gate перехода |
|---|---|---|---|
| F0 Foundation | S0 просрочен; восстановление15–18.10 + S1 до19.10 | PRD/regulation, C4/ADR, schemas, monorepo, DB, local stack, test strategy | Все технические проверки + явные внешние блокеры, не фиктивные договора |
| F1 Alpha / Release0.5 | S2 19.10–02.11, S3 02–16.11, S4 16–30.11, S5 30.11–14.12 | Mock non-stream, tenant/key/ledger срез, stage, US04/05 | Demo14.12 + exact ledger,80ms/20concurrent и known issue list |
| F2 MVP | S6 18.01–01.02.2027, S7 01–15.02, S8 15.02–01.03 | Минимальный ЛК,3 adapters,keys,stub balance,tokens/SSE | 100RPS/500SSE,3 adapter contracts, auth/security; legal gate до внешних paid calls |
| F3 Beta | S9–S12 01.03–26.04.2027 | Реальные payments, fallback, documents, monitoring | 3 signed permissible channels, PSP sandbox/reconcile,99.5%, restore drill |
| F4 GA | S13–S16 26.04–21.06.2027 | Legal entities, pentest, HA,99.9% | 30дней SLO evidence, restore/pentest, budget/operations acceptance |

15.12–17.01 — резерв, экзамены/праздничный период, не скрытая полная capacity. Февральские/мартовские/майские праздничные недели учитываются резервом ~20% внутри прогнозных фаз; конкретный учебный календарь и доступность команды надо подтвердить. Сдвиг зависит от финансовых/юридических gate, GA дата не обещание.

## Карта эпиков (многорелизные)

| Эпик | Основная фаза | Повторное усиление |
|---|---|---|
| E00 product/management | F0 | Каждая фаза планирование/метрики |
| E01 legal | F0 discovery | F3 contracts, F4 legal entities |
| E02 architecture | F0 | F2/F4 capacity revisions |
| E03 infra | F0 local | F1 stage, F3 monitoring, F4 HA |
| E04 gateway | F1 slice | F2 full MVP, F3 hardening |
| E05 adapters | F1 mock | F2 3 adapters, F3 legal production |
| E06 routing | F2 basic | F3 fallback |
| E07 billing | F1 stub ledger | F3 real payments |
| E08 identity/keys/org | F1 single flow | F2 keys, F4 organizations |
| E09 limits | F2 | F3 budgets |
| E10 analytics | F1 usage | F3 CH dashboards |
| E11–E13 web/site/admin | F2 | F3 support/docs |
| E14 security | F0 design | F3 review,F4 pentest |
| E15 testing | F0 strategy | Gate каждой фазы |
| E16 growth | F4+ | Не блокирует учебный срез |
| E17 releases | F1 | F2/F3/F4 separate go/no-go |

Текущие F0 карточки: 5,6,7,9,10,13,21–28,31,36,178 (8 в карте F0, но не входит в поручение Ильи). Связь записывается в отчёт соответствующих задач «Сферы». Риск203 — F0 risk register;204/205 — F1 integrity corrections, due19.10;206 — F1 contract/provider, due26.10. Их новые сроки не переносят их в окно до18.10.

Зависимости: 6→7→21→22/23;24→25/adapters;26→billing;28→36→stage;27/178→все release gates. 9 domain и31 org cloud account не нужны локальному mock, но нужны публичной Beta. 13 contracts — жёсткий gate внешнего paid inference. Изменение даты не скрывает просрочку: фактический delivery и оставшийся criterion записываются отдельно.
