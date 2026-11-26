import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Globe, ShieldCheck, Activity, FileSpreadsheet } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đăng nhập bằng Google.';
      if (msg.includes('popup-closed-by-user')) {
        setError('Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.');
      } else if (msg.includes('popup-blocked')) {
        setError('Trình duyệt đang chặn cửa sổ bật lên. Vui lòng cho phép popup và thử lại.');
      } else {
        setError(`Đăng nhập thất bại: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            Trạm Điều Khiển DNS
          </span>
          <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap shrink-0">
            Quản trị tên miền riêng · Lưu trữ Firebase
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-12">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-stretch">
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 sm:p-8 flex flex-col justify-between space-y-6 sm:space-y-8">
            <div className="space-y-3 sm:space-y-4">
              <p className="text-xs font-medium text-blue-700">Nền tảng quản trị vùng DNS</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
                Kiểm soát toàn bộ bản ghi DNS cho tên miền riêng trên một giao diện tập trung
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
                Quản lý 19 loại bản ghi chuẩn và nâng cao, nhập xuất tệp vùng BIND/CSV, kiểm tra phân giải thực tế ngoài Internet và phát hiện sớm bản ghi lơ lửng.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 pt-5 sm:pt-6 border-t border-slate-200">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <Globe className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>19 loại bản ghi DNS</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Đầy đủ A, AAAA, CNAME, MX, TXT, SRV, CAA, ALIAS, DS, TLSA, SSHFP, HTTPS và SVCB.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <Activity className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Kiểm tra phân giải thực tế</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Đối chiếu NS, SOA và bản ghi trực tiếp với hệ thống DNS công cộng, phát hiện bản ghi lơ lửng.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Nhập xuất chuẩn BIND / CSV</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Kiểm tra cú pháp từng dòng trước khi nhập hàng loạt và xuất tệp .zone sẵn sàng triển khai.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Bảo vệ dữ liệu & 2FA TOTP</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Phân tách dữ liệu theo tài khoản trên Firestore kèm xác thực hai yếu tố TOTP chuẩn RFC 6238.
                </p>
              </div>
            </div>
          </section>

          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 sm:p-8 flex flex-col justify-center space-y-5 sm:space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">Đăng nhập hệ thống</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Sử dụng tài khoản Google đã xác minh để đồng bộ danh sách tên miền và cấu hình bản ghi của riêng bạn.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 min-h-[44px] py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              {loading ? 'Đang kết nối tài khoản...' : 'Đăng nhập bằng Google'}
            </button>

            <p className="text-xs text-slate-500 leading-relaxed">
              Mọi vùng tên miền, bản ghi DNS và quy tắc chuyển tiếp được bảo vệ độc lập theo mã định danh người dùng trên Cloud Firestore.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
