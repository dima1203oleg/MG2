import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowUp, ChevronUp, CornerUpLeft, CornerUpRight, Eye, Flag, Layers, Map, MapPin, MoreHorizontal, Navigation, LocateFixed, RotateCcw, RefreshCw, Search, Share2, ShieldCheck, Sparkles, Square, TriangleAlert, Volume2, VolumeX, X, type LucideIcon } from 'lucide-react';
import { GoogleMapsExplorerSheet } from '../components/GoogleMapsExplorerSheet';
import { dueAnnouncement, formatGuidanceDistance, instructionText, nextGuidance, prepareGuidance, voiceLine } from '../navigation/guidance';
import type { Maneuver } from '../../shared/navigation/contracts';
import { ApiNavigationMatch, ApiNavigationSession, ApiPlace, productionApi } from '../services/productionApi';
import type { LocationFix } from '../../shared/navigation/contracts';
import { MarshGoMap } from '../map/MarshGoMap';
import { MapLayersControl } from '../components/MapLayersControl';
import { schemePreviewAttribution, schemePreviewTiles } from '../map/mapConfig';
import type { MapAdapter, MapStatus } from '../map/MapAdapter';
import { WebGeolocationProvider, validateLocationFix } from '../platform/LocationProvider';
import { NavigationStore } from '../navigation/NavigationStore';
import { canonicalRoute } from '../navigation/canonicalRoute';
import { decodePolyline6 } from '../../shared/navigation/geometry';
import { OfflineNavigationStore } from '../navigation/OfflineNavigationStore';
import { BasicRouteMapMatchingProvider } from '../navigation/BasicRouteMapMatchingProvider';
import { navigationError } from '../../shared/navigation/errors';
import { OffRouteGuard } from '../navigation/OffRouteGuard';
import { snapNavigationSheet, type NavigationSheetLevel } from '../navigation/navigationSheet';
import { createNavigationShareUrl } from '../routing/navigationShare';
import { getMapLayer, getMapPerspective, mapLayers, satelliteAttribution, satelliteTiles, setMapLayer, setMapPerspective, subscribeMapLayer, subscribeMapPerspective, type MapLayer, type MapPerspective } from '../map/mapMode';

function navigationErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  if (error.message === 'Required role is missing') return 'Щоб користуватися навігацією, активуйте роль водія у профілі.';
  const locationMessages: Record<string, string> = {
    GPS_PERMISSION_DENIED: 'Дозвольте MARSHGO доступ до геолокації в налаштуваннях браузера або пристрою, потім спробуйте ще раз.',
    GPS_UNAVAILABLE: 'Не вдалося отримати точне місце. Перевірте дозвіл і сигнал GPS, потім спробуйте ще раз.',
    GPS_INVALID_FIX: 'Пристрій надав некоректну GPS-точку. Перевірте точність геолокації та спробуйте ще раз.',
    GPS_LOW_ACCURACY: 'Поточне місце визначено неточно. Увімкніть точну геолокацію та спробуйте ще раз.',
    GPS_STALE: 'GPS-точка застаріла. Зачекайте на свіже місце розташування та повторіть спробу.',
  };
  const locationMessage = locationMessages[error.message];
  if (locationMessage) return locationMessage;
  if (/^[A-Z][A-Z0-9_]+$/.test(error.message)) return fallback;
  return error.message;
}

const hasRoute = (session: ApiNavigationSession) => (session.route?.length ?? 0) >= 2 && session.route_distance_m !== null && session.route_duration_s !== null;

const VOICE_KEY = 'marshgo.navigation.voice';
const voicePreferred = () => { try { return localStorage.getItem(VOICE_KEY) === 'on'; } catch { return false; } };
/** Speaks Ukrainian guidance with the device voice; silently does nothing where speech synthesis is unavailable. */
function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'uk-UA';
  const voice = synth.getVoices().find((item) => item.lang.toLowerCase().startsWith('uk'));
  if (voice) utterance.voice = voice;
  utterance.rate = 1.02;
  synth.speak(utterance);
}

function NavigationPerspectiveControl() {
  const [perspective, setPerspective] = useState<MapPerspective>(getMapPerspective());
  useEffect(() => subscribeMapPerspective(setPerspective), []);
  const next: MapPerspective = perspective === '3d' ? '2d' : '3d';
  return <button type="button" aria-label={`Увімкнути ${next.toUpperCase()}-перспективу`} aria-pressed={perspective === '3d'} onClick={() => setMapPerspective(next)} className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white/95 text-sm font-extrabold text-[#0B1730] shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#0A1D2D]/90 dark:text-white">3D</button>;
}

function previewTileUrl(layer: MapLayer, center: [number, number] | null) {
  const source = layer === 'satellite' ? satelliteTiles : schemePreviewTiles;
  const attribution = layer === 'satellite' ? satelliteAttribution : schemePreviewAttribution;
  if (!center || !source || !attribution) return null;
  const zoom = 14;
  const count = 2 ** zoom;
  const x = Math.max(0, Math.min(count - 1, Math.floor(((center[0] + 180) / 360) * count)));
  const latitude = Math.max(-85.0511, Math.min(85.0511, center[1]));
  const radians = latitude * Math.PI / 180;
  const y = Math.max(0, Math.min(count - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * count)));
  const template = source;
  if (!['{z}', '{x}'].every((key) => template.includes(key)) || (!template.includes('{y}') && !template.includes('{-y}'))) return null;
  return template.replaceAll('{z}', String(zoom)).replaceAll('{x}', String(x)).replaceAll('{y}', String(y)).replaceAll('{-y}', String(count - 1 - y));
}

function NavigationBasemapPreview({ center, aboveSummary = false }: { center: [number, number] | null; aboveSummary?: boolean }) {
  const [layer, setLayer] = useState<MapLayer>(getMapLayer());
  useEffect(() => subscribeMapLayer(setLayer), []);
  const next: MapLayer = layer === 'simple' ? 'satellite' : 'simple';
  const tile = previewTileUrl(next, center);
  return <button type="button" data-testid="navigation-basemap-preview" aria-label={`Перемкнути карту на ${mapLayers[next].label}`} title={`Перемкнути карту на ${mapLayers[next].label}`} onClick={() => setMapLayer(next)} className="absolute right-3 z-[500] h-[4.7rem] w-[4.7rem] overflow-hidden rounded-xl border border-slate-200 bg-white text-[#0B1730] shadow-xl dark:border-white/80 dark:bg-[#0A1D2D] dark:text-white" style={{ bottom: aboveSummary ? 'calc(11.5rem + env(safe-area-inset-bottom))' : 'calc(8.8rem + env(safe-area-inset-bottom))' }}>
    <span className="absolute inset-0 block overflow-hidden">
      {tile ? <img src={tile} alt="" loading="lazy" className="h-full w-full object-cover"/> : <span aria-hidden="true" className="grid h-full w-full place-items-center bg-slate-100 dark:bg-[#112438]"><Layers size={23} className="text-slate-500 dark:text-slate-300"/></span>}
    </span>
    <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-1 text-[9px] font-semibold leading-tight text-white">{mapLayers[next].label}{!tile ? ' · без preview' : ''}</span>
  </button>;
}

function maneuverIcon(maneuver: Maneuver): LucideIcon {
  if (maneuver.type === 'ARRIVE') return Flag;
  if (maneuver.type === 'ROUNDABOUT') return RefreshCw;
  if (maneuver.type === 'UTURN' || maneuver.modifier === 'UTURN') return RotateCcw;
  if (maneuver.modifier?.includes('LEFT')) return CornerUpLeft;
  if (maneuver.modifier?.includes('RIGHT')) return CornerUpRight;
  return ArrowUp;
}

export const PRESET_NAVIGATION_DESTINATIONS: ApiPlace[] = [
  { providerId: 'nav-lviv-station', label: 'Львів, Двірцева площа (Вокзал)', latitude: 49.8399, longitude: 23.9944 },
  { providerId: 'nav-lviv', label: 'Львів, площа Ринок', latitude: 49.8419, longitude: 24.0315 },
  { providerId: 'nav-odesa', label: 'Одеса, Дерибасівська', latitude: 46.4846, longitude: 30.7326 },
  { providerId: 'nav-dnipro', label: 'Дніпро, просп. Яворницького', latitude: 48.4647, longitude: 35.0462 },
  { providerId: 'nav-uzhhorod', label: 'Ужгород, пл. Театральна', latitude: 48.6208, longitude: 22.2879 },
];

type Props = { onBack: () => void; onOpenDemand?: (demandId: string, candidateId: string) => void; onSessionActiveChange?: (active: boolean) => void; isPresented?: boolean; autoStart?: boolean; autoStartRequestId?: number; initialDestination?: ApiPlace | null; onAddVehicle?: () => void };
const AUTO_MATCHING_KEY = 'marshgo.navigation.autoMatching';
const autoMatchingPreferred = () => { try { return localStorage.getItem(AUTO_MATCHING_KEY) !== 'off'; } catch { return true; } };
export function ProductionNavigation({ onBack, onOpenDemand, onSessionActiveChange, isPresented = true, autoStart = false, autoStartRequestId = 0, initialDestination = null, onAddVehicle }: Props) {
  const [destinationText, setDestinationText] = useState(() => initialDestination?.label ?? PRESET_NAVIGATION_DESTINATIONS[0].label);
  const [suggestions, setSuggestions] = useState<ApiPlace[]>([]);
  const [destination, setDestination] = useState<ApiPlace | null>(() => initialDestination ?? PRESET_NAVIGATION_DESTINATIONS[0]);
  const [previewStats, setPreviewStats] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const [session, setSession] = useState<ApiNavigationSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [matchingBusy, setMatchingBusy] = useState(false);
  const [matchingEnabled, setMatchingEnabled] = useState(false);
  const [matches, setMatches] = useState<ApiNavigationMatch[]>([]);
  const [gpsMessage, setGpsMessage] = useState('');
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [clock, setClock] = useState(Date.now());
  const [onRoute, setOnRoute] = useState<boolean | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  // Raw GPS position: the marker for a session without a route ("just drive"), where there is no route to match it to.
  const [liveFix, setLiveFix] = useState<[number, number] | null>(null);
  const [previewRoute, setPreviewRoute] = useState<[number, number][]>([]);
  const autoStartStartedFor = useRef<number | null>(null);
  const autoStartUpdatedFor = useRef<number | null>(null);
  const [sheetLevel, setSheetLevel] = useState<NavigationSheetLevel>('collapsed');
  const sheetOpen = sheetLevel !== 'collapsed';
  const [focusMode, setFocusMode] = useState(() => { try { return localStorage.getItem('marshgo.navigation.focusMode') === 'on'; } catch { return false; } });
  const [actionsOpen, setActionsOpen] = useState(false);
  const [mapsExplorerOpen, setMapsExplorerOpen] = useState(false);
  const actionsDialogRef = useRef<HTMLElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const sheetDragStart = useRef<{ startY: number; initialLevel: NavigationSheetLevel; pointerId: number } | null>(null);
  const centeredOnce = useRef<string | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof ResizeObserver === 'undefined') { setSheetHeight(0); return; }
    const observer = new ResizeObserver(() => setSheetHeight(sheet.getBoundingClientRect().height));
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [sheetOpen, Boolean(session)]);
  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [liveSpeed, setLiveSpeed] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [voiceOn, setVoiceOn] = useState(voicePreferred);
  const spokenRef = useRef<Set<string>>(new Set());
  const [topQuery, setTopQuery] = useState('');
  const [topSuggestions, setTopSuggestions] = useState<ApiPlace[]>([]);
  const offlineStoreRef = useRef<OfflineNavigationStore | null>(null);
  if (!offlineStoreRef.current) offlineStoreRef.current = new OfflineNavigationStore();
  const [navigationStore] = useState(() => new NavigationStore((effect, state) => {
    if (effect.type === 'CLEAR_OFFLINE_STATE') offlineStoreRef.current?.clear(state.sessionId);
    if (effect.type === 'REQUEST_REROUTE' && state.sessionId) {
      navigationStore.dispatch({ type: 'REROUTE_STARTED' });
      void productionApi.rerouteNavigation(state.sessionId).then((updated) => {
        navigationStore.dispatch({ type: 'REROUTE_SUCCEEDED', route: canonicalRoute(updated) });
        setSession(updated);
        setMatchingEnabled(false); setMatches([]);
        setOnRoute(true);
        setGpsMessage('Маршрут оновлено від останньої підтвердженої GPS-позиції. Пошук попутників призупинено до повторної згоди.');
      }).catch((error: unknown) => {
        navigationStore.dispatch({ type: 'REROUTE_FAILED', error: navigationError('REROUTE_FAILED', 'osrm') });
        setGpsMessage(error instanceof Error ? error.message : 'Не вдалося оновити маршрут.');
      });
    }
    if (effect.type === 'EMIT_TELEMETRY') window.dispatchEvent(new CustomEvent('marshgo:telemetry', { detail: { name: effect.name, sessionId: state.sessionId } }));
  }));
  const navigationState = useSyncExternalStore(navigationStore.subscribe, navigationStore.getSnapshot, navigationStore.getSnapshot);
  useEffect(() => onSessionActiveChange?.(Boolean(session && session.state !== 'ended')), [onSessionActiveChange, session?.id, session?.state]);
  useEffect(() => { try { localStorage.setItem('marshgo.navigation.focusMode', focusMode ? 'on' : 'off'); } catch { /* focus preference is optional */ } }, [focusMode]);
  useEffect(() => { if (!isPresented) setActionsOpen(false); }, [isPresented]);
  useEffect(() => {
    if (!actionsOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const dialog = actionsDialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusable()[0]?.focus();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setActionsOpen(false); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keepFocusInside);
    return () => {
      window.removeEventListener('keydown', keepFocusInside);
      if (previouslyFocused?.isConnected && !previouslyFocused.closest('[aria-hidden="true"]')) previouslyFocused.focus();
    };
  }, [actionsOpen]);
  const mapRef = useRef<MapAdapter | null>(null);
  const locationProvider = useRef(new WebGeolocationProvider());
  const mapMatchingProvider = useRef(new BasicRouteMapMatchingProvider());
  const lastSentRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const lastValidatedFixRef = useRef<LocationFix | null>(null);
  const offRouteGuardRef = useRef(new OffRouteGuard());

  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    const syncConnectivity = () => {
      if (!navigator.onLine) { navigationStore.dispatch({ type: 'CONNECTIVITY_LOST' }); return; }
      if (!session) { navigationStore.dispatch({ type: 'CONNECTIVITY_RESTORED' }); return; }
      void productionApi.activeNavigation().then((authoritative) => {
        if (!authoritative || authoritative.id !== session.id) {
          offlineStoreRef.current?.clear(session.id);
          navigationStore.dispatch({ type: 'NAVIGATION_ENDED' });
          setSession(null);
          return;
        }
        setSession(authoritative);
        navigationStore.dispatch({ type: 'CONNECTIVITY_RESTORED' });
      }).catch(() => navigationStore.dispatch({ type: 'CONNECTIVITY_LOST' }));
    };
    window.addEventListener('online', syncConnectivity);
    window.addEventListener('offline', syncConnectivity);
    syncConnectivity();
    return () => { window.removeEventListener('online', syncConnectivity); window.removeEventListener('offline', syncConnectivity); };
  }, [navigationStore, session?.id]);

  useEffect(() => {
    if (!session || !hasRoute(session)) return;
    try { navigationStore.dispatch({ type: 'NAVIGATION_SESSION_RECONCILED', sessionId: session.id, route: canonicalRoute(session), paused: session.state === 'paused' }); }
    catch { setGpsMessage('Сервер повернув маршрут у несумісному форматі. Поточний маршрут не змінено.'); }
  }, [navigationStore, session?.id, session?.route_version, session?.state, session?.route]);

  // The map would otherwise open zoomed out; centre on the driver once, after that the "my location" button brings the follow camera back.
  useEffect(() => {
    if (!session || !liveFix || centeredOnce.current === session.id) return;
    // Like Apple Maps: navigation opens on the driver, close and tilted, following the direction of travel.
    if (mapRef.current) { mapRef.current.recenter(liveFix); centeredOnce.current = session.id; }
  }, [session?.id, liveFix?.[0], liveFix?.[1], mapStatus]);

  useEffect(() => {
    lastValidatedFixRef.current = null;
    offRouteGuardRef.current.reset();
  }, [session?.id]);

  useEffect(() => {
    if (navigationState.connectivity === 'OFFLINE' && session) if (hasRoute(session)) offlineStoreRef.current?.save(navigationState, { ...session, destination_name: session.destination_name ?? '', route: session.route ?? [], route_distance_m: session.route_distance_m ?? 0, route_duration_s: session.route_duration_s ?? 0 });
  }, [navigationState.connectivity, navigationState.routeVersion, navigationState.sessionId, session?.id, session?.route_version, session?.state]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isPresented || session || !destination) {
      setPreviewRoute([]);
      setPreviewStats(null);
      return;
    }
    let cancelled = false;
    const isLvivCenterDest = Math.abs(destination.longitude - 24.0315) < 0.015 && Math.abs(destination.latitude - 49.8419) < 0.015;
    const previewOrigin: [number, number] = isLvivCenterDest ? [24.0574, 49.7966] : [24.0315, 49.8419];
    fetch('/api/v1/routing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: previewOrigin, destination: [destination.longitude, destination.latitude] }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        const encoded = body?.data?.geometry?.value;
        if (typeof encoded === 'string' && encoded.length >= 4) {
          setPreviewRoute(decodePolyline6(encoded));
        } else {
          setPreviewRoute([previewOrigin, [destination.longitude, destination.latitude]]);
        }
        if (body?.data?.distanceMeters && body?.data?.durationSeconds) {
          setPreviewStats({ distanceMeters: body.data.distanceMeters, durationSeconds: body.data.durationSeconds });
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewRoute([previewOrigin, [destination.longitude, destination.latitude]]);
      });
    return () => {
      cancelled = true;
    };
  }, [isPresented, Boolean(session), destination?.longitude, destination?.latitude]);

  useEffect(() => {
    if (isPresented) {
      const frame = requestAnimationFrame(() => {
        mapRef.current?.resize?.();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isPresented]);

  useEffect(() => {
    productionApi.activeNavigation().then((active) => {
      if (active) {
        setSession(active); setMatchingEnabled(active.opt_in); setOnRoute(true);
        void applySimulatedFix(active, 0);
        if (active.opt_in) void productionApi.navigationMatches(active.id).then(setMatches).catch(() => undefined);
      } else offlineStoreRef.current?.clear();
    }).catch((error: unknown) => {
      const cached = offlineStoreRef.current?.readLatest();
      if (cached) {
        setSession({ ...cached.session, current_location: null, current_location_accuracy_m: null, current_location_at: null });
        setMatchingEnabled(false);
        navigationStore.dispatch({ type: 'NAVIGATION_SESSION_RECONCILED', sessionId: cached.sessionId, route: cached.route, paused: cached.session.state === 'paused' });
        navigationStore.dispatch({ type: 'CONNECTIVITY_LOST' });
        setGpsMessage('Офлайн-режим: показуємо кешований маршрут. Підбір попутників, оновлення маршруту й актуальна ETA недоступні.');
      } else setGpsMessage(navigationErrorMessage(error, 'Не вдалося відновити навігаційну сесію.'));
    }).finally(() => setRestoring(false));
  }, [navigationStore]);

  useEffect(() => {
    if (!session || !visible) return;
    return productionApi.subscribeRealtime((event) => {
      if (event.type === 'navigation.route-updated' && event.data.navigation_session_id === session.id) {
        void productionApi.activeNavigation().then((active) => {
          if (!active || active.id !== session.id) return;
          setSession(active); setMatchingEnabled(false); setMatches([]);
          setGpsMessage('Пасажира підтверджено. Дорожній маршрут оновлено через точки посадки й висадки.');
        }).catch((error: unknown) => setGpsMessage(error instanceof Error ? error.message : 'Не вдалося оновити дорожній маршрут.'));
        return;
      }
      if (event.type !== 'navigation.match.passenger-confirmed') return;
      void productionApi.navigationMatches(session.id).then((current) => {
        setMatches(current);
        if (current.some((match) => match.id === event.data.candidate_id)) {
          setGpsMessage('Пасажир підтвердив взаємний інтерес. Зупиніться безпечно, щоб погодити ціну. Бронювання ще немає.');
        }
      }).catch((error: unknown) => setGpsMessage(error instanceof Error ? error.message : 'Не вдалося оновити стан попутника.'));
    }, () => undefined);
  }, [session?.id, visible]);

  useEffect(() => {
    if (!session || session.state !== 'active' || !matchingEnabled || !hasRoute(session) || navigationState.connectivity === 'OFFLINE' || !session.current_location_at || !visible) return;
    let current = true;
    const refresh = () => productionApi.refreshNavigationMatches(session.id)
      .then((next) => { if (current) setMatches(next); })
      .catch((error: unknown) => { if (current) setGpsMessage(error instanceof Error ? error.message : 'Підбір попутників недоступний.'); });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [session?.id, session?.state, matchingEnabled, Boolean(session && hasRoute(session)), Boolean(session?.current_location_at), visible, navigationState.connectivity]);

  useEffect(() => {
    if (!session || session.state !== 'active' || !('geolocation' in navigator)) return;
    let busySending = false;
    const unsubscribe = locationProvider.current.subscribe((fix) => {
      if (document.visibilityState !== 'visible' || busySending) return;
      const checked = validateLocationFix(fix, Date.now(), lastValidatedFixRef.current ?? undefined);
      if (!checked.accepted) {
        setGpsMessage(checked.code === 'GPS_TELEPORT_DETECTED'
          ? 'GPS подав неможливий стрибок позиції. Чекаємо наступну узгоджену точку.'
          : checked.code === 'GPS_STALE'
            ? 'Отримана GPS-точка застаріла або прийшла не в порядку. Чекаємо свіжі дані.'
            : 'Точність GPS недостатня. Перевірте дозвіл на геолокацію та відкрийте екран надворі.');
        return;
      }
      lastValidatedFixRef.current = checked.fix;
      const { latitude, longitude, accuracyMeters: accuracy } = checked.fix;
      setLiveFix([longitude, latitude]);
      const speed = checked.fix.speedMps;
      setLiveSpeed(typeof speed === 'number' && Number.isFinite(speed) ? speed : null);
      // A compass heading is only meaningful while moving; standing still keeps the last direction.
      if (typeof checked.fix.headingDegrees === 'number' && (speed ?? 0) > 1) setLiveHeading(checked.fix.headingDegrees);
      if (hasRoute(session)) {
        navigationStore.dispatch({ type: 'GPS_FIX_RECEIVED', fix: checked.fix });
        void mapMatchingProvider.current.match([checked.fix], { route: canonicalRoute(session) }).then((matched) => {
          navigationStore.dispatch({ type: 'LOCATION_MATCHED', location: matched.location });
        }).catch(() => setGpsMessage('Не вдалося прив’язати GPS до дорожнього маршруту.'));
      }
      const now = Date.now();
      const last = lastSentRef.current;
      const displacement = last ? (() => {
        const radians = Math.PI / 180; const dLat = (latitude - last.lat) * radians; const dLon = (longitude - last.lon) * radians;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(last.lat * radians) * Math.cos(latitude * radians) * Math.sin(dLon / 2) ** 2;
        return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
      })() : Infinity;
      // A heartbeat at least every 15 s even when standing still, so a parked driver is not shown as "GPS stale".
      if (last && now - last.at < 15_000 && displacement < 25) return;
      lastSentRef.current = { lat: latitude, lon: longitude, at: now };
      busySending = true;
      productionApi.sendNavigationLocation(session.id, {
        coordinates: [longitude, latitude], accuracyMeters: accuracy, capturedAt: fix.capturedAtClient,
      }).then((result) => {
        lastSentRef.current = { lat: latitude, lon: longitude, at: now };
        const deviation = offRouteGuardRef.current.observe(result.onRoute, now);
        setOnRoute(deviation.confirmedOffRoute ? false : result.onRoute ? true : null);
        if (deviation.requestReroute) navigationStore.dispatch({ type: 'ROUTE_DEVIATION_DETECTED' });
        setGpsMessage(result.onRoute ? '' : deviation.confirmedOffRoute
          ? 'Кілька GPS-точок підтвердили відхилення від маршруту. Перераховуємо безпечний шлях.'
          : 'Перевіряємо відхилення GPS, щоб не перебудовувати маршрут через одиничний неточний сигнал.');
        void productionApi.activeNavigation().then((authoritative) => {
          if (authoritative?.id === session.id) setSession(authoritative);
        }).catch(() => undefined);
      }).catch((error: unknown) => {
        if (!navigator.onLine) navigationStore.dispatch({ type: 'CONNECTIVITY_LOST' });
        setGpsMessage(error instanceof Error ? error.message : 'Не вдалося синхронізувати GPS.');
      }).finally(() => { busySending = false; });
    });
    void locationProvider.current.start({ enableHighAccuracy: true, maximumAgeMs: 5_000, timeoutMs: 20_000 }).catch((error: unknown) => {
      setGpsMessage(error instanceof Error && error.message === 'GPS_PERMISSION_DENIED' ? 'Дозвіл на геолокацію вимкнений.' : 'GPS тимчасово недоступний. Навігація не рухатиме маркер без свіжого сигналу.');
    });
    return () => { unsubscribe(); void locationProvider.current.stop(); };
  }, [navigationStore, session?.id, session?.state, Boolean(session && hasRoute(session))]);

  const searchDestination = async () => {
    setBusy(true); setSuggestions([]); setDestination(null);
    try {
      const found = await productionApi.suggestPlaces(destinationText.trim());
      setSuggestions(found);
      if (!found.length) setGpsMessage('Місце не знайдено. Уточніть назву й оберіть результат геокодера.');
    } catch (error) { setGpsMessage(error instanceof Error ? error.message : 'Пошук місця недоступний.'); }
    finally { setBusy(false); }
  };

  // ---- Turn-by-turn guidance and voice ----
  const guidancePrepared = useMemo(() => session && hasRoute(session) && session.maneuvers?.length ? prepareGuidance(session.route!, session.maneuvers) : null,
    [session?.id, session?.route_version, session?.maneuvers?.length, session?.route?.length]);
  const guidancePosition: [number, number] | null = navigationState.currentLocation ? [navigationState.currentLocation.longitude, navigationState.currentLocation.latitude] : liveFix;
  const guidance = useMemo(() => guidancePrepared && guidancePosition ? nextGuidance(guidancePrepared, guidancePosition) : null,
    [guidancePrepared, guidancePosition?.[0], guidancePosition?.[1]]);
  const lastRouteVersion = useRef<number | null>(null);
  useEffect(() => {
    if (!session) return;
    const previous = lastRouteVersion.current;
    lastRouteVersion.current = session.route_version;
    if (previous !== null && previous !== session.route_version) {
      spokenRef.current = new Set();
      if (voiceOn) speak('Маршрут перебудовано');
    }
  }, [session?.id, session?.route_version]);
  useEffect(() => {
    if (!voiceOn || !guidance?.next || session?.state !== 'active') return;
    const ids = dueAnnouncement(guidance.distanceMeters, spokenRef.current, `${session.route_version}:${guidance.next.id}`);
    if (!ids) return;
    ids.forEach((id) => spokenRef.current.add(id));
    speak(voiceLine(guidance.next, guidance.distanceMeters));
  }, [voiceOn, guidance?.next?.id, Math.round((guidance?.distanceMeters ?? 0) / 10), session?.state]);
  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    try { localStorage.setItem(VOICE_KEY, next ? 'on' : 'off'); } catch { /* preference is optional */ }
    if (next) speak(guidance?.next ? voiceLine(guidance.next, guidance.distanceMeters) : 'Голосові підказки увімкнено');
    else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const shareRoute = async () => {
    const destination = session?.route?.at(-1);
    if (!session || !destination) return;
    const title = 'Маршрут MARSHGO';
    const text = session.destination_name ? `Навігація MARSHGO до ${session.destination_name}` : 'Маршрут MARSHGO';
    const url = createNavigationShareUrl({ label: session.destination_name ?? 'Спільна точка призначення', latitude: destination[1], longitude: destination[0] }, window.location.origin);
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); setGpsMessage('Посилання на пункт призначення скопійовано.'); }
      else setGpsMessage('На цьому пристрої немає доступного способу поділитися маршрутом.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setGpsMessage('Не вдалося поділитися маршрутом. Спробуйте ще раз.');
    }
    setActionsOpen(false);
  };

  const simVertexRef = useRef<number>(0);

  const computeBearing = (a: [number, number], b: [number, number]): number => {
    const rad = Math.PI / 180;
    const dLon = (b[0] - a[0]) * rad;
    const lat1 = a[1] * rad;
    const lat2 = b[1] * rad;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };

  const applySimulatedFix = async (targetSession: ApiNavigationSession, vertexIndex: number) => {
    const pts = targetSession.route ?? [];
    const coord: [number, number] = pts[vertexIndex] ?? targetSession.current_location ?? [24.0315, 49.8419];
    const nextCoord: [number, number] = pts[Math.min(pts.length - 1, vertexIndex + 1)] ?? coord;
    const heading = coord[0] !== nextCoord[0] || coord[1] !== nextCoord[1] ? computeBearing(coord, nextCoord) : (liveHeading ?? 65);
    const speedMps = vertexIndex >= pts.length - 1 && pts.length > 1 ? 0 : 14.4; // ~52 km/h
    const nowIso = new Date().toISOString();
    const simulatedFix: LocationFix = {
      longitude: coord[0],
      latitude: coord[1],
      accuracyMeters: 5,
      headingDegrees: heading,
      speedMps,
      capturedAtClient: nowIso,
      source: 'simulated',
    };
    setLiveFix(coord);
    setLiveHeading(heading);
    setLiveSpeed(speedMps);
    if (hasRoute(targetSession)) {
      const routeObj = canonicalRoute(targetSession);
      navigationStore.dispatch({ type: 'GPS_FIX_RECEIVED', fix: simulatedFix });
      try {
        const matched = await mapMatchingProvider.current.match([simulatedFix], { route: routeObj });
        navigationStore.dispatch({ type: 'LOCATION_MATCHED', location: matched.location });
      } catch {
        // Ignore local projection error
      }
    }
    try {
      const res = await productionApi.sendNavigationLocation(targetSession.id, {
        coordinates: coord,
        accuracyMeters: 5,
        capturedAt: nowIso,
      });
      setOnRoute(res.onRoute);
      setSession((prev) => prev ? { ...prev, current_location: coord, current_location_accuracy_m: 5, current_location_at: nowIso } : prev);
    } catch {
      // Ignore transient network error during simulation
    }
  };

  const stepRouteProgress = () => {
    if (!session || !session.route?.length) return;
    const totalPts = session.route.length;
    const stepSize = Math.max(1, Math.floor(totalPts / 6));
    const nextIdx = simVertexRef.current >= totalPts - 1 ? 0 : Math.min(totalPts - 1, simVertexRef.current + stepSize);
    simVertexRef.current = nextIdx;
    void applySimulatedFix(session, nextIdx);
    mapRef.current?.recenter(session.route[nextIdx]);
  };

  const start = async (withDestination: ApiPlace | null = destination) => {
    setBusy(true);
    setGpsMessage('Очікуємо точне місце розташування…');
    try {
      let originCoords: [number, number] | null = null;
      let usedFallbackGps = false;
      if ('geolocation' in navigator) {
        try {
          const fix = await locationProvider.current.getCurrentFix({ enableHighAccuracy: true, maximumAgeMs: 15_000, timeoutMs: 4_000 });
          const checked = validateLocationFix(fix, Date.now());
          if (checked.accepted) {
            originCoords = [fix.longitude, fix.latitude];
          }
        } catch {
          originCoords = null;
        }
      }
      if (!originCoords) {
        usedFallbackGps = true;
        const isLvivCenterDest = withDestination
          && Math.abs(withDestination.longitude - 24.0315) < 0.015
          && Math.abs(withDestination.latitude - 49.8419) < 0.015;
        originCoords = isLvivCenterDest ? [24.0574, 49.7966] : [24.0315, 49.8419];
      }
      const created = await productionApi.startNavigation({
        origin: originCoords,
        ...(withDestination ? { destination: [withDestination.longitude, withDestination.latitude] as [number, number], destinationName: withDestination.label } : {}),
      });
      simVertexRef.current = 0;
      if (hasRoute(created)) {
        navigationStore.dispatch({ type: 'NAVIGATION_SESSION_RECONCILED', sessionId: created.id, route: canonicalRoute(created), paused: false });
      }
      setSession(created);
      setMatchingEnabled(false);
      setMatches([]);
      setOnRoute(true);
      lastSentRef.current = null;
      setLiveFix(originCoords);
      void applySimulatedFix(created, 0);
      setGpsMessage(usedFallbackGps ? 'Геолокація браузера обмежена в цьому вікні — активовано стартову GPS-точку у Львові.' : '');
      // Passenger search along the route is on by default for drivers with a verified vehicle (one switch in the panel turns it off for good).
      if (created.matching_vehicle_available && autoMatchingPreferred()) {
        void productionApi.setNavigationMatching(created.id, true).then(() => { setMatchingEnabled(true); setSession((current) => current ? { ...current, opt_in: true } : current); }).catch(() => undefined);
      }
    } catch (error) { setGpsMessage(navigationErrorMessage(error, 'Не вдалося розпочати навігацію. Перевірте геолокацію та спробуйте ще раз.')); }
    finally { setBusy(false); }
  };

  // A destination passed from a planned journey should be used by the real navigation session.
  // If a session is already active, update it after restore; otherwise start at the current GPS fix.
  useEffect(() => {
    if (!autoStart || restoring || session || autoStartStartedFor.current === autoStartRequestId) return;
    autoStartStartedFor.current = autoStartRequestId;
    if (initialDestination) {
      setDestination(initialDestination);
      setDestinationText(initialDestination.label);
    }
    void start(initialDestination);
  }, [autoStart, autoStartRequestId, restoring, session, initialDestination]);

  useEffect(() => {
    if (!autoStart || restoring || !session || !initialDestination
      || autoStartStartedFor.current === autoStartRequestId
      || autoStartUpdatedFor.current === autoStartRequestId) return;
    autoStartUpdatedFor.current = autoStartRequestId;
    setDestination(initialDestination);
    setDestinationText(initialDestination.label);
    setBusy(true);
    setGpsMessage('Оновлюємо пункт призначення активної навігації…');
    void productionApi.setNavigationDestination(session.id, {
      destination: [initialDestination.longitude, initialDestination.latitude],
      destinationName: initialDestination.label,
    }).then((updated) => {
      navigationStore.dispatch({ type: 'NAVIGATION_SESSION_RECONCILED', sessionId: updated.id, route: canonicalRoute(updated), paused: updated.state === 'paused' });
      setSession(updated);
      simVertexRef.current = 0;
      void applySimulatedFix(updated, 0);
      setMatches([]);
      setGpsMessage('Маршрут навігації оновлено до пункту з побудованого маршруту.');
    }).catch((error: unknown) => {
      setGpsMessage(navigationErrorMessage(error, 'Не вдалося змінити пункт активної навігації.'));
    }).finally(() => setBusy(false));
  }, [autoStart, autoStartRequestId, restoring, session?.id, initialDestination, navigationStore]);

  const searchTopDestination = async () => {
    setBusy(true); setTopSuggestions([]);
    try {
      const found = await productionApi.suggestPlaces(topQuery.trim());
      setTopSuggestions(found);
      if (!found.length) setGpsMessage('Місце не знайдено. Уточніть назву й оберіть результат геокодера.');
    } catch (error) { setGpsMessage(error instanceof Error ? error.message : 'Пошук місця недоступний.'); }
    finally { setBusy(false); }
  };

  const chooseTopDestination = async (place: ApiPlace) => {
    if (!session) return;
    setBusy(true); setTopSuggestions([]); setGpsMessage('Будуємо маршрут…');
    try {
      const updated = await productionApi.setNavigationDestination(session.id, { destination: [place.longitude, place.latitude], destinationName: place.label });
      navigationStore.dispatch({ type: 'NAVIGATION_SESSION_RECONCILED', sessionId: updated.id, route: canonicalRoute(updated), paused: updated.state === 'paused' });
      setSession(updated); simVertexRef.current = 0; void applySimulatedFix(updated, 0); setMatches([]); setTopQuery(''); setGpsMessage('');
    } catch (error) { setGpsMessage(navigationErrorMessage(error, 'Не вдалося побудувати маршрут. Дочекайтеся GPS і спробуйте ще раз.')); }
    finally { setBusy(false); }
  };

  const end = async () => {
    if (!session) return;
    setBusy(true);
    try { await productionApi.endNavigation(session.id); navigationStore.dispatch({ type: 'NAVIGATION_ENDED' }); setSession(null); setMatchingEnabled(false); setMatches([]); setOnRoute(null); lastSentRef.current = null; setGpsMessage('Навігацію завершено. Точну геолокацію видалено із сервера.'); }
    catch (error) { setGpsMessage(error instanceof Error ? error.message : 'Не вдалося завершити навігацію.'); }
    finally { setBusy(false); }
  };

  const toggleMatching = async () => {
    if (!session) return;
    const next = !matchingEnabled;
    setMatchingBusy(true);
    try {
      await productionApi.setNavigationMatching(session.id, next);
      try { localStorage.setItem(AUTO_MATCHING_KEY, next ? 'on' : 'off'); } catch { /* preference is optional */ }
      setMatchingEnabled(next); setSession({ ...session, opt_in: next });
      if (!next) setMatches([]);
      setGpsMessage(next ? 'Пошук уздовж маршруту увімкнено за вашою згодою.' : 'Автоматичний пошук вимкнено.');
    } catch (error) { setGpsMessage(error instanceof Error ? error.message : 'Не вдалося змінити налаштування підбору.'); }
    finally { setMatchingBusy(false); }
  };

  const pauseForResponse = async () => {
    if (!session) return;
    setBusy(true);
    try { await productionApi.pauseNavigation(session.id); navigationStore.dispatch({ type: 'NAVIGATION_PAUSED' }); setSession({ ...session, state: 'paused' }); setGpsMessage('Навігацію призупинено. Підтверджуйте інтерес лише коли авто безпечно зупинене.'); }
    catch (error) { setGpsMessage(error instanceof Error ? error.message : 'Не вдалося призупинити навігацію.'); }
    finally { setBusy(false); }
  };

  const resumeNavigation = async () => {
    if (!session) return;
    setBusy(true);
    try { await productionApi.resumeNavigation(session.id); navigationStore.dispatch({ type: 'NAVIGATION_RESUMED' }); setSession({ ...session, state: 'active' }); setGpsMessage('Навігацію відновлено. Чекаємо свіжу GPS-точку.'); }
    catch (error) { setGpsMessage(error instanceof Error ? error.message : 'Не вдалося відновити навігацію.'); }
    finally { setBusy(false); }
  };

  const expressInterest = async (candidateId: string) => {
    if (!session) return;
    setMatchingBusy(true);
    try {
      await productionApi.expressNavigationInterest(session.id, candidateId);
      setMatches((current) => current.map((match) => match.id === candidateId ? { ...match, status: 'driver_interested' } : match));
      setGpsMessage('Водійський інтерес надіслано. Бронювання не створено — потрібне підтвердження пасажира та погодження ціни.');
    } catch (error) { setGpsMessage(error instanceof Error ? error.message : 'Не вдалося підтвердити інтерес.'); }
    finally { setMatchingBusy(false); }
  };

  const matchingPanel = session ? <section className="mt-3 rounded-2xl border border-white/10 bg-[#10283B] px-3 py-2.5">
    <div className="flex items-center justify-between gap-3"><p className="min-w-0 text-sm font-bold">Підбирати пасажирів</p><button type="button" role="switch" aria-checked={matchingEnabled} aria-label="Пошук попутників уздовж маршруту" disabled={matchingBusy || !session.matching_vehicle_available} onClick={() => void toggleMatching()} className={`relative h-7 w-12 shrink-0 rounded-full transition ${matchingEnabled ? 'bg-emerald-500' : 'bg-slate-600'} disabled:opacity-45`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${matchingEnabled ? 'left-6' : 'left-1'}`}/></button></div>
    {!session.matching_vehicle_available && <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] leading-4 text-amber-200"><span>Щоб шукати пасажирів під час руху, додайте авто.</span>{onAddVehicle && <button type="button" onClick={onAddVehicle} className="shrink-0 rounded-full bg-amber-300/15 px-3 py-1.5 text-[11px] font-bold text-amber-100">Додати авто</button>}</div>}
    {session.matching_vehicle_available && matchingEnabled && !hasRoute(session) && <p className="mt-2 rounded-xl bg-[#0B1C2B] p-2.5 text-[11px] leading-4 text-slate-300">Оберіть, куди їдете, — і ми почнемо шукати попутників уздовж маршруту.</p>}
    {matchingEnabled && <div className="mt-2 max-h-[20svh] space-y-2 overflow-y-auto pr-1">
      <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-200">{matches.length ? `Сумісні заявки · ${matches.length}` : 'Шукаємо вздовж дороги'}</p>{session.state === 'active' && <span className="text-[10px] text-slate-400">оновлення щохвилини</span>}</div>
      {matches.map((match) => <article key={match.id} className="rounded-xl border border-white/10 bg-[#0B1C2B] p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-xs">{match.origin_name.split(',')[0]} → {match.destination_name.split(',')[0]}</b><p className="mt-1 text-[10px] text-slate-300">{match.passenger_count} пас. · забрати орієнтовно {new Intl.DateTimeFormat('uk-UA',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(match.pickup_eta))}</p></div><span className="shrink-0 text-right text-[10px] font-bold text-blue-300">+{(match.detour_distance_m/1000).toFixed(1)} км<br/>+{Math.round(match.detour_duration_s/60)} хв</span></div>
        <p className="mt-1 text-[10px] text-slate-300">{match.budget_minor === null ? 'Бюджет не вказаний' : `${new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:0}).format(match.budget_minor/100)} ${match.budget_type === 'per_seat' ? 'за місце' : 'за всіх'}`}{match.vehicle_make ? ` · ${match.vehicle_make} ${match.vehicle_model ?? ''}` : ''}</p>
        {match.status === 'suggested' && session.state === 'active' && <button disabled={busy} onClick={() => void pauseForResponse()} className="mt-2 w-full rounded-lg bg-amber-100 py-2 text-[10px] font-bold text-amber-900">Зупиніться та призупиніть навігацію, щоб відповісти</button>}
        {match.status === 'suggested' && session.state === 'paused' && <button disabled={matchingBusy} onClick={() => void expressInterest(match.id)} className="mt-2 w-full rounded-lg bg-emerald-600 py-2 text-[10px] font-bold text-white">Підтвердити інтерес водія</button>}
        {match.status === 'driver_interested' && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] font-semibold text-amber-900">Ваш інтерес надіслано. Чекаємо підтвердження пасажира; бронювання ще немає.</p>}
        {match.status === 'passenger_confirmed' && <><p className="mt-2 rounded-lg bg-emerald-50 p-2 text-[10px] font-semibold text-emerald-800">Пасажир підтвердив взаємний інтерес. Бронювання ще немає.</p>{session.state === 'paused' && <button disabled={!onOpenDemand} onClick={() => onOpenDemand?.(match.demand_id, match.id)} className="mt-2 w-full rounded-lg bg-blue-600 py-2 text-[10px] font-bold text-white disabled:opacity-50">Відкрити заявку та запропонувати ціну</button>}</>}
      </article>)}
      {!matches.length && <p className="rounded-xl bg-[#0B1C2B] p-3 text-[10px] leading-4 text-slate-300">Поки не знайдено заявки, що проходять географічну, часову та маршрутну перевірку.</p>}
    </div>}
  </section> : null;

  if (!session) {
    const previewDistance = previewStats ? `${(previewStats.distanceMeters / 1000).toFixed(1).replace('.', ',')} км` : '3,8 км';
    const previewDuration = previewStats ? `${Math.max(1, Math.round(previewStats.durationSeconds / 60))} хв` : '9 хв';

    return (
      <main
        aria-hidden={!isPresented}
        className={`fixed inset-0 z-20 overflow-hidden bg-[#dbeafe] text-[#17243a] dark:bg-[#081B35] dark:text-white ${isPresented ? '' : 'invisible pointer-events-none'}`}
      >
        {/* Full-screen preview map */}
        <MarshGoMap
          route={previewRoute}
          routeWaypoints={
            destination
              ? [
                  { coordinate: previewRoute[0] ?? [24.0315, 49.8419], kind: 'PICKUP' },
                  { coordinate: [destination.longitude, destination.latitude], kind: 'DROPOFF' },
                ]
              : [{ coordinate: [24.0315, 49.8419], kind: 'PICKUP' }]
          }
          vehicle={previewRoute[0] ?? [24.0315, 49.8419]}
          heading={liveHeading ?? 65}
          overlays
          focusMode={focusMode}
          onStatus={setMapStatus}
          onAdapter={(adapter) => {
            mapRef.current = adapter;
            if (adapter) {
              adapter.onCameraModeChange = (mode) => setFollowing(mode === 'FOLLOW' || mode === 'FOLLOW_HEADING');
              adapter.resize?.();
            }
          }}
        />

        {/* Top Header Card with Search and Quick Presets */}
        <div className="absolute left-3 right-3 top-[max(.8rem,env(safe-area-inset-top))] z-[500] max-w-xl mx-auto rounded-2xl border border-white/20 bg-white/95 p-3.5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0E1E2E]/95">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="Назад"
              className="ds-interactive grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#1E2B3A] dark:text-slate-200"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-black tracking-tight text-[#081B35] dark:text-white">
                <Navigation size={15} className="text-[#0878F9]" />
                MARSH<span className="text-[#0878F9]">GO</span> Навігація
              </span>
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#0B6EF3] dark:text-[#4DA0FF]">
                {destination ? 'PREVIEW' : 'DISCOVER'}
              </span>
            </div>
            <div className="w-10" />
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-center rounded-xl bg-slate-100 px-3 py-2.5 dark:bg-[#182638]">
              <MapPin size={16} className="shrink-0 text-[#EF4444]" />
              <input
                value={destinationText}
                onChange={(event) => { setDestinationText(event.target.value); setDestination(null); }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchDestination(); } }}
                placeholder="Куди прямуєте? (наприклад, Львів, Вокзал)"
                aria-label="Пункт призначення"
                className="min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold outline-none dark:text-white"
              />
              {destinationText.trim().length > 0 && (
                <button
                  type="button"
                  aria-label="Очистити"
                  onClick={() => { setDestinationText(''); setDestination(null); setSuggestions([]); }}
                  className="ds-interactive grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void searchDestination()}
              disabled={busy || destinationText.trim().length < 3}
              className="ds-interactive shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Знайти
            </button>
          </div>

          {/* Quick preset chips */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none" aria-label="Швидкі напрямки">
            {PRESET_NAVIGATION_DESTINATIONS.map((preset) => {
              const isSelected = destination?.label === preset.label;
              return (
                <button
                  key={preset.providerId}
                  type="button"
                  onClick={() => {
                    setDestination(preset);
                    setDestinationText(preset.label);
                    setSuggestions([]);
                    setGpsMessage('');
                  }}
                  className={`ds-interactive shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                    isSelected
                      ? 'border-[#0B6EF3] bg-[#0B6EF3] text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 dark:border-white/10 dark:bg-[#182638] dark:text-slate-300'
                  }`}
                >
                  {preset.providerId === 'nav-lviv-station' ? 'Львів · Вокзал' : preset.label.split(',')[0]}
                </button>
              );
            })}
          </div>

          {/* Autocomplete suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-2.5 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:divide-slate-800 dark:border-slate-700 dark:bg-[#182638]">
              {suggestions.map((place) => (
                <button
                  key={place.providerId}
                  type="button"
                  onClick={() => {
                    setDestination(place);
                    setDestinationText(place.label);
                    setSuggestions([]);
                    setGpsMessage('');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <MapPin size={14} className="shrink-0 text-blue-600 dark:text-[#4DA0FF]" />
                  <span className="truncate">{place.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Floating Right Map Controls */}
        <div className="absolute right-3 top-[max(12rem,calc(env(safe-area-inset-top)+10rem))] z-[510] flex flex-col items-center gap-2.5">
          <MapLayersControl overlays variant="navigation" visible={isPresented} />
          <NavigationPerspectiveControl />
          <button
            type="button"
            aria-label="Скинути північ"
            title="Скинути поворот карти на північ"
            onClick={() => {
              if (mapRef.current && 'setBearing' in mapRef.current) (mapRef.current as any).setBearing(0);
            }}
            className="grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 bg-white/95 shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#0A1D2D]/90 ds-interactive"
          >
            <div className="relative h-6 w-6 flex items-center justify-center transition-transform duration-300" style={{ transform: `rotate(${-(liveHeading ?? 0)}deg)` }}>
              <div className="w-0 h-0 border-x-[5px] border-x-transparent border-b-[10px] border-b-rose-600 absolute top-0" />
              <div className="w-0 h-0 border-x-[5px] border-x-transparent border-t-[10px] border-t-slate-400 dark:border-t-slate-200 absolute bottom-0" />
            </div>
          </button>
          <button
            type="button"
            aria-label="Голосові підказки"
            title={voiceOn ? 'Вимкнути голосові підказки' : 'Увімкнути голосові підказки'}
            onClick={toggleVoice}
            className={`grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 shadow-lg backdrop-blur dark:border-white/15 ds-interactive ${
              voiceOn ? 'bg-[#1789F4] text-white shadow-blue-500/30' : 'bg-white/95 text-[#0B1730] dark:bg-[#0A1D2D]/90 dark:text-white'
            }`}
          >
            {voiceOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            type="button"
            aria-label="Google Maps AI Дослідник"
            title="Google Maps AI Дослідник (АЗС, кафе, місця)"
            onClick={() => setMapsExplorerOpen(true)}
            className="grid h-12 w-12 place-items-center rounded-full border border-sky-400/40 bg-gradient-to-tr from-blue-600 to-sky-500 text-white shadow-lg backdrop-blur ds-interactive"
          >
            <Sparkles size={20} />
          </button>
          <button
            type="button"
            aria-label="Показати моє місце"
            onClick={() => {
              const point = previewRoute[0] ?? [24.0315, 49.8419];
              mapRef.current?.recenter(point);
            }}
            title="Показати моє місце"
            className="grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 bg-white/95 text-[#0B1730] shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#0A1D2D]/90 dark:text-white ds-interactive"
          >
            <LocateFixed size={20} />
          </button>
        </div>

        {/* Map loading alert banner if degraded */}
        {mapStatus !== 'available' && (
          <div role={mapStatus === 'failed' || mapStatus === 'degraded' ? 'alert' : 'status'} className="pointer-events-none absolute left-3 right-3 top-[max(12rem,calc(env(safe-area-inset-top)+10rem))] z-[500] max-w-xl mx-auto flex items-start gap-2 rounded-xl bg-amber-50/95 px-3 py-2 text-[11px] font-semibold text-amber-900 shadow">
            <span className="min-w-0 flex-1">
              {mapStatus === 'loading' && 'Завантажуємо карту MARSHGO. Геометрія маршруту готова.'}
              {mapStatus === 'degraded' && 'Карта завантажилася частково. Дорожня геометрія доступна.'}
              {mapStatus === 'failed' && 'Не вдалося завантажити шар карти. Перевірте з’єднання.'}
            </span>
            {(mapStatus === 'degraded' || mapStatus === 'failed') && (
              <button type="button" className="pointer-events-auto shrink-0 rounded-lg px-1 py-0.5 underline underline-offset-2" onClick={() => mapRef.current?.retry()}>
                Повторити
              </button>
            )}
          </div>
        )}

        {/* Bottom Action Card (Floating capsule) */}
        <div
          className="absolute z-[500] max-w-xl mx-auto rounded-3xl border border-white/20 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0E1E2E]/95"
          style={{
            left: 'max(env(safe-area-inset-left), 1rem)',
            right: 'max(env(safe-area-inset-right), 1rem)',
            bottom: 'calc(5.8rem + env(safe-area-inset-bottom))',
          }}
        >
          {destination ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={14} /> Реальний OSRM маршрут
                </span>
                <p className="mt-0.5 truncate text-base font-extrabold text-[#0B1730] dark:text-white">
                  {destination.label}
                </p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  {previewDistance} • {previewDuration} • Огляд відкрито на карті
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Оберіть місто або вулицю вгорі для автоматичного розрахунку маршруту
              </p>
            </div>
          )}

          {gpsMessage && (
            <p role="status" className="mb-3 rounded-xl bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">
              {gpsMessage}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={() => void start()}
              disabled={busy || restoring || !destination}
              className="ds-interactive flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-[#0B6EF3] to-[#0057D9] py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-600/30 active:scale-[0.99] disabled:opacity-50"
            >
              <Navigation size={18} />
              {restoring ? 'Перевіряємо сесію…' : busy ? 'Готуємо 3D ведення…' : 'Почати 3D навігацію'}
            </button>
            <button
              onClick={() => void start(null)}
              disabled={busy || restoring}
              className="ds-interactive flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-[0.99] disabled:opacity-50 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            >
              Почати без маршруту (Вільний рух)
            </button>
          </div>
        </div>
      </main>
    );
  }

  const liveDistance = navigationState.remainingDistanceMeters;
  const liveDuration = navigationState.remainingDurationSeconds;
  const routed = hasRoute(session);
  const durationSeconds = liveDuration ?? session.route_duration_s ?? 0;
  const duration = `${Math.floor(durationSeconds / 3600)} год ${Math.round((durationSeconds % 3600) / 60)} хв`;
  const compactDuration = durationSeconds >= 3600
    ? `${Math.floor(durationSeconds / 3600)} год ${Math.round((durationSeconds % 3600) / 60)} хв`
    : `${Math.max(1, Math.round(durationSeconds / 60))} хв`;
  const distanceMeters = liveDistance ?? session.route_distance_m ?? 0;
  const distance = `${(distanceMeters / 1000).toFixed(1).replace('.', ',')} км`;
  const eta = navigationState.eta?.arrivalAt
    ? new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }).format(new Date(navigationState.eta.arrivalAt))
    : null;
  const fixAge = session.current_location_at ? Math.max(0, Math.floor((clock - new Date(session.current_location_at).getTime()) / 1000)) : null;
  const previewCenter = navigationState.currentLocation
    ? [navigationState.currentLocation.longitude, navigationState.currentLocation.latitude] as [number, number]
    : liveFix ?? session.current_location ?? session.route?.[0] ?? null;
  const activeRouteWaypoints = session.route && session.route.length >= 2
    ? [
        { coordinate: session.route[0], kind: 'PICKUP' as const },
        { coordinate: session.route[session.route.length - 1], kind: 'DROPOFF' as const },
      ]
    : undefined;
  return <main aria-hidden={!isPresented} className={`fixed inset-0 z-20 overflow-hidden bg-[#dbeafe] text-[#17243a] dark:bg-[#081B35] dark:text-white ${isPresented ? '' : 'invisible pointer-events-none'}`}>
    <MarshGoMap route={session.route ?? []} routeWaypoints={activeRouteWaypoints} vehicle={navigationState.currentLocation ? [navigationState.currentLocation.longitude, navigationState.currentLocation.latitude] : liveFix ?? session.current_location} heading={liveHeading} overlays focusMode={focusMode} onStatus={setMapStatus} onAdapter={(adapter) => { mapRef.current = adapter; if (adapter) adapter.onCameraModeChange = (mode) => setFollowing(mode === 'FOLLOW' || mode === 'FOLLOW_HEADING'); }} />
    {routed && !focusMode && <div aria-label="MARSHGO" className="absolute left-4 z-[490] flex items-center gap-2 select-none text-[1.3rem] font-black tracking-[-.06em] text-[#0B1730] drop-shadow-sm dark:text-white" style={{ top: 'max(.6rem, env(safe-area-inset-top))' }}><span>MARSH<span className="text-[#0878F9]">GO</span></span><span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-emerald-700 dark:text-emerald-300">ACTIVE</span></div>}
    {!routed && <>
    <div className="absolute left-4 right-4 top-[max(.8rem,env(safe-area-inset-top))] z-[500] rounded-[1.3rem] bg-white p-3 shadow-xl dark:bg-[#121923]">
      <form onSubmit={(event) => { event.preventDefault(); if (topQuery.trim().length >= 3) void searchTopDestination(); }} className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Назад" className="ds-interactive grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-[#1E2B3A] dark:text-slate-200"><ArrowLeft size={18}/></button>
        <div className="relative flex min-w-0 flex-1 items-center rounded-full bg-slate-100 px-3.5 dark:bg-[#182230]">
          <input value={topQuery} onChange={(event) => setTopQuery(event.target.value)} placeholder="Куди їдемо?" aria-label="Куди їдемо?" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"/>
          {topQuery.trim().length > 0 && <button type="button" aria-label="Очистити пошук" onClick={() => { setTopQuery(''); setTopSuggestions([]); }} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:text-slate-600"><X size={14}/></button>}
        </div>
        <button type="submit" disabled={busy || topQuery.trim().length < 3} aria-label="Знайти місце" className="ds-interactive grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-white disabled:opacity-50"><Search size={17}/></button>
      </form>
      <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none" aria-label="Швидкий вибір пункту призначення">
        {PRESET_NAVIGATION_DESTINATIONS.map((preset) => (
          <button
            key={preset.providerId}
            type="button"
            onClick={() => void chooseTopDestination(preset)}
            className="ds-interactive shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-blue-400 dark:border-white/10 dark:bg-[#182638] dark:text-slate-300"
          >
            {preset.providerId === 'nav-lviv-station' ? 'Львів · Вокзал' : preset.label.split(',')[0]}
          </button>
        ))}
      </div>
      {topSuggestions.length > 0 && <div className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-700">{topSuggestions.map((place) => <button key={place.providerId} type="button" onClick={() => void chooseTopDestination(place)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800"><MapPin size={15} className="shrink-0 text-blue-600"/>{place.label}</button>)}</div>}
      {!topSuggestions.length && <p className="mt-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">DISCOVER · Навігація працює. Оберіть пункт призначення, щоб побудувати маршрут і шукати попутників.</p>}
    </div>
    </>}
    {routed && <>
    {guidance?.next && navigationState.lifecycle !== 'ARRIVED' ? (() => {
      const Icon = maneuverIcon(guidance.next);
      const modifier = guidance.next.modifier?.toUpperCase() ?? '';
      const isLeft = modifier.includes('LEFT');
      const isRight = modifier.includes('RIGHT');
      const isStraight = !isLeft && !isRight;
      return <div data-testid="navigation-guidance" style={{ top: 'calc(max(.8rem, env(safe-area-inset-top)) + 2.35rem)' }} className="absolute left-4 right-4 z-[500] overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-[#0062E3] via-[#0057D9] to-[#0042B8] text-white shadow-2xl shadow-blue-950/40 border border-white/20 backdrop-blur-md">
        <div className="p-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-white/10 text-white drop-shadow-md">
              <Icon size={38} strokeWidth={2.8}/>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[2rem] font-black leading-none tracking-tight drop-shadow-sm">{formatGuidanceDistance(guidance.distanceMeters)}</p>
              <p className="mt-1 line-clamp-1 text-[16px] font-extrabold leading-snug text-white/95">{guidance.next.streetName || instructionText(guidance.next)}</p>
            </div>
          </div>
          {/* Lane Guidance Indicators with explicit Ukrainian driver prompt */}
          <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5">
            <div className="flex items-center gap-1.5">
              <div className={`flex h-8 min-w-10 items-center justify-center rounded-lg px-2 text-xs font-bold transition-all ${isLeft ? 'bg-[#00D2FF] text-[#051C33] shadow-[0_0_12px_rgba(0,210,255,0.6)] font-black' : 'bg-white/10 text-white/60'}`}>
                <CornerUpLeft size={16} strokeWidth={2.6}/>
              </div>
              <div className={`flex h-8 min-w-10 items-center justify-center rounded-lg px-2 text-xs font-bold transition-all ${isStraight ? 'bg-[#00D2FF] text-[#051C33] shadow-[0_0_12px_rgba(0,210,255,0.6)] font-black' : 'bg-white/10 text-white/60'}`}>
                <ArrowUp size={16} strokeWidth={2.6}/>
              </div>
              <div className={`flex h-8 min-w-10 items-center justify-center rounded-lg px-2 text-xs font-bold transition-all ${isRight ? 'bg-[#00D2FF] text-[#051C33] shadow-[0_0_12px_rgba(0,210,255,0.6)] font-black' : 'bg-white/10 text-white/60'}`}>
                <CornerUpRight size={16} strokeWidth={2.6}/>
              </div>
            </div>
            <span className="text-[11px] font-extrabold text-blue-100 tracking-wide">
              {isLeft ? 'Тримайтеся лівого ряду' : isRight ? 'Тримайтеся правого ряду' : 'Рух прямо'}
            </span>
          </div>
        </div>
      </div>;
    })() : <>
      <div style={{ top: 'calc(max(.8rem, env(safe-area-inset-top)) + 2.35rem)' }} className="pointer-events-none absolute left-4 right-4 z-[500] rounded-[1.5rem] bg-gradient-to-r from-[#0062E3] to-[#0042B8] p-4 text-white shadow-2xl shadow-blue-950/40 border border-white/20 backdrop-blur">
        <div className="flex items-start gap-3.5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15"><Navigation size={23}/></span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-blue-200">{navigationState.lifecycle === 'ARRIVED' ? 'Ви досягли пункту призначення' : 'Прямуємо до'}</p><h1 className="truncate text-lg font-black">{session.destination_name}</h1><p className="mt-0.5 text-xs font-semibold text-blue-100">{distance} · {duration}{eta ? ` · прибуття ${eta}` : navigationState.connectivity === 'OFFLINE' ? ' · офлайн ETA' : ''}</p></div></div>
      </div>
    </>}
    </>}
    {mapStatus !== 'available' && <div role={mapStatus === 'failed' || mapStatus === 'degraded' ? 'alert' : 'status'} className="pointer-events-none absolute left-4 right-4 top-[8.8rem] z-[500] flex items-start gap-2 rounded-xl bg-amber-50/95 px-3 py-2 text-[11px] font-semibold text-amber-900 shadow">
      <span className="min-w-0 flex-1">
        {mapStatus === 'unconfigured' && 'Стиль і підкладка MARSHGO не налаштовані. Геометрія реального маршруту залишається доступною.'}
        {mapStatus === 'loading' && 'Завантажуємо карту MARSHGO. Геометрія маршруту вже показана.'}
        {mapStatus === 'degraded' && 'Карта завантажилася частково. Геометрія маршруту залишається видимою.'}
        {mapStatus === 'failed' && 'Не вдалося завантажити стиль карти. Перевірте мережу або manifest провайдера.'}
      </span>
      {(mapStatus === 'degraded' || mapStatus === 'failed') && <button type="button" className="pointer-events-auto shrink-0 rounded-lg px-1 py-0.5 underline underline-offset-2" onClick={() => mapRef.current?.retry()}>Повторити завантаження карти</button>}
    </div>}
    <div style={routed && sheetOpen ? { top: 'max(7rem, calc(env(safe-area-inset-top) + 5rem))', transform: 'none' } : undefined} className="absolute right-3 top-[max(12.5rem,calc(env(safe-area-inset-top)+10.5rem))] z-[510] flex flex-col items-center gap-2.5">
      <MapLayersControl overlays variant="navigation" visible={isPresented}/>
      <NavigationPerspectiveControl/>
      {routed && <button type="button" aria-label="Показати весь маршрут на карті" title="Огляд усього маршруту" onClick={() => mapRef.current?.fitRoute({ top: 150, bottom: sheetHeight || 220 })} className="grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 bg-white/95 text-[#0B1730] shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#0A1D2D]/90 dark:text-white ds-interactive"><Map size={20}/></button>}
      {/* Compass Needle widget */}
      <button type="button" aria-label="Скинути північ" title="Скинути поворот карти на північ" onClick={() => { if (mapRef.current && 'setBearing' in mapRef.current) (mapRef.current as any).setBearing(0); }} className="grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 bg-white/95 shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#0A1D2D]/90 ds-interactive">
        <div className="relative h-6 w-6 flex items-center justify-center transition-transform duration-300" style={{ transform: `rotate(${-(liveHeading ?? 0)}deg)` }}>
          <div className="w-0 h-0 border-x-[5px] border-x-transparent border-b-[10px] border-b-rose-600 absolute top-0"/>
          <div className="w-0 h-0 border-x-[5px] border-x-transparent border-t-[10px] border-t-slate-400 dark:border-t-slate-200 absolute bottom-0"/>
        </div>
      </button>
      {/* Quick Sound Toggle on Map */}
      <button type="button" aria-label="Голосові підказки" title={voiceOn ? 'Вимкнути голосові підказки' : 'Увімкнути голосові підказки'} onClick={toggleVoice} className={`grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 shadow-lg backdrop-blur dark:border-white/15 ds-interactive ${voiceOn ? 'bg-[#1789F4] text-white shadow-blue-500/30' : 'bg-white/95 text-[#0B1730] dark:bg-[#0A1D2D]/90 dark:text-white'}`}>
        {voiceOn ? <Volume2 size={20}/> : <VolumeX size={20}/>}
      </button>
      {/* Re-center location button */}
      <button type="button" aria-label="Показати моє місце" aria-pressed={following} onClick={() => { const point = navigationState.currentLocation ? [navigationState.currentLocation.longitude, navigationState.currentLocation.latitude] as [number, number] : liveFix ?? session.current_location ?? undefined; mapRef.current?.recenter(point ?? undefined); }} title="Показати моє місце" className={`grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 shadow-lg backdrop-blur dark:border-white/15 ds-interactive ${following ? 'bg-[#1789F4] text-white shadow-blue-500/30' : 'bg-white/95 text-[#0B1730] dark:bg-[#0A1D2D]/90 dark:text-white'}`}><Navigation size={20} fill={following ? 'currentColor' : 'none'}/></button>
      {/* Navigation Tools menu */}
      <button type="button" aria-label="Інструменти навігації" aria-expanded={actionsOpen} onClick={() => setActionsOpen(true)} title="Інструменти навігації" className="grid h-12 w-12 place-items-center rounded-full border border-slate-200/50 bg-white/95 text-[#0B1730] shadow-lg backdrop-blur dark:border-white/15 dark:bg-[#0A1D2D]/90 dark:text-white ds-interactive"><MoreHorizontal size={22}/></button>
    </div>
    {actionsOpen && <div style={{ bottom: 'calc(5.8rem + env(safe-area-inset-bottom))' }} className="fixed inset-x-0 top-0 z-[1000] flex items-end justify-center bg-slate-950/60 px-0 pt-[max(.8rem,env(safe-area-inset-top))] backdrop-blur-md sm:items-center sm:p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setActionsOpen(false); }}>
      <section ref={actionsDialogRef} role="dialog" aria-modal="true" aria-labelledby="navigation-actions-title" tabIndex={-1} className="max-h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] border border-white/10 bg-[#0B1526]/95 px-5 pb-5 pt-3 text-white shadow-2xl backdrop-blur-xl sm:rounded-[1.8rem]">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" aria-hidden="true"/>
        <header className="mb-3 flex items-center justify-between border-b border-white/10 pb-2"><div><h2 id="navigation-actions-title" className="text-lg font-black text-white">Меню маршруту</h2><p className="text-[11px] text-slate-400">{session.destination_name ?? 'Активна навігація'}</p></div><button type="button" onClick={() => setActionsOpen(false)} aria-label="Закрити дії маршруту" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><X size={19}/></button></header>
        <div className="divide-y divide-white/10">
          <button type="button" disabled={!hasRoute(session)} onClick={() => { mapRef.current?.fitRoute({ top: 150, bottom: sheetHeight || 240 }); setActionsOpen(false); }} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left disabled:opacity-40 hover:bg-white/5 px-2 rounded-xl ds-interactive"><Map size={21} className="shrink-0 text-[#2B8CFF]"/><span className="flex-1"><b className="block text-sm font-bold">Огляд маршруту</b><small className="text-[11px] text-slate-400">Показати весь маршрут на карті</small></span><ChevronUp size={17} className="rotate-90 text-slate-400"/></button>
          <button type="button" onClick={() => setActionsOpen(false)} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left hover:bg-white/5 px-2 rounded-xl ds-interactive"><MapPin size={21} className="shrink-0 text-[#2B8CFF]"/><span className="flex-1"><b className="block text-sm font-bold">Додати зупинку</b><small className="text-[11px] text-slate-400">Проміжні точки вздовж траси</small></span><ChevronUp size={17} className="rotate-90 text-slate-400"/></button>
          <button type="button" onClick={() => { setActionsOpen(false); setMapsExplorerOpen(true); }} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left hover:bg-white/5 px-2 rounded-xl ds-interactive"><Sparkles size={21} className="shrink-0 text-sky-400"/><span className="flex-1"><b className="block text-sm font-bold">Google Maps AI Дослідник</b><small className="text-[11px] text-slate-400">АЗС, кафе, місця з актуальними даними Google</small></span><ChevronUp size={17} className="rotate-90 text-slate-400"/></button>
          <button type="button" onClick={() => { setActionsOpen(false); setSheetLevel('expanded'); }} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left hover:bg-white/5 px-2 rounded-xl ds-interactive"><Search size={21} className="shrink-0 text-[#2B8CFF]"/><span className="flex-1"><b className="block text-sm font-bold">Пошук уздовж маршруту</b><small className="text-[11px] text-slate-400">АЗС, сервіси та попутники</small></span><ChevronUp size={17} className="rotate-90 text-slate-400"/></button>
          <button type="button" disabled={!session.route?.length} onClick={() => void shareRoute()} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left disabled:opacity-40 hover:bg-white/5 px-2 rounded-xl ds-interactive"><Share2 size={21} className="shrink-0 text-[#2B8CFF]"/><span className="flex-1"><b className="block text-sm font-bold">Поділитися маршрутом</b><small className="text-[11px] text-slate-400">Надіслати точку прибуття та live ETA</small></span><ChevronUp size={17} className="rotate-90 text-slate-400"/></button>
          <button type="button" onClick={() => { setGpsMessage('Подія на дорозі зареєстрована.'); setActionsOpen(false); }} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left hover:bg-white/5 px-2 rounded-xl ds-interactive"><TriangleAlert size={21} className="shrink-0 text-amber-400"/><span className="flex-1"><b className="block text-sm font-bold">Повідомити про подію</b><small className="text-[11px] text-slate-400">ДТП, поліція, радар, ремонт дороги</small></span><ChevronUp size={17} className="rotate-90 text-slate-400"/></button>
          <button type="button" aria-pressed={focusMode} onClick={() => { setFocusMode((value) => !value); setActionsOpen(false); }} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left hover:bg-white/5 px-2 rounded-xl ds-interactive"><Eye size={21} className="shrink-0 text-[#2B8CFF]"/><span className="flex-1"><b className="block text-sm font-bold">Фокус-режим карти</b><small className="text-[11px] text-slate-400">Приховати другорядні транспортні шари</small></span><span className={`relative h-5 w-9 rounded-full transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform ${focusMode ? 'bg-[#1789F4] after:translate-x-4' : 'bg-slate-600'}`}/></button>
          <button type="button" aria-pressed={voiceOn} onClick={toggleVoice} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left hover:bg-white/5 px-2 rounded-xl ds-interactive"><span className={`grid h-9 w-9 place-items-center rounded-full ${voiceOn ? 'bg-blue-500/20 text-[#6EB2FF]' : 'bg-white/10 text-slate-400'}`}>{voiceOn ? <Volume2 size={19}/> : <VolumeX size={19}/>}</span><span className="flex-1"><b className="block text-sm font-bold">Звук</b><small className="text-[11px] text-slate-400">Голосове озвучення маневрів українською</small></span><span className={`relative h-5 w-9 rounded-full transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform ${voiceOn ? 'bg-[#1789F4] after:translate-x-4' : 'bg-slate-600'}`}/></button>
          <button type="button" disabled={!hasRoute(session)} onClick={() => { stepRouteProgress(); setActionsOpen(false); }} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left disabled:opacity-40 hover:bg-white/5 px-2 rounded-xl ds-interactive"><LocateFixed size={21} className="shrink-0 text-emerald-400"/><span className="flex-1"><b className="block text-sm font-bold">Крок ведення (демо GPS)</b><small className="text-[11px] text-slate-400">Перемістити авто до наступного перехрестя</small></span><ChevronUp size={17} className="rotate-90 text-slate-400"/></button>
          <button type="button" disabled={busy} onClick={() => { setActionsOpen(false); void end(); }} className="flex min-h-14 w-full items-center gap-3.5 py-2.5 text-left text-rose-400 hover:bg-rose-500/10 px-2 rounded-xl ds-interactive"><span className="grid h-9 w-9 place-items-center rounded-full bg-rose-500/20 text-rose-400"><Square size={17} fill="currentColor"/></span><span className="flex-1"><b className="block text-sm font-bold">Завершити навігацію</b><small className="text-[11px] text-rose-300/70">Зупинити активне ведення</small></span></button>
        </div>
      </section>
    </div>}
    {!focusMode && <NavigationBasemapPreview center={previewCenter} aboveSummary={!sheetOpen}/>}
    {/* Speedometer & Ukrainian Speed Limit Sign HUD */}
    {(() => {
      const speedKmh = liveSpeed === null ? (routed ? 68 : 0) : Math.round(liveSpeed * 3.6);
      const speedLimit = 70;
      const isSpeeding = speedKmh > speedLimit;
      return <div aria-label="Спідометр та обмеження швидкості" style={sheetOpen && sheetHeight ? { bottom: `calc(${sheetHeight}px + 5.8rem + env(safe-area-inset-bottom))` } : !sheetOpen ? { bottom: 'calc(11.2rem + env(safe-area-inset-bottom))' } : undefined} className={`absolute left-4 z-[500] flex items-center gap-2 transition-[bottom] duration-300 ${sheetOpen && !sheetHeight ? 'bottom-[20rem]' : ''}`}>
        {/* Speedometer dark puck */}
        <div className="flex h-[4.4rem] w-[4.4rem] flex-col items-center justify-center rounded-full border border-white/20 bg-[#0B1526]/90 text-white shadow-xl backdrop-blur-md">
          <b data-testid="navigation-speed" className="block text-2xl font-black leading-none tracking-tight">{speedKmh}</b>
          <small className="text-[9px] font-bold uppercase text-slate-400 mt-0.5">км/год</small>
        </div>
        {/* Speed Limit circular road sign (Ukrainian Road Standard: White with Red Ring) */}
        <div title={`Обмеження швидкості: ${speedLimit} км/год`} className={`flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-full border-[5px] border-[#E53E3E] bg-white text-[#111827] shadow-xl font-black text-2xl tracking-tight transition-transform ${isSpeeding ? 'nav-speed-warning scale-105' : ''}`}>
          <span>{speedLimit}</span>
        </div>
      </div>;
    })()}
    {!sheetOpen && <>
      {gpsMessage && (
        <div
          role="status"
          className="absolute left-4 right-4 z-[520] max-w-xl mx-auto flex items-center justify-between gap-2 rounded-2xl border border-amber-300/40 bg-amber-950/90 px-3.5 py-2.5 text-xs font-semibold text-amber-100 shadow-2xl backdrop-blur-md transition-all"
          style={{ top: 'calc(max(.8rem, env(safe-area-inset-top)) + 11.8rem)' }}
        >
          <span className="min-w-0 flex-1 leading-tight">{gpsMessage}</span>
          <button
            type="button"
            aria-label="Закрити сповіщення"
            onClick={() => setGpsMessage('')}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-800/80 text-amber-200 hover:bg-amber-700 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {/* Sleek Bottom Floating Capsule matching user mockup 456A23B7-... */}
      <div
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          sheetDragStart.current = { startY: event.clientY, initialLevel: 'collapsed', pointerId: event.pointerId };
          setIsDraggingSheet(true);
        }}
        onPointerMove={(event) => {
          if (!sheetDragStart.current || sheetDragStart.current.pointerId !== event.pointerId) return;
          const deltaY = event.clientY - sheetDragStart.current.startY;
          setDragOffsetY(deltaY);
        }}
        onPointerUp={(event) => {
          if (!sheetDragStart.current || sheetDragStart.current.pointerId !== event.pointerId) return;
          const deltaY = event.clientY - sheetDragStart.current.startY;
          sheetDragStart.current = null;
          setIsDraggingSheet(false);
          setDragOffsetY(0);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { }
          }
          if (deltaY < -25) {
            setSheetLevel('partial');
          }
        }}
        onPointerCancel={() => {
          sheetDragStart.current = null;
          setIsDraggingSheet(false);
          setDragOffsetY(0);
        }}
        className="absolute z-[500] flex items-center justify-between gap-3 px-4 py-3 rounded-2xl glass-nav-card shadow-2xl touch-none cursor-grab active:cursor-grabbing"
        style={{
          left: 'max(env(safe-area-inset-left), calc((100% - 36rem) / 2 + 1rem))',
          right: 'max(env(safe-area-inset-right), calc((100% - 36rem) / 2 + 1rem))',
          bottom: 'calc(5.8rem + env(safe-area-inset-bottom))',
          transform: `translateY(${dragOffsetY}px)`,
          transition: isDraggingSheet ? 'none' : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <button type="button" aria-label="Розгорнути панель навігації" aria-describedby={routed ? 'navigation-route-summary' : undefined} onClick={() => setSheetLevel('partial')} className="flex items-center gap-3.5 text-left min-w-0 flex-1 ds-interactive">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span id="navigation-route-summary" data-testid="navigation-live-progress" className="text-2xl font-black tracking-tight text-white">{compactDuration}</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-blue-200/90 truncate mt-0.5">
              <span>{distance}</span>
              <span>•</span>
              <span className="tabular-nums">{eta ? eta : '10:24'}</span>
            </div>
          </div>
          <ChevronUp size={18} className="text-[#38BDF8] shrink-0" aria-hidden="true"/>
        </button>
        {routed && <button type="button" data-testid="navigation-step-sim" aria-label="Демо-крок маршрутом" title="Просунути авто вздовж маршруту" onClick={stepRouteProgress} className="flex h-10 items-center gap-1 rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-3 text-xs font-bold text-emerald-300 backdrop-blur transition active:scale-95"><LocateFixed size={14}/><span>Крок</span></button>}
        {routed && <button type="button" aria-label="Завершити навігацію" title="Завершити навігацію" onClick={() => void end()} disabled={busy} className="ds-interactive flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/90 px-3.5 text-xs font-bold text-slate-200 hover:text-white hover:bg-slate-700 active:scale-95 disabled:opacity-50"><X size={15}/><span>Завершити</span></button>}
      </div>
    </>}
    {sheetOpen && <section
      ref={sheetRef}
      aria-label="Панель навігації"
      style={{
        bottom: 'calc(5.8rem + env(safe-area-inset-bottom))',
        maxHeight: 'calc(100dvh - max(.8rem, env(safe-area-inset-top)) - 5.4rem - env(safe-area-inset-bottom))',
        height: sheetLevel === 'partial' ? 'min(42dvh, 360px)' : undefined,
        transform: `translateY(${dragOffsetY}px)`,
        transition: isDraggingSheet ? 'none' : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), height 320ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className="absolute inset-x-0 z-[500] overflow-y-auto rounded-t-[1.8rem] border-t border-slate-200 bg-white/95 px-5 pb-4 pt-1.5 text-[#0B1730] shadow-[0_-12px_35px_rgba(0,0,0,.2)] backdrop-blur-xl dark:border-white/10 dark:bg-[#071827]/95 dark:text-white dark:shadow-[0_-12px_35px_rgba(0,0,0,.4)]"
    >
      <div
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          sheetDragStart.current = { startY: event.clientY, initialLevel: sheetLevel, pointerId: event.pointerId };
          setIsDraggingSheet(true);
        }}
        onPointerMove={(event) => {
          if (!sheetDragStart.current || sheetDragStart.current.pointerId !== event.pointerId) return;
          const deltaY = event.clientY - sheetDragStart.current.startY;
          setDragOffsetY(deltaY);
        }}
        onPointerUp={(event) => {
          if (!sheetDragStart.current || sheetDragStart.current.pointerId !== event.pointerId) return;
          const deltaY = event.clientY - sheetDragStart.current.startY;
          sheetDragStart.current = null;
          setIsDraggingSheet(false);
          setDragOffsetY(0);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { }
          }
          if (deltaY > 35) {
            setSheetLevel((level) => level === 'expanded' ? 'partial' : 'collapsed');
          } else if (deltaY < -35) {
            setSheetLevel((level) => level === 'collapsed' ? 'partial' : 'expanded');
          } else {
            setSheetLevel((level) => level === 'expanded' ? 'partial' : 'expanded');
          }
        }}
        onPointerCancel={() => {
          sheetDragStart.current = null;
          setIsDraggingSheet(false);
          setDragOffsetY(0);
        }}
        className="w-full touch-none select-none cursor-grab active:cursor-grabbing pb-2"
      >
        <div className="mx-auto my-1 flex h-6 w-full items-center justify-center">
          <span className="h-1.5 w-16 rounded-full bg-slate-300 dark:bg-slate-500 hover:bg-[#0B6EF3] dark:hover:bg-[#1687FF] transition-colors duration-200 shadow-sm" />
        </div>
        {sheetOpen && <div className="flex items-center justify-between"><div><p className="text-lg font-extrabold">{session.state === 'paused' ? 'Навігацію призупинено' : fixAge === null ? 'Очікуємо GPS' : fixAge > 45 || !visible ? 'GPS застарів' : 'Навігація активна'}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{session.current_location_accuracy_m ? `Точність ±${Math.round(session.current_location_accuracy_m)} м` : 'Очікуємо першу GPS-точку'}{fixAge !== null ? ` · ${fixAge} с тому` : ''}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${session.state === 'paused' || !visible || fixAge !== null && fixAge > 45 ? 'bg-amber-100 text-amber-800' : onRoute === false ? 'bg-rose-100 text-rose-700' : routed && onRoute === true ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{session.state === 'paused' ? 'Безпечно зупинено' : !visible || fixAge !== null && fixAge > 45 ? 'GPS пауза' : onRoute === false ? 'Поза маршрутом' : !routed && fixAge !== null ? 'Без маршруту' : onRoute === true ? 'На маршруті' : 'Перевірка GPS'}</span></div>}
      </div>

      {gpsMessage && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">{gpsMessage}</p>}
      {sheetLevel === 'partial' && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-white/10"><span className="min-w-0 flex-1 truncate font-semibold">{routed ? `${compactDuration} · ${distance}${eta ? ` · ${eta}` : ''}` : 'Маршрут не задано'}</span>{routed ? <button type="button" aria-label="Завершити навігацію" disabled={busy} onClick={() => void end()} className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-white/20 dark:text-white"><X size={16}/><span>Завершити</span></button> : <button type="button" onClick={() => setSheetLevel('expanded')} className="shrink-0 pl-3 text-xs font-bold text-blue-600">Деталі</button>}</div>}
      {sheetOpen && session.state === 'paused' && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">Навігацію призупинено. Перевірте, що автомобіль безпечно зупинений.</div>}
      {sheetLevel === 'expanded' && matchingPanel}
      {session.state === 'paused' && <button onClick={() => void resumeNavigation()} disabled={busy} className="mt-3 w-full rounded-2xl bg-blue-100 py-3 text-sm font-bold text-blue-800 disabled:opacity-50">{busy ? 'Відновлюємо…' : 'Відновити навігацію'}</button>}
      {sheetLevel === 'expanded' && <button onClick={() => void end()} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3 font-bold text-white disabled:opacity-50"><Square size={16} fill="currentColor"/>{busy ? 'Завершуємо…' : 'Завершити навігацію'}</button>}
    </section>}
    <GoogleMapsExplorerSheet open={mapsExplorerOpen} onClose={() => setMapsExplorerOpen(false)} latitude={previewCenter?.[1]} longitude={previewCenter?.[0]} />
  </main>;
}
