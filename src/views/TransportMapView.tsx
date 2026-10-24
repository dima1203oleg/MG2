import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bike, Bus, Moon, Sun, TrainFront } from 'lucide-react';
import { productionApi, type ApiTransportCity } from '../services/productionApi';
import { MarshGoMap } from '../map/MarshGoMap';
import { MapLayersControl } from '../components/MapLayersControl';
import type { MapAdapter, MapStatus } from '../map/MapAdapter';
import { getTransportLayers, subscribeTransportLayers, toggleTransportLayer, type TransportLayerId } from '../map/transportLayers';
import { themeService } from '../services/theme';

const chips: Array<{ label: string; id: TransportLayerId; Icon: typeof Bus }> = [
  { label: 'Метро', id: 'METRO', Icon: TrainFront }, { label: 'Транспорт', id: 'PUBLIC_TRANSPORT', Icon: Bus }, { label: 'Велосипеди', id: 'BICYCLE', Icon: Bike },
];

/** 2D map for planning: the user switches on only the layers they need; everything is off by default. */
export function TransportMapView({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<MapStatus>('loading');
  const [hint, setHint] = useState<string | null>(null);
  const [cities, setCities] = useState<ApiTransportCity[]>([]);
  const [cityId, setCityId] = useState('kyiv');
  const [selected, setSelected] = useState(getTransportLayers());
  const [isDark, setIsDark] = useState(() => themeService.isDark());
  const adapter = useRef<MapAdapter | null>(null);
  const selectedCity = useMemo(() => cities.find((city) => city.id === cityId) ?? null, [cities, cityId]);
  useEffect(() => subscribeTransportLayers(setSelected), []);
  useEffect(() => themeService.subscribe((_theme, dark) => setIsDark(dark)), []);
  useEffect(() => {
    const controller = new AbortController();
    void productionApi.transportCities(controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setCities(response);
      if (!response.some((city) => city.id === cityId) && response[0]) setCityId(response[0].id);
    }).catch(() => { if (!controller.signal.aborted) setHint('Не вдалося завантажити список міст.'); });
    return () => controller.abort();
  }, []);
  const located = useRef(false);
  const onAdapter = (next: MapAdapter | null) => {
    adapter.current = next;
    if (!next || located.current || !('geolocation' in navigator)) return;
    located.current = true;
    navigator.geolocation.getCurrentPosition((position) => next.focus([position.coords.longitude, position.coords.latitude], 13), () => next.focus([30.5234, 50.4501], 10), { timeout: 8000, maximumAge: 300_000 });
  };
  const chooseCity = (nextId: string) => {
    setCityId(nextId);
    const city = cities.find((entry) => entry.id === nextId);
    if (city?.bbox) adapter.current?.focus([(city.bbox[0] + city.bbox[2]) / 2, (city.bbox[1] + city.bbox[3]) / 2], 10.5);
  };
  return <main className="relative h-[100svh] overflow-hidden bg-[#dbeafe] text-[#17243a] dark:bg-[#0B0F14] dark:text-[#F5F9FF]">
    <MarshGoMap route={[]} overlays theme={isDark ? 'MARSHGO_DARK' : 'MARSHGO_LIGHT'} onStatus={setStatus} onTransportHint={setHint} onAdapter={onAdapter}/>
    <div className="pointer-events-none absolute inset-x-4 top-[max(.8rem,env(safe-area-inset-top))] z-[500] mx-auto flex max-w-3xl flex-col gap-2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#DCE6F2] bg-white/95 p-2 shadow-xl backdrop-blur dark:border-[#253447] dark:bg-[#121923]/95">
        <button type="button" onClick={onBack} aria-label="Назад" className="ds-interactive grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-[#1E2B3A] dark:text-slate-100"><ArrowLeft size={18}/></button>
        <div className="min-w-0 flex-1 px-1"><h1 className="sr-only">Карта транспорту</h1><div aria-hidden="true"><div className="truncate text-base font-extrabold tracking-tight">MARSH<span className="text-[#0B6EF3] dark:text-[#4DA0FF]">GO</span></div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Карта транспорту України</p></div></div>
        {cities.length > 0 && <label className="sr-only" htmlFor="transport-city">Місто</label>}
        {cities.length > 0 && <select id="transport-city" aria-label="Місто на транспортній карті" value={cityId} onChange={(event) => chooseCity(event.target.value)} className="max-w-32 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-[#182230] dark:text-slate-100">
          {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
        </select>}
        <button type="button" aria-label={isDark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'} onClick={() => themeService.setTheme(isDark ? 'light' : 'dark')} className="ds-interactive grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-[#1E2B3A] dark:text-amber-300">
          {isDark ? <Sun size={17}/> : <Moon size={17}/>}
        </button>
      </div>
      <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Швидкі шари">
        {chips.map(({ label, id, Icon }) => <button key={id} type="button" aria-pressed={selected.has(id)} onClick={() => toggleTransportLayer(id)} className={`ds-interactive flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold shadow ${selected.has(id) ? 'border-[#0B6EF3] bg-[#0B6EF3] text-white' : 'border-[#DCE6F2] bg-white/95 text-slate-700 dark:border-[#253447] dark:bg-[#121923]/95 dark:text-slate-200'}`}><Icon size={15}/>{label}</button>)}
      </div>
      {hint && <p role="status" className="pointer-events-auto self-start rounded-xl border border-[#DCE6F2] bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-600 shadow dark:border-[#253447] dark:bg-[#121923]/95 dark:text-slate-300">{hint}</p>}
      {selectedCity && <p className="pointer-events-auto self-start rounded-xl border border-[#DCE6F2] bg-white/95 px-3 py-2 text-[10px] font-semibold text-slate-700 shadow dark:border-[#253447] dark:bg-[#121923]/95 dark:text-slate-300">
        {selectedCity.routeCount} маршрутів · {selectedCity.stopCount} зупинок · статичний розклад{selectedCity.realtimeAvailable ? ' · realtime джерело підключене' : ''}
        {selectedCity.sourceUrl && <><span aria-hidden="true"> · </span><a className="text-blue-700 underline dark:text-[#6EB2FF]" href={selectedCity.sourceUrl} target="_blank" rel="noreferrer">Джерело даних</a></>}
        <span> · {selectedCity.licenses.length ? selectedCity.licenses.join(', ') : 'умови використання уточнюються'}</span>
      </p>}
      {status === 'failed' && <p role="alert" className="pointer-events-auto self-start rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900 shadow">Не вдалося завантажити карту. Перевірте мережу.</p>}
    </div>
    <div className="absolute right-4 top-1/2 z-[500] -translate-y-1/2"><MapLayersControl overlays/></div>
  </main>;
}

