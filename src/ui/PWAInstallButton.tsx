import React, { useState, useEffect } from 'react';
import { Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Detect standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      // If prompt isn't directly available, show tips
      alert('To install GREVIN AI, tap your browser menu (⋮) and select "Install app" or "Add to Home screen".');
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  // If already running in standalone PWA mode, suppress button
  if (isInstalled) {
    return (
      <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-[11px] font-mono text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>PWA ACTIVE</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  return (
    <>
      <button
        onClick={isIOS ? () => setShowIOSGuide(true) : install}
        className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-2.5 py-1 text-xs shadow-md transition"
        title="Install GREVIN AI as Progressive Web App"
      >
        {isIOS ? <Smartphone className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
        <span>Install PWA</span>
      </button>

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-200">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-cyan-400" />
              Install GREVIN AI on iOS
            </h3>
            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              To install on iPhone or iPad:
            </p>
            <ol className="mt-2 text-xs text-slate-300 space-y-1.5 list-decimal list-inside bg-slate-950 p-3 rounded-lg border border-slate-800">
              <li>Tap the <strong>Share</strong> button in the Safari toolbar.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
            <p className="mt-2 text-[11px] text-cyan-400">
              GREVIN AI will then run in fullscreen standalone mode with real-time push alerts.
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full rounded-lg bg-cyan-500 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
