# MARSHGO — NEXT ACTIONS (EXTERNAL STAGING & PRODUCTION ROADMAP)

Цей план визначає послідовність кроків для переведення системи зі стану `NOT_RELEASED` (пісочниця AI Studio) у `RELEASED` на бойовій інфраструктурі.

---

## Крок 1. Синхронізація Git-репозиторіїв

1. Експортувати або запушити оновлені файли з AI Studio до:
   - `MarshGO-Site` (оновлені `JourneySegmentStrip.tsx`, `src/index.css`, `HomeHero.tsx`, `JourneyRouteMapScreen.tsx`, `PartnerPortalPanel.tsx`, `MobilityAdminPanel.tsx`, `ProductionMarketplace.tsx`).
   - `MarshGO-Server` (роути B2B Partner `/api/v1/partner/*` та Admin Partner Moderation `/api/v1/admin/partners/*`).
2. Відкрити доступ або підключити SSH/PAT-ключі для репозиторіїв `MarshGO-Admin` та `MarshGO-Partner` і синхронізувати винесені адмін/партнерські модулі.

## Крок 2. Розгортання бази даних PostgreSQL/PostGIS та Redis

```bash
cd MARSHGO-WORKSPACE/MarshGO
docker compose -f docker-compose.staging.yml up -d postgres redis
cd ../MarshGO-Server
npm run db:migrate
```

- Перевірити застосування всіх 55 міграцій (`001_initial_schema.sql` … `055_partner_platform_foundation.sql`).
- Переконатися, що індекси `GIST` створені для таблиць `places`, `transit_stops`, `offers`, `demands`, `navigation_sessions`.

## Крок 3. Запуск OSRM, GTFS/GTFS-RT та GBFS воркерів

1. Імпортувати `ukraine-latest.osm.pbf` у контейнери OSRM (`osrm-routed` для профілів `driving`, `foot`, `cycling`).
2. Запустити воркер синхронізації GTFS Static та GTFS-RT (EasyWay / муніципальні АСДУ Львів, Київ, Одеса, Дніпро, Харків, Вінниця) кожні 15 секунд.
3. Перевірити `GET /readyz` та `/api/v1/admin/mobility/providers`.

## Крок 4. Збірка та публікація iOS (`MarshGO-iOS`)

```bash
npm run build
cd MARSHGO-WORKSPACE/MarshGO-iOS
npx cap sync ios
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  archive -archivePath build/MarshGO.xcarchive
```

- Перевірити роботу системних дозволів (`NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSCameraUsageDescription`) на реальному iPhone.
- Завантажити архів у **TestFlight** і пройти pre-release smoke-тест.

## Крок 5. Наскрізний E2E Gate та фіналізація `RELEASE_MANIFEST.json`

```bash
cd MARSHGO-WORKSPACE/MarshGO
./scripts/verify-staging.sh
```

Лише після 100% проходження зовнішнього staging-гейту оновити `RELEASE_MANIFEST.json`:
- `"production_ready": true`
- `"status": "RELEASED"`
