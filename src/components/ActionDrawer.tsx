import React from 'react';
import { X, Search, Car, Navigation, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ActionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: 'demand_new' | 'driver_offer_new' | 'navigation') => void;
}

export const ActionDrawer: React.FC<ActionDrawerProps> = ({
  isOpen,
  onClose,
  onSelectAction
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-[#121923] rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-[#253447]"
          >
            {/* Top drag handle indicator */}
            <div className="pt-3 pb-1 flex justify-center sm:hidden">
              <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
            </div>

            {/* Drawer Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-[#1D2938]">
              <div>
                <h3 className="text-lg font-bold text-[#14243B] dark:text-white">Чим можемо допомогти?</h3>
                <p className="text-xs text-[#62718A] dark:text-[#7F93AC]">Оберіть необхідну дію для швидкого старту</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                aria-label="Закрити"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Options List */}
            <div className="p-6 space-y-3">
              {/* Action 1: Passenger Demand */}
              <motion.button
                whileHover={{ x: 4, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  onSelectAction('demand_new');
                }}
                className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-[#253447] hover:border-[#1769F4] hover:bg-[#F5F8FD] dark:hover:bg-[#182230] transition group flex items-start gap-4 cursor-pointer"
              >
                <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] dark:bg-blue-950/60 text-[#1769F4] dark:text-[#2B8CFF] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Search className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-[#14243B] dark:text-white">Шукаю поїздку (Назвати ціну)</h4>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#1769F4] dark:group-hover:text-[#2B8CFF] transition-colors" />
                  </div>
                  <p className="text-xs text-[#62718A] dark:text-[#7F93AC] mt-1">
                    Вкажіть маршрут, час та бюджет. Водії побачать заявку і запропонують авто.
                  </p>
                </div>
              </motion.button>

              {/* Action 2: Community Carpool */}
              <motion.button
                whileHover={{ x: 4, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  onSelectAction('driver_offer_new');
                }}
                className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-[#253447] hover:border-[#16845C] hover:bg-[#F0FDF4] dark:hover:bg-[#182230] transition group flex items-start gap-4 cursor-pointer"
              >
                <div className="w-11 h-11 rounded-xl bg-[#DCFCE7] dark:bg-emerald-950/60 text-[#16845C] dark:text-[#1FC77E] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Car className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-[#14243B] dark:text-white">Пропоную попутку</h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">0% комісії</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#16845C] dark:group-hover:text-[#1FC77E] transition-colors" />
                  </div>
                  <p className="text-xs text-[#62718A] dark:text-[#7F93AC] mt-1">
                    Спільний розподіл витрат на пальне. Жодної комісії сервісу MARSHGO.
                  </p>
                </div>
              </motion.button>

              {/* Action 3: MARSHGO Navigation */}
              <motion.button
                whileHover={{ x: 4, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  onSelectAction('navigation');
                }}
                className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-[#253447] hover:border-[#1769F4] hover:bg-[#081B35]/5 dark:hover:bg-[#182230] transition group flex items-start gap-4 cursor-pointer"
              >
                <div className="w-11 h-11 rounded-xl bg-[#081B35] dark:bg-[#1E2D40] text-[#38BDF8] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Navigation className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-[#14243B] dark:text-white">MARSHGO Навігація</h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">Beta</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#1769F4] dark:group-hover:text-[#2B8CFF] transition-colors" />
                  </div>
                  <p className="text-xs text-[#62718A] dark:text-[#7F93AC] mt-1">
                    Їдьте власним маршрутом. За бажанням система підкаже пасажирів дорогою.
                  </p>
                </div>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

