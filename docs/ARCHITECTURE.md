# Архітектура системи MARSHGO (`dima1203oleg/MG2`)

## 1. Багаторівнева архітектура застосунку (Розділ 6 ТЗ)

Кодова база чітко розділена на ізольовані шари відповідальності без циклічних залежностей:

1. **Presentation Layer (`src/views/*`, `src/components/*`, `src/design-system/*`):**
   - Канонічні екрани клієнтського маркетплейсу (`ProductionMarketplace.tsx`), навігатора (`ProductionNavigation.tsx`), карти маршруту (`JourneyRouteMapScreen.tsx`), B2B-порталу перевізників (`PartnerPortalPanel.tsx`) та панелі адміністратора (`MobilityAdminPanel.tsx`).
   - Єдина дизайн-система: `CanonicalRouteLip.tsx` (верхній маршрутний банер карти), `JourneySegmentStrip.tsx` (стрічка сегментів із горизонтальним скролом при `>4` етапах), `TransportIcon.tsx` (12 канонічних видів транспорту).
2. **Map & Spatial Rendering Layer (`src/map/*`):**
   - `MarshGoMap.tsx` та `MapLibreAdapter.ts`: єдиний адаптер карти MapLibre GL JS із перемиканням стилів (`Схема / Супутник / 3D`), кластеризацією та фокусом сегментів (`focusMode.ts`, `liveTransitFeatures.ts`, `liveRideshareFeatures.ts`).
3. **Navigation & Guidance Layer (`src/navigation/*`, `shared/navigation/*`):**
   - `NavigationCore.ts`, `BasicRouteMapMatchingProvider.ts`, `OffRouteGuard.ts`, `guidance.ts`, `meeting.ts`: машина станів `DISCOVER → PREVIEW → ACTIVE`, прив’язка GPS-точок до полілінії маршруту та контроль сходження з маршруту.
4. **Domain Layer (`src/domain/*`):**
   - Чиста бізнес-логіка без UI-залежностей: `marshPass.ts` (форматування та перевірка квитків), `transportCatalog.ts` (12 категорій транспорту та міські обмеження, зокрема відсутність метро у Львові), `rendezvousLocationTracking.ts` (правила взаємної згоди GPS), `stopArrivals.ts`, `kyivTime.ts`.
5. **API & Client Services Layer (`src/services/*`):**
   - `productionApi.ts`: типізований HTTP/WebSocket клієнт із централізованою обробкою помилок, таймаутами та автоматичним відновленням сесії.
6. **Backend & Persistence Layer (`server.ts`, `data/marshgo-state.json`):**
   - REST API `/api/v1/*` + WebSocket `/api/v1/realtime`.
   - `SmartCache`: двошарове кешування з гео-сіткою `buildRadiusCacheKey`, захистом від одночасних повторних обчислень (`inflight` deduplication) та миттєвою інвалідацією (`invalidatePrefix('journey:')`) при зміні оголошень чи бронювань.
   - Атомарне дискове збереження стану (`savePersistentState` / `loadPersistentState`) через запис у тимчасовий файл і `fs.renameSync`.

---

## 2. Потік даних ключових бізнес-операцій

### 2.1. Пошук мультимодального маршруту та Кешування Radius
1. Користувач обирає точки `Звідки` і `Куди`, дату/час, дозволені види транспорту та стратегію (`BALANCED`, `FASTEST`, `CHEAPEST`).
2. Запит `POST /api/v1/journeys/search` формує канонічний ключ кешу, перевіряє `SmartCache` (single-flight) та обчислює оптимальні ланцюжки (`Пішки → Міський транспорт / Поїзд → Попутка / Мікромобільність → Пішки`).
3. Кожен сегмент містить точну геометрію, час відправлення/прибуття, тривалість (`durationSeconds`), вартість (`priceMinor` у копійках) та джерело тарифу (`fareSource`).

### 2.2. Бронювання попутки (0% комісії) та Жива зустріч (`Rendezvous`)
1. Водій створює поїздку (`POST /api/v1/offers`) → інвалідується кеш маршрутів, стан атомарно зберігається на диск.
2. Пасажир бронює місця (`POST /api/v1/bookings`) → сервер перевіряє:
   - чи пасажир не є водієм цієї поїздки (`409 cannot_book_own_offer`);
   - чи достатньо вільних місць (`409 insufficient_seats`);
   - списує місця, встановлює `platform_fee_minor: 0` (`community-zero-fee-v1`), створює сесію зустрічі `Rendezvous` та чат.
3. Генерується підписаний `HMAC-SHA256` токен `MarshPass` (`GET /api/v1/bookings/:id/ticket`), який верифікується через `POST /api/v1/bookings/verify-ticket`.
