# MARSHGO — PRODUCTION GAP ANALYSIS

**Дата аналізу:** 2026-10-23  
**Поточний вердикт:** `PRODUCTION_READY = false` (`RELEASE_STATUS = NOT_RELEASED`)

Відповідно до Розділу 21 («Чесність релізу») Master Production ТЗ, система не оголошується `RELEASED` до закриття зовнішніх інфраструктурних і платформових вимог за межами пісочниці Google AI Studio.

---

## 1. Закриті та верифіковані компоненти в середовищі AI Studio

- **Канонічний код `MarshGO-Site` та `MarshGO-Server`**: об’єднано на порту 3000 без створення фейкового чи окремого застосунку.
- **Канонічна шапка маршруту (`CanonicalRouteLip` + `JourneySegmentStrip`)**:
  - Пропорційна кольорова шкала тривалості сегментів.
  - Горизонтальний макет плиток (іконка зліва, назва справа, знизу жирним `час · ціна`).
  - Автоматичний горизонтальний скрол зі стрілкою при `> 4` сегментах.
  - Повне підсвічування прямокутного інформаційного блоку кольором вибраного транспорту (`--segment-active-color`).
- **6 канонічних екранів навігації × 2 теми (12 станів)**:
  - Екран 1: Деталі маршруту (`expanded`)
  - Екран 2: Усі варіанти маршрутів (`JourneyResultsPanel`)
  - Екран 3: Напіврозгорнутий маршрут (`half`)
  - Екран 4: Компактна карта маршруту (`collapsed`)
  - Екран 5: Живий автобус і зупинки (`LIVE` транспортний коридор + ETA зупинок)
  - Екран 6: Попутка і посадка (`Rendezvous` GPS водія й пасажира + 2 маршрути підходу)
- **Чесна ціна (`UNKNOWN` → `'—'`) та 0% комісії на попутки (`platform_fee_minor = 0`)**.
- **Кабінет B2B-партнера (`PartnerPortalPanel`) та Адмін-консоль (`MobilityAdminPanel`)**.

---

## 2. Відкриті зовнішні блокерні вимоги (External Blockers)

| Категорія | Стан у AI Studio | Що потрібно для Production `RELEASED` |
|---|---|---|
| **1. GitHub-доступ до `MarshGO-Admin` та `MarshGO-Partner`** | Репозиторії `dima1203oleg/MarshGO-Admin` та `dima1203oleg/MarshGO-Partner` повертають HTTP 404 без приватного токена; їхні екрани та API реалізовані за специфікацією з `MarshGO-Server` | Надати GitHub PAT або відкрити доступ до обох репозиторіїв для прямої синхронізації git-дерев |
| **2. Production PostgreSQL 16 + PostGIS 3.4 & Redis 7** | У живому прев'ю AI Studio працює сумісний серверний адаптер + `SmartCache`; 55 SQL-міграцій збережено у `/MARSHGO-WORKSPACE/MarshGO-Server/server/db/migrations` | Розгорнути виділений кластер PostgreSQL/PostGIS та Redis на staging/production і виконати `npm run db:migrate` |
| **3. Масштабування OSRM та Nominatim/Pelias для всієї України** | Працює геокодер 24 обласних центрів України та OSRM-маршрутизація з fallback-геометрією шосейних і залізничних коридорів | Підняти виділені інстанси OSRM (`car`, `foot`, `bike`) і Pelias/Nominatim на повному дампі `ukraine-latest.osm.pbf` |
| **4. Комерційні ключі партнерів (Uber, Bolt, Uklon, Укрзалізниця)** | Оператори відображаються у `MobilityAdminPanel` із чесним статусом `AWAITING_CREDENTIALS` / `ACTIVE_LIVE` | Підключити бойові OAuth/API-ключі партнерів у Vault / Secret Manager |
| **5. Фізичне тестування iOS та App Store Connect** | Код `MarshGO-iOS` (Capacitor 8) синхронізовано на рівні конфігурації та веб-асетів | Виконати `npx cap sync ios`, підписати білд сертифікатом Apple Developer у Xcode на macOS, перевірити фонову геолокацію на фізичному iPhone та завантажити у TestFlight |
