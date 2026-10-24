# Аудит інформаційної безпеки (Security Review — Розділ 13 ТЗ)

**Дата аудиту:** 2026-10-24  
**Статус критичних і високоризикових вразливостей:** `0 відкритих P0/P1 вразливостей`

---

## 1. Перевірені вектори безпеки та реалізовані механізми захисту

| Вектор / Категорія | Статус | Реалізований механізм у коді | Автоматичний тест |
|---|---|---|---|
| **1. SSRF (Server-Side Request Forgery)** | `HARDENED` | Функція `validateExternalFeedUrl` у `server.ts` примусово перевіряє всі URL зовнішніх GTFS/GBFS фідів: дозволяє лише `https:`, блокує `localhost`, `127.0.0.0/8`, `0.0.0.0`, `::1`, приватні мережі `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, cloud metadata `169.254.169.254` та вбудовані облікові дані `user:pass@host`. | `validateExternalFeedUrl blocks SSRF vectors` + `RBAC & Admin SSRF Protection` |
| **2. RBAC (Role-Based Access Control)** | `HARDENED` | Серверний middleware `requireAdminRole` захищає всі маршрути `/api/v1/admin/*`. Користувачі без ролі `admin` або `moderator` отримують `403 Forbidden` (`forbidden_role`). | `Non-admin blocked (403)` у `tests/marshgo.production.test.ts` |
| **3. IDOR / BOLA (Broken Object Level Authorization)** | `HARDENED` | Скасування бронювання (`POST /api/v1/bookings/:id/cancel`) перевіряє належність бронювання поточному пасажиру або водію рейсу. Сторонній користувач отримує `403 Forbidden` (`forbidden_booking_access`). | `BOLA/IDOR protection: Unrelated user Oksana cannot cancel Oleksandr's booking` |
| **4. Захист цілісності бізнес-логіки (Self-Booking & Overbooking)** | `HARDENED` | Водій не може забронювати власну поїздку (`409 cannot_book_own_offer`). Бронювання більшої кількості місць, ніж залишилося, блокується (`409 insufficient_seats`). | `Two-User Rideshare E2E Flow` |
| **5. Криптографічний захист квитків (`MarshPass` QR)** | `HARDENED` | Квитки підписуються `HMAC-SHA256` (`signMarshPassToken`), а перевірка (`verifyMarshPassToken` та `POST /api/v1/bookings/verify-ticket`) використовує `crypto.timingSafeEqual` для захисту від timing-атак і перевіряє термін дії токена. | `MarshPass HMAC-SHA256 signing & verification` |
| **6. Rate Limiting та HTTP Security Headers** | `HARDENED` | Сервер відключає `x-powered-by`, встановлює `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` та обмежує частоту запитів до `/api/v1/*` із заголовками `X-RateLimit-Limit` / `X-RateLimit-Remaining`. | `Health, Readiness, Security Headers` |
| **7. Приватність геолокації (`Rendezvous`)** | `HARDENED` | Живі координати водія та пасажира під час зустрічі передаються лише за умови активної взаємної згоди (`currentParticipantConsent` + `otherParticipantConsent`) і мають короткий TTL (`expiresInSeconds: 90`). | Перевірено в `/api/v1/rendezvous/*` |
| **8. Захист секретів та `.env`** | `HARDENED` | Жоден секретний ключ не зберігається у клієнтському бандлі чи Git-індексі; `.gitignore` блокує `.env*`, а `.env.example` містить виключно безпечні шаблони. | Аудит `docs/CHANGES_1306_AUDIT.md` |
