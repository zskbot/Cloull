import { formatTimestampVi, getAuditActionLabel } from './formatters';
import type {
  AuditActionFilter,
  AuditDatePreset,
  AuditLogTargetType,
  EnrichedAuditLogEntry,
} from '../types/dns';

export interface AuditFilterCriteria {
  searchQuery: string;
  actionFilter: AuditActionFilter;
  domainIdFilter: string;
  datePreset: AuditDatePreset;
  fromDate: string;
  toDate: string;
}

const TARGET_TYPE_SET = new Set<string>(['record', 'bulk', 'forward', 'domain', 'pages']);

export function getAuditTargetTypeLabel(targetType: AuditLogTargetType): string {
  switch (targetType) {
    case 'record':
      return 'Bản ghi DNS';
    case 'bulk':
      return 'Nhập hàng loạt';
    case 'forward':
      return 'Chuyển tiếp Web';
    case 'pages':
      return 'Pages Web';
    case 'domain':
    default:
      return 'Tên miền & Xác thực';
  }
}

export function filterAuditLogs(
  logs: EnrichedAuditLogEntry[],
  criteria: AuditFilterCriteria
): EnrichedAuditLogEntry[] {
  const q = criteria.searchQuery.trim().toLowerCase();

  let startMs: number | null = null;
  let endMs: number | null = null;
  const now = new Date();

  if (criteria.datePreset === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    startMs = startOfToday.getTime();
  } else if (criteria.datePreset === '7d') {
    startMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  } else if (criteria.datePreset === '30d') {
    startMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  } else if (criteria.datePreset === 'custom') {
    if (criteria.fromDate) {
      const from = new Date(`${criteria.fromDate}T00:00:00`);
      if (!Number.isNaN(from.getTime())) startMs = from.getTime();
    }
    if (criteria.toDate) {
      const to = new Date(`${criteria.toDate}T23:59:59.999`);
      if (!Number.isNaN(to.getTime())) endMs = to.getTime();
    }
  }

  return logs.filter((item) => {
    if (criteria.domainIdFilter !== 'all' && item.domainId !== criteria.domainIdFilter) {
      return false;
    }

    if (criteria.actionFilter !== 'all') {
      if (TARGET_TYPE_SET.has(criteria.actionFilter)) {
        if (item.targetType !== criteria.actionFilter) return false;
      } else if (item.action !== criteria.actionFilter) {
        return false;
      }
    }

    if (startMs !== null || endMs !== null) {
      const tsMs = item.createdAt ? item.createdAt.toMillis() : Date.now();
      if (startMs !== null && tsMs < startMs) return false;
      if (endMs !== null && tsMs > endMs) return false;
    }

    if (q) {
      const actionText = getAuditActionLabel(item.action).text.toLowerCase();
      const matched =
        item.targetLabel.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.actorEmail.toLowerCase().includes(q) ||
        item.domainName.toLowerCase().includes(q) ||
        actionText.includes(q) ||
        (item.beforeSummary || '').toLowerCase().includes(q) ||
        (item.afterSummary || '').toLowerCase().includes(q);
      if (!matched) return false;
    }

    return true;
  });
}

function formatAuditCsvTimestamp(ts?: EnrichedAuditLogEntry['createdAt']): string {
  if (!ts) return '';
  const date = ts.toDate();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escapeCsvCell(value: string): string {
  const singleLine = value.replace(/[\r\n]+/g, ' ').trim();
  const safe = /^[=+\-@\t]/.test(singleLine) ? `'${singleLine}` : singleLine;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportAuditLogsCsv(logs: EnrichedAuditLogEntry[], filename: string): void {
  const headers = [
    'Thời gian',
    'Tên miền',
    'Loại thao tác',
    'Nhóm',
    'Mục tiêu',
    'Tóm tắt',
    'Trước thay đổi',
    'Sau thay đổi',
    'Người thực hiện',
  ];

  const rows = logs.map((log) => {
    const actionLabel = getAuditActionLabel(log.action).text;
    const groupLabel = getAuditTargetTypeLabel(log.targetType);
    return [
      escapeCsvCell(formatAuditCsvTimestamp(log.createdAt) || formatTimestampVi(log.createdAt)),
      escapeCsvCell(log.domainName),
      escapeCsvCell(actionLabel),
      escapeCsvCell(groupLabel),
      escapeCsvCell(log.targetLabel),
      escapeCsvCell(log.summary),
      escapeCsvCell(log.beforeSummary || ''),
      escapeCsvCell(log.afterSummary || ''),
      escapeCsvCell(log.actorEmail),
    ].join(',');
  });

  const csvContent = `\uFEFF${[headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
