import { useState } from 'react';
import { ExternalLink, MapPin, Search, Sparkles, X } from 'lucide-react';
import { productionApi } from '../services/productionApi';

type Props = {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
  latitude?: number;
  longitude?: number;
};

export function GoogleMapsExplorerSheet({ open, onClose, initialQuery = '', latitude = 49.8399, longitude = 23.9944 }: Props) {
  const [query, setQuery] = useState(initialQuery || 'Найкращі АЗС та кав’ярні поруч зі Львовом');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    text: string;
    sources: Array<{ title: string; uri: string }>;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await productionApi.searchGroundedPlaces(query.trim(), latitude, longitude);
      setResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не вдалося завантажити дані з Google Maps.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-md sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-maps-explorer-title"
        className="max-h-[90dvh] w-full max-w-xl overflow-hidden rounded-[1.8rem] border border-white/20 bg-[#0B1526]/95 text-white shadow-2xl backdrop-blur-2xl flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 text-white shadow-md">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 id="google-maps-explorer-title" className="text-base font-extrabold leading-tight text-white flex items-center gap-1.5">
                Google Maps AI Дослідник
              </h2>
              <p className="text-[11px] text-slate-400">Gemini 3.8 Flash + Google Maps Grounding</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="ds-interactive grid h-10 w-10 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4 min-h-0 flex-1">
          {/* Quick presets */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="Швидкі запити">
            {[
              'АЗС та кафе поруч',
              'Цікаві місця у Львові',
              'Парковки біля Вокзалу',
              'Спеціалізований автосервіс',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQuery(preset);
                  void productionApi
                    .searchGroundedPlaces(preset, latitude, longitude)
                    .then(setResult)
                    .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Помилка'));
                }}
                className="ds-interactive shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/15 hover:text-white"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-center rounded-xl border border-white/15 bg-white/5 px-3.5 py-3">
              <Search size={17} className="shrink-0 text-sky-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Запитайте про місця, АЗС або години роботи…"
                aria-label="Запит для Google Maps"
                className="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none text-white placeholder-slate-400 font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !query.trim()}
              className="ds-interactive shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3 text-xs font-bold text-white shadow-lg disabled:opacity-50"
            >
              {busy ? 'Шукаємо…' : 'Знайти'}
            </button>
          </form>

          {errorMsg && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {errorMsg}
            </p>
          )}

          {/* Result view */}
          {result && (
            <div className="space-y-4">
              <article className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-slate-200">
                <p className="whitespace-pre-line font-normal">{result.text}</p>
              </article>

              {/* Grounded Google Maps Links */}
              {result.sources.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
                    <MapPin size={14} /> Перевірені джерела Google Maps ({result.sources.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {result.sources.map((source, index) => (
                      <a
                        key={index}
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ds-interactive flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs font-semibold text-sky-300 hover:bg-white/10 hover:text-sky-200 transition"
                      >
                        <span className="truncate">{source.title}</span>
                        <ExternalLink size={15} className="shrink-0 text-slate-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
