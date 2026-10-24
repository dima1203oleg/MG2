import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { choiceFor, hasJourneySearchProvider, isAllActive, isJourneySearchSupported, providersForJourneySearch, selectAll, toggleProvider, toggleType, transportTypes, type TransportSelection, type TransportTypeId } from '../domain/transportPreferences';
import { TransportIcon } from '../design-system/transport/TransportIcon';
import { getTransportModeVisual } from '../design-system/transport/transportModeRegistry';
import type { ApiTransportProviders } from '../services/productionApi';

// This order follows the approved route-search screen, while the domain
// catalogue remains ordered by the product's broader transport taxonomy.
const routeSearchOrder: readonly TransportTypeId[] = [
  'carpool', 'marshrutka', 'bus', 'taxi', 'tram', 'trolleybus', 'metro', 'train',
  'bike', 'scooter', 'carsharing', 'transfer',
];
function Tile({ label, visualLabel = label, selected, disabled, compact, type, onClick }: { label: string; visualLabel?: string; selected: boolean; disabled: boolean; compact?: boolean; type: TransportTypeId; onClick: () => void }) {
  const visual = getTransportModeVisual(type);
  return (
    <button
      type="button"
      aria-pressed={disabled ? false : selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`ds-interactive relative flex min-h-[5.6rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center font-extrabold leading-tight transition-all duration-200 ${
        compact ? 'min-h-[4.25rem] gap-1 rounded-xl py-1.5 text-[10px]' : 'text-[11px]'
      } ${
        disabled
          ? 'cursor-not-allowed border-slate-200/80 bg-slate-100/80 text-slate-400 opacity-65 dark:border-slate-700/70 dark:bg-[#141C26] dark:text-slate-500'
          : selected
            ? 'border-[#0B6EF3] bg-[#EAF3FF] text-[#0B6EF3] shadow-[0_8px_20px_-4px_rgba(11,110,243,0.38)] ring-2 ring-[#0B6EF3] scale-[1.02] dark:border-[#2B8CFF] dark:bg-[#112744] dark:text-[#6EB2FF] dark:ring-[#2B8CFF]'
            : 'border-[#DCE6F2] bg-white text-[#102344] shadow-xs hover:border-[#B8CCE4] active:scale-[0.98] dark:border-[#253447] dark:bg-[#121923] dark:text-[#D5E2F2] dark:hover:border-[#364B63]'
      }`}
    >
      {selected && !disabled && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#0B6EF3] text-[9px] font-black text-white shadow-xs dark:bg-[#4DA0FF]"
        >
          ✓
        </span>
      )}
      <span
        className={`grid place-items-center transition-transform ${compact ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl'} ${
          selected ? 'scale-105' : ''
        } ${
          disabled ? 'bg-slate-200/80 text-slate-400 dark:bg-slate-800 dark:text-slate-500' : ''
        }`}
        style={disabled ? undefined : visual.badgeStyle}
      >
        <TransportIcon mode={type} size={compact ? 16 : 18} />
      </span>
      <span className="max-w-full truncate px-0.5">{visualLabel}</span>
      {disabled && <span className="sr-only">Недоступно для побудови маршруту в цьому районі</span>}
    </button>
  );
}

/** Fixed twelve-category selector; feed-specific legacy types are hidden behind the canonical categories. */
export function TransportTypesPanel({ selection, groups, onChange, compact = false, onManageProviders }: { selection: TransportSelection; groups: ApiTransportProviders[] | null; onChange: (selection: TransportSelection) => void; compact?: boolean; onManageProviders?: () => void }) {
  const [expandedAll, setExpandedAll] = useState(false);
  const allActive = isAllActive(selection);
  const showProviders = selection.active.length > 0 && (!allActive || expandedAll);
  const isConnected = (type: TransportTypeId) => isJourneySearchSupported(type)
    && (groups === null || hasJourneySearchProvider(type, groups));
  const providersOf = (type: TransportTypeId) => providersForJourneySearch(type, groups);

  const visibleTypes = routeSearchOrder.flatMap((id) => transportTypes.filter((type) => type.id === id));

  return <section aria-label="Види транспорту" className={`${compact ? 'transport-types-inline' : 'mt-4'}`}>
    <div className="mb-1 flex items-center justify-between gap-2"><h2 className="text-sm font-extrabold text-[#0E1F35] dark:text-[#F5F9FF]">Види транспорту</h2>
      <span className="flex shrink-0 items-center gap-1.5">
      {compact && onManageProviders && <button type="button" onClick={onManageProviders} aria-label="Фільтри провайдерів" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#16202B] dark:text-slate-200"><SlidersHorizontal size={16}/></button>}
      <button type="button" aria-pressed={allActive} onClick={() => onChange(allActive ? { ...selection, active: [] } : selectAll(selection))} className={`min-h-11 rounded-full border px-4 py-1.5 text-xs font-bold ${allActive ? 'border-[#1789F4] bg-[#1789F4] text-white dark:border-[#0B6EF3] dark:bg-[#0B6EF3]' : 'border-slate-200 bg-white text-[#1789F4] dark:border-slate-700 dark:bg-[#16202B] dark:text-[#66B2FF]'}`}>Усі</button>
      </span>
    </div>
    <div className={`transport-mode-grid grid grid-cols-4 ${compact ? 'gap-1.5' : 'gap-2'}`}>{visibleTypes.map((type) => <Tile key={type.id} type={type.id} label={type.label} visualLabel={getTransportModeVisual(type.id).label} selected={selection.active.includes(type.id)} disabled={!isConnected(type.id)} compact={compact} onClick={() => onChange(toggleType(selection, type.id))}/>)}</div>
    {!compact && allActive && <button type="button" onClick={() => setExpandedAll((value) => !value)} className="mt-3 text-xs font-bold text-[#1789F4]">{expandedAll ? 'Сховати провайдерів' : 'Налаштувати провайдерів'}</button>}
    {!compact && showProviders && <div className="mt-3 space-y-3" aria-label="Провайдери">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Провайдери</h3>
      {transportTypes.filter((type) => selection.active.includes(type.id) && isConnected(type.id)).map((type) => { const providers = providersOf(type.id); const choice = choiceFor(selection, type.id);
        return <div key={type.id} className="rounded-2xl bg-[#f6f8fc] p-3 dark:bg-[#16202B]"><p className="mb-2 text-xs font-extrabold text-[#0E1F35] dark:text-white">{type.label}</p>
          {providers.length === 0 ? <p className="text-xs text-slate-500">Провайдери недоступні у цьому районі.</p>
            : <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={choice.all} onClick={() => onChange(toggleProvider(selection, type.id, 'all'))} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${choice.all ? 'border-[#1789F4] bg-[#EAF3FF] text-[#1789F4]' : 'border-[#E5EDF7] bg-white text-slate-500'}`}>{choice.all && '✓ '}Усі провайдери</button>
              {providers.map((provider) => { const checked = !choice.all && choice.ids.includes(provider.id);
                return <button key={provider.id} type="button" aria-pressed={checked} onClick={() => onChange(toggleProvider(selection, type.id, provider.id))} title={provider.cities.join(', ') || undefined} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${checked ? 'border-[#1789F4] bg-[#1789F4] text-white' : 'border-[#E5EDF7] bg-white text-slate-600'}`}>{provider.name}</button>; })}
            </div>}
        </div>; })}
    </div>}
  </section>;
}
