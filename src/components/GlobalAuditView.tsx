import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { exportAuditLogsCsv } from '../lib/auditHelpers';
import { subscribeAllDomainsAuditLogs } from '../lib/dnsService';
import type { Domain, EnrichedAuditLogEntry } from '../types/dns';
import { AuditSearchPanel } from './AuditSearchPanel';

interface GlobalAuditViewProps {
  uid: string;
  domains: Domain[];
  domainsLoading: boolean;
  onSelectDomain: (domainId: string) => void;
  onNotify: (msg: string) => void;
}

export function GlobalAuditView({
  uid,
  domains,
  domainsLoading,
  onSelectDomain,
  onNotify,
}: GlobalAuditViewProps) {
  const [logs, setLogs] = useState<EnrichedAuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<EnrichedAuditLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const domainSignature = useMemo(
    () => domains.map((d) => `${d.id}:${d.name}`).join('|'),
    [domains]
  );

  useEffect(() => {
    if (domainsLoading && domains.length === 0) {
      setLogsLoading(true);
      return;
    }
    setLogsLoading(true);
    const unsub = subscribeAllDomainsAuditLogs(uid, domains, (merged) => {
      setLogs(merged);
      setLogsLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, domainSignature, domainsLoading]);

  const handleFilteredLogsChange = useCallback((nextFiltered: EnrichedAuditLogEntry[]) => {
    setFilteredLogs(nextFiltered);
  }, []);

  const handleExportVisibleCsv = () => {
    if (filteredLogs.length === 0) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportAuditLogsCsv(filteredLogs, `nhat-ky-audit-toan-cuc-${dateStamp}.csv`);
    onNotify(`Đã xuất ${filteredLogs.length} dòng nhật ký đang hiển thị ra tệp CSV chuẩn Excel.`);
  };

  const stats = useMemo(() => {
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    let last24h = 0;
    const activeDomainSet = new Set<string>();
    for (const item of logs) {
      activeDomainSet.add(item.domainId);
      const ms = item.createdAt ? item.createdAt.toMillis() : Date.now();
      if (ms >= cutoff24h) last24h += 1;
    }
    return {
      total: logs.length,
      last24h,
      activeDomains: activeDomainSet.size,
    };
  }, [logs]);

  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 @md:px-5 py-4 border-b border-slate-200 flex flex-col @md:flex-row @md:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h2 className="text-base @md:text-lg font-bold text-slate-900">
              Lịch sử thay đổi toàn hệ thống (Audit Log)
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tra cứu tập trung mọi thay đổi bản ghi DNS, nhập hàng loạt, chuyển tiếp Web, xác thực tên miền và phát hành Pages Web trên toàn bộ tên miền của bạn.
            </p>
          </div>

          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={handleExportVisibleCsv}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] @md:min-h-0 @md:py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">Xuất CSV ({filteredLogs.length})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 @sm:grid-cols-3 divide-y @sm:divide-y-0 @sm:divide-x divide-slate-200">
          <div className="px-4 @md:px-5 py-3.5 space-y-0.5">
            <p className="text-xs font-medium text-slate-500">Tổng sự kiện ghi nhận</p>
            <p className="text-lg font-bold text-slate-900 font-mono tabular-nums">
              {stats.total} mục
            </p>
          </div>
          <div className="px-4 @md:px-5 py-3.5 space-y-0.5">
            <p className="text-xs font-medium text-slate-500">Biến động 24 giờ qua</p>
            <p className="text-lg font-bold text-blue-700 font-mono tabular-nums">
              {stats.last24h} thao tác
            </p>
          </div>
          <div className="px-4 @md:px-5 py-3.5 space-y-0.5">
            <p className="text-xs font-medium text-slate-500">Tên miền có nhật ký</p>
            <p className="text-lg font-bold text-slate-900 font-mono tabular-nums">
              {stats.activeDomains} / {domains.length}
            </p>
          </div>
        </div>
      </section>

      <AuditSearchPanel
        logs={logs}
        loading={logsLoading || domainsLoading}
        domains={domains}
        showDomainFilter={true}
        showExportButton={false}
        exportFilePrefix="nhat-ky-audit-toan-cuc"
        emptyTitle="Chưa có nhật ký thay đổi nào"
        emptyDescription="Hãy thêm tên miền hoặc thực hiện thao tác trên bản ghi DNS; toàn bộ lịch sử kiểm toán sẽ tự động tổng hợp tại đây."
        onFilteredLogsChange={handleFilteredLogsChange}
        onSelectDomain={onSelectDomain}
        onNotify={onNotify}
      />
    </div>
  );
}
