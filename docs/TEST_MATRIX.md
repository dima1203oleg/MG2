# Матриця тестування та фактичні докази виконання (Розділ 14 ТЗ)

## 1. Матриця покриття тестами (`TEST_MATRIX`)

| ID тесту | Рівень | Назва тесту у `tests/marshgo.production.test.ts` | Що перевіряється | Результат |
|---|---|---|---|---|
| **T-01** | Unit | `SmartCache enforces TTL, tracks hit ratio, deduplicates concurrent stampedes, and invalidates prefixes` | TTL кешу, single-flight дедуплікація 5 конкурентних запитів, підрахунок `hitRatio`, інвалідація за префіксом `journey:` | `PASS` |
| **T-02** | Unit | `SmartCache.buildRadiusCacheKey quantizes nearby coordinates and isolates public vs user scopes` | Географічне квантування координат у радіусі 500 м та ізоляція публічних і персональних ключів кешу | `PASS` |
| **T-03** | Unit | `validateExternalFeedUrl blocks SSRF vectors (HTTP, localhost, RFC1918, cloud metadata, credentials)` | Блокування `http://`, `localhost`, `127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`, `172.20.x`, `[::1]`, `user:pass@host` | `PASS` |
| **T-04** | Unit | `MarshPass HMAC-SHA256 signing & verification accepts valid tokens and rejects tampered or expired tokens` | Підпис `MGPASS`, timing-safe верифікація, відхилення підробленого підпису та простроченого токена | `PASS` |
| **T-05** | Unit | `buildCanonicalJourneys produces BALANCED, FASTEST, CHEAPEST, and 5-segment chains without Metro in Lviv` | Генерація 3 стратегій, наявність 5-сегментного маршруту, наявність ціни/тривалості кожного сегмента, відсутність метро у Львові | `PASS` |
| **T-06** | Integration | `Health, Readiness, Security Headers, and Ukraine City Transport Catalog` | `GET /healthz`, `GET /readyz` (24 міста), заголовки безпеки `nosniff`/`SAMEORIGIN`, каталог міст (`/transport/cities`) | `PASS` |
| **T-07** | Integration | `Multimodal Search, Live Transit Vehicle Focus (Screen 5), and Stop Arrivals` | `POST /api/v1/journeys/search`, живий рух транспорту `GET /api/v1/journeys/:id/live`, табло прибуття `GET /api/v1/transit/stops/:id/arrivals` | `PASS` |
| **T-08** | E2E | `Two-User Rideshare E2E Flow: Driver Offer -> Self-Book Guard -> Passenger Booking (0% Fee) -> MarshPass -> Rendezvous -> BOLA Guard -> Cancel & Rescue` | Повний сценарій двох користувачів (водій Тарас + пасажир Олександр + третій користувач Оксана): створення поїздки, заборона самобронювання (`409`), бронювання з 0% комісії, списання місць, захист від овербукінгу (`409`), перевірка QR-квитка, жива зустріч `Rendezvous`, захист від чужого скасування (`403 BOLA`), скасування пасажиром із поверненням місць та підбором альтернатив (`Rescue`) | `PASS` |
| **T-09** | E2E | `Reverse Marketplace E2E Flow: Demand -> Driver Proposal -> Counter-Offer -> Accept -> Confirmed 0% Booking` | Заявка пасажира → пропозиція водія → зустрічна пропозиція пасажира → акцепт і автоматичне створення підтвердженого бронювання (0% комісії) | `PASS` |
| **T-10** | Security / API | `RBAC & Admin SSRF Protection: Non-admin blocked (403); Admin SSRF blocked (400); Valid HTTPS feed accepted (201)` | Серверний контроль ролей адміністратора (`403`), блокування SSRF-фіду (`400`) та успішна реєстрація легітимного HTTPS GTFS-фіду (`201`) | `PASS` |
| **T-11** | Persistence | `Durable Disk Persistence writes and reloads state file across restarts` | Атомарний запис стану у `data/marshgo-state.json` та відновлення при старті сервера | `PASS` |
