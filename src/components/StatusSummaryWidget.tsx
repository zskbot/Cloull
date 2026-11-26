import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { formatDateVi, formatTimestampVi, getDomainExpiryMeta } from '../lib/formatters';
import type { Domain } from '../types/dns';

interface StatusSummaryWidgetProps {
  domains: Domain[];
  onSelectDomain: (domainId: string) => void;
  onOpenAllDomains: () => void;
}

const EXPIRING_SOON_DAYS = 30;

export function StatusSummaryWidget({
  domains,
  onSelectDomain,
  onOpenAllDomains,
}: StatusSummaryWidgetProps) {
  const activeDomains = domains.filter((d) => d.status === 'active');
  const pendingCount = domains.filter((d) => d.status === 'pending').length;
  const warningStatusCount = domains.filter((d) => d.status === 'warning').length;

  const domainsWithExpiry = domains.filter((d) => Boolean(d.expiresAt));
  const expiringDomains = domains
    .map((dom) => ({
      dom,
      meta: getDomainExpiryMeta(dom.expiresAt, EXPIRING_SOON_DAYS),
    }))
    .filter(({ meta }) => meta.hasExpiry && meta.isExpiringSoon)
    .sort((a, b) => (a.meta.daysRemaining ?? 9999) - (b.meta.daysRemaining ?? 9999));

  const recentDnsErrors = domains
    .filter((d) => d.lastHealthStatus === 'critical' || d.lastHealthStatus === 'warning')
    .sort((a, b) => {
      const ta = a.lastHealthCheckAt
        ? a.lastHealthCheckAt.toMillis()
        : a.updatedAt
          ? a.updatedAt.toMillis()
          : 0;
      const tb = b.lastHealthCheckAt
        ? b.lastHealthCheckAt.toMillis()
        : b.updatedAt
          ? b.updatedAt.toMillis()
          : 0;
      return tb - ta;
    });

  return (
    <section
      aria-label="Tóm tắt tình trạng"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col @sm:flex-row @sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-base font-semibold text-slate-900">Tóm tắt tình trạng</h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {domains.length} tên miền · {expiringDomains.length} sắp hết hạn · {recentDnsErrors.length} lỗi DNS
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenAllDomains}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0 self-start @sm:self-auto"
        >
          Quản lý tên miền
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-12 divide-y @3xl:divide-y-0 @3xl:divide-x divide-slate-200">
        {/* Cột 1: Số lượng tên miền đang hoạt động */}
        <div className="@3xl:col-span-3 p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Tên miền đang hoạt động</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {activeDomains.length}
              </span>
              <span className="text-sm text-slate-500 font-mono tabular-nums">
                / {domains.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Trạng thái hoạt động chuẩn</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>Chờ xác minh: {pendingCount}</span>
            <span aria-hidden="true">·</span>
            <span>Cần kiểm tra: {warningStatusCount}</span>
          </div>
        </div>

        {/* Cột 2: Tên miền sắp hết hạn */}
        <div className="@3xl:col-span-4 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Tên miền sắp hết hạn (≤ {EXPIRING_SOON_DAYS} ngày)</span>
            </div>
            <span
              className={`text-xs font-semibold font-mono tabular-nums ${
                expiringDomains.length > 0 ? 'text-amber-700' : 'text-slate-600'
              }`}
            >
              {expiringDomains.length}
            </span>
          </div>

          {domains.length === 0 ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              Chưa có tên miền nào để theo dõi ngày hết hạn.
            </p>
          ) : expiringDomains.length === 0 ? (
            <div className="space-y-2">
              {domainsWithExpiry.length > 0 ? (
                <div className="flex items-start gap-2 text-xs text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Tất cả {domainsWithExpiry.length} tên miền đã khai báo hạn đều còn trên {EXPIRING_SOON_DAYS} ngày.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Chưa có tên miền nào khai báo ngày hết hạn. Bạn có thể nhập thủ công hoặc tra cứu RDAP trong mục sửa tên miền.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenAllDomains}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
                  >
                    Cập nhật ngày hết hạn
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {expiringDomains.slice(0, 4).map(({ dom, meta }) => (
                <div
                  key={dom.id}
                  className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelectDomain(dom.id)}
                      className="font-mono font-medium text-slate-900 hover:text-blue-700 truncate block max-w-full text-left"
                    >
                      {dom.name}
                    </button>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      Hết hạn: {formatDateVi(dom.expiresAt)}
                    </div>
                  </div>
                  <span className={`font-medium font-mono tabular-nums whitespace-nowrap shrink-0 ${meta.colorClass}`}>
                    {meta.label}
                  </span>
                </div>
              ))}
              {expiringDomains.length > 4 && (
                <div className="pt-2 text-xs">
                  <button
                    type="button"
                    onClick={onOpenAllDomains}
                    className="text-blue-700 font-medium hover:underline"
                  >
                    Xem thêm {expiringDomains.length - 4} tên miền sắp hết hạn
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cột 3: Các thông báo lỗi DNS gần đây */}
        <div className="@3xl:col-span-5 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Thông báo lỗi DNS gần đây</span>
            </div>
            <span
              className={`text-xs font-semibold font-mono tabular-nums ${
                recentDnsErrors.length > 0 ? 'text-red-700' : 'text-slate-600'
              }`}
            >
              {recentDnsErrors.length}
            </span>
          </div>

          {recentDnsErrors.length === 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Không có thông báo lỗi DNS gần đây</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Các lần kiểm tra sức khỏe DNS gần nhất chưa ghi nhận lỗi NS, SOA hoặc sai lệch bản ghi.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentDnsErrors.slice(0, 4).map((dom) => {
                const isCritical = dom.lastHealthStatus === 'critical';
                return (
                  <div key={dom.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectDomain(dom.id)}
                        className="font-mono text-xs font-semibold text-slate-900 hover:text-blue-700 truncate text-left"
                      >
                        {dom.name}
                      </button>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                          isCritical ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {isCritical ? 'Lỗi nghiêm trọng' : 'Cảnh báo DNS'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {dom.lastHealthSummary}
                    </p>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono tabular-nums">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{formatTimestampVi(dom.lastHealthCheckAt || dom.updatedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
