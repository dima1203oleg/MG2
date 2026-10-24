import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BusFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Compass,
  MapPin,
  Navigation,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';
import { selectHomeMarshPasses } from '../domain/marshPass';
import { TicketQr } from '../components/TicketQr';
import { productionApi } from '../services/productionApi';

type HomeTrip = {
  id: string;
  kind: 'booking' | 'journey';
  currentUserIsDriver?: boolean;
  origin: string;
  destination: string;
  departureAt: string;
  price?: string;
  status: string;
  driverName?: string;
  seatCount?: number;
  onOpen: () => void;
};

const hubCities = ['Львів', 'Київ', 'Одеса', 'Дніпро', 'Харків', 'Ужгород'] as const;

const banners = [
  {
    eyebrow: 'MARSHGO COMMUNITY · 0% КОМІСІЇ',
    title: 'Попутники знайдуться просто на твоєму маршруті',
    description: 'Опублікуй поїздку автомобілем або залиш заявку з власним бюджетом. Прямі розрахунки без сервісних зборів та узгодження посадки на живій мапі.',
    image: '/images/welcome-road.jpg',
    imagePosition: 'center 68%',
    action: 'publish' as const,
    actionLabel: 'Опублікувати поїздку',
  },
  {
    eyebrow: 'МІСТО ТА МІЖМІСТО · 24 ОБЛАСНІ ЦЕНТРИ УКРАЇНИ',
    title: 'Усі способи доїхати в єдиному маршруті',
    description: 'Поїзди Укрзалізниці, міжміські автобуси, метро, трамваї, попутки та піші переходи — об’єднані алгоритмом RAPTOR + OSRM від дверей до дверей.',
    image: '/hero_car_route.png',
    imagePosition: 'center',
    action: 'search' as const,
    actionLabel: 'Знайти маршрут',
  },
  {
    eyebrow: 'ЖИВА НАВІГАЦІЯ ТА RENDEZVOUS · WAZE-РІВЕНЬ',
    title: '3D-супровід поїздки та радари попутників дорогою',
    description: 'Вмикайте голосовий GPS-супровід, знаходьте попутників без відхилення від траси та відкривайте спільну карту зустрічі за 15 хвилин до виїзду.',
    image: '/images/hero_ukraine_mobility.jpg',
    imagePosition: 'center 45%',
    action: 'navigation' as const,
    actionLabel: 'Увімкнути навігацію',
  },
];

const actions = [
  {
    title: 'Навігація',
    subtitle: 'GPS-супровід і попутники',
    kicker: 'Waze · 3D Карта',
    tone: 'navigation',
    icon: Navigation,
  },
  {
    title: 'Карта транспорту',
    subtitle: 'Зупинки, лінії, живий рух',
    kicker: 'GTFS · 24 міста',
    tone: 'transport',
    icon: BusFront,
  },
  {
    title: 'Опублікувати поїздку',
    subtitle: 'Попутка або запит (0%)',
    kicker: 'BlaBlaCar · 0% збору',
    tone: 'publish',
    icon: CirclePlus,
  },
  {
    title: 'Знайти маршрут',
    subtitle: 'Усі види транспорту',
    kicker: 'RAPTOR + Попутка',
    tone: 'search',
    icon: Search,
  },
] as const;

const popularRoutes = [
  {
    city: 'Київ',
    from: 'Львів',
    meta: '5 сегментів · Поїзд + Попутка + Метро',
    duration: '5 год 40 хв',
    priceHint: 'від 480 ₴',
    image: '/images/welcome-kyiv-v1.jpg',
  },
  {
    city: 'Рівне',
    from: 'Львів',
    meta: 'Пряма попутка або Експрес-автобус',
    duration: '2 год 35 хв',
    priceHint: 'від 220 ₴',
    image: '/images/welcome-road.jpg',
  },
  {
    city: 'Тернопіль',
    from: 'Львів',
    meta: 'Регіональний експрес + Автобус',
    duration: '1 год 50 хв',
    priceHint: 'від 160 ₴',
    image: '/images/lviv_stop_banner.jpg',
  },
  {
    city: 'Одеса',
    from: 'Київ',
    meta: 'Інтерсіті + Попутка + Міський трамвай',
    duration: '6 год 15 хв',
    priceHint: 'від 520 ₴',
    image: '/images/hero_ukraine_mobility.jpg',
  },
  {
    city: 'Харків',
    from: 'Дніпро',
    meta: 'Швидкісний коридор + Метро',
    duration: '2 год 55 хв',
    priceHint: 'від 250 ₴',
    image: '/images/card_navigation_car.jpg',
  },
  {
    city: 'Львів',
    from: 'Ужгород',
    meta: 'Карпатський перевал + Трамвай №8',
    duration: '3 год 45 хв',
    priceHint: 'від 290 ₴',
    image: '/images/hero_mountain_bus.jpg',
  },
] as const;

function formatDeparture(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Час не вказано';
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Kyiv',
  }).format(date);
}

export function HomeHero({
  onStartNavigation,
  onSearchTrip,
  onPlanTrip,
  onOpenMap,
  onSearchDestination,
  onOpenAllTrips,
  onOpenCanonicalShowcase,
  trips = [],
}: {
  onStartNavigation: () => void;
  onSearchTrip: () => void;
  onPlanTrip: () => void;
  onOpenMap: () => void;
  onSearchDestination: (city: string, fromCity?: string) => void;
  onOpenAllTrips?: () => void;
  onOpenCanonicalShowcase?: () => void;
  trips?: HomeTrip[];
}) {
  const root = useRef<HTMLElement | null>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [passIndex, setPassIndex] = useState(0);
  const [forceShowHero, setForceShowHero] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string>('Львів');
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [qrPreviewPass, setQrPreviewPass] = useState<HomeTrip | null>(null);
  const [signedQrToken, setSignedQrToken] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [qrVerifyState, setQrVerifyState] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const marshPasses = selectHomeMarshPasses(trips);
  const activePass = !forceShowHero ? (marshPasses[passIndex] ?? marshPasses[0]) : undefined;
  const activeBanner = banners[bannerIndex] ?? banners[0];

  useEffect(() => {
    if (!qrPreviewPass) {
      setSignedQrToken(null);
      setQrExpiresAt(null);
      setQrVerifyState(null);
      return;
    }
    let cancelled = false;
    productionApi
      .bookingTicket(qrPreviewPass.id)
      .then((res) => {
        if (!cancelled) {
          setSignedQrToken(res.token);
          setQrExpiresAt(res.expiresAt);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSignedQrToken(`MGPASS.${qrPreviewPass.id}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qrPreviewPass]);

  useEffect(() => {
    if ((marshPasses.length && !forceShowHero) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setBannerIndex((index) => (index + 1) % banners.length), 6000);
    return () => window.clearInterval(timer);
  }, [marshPasses.length, forceShowHero]);

  useEffect(() => setPassIndex((index) => Math.min(index, Math.max(0, marshPasses.length - 1))), [marshPasses.length]);

  useLayoutEffect(() => {
    const measure = () => {
      const element = root.current;
      if (!element || window.innerWidth >= 1024) {
        setAvailableHeight(null);
        return;
      }
      const top = element.getBoundingClientRect().top + window.scrollY;
      const shell = element.closest('.production-app');
      const reserved = shell ? parseFloat(getComputedStyle(shell).paddingBottom) || 0 : 0;
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      setAvailableHeight(Math.max(320, Math.floor(viewport - top - reserved - 4)));
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);

  const runAction = (action: (typeof actions)[number]['tone']) => {
    if (action === 'navigation') onStartNavigation();
    if (action === 'transport') onOpenMap();
    if (action === 'search') onSearchTrip();
    if (action === 'publish') onPlanTrip();
  };

  const renderMarshPassCard = (pass: HomeTrip) => (
    <section
      className={`home-marshpass-slot relative flex flex-col justify-between ${marshPasses.length > 1 ? 'home-marshpass-slot--multiple pt-2' : ''}`}
      aria-label="Активні MarshPass"
    >
      {/* Visual Cascade Background Layers when multiple tickets exist */}
      {marshPasses.length > 1 && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setPassIndex((index) => (index + 1) % marshPasses.length)}
            className="pointer-events-auto absolute inset-x-3 -top-0.5 h-6 cursor-pointer rounded-t-[20px] border border-blue-300/60 bg-blue-100/70 transition hover:-translate-y-0.5 dark:border-blue-800/60 dark:bg-blue-950/50"
          />
          {marshPasses.length > 2 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 -top-2 h-5 rounded-t-[18px] border border-blue-200/50 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/30"
            />
          )}
        </>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={pass.onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pass.onOpen();
          }
        }}
        aria-label={`Відкрити MarshPass: ${pass.origin.split(',')[0]} — ${pass.destination.split(',')[0]}`}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const endX = event.changedTouches[0]?.clientX;
          if (touchStartX.current === null || endX === undefined || marshPasses.length < 2) return;
          const delta = endX - touchStartX.current;
          if (Math.abs(delta) > 40) setPassIndex((index) => (index + (delta < 0 ? 1 : -1) + marshPasses.length) % marshPasses.length);
          touchStartX.current = null;
        }}
        className="home-marshpass-card relative z-10 flex h-full w-full cursor-pointer flex-col justify-between overflow-hidden rounded-[22px] border p-4 lg:p-5 text-left transition hover:shadow-xl active:scale-[.99]"
      >
        {/* Subtle Boarding-Pass Perforation Notches on Desktop */}
        <span aria-hidden="true" className="hidden lg:block absolute -left-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-[#f3f7fc] dark:bg-[#070d17] border border-slate-200/80 dark:border-slate-700/80" />
        <span aria-hidden="true" className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-[#f3f7fc] dark:bg-[#070d17] border border-slate-200/80 dark:border-slate-700/80" />

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 lg:h-10 lg:w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm shadow-blue-600/30">
              <Ticket size={18} />
            </span>
            <span>
              <span className="block text-[11px] font-extrabold tracking-[.08em]">
                MARSHGO <span className="text-blue-600 dark:text-blue-300">MARSH PASS</span>
              </span>
              <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                {marshPasses.length > 1
                  ? `Каскад активних квитків · ${passIndex + 1} з ${marshPasses.length}`
                  : 'Єдиний мультимодальний посадковий документ'}
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" aria-hidden="true" />
            <CheckCircle2 size={13} className="sr-only" />
            {pass.status === 'boarding'
              ? 'Посадка'
              : pass.status === 'in_progress' || pass.status === 'active'
                ? 'У дорозі'
                : 'Підтверджено'}
          </span>
        </div>

        <div className="my-2.5 flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[18px] font-extrabold leading-tight tracking-tight lg:text-[23px]">
              {pass.origin.split(',')[0]}
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold text-slate-500 dark:text-slate-300 tabular-nums">
              {formatDeparture(pass.departureAt)}
            </span>
          </div>
          <div className="flex flex-col items-center px-2">
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span className="h-[1.5px] w-6 sm:w-10 bg-current opacity-40" />
              <ArrowRight size={16} className="shrink-0" />
            </div>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Door-to-Door
            </span>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <span className="block truncate text-[18px] font-extrabold leading-tight tracking-tight lg:text-[23px]">
              {pass.destination.split(',')[0]}
            </span>
            <span className="mt-0.5 block text-[11px] font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">
              {pass.price ?? 'Ціна уточнюється'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-2.5 dark:border-slate-700/80">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums">
            <ShieldCheck size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">
              {pass.driverName ?? 'Мультимодальний маршрут'}
              {pass.seatCount ? ` · ${pass.seatCount} ${pass.seatCount === 1 ? 'місце' : 'місця'}` : ''} · 0% комісії
            </span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQrPreviewPass(pass);
              }}
              className="ds-interactive inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-[10px] font-bold text-white shadow-xs transition hover:bg-blue-700"
            >
              <QrCode size={13} />
              QR-квиток
            </button>
            <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-300">
              Маршрут <ChevronRight size={13} />
            </span>
          </div>
        </div>
      </div>

      {marshPasses.length > 1 && (
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <button
            type="button"
            aria-label="Попередній MarshPass"
            onClick={() => setPassIndex((index) => (index - 1 + marshPasses.length) % marshPasses.length)}
            className="ds-interactive grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-blue-400 dark:border-slate-700 dark:bg-[#16202B] dark:text-slate-100"
          >
            <ChevronLeft size={16} />
          </button>
          <span aria-live="polite" className="text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-300">
            Квиток {passIndex + 1} з {marshPasses.length}
          </span>
          <button
            type="button"
            aria-label="Наступний MarshPass"
            onClick={() => setPassIndex((index) => (index + 1) % marshPasses.length)}
            className="ds-interactive grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-blue-400 dark:border-slate-700 dark:bg-[#16202B] dark:text-slate-100"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );

  const renderHeroBanner = () => (
    <section
      aria-label="MARSHGO: банер про поїздки"
      className="home-canonical-banner home-banner relative flex shrink-0 flex-col justify-between overflow-hidden rounded-[22px] border border-white/80 p-4 lg:p-6 shadow-[0_12px_32px_-8px_rgba(14,31,53,0.14)]"
    >
      <img
        src={activeBanner.image}
        alt=""
        style={{ objectPosition: activeBanner.imagePosition }}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700"
      />
      <span aria-hidden="true" className="home-banner-scrim absolute inset-0" />
      <div className="relative z-10 max-w-[85%] lg:max-w-[78%]">
        <p className="text-[9px] lg:text-[10px] font-extrabold uppercase tracking-[.14em] text-blue-700 dark:text-sky-300">
          {activeBanner.eyebrow}
        </p>
        <h1 className="mt-1 text-[16px] lg:text-[23px] font-extrabold leading-tight tracking-tight text-[#0E1F35] dark:text-white [text-wrap:balance]">
          {activeBanner.title}
        </h1>
        <p className="mt-1.5 text-[10px] lg:text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-200 max-w-xl">
          {activeBanner.description}
        </p>
      </div>
      <div className="relative z-10 mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={
            activeBanner.action === 'publish'
              ? onPlanTrip
              : activeBanner.action === 'navigation'
                ? onStartNavigation
                : onSearchTrip
          }
          className="ds-interactive inline-flex min-h-10 lg:min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[11px] lg:text-xs font-bold text-white shadow-md shadow-blue-900/20 transition hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          {activeBanner.actionLabel}
          <ArrowRight size={14} />
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="Банери MARSHGO">
          {banners.map((banner, index) => (
            <button
              key={banner.eyebrow}
              type="button"
              aria-label={`Показати банер ${index + 1}: ${banner.eyebrow}`}
              aria-pressed={bannerIndex === index}
              onClick={() => setBannerIndex(index)}
              className="grid size-8 lg:size-9 shrink-0 place-items-center"
            >
              <span
                aria-hidden="true"
                className={`h-2 rounded-full transition-all ${bannerIndex === index ? 'w-6 bg-blue-600 dark:bg-sky-400' : 'w-2 bg-slate-400/60'}`}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );

  return (
    <main
      ref={root}
      className={`home-hero home-hero--canonical mx-auto flex w-full max-w-xl lg:max-w-[1360px] flex-col px-4 lg:px-2 pb-2 pt-1 ${availableHeight ? 'overflow-hidden' : ''}`}
      style={availableHeight ? { height: availableHeight } : undefined}
    >
      {/* Top interactive bar: Hub city selector + Unboxed telemetry metadata + MarshPass controls */}
      <div className="mb-2.5 lg:mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setCityMenuOpen((prev) => !prev)}
            className="home-city-pill inline-flex min-h-9 shrink-0 items-center gap-2 self-start rounded-xl border border-[#DFE7F1] bg-white px-3.5 text-xs lg:text-sm font-bold text-[#14243B] shadow-2xs transition hover:border-blue-400 dark:border-[#24374C] dark:bg-[#111B27] dark:text-white whitespace-nowrap"
          >
            <MapPin size={15} className="text-blue-600 dark:text-sky-400" />
            <span>Хаб: {selectedCity}</span>
            <ChevronRight size={14} className={`text-slate-400 transition-transform ${cityMenuOpen ? '-rotate-90' : 'rotate-90'}`} />
          </button>

          {cityMenuOpen && (
            <div className="absolute left-0 top-11 z-30 flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl dark:border-[#24374C] dark:bg-[#111B27] min-w-[260px]">
              {hubCities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => {
                    setSelectedCity(city);
                    setCityMenuOpen(false);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                    selectedCity === city
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-blue-50 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          )}

          <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>24 обласні центри</span>
            <span aria-hidden="true">·</span>
            <span>GTFS + OSRM + Попутки</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">0% комісії Community</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCanonicalShowcase && (
            <button
              type="button"
              onClick={onOpenCanonicalShowcase}
              className="hidden sm:inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-[#111B27] dark:text-slate-200 whitespace-nowrap shrink-0"
            >
              <Compass size={14} className="text-blue-600 dark:text-sky-400" />
              <span>Канонічний маршрут Львів → Київ</span>
            </button>
          )}
          {marshPasses.length > 0 && onOpenAllTrips && (
            <button
              type="button"
              onClick={onOpenAllTrips}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/90 px-3 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 whitespace-nowrap shrink-0"
            >
              <Ticket size={13} />
              <span>Квитки ({marshPasses.length})</span>
            </button>
          )}
          {marshPasses.length > 0 && (
            <button
              type="button"
              onClick={() => setForceShowHero((v) => !v)}
              className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 transition hover:border-blue-300 dark:border-slate-700 dark:bg-[#111B27] dark:text-slate-300 whitespace-nowrap shrink-0"
            >
              <Sparkles size={12} className="text-blue-600 dark:text-blue-400" />
              <span>{forceShowHero ? 'MarshPass' : 'Огляд платформи'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile / Tablet single-slot view (preserves strict canonical height budget) */}
      <div className="mb-3 lg:hidden">
        {activePass ? renderMarshPassCard(activePass) : renderHeroBanner()}
      </div>

      {/* Desktop 2-column showcase: MarshPass + Hero Banner side-by-side when pass exists */}
      <div className="mb-4 hidden lg:grid lg:grid-cols-12 lg:gap-5 lg:items-stretch">
        {marshPasses.length > 0 && !forceShowHero ? (
          <>
            <div className="lg:col-span-6 flex flex-col justify-stretch">
              {renderMarshPassCard(marshPasses[passIndex] ?? marshPasses[0])}
            </div>
            <div className="lg:col-span-6 flex flex-col justify-stretch">
              {renderHeroBanner()}
            </div>
          </>
        ) : (
          <div className="lg:col-span-12">{renderHeroBanner()}</div>
        )}
      </div>

      {/* 4 Canonical Action Cards (Section 4.2: Навігація, Карта транспорту, Опублікувати поїздку, Знайти маршрут — без дублювання полів пошуку) */}
      <div className="home-action-grid grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-4" aria-label="Швидкі дії">
        {actions.map(({ title, subtitle, kicker, tone, icon: Icon }) => (
          <button
            key={tone}
            type="button"
            onClick={() => runAction(tone)}
            className={`ds-interactive home-action-card home-action-card--${tone} group relative flex min-h-[112px] lg:min-h-[142px] flex-col items-center lg:items-start justify-center lg:justify-between gap-2.5 overflow-hidden rounded-[22px] border p-3.5 lg:p-5 text-center lg:text-left text-white transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[.98]`}
          >
            <div className="flex w-full items-center justify-center lg:justify-between">
              <span className="home-action-icon relative z-10 grid h-10 w-10 lg:h-11 lg:w-11 place-items-center rounded-2xl">
                <Icon size={21} strokeWidth={2.3} />
              </span>
              <span className="hidden lg:inline-block text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/85">
                {kicker}
              </span>
            </div>
            <span className="relative z-10 w-full">
              <span className="min-w-0">
                <span className="flex items-center justify-center lg:justify-between gap-1 text-[14px] lg:text-[17px] font-extrabold leading-tight tracking-tight">
                  <span>{title}</span>
                  <ArrowRight size={15} className="hidden lg:inline-block shrink-0 opacity-75 transition-transform group-hover:translate-x-1 group-hover:opacity-100" />
                </span>
                <span className="mt-1 block text-[11px] lg:text-xs font-medium leading-snug text-white/90">{subtitle}</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Popular Multimodal Corridors */}
      <section className="home-popular-routes mt-3 lg:mt-6 min-h-0" aria-labelledby="popular-routes-title">
        <div className="mb-2 lg:mb-3.5 flex items-end justify-between px-1">
          <div>
            <h2 id="popular-routes-title" className="text-sm lg:text-lg font-extrabold tracking-tight text-[#0E1F35] dark:text-slate-100">
              Популярні мультимодальні коридори
            </h2>
            <p className="hidden lg:block mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Миттєвий розрахунок ланцюжка «Поїзд + Автобус + Попутка + Міський транспорт» з живими тарифами
            </p>
          </div>
          <button
            type="button"
            onClick={onSearchTrip}
            className="text-[11px] lg:text-xs font-bold text-blue-600 hover:underline dark:text-sky-400 whitespace-nowrap shrink-0"
          >
            Усі 24 обласні центри <ChevronRight className="inline" size={14} />
          </button>
        </div>

        <div className="no-scrollbar flex lg:grid lg:grid-cols-3 gap-2.5 lg:gap-4 overflow-x-auto pb-1">
          {popularRoutes.map(({ city, from, meta, duration, priceHint, image }) => (
            <button
              key={`${from}-${city}`}
              type="button"
              onClick={() => onSearchDestination(city, from)}
              className="ds-interactive home-popular-route group relative h-[68px] lg:h-[112px] min-w-[142px] flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-900 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700/80"
            >
              <img
                src={image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-950/48 to-slate-950/12" />
              <div className="absolute inset-x-2.5 lg:inset-x-4 bottom-2 lg:bottom-3.5 top-2 lg:top-3 flex flex-col justify-between">
                <div className="hidden lg:flex items-center justify-between gap-2 text-[10px] font-semibold text-white/90">
                  <span className="truncate text-sky-300">{meta}</span>
                  <span className="shrink-0 font-mono tabular-nums text-emerald-300">{priceHint}</span>
                </div>
                <div className="mt-auto">
                  <span className="flex items-center justify-between gap-1 text-[11px] lg:text-base font-extrabold leading-tight text-white">
                    <span>
                      {from} → {city}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] lg:text-xs font-mono tabular-nums font-semibold text-white/85">
                      <span className="hidden sm:inline">{duration}</span>
                      <ChevronRight size={15} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Instant MarshPass QR Code Modal */}
      {qrPreviewPass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
          onClick={() => setQrPreviewPass(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-2xl dark:border-slate-700 dark:bg-[#111B27]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-left">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-white">
                  <Ticket size={16} />
                </span>
                <div>
                  <strong className="block text-xs font-extrabold tracking-wider text-slate-900 dark:text-white">
                    MARSHGO MARSH PASS
                  </strong>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    Криптографічний підпис HMAC-SHA256
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQrPreviewPass(null)}
                aria-label="Закрити QR"
                className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            <div className="my-3 text-left rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                {qrPreviewPass.origin.split(',')[0]} → {qrPreviewPass.destination.split(',')[0]}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300 tabular-nums">
                {formatDeparture(qrPreviewPass.departureAt)} · {qrPreviewPass.price ?? 'Тариф включено'}
              </p>
            </div>

            <div className="mx-auto flex justify-center rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700">
              <TicketQr token={signedQrToken || `MGPASS.${qrPreviewPass.id}`} />
            </div>

            {qrExpiresAt && (
              <p className="mt-2 text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                Дійсний до: {formatDeparture(qrExpiresAt)} · Формат MARSHGO_SIGNED_QR_V1
              </p>
            )}

            {qrVerifyState && (
              <p className="mt-1.5 rounded-xl bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {qrVerifyState}
              </p>
            )}

            <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              Покажіть цей QR-код водієві попутки або контролеру на посадці. Комісія платформи для попуток — 0%.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {signedQrToken && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/v1/bookings/verify-ticket', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ token: signedQrToken }),
                      });
                      const json = await res.json();
                      if (res.ok && json?.data?.valid) {
                        setQrVerifyState(`Підпис HMAC-SHA256 підтверджено (${json.data.seatCount} місц.)`);
                      } else {
                        setQrVerifyState('Помилка перевірки криптографічного підпису');
                      }
                    } catch {
                      setQrVerifyState('Сервер перевірки тимчасово недоступний');
                    }
                  }}
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-50 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  Перевірити криптопідпис HMAC-SHA256
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const target = qrPreviewPass;
                  setQrPreviewPass(null);
                  target.onOpen();
                }}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                Відкрити деталі поїздки
              </button>
              <button
                type="button"
                onClick={() => setQrPreviewPass(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
