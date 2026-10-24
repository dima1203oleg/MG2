import React from 'react';
import { Search, Compass, Plus, Clock, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenActionDrawer: () => void;
  isDriver: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenActionDrawer,
  isDriver
}) => {
  const tabs = [
    { id: 'home', key: 'home', label: 'Пошук', icon: Search, active: currentView === 'home' || currentView === 'search' },
    { id: 'requests', key: isDriver ? 'driver-requests' : 'demand-new', label: 'Заявки', icon: Compass, active: currentView === 'demand-new' || currentView === 'driver-requests' },
    { id: 'center', key: 'center', isCenter: true },
    { id: 'trips', key: 'trips', label: 'Поїздки', icon: Clock, active: currentView === 'trips' },
    { id: 'profile', key: isDriver ? 'driver' : 'profile', label: isDriver ? 'Водій' : 'Профіль', icon: UserIcon, active: currentView === 'profile' || currentView === 'driver' }
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#111820]/95 backdrop-blur-md border-t border-[#DFE7F1] dark:border-[#263648] pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)] transition-colors duration-200">
      <div className="grid grid-cols-5 h-16 items-center px-2 relative">
        {tabs.map((tab) => {
          if (tab.isCenter) {
            return (
              <div key="center-action" className="flex items-center justify-center -mt-5 z-10">
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={onOpenActionDrawer}
                  className="w-13 h-13 rounded-full bg-[#1769F4] text-white flex items-center justify-center shadow-lg shadow-[#1769F4]/35 hover:bg-[#1358CE] border-4 border-white dark:border-[#111820] cursor-pointer"
                  aria-label="Створити поїздку або запит"
                >
                  <Plus className="w-7 h-7 stroke-[2.5]" />
                </motion.button>
              </div>
            );
          }

          const Icon = tab.icon!;
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.92 }}
              onClick={() => onNavigate(tab.key)}
              className={`relative flex flex-col items-center justify-center py-1 transition-colors duration-200 cursor-pointer ${
                tab.active ? 'text-[#1769F4] dark:text-[#1687FF] font-bold' : 'text-[#62718A] dark:text-[#8FA0B3]'
              }`}
            >
              {tab.active && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-1 w-8 h-1 rounded-full bg-[#1769F4] dark:bg-[#1687FF]"
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                />
              )}
              <motion.div
                animate={tab.active ? { scale: 1.1, y: -1 } : { scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              >
                <Icon className="w-5 h-5" />
              </motion.div>
              <span className="text-[11px] font-medium mt-1">{tab.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};

