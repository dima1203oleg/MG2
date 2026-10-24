# MARSHGO — ROLLBACK RUNBOOK

**Дата оновлення:** 2026-10-24  
**Цільовий час відновлення (RTO):** `< 3 хвилин`

---

## 1. Тригери негайного відкату (Rollback Triggers)

Негайний rollback виконується автоматично або черговим SRE-інженером, якщо протягом 3 хвилин після деплою спостерігається будь-яка з умов:
1. `GET /healthz` або `GET /readyz` повертає статус `!= 200 OK`.
2. Частка помилок `5xx` на `/api/v1/journeys/search` або `/api/v1/bookings` перевищує `1%`.
3. WebSocket `/api/v1/realtime` не встановлює з'єднання або втрачає сесії `Rendezvous`.
4. Порушено цілісність відображення квитків `MarshPass`.

---

## 2. Процедура відкату до попереднього стабільного SHA Manifest

### Крок 1. Перемикання контейнерів на попередній релізний тег
```bash
cd MARSHGO-WORKSPACE/MarshGO
export ROLLBACK_RELEASE_SHA="<PREVIOUS_VERIFIED_MANIFEST_SHA>"
docker compose -f docker-compose.staging.yml down
git checkout "${ROLLBACK_RELEASE_SHA}"
docker compose -f docker-compose.staging.yml up -d
```

### Крок 2. Очищення транзитного L2-кешу маршрутів (за необхідності)
Якщо реліз змінював формат кешованих відповідей планувальника, виконати безпечне очищення префіксів маршрутів без скидання сесій користувачів:
```bash
redis-cli --scan --pattern "marshgo:journeys:*" | xargs -r redis-cli del
```

### Крок 3. Політика міграцій бази даних
- Усі міграції `001..055` спроєктовані за принципом **expand-and-contract** (зворотно сумісні з попередньою версією коду сервера).
- Деструктивний відкат таблиць з живими бронюваннями (`DROP TABLE`) категорично заборонений.

### Крок 4. Перевірка після відкату
```bash
curl -fsS http://localhost:3000/healthz
curl -fsS http://localhost:3000/readyz
./scripts/verify-staging.sh
```
