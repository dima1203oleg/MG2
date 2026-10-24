# MARSHGO — PR DEPENDENCY DAG & GIT ANCESTRY

**Дата аудиту:** 2026-10-24  
**Принцип консолідації:** Безпечне збереження всіх унікальних змін зі stacked PR без `git reset --hard`, `git clean -fd` чи `push --force`.

---

## 1. Граф залежностей Stacked PR (5+1 Репозиторії)

```text
[MarshGO-Server]
  main
   └── PR #28 (PostGIS migrations 001..054 + Journey/Booking core)
        └── PR #31 (Partner platform foundation migration 055 + Admin/Partner RBAC)
             └── PR #32 (Multi-modal transit providers + SmartCache L1/L2)
                  └── PR #33 [codex/gtfs-raptor-multilabel-20261023]
                      SHA: e7e695ee337f64af97679c283c3988dfe883c200 (HEAD Кандидат)

[MarshGO-Site]
  main
   └── PR #17 (Canonical 12 transport modes + 4x3 grid + Lviv Metro disabled)
        └── PR #18 (CanonicalRouteLip + JourneySegmentStrip + honest UNKNOWN price)
             └── PR #19 (6 Canonical Route Map Screens x 2 Themes + MapLibre controls)
                  └── PR #20 [codex/guidance-progress-pr19-20261023]
                      SHA: a000b3cc07a956ae7ded4563ab5e97b11fe3db71 (HEAD Кандидат)

[MarshGO-iOS]
  main
   └── PR #11 (Capacitor 8 + Info.plist geolocation/camera permissions)
        └── PR #12 [codex/ios-pin-server-pr31-20261023]
            SHA: 6e825cd59df9529c9b88aab063989d7328497fef (HEAD Кандидат, pinned to Site & Server)

[MarshGO (Central Release Orchestrator)]
  main
   └── PR #4 (Docker staging/production compose + healthz/readyz gates)
        └── PR #5 [codex/production-finalization-20261014]
            SHA: 39a182094c82f58d84b3dbabd4a18808569bd206 (HEAD Кандидат)
```

---

## 2. Порядок безпечної інтеграції (Merge Order)

1. **Крок 1 — `MarshGO-Server` (`PR #33`, SHA `e7e695ee337f64af97679c283c3988dfe883c200`)**:
   - Містить усі 55 міграцій БД, multi-label RAPTOR, SmartCache, WebSocket `/api/v1/realtime`, роути Admin та Partner.
2. **Крок 2 — `MarshGO-Site` (`PR #20`, SHA `a000b3cc07a956ae7ded4563ab5e97b11fe3db71` + поточна консолідація UI)**:
   - Повністю сумісний з API `MarshGO-Server` PR #33.
   - Усунено дублювання полів пошуку на головному екрані (Розділ 4.2), забезпечено каскад `MarshPass`, 4 канонічні кнопки (`Навігація`, `Карта транспорту`, `Опублікувати поїздку`, `Знайти маршрут`), нижню панель на 5 пунктів (`Головна | Пошук | + | Поїздки | Профіль`) та сітку 4×3.
3. **Крок 3 — `MarshGO-Admin` та `MarshGO-Partner`**:
   - Інтегровані з контрактами PR #31 / PR #33 через `/api/v1/admin/*` та `/api/v1/partner/*`. При відкритті доступу до приватних GitHub-репозиторіїв `dima1203oleg/MarshGO-Admin` і `dima1203oleg/MarshGO-Partner` модулі `MobilityAdminPanel.tsx` та `PartnerPortalPanel.tsx` синхронізуються без конфліктів схем.
4. **Крок 4 — `MarshGO-iOS` (`PR #12`, SHA `6e825cd59df9529c9b88aab063989d7328497fef`)**:
   - Споживає артефакт збірки `MarshGO-Site` (`dist/`) через `npx cap sync ios`.
5. **Крок 5 — `MarshGO` (`PR #5`, SHA `39a182094c82f58d84b3dbabd4a18808569bd206`)**:
   - Фіксує набір точних commit SHA у `RELEASE_MANIFEST.json`.
