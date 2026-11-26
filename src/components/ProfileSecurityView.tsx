import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  disableTotpSecurity,
  enableTotpSecurity,
  getTotpSecret,
  updateUserProfile,
} from '../lib/dnsService';
import {
  buildOtpAuthUri,
  generateBase32Secret,
  getSecondsRemainingInWindow,
  verifyTotpCode,
} from '../lib/totp';
import type { UserProfile } from '../types/dns';

interface ProfileSecurityViewProps {
  uid: string;
  profile: UserProfile | null;
  userEmail: string;
  onNotify: (msg: string) => void;
}

export function ProfileSecurityView({
  uid,
  profile,
  userEmail,
  onNotify,
}: ProfileSecurityViewProps) {
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [defaultTtl, setDefaultTtl] = useState(profile?.defaultTtl || 3600);
  const [notifyHealthAlerts, setNotifyHealthAlerts] = useState(profile?.notifyHealthAlerts ?? true);
  const [notifyDanglingRecords, setNotifyDanglingRecords] = useState(profile?.notifyDanglingRecords ?? true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Thiết lập 2FA TOTP
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [testCode, setTestCode] = useState('');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(getSecondsRemainingInWindow());

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setDefaultTtl(profile.defaultTtl);
      setNotifyHealthAlerts(profile.notifyHealthAlerts);
      setNotifyDanglingRecords(profile.notifyDanglingRecords);
    }
  }, [profile]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(getSecondsRemainingInWindow());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateUserProfile(uid, {
        displayName,
        defaultTtl,
        notifyHealthAlerts,
        notifyDanglingRecords,
      });
      onNotify('Đã lưu thông tin hồ sơ và tùy chọn chung.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleStartTotpSetup = async () => {
    const secret = generateBase32Secret(20);
    const uri = buildOtpAuthUri(secret, userEmail);
    const dataUrl = await QRCode.toDataURL(uri, { width: 200, margin: 1 });
    setSetupSecret(secret);
    setQrDataUrl(dataUrl);
    setOtpInput('');
    setTotpError(null);
  };

  const handleConfirmEnableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupSecret) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      const ok = await verifyTotpCode(setupSecret, otpInput);
      if (!ok) {
        setTotpError('Mã 6 chữ số không khớp với khóa thiết lập. Vui lòng kiểm tra đồng hồ thiết bị và thử lại.');
        return;
      }
      await enableTotpSecurity(uid, setupSecret);
      setSetupSecret(null);
      setQrDataUrl(null);
      setOtpInput('');
      onNotify('Đã kích hoạt xác thực hai yếu tố (2FA TOTP).');
    } finally {
      setTotpBusy(false);
    }
  };

  const handleVerifyTestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestMessage(null);
    const secretDoc = await getTotpSecret(uid);
    if (!secretDoc) {
      setTestMessage('Không tìm thấy khóa bí mật 2FA.');
      return;
    }
    const ok = await verifyTotpCode(secretDoc.secret, testCode);
    setTestMessage(
      ok
        ? 'Mã OTP chính xác. Thiết bị xác thực của bạn đang đồng bộ chuẩn.'
        : 'Mã OTP chưa khớp. Vui lòng nhập mã mới nhất từ ứng dụng.'
    );
  };

  const handleDisableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpBusy(true);
    setTotpError(null);
    try {
      const secretDoc = await getTotpSecret(uid);
      if (!secretDoc) {
        await disableTotpSecurity(uid);
        onNotify('Đã tắt xác thực 2 lớp.');
        return;
      }
      const ok = await verifyTotpCode(secretDoc.secret, disableCode);
      if (!ok) {
        setTotpError('Mã OTP không đúng. Cần xác minh mã hợp lệ để tắt 2FA.');
        return;
      }
      await disableTotpSecurity(uid);
      setDisableCode('');
      onNotify('Đã tắt xác thực hai yếu tố.');
    } finally {
      setTotpBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-6 items-start max-w-5xl">
      {/* Cột trái: Hồ sơ & Tùy chọn chung */}
      <form
        onSubmit={handleSaveProfile}
        className="@3xl:col-span-6 bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-5"
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">Hồ sơ quản trị & Tùy chọn chung</h2>
          <p className="text-xs text-slate-500">
            Cập nhật tên hiển thị, giá trị TTL mặc định và chế độ cảnh báo sức khỏe vùng DNS.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700">Email tài khoản (Google)</label>
          <input
            type="text"
            disabled
            value={userEmail}
            className="w-full px-3 py-2 text-sm bg-slate-50 text-slate-500 border border-slate-200 rounded-md"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700">Tên hiển thị</label>
          <input
            type="text"
            required
            maxLength={100}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700">
            TTL mặc định khi tạo bản ghi mới (giây)
          </label>
          <select
            value={defaultTtl}
            onChange={(e) => setDefaultTtl(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md bg-white"
          >
            <option value={60}>60 giây (1 phút)</option>
            <option value={300}>300 giây (5 phút)</option>
            <option value={900}>900 giây (15 phút)</option>
            <option value={3600}>3600 giây (1 giờ)</option>
            <option value={43200}>43200 giây (12 giờ)</option>
            <option value={86400}>86400 giây (24 giờ)</option>
          </select>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-700">Cài đặt thông báo</p>
          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyHealthAlerts}
              onChange={(e) => setNotifyHealthAlerts(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            Hiển thị cảnh báo trên Tổng quan khi phát hiện lỗi NS/SOA
          </label>
          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyDanglingRecords}
              onChange={(e) => setNotifyDanglingRecords(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            Ưu tiên nhắc nhở khi phát hiện bản ghi lơ lửng (Dangling DNS)
          </label>
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
        >
          {savingProfile ? 'Đang lưu...' : 'Lưu cài đặt hồ sơ'}
        </button>
      </form>

      {/* Cột phải: Xác thực hai yếu tố 2FA TOTP */}
      <div className="@3xl:col-span-6 bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Xác thực hai yếu tố (2FA TOTP)
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Bảo vệ các thao tác nhạy cảm (như xóa tên miền) bằng mã OTP 6 chữ số từ Google Authenticator hoặc Authy.
            </p>
          </div>
          {profile?.totpEnabled ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
              <ShieldCheck className="w-4 h-4" />
              Đã kích hoạt
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 shrink-0">
              <ShieldOff className="w-4 h-4" />
              Chưa bật
            </span>
          )}
        </div>

        {totpError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {totpError}
          </div>
        )}

        {!profile?.totpEnabled && !setupSecret && (
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <p className="text-xs text-slate-600 leading-relaxed">
              Hệ thống sử dụng chuẩn RFC 6238 (HMAC-SHA1, chu kỳ 30 giây). Khóa bí mật được lưu riêng biệt trong phân hệ bảo mật Firestore của tài khoản bạn.
            </p>
            <button
              type="button"
              onClick={handleStartTotpSetup}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Thiết lập xác thực 2 lớp
            </button>
          </div>
        )}

        {!profile?.totpEnabled && setupSecret && (
          <form onSubmit={handleConfirmEnableTotp} className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex flex-col @md:flex-row items-start gap-4">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Mã QR thiết lập xác thực 2 lớp TOTP"
                  className="w-36 h-36 border border-slate-200 rounded-md p-1 bg-white shrink-0"
                />
              )}
              <div className="space-y-2 text-xs text-slate-600 flex-1">
                <p className="font-medium text-slate-800">Bước 1: Quét mã QR bằng ứng dụng xác thực</p>
                <p>Hoặc nhập thủ công khóa bí mật Base32 bên dưới:</p>
                <div className="flex items-center gap-2">
                  <code className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded font-mono text-slate-900 select-all">
                    {setupSecret}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(setupSecret);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 2000);
                    }}
                    className="p-1.5 border border-slate-300 rounded hover:bg-slate-50"
                    title="Sao chép khóa bí mật"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-slate-500 font-mono tabular-nums">
                  Chu kỳ mã hiện tại còn: {secondsLeft}s
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Bước 2: Nhập mã 6 chữ số để xác nhận kích hoạt
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-48 px-3 py-2 text-center text-base tracking-widest font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={totpBusy}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
              >
                {totpBusy ? 'Đang xác minh...' : 'Xác nhận và bật 2FA'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetupSecret(null);
                  setQrDataUrl(null);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Hủy
              </button>
            </div>
          </form>
        )}

        {profile?.totpEnabled && (
          <div className="space-y-5 pt-2 border-t border-slate-200">
            <form onSubmit={handleVerifyTestOtp} className="space-y-2.5">
              <p className="text-xs font-medium text-slate-800">
                Kiểm tra đồng bộ mã OTP (chu kỳ hiện tại còn{' '}
                <span className="font-mono tabular-nums">{secondsLeft}s</span>)
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Nhập 6 số"
                  className="w-40 px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-md"
                >
                  Kiểm thử mã
                </button>
              </div>
              {testMessage && <p className="text-xs text-slate-600">{testMessage}</p>}
            </form>

            <form onSubmit={handleDisableTotp} className="pt-4 border-t border-slate-200 space-y-2.5">
              <p className="text-xs font-medium text-red-700">Tắt xác thực hai yếu tố</p>
              <p className="text-xs text-slate-500">
                Nhập mã OTP hiện tại từ ứng dụng xác thực để tắt bảo vệ 2 lớp.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Mã 6 chữ số"
                  className="w-40 px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
                <button
                  type="submit"
                  disabled={totpBusy}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-md"
                >
                  {totpBusy ? 'Đang xử lý...' : 'Tắt 2FA'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
