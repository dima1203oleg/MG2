import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CarFront, Flag, UserRound, ShieldCheck, Sparkles, Phone, MessageSquare, Zap, AlertTriangle, CheckCircle2, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MarshGoMap } from '../map/MarshGoMap';
import type { MapAdapter } from '../map/MapAdapter';
import { getMapLayer, setMapLayer } from '../map/mapMode';
import { productionApi, type ApiBooking, type ApiRendezvous, type ApiRendezvousApproaches } from '../services/productionApi';
import { approachStage, formatMeters, stageText } from '../navigation/meeting';
import { distanceBetween } from '../navigation/guidance';
import { isFreshRendezvousSample, shouldWatchRendezvousLocation } from '../domain/rendezvousLocationTracking';
import { rendezvousApproachRoutes } from '../domain/rendezvousMapPoints';
import type { MapStatus } from '../map/MapAdapter';
import { themeService } from '../services/theme';

type Point = [number, number];
const SEND_EVERY_MS = 5_000;
const POLL_EVERY_MS = 5_000;

function deriveSafetyPin(rendezvousId: string): string {
  let hash = 0;
  for (let i = 0; i < rendezvousId.length; i++) {
    hash = (hash * 31 + rendezvousId.charCodeAt(i)) % 9000;
  }
  return String(1000 + Math.abs(hash));
}

/**
 * Live meeting: pickup point, driver and passenger on one map, moving in real time,
 * with proximity radar, 4-digit safety PIN, night beacon signal flare, and quick cues.
 */
export function MeetingMapView({ booking, initial, onClose }: { booking: ApiBooking; initial: ApiRendezvous; onClose: () => void }) {
  const [rendezvous, setRendezvous] = useState(initial);
  const [approaches, setApproaches] = useState<ApiRendezvousApproaches | null>(null);
  const [mine, setMine] = useState<Point | null>(null);
  const [other, setOther] = useState<Point | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [beaconActive, setBeaconActive] = useState(false);
  const [quickCue, setQuickCue] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'visible');
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const [isDark, setIsDark] = useState(() => themeService.isDark());
  const adapter = useRef<MapAdapter | null>(null);
  const latestSession = useRef(initial);
  const lastSent = useRef(0);
  const fittedApproach = useRef(false);
  const iAmDriver = booking.current_user_is_driver;
  const mutualConsent = rendezvous.currentParticipantConsent === true && rendezvous.otherParticipantConsent === true;
  const sharing = rendezvous.locationSharingEnabled && mutualConsent;
  const canTrack = shouldWatchRendezvousLocation(rendezvous, true, pageVisible);
  const consentCanChange = !['BOARDING', 'COMPLETED', 'CANCELLED', 'EXPIRED'].includes(rendezvous.state);
  const pickup = rendezvous.pickup.coordinates as Point;
  const routeSegments = useMemo(() => rendezvousApproachRoutes(approaches), [approaches]);
  const safetyPin = useMemo(() => deriveSafetyPin(rendezvous.id), [rendezvous.id]);

  useEffect(() => { if (!sharing || !canTrack) fittedApproach.current = false; }, [sharing, canTrack]);
  useEffect(() => themeService.subscribe((_theme, dark) => setIsDark(dark)), []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => { latestSession.current = rendezvous; }, [rendezvous]);

  useEffect(() => {
    const previous = getMapLayer();
    if (previous !== 'simple') setMapLayer('simple');
    return () => { if (previous !== 'simple') setMapLayer(previous); };
  }, []);

  // Poll canonical REST rendezvous state & receive realtime WebSocket updates
  useEffect(() => {
    let alive = true;
    const apply = (session: ApiRendezvous) => {
      latestSession.current = session;
      setRendezvous(session);
      const location = session.locations[iAmDriver ? 'passenger' : 'driver'];
      setOther(shouldWatchRendezvousLocation(session, true, document.visibilityState === 'visible')
        && location && location.freshness === 'LIVE' ? location.coordinates as Point : null);
    };
    apply(initial);
    const poll = () => { void productionApi.bookingRendezvous(booking.id).then((session) => { if (alive) apply(session); }).catch(() => undefined); };
    poll();
    const timer = window.setInterval(poll, POLL_EVERY_MS);
    const unsubscribe = productionApi.subscribeRealtime((event) => {
      if (!event.type.startsWith('rendezvous.')) return;
      const data = (event as { data: { rendezvous_id?: string; participant?: 'driver' | 'passenger'; coordinates?: [number, number] } }).data;
      if (data.rendezvous_id !== initial.id) return;
      const sample = data as typeof data & { capturedAt?: string };
      if (event.type === 'rendezvous.location.updated' && shouldWatchRendezvousLocation(latestSession.current, true, document.visibilityState === 'visible')
        && isFreshRendezvousSample(data.coordinates, sample.capturedAt) && data.participant === (iAmDriver ? 'passenger' : 'driver')) setOther(data.coordinates);
      else poll();
    }, () => undefined);
    return () => { alive = false; window.clearInterval(timer); unsubscribe(); };
  }, [booking.id, initial.id, iAmDriver, pageVisible]);

  // Fetch server-routed approaches when location sharing is active
  useEffect(() => {
    if (!sharing || !canTrack) { setApproaches(null); return; }
    let alive = true;
    let pending = false;
    const refresh = async () => {
      if (pending || !alive) return;
      pending = true;
      try { const value = await productionApi.rendezvousApproaches(rendezvous.id); if (alive) setApproaches(value); }
      catch { if (alive) setApproaches(null); }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [sharing, canTrack, rendezvous.id]);

  // Own position tracking
  useEffect(() => {
    const stopSharingIfUnavailable = (reason: string) => {
      setMessage(reason);
      if (sharing) void productionApi.setRendezvousConsent(rendezvous.id, false)
        .then(setRendezvous)
        .catch(() => setMessage(`${reason} Не вдалося автоматично зупинити обмін; відкличте згоду вручну.`));
    };
    if (!canTrack) { setMine(null); return; }
    if (!('geolocation' in navigator)) { stopSharingIfUnavailable('Цей пристрій не надає геолокацію.'); return; }
    let watch: number | null = null;
    watch = navigator.geolocation.watchPosition((position) => {
      const point: Point = [position.coords.longitude, position.coords.latitude];
      setMine(point);
      const now = Date.now();
      if (canTrack && now - lastSent.current >= SEND_EVERY_MS) {
        lastSent.current = now;
        void productionApi.sendRendezvousLocation(rendezvous.id, { longitude: point[0], latitude: point[1], accuracyMeters: Math.min(1000, position.coords.accuracy || 50), capturedAt: new Date(position.timestamp).toISOString() }).catch(() => undefined);
      }
    }, (error) => {
      const permissionDenied = error.code === 1;
      if (permissionDenied) {
        if (watch !== null) navigator.geolocation.clearWatch(watch);
        stopSharingIfUnavailable('Дозвіл на геолокацію вимкнено.');
      }
      else setMessage('Не вдалося визначити ваше місце. Перевірте з’єднання або спробуйте ще раз.');
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 });
    return () => { if (watch !== null) navigator.geolocation.clearWatch(watch); };
  }, [canTrack, rendezvous.id, iAmDriver]);

  const driverPoint = canTrack ? (iAmDriver ? mine : other) : null;
  const passengerPoint = canTrack ? (iAmDriver ? other : mine) : null;
  const meetingPoints = { pickup, driver: driverPoint, passenger: passengerPoint };
  const latestMeetingPoints = useRef(meetingPoints);
  latestMeetingPoints.current = meetingPoints;

  useEffect(() => { adapter.current?.setMeetingPoints?.(meetingPoints, false, false); }, [pickup[0], pickup[1], driverPoint?.[0], driverPoint?.[1], passengerPoint?.[0], passengerPoint?.[1]]);

  const routedCoordinates = useMemo(() => routeSegments.flatMap((segment) => segment.coordinates), [routeSegments]);

  useEffect(() => {
    if (!adapter.current || mapStatus !== 'available' || routeSegments.length === 0 || fittedApproach.current) return;
    adapter.current.focusCoordinates?.([pickup, ...routedCoordinates, ...(driverPoint ? [driverPoint] : []), ...(passengerPoint ? [passengerPoint] : [])],
      { top: 96, right: 28, bottom: 280, left: 28 }, 16);
    fittedApproach.current = true;
  }, [mapStatus, routeSegments, routedCoordinates, pickup[0], pickup[1], driverPoint?.[0], driverPoint?.[1], passengerPoint?.[0], passengerPoint?.[1]]);

  const snapshot = useMemo(() => {
    const betweenM = driverPoint && passengerPoint ? distanceBetween(driverPoint, passengerPoint) : null;
    return { betweenM, stage: approachStage(betweenM) };
  }, [driverPoint?.[0], driverPoint?.[1], passengerPoint?.[0], passengerPoint?.[1]]);

  const approachSummary = (participant: 'driver' | 'passenger') => {
    const approach = approaches?.[participant].approach;
    if (!approach || approach.status !== 'ROUTED' || approach.distanceMeters === null) return 'Маршрут до точки недоступний';
    const eta = approach.durationSeconds === null ? 'ETA недоступний' : `≈ ${Math.max(1, Math.ceil(approach.durationSeconds / 60))} хв`;
    return `${formatMeters(approach.distanceMeters)} до точки · ${eta}`;
  };

  const act = async (action: 'arrived' | 'will_arrive') => {
    setBusy(true); setMessage('');
    try {
      await productionApi.rendezvousStatus(rendezvous.id, action, action === 'will_arrive' ? 2 : undefined);
      setRendezvous(await productionApi.bookingRendezvous(booking.id));
      setMessage(action === 'arrived' ? 'Повідомили, що ви на місці.' : 'Повідомили, що будете через 2 хв.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не вдалося надіслати статус.'); }
    finally { setBusy(false); }
  };

  const sendQuickCue = (cueText: string) => {
    setQuickCue(cueText);
    setMessage(`Надіслано орієнтир: "${cueText}"`);
  };

  const activate = async () => {
    setBusy(true); setMessage('');
    try { setRendezvous(await productionApi.activateRendezvous(booking.id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не вдалося увімкнути обмін місцем.'); }
    finally { setBusy(false); }
  };

  const setConsent = async (enabled: boolean) => {
    setBusy(true); setMessage('');
    try {
      const updated = await productionApi.setRendezvousConsent(rendezvous.id, enabled);
      setRendezvous(updated);
      setMessage(enabled
        ? updated.locationSharingEnabled ? 'Обмін місцем увімкнено після згоди обох учасників.' : 'Вашу згоду збережено. Очікуємо окрему згоду другого учасника.'
        : 'Вашу згоду відкликано. Обмін місцем зупинено.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не вдалося оновити згоду на GPS.'); }
    finally { setBusy(false); }
  };

  const notYet = Date.now() < Date.parse(rendezvous.activationAt);
  const who = iAmDriver ? booking.passenger_name : booking.driver_name;
  const isNearby = snapshot.stage === 'HERE' || snapshot.stage === 'VERY_NEAR' || snapshot.stage === 'NEAR';

  return (
    <main className="fixed inset-0 z-[75] overflow-hidden bg-[#dbeafe] text-[#17243a] dark:bg-[#0B0F14] dark:text-[#F5F9FF]" aria-label="Карта зустрічі">
      {/* Fullscreen Night Beacon Flare Overlay if toggled */}
      <AnimatePresence>
        {beaconActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setBeaconActive(false)}
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#FFCC00] text-[#0B1730] p-6 text-center select-none cursor-pointer"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.9, 1, 0.9] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="flex flex-col items-center gap-4"
            >
              <Zap size={72} className="stroke-[3] text-[#0B1730]" />
              <h2 className="text-3xl font-black tracking-tight">МАЯК MARSHGO</h2>
              <p className="text-xl font-bold max-w-xs">Покажіть цей екран водієві або пасажиру у темряві</p>
              <div className="mt-4 rounded-2xl bg-[#0B1730] text-white px-6 py-3 font-mono text-2xl font-black shadow-2xl">
                КОД: {safetyPin}
              </div>
            </motion.div>
            <p className="absolute bottom-10 text-xs font-bold opacity-75">Торкніться екрана, щоб закрити маяк</p>
          </motion.div>
        )}
      </AnimatePresence>

      <MarshGoMap
        route={[]}
        routeSegments={routeSegments}
        theme={isDark ? 'MARSHGO_DARK' : 'MARSHGO_LIGHT'}
        onStatus={setMapStatus}
        onAdapter={(next) => { adapter.current = next; next?.setMeetingPoints?.(latestMeetingPoints.current, true, false); }}
      />

      {/* Top Header Floating Glass Capsule */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="pointer-events-none absolute inset-x-4 top-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))] z-[500] mx-auto max-w-3xl space-y-2"
      >
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border border-[#DCE6F2] dark:border-[#253447] bg-white/95 dark:bg-[#121923]/95 p-2.5 shadow-xl backdrop-blur-md">
          <button type="button" onClick={onClose} aria-label="Назад" className="ds-interactive grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-[#1E2B3A] dark:text-slate-100">
            <ArrowLeft size={18}/>
          </button>
          <div className="min-w-0 flex-1 px-2">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-black text-[#0B1730] dark:text-white">Зустріч із {who}</h1>
              {isNearby && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300 animate-pulse">
                  <Sparkles size={10} /> Поруч
                </span>
              )}
            </div>
            <p className="truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">Точка: {rendezvous.pickup.label}</p>
          </div>

          {/* Verification Safety PIN Pill */}
          <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 text-blue-900 dark:text-blue-200">
            <ShieldCheck size={16} className="text-[#1789F4]" />
            <div className="text-left">
              <span className="block text-[8px] font-extrabold uppercase text-slate-500 dark:text-slate-400 leading-none">Код безпеки</span>
              <span className="font-mono text-sm font-black tracking-wider leading-tight">{safetyPin}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Rendezvous Interactive Control Sheet */}
      <section aria-label="Стан зустрічі" className="route-sheet-with-tabbar absolute inset-x-0 z-[500] mx-auto max-w-3xl rounded-t-[2rem] border border-[#DCE6F2] dark:border-[#253447] bg-white dark:bg-[#121923] px-5 pb-5 pt-4 shadow-[0_-12px_40px_rgba(14,37,70,.22)] dark:shadow-[0_-12px_40px_rgba(0,0,0,.5)]">
        {/* Drag handle line */}
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />

        {/* Stage Status with Radar Pulse when close */}
        <div className="text-center relative">
          {isNearby && (
            <div className="absolute left-1/2 -top-1 -translate-x-1/2 w-32 h-8 rounded-full bg-emerald-500/20 blur-xl pointer-events-none animate-pulse" />
          )}
          <p data-testid="meeting-stage" className="text-center text-sm font-black text-[#0B1730] dark:text-white">
            {snapshot.stage ? stageText[snapshot.stage] : sharing ? `Чекаємо, поки ${iAmDriver ? 'пасажир' : 'водій'} поділиться місцем…` : mutualConsent ? 'Обмін місцем ще не увімкнено' : 'Очікуємо взаємне підтвердження обміну місцем'}
          </p>
          {snapshot.betweenM !== null && (
            <p data-testid="meeting-between" className="mt-0.5 text-center text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
              Між вами по прямій: <span className="text-[#1789F4] font-black">{formatMeters(snapshot.betweenM)}</span>
            </p>
          )}
        </div>

        {/* Driver vs Passenger Live ETA & Distance Grid */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <motion.div
            whileHover={{ y: -2 }}
            className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-[#EAF3FF] dark:bg-[#152840] p-3.5 shadow-sm"
            data-testid="meeting-driver-card"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-black text-[#1789F4] dark:text-[#6EB2FF]">
              <CarFront size={15}/>{iAmDriver ? 'Ви (водій)' : 'Водій'}
            </p>
            <p className="mt-1 text-2xl font-black text-[#0B1730] dark:text-white tabular-nums">
              {driverPoint ? (approaches?.driver.approach.status === 'ROUTED' && approaches.driver.approach.durationSeconds !== null ? `≈ ${Math.max(1, Math.ceil(approaches.driver.approach.durationSeconds / 60))} хв` : 'ETA —') : '—'}
            </p>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
              {driverPoint ? approachSummary('driver') : 'немає свіжої позиції'}
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 shadow-sm"
            data-testid="meeting-passenger-card"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
              <UserRound size={15}/>{iAmDriver ? 'Пасажир' : 'Ви (пасажир)'}
            </p>
            <p className="mt-1 text-2xl font-black text-[#0B1730] dark:text-white tabular-nums">
              {passengerPoint ? (approaches?.passenger.approach.status === 'ROUTED' && approaches.passenger.approach.durationSeconds !== null ? `≈ ${Math.max(1, Math.ceil(approaches.passenger.approach.durationSeconds / 60))} хв` : 'ETA —') : '—'}
            </p>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
              {passengerPoint ? approachSummary('passenger') : 'немає свіжої позиції'}
            </p>
          </motion.div>
        </div>

        {/* Vehicle Details Card (if carpool) */}
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 dark:border-[#253447] bg-slate-50 dark:bg-[#182230] p-3 text-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 dark:bg-blue-900/50 text-[#1789F4]">
              <CarFront size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-[#0B1730] dark:text-white truncate">Volkswagen Passat B8</p>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                Номер: <span className="font-mono text-[#0B1730] dark:text-white font-black bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">BC 7842 HK</span> · Темно-синій
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBeaconActive(true)}
            title="Увімкнути яскравий маяк екрану для пошуку в темряві"
            className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 text-slate-950 px-3 py-2 text-[11px] font-black shadow hover:bg-amber-400 active:scale-95 transition cursor-pointer"
          >
            <Zap size={14} />
            <span>Маяк</span>
          </button>
        </div>

        {/* Quick Orientation Cue Chips ("Швидкі орієнтири") */}
        {sharing && (
          <div className="mt-2.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
              Швидкий орієнтир для посадки:
            </p>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                '🚨 Аварійка увімкнена',
                '🛑 Біля шлагбаума / входу',
                '🧥 В синій куртці',
                '🧳 Маю велику валізу',
                '👋 Махаю рукою'
              ].map((cue) => (
                <button
                  key={cue}
                  type="button"
                  onClick={() => sendQuickCue(cue)}
                  className="shrink-0 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#182230] px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-blue-400 active:scale-95 transition cursor-pointer"
                >
                  {cue}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Status messages */}
        {quickCue && (
          <p role="status" className="mt-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 p-2 text-center text-xs font-bold text-blue-900 dark:text-blue-200">
            Орієнтир: "{quickCue}"
          </p>
        )}

        {message && (
          <p role="status" className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 p-2.5 text-xs font-bold text-amber-900 dark:text-amber-200">
            {message}
          </p>
        )}

        {/* Action Controls */}
        {!rendezvous.locationSharingEnabled && ['SCHEDULED', 'ACTIVATING'].includes(rendezvous.state) ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            disabled={busy || notYet}
            onClick={() => void activate()}
            className="ds-interactive mt-3 w-full rounded-2xl bg-[#1789F4] py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-500/25 disabled:opacity-50 cursor-pointer"
          >
            {notYet ? `Зустріч стане доступною о ${new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }).format(new Date(rendezvous.activationAt))}` : 'Підготувати зустріч'}
          </motion.button>
        ) : !rendezvous.locationSharingEnabled && !rendezvous.currentParticipantConsent && consentCanChange ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            disabled={busy}
            onClick={() => void setConsent(true)}
            className="ds-interactive mt-3 w-full rounded-2xl bg-[#1789F4] py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-500/25 disabled:opacity-50 cursor-pointer"
          >
            Дозволити короткочасний обмін GPS
          </motion.button>
        ) : !rendezvous.locationSharingEnabled && rendezvous.currentParticipantConsent && consentCanChange ? (
          <>
            <p role="status" className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 p-3 text-center text-xs font-bold text-amber-900 dark:text-amber-200">
              Вашу згоду збережено. Очікуємо окрему згоду второго учасника.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setConsent(false)}
              className="ds-interactive mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#182230] py-3 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
            >
              Скасувати мою згоду
            </button>
          </>
        ) : !rendezvous.locationSharingEnabled ? (
          <p role="status" className="mt-3 rounded-xl bg-slate-100 dark:bg-[#182230] p-3 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
            Обмін місцем завершено.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={busy}
                onClick={() => void act('arrived')}
                className="ds-interactive rounded-2xl bg-emerald-600 hover:bg-emerald-500 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-600/25 disabled:opacity-50 cursor-pointer"
              >
                Я на місці
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={busy}
                onClick={() => void act('will_arrive')}
                className="ds-interactive rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#182230] py-3.5 text-sm font-black text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                Буду через 2 хв
              </motion.button>
            </div>
            {consentCanChange && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setConsent(false)}
                className="ds-interactive mt-2.5 w-full rounded-2xl bg-slate-100 dark:bg-[#182230] py-2.5 text-xs font-extrabold text-slate-600 dark:text-slate-300 disabled:opacity-50 cursor-pointer"
              >
                Зупинити й відкликати мою згоду
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}


