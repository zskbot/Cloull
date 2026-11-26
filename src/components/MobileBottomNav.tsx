import { Globe, History, LayoutDashboard, Map as MapIcon, SearchCode, UserCog } from 'lucide-react';
import type { ActiveNav } from './Sidebar';

interface MobileBottomNavProps {
  activeNav: ActiveNav;
  forceShow?: boolean;
  onNavigate: (nav: ActiveNav) => void;
}

export function MobileBottomNav({
  activeNav,
  forceShow = false,
  onNavigate,
}: MobileBottomNavProps) {
  const items: Array<{ id: ActiveNav; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'domains', label: 'Tên miền', icon: Globe },
    { id: 'audit', label: 'Lịch sử', icon: History },
    { id: 'map', label: 'Bản đồ', icon: MapIcon },
    { id: 'lookup', label: 'Tra cứu', icon: SearchCode },
    { id: 'profile', label: 'Hồ sơ', icon: UserCog },
  ];

  return (
    <nav
      aria-label="Điều hướng di động"
      className={`${
        forceShow ? 'sticky bottom-0' : 'fixed bottom-0 left-0 right-0 md:hidden'
      } z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]`}
    >
      <div className="grid grid-cols-6 h-14">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeNav === item.id || (item.id === 'domains' && activeNav === 'domain-detail');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] px-0.5 transition-colors whitespace-nowrap ${
                isActive ? 'text-blue-700 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] leading-tight truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
