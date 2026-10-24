# MARSHGO (`dima1203oleg/MG2`) — Мультимодальний транспортний маркетплейс та навігатор України

**Версія:** `2.4.0` (`v2.4.0-prod-ua`)  
**Статус збірки та автотестів:** `BUILD_GREEN` / `STAGING_VERIFIED` (`tsc --noEmit`: 0 помилок, `vite build`: успішно, `npm test`: 11/11 тестів пройдено)

---

## 1. Огляд продукту

**MARSHGO** — це українська платформа мультимодальної мобільності, яка об’єднує в одному інтерфейсі:
- **Попутки з 0% комісії платформи (`community-zero-fee-v1`)**: прямі спільні поїздки між водіями та пасажирами з миттєвим випуском криптографічного квитка `MarshPass` (`HMAC-SHA256`), живою картою зустрічі `Rendezvous` та системою підбору альтернатив при скасуванні (`Rescue`).
- **Reverse Marketplace (Заявки пасажирів)**: публікація запиту на поїздку з власним бюджетом, отримання пропозицій від водіїв, зустрічний торг та акцепт у підтверджене бронювання.
- **Мультимодальний планувальник маршрутів (24 обласні центри України)**: побудова ланцюжків до 5 сегментів (`Пішки → Автобус/Трамвай/Метро → Поїзд УЗ → Попутка → Самокат`) у 3 режимах (`Оптимальний`, `Найшвидший`, `Найдешевший`).
- **6 канонічних екранів карти MapLibre GL JS (`Схема / Супутник / 3D`)**: повний огляд маршруту, фокус окремого сегмента, живе табло зупинки (`через 3 хв`), живий рух транспорту за маршрутом та навігація водія (`DISCOVER → PREVIEW → ACTIVE`).
- **Кабінет перевізника (B2B Partner Portal, 8% комісії)** та **Адмін-панель мобільності (RBAC + захист від SSRF)**.

---

## 2. Швидкий старт та команди перевірки

```bash
# 1. Встановлення залежностей
npm install

# 2. Перевірка статичної типізації TypeScript (0 помилок)
npm run lint

# 3. Запуск повного набору Unit + API Integration + E2E тестів (11 тестів)
npm test

# 4. Збірка клієнтського production-бандла в /dist
npm run build

# 5. Запуск уніфікованого сервера (Express API + WebSocket + SPA на порту 3000)
npm start
```

---

## 3. Структура інженерної документації (Розділ 19 ТЗ)

Уся документація українською мовою розміщена в корені репозиторію та продубльована в `/docs/`:

1. [`PRODUCTION_BASELINE.md`](./PRODUCTION_BASELINE.md) — базовий технічний паспорт та інвентаризація екранів.
2. [`REQUIREMENTS_TRACEABILITY.md`](./REQUIREMENTS_TRACEABILITY.md) — 10-колонкова таблиця трасування всіх функцій зі статусами `WORKING_VERIFIED` / `BLOCKED_EXTERNAL`.
3. [`CHANGES_1306_AUDIT.md`](./CHANGES_1306_AUDIT.md) — математичний розбір та очищення 1 306 змінених файлів перед синхронізацією з GitHub.
4. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — багаторівнева архітектура фронтенду, бекенду, кешування Radius та збереження даних.
5. [`INTEGRATIONS_STATUS.md`](./INTEGRATIONS_STATUS.md) — чесна класифікація зовнішніх інтеграцій (`LIVE_VERIFIED`, `SANDBOX_VERIFIED`, `STATIC_DATA_ONLY`, `IMPLEMENTED_AWAITING_CREDENTIALS`).
6. [`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md) — аудит безпеки (SSRF, RBAC, BOLA/IDOR, `HMAC-SHA256` `timingSafeEqual`, Rate Limiting).
7. [`TEST_MATRIX.md`](./TEST_MATRIX.md) — матриця покриття Unit, Integration та E2E тестами.
8. [`TEST_EVIDENCE.md`](./TEST_EVIDENCE.md) — фактичні результати виконання `npm test`, `npm run lint` та `npm run build`.
9. [`DEPLOYMENT_RUNBOOK.md`](./DEPLOYMENT_RUNBOOK.md) — інструкція з розгортання, перевірки `/healthz` і `/readyz` та безпечного відкату.
10. [`RELEASE_READINESS.md`](./RELEASE_READINESS.md) — звіт про готовність релізу `v2.4.0`.
11. [`.env.example`](./.env.example) — повний перелік змінних середовища без секретів.
