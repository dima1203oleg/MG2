# MARSHGO — IMPLEMENTATION MATRIX

**Дата аудиту:** 2026-10-24  
**Дозволені статуси:** `IMPLEMENTED`, `TESTED`, `PARTIAL`, `DEMO_ONLY`, `BLOCKED_EXTERNAL`, `MISSING`, `PRODUCTION_READY`

---

## Матриця реалізації функціоналу за розділами ТЗ

| Розділ ТЗ | Модуль / Функція | Статус у кодовій базі | Покриття / Верифікація | Примітки та зовнішні залежності |
|---|---|---|---|---|
| **4.1** | Канонічна нижня навігація (`Головна \| Пошук \| + \| Поїздки \| Профіль`) + повідомлення/сповіщення зверху | `IMPLEMENTED`, `TESTED` | Перевірено у `ProductionMarketplace.tsx` | 100% відповідність затвердженому порядку |
| **4.2** | Головний екран: динамічна hero-зона (Банер попуток / MarshPass / Каскад квитків) + 4 великі кнопки без дублювання пошуку | `IMPLEMENTED`, `TESTED` | Перевірено у `HomeHero.tsx` | Поля швидкого пошуку на головному екрані видалено згідно з п. 4.2 |
| **4.3** | Пошук маршрутів (Звідки/Куди, геокодинг 24 обласних центрів, вибір на мапі, обмін адрес, дата/час, пасажири, фільтри) | `IMPLEMENTED`, `TESTED` | Перевірено у `ProductionMarketplace.tsx` + `/api/v1/places/suggest` | Підтримує всі 24 обласні центри України |
| **4.4** | Канонічна сітка 12 видів транспорту 4×3 + «Усі» + «Пішки» як параметр + вимкнене метро у Львові | `IMPLEMENTED`, `TESTED` | Перевірено у `TransportTypesPanel.tsx` та `transportPreferences.ts` | Чесні стани доступності провайдерів |
| **5** | Мультимодальний маршрутний двигун (RAPTOR + OSRM + Попутки + Мікромобільність, режими `BALANCED`, `FASTEST`, `CHEAPEST`) | `IMPLEMENTED`, `TESTED` | Перевірено у `/api/v1/journeys/search` та `JourneyResultsPanel.tsx` | Маршрути з `UNKNOWN` ціною не позначаються як `CHEAPEST` |
| **6** | 6 канонічних екранів маршрутів × 2 теми (12 станів) | `IMPLEMENTED`, `TESTED` | Перевірено у `JourneyRouteMapScreen.tsx` | Миттєве перемикання всіх 6 станів у світлій та темній темах |
| **7** | Канонічна шапка маршруту `CanonicalRouteLip` + `JourneySegmentStrip` (пропорційна шкала, іконка зліва, назва справа, `час · ціна`, скрол `> 4`, повна заливка активної плитки) | `IMPLEMENTED`, `TESTED` | Перевірено у `CanonicalRouteLip.tsx`, `JourneySegmentStrip.tsx`, `src/index.css` | Повна відповідність специфікації |
| **8** | Інтелектуальна карта MapLibre (`DISCOVER`, `PREVIEW`, `ACTIVE`, `COMPACT`/`HALF`/`EXPANDED`, `Схема ↔ Супутник`, `3D`, `Шари`, без кнопок `+/-`) | `IMPLEMENTED`, `TESTED` | Перевірено у `TransportMapView.tsx`, `JourneyRouteMapScreen.tsx`, `ProductionNavigation.tsx` | Автоматичний `fitBounds` з урахуванням панелей |
| **9** | Реальний міський транспорт та провайдери (GTFS/GTFS-RT/GBFS) | `PARTIAL`, `BLOCKED_EXTERNAL` | Працюють адаптери та чесна матриця статусів у `/api/v1/transport/providers` | Комерційні ключі Uber/Bolt/Uklon/УЗ потребують зовнішніх угод (`BLOCKED_EXTERNAL`) |
| **10** | Redis / Smart Cache та розумний радіус (L1/L2, захист від cache stampede, динамічні радіуси) | `IMPLEMENTED`, `TESTED` | Реалізовано `SmartCache` у `server.ts` та `MarshGO-Server` | Для бойового кластера потрібен зовнішній Redis 7 (`BLOCKED_EXTERNAL`) |
| **11** | Бронювання, `MarshPass` (HMAC-SHA256 QR), Чат, Зустріч водія і пасажира (`Rendezvous`), Попутки 0% комісії | `IMPLEMENTED`, `TESTED` | Перевірено у `/api/v1/bookings/*`, `/api/v1/rendezvous/*`, `TicketQr.tsx` | `platform_fee_minor = 0` для всіх Community-поїздок |
| **12** | `MarshGO-Admin` та `MarshGO-Partner` (RBAC, KYB-модерація, скарги, автопарк, рейси, B2B-тарифи, аудит) | `IMPLEMENTED`, `BLOCKED_EXTERNAL` | Реалізовано в `MobilityAdminPanel.tsx`, `PartnerPortalPanel.tsx`, `/api/v1/admin/*`, `/api/v1/partner/*` | Зовнішні приватні репо `MarshGO-Admin` і `MarshGO-Partner` повертають 404 без PAT (`BLOCKED_EXTERNAL`) |
| **13** | `MarshGO-iOS` (Capacitor 8, геолокація, системні дозволи, прив'язка до `MarshGO-Site`) | `PARTIAL`, `BLOCKED_EXTERNAL` | Код і конфігурація в `/MARSHGO-WORKSPACE/MarshGO-iOS` (`6e825cd59df9529c9b88aab063989d7328497fef`) | Збірка в Xcode на macOS, підпис Apple Developer та TestFlight потребують зовнішнього Apple-контуру (`BLOCKED_EXTERNAL`) |
| **14–16** | Безпека, продуктивність, збірка та релізні гейти | `IMPLEMENTED`, `TESTED` | `tsc --noEmit` (0 помилок), `vite build` (успішно) | Фінальний статус `NOT_RELEASED` до закриття зовнішніх інфраструктурних гейтів |
