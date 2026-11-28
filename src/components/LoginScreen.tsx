import { useEffect, useState } from 'react';
import {
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  type AuthProvider,
} from 'firebase/auth';
import { Github, Globe, ShieldCheck, Activity, FileSpreadsheet } from 'lucide-react';
import { auth, googleProvider, githubProvider } from '../lib/firebase';

function getAuthErrorMessage(error: unknown, providerName = 'nhà cung cấp'): string {
  const code = (error as { code?: string } | undefined)?.code || '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return 'Tên miền hiện tại chưa được cho phép trong Firebase Authentication. Hãy thêm hostname của trang Preview vào mục Authorized domains.';
    case 'auth/operation-not-allowed':
      return `Đăng nhập ${providerName} chưa được bật trong Firebase Authentication. Cần bật nhà cung cấp này và cấu hình OAuth Client ID/Secret trong Firebase Console.`;
    case 'auth/popup-closed-by-user':
      return `Cửa sổ đăng nhập ${providerName} đã bị đóng trước khi hoàn tất.`;
    case 'auth/popup-blocked':
      return 'Trình duyệt chặn cửa sổ bật lên. Hệ thống sẽ chuyển sang đăng nhập chuyển hướng.';
    case 'auth/network-request-failed':
      return 'Không kết nối được máy chủ xác thực. Kiểm tra mạng rồi thử lại.';
    case 'auth/account-exists-with-different-credential':
      return 'Email này đã được đăng ký bằng phương thức xác thực khác.';
    case 'auth/web-storage-unsupported':
      return 'Trình duyệt đang chặn bộ nhớ phiên cần thiết cho đăng nhập. Hãy bật cookie và website data.';
    default:
      return error instanceof Error ? error.message : `Không thể đăng nhập bằng ${providerName}.`;
  }
}

export function LoginScreen() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getRedirectResult(auth).catch((redirectError: unknown) => {
      if (active) setError(getAuthErrorMessage(redirectError));
    });
    return () => {
      active = false;
    };
  }, []);

  const handleProviderSignIn = async (provider: AuthProvider, providerName: string) => {
    setLoading(providerName);
    setError(null);
    const isAppleMobile =
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    try {
      if (isAppleMobile) {
        await signInWithRedirect(auth, provider);
        return;
      }

      try {
        await signInWithPopup(auth, provider);
      } catch (popupError) {
        const code = (popupError as { code?: string } | undefined)?.code;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError, providerName));
      setLoading(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-100 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            CLOULL <span className="text-blue-400">/</span> DNS CONTROL
          </span>
          <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap shrink-0">
            Quản trị DNS · Firebase secured
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-12">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-stretch">
          <section className="lg:col-span-7 bg-white border border-slate-200 p-5 sm:p-8 flex flex-col justify-between space-y-6 sm:space-y-8">
            <div className="space-y-3 sm:space-y-4">
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-blue-400">DNS MANAGEMENT PLATFORM</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
                Kiểm soát toàn bộ bản ghi DNS trên một giao diện tập trung.
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
                Quản lý vùng DNS, nhập xuất BIND/CSV, kiểm tra phân giải Internet và theo dõi thay đổi trong một bảng điều khiển bảo mật.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 pt-5 sm:pt-6 border-t border-slate-200">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>19 loại bản ghi DNS</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">Hỗ trợ A, AAAA, CNAME, MX, TXT, SRV, CAA, DS, TLSA, HTTPS và SVCB.</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <Activity className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Kiểm tra phân giải</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">Đối chiếu NS, SOA và bản ghi trực tiếp với hệ thống DNS công cộng.</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Nhập xuất BIND / CSV</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">Kiểm tra cú pháp trước khi nhập hàng loạt và xuất tệp .zone.</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Bảo mật & 2FA TOTP</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">Dữ liệu phân tách theo UID, hỗ trợ xác thực hai yếu tố TOTP.</p>
              </div>
            </div>
          </section>

          <section className="lg:col-span-5 bg-white border border-slate-200 p-5 sm:p-8 flex flex-col justify-center space-y-5 sm:space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-[0.16em] text-slate-500">SECURE ACCESS</p>
              <h2 className="text-xl font-semibold text-slate-900">Đăng nhập hệ thống</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Đăng nhập an toàn bằng Google hoặc GitHub để đồng bộ cấu hình DNS của riêng bạn.
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 text-xs text-red-300 leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleProviderSignIn(googleProvider, 'Google')}
              disabled={Boolean(loading)}
              className="w-full flex items-center justify-center gap-3 px-4 min-h-[48px] py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-600 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" />
              </svg>
              {loading === 'Google' ? 'Đang chuyển tới Google...' : 'Tiếp tục với Google'}
            </button>

            <button
              type="button"
              onClick={() => handleProviderSignIn(githubProvider, 'GitHub')}
              disabled={Boolean(loading)}
              className="w-full flex items-center justify-center gap-3 px-4 min-h-[48px] py-2.5 text-sm font-semibold text-slate-100 bg-slate-900 border border-slate-700 hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <Github className="w-4 h-4 shrink-0" aria-hidden="true" />
              {loading === 'GitHub' ? 'Đang chuyển tới GitHub...' : 'Tiếp tục với GitHub'}
            </button>

            <p className="text-xs text-slate-500 leading-relaxed">
              Phiên đăng nhập được Firebase quản lý. Nếu nhà cung cấp chưa bật hoặc tên miền Preview chưa được cấp quyền, hệ thống sẽ hiển thị lỗi cụ thể.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Cần dùng tài khoản OCodeJS? <a href="https://ocodejs.co/oauth/" target="_blank" rel="noreferrer" className="text-slate-200 underline underline-offset-4 hover:text-white">Mở cổng xác thực OCodeJS</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
