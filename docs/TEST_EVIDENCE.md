# Докази тестування та збірки (`TEST_EVIDENCE`)

**Дата виконання:** 2026-10-24  
**Середовище:** Node.js v22 / Linux Container (`/app/applet`)

---

## 1. Результат виконання автоматичних тестів (`npm test`)

Команда:
```bash
NODE_ENV=test node --import tsx --test tests/marshgo.production.test.ts
```

Фактичний вивід:
```text
TAP version 13
# Subtest: MARSHGO Production Verification Suite (Unit + API Integration + E2E)
    # Subtest: 1. Unit Tests — Core Domain, Caching & Cryptography
        ok 1 - SmartCache enforces TTL, tracks hit ratio, deduplicates concurrent stampedes, and invalidates prefixes
        ok 2 - SmartCache.buildRadiusCacheKey quantizes nearby coordinates and isolates public vs user scopes
        ok 3 - validateExternalFeedUrl blocks SSRF vectors (HTTP, localhost, RFC1918, cloud metadata, credentials)
        ok 4 - MarshPass HMAC-SHA256 signing & verification accepts valid tokens and rejects tampered or expired tokens
        ok 5 - buildCanonicalJourneys produces BALANCED, FASTEST, CHEAPEST, and 5-segment chains without Metro in Lviv
        1..5
    ok 1 - 1. Unit Tests — Core Domain, Caching & Cryptography
    # Subtest: 2. API Integration & End-to-End Business Flows
        ok 1 - Health, Readiness, Security Headers, and Ukraine City Transport Catalog
        ok 2 - Multimodal Search, Live Transit Vehicle Focus (Screen 5), and Stop Arrivals
        ok 3 - Two-User Rideshare E2E Flow: Driver Offer -> Self-Book Guard -> Passenger Booking (0% Fee) -> MarshPass -> Rendezvous -> BOLA Guard -> Cancel & Rescue
        ok 4 - Reverse Marketplace E2E Flow: Demand -> Driver Proposal -> Counter-Offer -> Accept -> Confirmed 0% Booking
        ok 5 - RBAC & Admin SSRF Protection: Non-admin blocked (403); Admin SSRF blocked (400); Valid HTTPS feed accepted (201)
        ok 6 - Durable Disk Persistence writes and reloads state file across restarts
        1..6
    ok 2 - 2. API Integration & End-to-End Business Flows
    1..2
ok 1 - MARSHGO Production Verification Suite (Unit + API Integration + E2E)
1..1
# tests 11
# suites 3
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

---

## 2. Статична типізація (`npm run lint`) та Production Build (`npm run build`)

- `npm run lint` (`tsc --noEmit`): **0 помилок типізації**.
- `npm run build` (`vite build`): **успішна генерація оптимізованого production-бандла в `/dist`**.
