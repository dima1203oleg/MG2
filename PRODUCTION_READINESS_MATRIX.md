# MARSHGO — PRODUCTION READINESS MATRIX & RELEASE GATES (G1–G11)

**Дата оцінки:** 2026-10-24  
**Фінальний вердикт у пісочниці AI Studio:** `PRODUCTION_READY = false` | `RELEASE_STATUS = NOT_RELEASED`

Відповідно до Розділів 16 та 18 Master Production 2026 ТЗ, жоден реліз не оголошується `RELEASED`, доки всі гейти `G1–G11` (включно із зовнішньою інфраструктурою та ручним підписом власника) не матимуть статус `PASS`.

---

## Статус обов'язкових Release Gates (G1–G11)

| Gate | Назва гейту | Статус у кодовій базі AI Studio | Зовнішній блокер (поза AI Studio) | Підсумковий статус гейту |
|---|---|---|---|---|
| **G1** | **Repo Consolidation Gate** (Єдина архітектура 5+1, точні commit SHA) | ✅ `MarshGO`, `MarshGO-Server`, `MarshGO-Site`, `MarshGO-iOS` клоновано й узгоджено; `Admin` і `Partner` інтегровані за контрактом | Приватні GitHub-репозиторії `MarshGO-Admin` та `MarshGO-Partner` повертають HTTP 404 без PAT | `BLOCKED_EXTERNAL` (потрібен PAT для git-синхронізації 2 приватних репо) |
| **G2** | **Contract & Schema Gate** (Узгоджені API-контракти та 55 PostGIS міграцій) | ✅ Усі контракти `/api/v1/*`, 55 SQL-міграцій та `tsc --noEmit` проходять без помилок | — | `PASS` |
| **G3** | **Canonical UX Gate** (Нижня панель 5 пунктів, Головна без дублювання пошуку, Каскад MarshPass, Сітка 4×3, 6 екранів × 2 теми, `CanonicalRouteLip`) | ✅ Повністю реалізовано та перевірено у `HomeHero.tsx`, `TransportTypesPanel.tsx`, `CanonicalRouteLip.tsx`, `JourneyRouteMapScreen.tsx` | — | `PASS` |
| **G4** | **Multimodal Routing Gate** (`BALANCED`, `FASTEST`, `CHEAPEST`, чесна невідома ціна `UNKNOWN` → `'—'`) | ✅ Реалізовано RAPTOR + OSRM + Pareto-ранжування; маршрути без повної ціни не називаються найдешевшими | Виділений інстанс OSRM C++ на повному `ukraine-latest.osm.pbf` у зовнішньому кластері | `PASS` (код) / `BLOCKED_EXTERNAL` (зовнішній OSRM демон) |
| **G5** | **Map & Realtime Gate** (MapLibre без `+/-`, `Схема ↔ Супутник`, `3D`, `Шари`, WebSocket `/api/v1/realtime`, `Rendezvous`) | ✅ Повністю реалізовано та працює в живому прев'ю | — | `PASS` |
| **G6** | **Provider & Transit Honesty Gate** (Реальне покриття 24 міст, вимкнене метро у Львові, чесні статуси провайдерів) | ✅ Повністю реалізовано та задокументовано у `PROVIDER_COVERAGE_MATRIX.md` | Комерційні API-ключі зовнішніх агрегаторів таксі/каршерингу | `PASS` (чесна індикація статусів) |
| **G7** | **Booking, MarshPass & 0% Community Gate** (Підписаний QR `HMAC-SHA256`, `0%` комісії попуток, життєвий цикл поїздки) | ✅ Повністю реалізовано та протестовано | — | `PASS` |
| **G8** | **Admin & Partner Gate** (RBAC, KYB-модерація документів водіїв, скарги, кабінет перевізника B2B) | ✅ Повністю реалізовано у `MobilityAdminPanel.tsx` та `PartnerPortalPanel.tsx` | — | `PASS` |
| **G9** | **iOS Readiness Gate** (Capacitor 8, системні дозволи `Info.plist`, синхронізація з `MarshGO-Site`) | ✅ Конфігурація та код `MarshGO-iOS` (`6e825cd59df9529c9b88aab063989d7328497fef`) готові | Компіляція в Xcode на macOS, підпис сертифікатом Apple Developer та фізичний iPhone / TestFlight | `BLOCKED_EXTERNAL` |
| **G10** | **Security, Performance & Staging Smoke Gate** (`SmartCache`, відсутність витоків секретів, `build` + `lint`) | ✅ `npm run lint` та `npm run build` проходять чисто | Розгортання зовнішнього кластера PostgreSQL 16 + PostGIS 3.4 та Redis 7 | `PASS` (код) / `BLOCKED_EXTERNAL` (зовнішній staging кластер) |
| **G11** | **Owner Final Sign-Off Gate** (Ручне підтвердження власником продукту після проходження зовнішнього staging) | ⏳ Очікує перевірки власником після розгортання зовнішньої інфраструктури | Підтвердження власника репозиторіїв `dima1203oleg` | `PENDING_OWNER_APPROVAL` |
