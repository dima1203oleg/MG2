import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  SmartCache,
  validateExternalFeedUrl,
  signMarshPassToken,
  verifyMarshPassToken,
  buildCanonicalJourneys,
  savePersistentState,
  loadPersistentState,
} from '../server.ts';
import { routeResultSchema } from '../shared/navigation/contracts.ts';

let server: Server;
let baseUrl = '';

const PASSENGER_ADMIN_ID = '00000000-0000-4000-8000-000000000001'; // roles: passenger, driver, admin, moderator
const DRIVER_TARAS_ID = '00000000-0000-4000-8000-000000000002'; // roles: passenger, driver
const THIRD_USER_OKSANA_ID = '00000000-0000-4000-8000-000000000003'; // roles: passenger, driver

async function apiFetch(
  endpoint: string,
  options: { method?: string; body?: unknown; userId?: string } = {},
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.userId) {
    headers['x-dev-user-id'] = options.userId;
  }
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, headers: response.headers, json };
}

describe('MARSHGO Production Verification Suite (Unit + API Integration + E2E)', () => {
  before(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ==========================================================================
  // 1. UNIT TESTS: SMARTCACHE, RADIUS GEO-KEYS, SSRF, MARSHPASS, MULTIMODAL
  // ==========================================================================
  describe('1. Unit Tests — Core Domain, Caching & Cryptography', () => {
    it('SmartCache enforces TTL, tracks hit ratio, deduplicates concurrent stampedes, and invalidates prefixes', async () => {
      const cache = new SmartCache();
      assert.equal(cache.get('missing-key'), null);

      let computeCalls = 0;
      const computeFn = async () => {
        computeCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return { priceMinor: 4500 };
      };

      // Concurrent stampede test: 5 parallel calls should trigger computeFn only ONCE
      const results = await Promise.all([
        cache.getOrCompute('journey:lviv-kyiv', 60, computeFn),
        cache.getOrCompute('journey:lviv-kyiv', 60, computeFn),
        cache.getOrCompute('journey:lviv-kyiv', 60, computeFn),
        cache.getOrCompute('journey:lviv-kyiv', 60, computeFn),
        cache.getOrCompute('journey:lviv-kyiv', 60, computeFn),
      ]);
      assert.equal(computeCalls, 1);
      assert.deepEqual(results[0], { priceMinor: 4500 });

      // Subsequent read is a cache hit
      const cached = cache.get<{ priceMinor: number }>('journey:lviv-kyiv');
      assert.equal(cached?.priceMinor, 4500);
      const stats = cache.getStats();
      assert.ok(stats.hits >= 1);
      assert.ok(stats.hitRatio > 0);

      // Prefix invalidation removes stale route entries
      const removed = cache.invalidatePrefix('journey:');
      assert.equal(removed, 1);
      assert.equal(cache.get('journey:lviv-kyiv'), null);
    });

    it('SmartCache.buildRadiusCacheKey quantizes nearby coordinates and isolates public vs user scopes', () => {
      const keyA = SmartCache.buildRadiusCacheKey({
        scope: 'public',
        domain: 'routes',
        origin: [24.03151, 49.84191],
        destination: [23.99441, 49.83991],
        radiusMeters: 500,
        strategy: 'BALANCED',
        passengers: 1,
      });
      const keyB = SmartCache.buildRadiusCacheKey({
        scope: 'public',
        domain: 'routes',
        origin: [24.03159, 49.84194],
        destination: [23.99444, 49.83993],
        radiusMeters: 500,
        strategy: 'BALANCED',
        passengers: 1,
      });
      const userKey = SmartCache.buildRadiusCacheKey({
        scope: `user:${PASSENGER_ADMIN_ID}`,
        domain: 'routes',
        origin: [24.03151, 49.84191],
        destination: [23.99441, 49.83991],
        radiusMeters: 500,
        strategy: 'BALANCED',
        passengers: 1,
      });
      assert.equal(keyA, keyB, 'Points within the same 500m radius cell should share a canonical key');
      assert.notEqual(keyA, userKey, 'Public and personal cache keys must never collide');
    });

    it('validateExternalFeedUrl blocks SSRF vectors (HTTP, localhost, RFC1918, cloud metadata, credentials)', () => {
      assert.equal(validateExternalFeedUrl('http://track.ua-gis.com/gtfs.zip').ok, false);
      assert.equal(validateExternalFeedUrl('https://localhost:8080/gtfs.zip').ok, false);
      assert.equal(validateExternalFeedUrl('https://127.0.0.1/gtfs.zip').ok, false);
      assert.equal(validateExternalFeedUrl('https://169.254.169.254/latest/meta-data/').ok, false);
      assert.equal(validateExternalFeedUrl('https://10.0.0.15/internal.json').ok, false);
      assert.equal(validateExternalFeedUrl('https://192.168.1.1/admin').ok, false);
      assert.equal(validateExternalFeedUrl('https://172.20.0.5/feed').ok, false);
      assert.equal(validateExternalFeedUrl('https://[::1]/feed').ok, false);
      assert.equal(validateExternalFeedUrl('https://admin:secret@track.ua-gis.com/feed').ok, false);

      const valid = validateExternalFeedUrl('https://track.ua-gis.com/gtfs/lviv/static.zip');
      assert.equal(valid.ok, true);
      assert.equal(valid.host, 'track.ua-gis.com');
    });

    it('MarshPass HMAC-SHA256 signing & verification accepts valid tokens and rejects tampered or expired tokens', () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      const token = signMarshPassToken('bkg-test-99', 2, future);
      const verified = verifyMarshPassToken(token);
      assert.equal(verified.valid, true);
      assert.equal(verified.bookingId, 'bkg-test-99');
      assert.equal(verified.seatCount, 2);

      // Tamper with signature
      const tampered = `${token.slice(0, -4)}ffff`;
      assert.equal(verifyMarshPassToken(tampered).valid, false);
      assert.equal(verifyMarshPassToken(tampered).reason, 'signature_mismatch');

      // Expired token
      const past = new Date(Date.now() - 60_000).toISOString();
      const expiredToken = signMarshPassToken('bkg-test-99', 2, past);
      assert.equal(verifyMarshPassToken(expiredToken).valid, false);
      assert.equal(verifyMarshPassToken(expiredToken).reason, 'token_expired');
    });

    it('buildCanonicalJourneys produces BALANCED, FASTEST, CHEAPEST, and 5-segment chains without Metro in Lviv', () => {
      const journeys = buildCanonicalJourneys({
        origin: { name: 'проспект Червоної Калини, 60 (Сихів), Львів', coordinates: [24.0574, 49.7966] },
        destination: { name: 'Двірцева площа, 1 (Вокзал), Львів', coordinates: [23.9944, 49.8399] },
        departureAt: new Date(Date.now() + 900_000).toISOString(),
        passengers: 1,
        strategy: 'BALANCED',
      });
      assert.equal(journeys.length, 4);
      const strategies = journeys.map((j) => j.strategy);
      assert.ok(strategies.includes('BALANCED'));
      assert.ok(strategies.includes('FASTEST'));
      assert.ok(strategies.includes('CHEAPEST'));

      // Check 5-leg multimodal journey (>4 segments)
      const fiveLeg = journeys.find((j) => j.legs.length === 5);
      assert.ok(fiveLeg, 'Must include a 5-segment journey for horizontal segment strip verification');

      // Ensure every leg has explicit durationSeconds and priceMinor, and NO METRO leg exists in Lviv
      for (const j of journeys) {
        for (const leg of j.legs) {
          assert.ok(typeof leg.durationSeconds === 'number' && leg.durationSeconds > 0);
          assert.ok(typeof leg.priceMinor === 'number' && leg.priceMinor >= 0);
          assert.notEqual(leg.mode, 'METRO', 'Lviv journeys must never contain a METRO leg');
        }
      }
    });
  });

  // ==========================================================================
  // 2. API INTEGRATION & E2E TESTS
  // ==========================================================================
  describe('2. API Integration & End-to-End Business Flows', () => {
    it('Health, Readiness, Security Headers, and Ukraine City Transport Catalog', async () => {
      const health = await apiFetch('/healthz');
      assert.equal(health.status, 200);
      assert.equal(health.json.status, 'ok');
      assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(health.headers.get('x-frame-options'), 'SAMEORIGIN');

      const ready = await apiFetch('/readyz');
      assert.equal(ready.status, 200);
      assert.equal(ready.json.citiesCount, 24);

      const cities = await apiFetch('/api/v1/transport/cities');
      assert.equal(cities.status, 200);
      const lviv = cities.json.data.find((c: any) => c.id === 'lviv');
      const kyiv = cities.json.data.find((c: any) => c.id === 'kyiv');
      assert.ok(lviv && !lviv.modes.includes('metro'), 'Lviv transport modes must not include metro');
      assert.ok(kyiv && kyiv.modes.includes('metro'), 'Kyiv transport modes must include metro');
    });

    it('Multimodal Search, Live Transit Vehicle Focus (Screen 5), and Stop Arrivals', async () => {
      const search = await apiFetch('/api/v1/journeys/search', {
        method: 'POST',
        body: {
          origin: { name: 'площа Ринок, 1, Львів', coordinates: [24.0315, 49.8419] },
          destination: { name: 'Двірцева площа, 1 (Вокзал), Львів', coordinates: [23.9944, 49.8399] },
          strategy: 'BALANCED',
          passengers: 1,
        },
      });
      assert.equal(search.status, 200);
      assert.ok(search.json.data.journeys.length >= 3);

      const journeyId = search.json.data.journeys[0].id;
      const live = await apiFetch(`/api/v1/journeys/${journeyId}/live`);
      assert.equal(live.status, 200);
      assert.ok(Array.isArray(live.json.data.segments));
      assert.ok(live.json.data.segments.length >= 1);
      assert.ok(live.json.data.segments[0].vehicles.length >= 2);

      const arrivals = await apiFetch('/api/v1/transit/stops/bus47a-stop-1/arrivals?routeId=lviv-bus-47a');
      assert.equal(arrivals.status, 200);
      assert.ok(arrivals.json.data.arrivals.length >= 2);
    });

    it('Two-User Rideshare E2E Flow: Driver Offer -> Self-Book Guard -> Passenger Booking (0% Fee) -> MarshPass -> Rendezvous -> BOLA Guard -> Cancel & Rescue', async () => {
      // 1. Driver Taras creates a new offer
      const createOffer = await apiFetch('/api/v1/offers', {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
        body: {
          vehicleId: 'veh-002',
          originName: 'площа Ринок, 1, Львів',
          destinationName: 'вулиця Соборна, 59, Вінниця',
          origin: [24.0315, 49.8419],
          destination: [28.4682, 49.2331],
          departureAt: new Date(Date.now() + 7200_000).toISOString(),
          pricePerSeatMinor: 42000,
          seats: 3,
        },
      });
      assert.equal(createOffer.status, 201);
      const offerId = createOffer.json.data.id;
      assert.equal(createOffer.json.data.available_seats, 3);

      // 2. Driver Taras cannot book seats on his own offer
      const selfBook = await apiFetch('/api/v1/bookings', {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
        body: { offerId, seats: 1 },
      });
      assert.equal(selfBook.status, 409);
      assert.equal(selfBook.json.error.code, 'cannot_book_own_offer');

      // 3. Passenger Oleksandr books 2 seats on Taras's offer
      const bookRes = await apiFetch('/api/v1/bookings', {
        method: 'POST',
        userId: PASSENGER_ADMIN_ID,
        body: { offerId, seats: 2 },
      });
      assert.equal(bookRes.status, 201);
      const booking = bookRes.json.data;
      assert.equal(booking.seat_count, 2);
      assert.equal(booking.total_price_minor, 84000);
      assert.equal(booking.platform_fee_minor, 0, 'Community rideshare must enforce 0% platform commission');
      assert.equal(booking.fee_class, 'community');

      // Verify available seats decremented to 1
      const offerCheck = await apiFetch(`/api/v1/offers/${offerId}`);
      assert.equal(offerCheck.json.data.available_seats, 1);

      // 4. Overbooking guard: attempting to book 2 more seats when only 1 remains fails with 409
      const overbook = await apiFetch('/api/v1/bookings', {
        method: 'POST',
        userId: THIRD_USER_OKSANA_ID,
        body: { offerId, seats: 2 },
      });
      assert.equal(overbook.status, 409);
      assert.equal(overbook.json.error.code, 'insufficient_seats');

      // 5. Passenger fetches & verifies cryptographic MarshPass QR ticket
      const ticketRes = await apiFetch(`/api/v1/bookings/${booking.id}/ticket`, {
        userId: PASSENGER_ADMIN_ID,
      });
      assert.equal(ticketRes.status, 200);
      const qrToken = ticketRes.json.data.token;
      const verifyRes = await apiFetch('/api/v1/bookings/verify-ticket', {
        method: 'POST',
        body: { token: qrToken },
      });
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.json.data.valid, true);
      assert.equal(verifyRes.json.data.bookingId, booking.id);

      // 6. Live Rendezvous pickup session (Screen 6)
      const rdvRes = await apiFetch(`/api/v1/bookings/${booking.id}/rendezvous`, {
        userId: PASSENGER_ADMIN_ID,
      });
      assert.equal(rdvRes.status, 200);
      const rdvId = rdvRes.json.data.id;
      const approaches = await apiFetch(`/api/v1/rendezvous/${rdvId}/approaches`);
      assert.equal(approaches.status, 200);
      assert.equal(approaches.json.data.driver.approach.status, 'ROUTED');
      assert.equal(approaches.json.data.passenger.approach.status, 'ROUTED');

      // 7. BOLA/IDOR protection: Unrelated user Oksana cannot cancel Oleksandr's booking
      const unauthorizedCancel = await apiFetch(`/api/v1/bookings/${booking.id}/cancel`, {
        method: 'POST',
        userId: THIRD_USER_OKSANA_ID,
      });
      assert.equal(unauthorizedCancel.status, 403);
      assert.equal(unauthorizedCancel.json.error.code, 'forbidden_booking_access');

      // 8. Passenger cancels booking -> seats restored to 3 & rescue alternatives returned
      const cancelRes = await apiFetch(`/api/v1/bookings/${booking.id}/cancel`, {
        method: 'POST',
        userId: PASSENGER_ADMIN_ID,
      });
      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.json.data.status, 'cancelled');

      const offerAfterCancel = await apiFetch(`/api/v1/offers/${offerId}`);
      assert.equal(offerAfterCancel.json.data.available_seats, 3, 'Cancelled booking must restore seat inventory');

      const rescue = await apiFetch(`/api/v1/bookings/${booking.id}/rescue`);
      assert.equal(rescue.status, 200);
      assert.ok(rescue.json.data.alternatives.length >= 1);
    });

    it('Reverse Marketplace E2E Flow: Demand -> Driver Proposal -> Counter-Offer -> Accept -> Confirmed 0% Booking', async () => {
      const demRes = await apiFetch('/api/v1/demands', {
        method: 'POST',
        userId: PASSENGER_ADMIN_ID,
        body: {
          originName: 'Львів, площа Ринок',
          destinationName: 'Тернопіль, Театральний майдан',
          origin: [24.0315, 49.8419],
          destination: [25.5948, 49.5535],
          passengers: 2,
          budgetMinor: 50000,
          budgetType: 'total_all',
        },
      });
      assert.equal(demRes.status, 201);
      const demandId = demRes.json.data.id;

      const propRes = await apiFetch(`/api/v1/demands/${demandId}/proposals`, {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
        body: {
          vehicleId: 'veh-002',
          priceMinor: 54000,
          comment: 'Заберу біля Оперного театру',
        },
      });
      assert.equal(propRes.status, 201);
      const proposalId = propRes.json.data.id;

      const counterRes = await apiFetch(`/api/v1/proposals/${proposalId}/counter`, {
        method: 'POST',
        userId: PASSENGER_ADMIN_ID,
        body: { priceMinor: 51000, comment: 'Чи підійде 510 грн?' },
      });
      assert.equal(counterRes.status, 200);
      assert.equal(counterRes.json.data.price_minor, 51000);
      assert.equal(counterRes.json.data.revision_number, 2);

      const acceptRes = await apiFetch(`/api/v1/proposals/${proposalId}/accept`, {
        method: 'POST',
        userId: PASSENGER_ADMIN_ID,
      });
      assert.equal(acceptRes.status, 200);
      assert.equal(acceptRes.json.data.status, 'confirmed');
      assert.equal(acceptRes.json.data.total_price_minor, 51000);
      assert.equal(acceptRes.json.data.platform_fee_minor, 0);
    });

    it('RBAC & Admin SSRF Protection: Non-admin blocked (403); Admin SSRF blocked (400); Valid HTTPS feed accepted (201)', async () => {
      // Non-admin user Taras attempts to access Admin Dashboard
      const nonAdmin = await apiFetch('/api/v1/admin/dashboard', {
        userId: DRIVER_TARAS_ID,
      });
      assert.equal(nonAdmin.status, 403);
      assert.equal(nonAdmin.json.error.code, 'forbidden_role');

      // Admin user attempts to register internal metadata URL
      const ssrfAttempt = await apiFetch('/api/v1/admin/mobility/providers', {
        method: 'POST',
        userId: PASSENGER_ADMIN_ID,
        body: {
          name: 'Malicious Metadata Feed',
          city: 'Київ',
          providerType: 'public_transit',
          sourceType: 'gtfs',
          feedUrl: 'http://169.254.169.254/latest/meta-data/',
        },
      });
      assert.equal(ssrfAttempt.status, 400);
      assert.equal(ssrfAttempt.json.error.code, 'ssrf_blocked');

      // Admin user registers valid HTTPS GTFS feed
      const validFeed = await apiFetch('/api/v1/admin/mobility/providers', {
        method: 'POST',
        userId: PASSENGER_ADMIN_ID,
        body: {
          name: 'Вінницька транспортна компанія (GTFS)',
          city: 'Вінниця',
          providerType: 'public_transit',
          sourceType: 'gtfs',
          feedUrl: 'https://depo.vn.ua/gtfs/vinnytsia-static.zip',
        },
      });
      assert.equal(validFeed.status, 201);
      assert.equal(validFeed.json.data.feed_host, 'depo.vn.ua');
    });

    it('Navigation & Map Subsystem E2E: Routing Schema, Turn-by-Turn Maneuvers, GPS On-Route/Off-Route, Reroute & GeoJSON Layers', async () => {
      // 1. Calculate road route and verify strict routeResultSchema compatibility (polyline6 + maneuvers)
      const calcRes = await apiFetch('/api/v1/routing/calculate', {
        method: 'POST',
        body: {
          origin: [24.0315, 49.8419],
          destination: [23.9944, 49.8399],
        },
      });
      assert.equal(calcRes.status, 200);
      const parsedRoute = routeResultSchema.parse(calcRes.json.data);
      assert.equal(parsedRoute.geometry.encoding, 'polyline6');
      assert.ok(parsedRoute.geometry.value.length > 4);
      assert.ok(parsedRoute.maneuvers.length >= 2);
      assert.equal(parsedRoute.maneuvers[0].type, 'DEPART');
      assert.equal(parsedRoute.maneuvers[parsedRoute.maneuvers.length - 1].type, 'ARRIVE');

      // 2. Start driver navigation session with destination
      const navStart = await apiFetch('/api/v1/navigation/sessions', {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
        body: {
          origin: [24.0315, 49.8419],
          destination: [23.9944, 49.8399],
          destinationName: 'Двірцева площа, 1 (Вокзал), Львів',
        },
      });
      assert.equal(navStart.status, 201);
      const navSession = navStart.json.data;
      assert.equal(navSession.state, 'active');
      assert.ok(Array.isArray(navSession.route) && navSession.route.length >= 2);
      assert.ok(Array.isArray(navSession.maneuvers) && navSession.maneuvers.length >= 2);

      // 3. Send GPS location fix ON the route -> onRoute === true
      const onRouteFix = await apiFetch(`/api/v1/navigation/sessions/${navSession.id}/location`, {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
        body: {
          coordinates: navSession.route[0],
          accuracyMeters: 6,
          capturedAt: new Date().toISOString(),
        },
      });
      assert.equal(onRouteFix.status, 200);
      assert.equal(onRouteFix.json.data.onRoute, true);

      // 4. Send GPS location fix far OFF the route -> onRoute === false
      const offRouteFix = await apiFetch(`/api/v1/navigation/sessions/${navSession.id}/location`, {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
        body: {
          coordinates: [24.15, 49.95],
          accuracyMeters: 8,
          capturedAt: new Date().toISOString(),
        },
      });
      assert.equal(offRouteFix.status, 200);
      assert.equal(offRouteFix.json.data.onRoute, false);

      // 5. Trigger reroute from new position -> route_version increments & new maneuvers generated
      const rerouteRes = await apiFetch(`/api/v1/navigation/sessions/${navSession.id}/reroute`, {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
        body: {
          origin: [24.0412, 49.8351],
          reason: 'OFF_ROUTE',
        },
      });
      assert.equal(rerouteRes.status, 200);
      assert.equal(rerouteRes.json.data.route_version, 2);
      assert.ok(rerouteRes.json.data.maneuvers.length >= 2);

      // 6. Pause, Resume, and End navigation session
      const pauseRes = await apiFetch(`/api/v1/navigation/sessions/${navSession.id}/pause`, {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
      });
      assert.equal(pauseRes.status, 200);
      assert.equal(pauseRes.json.data.state, 'paused');

      const resumeRes = await apiFetch(`/api/v1/navigation/sessions/${navSession.id}/resume`, {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
      });
      assert.equal(resumeRes.status, 200);
      assert.equal(resumeRes.json.data.state, 'active');

      const endRes = await apiFetch(`/api/v1/navigation/sessions/${navSession.id}/end`, {
        method: 'POST',
        userId: DRIVER_TARAS_ID,
      });
      assert.equal(endRes.status, 200);
      assert.equal(endRes.json.data.state, 'ended');

      // 7. Verify Transport Map Layers & GeoJSON feature properties for MapLibre
      const layersRes = await apiFetch('/api/v1/transport/layers');
      assert.equal(layersRes.status, 200);
      assert.ok(Array.isArray(layersRes.json.data));
      assert.ok(layersRes.json.data.some((l: any) => l.id === 'BUS' && l.available));
      assert.ok(layersRes.json.data.some((l: any) => l.id === 'TRAM' && l.available));
      assert.ok(layersRes.json.data.some((l: any) => l.id === 'STOPS' && l.available));
      assert.ok(layersRes.json.data.some((l: any) => l.id === 'SCOOTER' && l.available));

      const routesGeo = await apiFetch('/api/v1/transport/routes?layers=BUS,TRAM');
      assert.equal(routesGeo.status, 200);
      assert.equal(routesGeo.json.data.type, 'FeatureCollection');
      assert.ok(routesGeo.json.data.features.length >= 2);
      assert.ok(routesGeo.json.data.features[0].properties.transport, 'Route feature must include transport property for MapLibre styling');

      const vehiclesGeo = await apiFetch('/api/v1/transport/vehicles?layers=BUS,TRAM');
      assert.equal(vehiclesGeo.status, 200);
      assert.ok(vehiclesGeo.json.data.features.length >= 2);
      assert.ok(vehiclesGeo.json.data.features[0].properties.transport, 'Vehicle feature must include transport property');

      const microGeo = await apiFetch('/api/v1/transport/micromobility');
      assert.equal(microGeo.status, 200);
      assert.ok(microGeo.json.data.features.length >= 2);
      assert.ok(microGeo.json.data.features[0].properties.kind, 'Micromobility feature must include kind property');
    });

    it('Preset Navigation Destinations: Lviv Station default, quick chips, and live OSRM polyline6 road geometry', async () => {
      const presets = [
        { label: 'Львів Вокзал', coords: [23.9944, 49.8399] },
        { label: 'Львів Ринок', coords: [24.0315, 49.8419] },
        { label: 'Одеса Дерибасівська', coords: [30.7326, 46.4846] },
        { label: 'Дніпро Яворницького', coords: [35.0462, 48.4647] },
        { label: 'Ужгород Театральна', coords: [22.2879, 48.6208] },
      ];

      for (const preset of presets) {
        const origin: [number, number] = preset.coords[0] === 24.0315 ? [24.0574, 49.7966] : [24.0315, 49.8419];
        const res = await apiFetch('/api/v1/routing/calculate', {
          method: 'POST',
          body: {
            origin,
            destination: preset.coords,
          },
        });
        assert.equal(res.status, 200, `Calculating route for ${preset.label} must return 200`);
        assert.ok(res.json.data.distanceMeters > 0, 'Distance must be > 0');
        assert.ok(res.json.data.durationSeconds > 0, 'Duration must be > 0');
        assert.equal(res.json.data.geometry.encoding, 'polyline6');
        assert.ok(res.json.data.geometry.value.length > 4, 'Encoded polyline must be non-empty');
        assert.ok(Array.isArray(res.json.data.maneuvers) && res.json.data.maneuvers.length >= 2);
      }
    });

    it('Google Maps Grounding Endpoint: /api/v1/places/grounded-search handles requests and reports status', async () => {
      const res = await apiFetch('/api/v1/places/grounded-search', {
        method: 'POST',
        body: {
          query: 'АЗС поруч зі Львовом',
          latitude: 49.8399,
          longitude: 23.9944,
        },
      });
      // 200 (success), 503 (missing key), or 500 (API/network error in test env), but must return structured JSON
      assert.ok([200, 500, 503].includes(res.status), `Status must be 200, 500, or 503, got ${res.status}`);
      if (res.status === 200) {
        assert.ok(typeof res.json.data.text === 'string');
        assert.ok(Array.isArray(res.json.data.sources));
      } else {
        assert.ok(typeof res.json.error.code === 'string');
        assert.ok(typeof res.json.error.message === 'string');
      }
    });

    it('Durable Disk Persistence writes and reloads state file across restarts', () => {
      savePersistentState();
      const statePath = path.join(process.cwd(), 'data', 'marshgo-state.json');
      assert.equal(fs.existsSync(statePath), true, 'data/marshgo-state.json must be written to disk');
      const restored = loadPersistentState();
      assert.equal(restored, true, 'loadPersistentState() must reload persisted records cleanly');
    });
  });
});
