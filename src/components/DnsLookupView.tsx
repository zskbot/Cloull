import { useState } from 'react';
import { Search } from 'lucide-react';
import { ALL_RECORD_TYPES, type LiveLookupResult, type RecordType } from '../types/dns';

export function DnsLookupView() {
  const [fqdn, setFqdn] = useState('');
  const [type, setType] = useState<RecordType | 'SOA'>('A');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveLookupResult | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = fqdn.trim().toLowerCase().replace(/\.$/, '');
    if (!clean) {
      setError('Vui lòng nhập tên miền cần tra cứu.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dns/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fqdn: clean, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể thực hiện truy vấn.');
      }
      setResult(data as LiveLookupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối tra cứu DNS.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">Công cụ tra cứu DNS trực tiếp</h2>
          <p className="text-xs text-slate-600">
            Kiểm tra kết quả phân giải thực tế ngoài Internet cho bất kỳ tên miền và loại bản ghi nào.
          </p>
        </div>

        <form onSubmit={handleLookup} className="flex flex-col @md:flex-row gap-3">
          <input
            type="text"
            value={fqdn}
            onChange={(e) => setFqdn(e.target.value)}
            placeholder="Ví dụ: google.com hoặc _dmarc.tenmiencuaban.vn"
            className="flex-1 px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RecordType | 'SOA')}
            aria-label="Loại bản ghi tra cứu"
            className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-md bg-white"
          >
            <option value="SOA">SOA</option>
            {ALL_RECORD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] @md:min-h-0 @md:py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            {loading ? 'Đang truy vấn...' : 'Tra cứu ngay'}
          </button>
        </form>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-mono font-semibold text-slate-900">
              {result.fqdn} · {result.type}
            </div>
            <div className="font-mono tabular-nums text-slate-500">
              Mã phản hồi: {result.status === 0 ? 'NOERROR (0)' : result.status === 3 ? 'NXDOMAIN (3)' : result.status} · Độ trễ: {result.latencyMs} ms
            </div>
          </div>

          {result.answers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Không tìm thấy bản ghi {result.type} cho {result.fqdn}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                    <th className="py-2.5 px-5">Tên phản hồi</th>
                    <th className="py-2.5 px-4 text-right">TTL (giây)</th>
                    <th className="py-2.5 px-5">Giá trị trả về</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {result.answers.map((ans, idx) => (
                    <tr key={`${ans.name}-${idx}`}>
                      <td className="py-2.5 px-5 text-slate-900">{ans.name}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-600">{ans.ttl}</td>
                      <td className="py-2.5 px-5 text-slate-800 break-all">{ans.data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
