import { ArrowLeft, ArrowRight, CarFront, CheckCircle2, MapPin, ShieldCheck, Users } from 'lucide-react';

/** "Запланувати поїздку": the role is chosen for this trip only ("I drive" / "I want a ride"), never as a global account switch. */
export function PlanTripChoice({
  onBack,
  onAsDriver,
  onAsPassenger,
}: {
  onBack: () => void;
  onAsDriver: () => void;
  onAsPassenger: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-5xl px-5 pb-10 pt-2">
      <div className="mb-6 flex items-center gap-3.5">
        <button
          onClick={onBack}
          aria-label="Назад"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-200/80 bg-white text-slate-700 shadow-2xs transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-[#111B27] dark:text-slate-100"
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <p className="text-xs font-semibold text-blue-600 dark:text-sky-400">MARSHGO Community · 0% сервісного збору</p>
          <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight text-[#0E1F35] dark:text-white">
            Як ви плануєте поїздку?
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Driver Option */}
        <button
          type="button"
          onClick={onAsDriver}
          className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 text-left shadow-[0_10px_30px_-10px_rgba(14,31,53,0.08)] transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl dark:border-[#24374C] dark:bg-[#111820]"
        >
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/25">
                <CarFront size={26} />
              </span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Для водіїв · 0% комісії
              </span>
            </div>

            <b className="mt-5 block text-lg lg:text-xl font-extrabold tracking-tight text-[#0E1F35] dark:text-white">
              Я їду автомобілем
            </b>
            <small className="mt-1.5 block text-xs lg:text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Шукаю попутників: вкажіть маршрут, дату й час виїзду, кількість вільних місць та ціну за місце.
            </small>

            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Уся сума від пасажирів залишається вам без утримань</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-blue-600 dark:text-sky-400" />
                <span>Автоматичний підбір попутників вздовж вашої траси OSRM</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="shrink-0 text-blue-600 dark:text-sky-400" />
                <span>Посадка за криптографічним QR-токеном MarshPass</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl bg-[#F5F8FD] px-4 py-3 text-xs font-extrabold text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-[#16202B] dark:text-sky-400 dark:group-hover:bg-blue-600 dark:group-hover:text-white">
            <span>Опублікувати поїздку водія</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </div>
        </button>

        {/* Passenger Reverse-Marketplace Option */}
        <button
          type="button"
          onClick={onAsPassenger}
          className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 text-left shadow-[0_10px_30px_-10px_rgba(14,31,53,0.08)] transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-xl dark:border-[#24374C] dark:bg-[#111820]"
        >
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-600/25">
                <Users size={26} />
              </span>
              <span className="text-xs font-semibold text-blue-600 dark:text-sky-400">
                Зворотний маркетплейс · Торги
              </span>
            </div>

            <b className="mt-5 block text-lg lg:text-xl font-extrabold tracking-tight text-[#0E1F35] dark:text-white">
              Я хочу поїхати
            </b>
            <small className="mt-1.5 block text-xs lg:text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Шукаю водія: вкажіть звідки, куди, зручне часове вікно, кількість пасажирів та власний бюджет.
            </small>

            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Водії самі надсилають пропозиції під ваш графік і бюджет</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Підтримка опцій: багаж, домашні тварини, дитяче крісло</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Жива карта зустрічі Rendezvous за 15 хв до посадки</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl bg-[#F5F8FD] px-4 py-3 text-xs font-extrabold text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white dark:bg-[#16202B] dark:text-emerald-400 dark:group-hover:bg-emerald-600 dark:group-hover:text-white">
            <span>Створити заявку пасажира</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      </div>
    </div>
  );
}
