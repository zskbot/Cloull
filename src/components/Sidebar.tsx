import {
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Maximize2,
  SearchCode,
  Smartphone,
  UserCog,
  X,
} from 'lucide-react';
import type { Domain, UserProfile } from '../types/dns';

export type ActiveNav = 'overview' | 'domains' | 'domain-detail' | 'audit' | 'map' | 'lookup' | 'profile';

interface SidebarProps {
  activeNav: ActiveNav;
  selectedDomainId: string | null;
  domains: Domain[];
  profile: UserProfile | null;
  userEmail: string;
  mobileOpen: boolean;
  portrait69: boolean;
  onTogglePortrait69: () => void;
  onCloseMobile: () => void;
  onNavigate: (nav: ActiveNav, domainId?: string | null) => void;
  onSignOut: () => void;
}

export function Sidebar({
  activeNav,
  selectedDomainId,
  domains,
  profile,
  userEmail,
  mobileOpen,
  portrait69,
  onTogglePortrait69,
  onCloseMobile,
  onNavigate,
  onSignOut,
}: SidebarProps) {
  const navItems: Array<{ id: ActiveNav; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'domains', label: 'Tên miền', icon: Globe },
    { id: 'audit', label: 'Lịch sử thay đổi', icon: History },
    { id: 'map', label: 'Bản đồ khu vực', icon: MapIcon },
    { id: 'lookup', label: 'Tra cứu DNS trực tiếp', icon: SearchCode },
    { id: 'profile', label: 'Hồ sơ & Bảo mật', icon: UserCog },
  ];

  const handleSelect = (nav: ActiveNav, domainId: string | null = null) => {
    onNavigate(nav, domainId);
    onCloseMobile();
  };

  const sidebarBody = (
    <div className="h-full flex flex-col bg-white border-r border-slate-200 w-64">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => handleSelect('overview')}
          className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap truncate text-left"
        >
          Trạm Điều Khiển DNS
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-md"
          aria-label="Đóng thanh điều hướng"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeNav === item.id || (item.id === 'domains' && activeNav === 'domain-detail');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 md:py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pt-4 border-t border-slate-200 space-y-2">
          <div className="px-3 flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tên miền của tôi</span>
            <span className="font-mono tabular-nums">{domains.length}</span>
          </div>
          {domains.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-slate-500">Chưa có tên miền nào</p>
          ) : (
            <div className="space-y-0.5">
              {domains.slice(0, 8).map((dom) => {
                const isSelected = activeNav === 'domain-detail' && selectedDomainId === dom.id;
                return (
                  <button
                    key={dom.id}
                    type="button"
                    onClick={() => handleSelect('domain-detail', dom.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 md:py-1.5 text-xs rounded-md transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white font-medium'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="font-mono truncate">{dom.name}</span>
                    <span
                      className={`font-mono tabular-nums shrink-0 ${
                        isSelected ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {dom.recordCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-2.5 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {profile?.displayName || 'Quản trị viên'}
          </p>
          <p className="text-xs text-slate-500 truncate">{userEmail}</p>
        </div>

        <button
          type="button"
          onClick={onTogglePortrait69}
          className="hidden md:flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
        >
          {portrait69 ? (
            <>
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
              Mở rộng toàn màn hình
            </>
          ) : (
            <>
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              Xem khung tỷ lệ 6:9
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <>
      {!portrait69 && <aside className="hidden md:block shrink-0">{sidebarBody}</aside>}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
}
