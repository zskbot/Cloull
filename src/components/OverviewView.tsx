import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Globe, Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import type { Domain, UserProfile } from '../types/dns';
import { formatTimestampVi, getDomainStatusLabel, getHealthStatusLabel } from '../lib/formatters';
import { StatusSummaryWidget } from './StatusSummaryWidget';

interface OverviewViewProps {
  domains: Domain[];
  profile: UserProfile | null;
  loading: boolean;
  onOpenAddDomain: () => void;
  onSelectDomain: (domainId: string) => void;
  onOpenAllDomains: () => void;
  onOpenSecurity: () => void;
}

export function OverviewView({
  domains,
  profile,
  loading,
  onOpenAddDomain,
  onSelectDomain,
  onOpenAllDomains,
  onOpenSecurity,
}: OverviewViewProps) {
  const totalRecords = domains.reduce((acc, d) => acc + (d.recordCount || 0), 0);
  const healthyDomains = domains.filter((d) => d.lastHealthStatus === 'healthy').length;
  const attentionDomains = domains.filter(
    (d) => d.lastHealthStatus === 'warning' || d.lastHealthStatus === 'critical' || d.status === 'warning'
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 @md:grid-cols-2 @4xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-5 h-24 animate-pulse" />
          ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-6 h-48 animate-pulse" />
        <div className="bg-white border border-slate-200 rounded-lg p-6 h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4 cột chỉ số tổng quan */}
      <div className="grid grid-cols-1 @md:grid-cols-2 @4xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Tên miền đang quản lý</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{domains.length}</p>
          <p className="text-xs text-slate-500">Vùng DNS riêng</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Tổng số bản ghi DNS</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{totalRecords}</p>
          <p className="text-xs text-slate-500">Trên toàn bộ tên miền</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Tình trạng phân giải</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {healthyDomains}/{domains.length}
          </p>
          <p className="text-xs text-slate-500">Tên miền đạt kiểm tra thực tế</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Xác thực hai yếu tố</p>
          <div className="flex items-center gap-2 pt-0.5">
            {profile?.totpEnabled ? (
              <>
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                <span className="text-base font-semibold text-emerald-700">Đang bật</span>
              </>
            ) : (
              <>
                <ShieldOff className="w-5 h-5 text-amber-700 shrink-0" />
                <span className="text-base font-semibold text-amber-700">Chưa bật</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenSecurity}
            className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
          >
            {profile?.totpEnabled ? 'Quản lý khóa 2FA' : 'Thiết lập 2FA ngay'}
          </button>
        </div>
      </div>

      {/* Widget Tóm tắt tình trạng */}
      <StatusSummaryWidget
        domains={domains}
        onSelectDomain={onSelectDomain}
        onOpenAllDomains={onOpenAllDomains}
      />

      {/* Trạng thái trống hoàn toàn */}
      {domains.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-4">
          <div className="mx-auto w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
            <Globe className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg font-semibold text-slate-900">Chưa có tên miền nào trong hệ thống</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Hãy thêm tên miền riêng đầu tiên để bắt đầu quản lý bản ghi DNS, nhập tệp vùng BIND hoặc kiểm tra sức khỏe phân giải thực tế.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAddDomain}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Thêm tên miền đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-6 items-start">
          {/* Danh sách tên miền gần đây */}
          <div className="@3xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-slate-900">Tên miền cập nhật gần đây</h2>
              <button
                type="button"
                onClick={onOpenAllDomains}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
              >
                Xem tất cả
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-5">Tên miền</th>
                    <th className="py-2.5 px-4 text-right">Bản ghi</th>
                    <th className="py-2.5 px-4">Trạng thái</th>
                    <th className="py-2.5 px-4">Sức khỏe DNS</th>
                    <th className="py-2.5 px-5 text-right">Cập nhật</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {domains.slice(0, 6).map((dom) => {
                    const st = getDomainStatusLabel(dom.status);
                    const hl = getHealthStatusLabel(dom.lastHealthStatus);
                    return (
                      <tr
                        key={dom.id}
                        onClick={() => onSelectDomain(dom.id)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-5">
                          <div className="font-mono font-medium text-slate-900">{dom.name}</div>
                          {dom.tags.length > 0 && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {dom.tags.join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {dom.recordCount}
                        </td>
                        <td className={`py-3 px-4 text-xs font-medium ${st.colorClass}`}>
                          {st.text}
                        </td>
                        <td className={`py-3 px-4 text-xs font-medium ${hl.colorClass}`}>
                          {hl.text}
                        </td>
                        <td className="py-3 px-5 text-right text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                          {formatTimestampVi(dom.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mục cần lưu ý */}
          <div className="@3xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Tình trạng cần chú ý</h2>
            {attentionDomains.length === 0 ? (
              <div className="py-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Không có cảnh báo bất thường</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Hãy chạy kiểm tra sức khỏe định kỳ trong chi tiết từng tên miền để xác minh NS, SOA và phát hiện bản ghi lơ lửng.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {attentionDomains.map((dom) => (
                  <div key={dom.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectDomain(dom.id)}
                        className="font-mono text-sm font-medium text-slate-900 hover:text-blue-700 truncate"
                      >
                        {dom.name}
                      </button>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {dom.lastHealthStatus === 'critical' ? 'Lỗi' : 'Cảnh báo'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{dom.lastHealthSummary}</p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimestampVi(dom.lastHealthCheckAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
