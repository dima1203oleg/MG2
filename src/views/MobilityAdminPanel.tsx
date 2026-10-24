import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, GitBranch, Pause, Plus, Power, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { productionApi, type ApiMobilityAudit, type ApiMobilityOperator, type ApiMobilityProvider } from '../services/productionApi';

const healthMeta = { healthy: ['🟢', 'Працює', 'bg-emerald-50 text-emerald-700'], degraded: ['🟡', 'Частково', 'bg-amber-50 text-amber-800'], offline: ['🔴', 'Недоступний', 'bg-rose-50 text-rose-700'], unknown: ['⚪', 'Не перевірено', 'bg-slate-100 text-slate-600'] } as const;
const typeLabels: Record<string, string> = { public_transit: 'Громадський транспорт', bike: 'Велосипеди', ebike: 'E-bike', scooter: 'Самокати', moped: 'Мопеди', carsharing: 'Каршерінг', taxi: 'Таксі', carpool: 'Carpool', on_demand: 'On-demand', other: 'Інше' };
const accessLabels: Record<string, string> = { open: 'Відкритий', requires_credentials: 'REQUIRES_CREDENTIALS', requires_partner_access: 'REQUIRES_PARTNER_ACCESS', insecure_endpoint: 'ЛИШЕ HTTP' };
const actionLabels: Record<string, string> = { 'mobility.provider.deleted': 'видалив провайдера', 'mobility.provider.created': 'створив провайдера', 'mobility.provider.updated': 'змінив провайдера', 'mobility.provider.tested': 'перевірив підключення', 'release.production.verified': 'підтвердив готовність production-релізу v2.4.0' };
const operatorStatusLabels: Record<string, string> = { ACTIVE_LIVE: 'Живі дані', ACTIVE_STATIC: 'Статичні дані', CATALOG_ONLY: 'Каталог без live-підтвердження', AFFILIATE_LINK_ONLY: 'Лише партнерське посилання', SANDBOX_ONLY: 'Sandbox', AWAITING_CREDENTIALS: 'Очікує облікові дані', AWAITING_AGREEMENT: 'Очікує угоду', DISABLED: 'Вимкнений', ERROR: 'Помилка' };
const operatorGroups: Record<string, string> = { TAXI: 'Таксі', TRANSFER: 'Трансфери', SCOOTER: 'Самокати', BICYCLE: 'Велосипеди', CARSHARING: 'Каршерінг', PUBLIC_TRANSPORT: 'Громадський транспорт' };
const dateFormat = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Kyiv' });

type ReleaseStatusPayload = {
  schema_version: string;
  project: string;
  release_tag: string;
  generated_at: string;
  environment: string;
  production_ready: boolean;
  status: string;
  verified_by?: string;
  verified_at?: string;
  repositories: Array<{
    name: string;
    role: string;
    url: string;
    branch: string;
    commit_sha: string;
    status: string;
  }>;
  excluded_repositories: string[];
  subsystems: Array<{
    id: string;
    label: string;
    status: string;
    latencyMs: number;
    detail: string;
  }>;
  metrics: {
    places_count: number;
    active_offers: number;
    active_bookings: number;
    active_partners: number;
    pending_partner_applications: number;
    enabled_operators: number;
  };
};

/** Mobility Control Center: connect, test, enable/disable and audit transport data sources without code changes. */
export function MobilityAdminPanel() {
  const [providers, setProviders] = useState<ApiMobilityProvider[]>([]);
  const [operators, setOperators] = useState<ApiMobilityOperator[]>([]);
  const [audit, setAudit] = useState<ApiMobilityAudit[]>([]);
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatusPayload | null>(null);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', city: '', providerType: 'bike', sourceType: 'gbfs', feedUrl: '' });

  const [partnerApps, setPartnerApps] = useState<Array<{
    id: string;
    organization_id: string;
    legal_name: string;
    display_name: string;
    partner_type: string;
    registration_code: string;
    contact_email: string;
    contact_phone: string;
    fleet_summary?: string | null;
    status: string;
    submitted_at: string;
    review_notes?: string | null;
  }>>([]);

  const load = useCallback(async () => {
    try {
      const [list, operatorList, log, partnersRes, releaseRes] = await Promise.all([
        productionApi.mobilityProviders(),
        productionApi.mobilityOperators(),
        productionApi.mobilityAudit(),
        fetch('/api/v1/admin/partners', { credentials: 'include' }).then((r) => r.ok ? r.json() : { applications: [] }).catch(() => ({ applications: [] })),
        fetch('/api/v1/admin/release-status', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      setProviders(list);
      setOperators(operatorList);
      setAudit(log);
      setPartnerApps(partnersRes.applications ?? partnersRes.data?.applications ?? []);
      if (releaseRes) setReleaseStatus(releaseRes);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не вдалося завантажити провайдерів.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (id: string, action: () => Promise<unknown>, done: string) => {
    setBusyId(id); setMessage('');
    try { await action(); setMessage(done); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Дія не виконана.'); }
    finally { setBusyId(null); }
  };

  const runProductionVerify = async () => {
    await run('release:verify', async () => {
      const res = await fetch('/api/v1/admin/release-status/verify', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Не вдалося виконати перевірку релізу.');
      const data = await res.json();
      setReleaseStatus(data);
    }, 'Production Smoke-перевірку всіх 6 репозиторіїв і 7 підсистем MARSHGO успішно підтверджено.');
  };

  const reviewPartnerApp = async (applicationId: string, action: 'approve' | 'reject' | 'suspend') => {
    await run(`partner:${applicationId}`, async () => {
      const res = await fetch(`/api/v1/admin/partners/applications/${applicationId}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: action === 'approve' ? 'Перевірено модератором MARSHGO Admin' : 'Відхилено або призупинено модератором' }),
      });
      if (!res.ok) throw new Error('Не вдалося оновити статус партнерської заявки.');
    }, action === 'approve' ? 'Партнерську організацію схвалено й активовано.' : action === 'suspend' ? 'Організацію призупинено.' : 'Заявку партнера відхилено.');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    try { await productionApi.createMobilityProvider(form); setAdding(false); setForm({ ...form, name: '', feedUrl: '' }); setMessage('Провайдера додано (вимкнений). Перевірте підключення, потім увімкніть.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не вдалося додати провайдера.'); }
  };

  return <section className="mt-6" aria-label="Центр керування мобільністю">
    {releaseStatus && (
      <div className="mb-6 rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-sm dark:border-[#224438] dark:bg-[#111820]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={13} /> {releaseStatus.status} · {releaseStatus.release_tag}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                · Central Release Orchestration (6 репозиторіїв)
              </span>
            </div>
            <h2 className="mt-1 text-base font-extrabold text-[#0E1F35] dark:text-white">
              Production-готовність системи MARSHGO (Web · PWA · iOS · Server · Admin · Partner)
            </h2>
          </div>
          <button
            type="button"
            disabled={busyId === 'release:verify'}
            onClick={() => void runProductionVerify()}
            className="ds-interactive inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <ShieldCheck size={15} />
            {busyId === 'release:verify' ? 'Перевіряємо підсистеми…' : 'Запустити Production Smoke-перевірку'}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {releaseStatus.repositories.map((repo) => (
            <div key={repo.name} className="rounded-xl border border-slate-100 bg-[#f6f8fc] p-2.5 dark:border-[#24374C] dark:bg-[#18222F]">
              <div className="flex items-center justify-between gap-1">
                <b className="truncate text-xs text-[#0E1F35] dark:text-white">{repo.name}</b>
                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                  ✓
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">{repo.role}</p>
              <p className="mt-1 flex items-center gap-1 font-mono text-[9px] text-blue-600 tabular-nums dark:text-[#4DA0FF]">
                <GitBranch size={10} /> {repo.commit_sha.slice(0, 8)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {releaseStatus.subsystems.map((sub) => (
            <div key={sub.id} className="flex items-start justify-between gap-2 rounded-xl bg-[#f6f8fc] px-3 py-2 text-[11px] dark:bg-[#18222F]">
              <div>
                <b className="block font-bold text-[#0E1F35] dark:text-white">{sub.label}</b>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{sub.detail}</span>
              </div>
              <span className="shrink-0 font-mono text-[10px] font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                {sub.latencyMs} мс
              </span>
            </div>
          ))}
        </div>
      </div>
    )}

    {partnerApps.length > 0 && (
      <div className="mb-6 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-600 dark:text-[#4DA0FF]">MARSHGO Admin · B2B KYB</p>
            <h2 className="text-base font-extrabold dark:text-white">Заявки B2B-партнерів і перевізників</h2>
          </div>
          <span className="text-xs font-bold text-blue-700 tabular-nums dark:text-[#4DA0FF]">{partnerApps.length}</span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {partnerApps.map((app) => (
            <article key={app.id} className="rounded-xl border border-slate-100 bg-[#f6f8fc] p-3 dark:border-[#24374C] dark:bg-[#18222F]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <b className="block text-sm text-[#0E1F35] dark:text-white">{app.display_name} ({app.legal_name})</b>
                  <p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">ЄДРПОУ {app.registration_code} · {app.partner_type} · {app.contact_email} · {app.contact_phone}</p>
                  {app.fleet_summary && <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{app.fleet_summary}</p>}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold ${app.status === 'approved' ? 'text-emerald-700 dark:text-emerald-400' : app.status === 'rejected' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${app.status === 'approved' ? 'bg-emerald-500' : app.status === 'rejected' ? 'bg-rose-500' : 'bg-amber-500'}`}/>
                  {app.status === 'approved' ? 'Схвалено' : app.status === 'rejected' ? 'Відхилено' : 'Очікує'}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {app.status !== 'approved' && (
                  <button type="button" disabled={busyId === `partner:${app.id}`} onClick={() => void reviewPartnerApp(app.id, 'approve')} className="ds-interactive rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                    Схвалити партнера
                  </button>
                )}
                {app.status !== 'rejected' && (
                  <button type="button" disabled={busyId === `partner:${app.id}`} onClick={() => void reviewPartnerApp(app.id, 'reject')} className="ds-interactive rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                    Відхилити
                  </button>
                )}
                {app.status === 'approved' && (
                  <button type="button" disabled={busyId === `partner:${app.id}`} onClick={() => void reviewPartnerApp(app.id, 'suspend')} className="ds-interactive rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-50 dark:border-[#24374C] dark:bg-[#111820] dark:text-slate-200">
                    Призупинити
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    )}

    <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-600 dark:text-[#4DA0FF]">Адміністрування</p><h2 className="text-lg font-extrabold dark:text-white">Центр керування мобільністю</h2></div>
      <button type="button" onClick={() => setAdding((value) => !value)} className="ds-interactive inline-flex items-center gap-1.5 rounded-xl bg-[#1789F4] px-3 py-2 text-xs font-bold text-white"><Plus size={14}/>Додати</button></div>
    {message && <p role="status" className="mb-3 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">{message}</p>}
    <div className="mb-5 space-y-2">
      <div><h3 className="text-sm font-extrabold dark:text-white">Оператори й дозволи</h3><p className="text-[11px] text-slate-500 dark:text-slate-400">Статус показує фактичний рівень джерела; ключі та партнерські значення не відображаються.</p></div>
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {operators.map((operator) => {
          const canEnable = ['ACTIVE_LIVE', 'ACTIVE_STATIC'].includes(operator.integration_status);
          const dot = operator.integration_status === 'ACTIVE_LIVE' ? '🟢' : operator.integration_status === 'ACTIVE_STATIC' ? '🔵' : operator.integration_status === 'ERROR' ? '🔴' : '🟡';
          const busyKey = `operator:${operator.provider_id}`;
          return <article key={operator.provider_id} className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate text-sm text-[#0E1F35] dark:text-white">{operator.provider_name}</b><p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">{operatorGroups[operator.provider_group] ?? operator.provider_group} · {operator.data_source} · {operator.location_count} точок · {operator.live_available_count} доступно зараз</p></div>
              <span className="shrink-0 text-[11px] font-bold text-slate-700 dark:text-slate-300">{dot} {operatorStatusLabels[operator.integration_status] ?? operator.integration_status}</span></div>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Бронювання: {operator.booking_method} · ціни: {operator.pricing_capability} · live: {operator.live_availability_capability ? 'підтримується джерелом' : 'не підтверджено'} · секрет заданий: {operator.api_key_configured ? 'так' : 'ні'}</p>
            {operator.status_message && <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">{operator.status_message}</p>}
            {operator.attribution_requirements && <p className="mt-1 text-[10px] text-slate-400">Атрибуція/умови: {operator.attribution_requirements}</p>}
            {operator.last_successful_sync && <p className="mt-1 text-[10px] text-slate-400 tabular-nums">Остання успішна синхронізація: {dateFormat.format(new Date(operator.last_successful_sync))}</p>}
            {operator.last_sync_error && <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">{operator.last_sync_error}</p>}
            <button type="button" disabled={busyId === busyKey || (!operator.enabled && !canEnable)} onClick={() => void run(busyKey, () => productionApi.updateMobilityOperator(operator.provider_id, !operator.enabled), operator.enabled ? 'Оператора вимкнено.' : 'Оператора увімкнуто.')} className={`ds-interactive mt-2 rounded-xl px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40 ${operator.enabled ? 'bg-rose-600' : 'bg-emerald-600'}`}>{operator.enabled ? 'Вимкнути' : 'Увімкнути'}</button>
          </article>;
        })}
      </div>
    </div>
    {adding && <form onSubmit={submit} className="mb-4 space-y-2 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
      <input required minLength={2} placeholder="Назва провайдера" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-[#f6f8fc] p-3 text-sm dark:bg-[#18222F] dark:text-white"/>
      <input required minLength={2} placeholder="Місто" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full rounded-xl bg-[#f6f8fc] p-3 text-sm dark:bg-[#18222F] dark:text-white"/>
      <div className="grid grid-cols-2 gap-2">
        <select value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-sm dark:bg-[#18222F] dark:text-white">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-sm dark:bg-[#18222F] dark:text-white">{['gbfs', 'gtfs', 'gtfs_rt', 'gofs', 'rest', 'json', 'csv', 'graphql', 'websocket', 'marshgo'].map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select>
      </div>
      <input required type="url" placeholder="https://… (URL фіду)" value={form.feedUrl} onChange={(e) => setForm({ ...form, feedUrl: e.target.value })} className="w-full rounded-xl bg-[#f6f8fc] p-3 text-sm dark:bg-[#18222F] dark:text-white"/>
      <button type="submit" className="ds-interactive w-full rounded-xl bg-[#0E1F35] py-3 text-sm font-bold text-white dark:bg-blue-600">Зберегти (вимкнений)</button>
      <p className="text-[11px] text-slate-400">Лише публічні https-адреси. Ключі API на сервері поки не зберігаються.</p>
    </form>}
    {providers.length === 0 ? <p className="rounded-2xl border border-slate-200/70 bg-white p-4 text-sm text-slate-500 shadow-sm dark:border-[#24374C] dark:bg-[#111820] dark:text-slate-400">Провайдерів ще немає. Додайте перший GBFS- або GTFS-фід.</p> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {providers.map((provider) => { const [dot, label] = healthMeta[provider.health]; const counts = provider.last_report.counts ?? {}; return <article key={provider.id} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate text-sm text-[#0E1F35] dark:text-white">{provider.name}</b><p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">{provider.city} · {typeLabels[provider.provider_type] ?? provider.provider_type} · {provider.source_type.toUpperCase()} · пріоритет {provider.priority}</p></div>
          <span className="shrink-0 text-[11px] font-bold text-slate-700 dark:text-slate-300">{dot} {label}</span></div>
        <p className="mt-2 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">{provider.status === 'enabled' ? 'Увімкнено' : provider.status === 'paused' ? 'Призупинено' : 'Вимкнено'}{provider.last_checked_at ? ` · перевірено ${dateFormat.format(new Date(provider.last_checked_at))}` : ''}{Object.keys(counts).length ? ` · ${[counts.vehicles && `${counts.vehicles} ТЗ`, counts.stations && `${counts.stations} станцій`, counts.stops && `${counts.stops} зупинок`, counts.routes && `${counts.routes} маршрутів`].filter(Boolean).join(', ')}` : ''}{provider.last_report.responseMs ? ` · ${provider.last_report.responseMs} мс` : ''}</p>
        {provider.last_error && <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{provider.last_error}</p>}
        {provider.access !== 'open' && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{accessLabels[provider.access]}</p>}
        {(provider.coverage || provider.license || provider.update_frequency) && <p className="mt-1 text-[10px] leading-4 text-slate-400">{[provider.coverage, provider.update_frequency && `оновлення: ${provider.update_frequency}`, provider.license && `ліцензія: ${provider.license}`].filter(Boolean).join(' · ')}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={busyId === provider.id} onClick={() => void run(provider.id, () => productionApi.testMobilityProvider(provider.id), 'Перевірку / синхронізацію завершено.')} className="ds-interactive inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-[#24374C] dark:text-slate-200"><Activity size={13}/>Перевірити / Sync</button>
          <button type="button" disabled={busyId === provider.id || (provider.status !== 'enabled' && provider.access !== 'open')} onClick={() => void run(provider.id, () => productionApi.updateMobilityProvider(provider.id, { status: provider.status === 'enabled' ? 'disabled' : 'enabled' }), provider.status === 'enabled' ? 'Провайдера вимкнено.' : 'Провайдера увімкнуто.')} className={`ds-interactive inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white disabled:opacity-40 ${provider.status === 'enabled' ? 'bg-rose-600' : 'bg-emerald-600'}`}><Power size={13}/>{provider.status === 'enabled' ? 'Вимкнути' : 'Увімкнути'}</button>
          <button type="button" disabled={busyId === provider.id || provider.status !== 'enabled'} onClick={() => void run(provider.id, () => productionApi.updateMobilityProvider(provider.id, { status: 'paused' }), 'Провайдера призупинено.')} className="ds-interactive inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-[#24374C] dark:text-slate-200"><Pause size={13}/>Призупинити</button>
          <button type="button" onClick={() => setLogsFor(logsFor === provider.id ? null : provider.id)} aria-expanded={logsFor === provider.id} className="ds-interactive rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-700 dark:border-[#24374C] dark:text-slate-200">Логи</button>
        </div>
        {logsFor === provider.id && <div className="mt-2 rounded-xl bg-[#f6f8fc] p-3 text-[11px] text-slate-600 dark:bg-[#18222F] dark:text-slate-300"><ul className="space-y-1">{(provider.last_report.checks ?? []).map((check) => <li key={check.name}>{check.ok ? '✓' : '✗'} <b className="dark:text-white">{check.name}</b>{check.detail ? ` — ${check.detail}` : ''}</li>)}{(provider.last_report.checks ?? []).length === 0 && <li>Перевірок ще не було.</li>}</ul>
          <div className="mt-2 flex flex-wrap items-center gap-2"><label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Пріоритет<input type="number" min={1} max={1000} defaultValue={provider.priority} onBlur={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value !== provider.priority) void run(provider.id, () => productionApi.updateMobilityProvider(provider.id, { priority: value }), 'Пріоритет змінено.'); }} className="ml-2 w-20 rounded-lg bg-white p-1.5 text-xs tabular-nums dark:bg-[#111820] dark:text-white"/></label>
            {confirmDeleteId === provider.id ? (
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-600 dark:border-[#24374C] dark:text-slate-300">Скасувати</button>
                <button type="button" onClick={() => { setConfirmDeleteId(null); void run(provider.id, () => productionApi.deleteMobilityProvider(provider.id), 'Провайдера видалено.'); }} className="rounded-lg bg-rose-600 px-2.5 py-1 text-[10px] font-bold text-white">Підтвердити видалення</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDeleteId(provider.id)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-rose-600 dark:text-rose-400"><Trash2 size={12}/>Видалити</button>
            )}
          </div></div>}
      </article>; })}
    </div>}
    <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-extrabold dark:text-white">Журнал дій</h3><button type="button" onClick={() => void load()} aria-label="Оновити журнал" className="ds-interactive grid h-8 w-8 place-items-center rounded-full border border-slate-200/70 bg-white shadow-sm dark:border-[#24374C] dark:bg-[#111820] dark:text-white"><RefreshCw size={14}/></button></div>
    <ul className="mt-2 space-y-1.5">{audit.slice(0, 8).map((row) => <li key={row.id} className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-sm tabular-nums dark:border-[#24374C] dark:bg-[#111820] dark:text-slate-300"><b className="text-slate-800 dark:text-white">{row.actor ?? 'Система'}</b> {actionLabels[row.action] ?? row.action} · {dateFormat.format(new Date(row.created_at))}</li>)}{audit.length === 0 && <li className="text-[11px] text-slate-400">Дій ще не було.</li>}</ul>
  </section>;
}
