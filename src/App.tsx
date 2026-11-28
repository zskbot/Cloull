import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { CheckCircle2, Maximize2, Menu, Plus, X } from 'lucide-react';
import { DomainDetailView } from './components/DomainDetailView';
import { DomainsListView } from './components/DomainsListView';
import { DnsLookupView } from './components/DnsLookupView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './components/HomePage';
import { GlobalAuditView } from './components/GlobalAuditView';
import { LoginScreen } from './components/LoginScreen';
import { MobileBottomNav } from './components/MobileBottomNav';
import { OverviewView } from './components/OverviewView';
import { ProfileSecurityView } from './components/ProfileSecurityView';
import { RegionalMapView } from './components/RegionalMapView';
import { Sidebar, type ActiveNav } from './components/Sidebar';
import { ensureUserProfile, subscribeDomains, subscribeUserProfile } from './lib/dnsService';
import { auth } from './lib/firebase';
import type { Domain, UserProfile } from './types/dns';

function MainWorkspace() {
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);

  const [activeNav, setActiveNav] = useState<ActiveNav>('overview');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [portrait69, setPortrait69] = useState(false);
  const [addDomainTrigger, setAddDomainTrigger] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };
    const preventMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    document.addEventListener('touchmove', preventMultiTouch, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('touchmove', preventMultiTouch);
    };
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        void ensureUserProfile(nextUser).catch((error: unknown) => {
          console.error('Không thể khởi tạo hồ sơ Firebase:', error);
          const raw = error instanceof Error ? error.message : String(error);
          let detail = raw;
          try {
            const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
            detail = [parsed.operationType, parsed.path, parsed.error].filter(Boolean).join(' · ');
          } catch {
            // Keep the original Firebase error when it is not structured.
          }
          setAuthError(
            `Đăng nhập thành công nhưng Firestore không thể khởi tạo hồ sơ: ${detail}. Kiểm tra email_verified và quyền create tại users/{uid} trong Firestore Rules.`
          );
        });
      } else {
        setAuthError(null);
        setProfile(null);
        setDomains([]);
        setDomainsLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    setDomainsLoading(true);
    const unsubProfile = subscribeUserProfile(user.uid, (p) => setProfile(p));
    const unsubDomains = subscribeDomains(user.uid, (list) => {
      setDomains(list);
      setDomainsLoading(false);
    });
    return () => {
      unsubProfile();
      unsubDomains();
    };
  }, [user]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Đang khởi tạo phiên làm việc...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const selectedDomain = domains.find((d) => d.id === selectedDomainId) || null;

  const handleNavigate = (nav: ActiveNav, domainId: string | null = null) => {
    setActiveNav(nav);
    if (domainId !== undefined) {
      setSelectedDomainId(domainId);
    }
  };

  const handleOpenAddDomain = () => {
    setActiveNav('domains');
    setAddDomainTrigger((c) => c + 1);
  };

  const getBreadcrumb = (): string => {
    if (activeNav === 'overview') return 'Tổng quan hệ thống';
    if (activeNav === 'domains') return 'Quản lý Tên miền';
    if (activeNav === 'domain-detail' && selectedDomain) return `Tên miền / ${selectedDomain.name}`;
    if (activeNav === 'audit') return 'Lịch sử thay đổi (Audit)';
    if (activeNav === 'map') return 'Bản đồ khu vực toàn quốc';
    if (activeNav === 'lookup') return 'Tra cứu DNS trực tiếp';
    return 'Hồ sơ & Bảo mật';
  };

  const shellContent = (
    <div
      className={
        portrait69
          ? 'relative w-full max-w-[440px] aspect-[6/9] max-h-[92dvh] bg-slate-50 border border-slate-300 rounded-2xl shadow-xl overflow-hidden flex flex-col mx-auto'
          : 'min-h-[100dvh] bg-slate-50 flex w-full'
      }
    >
      <Sidebar
        activeNav={activeNav}
        selectedDomainId={selectedDomainId}
        domains={domains}
        profile={profile}
        userEmail={user.email || ''}
        mobileOpen={mobileMenuOpen}
        portrait69={portrait69}
        onTogglePortrait69={() => setPortrait69((p) => !p)}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNavigate={handleNavigate}
        onSignOut={() => void signOut(auth)}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Thanh tiêu đề trên: gọn cho di động 6:9 (<56px) và đầy đủ trên desktop */}
        <header className="sticky top-0 z-30 h-12 md:h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`${
                portrait69 ? 'flex' : 'flex md:hidden'
              } min-h-[44px] min-w-[44px] items-center justify-center text-slate-600 hover:text-slate-900 rounded-md`}
              aria-label="Mở thanh điều hướng"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-slate-900 truncate">{getBreadcrumb()}</h1>
          </div>

          <button
            type="button"
            onClick={handleOpenAddDomain}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] md:min-h-0 md:py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm tên miền
          </button>
        </header>

        {authError && (
          <div role="alert" className="mx-3 mt-3 border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            {authError}
          </div>
        )}

        <main
          className={`@container flex-1 w-full max-w-7xl mx-auto ${
            portrait69 ? 'p-3 overflow-y-auto pb-4' : 'p-3 sm:p-6 pb-20 md:pb-6'
          }`}
        >
          {activeNav === 'overview' && (
            <OverviewView
              domains={domains}
              profile={profile}
              loading={domainsLoading}
              onOpenAddDomain={handleOpenAddDomain}
              onSelectDomain={(id) => handleNavigate('domain-detail', id)}
              onOpenAllDomains={() => handleNavigate('domains')}
              onOpenSecurity={() => handleNavigate('profile')}
            />
          )}

          {activeNav === 'domains' && (
            <DomainsListView
              uid={user.uid}
              domains={domains}
              profile={profile}
              loading={domainsLoading}
              openAddTrigger={addDomainTrigger}
              onSelectDomain={(id) => handleNavigate('domain-detail', id)}
              onNotify={showToast}
            />
          )}

          {activeNav === 'domain-detail' && selectedDomain && (
            <DomainDetailView
              uid={user.uid}
              domain={selectedDomain}
              profile={profile}
              onBack={() => handleNavigate('domains', null)}
              onNotify={showToast}
            />
          )}

          {activeNav === 'domain-detail' && !selectedDomain && (
            <DomainsListView
              uid={user.uid}
              domains={domains}
              profile={profile}
              loading={domainsLoading}
              openAddTrigger={addDomainTrigger}
              onSelectDomain={(id) => handleNavigate('domain-detail', id)}
              onNotify={showToast}
            />
          )}

          {activeNav === 'audit' && (
            <GlobalAuditView
              uid={user.uid}
              domains={domains}
              domainsLoading={domainsLoading}
              onSelectDomain={(id) => handleNavigate('domain-detail', id)}
              onNotify={showToast}
            />
          )}

          {activeNav === 'map' && <RegionalMapView domains={domains} />}

          {activeNav === 'lookup' && <DnsLookupView />}

          {activeNav === 'profile' && (
            <ProfileSecurityView
              uid={user.uid}
              profile={profile}
              userEmail={user.email || ''}
              onNotify={showToast}
            />
          )}
        </main>

        <MobileBottomNav
          activeNav={activeNav}
          forceShow={portrait69}
          onNavigate={(nav) => handleNavigate(nav)}
        />
      </div>

      {toast && (
        <div
          className={`${
            portrait69
              ? 'absolute bottom-16 left-3 right-3'
              : 'fixed bottom-20 md:bottom-5 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-sm'
          } z-50 bg-slate-900 text-white px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2.5 text-xs font-medium`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  if (portrait69) {
    return (
      <div className="min-h-[100dvh] bg-slate-100 flex flex-col items-center justify-center p-4 gap-3">
        {shellContent}
        <button
          type="button"
          onClick={() => setPortrait69(false)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Thoát khung 6:9
        </button>
      </div>
    );
  }

  return shellContent;
}

export default function App() {
  const isDashboard = window.location.pathname.replace(/\/+$/, '') === '/dashboard';

  return (
    <ErrorBoundary>
      {isDashboard ? <MainWorkspace /> : <HomePage />}
    </ErrorBoundary>
  );
}
