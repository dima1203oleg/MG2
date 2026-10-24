import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isOnline,
    install,
  };
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = () => {
    if (isInstallable) {
      void install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Встановити застосунок MARSHGO"
        title="Встановити PWA або iOS застосунок MARSHGO"
        className={
          compact
            ? 'inline-flex h-10 items-center gap-1.5 rounded-full border border-[#DFE7F1] bg-white px-3 text-xs font-extrabold text-[#0E1F35] shadow-xs transition hover:border-blue-300 hover:text-[#1789F4] dark:border-[#263648] dark:bg-[#141D28] dark:text-[#F5F9FF]'
            : 'flex w-full items-center justify-between rounded-xl bg-[#EAF3FF] px-4 py-3 text-left text-xs font-extrabold text-[#1789F4] transition hover:bg-blue-100 dark:bg-[#14263B] dark:text-[#8CC4FF]'
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <Download size={14} className="text-[#1789F4]" />
          <span>{compact ? 'PWA / iOS' : 'Встановити MARSHGO на пристрій (PWA / iOS)'}</span>
        </span>
        {!compact && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-[#0E1824] dark:text-blue-300">Standalone</span>}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => setShowGuide(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Встановлення застосунку MARSHGO"
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 text-[#0E1F35] shadow-2xl dark:border-[#263648] dark:bg-[#111923] dark:text-[#F5F9FF]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white">
                  <Smartphone size={20} />
                </span>
                <div>
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    MARSHGO Web · PWA · iOS
                  </span>
                  <h3 className="text-base font-extrabold">Встановити на головний екран</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Закрити"
                className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 dark:bg-[#1B2838] dark:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 rounded-2xl bg-[#F5F8FD] p-3.5 text-xs leading-5 text-slate-700 dark:bg-[#162231] dark:text-slate-200">
              {isIOS ? (
                <>
                  <p className="flex items-center gap-2 font-bold">
                    <Share size={15} className="shrink-0 text-blue-600" />
                    1. Натисніть кнопку «Поділитися» у панелі Safari.
                  </p>
                  <p className="font-bold">
                    2. Оберіть «На початковий екран» (Add to Home Screen).
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold">
                    1. Відкрийте меню браузера або натисніть піктограму встановлення в адресному рядку.
                  </p>
                  <p className="font-bold">
                    2. Оберіть «Встановити застосунок MARSHGO» для роботи у повноекранному режимі з офлайн-кешем маршрутів та MarshPass.
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl bg-[#1789F4] py-2.5 text-xs font-extrabold text-white"
            >
              Зрозуміло
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineConnectivityBanner() {
  const { isOnline } = usePWAInstall();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300 bg-amber-500/95 px-4 py-2 text-xs font-extrabold text-white shadow-lg backdrop-blur-xs"
    >
      <WifiOff size={14} />
      <span>Офлайн-режим — активний локальний кеш маршрутів і MarshPass</span>
    </div>
  );
}
