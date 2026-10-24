# MARSHGO — REPOSITORY INVENTORY (5+1 CANONICAL ARCHITECTURE)

**Дата аудиту:** 2026-10-24  
**Архітектурний контур:** Канонічні 5+1 репозиторіїв (`dima1203oleg/MarshGO*`). Репозиторій `MarshGO2` та будь-які сторонні форки повністю виключені.

---

## 1. Зведена таблиця канонічних репозиторіїв (5+1)

| № | Репозиторій | Роль у системі | Канонічна гілка / PR | Exact Commit SHA | Доступність у середовищі | Статус консолідації |
|---|---|---|---|---|---|---|
| 1 | `dima1203oleg/MarshGO-Server` | Єдине джерело серверної бізнес-логіки (REST API `/api/v1/*`, Auth, Journey Engine, RAPTOR, Booking Engine, GPS/WS, PostGIS 55 міграцій, SmartCache, Partner/Admin API) | `codex/gtfs-raptor-multilabel-20261023` (PR #33) | `e7e695ee337f64af97679c283c3988dfe883c200` | ✅ Клоновано у `/MARSHGO-WORKSPACE/MarshGO-Server` | `IMPLEMENTED` / `TESTED` |
| 2 | `dima1203oleg/MarshGO-Site` | Єдине джерело клієнтського UI (React 19 / TypeScript, Web/PWA, Головна, Пошук 4×3, 6 канонічних екранів × 2 теми, MapLibre, Навігація, MarshPass, Чат, Профіль) | `codex/guidance-progress-pr19-20261023` (PR #20) | `a000b3cc07a956ae7ded4563ab5e97b11fe3db71` | ✅ Клоновано у `/MARSHGO-WORKSPACE/MarshGO-Site` та синхронізовано з кореневим `src/` | `IMPLEMENTED` / `TESTED` |
| 3 | `dima1203oleg/MarshGO-iOS` | Нативна обгортка Capacitor 8 / Xcode для iPhone (геолокація, системні дозволи `Info.plist`, Safe Area, синхронізація з фіксованим білдом `MarshGO-Site`) | `codex/ios-pin-server-pr31-20261023` (PR #12) | `6e825cd59df9529c9b88aab063989d7328497fef` | ✅ Клоновано у `/MARSHGO-WORKSPACE/MarshGO-iOS` | `PARTIAL` (`BLOCKED_EXTERNAL` для Xcode signing / TestFlight без macOS) |
| 4 | `dima1203oleg/MarshGO-Admin` | Адміністративна консоль (RBAC, перевізники, мобільні провайдери, KYB/документи водіїв, скарги, аудит, моніторинг) | Специфікація та роути у `MarshGO-Server` (`e7e695ee337f64af97679c283c3988dfe883c200`) + UI у `src/views/MobilityAdminPanel.tsx` | `e7e695ee337f64af97679c283c3988dfe883c200` (інтегрований контур) | ⚠️ Зовнішній GitHub URL повертає HTTP 404 без приватного PAT (`BLOCKED_EXTERNAL` на рівні git remote) | `IMPLEMENTED` у монорепо-контурі `/api/v1/admin/*` + `MobilityAdminPanel.tsx` |
| 5 | `dima1203oleg/MarshGO-Partner` | B2B-кабінет перевізників і диспетчерів (організації, автопарк, рейси, замовлення, B2B-тарифи 8% vs 0% Community) | Роутер `MarshGO-Server/server/partner/router.ts` (`e7e695ee337f64af97679c283c3988dfe883c200`) + UI у `src/views/PartnerPortalPanel.tsx` | `e7e695ee337f64af97679c283c3988dfe883c200` (інтегрований контур) | ⚠️ Зовнішній GitHub URL повертає HTTP 404 без приватного PAT (`BLOCKED_EXTERNAL` на рівні git remote) | `IMPLEMENTED` у монорепо-контурі `/api/v1/partner/*` + `PartnerPortalPanel.tsx` |
| 6 | `dima1203oleg/MarshGO` | Центральний інтеграційний та релізний оркестратор (Docker Compose, CI/CD, Exact SHA Manifest, smoke/staging verification, rollback) | `codex/production-finalization-20261014` (PR #5) | `39a182094c82f58d84b3dbabd4a18808569bd206` | ✅ Клоновано у `/MARSHGO-WORKSPACE/MarshGO` | `IMPLEMENTED` / `TESTED` |

---

## 2. Аудит структури та виключених репозиторіїв

1. **Виключені репозиторії:** `dima1203oleg/MarshGO2` та будь-які неканонічні гілки не використовуються у білді та виключені з `RELEASE_MANIFEST.json`.
2. **Відсутність дублювання UI в iOS:** `MarshGO-iOS` використовує скомпільований веб-артефакт `MarshGO-Site` через Capacitor (`capacitor.config.ts`), не створюючи другої копії клієнтського коду.
3. **Узгодженість API-контрактів:** Клієнтський шар `src/services/productionApi.ts` та серверний `server.ts` використовують єдині схеми для `/api/v1/journeys/search`, `/api/v1/offers`, `/api/v1/bookings`, `/api/v1/rendezvous`, `/api/v1/navigation`, `/api/v1/admin/*` та `/api/v1/partner/*`.
