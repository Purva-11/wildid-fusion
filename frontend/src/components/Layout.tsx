import { useEffect, useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Camera,
  BookOpen,
  CheckSquare,
  Leaf,
  Menu,
  X,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Screen, SystemHealth } from '@/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { getHealth, API_BASE_URL } from '@/services/api';

interface LayoutProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  children: ReactNode;
}

const navItems: { screen: Screen; label: string; icon: typeof LayoutDashboard; description: string }[] = [
  { screen: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview & activity' },
  { screen: 'identify', label: 'Identify Animal', icon: Camera, description: 'Upload & match' },
  { screen: 'registry', label: 'Animal Registry', icon: BookOpen, description: 'All profiles' },
  { screen: 'verification', label: 'Verification', icon: CheckSquare, description: 'Review matches' },
];

export function Layout({ currentScreen, onNavigate, children }: LayoutProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const h = await getHealth();
        if (mounted) {
          setHealth(h);
          setIsOnline(h.status === 'healthy' && h.model_loaded);
        }
      } catch {
        if (mounted) {
          setIsOnline(false);
          setHealth(null);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleNavigate = (screen: Screen) => {
    onNavigate(screen);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-ivory-50">
      {/* Mobile top bar */}
      {isMobile && (
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-forest-100 bg-ivory-50/95 px-4 py-3 backdrop-blur">
          <Logo />
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-forest-700 transition-colors hover:bg-forest-100"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
        </div>
      )}

      {/* Mobile drawer */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-40 animate-fade-in">
          <div className="absolute inset-0 bg-forest-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] overflow-y-auto bg-forest-900 shadow-2xl animate-fade-in-up">
            <div className="flex items-center justify-between p-4">
              <Logo light />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-forest-100 transition-colors hover:bg-forest-800"
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>
            <NavContent currentScreen={currentScreen} onNavigate={handleNavigate} health={health} isOnline={isOnline} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="fixed left-0 top-0 z-20 flex h-full w-64 flex-col bg-forest-900 text-forest-100">
          <NavContent currentScreen={currentScreen} onNavigate={handleNavigate} health={health} isOnline={isOnline} />
        </aside>
      )}

      {/* Main content */}
      <main className={`min-h-screen ${!isMobile ? 'ml-64' : ''}`}>
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function NavContent({
  currentScreen,
  onNavigate,
  health,
  isOnline,
}: {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  health: SystemHealth | null;
  isOnline: boolean | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-3">
        <Logo light />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const active = currentScreen === item.screen;
          const Icon = item.icon;
          return (
            <button
              key={item.screen}
              onClick={() => onNavigate(item.screen)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                active
                  ? 'bg-forest-700 text-white shadow-lg shadow-forest-950/30'
                  : 'text-forest-200 hover:bg-forest-800 hover:text-white'
              }`}
            >
              <Icon
                size={20}
                className={active ? 'text-lime-300' : 'text-forest-300 group-hover:text-lime-300'}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                <div className={`text-xs ${active ? 'text-forest-200' : 'text-forest-400'}`}>
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Real Live System Status Footer */}
      <div className="px-3 pb-3">
        <div className="rounded-xl bg-forest-800/60 p-3 border border-forest-700/50">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-lime-300">
            <span className="flex items-center gap-1.5">
              <Sparkles size={14} />
              AI System Status
            </span>
            {isOnline ? (
              <span className="flex items-center gap-1 text-[11px] text-lime-400">
                <Wifi size={12} /> Live
              </span>
            ) : isOnline === false ? (
              <span className="flex items-center gap-1 text-[11px] text-red-400">
                <WifiOff size={12} /> Offline
              </span>
            ) : null}
          </div>

          <div className="space-y-1.5 text-xs text-forest-300">
            <div className="flex items-center justify-between">
              <span>MiewID Model</span>
              <span className="flex items-center gap-1.5 text-forest-100 font-medium">
                {isOnline ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-lime-400 animate-pulse" />
                    Online
                  </>
                ) : isOnline === false ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    Disconnected
                  </>
                ) : (
                  'Checking...'
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>MegaDetector</span>
              <span className="text-forest-200">
                {health?.detector_loaded ? 'Active (v6)' : isOnline ? 'Unavailable' : 'Disconnected'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>Gallery Size</span>
              <span className="text-forest-200">
                {health ? `${health.total_individuals} animals` : 'Unavailable'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>Camera Traps</span>
              <span className="text-forest-400 text-[11px]">Unavailable</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-forest-800 px-5 py-3">
        <p className="text-xs text-forest-400">
          WildID Fusion v1.1
          {isOnline === false && (
            <span className="mt-1 block text-red-400 font-medium">
              Backend Disconnected ({API_BASE_URL})
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-forest-500 shadow-md">
        <Leaf size={20} className="text-white" />
      </div>
      <div>
        <h1 className={`font-display text-lg font-bold leading-tight ${light ? 'text-white' : 'text-forest-800'}`}>
          WildID Fusion
        </h1>
        <p className={`text-[10px] uppercase tracking-wider ${light ? 'text-forest-300' : 'text-forest-500'}`}>
          Wildlife ID Platform
        </p>
      </div>
    </div>
  );
}
