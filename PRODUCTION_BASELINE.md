# MARSHGO (dima1203oleg/MG2) — Production Baseline & Project Audit

**Дата аудиту:** 2026-10-24  
**Проєкт у Google AI Studio:** `marshgo-production` (`v2.4.0`)  
**Цільовий GitHub-репозиторій:** `dima1203oleg/MG2` (гілка `main`)  
**Підтверджена ідентичність продукту:** **MARSHGO** — український мультимодальний транспортний маркетплейс, навігатор і B2B-платформа перевізників (розділ 10 ТЗ застосовується повністю на підставі прямих доказів у коді).

---

## 1. Докази ідентичності продукту MARSHGO у `MG2`

- `package.json`: `"name": "marshgo-production"`, `"version": "2.4.0"`.
- `metadata.json` та `index.html`: бренд **MARSHGO**, локаль `uk-UA`, колірна тема `#0284c7`, PWA-маніфест `/manifest.webmanifest`.
- `src/views/ProductionMarketplace.tsx`, `src/views/ProductionNavigation.tsx`, `src/map/MarshGoMap.tsx`, `src/domain/marshPass.ts`: реалізовані канонічні компоненти MARSHGO (5 пунктів нижньої навігації `Головна | Пошук | + | Поїздки | Профіль`, 12 видів транспорту у матриці 3×4, 3 режими оптимізації `BALANCED | FASTEST | CHEAPEST`, `MarshPass` із криптографічним підписом `HMAC-SHA256`, жива зустріч `Rendezvous`, `Reverse Marketplace` заявок пасажирів, `Admin Console` та `B2B Partner Portal`).
- `server.ts`: уніфікований Express + WebSocket (`/api/v1/realtime`) сервер із геокодером 24 обласних центрів України, `SmartCache` із гео-сіткою Radius, 0% комісією для приватних попуток (`community-zero-fee-v1`) та 8% для комерційних B2B-партнерів.

---

## 2. Технологічний стек

| Рівень | Технологія | Фактична конфігурація |
|---|---|---|
| **Frontend UI** | React 19.0.1 + TypeScript + Tailwind CSS 4.3.3 | SPA + PWA (`src/App.tsx`, `src/views/*`, `src/components/*`, `src/design-system/*`) |
| **Картографія та ГІС** | MapLibre GL JS 6.15.0 + PMTiles 4.5.0 | Векторні тайли OpenFreeMap (`liberty`), режими `Схема / Супутник / 3D`, 6 канонічних екранів маршрутів |
| **Навігаційне ядро** | `shared/navigation/*` + `src/navigation/*` | Стейт-машина `DISCOVER → PREVIEW → ACTIVE`, map-matching, off-route guard, голосові та візуальні маневри |
| **Мобільна оболонка** | Capacitor 8.5.3 + PWA Service Worker | `public/sw.js`, `public/manifest.webmanifest`, iOS safe-area (`env(safe-area-inset-*)`), `100dvh` |
| **Backend API** | Node.js 22 + Express 4.21.2 + `ws` 8.22.0 | Єдиний сервер `server.ts` на порту `3000` (`/api/v1/*`, `/healthz`, `/readyz`, WebSocket `/api/v1/realtime`) |
| **Кешування** | `SmartCache` (Redis-сумісний L1/L2 адаптер) | TTL, захист від cache stampede (`inflight` single-flight), гео-ключі `buildRadiusCacheKey`, `invalidatePrefix` |
| **Збереження даних** | Атомарне дискове сховище `data/marshgo-state.json` + контракт PostgreSQL/PostGIS | Автоматичне збереження (`savePersistentState`) після кожної мутації та відновлення (`loadPersistentState`) при старті |
| **Тестування** | Node.js Test Runner (`node --import tsx --test`) | `tests/marshgo.production.test.ts` — 11 тестів (Unit + API Integration + E2E) |

---

## 3. Матриця екранів та інтерфейсів (Розділ 5 ТЗ)

| Екран / Модуль | Файл реалізації | Ключові дії користувача | API-залежності | Статус |
|---|---|---|---|---|
| **1. Головний екран** | `src/views/HomeView.tsx`, `src/views/HomeHero.tsx`, `src/views/ProductionMarketplace.tsx` | Перемикання каскаду квитків `MarshPass` або hero-заставки попуток, 4 великі кнопки (`Навігація`, `Карта транспорту`, `Опублікувати поїздку`, `Знайти маршрут`), верхній бар із містом, чатом та сповіщеннями | `GET /api/v1/bookings`, `GET /api/v1/journeys/me`, `GET /api/v1/notifications`, `GET /api/v1/conversation-unread-counts` | `VERIFIED` |
| **2. Пошук маршрутів та 12 видів транспорту** | `src/views/SearchView.tsx`, `src/components/TransportTypesPanel.tsx`, `src/views/JourneyResultsPanel.tsx` | Автодоповнення адрес (24 обласні центри), вибір точки на карті, обмін `Звідки ↔ Куди`, мультивибір 12 видів транспорту (3×4) + `Усі`, перемикання `Оптимальний / Найшвидший / Найдешевший` | `GET /api/v1/places/suggest`, `GET /api/v1/places/reverse`, `POST /api/v1/journeys/search` | `VERIFIED` |
| **3. Карта маршруту та живий фокус (Екрани 1–6)** | `src/views/JourneyRouteMapScreen.tsx`, `src/map/MarshGoMap.tsx`, `src/design-system/journey/CanonicalRouteLip.tsx`, `src/design-system/journey/JourneySegmentStrip.tsx` | Перегляд повного мультимодального ланцюжка, клік на сегмент для підсвічування, горизонтальний скрол при `>4` сегментах зі стрілкою, табло зупинки (`через 3 хв`), жива зустріч з водієм (`Rendezvous`) | `GET /api/v1/journeys/:id`, `GET /api/v1/journeys/:id/live`, `GET /api/v1/transit/stops/:id/arrivals`, `GET /api/v1/rendezvous/:id/approaches` | `VERIFIED` |
| **4. Навігація (`DISCOVER → PREVIEW → ACTIVE`)** | `src/views/ProductionNavigation.tsx`, `src/views/NavigationView.tsx`, `src/navigation/NavigationCore.tss` | Огляд шарів транспорту, розрахунок автомобільного маршруту з маневрами, запуск ведення, перерахунок при сходженні з маршруту, пошук попутників уздовж маршруту водія | `POST /api/v1/routing/calculate`, `POST /api/v1/navigation/sessions`, `GET /api/v1/navigation/sessions/:id/matches` | `VERIFIED` |
| **5. Створення поїздки / заявки (`+`)** | `src/components/ActionDrawer.tsx`, `src/views/DriverOfferNewView.tsx`, `src/views/DemandNewView.tsx` | Публікація поїздки водієм (вибір авто, місць, ціни, геометрії) або публікація заявки пасажира (`Reverse Marketplace`) з бюджетом і вимогами | `POST /api/v1/offers`, `POST /api/v1/demands`, `GET /api/v1/vehicles` | `VERIFIED` |
| **6. Поїздки, квитки MarshPass та Чат** | `src/views/MyTripsView.tsx`, `src/components/TicketQr.tsx`, `src/views/MessagesView.tsx`, `src/components/NegotiationModal.tsx` | Перегляд активних бронювань, відкриття QR-квитка `MarshPass`, скасування з підбором альтернатив (`Rescue`), торг за ціною у `Reverse Marketplace`, чат водій–пасажир | `POST /api/v1/bookings`, `GET /api/v1/bookings/:id/ticket`, `POST /api/v1/bookings/verify-ticket`, `POST /api/v1/bookings/:id/cancel`, `GET /api/v1/bookings/:id/rescue` | `VERIFIED` |
| **7. Профіль, Автопарк, Адмін-панель та Кабінет перевізника** | `src/views/ProfileView.tsx`, `src/views/MobilityAdminPanel.tsx`, `src/views/PartnerPortalPanel.tsx` | Керування ролями, верифікація авто, експорт персональних даних (GDPR), подання заявки B2B-перевізника, керування автопарком і тарифами (8% комісії), модерація та реєстр GTFS/GBFS фідів | `GET /api/v1/users/me`, `GET /api/v1/partner/me`, `POST /api/v1/partner/applications`, `GET /api/v1/admin/dashboard`, `POST /api/v1/admin/mobility/providers` | `VERIFIED` |
