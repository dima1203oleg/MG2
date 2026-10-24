import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CarFront,
  CheckCircle2,
  Clock3,
  CreditCard,
  Plus,
  Receipt,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react';

type PartnerOrganization = {
  id: string;
  legal_name: string;
  display_name: string;
  partner_type: string;
  registration_code: string;
  contact_email: string;
  contact_phone: string;
  city?: string;
  dispatch_mode?: string;
  service_modes?: string[];
  status: string;
  verified_at?: string | null;
  role: string;
};

type PartnerApplication = {
  id: string;
  organization_id: string;
  legal_name?: string;
  display_name?: string;
  partner_type: string;
  status: string;
  submitted_at: string;
  review_notes?: string | null;
};

type PartnerFleetItem = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  seats: number;
  category: string;
  status: string;
  route?: string;
};

type PartnerOrder = {
  id: string;
  passengerName: string;
  route: string;
  departureAt: string;
  seats: number;
  totalMinor: number;
  commissionMinor: number;
  carrierNetMinor: number;
  status: string;
};

type PartnerTariff = {
  id: string;
  name: string;
  baseMinor: number;
  perKmMinor: number;
  currency: string;
  commissionPercent: number;
};

const partnerTypes: Record<string, string> = {
  taxi_fleet: 'Таксопарк',
  bus_carrier: 'Автобусний перевізник',
  minibus_carrier: 'Маршрутні перевезення',
  transfer_service: 'Трансферний сервіс',
  car_rental: 'Оренда авто',
  carsharing: 'Каршеринг',
  micromobility: 'Мікромобільність (вело / самокати)',
  corporate_fleet: 'Корпоративний автопарк',
};

const formatUah = (minor: number) => `${(minor / 100).toFixed(0)} ₴`;

export function PartnerPortalPanel({ onBack }: { onBack?: () => void }) {
  const [organizations, setOrganizations] = useState<PartnerOrganization[]>([]);
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [fleetByOrg, setFleetByOrg] = useState<Record<string, PartnerFleetItem[]>>({});
  const [ordersByOrg, setOrdersByOrg] = useState<Record<string, PartnerOrder[]>>({});
  const [tariffsByOrg, setTariffsByOrg] = useState<Record<string, PartnerTariff[]>>({});
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'fleet' | 'orders' | 'tariffs'>('fleet');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAddFleet, setShowAddFleet] = useState(false);
  const [showAddTariff, setShowAddTariff] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [orgForm, setOrgForm] = useState({
    legalName: '',
    displayName: '',
    partnerType: 'bus_carrier',
    registrationCode: '',
    contactEmail: '',
    contactPhone: '+380',
    coverageRegions: 'Львівська, Київська, Рівненська',
    fleetSummary: 'Міжміські автобуси та мікроавтобуси Євро-6, GPS-трекінг у реальному часі',
  });

  const [fleetForm, setFleetForm] = useState({
    plate: '',
    make: 'Mercedes-Benz',
    model: 'Sprinter 519 CDI',
    year: 2024,
    seats: 19,
    category: 'minibus',
    route: 'Львів — Київ',
  });

  const [tariffForm, setTariffForm] = useState({
    name: '',
    baseUah: '90',
    perKmUah: '2.80',
  });

  const loadPartnerData = useCallback(async () => {
    try {
      const [meRes, orgsRes] = await Promise.all([
        fetch('/api/v1/partner/me', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/v1/partner/organizations', { credentials: 'include' }).then((r) => r.json()),
      ]);
      const orgList: PartnerOrganization[] =
        orgsRes.organizations ?? orgsRes.data ?? meRes.organizations ?? meRes.data?.organizations ?? [];
      setOrganizations(orgList);
      setApplications(meRes.applications ?? meRes.data?.applications ?? []);
      const activeOrgId = selectedOrgId || orgList[0]?.id || '';
      if (activeOrgId) {
        setSelectedOrgId(activeOrgId);
        const [fleetRes, ordersRes, tariffsRes] = await Promise.all([
          fetch(`/api/v1/partner/organizations/${activeOrgId}/fleet`, { credentials: 'include' }).then((r) => r.json()),
          fetch(`/api/v1/partner/organizations/${activeOrgId}/orders`, { credentials: 'include' }).then((r) => r.json()),
          fetch(`/api/v1/partner/organizations/${activeOrgId}/tariffs`, { credentials: 'include' }).then((r) => r.json()),
        ]);
        setFleetByOrg((prev) => ({ ...prev, [activeOrgId]: fleetRes.fleet ?? fleetRes.data ?? [] }));
        setOrdersByOrg((prev) => ({ ...prev, [activeOrgId]: ordersRes.orders ?? ordersRes.data ?? [] }));
        setTariffsByOrg((prev) => ({ ...prev, [activeOrgId]: tariffsRes.tariffs ?? tariffsRes.data ?? [] }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося завантажити дані партнерського кабінету.');
    }
  }, [selectedOrgId]);

  useEffect(() => {
    void loadPartnerData();
  }, [loadPartnerData]);

  const submitOnboarding = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/v1/partner/applications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          legalName: orgForm.legalName,
          displayName: orgForm.displayName,
          partnerType: orgForm.partnerType,
          registrationCode: orgForm.registrationCode,
          contactEmail: orgForm.contactEmail,
          contactPhone: orgForm.contactPhone,
          coverageRegions: orgForm.coverageRegions.split(',').map((s) => s.trim()).filter(Boolean),
          fleetSummary: orgForm.fleetSummary,
        }),
      });
      if (!response.ok) throw new Error('Не вдалося подати заявку партнера.');
      setShowOnboarding(false);
      setMessage('Заявку B2B-партнера зареєстровано й передано на перевірку адміністратору MARSHGO.');
      await loadPartnerData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Помилка подання заявки.');
    } finally {
      setBusy(false);
    }
  };

  const submitFleetVehicle = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrgId) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/partner/organizations/${selectedOrgId}/fleet`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fleetForm),
      });
      if (!response.ok) throw new Error('Не вдалося додати транспортний засіб до автопарку.');
      setShowAddFleet(false);
      setFleetForm({ ...fleetForm, plate: '' });
      setMessage('Транспортний засіб додано до партнерського автопарку.');
      await loadPartnerData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Помилка додавання ТЗ.');
    } finally {
      setBusy(false);
    }
  };

  const submitTariff = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrgId) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/partner/organizations/${selectedOrgId}/tariffs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: tariffForm.name,
          baseMinor: Math.round(Number(tariffForm.baseUah) * 100),
          perKmMinor: Math.round(Number(tariffForm.perKmUah) * 100),
          commissionPercent: 8,
        }),
      });
      if (!response.ok) throw new Error('Не вдалося зберегти тариф.');
      setShowAddTariff(false);
      setTariffForm({ name: '', baseUah: '90', perKmUah: '2.80' });
      setMessage('Новий тариф перевізника збережено та активовано.');
      await loadPartnerData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Помилка збереження тарифу.');
    } finally {
      setBusy(false);
    }
  };

  const activeOrg = organizations.find((o) => o.id === selectedOrgId) ?? organizations[0];
  const currentFleet = activeOrg ? (fleetByOrg[activeOrg.id] ?? []) : [];
  const currentOrders = activeOrg ? (ordersByOrg[activeOrg.id] ?? []) : [];
  const currentTariffs = activeOrg ? (tariffsByOrg[activeOrg.id] ?? []) : [];

  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-5xl px-5 pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Назад" className="ds-interactive grid h-10 w-10 place-items-center rounded-full border border-slate-200/80 bg-white shadow-sm dark:border-[#24374C] dark:bg-[#111820] dark:text-white">
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-600 dark:text-[#4DA0FF]">MARSHGO Partner · B2B Платформа</p>
            <h1 className="text-xl font-extrabold text-[#0E1F35] dark:text-white">Кабінет перевізника і партнера</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowOnboarding((v) => !v)}
          className="ds-interactive inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm"
        >
          <Plus size={14} /> Нова організація
        </button>
      </div>

      {message && (
        <p role="status" className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200">
          {message}
        </p>
      )}

      {showOnboarding && (
        <form onSubmit={submitOnboarding} className="mb-5 space-y-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold dark:text-white">Подати заявку B2B-партнера</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-[#4DA0FF]"><span className="h-1.5 w-1.5 rounded-full bg-blue-500"/>KYB · Верифікація</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input required placeholder="Юридична назва (ТОВ / ФОП)" value={orgForm.legalName} onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold dark:bg-[#18222F] dark:text-white" />
            <input required placeholder="Публічна назва бренду" value={orgForm.displayName} onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold dark:bg-[#18222F] dark:text-white" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select value={orgForm.partnerType} onChange={(e) => setOrgForm({ ...orgForm, partnerType: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold dark:bg-[#18222F] dark:text-white">
              {Object.entries(partnerTypes).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input required placeholder="Код ЄДРПОУ / ІПН" value={orgForm.registrationCode} onChange={(e) => setOrgForm({ ...orgForm, registrationCode: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold tabular-nums dark:bg-[#18222F] dark:text-white" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input required type="email" placeholder="Корпоративний email" value={orgForm.contactEmail} onChange={(e) => setOrgForm({ ...orgForm, contactEmail: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold dark:bg-[#18222F] dark:text-white" />
            <input required type="tel" placeholder="+380 телефон диспетчерської" value={orgForm.contactPhone} onChange={(e) => setOrgForm({ ...orgForm, contactPhone: e.target.value })} className="rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold tabular-nums dark:bg-[#18222F] dark:text-white" />
          </div>
          <input placeholder="Області покриття (через кому)" value={orgForm.coverageRegions} onChange={(e) => setOrgForm({ ...orgForm, coverageRegions: e.target.value })} className="w-full rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold dark:bg-[#18222F] dark:text-white" />
          <textarea rows={2} placeholder="Опис автопарку, GTFS/GBFS/GPS-інтеграції та тарифної сітки" value={orgForm.fleetSummary} onChange={(e) => setOrgForm({ ...orgForm, fleetSummary: e.target.value })} className="w-full rounded-xl bg-[#f6f8fc] p-3 text-xs font-semibold dark:bg-[#18222F] dark:text-white" />
          <button type="submit" disabled={busy} className="ds-interactive w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white disabled:opacity-50">
            {busy ? 'Надсилаємо заявку…' : 'Відправити на модерацію MARSHGO Admin'}
          </button>
        </form>
      )}

      {organizations.length > 0 && (
        <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Організації партнера">
          {organizations.map((org) => {
            const isSelected = activeOrg?.id === org.id;
            return (
              <article
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className={`ds-interactive cursor-pointer rounded-2xl border p-4 shadow-sm transition ${
                  isSelected
                    ? 'border-blue-500 bg-white ring-2 ring-blue-500/15 dark:border-[#4DA0FF] dark:bg-[#111820]'
                    : 'border-slate-200/70 bg-white hover:border-blue-200 dark:border-[#24374C] dark:bg-[#111820]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-[#4DA0FF]">
                      <Building2 size={20} />
                    </span>
                    <div>
                      <b className="block text-sm font-extrabold text-[#0E1F35] dark:text-white">{org.display_name}</b>
                      <p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">{org.legal_name} · ЄДРПОУ {org.registration_code}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${org.status === 'active' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {org.status === 'active' ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                    {org.status === 'active' ? 'АКТИВНИЙ ПАРТНЕР' : 'НА ПЕРЕВІРЦІ'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#f6f8fc] p-2.5 text-center dark:bg-[#18222F]">
                  <div>
                    <span className="block text-[10px] text-slate-400">Тип</span>
                    <b className="text-[11px] dark:text-white">{partnerTypes[org.partner_type] ?? org.partner_type}</b>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Режим</span>
                    <b className="text-[11px] dark:text-white">{org.dispatch_mode === 'INTEGRATION_ONLY' ? 'API / GTFS' : 'Диспетчерська'}</b>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Місто</span>
                    <b className="text-[11px] dark:text-white">{org.city || 'Україна'}</b>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
                  Контакти диспетчерської: {org.contact_email} · {org.contact_phone}
                </p>
              </article>
            );
          })}
        </section>
      )}

      {activeOrg && (
        <>
          <div role="tablist" aria-label="Розділи кабінету партнера" className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-[#EEF3F9] p-1 text-xs dark:bg-[#142030]">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'fleet'}
              onClick={() => setActiveSubTab('fleet')}
              className={`ds-interactive inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-extrabold transition tabular-nums ${
                activeSubTab === 'fleet' ? 'bg-white text-[#1789F4] shadow-xs dark:bg-[#1E2E42] dark:text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Truck size={14} /> Автопарк ({currentFleet.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'orders'}
              onClick={() => setActiveSubTab('orders')}
              className={`ds-interactive inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-extrabold transition tabular-nums ${
                activeSubTab === 'orders' ? 'bg-white text-[#1789F4] shadow-xs dark:bg-[#1E2E42] dark:text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Receipt size={14} /> Замовлення ({currentOrders.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'tariffs'}
              onClick={() => setActiveSubTab('tariffs')}
              className={`ds-interactive inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 font-extrabold transition tabular-nums ${
                activeSubTab === 'tariffs' ? 'bg-white text-[#1789F4] shadow-xs dark:bg-[#1E2E42] dark:text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <CreditCard size={14} /> Тарифи ({currentTariffs.length})
            </button>
          </div>

          {activeSubTab === 'fleet' && (
            <section className="mb-5 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck size={17} className="text-blue-600 dark:text-[#4DA0FF]" />
                  <div>
                    <h2 className="text-sm font-extrabold dark:text-white">Автопарк і рухомий склад</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{activeOrg.display_name} · підключено до маршрутизатора та живого GPS</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowAddFleet((v) => !v)} className="ds-interactive inline-flex items-center gap-1 rounded-xl bg-[#EAF3FF] px-3 py-1.5 text-xs font-bold text-[#1789F4] dark:bg-blue-950/60 dark:text-[#4DA0FF]">
                  <Plus size={14} /> Додати ТЗ
                </button>
              </div>

              {showAddFleet && (
                <form onSubmit={submitFleetVehicle} className="mb-3 space-y-2 rounded-xl bg-[#f6f8fc] p-3 dark:bg-[#18222F]">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input required placeholder="Держномер (BC 4510 AA)" value={fleetForm.plate} onChange={(e) => setFleetForm({ ...fleetForm, plate: e.target.value.toUpperCase() })} className="rounded-lg bg-white p-2 text-xs font-bold dark:bg-[#111820] dark:text-white" />
                    <input required placeholder="Марка (Mercedes-Benz)" value={fleetForm.make} onChange={(e) => setFleetForm({ ...fleetForm, make: e.target.value })} className="rounded-lg bg-white p-2 text-xs font-bold dark:bg-[#111820] dark:text-white" />
                    <input required placeholder="Маршрут (Львів — Київ)" value={fleetForm.route} onChange={(e) => setFleetForm({ ...fleetForm, route: e.target.value })} className="rounded-lg bg-white p-2 text-xs font-bold dark:bg-[#111820] dark:text-white" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input required placeholder="Модель" value={fleetForm.model} onChange={(e) => setFleetForm({ ...fleetForm, model: e.target.value })} className="rounded-lg bg-white p-2 text-xs font-bold dark:bg-[#111820] dark:text-white" />
                    <input required type="number" min={2000} max={2027} value={fleetForm.year} onChange={(e) => setFleetForm({ ...fleetForm, year: Number(e.target.value) })} className="rounded-lg bg-white p-2 text-xs font-bold tabular-nums dark:bg-[#111820] dark:text-white" />
                    <input required type="number" min={1} max={80} value={fleetForm.seats} onChange={(e) => setFleetForm({ ...fleetForm, seats: Number(e.target.value) })} className="rounded-lg bg-white p-2 text-xs font-bold tabular-nums dark:bg-[#111820] dark:text-white" />
                  </div>
                  <button type="submit" disabled={busy} className="ds-interactive w-full rounded-lg bg-blue-600 py-2 text-xs font-bold text-white">Зберегти ТЗ у реєстрі партнера</button>
                </form>
              )}

              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {currentFleet.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl bg-[#f6f8fc] p-3 dark:bg-[#18222F]">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-blue-600 shadow-xs dark:bg-[#111820] dark:text-[#4DA0FF]">
                        <CarFront size={17} />
                      </span>
                      <div>
                        <b className="block text-xs font-extrabold dark:text-white">{item.make} {item.model} · {item.plate}</b>
                        <span className="block text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                          {item.year} р. · <Users size={11} className="inline" /> {item.seats} місць · {item.route || item.category}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>
                      {item.status === 'active' ? 'На лінії · GPS' : item.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeSubTab === 'orders' && (
            <section className="mb-5 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold dark:text-white">Диспетчерська відомість та замовлення B2B</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Комерційні рейси перевізника (комісія B2B-маркетплейсу 8%, приватні попутки Community — 0%)</p>
                </div>
              </div>
              {currentOrders.length === 0 ? (
                <p className="rounded-xl bg-[#f6f8fc] p-4 text-xs text-slate-500 dark:bg-[#18222F] dark:text-slate-400">Для цієї організації активних B2B-бронювань ще немає.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  {currentOrders.map((ord) => (
                    <article key={ord.id} className="rounded-xl bg-[#f6f8fc] p-3.5 dark:bg-[#18222F]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <b className="block text-xs font-extrabold text-[#0E1F35] dark:text-white">{ord.route}</b>
                          <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">Пасажир: {ord.passengerName} · {ord.seats} місць</span>
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>
                          {ord.status === 'CONFIRMED' ? 'Підтверджено' : 'Призначено ТЗ'}
                        </span>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg bg-white p-2 text-center text-[11px] tabular-nums dark:bg-[#111820]">
                        <div>
                          <span className="block text-[9px] text-slate-400">Сума квитків</span>
                          <b className="dark:text-white">{formatUah(ord.totalMinor)}</b>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400">Комісія B2B (8%)</span>
                          <b className="text-slate-600 dark:text-slate-300">{formatUah(ord.commissionMinor)}</b>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400">Виплата перевізнику</span>
                          <b className="text-emerald-700 dark:text-emerald-400">{formatUah(ord.carrierNetMinor)}</b>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeSubTab === 'tariffs' && (
            <section className="mb-5 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold dark:text-white">Тарифні плани перевізника</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Використовуються для автоматичного розрахунку вартості квитків у мультимодальному пошуку</p>
                </div>
                <button type="button" onClick={() => setShowAddTariff((v) => !v)} className="ds-interactive inline-flex items-center gap-1 rounded-xl bg-[#EAF3FF] px-3 py-1.5 text-xs font-bold text-[#1789F4] dark:bg-blue-950/60 dark:text-[#4DA0FF]">
                  <Plus size={14} /> Додати тариф
                </button>
              </div>

              {showAddTariff && (
                <form onSubmit={submitTariff} className="mb-3 grid grid-cols-1 gap-2 rounded-xl bg-[#f6f8fc] p-3 sm:grid-cols-4 dark:bg-[#18222F]">
                  <input required placeholder="Назва тарифу" value={tariffForm.name} onChange={(e) => setTariffForm({ ...tariffForm, name: e.target.value })} className="rounded-lg bg-white p-2 text-xs font-bold sm:col-span-2 dark:bg-[#111820] dark:text-white" />
                  <input required type="number" step="1" placeholder="Базова подача, ₴" value={tariffForm.baseUah} onChange={(e) => setTariffForm({ ...tariffForm, baseUah: e.target.value })} className="rounded-lg bg-white p-2 text-xs font-bold tabular-nums dark:bg-[#111820] dark:text-white" />
                  <input required type="number" step="0.1" placeholder="За 1 км, ₴" value={tariffForm.perKmUah} onChange={(e) => setTariffForm({ ...tariffForm, perKmUah: e.target.value })} className="rounded-lg bg-white p-2 text-xs font-bold tabular-nums dark:bg-[#111820] dark:text-white" />
                  <button type="submit" disabled={busy} className="ds-interactive rounded-lg bg-blue-600 py-2 text-xs font-bold text-white sm:col-span-4">Зберегти тариф</button>
                </form>
              )}

              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {currentTariffs.map((tar) => (
                  <div key={tar.id} className="flex items-center justify-between rounded-xl bg-[#f6f8fc] p-3.5 dark:bg-[#18222F]">
                    <div>
                      <b className="block text-xs font-extrabold dark:text-white">{tar.name}</b>
                      <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        База: {(tar.baseMinor / 100).toFixed(0)} ₴ · Кілометр: {(tar.perKmMinor / 100).toFixed(2)} ₴/км
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-blue-700 tabular-nums dark:text-[#4DA0FF]">
                      Комісія B2B {tar.commissionPercent}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {applications.length > 0 && (
        <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-[#24374C] dark:bg-[#111820]">
          <h2 className="mb-2 text-sm font-extrabold dark:text-white">Історія заявок на підключення KYB</h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {applications.map((app) => (
              <div key={app.id} className="flex items-center justify-between rounded-xl bg-[#f6f8fc] p-3 text-xs dark:bg-[#18222F]">
                <div>
                  <b className="block font-bold dark:text-white">{app.display_name ?? app.legal_name ?? app.organization_id}</b>
                  <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">{partnerTypes[app.partner_type] ?? app.partner_type} · {new Date(app.submitted_at).toLocaleDateString('uk-UA')}</span>
                  {app.review_notes && <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">Коментар модератора: {app.review_notes}</p>}
                </div>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${app.status === 'approved' ? 'text-emerald-700 dark:text-emerald-400' : app.status === 'rejected' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${app.status === 'approved' ? 'bg-emerald-500' : app.status === 'rejected' ? 'bg-rose-500' : 'bg-amber-500'}`}/>
                  {app.status === 'approved' ? 'Схвалено' : app.status === 'rejected' ? 'Відхилено' : 'На розгляді'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
