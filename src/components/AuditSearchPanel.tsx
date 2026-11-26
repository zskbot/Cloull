import { useEffect, useMemo, useState } from 'react';
import { Clock, Download, Globe, History, Search, X } from 'lucide-react';
import { exportAuditLogsCsv, filterAuditLogs } from '../lib/auditHelpers';
import { formatTimestampVi, getAuditActionLabel } from '../lib/formatters';
import type {
  AuditActionFilter,
  AuditDatePreset,
  Domain,
  EnrichedAuditLogEntry,
} from '../types/dns';

interface AuditSearchPanelProps {
  logs: EnrichedAuditLogEntry[];
  loading: boolean;
  domains?: Domain[];
  showDomainFilter?: boolean;
  showExportButton?: boolean;
  exportFilePrefix?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onFilteredLogsChange?: (filtered: EnrichedAuditLogEntry[]) => void;
  onSelectDomain?: (domainId: string) => void;
  onNotify?: (msg: string) => void;
}

const INITIAL_BATCH_SIZE = 25;

export function AuditSearchPanel({
  logs,
  loading,
  domains = [],
  showDomainFilter = false,
  showExportButton = true,
  exportFilePrefix = 'nhat-ky-audit',
  emptyTitle = 'Chưa có nhật ký thay đổi',
  emptyDescription = 'Khi bạn thêm, sửa, xóa bản ghi DNS, nhập hàng loạt, bật/tắt chuyển tiếp hoặc xác thực tên miền, sự kiện sẽ được ghi bất biến vào Firestore.',
  onFilteredLogsChange,
  onSelectDomain,
  onNotify,
}: AuditSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditActionFilter>('all');
  const [domainIdFilter, setDomainIdFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<AuditDatePreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_BATCH_SIZE);

  const filteredLogs = useMemo(
    () =>
      filterAuditLogs(logs, {
        searchQuery,
        actionFilter,
        domainIdFilter: showDomainFilter ? domainIdFilter : 'all',
        datePreset,
        fromDate,
        toDate,
      }),
    [logs, searchQuery, actionFilter, domainIdFilter, showDomainFilter, datePreset, fromDate, toDate]
  );

  useEffect(() => {
    onFilteredLogsChange?.(filteredLogs);
  }, [filteredLogs, onFilteredLogsChange]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    actionFilter !== 'all' ||
    (showDomainFilter && domainIdFilter !== 'all') ||
    datePreset !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setActionFilter('all');
    setDomainIdFilter('all');
    setDatePreset('all');
    setFromDate('');
    setToDate('');
    setVisibleLimit(INITIAL_BATCH_SIZE);
  };

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportAuditLogsCsv(filteredLogs, `${exportFilePrefix}-${dateStamp}.csv`);
    onNotify?.(`Đã xuất ${filteredLogs.length} dòng nhật ký kiểm toán ra tệp CSV.`);
  };

  const visibleLogs = filteredLogs.slice(0, visibleLimit);
  const remainingCount = Math.max(0, filteredLogs.length - visibleLogs.length);

  return (
    <div className="space-y-4">
      {/* Thanh tìm kiếm & bộ lọc đa chiều */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 @md:p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleLimit(INITIAL_BATCH_SIZE);
            }}
            placeholder="Tìm theo từ khóa, bản ghi, giá trị trước/sau, tên miền hoặc email..."
            aria-label="Tìm kiếm lịch sử thay đổi"
            className="w-full pl-9 pr-10 min-h-[44px] @md:min-h-0 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setVisibleLimit(INITIAL_BATCH_SIZE);
              }}
              aria-label="Xóa từ khóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          className={`grid grid-cols-1 ${
            showDomainFilter ? '@2xl:grid-cols-3' : '@2xl:grid-cols-2'
          } gap-2.5`}
        >
          {showDomainFilter && (
            <select
              value={domainIdFilter}
              onChange={(e) => {
                setDomainIdFilter(e.target.value);
                setVisibleLimit(INITIAL_BATCH_SIZE);
              }}
              aria-label="Lọc theo tên miền"
              className="px-3 min-h-[44px] @md:min-h-0 py-2 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="all">Tên miền: Tất cả ({domains.length})</option>
              {domains.map((dom) => (
                <option key={dom.id} value={dom.id}>
                  {dom.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value as AuditActionFilter);
              setVisibleLimit(INITIAL_BATCH_SIZE);
            }}
            aria-label="Lọc theo loại thao tác"
            className="px-3 min-h-[44px] @md:min-h-0 py-2 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-800"
          >
            <option value="all">Loại thao tác: Tất cả</option>
            <optgroup label="Theo nhóm chức năng">
              <option value="record">Nhóm: Bản ghi DNS</option>
              <option value="bulk">Nhóm: Nhập hàng loạt</option>
              <option value="forward">Nhóm: Chuyển tiếp Web</option>
              <option value="pages">Nhóm: Pages Web</option>
              <option value="domain">Nhóm: Tên miền & Xác thực</option>
            </optgroup>
            <optgroup label="Theo hành động cụ thể">
              <option value="record_create">Thêm bản ghi</option>
              <option value="record_update">Cập nhật bản ghi</option>
              <option value="record_delete">Xóa bản ghi</option>
              <option value="record_duplicate">Nhân bản bản ghi</option>
              <option value="bulk_import">Nhập hàng loạt</option>
              <option value="forward_create">Tạo chuyển tiếp</option>
              <option value="forward_toggle">Đổi trạng thái chuyển tiếp</option>
              <option value="forward_delete">Xóa chuyển tiếp</option>
              <option value="domain_create">Khởi tạo tên miền</option>
              <option value="domain_verify_init">Tạo mã xác thực TXT</option>
              <option value="domain_verified">Xác thực thành công</option>
              <option value="pages_provision">Phát hành Pages Web</option>
            </optgroup>
          </select>

          <select
            value={datePreset}
            onChange={(e) => {
              setDatePreset(e.target.value as AuditDatePreset);
              setVisibleLimit(INITIAL_BATCH_SIZE);
            }}
            aria-label="Lọc theo khoảng thời gian"
            className="px-3 min-h-[44px] @md:min-h-0 py-2 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-800"
          >
            <option value="all">Thời gian: Tất cả</option>
            <option value="today">Hôm nay</option>
            <option value="7d">7 ngày gần đây</option>
            <option value="30d">30 ngày gần đây</option>
            <option value="custom">Tùy chỉnh khoảng ngày...</option>
          </select>
        </div>

        {datePreset === 'custom' && (
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-2.5 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0 w-16 font-medium">Từ ngày</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setVisibleLimit(INITIAL_BATCH_SIZE);
                }}
                className="flex-1 px-3 min-h-[40px] @md:min-h-0 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0 w-16 font-medium">Đến ngày</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setVisibleLimit(INITIAL_BATCH_SIZE);
                }}
                className="flex-1 px-3 min-h-[40px] @md:min-h-0 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-mono tabular-nums">
            Hiển thị {filteredLogs.length} / {logs.length} nhật ký
          </span>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 min-h-[36px] @md:min-h-0 @md:py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded whitespace-nowrap shrink-0"
              >
                Đặt lại bộ lọc
              </button>
            )}
            {showExportButton && (
              <button
                type="button"
                disabled={filteredLogs.length === 0}
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 min-h-[38px] @md:min-h-0 @md:py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Danh sách kết quả nhật ký */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 @md:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-slate-600 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              Nhật ký kiểm toán thay đổi (Audit Log)
            </h3>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
            {filteredLogs.length} mục
          </span>
        </div>

        {loading && logs.length === 0 ? (
          <div className="p-4 @md:p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 @md:p-10 text-center space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">
              {logs.length === 0 ? emptyTitle : 'Không tìm thấy nhật ký khớp bộ lọc'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {logs.length === 0
                ? emptyDescription
                : 'Hãy thử từ khóa khác, mở rộng khoảng thời gian hoặc đặt lại bộ lọc.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center justify-center px-4 min-h-[40px] @md:min-h-0 @md:py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"
              >
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-200">
              {visibleLogs.map((log) => {
                const badge = getAuditActionLabel(log.action);
                return (
                  <div
                    key={`${log.domainId}-${log.id}`}
                    className="p-3.5 @md:px-5 @md:py-4 space-y-2 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${badge.badgeClass}`}
                        >
                          {badge.text}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-900 break-all">
                          {log.targetLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums shrink-0">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatTimestampVi(log.createdAt)}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">{log.summary}</p>

                    {(log.beforeSummary || log.afterSummary) && (
                      <div className="grid grid-cols-1 @md:grid-cols-2 gap-2 text-[11px] font-mono">
                        {log.beforeSummary && (
                          <div className="px-2.5 py-1.5 bg-red-50/70 border border-red-200/80 rounded text-red-800 break-all">
                            <span className="font-sans font-semibold mr-1">Trước:</span>
                            {log.beforeSummary}
                          </div>
                        )}
                        {log.afterSummary && (
                          <div className="px-2.5 py-1.5 bg-emerald-50/70 border border-emerald-200/80 rounded text-emerald-800 break-all">
                            <span className="font-sans font-semibold mr-1">Sau:</span>
                            {log.afterSummary}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                      {showDomainFilter && (
                        <>
                          {onSelectDomain ? (
                            <button
                              type="button"
                              onClick={() => onSelectDomain(log.domainId)}
                              className="inline-flex items-center gap-1 font-mono font-medium text-blue-700 hover:underline"
                            >
                              <Globe className="w-3 h-3" />
                              {log.domainName}
                            </button>
                          ) : (
                            <span className="font-mono text-slate-700">{log.domainName}</span>
                          )}
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="font-mono truncate">{log.actorEmail}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {remainingCount > 0 && (
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + INITIAL_BATCH_SIZE)}
                  className="px-4 min-h-[40px] @md:min-h-0 @md:py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md"
                >
                  Xem thêm {Math.min(remainingCount, INITIAL_BATCH_SIZE)} mục (còn {remainingCount})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
