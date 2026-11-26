import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface TotpVerifyModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onVerify: (code: string) => Promise<boolean>;
}

export function TotpVerifyModal({
  title,
  description,
  confirmLabel,
  onCancel,
  onVerify,
}: TotpVerifyModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleaned)) {
      setError('Vui lòng nhập đủ 6 chữ số từ ứng dụng xác thực.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const ok = await onVerify(cleaned);
      if (!ok) {
        setError('Mã xác thực không khớp hoặc đã hết hạn. Vui lòng thử mã mới.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xác minh mã OTP.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-900 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">{description}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">Mã xác thực 6 chữ số</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-3 py-2 text-center text-lg tracking-widest font-mono tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
            >
              {verifying ? 'Đang kiểm tra...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
