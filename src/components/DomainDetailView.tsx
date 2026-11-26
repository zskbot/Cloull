import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileUp,
  Globe,
  History,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  bulkImportDnsRecords,
  createDnsRecord,
  createWebForward,
  deleteDnsRecord,
  deleteWebForward,
  initDomainVerification,
  markDomainVerified,
  provisionPagesRecords,
  subscribeDomainAuditLogs,
  subscribeDomainRecords,
  subscribeWebForwards,
  updateDnsRecord,
  updateDomainHealthSummary,
  updateWebForward,
} from '../lib/dnsService';
import {
  BLUEPRINT_LIMITS,
  buildPagesRecordsPreset,
  exportBindZoneFile,
  parseBindZoneFile,
  parseCsvRecords,
  RECORD_TYPE_META,
  type ParsedBulkRow,
} from '../lib/dnsValidation';
import {
  formatTimestampVi,
  getAuditActionLabel,
  getDomainStatusLabel,
  getHealthStatusLabel,
  getPagesProviderLabel,
  getVerificationStatusLabel,
} from '../lib/formatters';
import {
  ALL_RECORD_TYPES,
  type AuditLogEntry,
  type DanglingScanReport,
  type DnsHealthReport,
  type DnsRecord,
  type Domain,
  type DomainVerificationResult,
  type EnrichedAuditLogEntry,
  type PagesProvider,
  type RecordSearchField,
  type RecordType,
  type RedirectType,
  type UserProfile,
  type WebForward,
} from '../types/dns';
import { AuditSearchPanel } from './AuditSearchPanel';
import { GitHubPagesDeployPanel } from './GitHubPagesDeployPanel';
import { RecordFormModal } from './RecordFormModal';

interface DomainDetailViewProps {
  uid: string;
  domain: Domain;
  profile: UserProfile | null;
  onBack: () => void;
  onNotify: (msg: string) => void;
}

type DetailTab = 'records' | 'bulk' | 'health' | 'forwards' | 'pages' | 'audit';
const PAGE_SIZE = 12;

const RECORD_TYPE_BADGE_CLASSES: Record<RecordType, string> = {
  A: 'bg-blue-50 text-blue-700 border-blue-200',
  AAAA: 'bg-sky-50 text-sky-700 border-sky-200',
  CNAME: 'bg-amber-50 text-amber-800 border-amber-200',
  MX: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TXT: 'bg-violet-50 text-violet-700 border-violet-200',
  NS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PTR: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  SRV: 'bg-orange-50 text-orange-700 border-orange-200',
  CAA: 'bg-rose-50 text-rose-700 border-rose-200',
  SPF: 'bg-teal-50 text-teal-700 border-teal-200',
  ALIAS: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  DS: 'bg-red-50 text-red-700 border-red-200',
  HINFO: 'bg-stone-100 text-stone-700 border-stone-300',
  HTTPS: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  NAPTR: 'bg-purple-50 text-purple-700 border-purple-200',
  RP: 'bg-slate-100 text-slate-700 border-slate-300',
  SSHFP: 'bg-lime-50 text-lime-800 border-lime-200',
  SVCB: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  TLSA: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

function getRecordTypeBadgeClass(type: string): string {
  return (
    RECORD_TYPE_BADGE_CLASSES[type as RecordType] ||
    'bg-slate-100 text-slate-700 border-slate-300'
  );
}

export function DomainDetailView({
  uid,
  domain,
  profile,
  onBack,
  onNotify,
}: DomainDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('records');
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [forwards, setForwards] = useState<WebForward[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  // Bộ lọc & sắp xếp bản ghi
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<RecordSearchField>('all');
  const [exactMatch, setExactMatch] = useState(false);
  const [groupFilter, setGroupFilter] = useState<'all' | 'common' | 'advanced'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'type' | 'host' | 'ttl'>('type');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [widgetCollapsed, setWidgetCollapsed] = useState(false);

  // Hộp thoại thêm/sửa bản ghi
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);

  // Nhập / Xuất hàng loạt
  const [importFormat, setImportFormat] = useState<'bind' | 'csv'>('bind');
  const [importText, setImportText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedBulkRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [copiedZone, setCopiedZone] = useState(false);

  // Kiểm tra sức khỏe & Bản ghi lơ lửng
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthReport, setHealthReport] = useState<DnsHealthReport | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [danglingLoading, setDanglingLoading] = useState(false);
  const [danglingReport, setDanglingReport] = useState<DanglingScanReport | null>(null);
  const [danglingError, setDanglingError] = useState<string | null>(null);

  // Chuyển tiếp Web
  const [fwdSourceHost, setFwdSourceHost] = useState('@');
  const [fwdTargetUrl, setFwdTargetUrl] = useState('https://');
  const [fwdType, setFwdType] = useState<RedirectType>('301');
  const [fwdPreservePath, setFwdPreservePath] = useState(true);
  const [fwdError, setFwdError] = useState<string | null>(null);
  const [fwdSaving, setFwdSaving] = useState(false);

  // Lịch sử thay đổi (Audit Log)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Xác thực tên miền & Phát hành Pages Web
  const [verifyInitLoading, setVerifyInitLoading] = useState(false);
  const [verifyChecking, setVerifyChecking] = useState(false);
  const [verifyResult, setVerifyResult] = useState<DomainVerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [addingVerifyTxt, setAddingVerifyTxt] = useState(false);
  const [pagesProvider, setPagesProvider] = useState<Exclude<PagesProvider, 'none'>>('github');
  const [pagesTarget, setPagesTarget] = useState('');
  const [pagesIncludeWww, setPagesIncludeWww] = useState(true);
  const [pagesIncludeIpv6, setPagesIncludeIpv6] = useState(false);
  const [pagesExtraTxt, setPagesExtraTxt] = useState('');
  const [pagesSaving, setPagesSaving] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);

  useEffect(() => {
    setRecordsLoading(true);
    setAuditLoading(true);
    setHealthReport(null);
    setDanglingReport(null);
    setHealthError(null);
    setDanglingError(null);
    setVerifyResult(null);
    setVerifyError(null);
    setPagesError(null);
    setPagesProvider(
      domain.pagesProvider && domain.pagesProvider !== 'none' ? domain.pagesProvider : 'github'
    );
    setPagesTarget(domain.pagesTarget || '');

    const unsubRecords = subscribeDomainRecords(uid, domain.id, (list) => {
      setRecords(list);
      setRecordsLoading(false);
    });
    const unsubForwards = subscribeWebForwards(uid, domain.id, (list) => {
      setForwards(list);
    });
    const unsubAudit = subscribeDomainAuditLogs(uid, domain.id, (logs) => {
      setAuditLogs(logs);
      setAuditLoading(false);
    });

    return () => {
      unsubRecords();
      unsubForwards();
      unsubAudit();
    };
  }, [uid, domain.id]);

  const activeRecords = useMemo(
    () => (records.length > 0 ? records : domain.records ?? []),
    [records, domain.records]
  );

  const allRecordTags = useMemo(() => {
    const set = new Set<string>();
    activeRecords.forEach((r) => r.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeRecords]);

  const recordStats = useMemo(() => {
    const total = activeRecords.length;
    const displayTotal = total > 0 ? total : domain.recordCount || 0;
    if (total === 0) {
      return {
        total: 0,
        displayTotal,
        avgTtl: 0,
        minTtl: 0,
        maxTtl: 0,
        taggedCount: 0,
        untaggedCount: displayTotal,
        domainTagCount: domain.tags.length,
        byType: [] as Array<{
          type: RecordType;
          count: number;
          percent: number;
          avgTtl: number;
          taggedRecords: DnsRecord[];
        }>,
        byTag: [] as Array<{
          tag: string;
          count: number;
          types: RecordType[];
          hosts: string[];
        }>,
      };
    }

    let sumTtl = 0;
    let minTtl = activeRecords[0].ttl;
    let maxTtl = activeRecords[0].ttl;
    let taggedCount = 0;
    const typeMap = new Map<
      RecordType,
      { count: number; sumTtl: number; taggedRecords: DnsRecord[] }
    >();
    const tagMap = new Map<
      string,
      { count: number; types: Set<RecordType>; hosts: string[] }
    >();

    for (const r of activeRecords) {
      sumTtl += r.ttl;
      if (r.ttl < minTtl) minTtl = r.ttl;
      if (r.ttl > maxTtl) maxTtl = r.ttl;

      if (r.tags.length > 0) {
        taggedCount += 1;
        for (const tag of r.tags) {
          const entry = tagMap.get(tag) || {
            count: 0,
            types: new Set<RecordType>(),
            hosts: [],
          };
          entry.count += 1;
          entry.types.add(r.type);
          entry.hosts.push(`${r.host} (${r.type})`);
          tagMap.set(tag, entry);
        }
      }

      const current = typeMap.get(r.type) || { count: 0, sumTtl: 0, taggedRecords: [] };
      current.count += 1;
      current.sumTtl += r.ttl;
      if (r.tags.length > 0) current.taggedRecords.push(r);
      typeMap.set(r.type, current);
    }

    const byType = Array.from(typeMap.entries())
      .map(([type, info]) => ({
        type,
        count: info.count,
        percent: Math.round((info.count / total) * 100),
        avgTtl: Math.round(info.sumTtl / info.count),
        taggedRecords: info.taggedRecords,
      }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    const byTag = Array.from(tagMap.entries())
      .map(([tag, info]) => ({
        tag,
        count: info.count,
        types: Array.from(info.types).sort(),
        hosts: info.hosts,
      }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    return {
      total,
      displayTotal,
      avgTtl: Math.round(sumTtl / total),
      minTtl,
      maxTtl,
      taggedCount,
      untaggedCount: total - taggedCount,
      domainTagCount: domain.tags.length,
      byType,
      byTag,
    };
  }, [activeRecords, domain.recordCount, domain.tags]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qNorm = q.replace(/\.$/, '');
    const list = activeRecords.filter((r) => {
      if (groupFilter !== 'all' && RECORD_TYPE_META[r.type]?.group !== groupFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (tagFilter !== 'all' && !r.tags.includes(tagFilter)) return false;

      if (q) {
        const hostLower = r.host.toLowerCase();
        const typeLower = r.type.toLowerCase();
        const valueLower = r.value.toLowerCase();
        const displayValueLower =
          r.type === 'MX'
            ? `${r.priority ?? 10} ${valueLower}`
            : r.type === 'SRV'
              ? `${r.priority ?? 0} ${r.weight ?? 0} ${r.port ?? 0} ${valueLower}`
              : valueLower;
        const notesLower = r.notes.toLowerCase();

        const matchVal = (target: string, allowTrailingDotNorm = false) => {
          if (exactMatch) {
            if (allowTrailingDotNorm) {
              return target === q || target.replace(/\.$/, '') === qNorm;
            }
            return target === q;
          }
          return target.includes(q);
        };

        if (searchField === 'host' && !matchVal(hostLower, true)) return false;
        if (searchField === 'type' && !matchVal(typeLower)) return false;
        if (
          searchField === 'value' &&
          !matchVal(valueLower, true) &&
          !matchVal(displayValueLower, true)
        ) {
          return false;
        }
        if (searchField === 'all') {
          const matchedAny =
            matchVal(hostLower, true) ||
            matchVal(typeLower) ||
            matchVal(valueLower, true) ||
            matchVal(displayValueLower, true) ||
            (!exactMatch && notesLower.includes(q));
          if (!matchedAny) return false;
        }
      }
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortBy === 'host') cmp = a.host.localeCompare(b.host);
      else cmp = a.ttl - b.ttl;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [activeRecords, search, searchField, exactMatch, groupFilter, typeFilter, tagFilter, sortBy, sortDir]);

  const hasActiveRecordFilters =
    Boolean(search.trim()) ||
    exactMatch ||
    searchField !== 'all' ||
    groupFilter !== 'all' ||
    typeFilter !== 'all' ||
    tagFilter !== 'all';

  const resetRecordFilters = () => {
    setSearch('');
    setSearchField('all');
    setExactMatch(false);
    setGroupFilter('all');
    setTypeFilter('all');
    setTagFilter('all');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRecords = filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const zonePreview = useMemo(
    () => exportBindZoneFile(domain.name, activeRecords, profile?.defaultTtl || 3600),
    [domain.name, activeRecords, profile?.defaultTtl]
  );

  const enrichedAuditLogs = useMemo<EnrichedAuditLogEntry[]>(
    () =>
      auditLogs.map((log) => ({
        ...log,
        domainName: domain.name,
      })),
    [auditLogs, domain.name]
  );

  const pagesPreset = useMemo(
    () =>
      buildPagesRecordsPreset(pagesProvider, pagesTarget, domain.name, {
        includeWww: pagesIncludeWww,
        includeIpv6: pagesIncludeIpv6,
        extraTxtValue: pagesExtraTxt,
        ttl: profile?.defaultTtl || 3600,
      }),
    [pagesProvider, pagesTarget, domain.name, pagesIncludeWww, pagesIncludeIpv6, pagesExtraTxt, profile?.defaultTtl]
  );

  const existingRecordSet = useMemo(() => {
    const normalizeVal = (val: string) => val.trim().toLowerCase().replace(/\.$/, '');
    return new Set(
      activeRecords.map(
        (r) => `${r.type}::${r.host.trim().toLowerCase()}::${normalizeVal(r.value)}`
      )
    );
  }, [activeRecords]);

  const toggleSort = (col: 'type' | 'host' | 'ttl') => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const formatRecordValueDisplay = (r: DnsRecord): string => {
    if (r.type === 'MX') return `${r.priority ?? 10} ${r.value}`;
    if (r.type === 'SRV') return `${r.priority ?? 0} ${r.weight ?? 0} ${r.port ?? 0} ${r.value}`;
    if (r.type === 'CAA') return `${r.caaFlags ?? 0} ${r.caaTag ?? 'issue'} "${r.value}"`;
    if (r.type === 'DS') return `${r.dsKeyTag ?? 0} ${r.dsAlgorithm ?? 13} ${r.dsDigestType ?? 2} ${r.value}`;
    if (r.type === 'SSHFP') return `${r.sshfpAlgorithm ?? 1} ${r.sshfpFingerprintType ?? 2} ${r.value}`;
    if (r.type === 'TLSA') return `${r.tlsaUsage ?? 3} ${r.tlsaSelector ?? 1} ${r.tlsaMatchingType ?? 1} ${r.value}`;
    if ((r.type === 'HTTPS' || r.type === 'SVCB') && r.priority !== undefined) return `${r.priority} ${r.value}`;
    return r.value;
  };

  const handleDuplicateRecord = async (rec: DnsRecord) => {
    await createDnsRecord(
      uid,
      domain.id,
      {
        type: rec.type,
        host: rec.host,
        value: rec.value,
        ttl: rec.ttl,
        priority: rec.priority,
        weight: rec.weight,
        port: rec.port,
        caaFlags: rec.caaFlags,
        caaTag: rec.caaTag,
        dsKeyTag: rec.dsKeyTag,
        dsAlgorithm: rec.dsAlgorithm,
        dsDigestType: rec.dsDigestType,
        sshfpAlgorithm: rec.sshfpAlgorithm,
        sshfpFingerprintType: rec.sshfpFingerprintType,
        tlsaUsage: rec.tlsaUsage,
        tlsaSelector: rec.tlsaSelector,
        tlsaMatchingType: rec.tlsaMatchingType,
        tags: rec.tags,
        notes: rec.notes ? `${rec.notes} (Bản sao)` : 'Bản sao',
      },
      { isDuplicate: true }
    );
    onNotify(`Đã nhân bản bản ghi ${rec.type} (${rec.host}).`);
  };

  const handleDeleteRecord = async (rec: DnsRecord) => {
    await deleteDnsRecord(uid, domain.id, rec.id, rec);
    onNotify(`Đã xóa bản ghi ${rec.type} (${rec.host}).`);
  };

  const handleParseImport = (text: string, format: 'bind' | 'csv') => {
    setImportText(text);
    if (!text.trim()) {
      setParsedRows([]);
      return;
    }
    const rows =
      format === 'bind'
        ? parseBindZoneFile(text, domain.name, profile?.defaultTtl || 3600)
        : parseCsvRecords(text, profile?.defaultTtl || 3600);
    setParsedRows(rows);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const detectedFormat = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'bind';
    setImportFormat(detectedFormat);
    handleParseImport(text, detectedFormat);
  };

  const handleConfirmImport = async () => {
    const validInputs = parsedRows.filter((r) => r.valid && r.record).map((r) => r.record!);
    if (validInputs.length === 0) return;
    setImporting(true);
    try {
      const count = await bulkImportDnsRecords(
        uid,
        domain.id,
        validInputs,
        importFormat.toUpperCase()
      );
      setImportText('');
      setParsedRows([]);
      onNotify(`Đã nhập thành công ${count} bản ghi DNS vào vùng ${domain.name}.`);
      setActiveTab('records');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadZone = () => {
    const blob = new Blob([zonePreview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain.name}.zone`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const header = 'type,host,value,ttl,priority,weight,port';
    const lines = activeRecords.map((r) =>
      [r.type, r.host, `"${r.value.replace(/"/g, '""')}"`, r.ttl, r.priority ?? '', r.weight ?? '', r.port ?? ''].join(
        ','
      )
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain.name}-records.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyZone = async () => {
    await navigator.clipboard.writeText(zonePreview);
    setCopiedZone(true);
    setTimeout(() => setCopiedZone(false), 2000);
  };

  const runHealthCheck = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch('/api/dns/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.name,
          records: activeRecords.map((r) => ({
            id: r.id,
            type: r.type,
            host: r.host,
            value: r.value,
            ttl: r.ttl,
            priority: r.priority,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể kiểm tra sức khỏe DNS.');
      }
      const report = data as DnsHealthReport;
      setHealthReport(report);
      const nextDomainStatus =
        report.overallStatus === 'healthy'
          ? 'active'
          : report.overallStatus === 'warning'
            ? 'warning'
            : 'warning';
      await updateDomainHealthSummary(domain.id, report.overallStatus, report.summary, nextDomainStatus);
      onNotify(`Đã hoàn tất kiểm tra sức khỏe DNS cho ${domain.name}.`);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ kiểm tra DNS.');
    } finally {
      setHealthLoading(false);
    }
  };

  const runDanglingScan = async () => {
    setDanglingLoading(true);
    setDanglingError(null);
    try {
      const res = await fetch('/api/dns/dangling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.name,
          records: activeRecords.map((r) => ({
            id: r.id,
            type: r.type,
            host: r.host,
            value: r.value,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể quét bản ghi lơ lửng.');
      }
      setDanglingReport(data as DanglingScanReport);
      onNotify(`Đã quét xong bản ghi lơ lửng trên ${domain.name}.`);
    } catch (err) {
      setDanglingError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ quét DNS.');
    } finally {
      setDanglingLoading(false);
    }
  };

  const handleAddForward = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHost = fwdSourceHost.trim();
    const cleanUrl = fwdTargetUrl.trim();
    if (!cleanHost || cleanHost.length > BLUEPRINT_LIMITS.RECORD_HOST_MAX) {
      setFwdError('Tên miền nguồn không hợp lệ.');
      return;
    }
    if (!BLUEPRINT_LIMITS.FORWARD_URL_REGEX.test(cleanUrl) || cleanUrl.length > BLUEPRINT_LIMITS.FORWARD_URL_MAX) {
      setFwdError('Đích chuyển tiếp phải bắt đầu bằng http:// hoặc https://');
      return;
    }

    setFwdSaving(true);
    setFwdError(null);
    try {
      await createWebForward(uid, domain.id, {
        sourceHost: cleanHost,
        targetUrl: cleanUrl,
        redirectType: fwdType,
        preservePath: fwdPreservePath,
        enabled: true,
      });
      setFwdSourceHost('@');
      setFwdTargetUrl('https://');
      onNotify('Đã thêm quy tắc chuyển tiếp Web.');
    } catch (err) {
      setFwdError(err instanceof Error ? err.message : 'Không thể tạo quy tắc chuyển tiếp.');
    } finally {
      setFwdSaving(false);
    }
  };

  const handleGenerateVerifyToken = async () => {
    setVerifyInitLoading(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      await initDomainVerification(uid, domain.id, domain.name);
      onNotify(`Đã tạo mã TXT xác thực sở hữu cho ${domain.name}.`);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Không thể tạo mã xác thực tên miền.');
    } finally {
      setVerifyInitLoading(false);
    }
  };

  const handleAddVerificationTxtRecord = async () => {
    if (!domain.verificationToken) return;
    const token = domain.verificationToken;
    const alreadyExists = activeRecords.some(
      (r) => r.type === 'TXT' && r.host === '_dns-verify' && r.value.includes(token)
    );
    if (alreadyExists) {
      onNotify('Bản ghi TXT _dns-verify đã tồn tại trong vùng DNS này.');
      return;
    }
    setAddingVerifyTxt(true);
    setVerifyError(null);
    try {
      await createDnsRecord(uid, domain.id, {
        type: 'TXT',
        host: '_dns-verify',
        value: token,
        ttl: 300,
        tags: ['xac-thuc'],
        notes: 'Mã TXT xác thực sở hữu tên miền',
      });
      onNotify(`Đã thêm bản ghi TXT _dns-verify.${domain.name} vào cấu hình.`);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Không thể thêm bản ghi TXT xác thực.');
    } finally {
      setAddingVerifyTxt(false);
    }
  };

  const handleCheckLiveTxtVerification = async () => {
    if (!domain.verificationToken) return;
    setVerifyChecking(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/dns/verify-txt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.name,
          token: domain.verificationToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể kiểm tra bản ghi TXT thực tế.');
      }
      const report = data as DomainVerificationResult;
      setVerifyResult(report);
      if (report.verified) {
        await markDomainVerified(uid, domain.id, domain.name, report.matchedHost || domain.name);
        onNotify(`Xác thực thành công tên miền ${domain.name}.`);
      } else {
        onNotify('Chưa tìm thấy mã TXT xác thực trên máy chủ DNS công cộng.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ kiểm tra TXT.');
    } finally {
      setVerifyChecking(false);
    }
  };

  const handleProvisionPages = async () => {
    if (pagesPreset.error || pagesPreset.records.length === 0) {
      setPagesError(pagesPreset.error || 'Chưa có bản ghi hợp lệ để phát hành.');
      return;
    }
    setPagesSaving(true);
    setPagesError(null);
    try {
      const result = await provisionPagesRecords(
        uid,
        domain.id,
        domain.name,
        pagesProvider,
        pagesPreset.normalizedTarget || pagesTarget || domain.name,
        pagesPreset.records,
        activeRecords
      );
      if (result.createdCount > 0) {
        onNotify(
          `Đã phát hành ${result.createdCount} bản ghi ${getPagesProviderLabel(pagesProvider)}${
            result.skippedCount > 0 ? ` (bỏ qua ${result.skippedCount} bản ghi đã có)` : ''
          }.`
        );
      } else {
        onNotify(
          `Đã lưu cấu hình ${getPagesProviderLabel(pagesProvider)}; tất cả ${result.skippedCount} bản ghi chuẩn đã tồn tại.`
        );
      }
    } catch (err) {
      setPagesError(err instanceof Error ? err.message : 'Không thể phát hành bộ bản ghi Pages.');
    } finally {
      setPagesSaving(false);
    }
  };

  const domainStatus = getDomainStatusLabel(domain.status);
  const healthStatus = getHealthStatusLabel(domain.lastHealthStatus);
  const verificationStatus = getVerificationStatusLabel(domain.verificationStatus);

  return (
    <div className="space-y-6">
      {/* Thanh thông tin vùng tên miền */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col @md:flex-row @md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 min-h-[36px] @md:min-h-0 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Quay lại
              </button>
              <span className="text-slate-300 shrink-0">/</span>
              <h2 className="text-lg @md:text-xl font-bold text-slate-900 font-mono truncate">{domain.name}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className={`font-medium ${domainStatus.colorClass}`}>{domainStatus.text}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-medium ${healthStatus.colorClass}`}>Sức khỏe: {healthStatus.text}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-medium ${verificationStatus.colorClass}`}>
                Xác thực: {verificationStatus.text}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{recordStats.displayTotal} bản ghi</span>
              {domain.tags.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Thẻ: {domain.tags.join(', ')}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingRecord(null);
                setRecordModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 w-full @md:w-auto px-4 min-h-[44px] @md:min-h-0 @md:py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm bản ghi
            </button>
          </div>
        </div>

        {/* Các thẻ chuyển khu vực chức năng */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-full overflow-x-auto">
          {(
            [
              { id: 'records', label: `Bản ghi DNS (${recordStats.displayTotal})` },
              { id: 'bulk', label: 'Nhập / Xuất tệp vùng' },
              { id: 'health', label: 'Sức khỏe & Bản ghi lơ lửng' },
              { id: 'forwards', label: `Chuyển tiếp Web (${forwards.length})` },
              { id: 'pages', label: 'Xác thực & Pages Web' },
              { id: 'audit', label: `Lịch sử thay đổi (${auditLogs.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 min-h-[40px] @2xl:min-h-0 @2xl:py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bảng tổng hợp thông số bản ghi (Dashboard Widget) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Bảng tóm tắt thông số tên miền
            </h3>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {recordStats.displayTotal} bản ghi · TTL TB {recordStats.avgTtl}s · {recordStats.taggedCount} bản ghi gắn thẻ · {recordStats.domainTagCount} thẻ tên miền
            </span>
          </div>
          <button
            type="button"
            onClick={() => setWidgetCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
          >
            {widgetCollapsed ? (
              <>
                Mở rộng
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Thu gọn
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {!widgetCollapsed && (
          <>
            {/* 3 chỉ số tổng hợp nhanh */}
            <div className="grid grid-cols-1 @lg:grid-cols-3 divide-y @lg:divide-y-0 @lg:divide-x divide-slate-200">
              <div className="px-5 py-4 space-y-1">
                <p className="text-xs font-medium text-slate-500">TTL trung bình</p>
                <p className="text-xl font-bold text-slate-900 font-mono tabular-nums">
                  {recordsLoading && recordStats.total === 0 && domain.recordCount > 0
                    ? 'Đang tính...'
                    : `${recordStats.avgTtl} giây`}
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {recordStats.total > 0
                    ? `Thấp nhất ${recordStats.minTtl}s · Cao nhất ${recordStats.maxTtl}s`
                    : 'Chưa có dữ liệu TTL'}
                </p>
              </div>

              <div className="px-5 py-4 space-y-1">
                <p className="text-xs font-medium text-slate-500">Tổng số lượng bản ghi</p>
                <p className="text-xl font-bold text-slate-900 font-mono tabular-nums">
                  {recordStats.displayTotal} bản ghi
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {recordStats.total > 0
                    ? `Phân bổ trên ${recordStats.byType.length} loại bản ghi`
                    : `Theo hồ sơ tên miền ${domain.name}`}
                </p>
              </div>

              <div className="px-5 py-4 space-y-1">
                <p className="text-xs font-medium text-slate-500">Thống kê gắn thẻ (Tags)</p>
                <p className="text-xl font-bold text-slate-900 font-mono tabular-nums">
                  {recordStats.taggedCount} / {recordStats.displayTotal} bản ghi
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {recordStats.byTag.length} thẻ bản ghi · {domain.tags.length} thẻ tên miền
                </p>
              </div>
            </div>

            {recordStats.total === 0 ? (
              <div className="px-5 py-4 border-t border-slate-200 text-xs text-slate-500">
                Chưa có bản ghi nào trong vùng {domain.name}. Hãy thêm bản ghi mới hoặc nhập tệp BIND/CSV để xem thống kê chi tiết.
              </div>
            ) : (
              <div className="border-t border-slate-200 grid grid-cols-1 @3xl:grid-cols-2 divide-y @3xl:divide-y-0 @3xl:divide-x divide-slate-200">
                {/* Bảng trái: Số lượng bản ghi chia theo loại */}
                <div className="overflow-x-auto">
                  <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Số lượng bản ghi theo loại</span>
                    {typeFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTypeFilter('all');
                          setPage(1);
                        }}
                        className="text-blue-700 font-medium hover:underline"
                      >
                        Bỏ lọc ({typeFilter})
                      </button>
                    )}
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="py-2 px-5">Loại</th>
                        <th className="py-2 px-4 text-right">Số lượng</th>
                        <th className="py-2 px-4 text-right">Tỷ lệ</th>
                        <th className="py-2 px-5 text-right">TTL trung bình</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {recordStats.byType.map((row) => (
                        <tr key={row.type} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('records');
                                setTypeFilter(typeFilter === row.type ? 'all' : row.type);
                                setGroupFilter('all');
                                setPage(1);
                              }}
                              className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-xs font-semibold transition-all whitespace-nowrap ${getRecordTypeBadgeClass(
                                row.type
                              )} ${
                                typeFilter === row.type
                                  ? 'ring-2 ring-blue-600 ring-offset-1'
                                  : 'hover:opacity-85'
                              }`}
                            >
                              {row.type}
                            </button>
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-900 font-medium">
                            {row.count}
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-500">
                            {row.percent}%
                          </td>
                          <td className="py-2 px-5 text-right font-mono tabular-nums text-slate-700">
                            {row.avgTtl}s
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bảng phải: Phân loại bản ghi & thẻ tên miền */}
                <div className="overflow-x-auto">
                  <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Thống kê bản ghi gắn thẻ</span>
                    {tagFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTagFilter('all');
                          setPage(1);
                        }}
                        className="text-blue-700 font-medium hover:underline"
                      >
                        Bỏ lọc ({tagFilter})
                      </button>
                    )}
                  </div>
                  {domain.tags.length > 0 && (
                    <div className="px-5 py-2 border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-slate-700">Thẻ tên miền ({domain.tags.length}):</span>
                      <span className="font-mono text-slate-800">{domain.tags.join(' · ')}</span>
                    </div>
                  )}
                  {recordStats.byTag.length === 0 ? (
                    <div className="px-5 py-6 text-xs text-slate-500">
                      Chưa có bản ghi nào được gắn thẻ phân loại ({recordStats.untaggedCount} bản ghi chưa gắn thẻ).
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-medium">
                          <th className="py-2 px-5">Thẻ phân loại</th>
                          <th className="py-2 px-4 text-right">Số bản ghi</th>
                          <th className="py-2 px-5">Loại & Bản ghi thuộc thẻ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {recordStats.byTag.map((item) => (
                          <tr key={item.tag} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2 px-5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('records');
                                  setTagFilter(tagFilter === item.tag ? 'all' : item.tag);
                                  setPage(1);
                                }}
                                className={`font-medium hover:underline ${
                                  tagFilter === item.tag ? 'text-blue-700 underline' : 'text-slate-900'
                                }`}
                              >
                                {item.tag}
                              </button>
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-900 font-medium">
                              {item.count}
                            </td>
                            <td className="py-2 px-5 text-slate-600">
                              <span className="font-mono text-slate-800">
                                {item.hosts.slice(0, 4).join(' · ')}
                              </span>
                              {item.hosts.length > 4 && (
                                <span className="text-slate-400 font-mono tabular-nums">
                                  {' '}
                                  +{item.hosts.length - 4} khác
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {recordStats.untaggedCount > 0 && (
                          <tr className="bg-slate-50/60 text-slate-500">
                            <td className="py-2 px-5">Chưa gắn thẻ</td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums">
                              {recordStats.untaggedCount}
                            </td>
                            <td className="py-2 px-5">Bản ghi chưa phân nhóm thẻ</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Xem trước các thay đổi gần nhất (Audit Log Preview) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Thay đổi gần nhất</h3>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {auditLogs.length} sự kiện
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
          >
            Xem tất cả lịch sử
          </button>
        </div>

        {auditLoading && auditLogs.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">Đang tải lịch sử thay đổi từ Firestore...</div>
        ) : auditLogs.length === 0 ? (
          <div className="px-5 py-4 text-xs text-slate-500">
            Chưa ghi nhận thay đổi nào trên tên miền {domain.name}. Mọi thao tác bản ghi, chuyển tiếp và xác thực sẽ được tự động lưu tại đây.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {auditLogs.slice(0, 4).map((log) => {
              const badge = getAuditActionLabel(log.action);
              return (
                <div
                  key={log.id}
                  className="px-5 py-2.5 flex flex-col @lg:flex-row @lg:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded border font-medium whitespace-nowrap ${badge.badgeClass}`}
                    >
                      {badge.text}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 truncate">
                      {log.targetLabel}
                    </span>
                    <span className="text-slate-600 truncate">{log.summary}</span>
                  </div>
                  <div className="text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
                    {formatTimestampVi(log.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tab 1: Quản lý bản ghi DNS */}
      {activeTab === 'records' && (
        <div className="space-y-4">

          {/* Thanh tìm kiếm nâng cao & bộ lọc bản ghi */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-col @2xl:flex-row items-stretch @2xl:items-center gap-2.5">
              <select
                value={searchField}
                onChange={(e) => {
                  setSearchField(e.target.value as RecordSearchField);
                  setPage(1);
                }}
                aria-label="Chọn trường tìm kiếm bản ghi"
                className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-md bg-slate-50 text-slate-800 @2xl:w-44"
              >
                <option value="all">Tìm theo: Tất cả trường</option>
                <option value="host">Tên bản ghi (Host)</option>
                <option value="type">Loại bản ghi (A, TXT...)</option>
                <option value="value">Giá trị phân giải (Value)</option>
              </select>

              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={
                    searchField === 'host'
                      ? 'Nhập host cần lọc (ví dụ: @, www, _dmarc)...'
                      : searchField === 'type'
                        ? 'Nhập loại bản ghi (ví dụ: A, CNAME, TXT, MX)...'
                        : searchField === 'value'
                          ? 'Nhập địa chỉ IP hoặc tên miền đích...'
                          : 'Tìm nhanh theo host, loại bản ghi, giá trị hoặc ghi chú...'
                  }
                  className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                    aria-label="Xóa từ khóa tìm kiếm"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setExactMatch((prev) => !prev);
                  setPage(1);
                }}
                aria-pressed={exactMatch}
                className={`px-3.5 min-h-[42px] @2xl:min-h-0 @2xl:py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  exactMatch
                    ? 'bg-blue-50 border-blue-600 text-blue-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {exactMatch ? 'Khớp chính xác: Bật' : 'Khớp chính xác'}
              </button>
            </div>

            <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                  {(
                    [
                      { id: 'all', label: 'Tất cả' },
                      { id: 'common', label: 'Phổ biến' },
                      { id: 'advanced', label: 'Nâng cao' },
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setGroupFilter(g.id);
                        setTypeFilter('all');
                        setPage(1);
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap ${
                        groupFilter === g.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value as 'all' | RecordType);
                    setPage(1);
                  }}
                  aria-label="Lọc theo loại bản ghi"
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white"
                >
                  <option value="all">Mọi loại bản ghi (19)</option>
                  {ALL_RECORD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {allRecordTags.length > 0 && (
                  <select
                    value={tagFilter}
                    onChange={(e) => {
                      setTagFilter(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Lọc theo thẻ bản ghi"
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white"
                  >
                    <option value="all">Mọi thẻ</option>
                    {allRecordTags.map((t) => (
                      <option key={t} value={t}>
                        Thẻ: {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-between @2xl:justify-end gap-3 text-xs">
                <span className="text-slate-500 font-mono tabular-nums">
                  Hiển thị {filteredRecords.length} / {activeRecords.length} bản ghi
                </span>
                {hasActiveRecordFilters && (
                  <button
                    type="button"
                    onClick={resetRecordFilters}
                    className="font-medium text-blue-700 hover:underline whitespace-nowrap"
                  >
                    Đặt lại bộ lọc
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {recordsLoading && activeRecords.length === 0 ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  {activeRecords.length === 0 ? 'Vùng DNS chưa có bản ghi nào' : 'Không có bản ghi khớp bộ lọc'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {activeRecords.length === 0
                    ? 'Thêm bản ghi thủ công hoặc chuyển sang mục Nhập / Xuất tệp vùng để nhập nhanh từ tệp BIND hoặc CSV.'
                    : 'Thử xóa từ khóa tìm kiếm hoặc chọn lại loại bản ghi.'}
                </p>
                {activeRecords.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecord(null);
                      setRecordModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm bản ghi đầu tiên
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                        <th className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSort('type')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            Loại
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSort('host')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            Tên bản ghi (Host)
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2.5 px-4">Giá trị phân giải</th>
                        <th className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleSort('ttl')}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            TTL (giây)
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2.5 px-4">Thẻ & Ghi chú</th>
                        <th className="py-2.5 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {pagedRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-xs font-semibold whitespace-nowrap ${getRecordTypeBadgeClass(
                                rec.type
                              )}`}
                            >
                              {rec.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-900 whitespace-nowrap">
                            {rec.host}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-700 max-w-md break-all">
                            {formatRecordValueDisplay(rec)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                            {rec.ttl}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-500 max-w-xs truncate">
                            {rec.tags.length > 0 ? rec.tags.join(' · ') : ''}
                            {rec.tags.length > 0 && rec.notes ? ' — ' : ''}
                            {rec.notes || (!rec.tags.length ? '—' : '')}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRecord(rec);
                                  setRecordModalOpen(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                                title="Chỉnh sửa"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateRecord(rec)}
                                className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                                title="Nhân bản"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(rec)}
                                className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded"
                                title="Xóa bản ghi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                    <span className="font-mono tabular-nums">
                      Trang {safePage} / {totalPages} ({filteredRecords.length} bản ghi)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Nhập / Xuất tệp vùng BIND & CSV */}
      {activeTab === 'bulk' && (
        <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-6 items-start">
          {/* Nhập khẩu hàng loạt */}
          <div className="@3xl:col-span-7 bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Nhập khẩu bản ghi hàng loạt</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hỗ trợ tệp vùng chuẩn BIND hoặc bảng CSV (cột: Loại, Host, Giá trị, TTL).
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => {
                    setImportFormat('bind');
                    handleParseImport(importText, 'bind');
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    importFormat === 'bind' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Định dạng BIND
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportFormat('csv');
                    handleParseImport(importText, 'csv');
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    importFormat === 'csv' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Định dạng CSV
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Chọn tệp (.zone, .txt, .csv)
                <input type="file" accept=".zone,.txt,.csv" onChange={handleFileUpload} className="hidden" />
              </label>
              <button
                type="button"
                onClick={() => {
                  const sample =
                    importFormat === 'bind'
                      ? `@ 3600 IN A 203.0.113.10\nwww 3600 IN CNAME ${domain.name}.\n@ 3600 IN MX 10 mail.${domain.name}.\n@ 3600 IN TXT "v=spf1 mx -all"`
                      : `type,host,value,ttl,priority\nA,@,203.0.113.10,3600,\nCNAME,www,${domain.name},3600,\nMX,@,mail.${domain.name},3600,10`;
                  handleParseImport(sample, importFormat);
                }}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Điền dữ liệu mẫu
              </button>
            </div>

            <textarea
              rows={7}
              value={importText}
              onChange={(e) => handleParseImport(e.target.value, importFormat)}
              placeholder={
                importFormat === 'bind'
                  ? `@ 3600 IN A 203.0.113.10\nwww 3600 IN CNAME ${domain.name}.`
                  : `A,@,203.0.113.10,3600`
              }
              className="w-full px-3 py-2.5 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            {parsedRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    Phân tích <strong className="font-mono">{parsedRows.length}</strong> dòng:{' '}
                    <span className="text-emerald-700 font-medium">
                      {parsedRows.filter((r) => r.valid).length} hợp lệ
                    </span>{' '}
                    ·{' '}
                    <span className="text-red-700 font-medium">
                      {parsedRows.filter((r) => !r.valid).length} lỗi
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={importing || parsedRows.every((r) => !r.valid)}
                    onClick={handleConfirmImport}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    {importing
                      ? 'Đang nhập...'
                      : `Xác nhận nhập ${parsedRows.filter((r) => r.valid).length} bản ghi`}
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-200 text-xs">
                  {parsedRows.map((row) => (
                    <div key={row.lineNumber} className="px-3 py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-slate-800 truncate">
                          Dòng {row.lineNumber}: {row.raw}
                        </div>
                        {row.error && <div className="text-red-700 mt-0.5">{row.error}</div>}
                      </div>
                      <span
                        className={`shrink-0 font-medium ${
                          row.valid ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {row.valid ? 'Hợp lệ' : 'Lỗi'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Xuất tệp vùng BIND / CSV */}
          <div className="@3xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">Xuất tệp vùng DNS</h3>
              <p className="text-xs text-slate-500">
                Xuất toàn bộ cấu hình hiện tại ra tệp .zone chuẩn BIND để nạp vào PowerDNS, BIND9 hoặc Cloudflare.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadZone}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md"
              >
                <Download className="w-3.5 h-3.5" />
                Tải tệp .zone (BIND)
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                <Download className="w-3.5 h-3.5" />
                Tải tệp .csv
              </button>
              <button
                type="button"
                onClick={handleCopyZone}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                {copiedZone ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedZone ? 'Đã sao chép' : 'Sao chép BIND'}
              </button>
            </div>

            <pre className="p-3 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto max-h-80 leading-relaxed">
              {zonePreview}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 3: Kiểm tra sức khỏe DNS & Bản ghi lơ lửng */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6 items-start">
            {/* Kiểm tra sức khỏe DNS thực tế */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">
                    Kiểm tra tình trạng DNS thực tế
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Truy vấn trực tiếp máy chủ phân giải công cộng để xác minh NS ủy quyền, bản ghi SOA và đối chiếu từng bản ghi đã khai báo.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={healthLoading}
                  onClick={runHealthCheck}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
                >
                  <Activity className="w-3.5 h-3.5" />
                  {healthLoading ? 'Đang kiểm tra...' : 'Chạy kiểm tra'}
                </button>
              </div>

              {healthError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {healthError}
                </div>
              )}

              {healthReport ? (
                <div className="space-y-4 pt-2 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        healthReport.overallStatus === 'healthy'
                          ? 'text-emerald-700'
                          : healthReport.overallStatus === 'warning'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {healthReport.summary}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      Độ trễ: {healthReport.latencyMs} ms
                    </span>
                  </div>

                  <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                      <p className="font-semibold text-slate-800">Máy chủ tên miền (NS)</p>
                      {healthReport.nameservers.length === 0 ? (
                        <p className="text-red-700">Chưa phát hiện bản ghi NS ủy quyền.</p>
                      ) : (
                        <ul className="space-y-0.5 font-mono text-slate-700">
                          {healthReport.nameservers.map((ns) => (
                            <li key={ns}>{ns}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                      <p className="font-semibold text-slate-800">Thông số SOA</p>
                      {healthReport.soa ? (
                        <div className="space-y-0.5 font-mono text-slate-700 tabular-nums">
                          <div>NS chính: {healthReport.soa.nsname}</div>
                          <div>Số sê-ri: {healthReport.soa.serial}</div>
                          <div>
                            Làm mới/Thử lại: {healthReport.soa.refresh}s / {healthReport.soa.retry}s
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-500">Không truy vấn được bản ghi SOA.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-200 text-xs text-slate-500">
                  Kết quả gần nhất ({formatTimestampVi(domain.lastHealthCheckAt)}): {domain.lastHealthSummary}
                </div>
              )}
            </div>

            {/* Quét bản ghi lơ lửng */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">
                    Phát hiện bản ghi lơ lửng (Dangling DNS)
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Kiểm tra các bản ghi CNAME, ALIAS, MX, NS, A/AAAA để phát hiện đích trỏ tới NXDOMAIN hoặc dịch vụ đám mây chưa cấp phát.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={danglingLoading || activeRecords.length === 0}
                  onClick={runDanglingScan}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {danglingLoading ? 'Đang quét...' : 'Quét bản ghi lơ lửng'}
                </button>
              </div>

              {danglingError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {danglingError}
                </div>
              )}

              {danglingReport ? (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="text-xs text-slate-600 font-mono tabular-nums">
                    Đã quét {danglingReport.totalScanned} bản ghi ·{' '}
                    <span className="text-red-700 font-semibold">
                      {danglingReport.highRiskCount} nguy cơ cao
                    </span>{' '}
                    ·{' '}
                    <span className="text-amber-700 font-semibold">
                      {danglingReport.danglingCount} lơ lửng / cảnh báo
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-md">
                    {danglingReport.findings.map((f) => (
                      <div key={f.id} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-medium text-slate-900">
                            {f.type} · {f.fqdn} → {f.target}
                          </span>
                          <span
                            className={`font-semibold shrink-0 ${
                              f.risk === 'safe'
                                ? 'text-emerald-700'
                                : f.risk === 'high_risk'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {f.risk === 'safe'
                              ? 'An toàn'
                              : f.risk === 'high_risk'
                                ? 'Nguy cơ cao'
                                : f.risk === 'dangling'
                                  ? 'Bản ghi lơ lửng'
                                  : 'Cảnh báo'}
                          </span>
                        </div>
                        <p className="text-slate-600">{f.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="pt-2 border-t border-slate-200 text-xs text-slate-500">
                  Bấm nút quét để kiểm tra tính toàn vẹn của các bản ghi trỏ tên miền ngoài và địa chỉ IP.
                </p>
              )}
            </div>
          </div>

          {/* Bảng đối chiếu từng bản ghi từ báo cáo sức khỏe */}
          {healthReport && healthReport.recordChecks.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h4 className="text-sm font-semibold text-slate-900">
                  Kết quả đối chiếu từng bản ghi với DNS thực tế
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                      <th className="py-2.5 px-4">Loại</th>
                      <th className="py-2.5 px-4">Tên miền đầy đủ</th>
                      <th className="py-2.5 px-4">Giá trị khai báo</th>
                      <th className="py-2.5 px-4">Phản hồi thực tế</th>
                      <th className="py-2.5 px-4">Kết luận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {healthReport.recordChecks.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-xs font-semibold whitespace-nowrap ${getRecordTypeBadgeClass(
                              item.type
                            )}`}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-900">{item.fqdn}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-700 max-w-xs break-all">
                          {item.configuredValue}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 max-w-xs break-all">
                          {item.liveValues.length > 0 ? item.liveValues.join(', ') : 'Không có dữ liệu'}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              item.status === 'matched'
                                ? 'text-emerald-700'
                                : item.status === 'mismatch'
                                  ? 'text-amber-700'
                                  : item.status === 'missing'
                                    ? 'text-red-700'
                                    : 'text-slate-500'
                            }`}
                          >
                            {item.status === 'matched' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            )}
                            {item.status === 'matched'
                              ? 'Khớp'
                              : item.status === 'mismatch'
                                ? 'Lệch giá trị'
                                : item.status === 'missing'
                                  ? 'Chưa phân giải'
                                  : 'Bỏ qua'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Chuyển tiếp Web */}
      {activeTab === 'forwards' && (
        <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-6 items-start">
          <div className="@3xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Thêm quy tắc chuyển tiếp Web</h3>
            <form onSubmit={handleAddForward} className="space-y-4">
              {fwdError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {fwdError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Tên miền nguồn</label>
                <div className="flex items-center border border-slate-300 rounded-md overflow-hidden">
                  <input
                    type="text"
                    required
                    value={fwdSourceHost}
                    onChange={(e) => setFwdSourceHost(e.target.value)}
                    placeholder="@ hoặc go"
                    className="flex-1 px-3 py-2 text-sm font-mono focus:outline-none"
                  />
                  <span className="px-3 py-2 bg-slate-50 border-l border-slate-200 text-xs font-mono text-slate-500">
                    .{domain.name}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">URL đích chuyển hướng</label>
                <input
                  type="url"
                  required
                  value={fwdTargetUrl}
                  onChange={(e) => setFwdTargetUrl(e.target.value)}
                  placeholder="https://trangdich.vn"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Mã chuyển hướng HTTP</label>
                <select
                  value={fwdType}
                  onChange={(e) => setFwdType(e.target.value as RedirectType)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="301">HTTP 301 - Chuyển hướng vĩnh viễn</option>
                  <option value="302">HTTP 302 - Chuyển hướng tạm thời</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fwdPreservePath}
                  onChange={(e) => setFwdPreservePath(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                Giữ nguyên đường dẫn và tham số truy vấn ($request_uri)
              </label>

              <button
                type="submit"
                disabled={fwdSaving}
                className="w-full px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
              >
                {fwdSaving ? 'Đang lưu...' : 'Lưu quy tắc chuyển tiếp'}
              </button>
            </form>
          </div>

          <div className="@3xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Danh sách quy tắc đang cấu hình</h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">{forwards.length} quy tắc</span>
            </div>

            {forwards.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Chưa có quy tắc chuyển tiếp web nào cho {domain.name}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {forwards.map((f) => {
                  const fullSrc = f.sourceHost === '@' ? domain.name : `${f.sourceHost}.${domain.name}`;
                  return (
                    <div key={f.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-mono font-medium text-slate-900 truncate">
                            <span>{fullSrc}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-blue-700 truncate">{f.targetUrl}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            HTTP {f.redirectType} · {f.preservePath ? 'Giữ đường dẫn' : 'Chỉ trang gốc'} ·{' '}
                            <span className={f.enabled ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                              {f.enabled ? 'Đang bật' : 'Tạm tắt'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              updateWebForward(uid, domain.id, f.id, {
                                sourceHost: f.sourceHost,
                                targetUrl: f.targetUrl,
                                redirectType: f.redirectType,
                                preservePath: f.preservePath,
                                enabled: !f.enabled,
                              })
                            }
                            className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50"
                          >
                            {f.enabled ? 'Tạm tắt' : 'Bật lại'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWebForward(uid, domain.id, f.id, f)}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded"
                            title="Xóa quy tắc"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <pre className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-700 overflow-x-auto">
                        {`server { server_name ${fullSrc}; return ${f.redirectType} ${f.targetUrl}${f.preservePath ? '$request_uri' : ''}; }`}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Xác thực sở hữu tên miền & Phát hành bản ghi Pages Web */}
      {activeTab === 'pages' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-6 items-start">
          {/* Cột trái: Xác thực sở hữu tên miền qua TXT */}
          <div className="@3xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-700" />
                  <h3 className="text-base font-semibold text-slate-900">Xác thực sở hữu tên miền</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Tạo mã TXT duy nhất để chứng minh quyền sở hữu và đối chiếu trực tiếp qua máy chủ phân giải DNS công cộng.
                </p>
              </div>
              <span className={`text-xs font-semibold shrink-0 ${verificationStatus.colorClass}`}>
                {verificationStatus.text}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Trạng thái hiện tại:</span>
                <span className={`font-semibold ${verificationStatus.colorClass}`}>
                  {verificationStatus.text}
                </span>
              </div>
              {domain.verifiedAt && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Thời điểm xác thực:</span>
                  <span className="font-mono tabular-nums text-slate-800">
                    {formatTimestampVi(domain.verifiedAt)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Nền tảng Pages đang gắn:</span>
                <span className="font-medium text-slate-800">
                  {getPagesProviderLabel(domain.pagesProvider)}
                  {domain.pagesTarget ? ` (${domain.pagesTarget})` : ''}
                </span>
              </div>
            </div>

            {verifyError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {verifyError}
              </div>
            )}

            <button
              type="button"
              disabled={verifyInitLoading}
              onClick={handleGenerateVerifyToken}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] @md:min-h-0 @md:py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifyInitLoading ? 'animate-spin' : ''}`} />
              {domain.verificationToken ? 'Tạo lại mã TXT xác thực mới' : 'Tạo mã TXT xác thực'}
            </button>

            {domain.verificationToken && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="space-y-1.5 text-xs">
                  <p className="font-semibold text-slate-800">Hướng dẫn cấu hình bản ghi TXT:</p>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2 font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Loại / TTL:</span>
                      <span className="text-slate-900 font-semibold">TXT · 300s</span>
                    </div>
                    <div>
                      <div className="text-slate-500">Tên bản ghi (Host):</div>
                      <div className="text-slate-900 break-all">_dns-verify.{domain.name}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Giá trị mã xác thực:</div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-blue-700 font-semibold break-all">
                          {domain.verificationToken}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!domain.verificationToken) return;
                            await navigator.clipboard.writeText(domain.verificationToken);
                            setCopiedToken(true);
                            setTimeout(() => setCopiedToken(false), 2000);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-sans font-medium border border-slate-300 bg-white hover:bg-slate-100 rounded shrink-0"
                        >
                          {copiedToken ? (
                            <Check className="w-3 h-3 text-emerald-700" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedToken ? 'Đã chép' : 'Sao chép'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 @sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={addingVerifyTxt}
                    onClick={handleAddVerificationTxtRecord}
                    className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[42px] @md:min-h-0 @md:py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {addingVerifyTxt ? 'Đang thêm...' : 'Thêm TXT vào vùng này'}
                  </button>

                  <button
                    type="button"
                    disabled={verifyChecking}
                    onClick={handleCheckLiveTxtVerification}
                    className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[42px] @md:min-h-0 @md:py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {verifyChecking ? 'Đang đối chiếu...' : 'Kiểm tra xác thực thực tế'}
                  </button>
                </div>

                {verifyResult && (
                  <div
                    className={`p-3 rounded-md border text-xs space-y-1.5 ${
                      verifyResult.verified
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>
                        {verifyResult.verified
                          ? `Đã xác thực tại ${verifyResult.matchedHost}`
                          : 'Chưa phát hiện mã xác thực trên DNS công cộng'}
                      </span>
                      <span className="font-mono tabular-nums">{verifyResult.latencyMs} ms</span>
                    </div>
                    <div className="text-[11px] opacity-90">
                      Đã truy vấn: {verifyResult.checkedHosts.join(', ')}
                    </div>
                    {!verifyResult.verified && (
                      <div className="text-[11px] opacity-90">
                        {verifyResult.foundTxtValues.length > 0
                          ? `TXT tìm thấy: ${verifyResult.foundTxtValues.join(' | ')}`
                          : 'Chưa có bản ghi TXT nào phản hồi từ 1.1.1.1 / 8.8.8.8. Hãy thêm TXT vào nhà cung cấp DNS ủy quyền và thử lại sau vài phút.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cột phải: Phát hành bộ bản ghi chuẩn cho các nền tảng Pages Web */}
          <div className="@3xl:col-span-7 bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  Phát hành bộ bản ghi Pages Web chuẩn
                </h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tự động sinh và lưu bộ bản ghi chuẩn cho GitHub Pages, Cloudflare Pages, Vercel hoặc Firebase Hosting, tự động bỏ qua bản ghi đã tồn tại.
              </p>
            </div>

            {/* Chọn nền tảng */}
            <div className="grid grid-cols-2 @sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'github', label: 'GitHub Pages' },
                  { id: 'cloudflare', label: 'Cloudflare Pages' },
                  { id: 'vercel', label: 'Vercel' },
                  { id: 'firebase', label: 'Firebase Hosting' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPagesProvider(item.id);
                    setPagesError(null);
                  }}
                  className={`px-3 min-h-[44px] @md:min-h-0 @md:py-2.5 text-xs font-medium rounded-md border transition-colors text-center ${
                    pagesProvider === item.id
                      ? 'bg-blue-50 border-blue-600 text-blue-800 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {pagesError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {pagesError}
              </div>
            )}

            <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  {pagesProvider === 'github'
                    ? 'Tài khoản / Đích GitHub Pages'
                    : pagesProvider === 'cloudflare'
                      ? 'Tên dự án / Đích Cloudflare Pages'
                      : pagesProvider === 'vercel'
                        ? 'Đích tham chiếu dự án Vercel (tùy chọn)'
                        : 'Firebase Hosting Site ID'}
                </label>
                <input
                  type="text"
                  value={pagesTarget}
                  onChange={(e) => setPagesTarget(e.target.value)}
                  placeholder={
                    pagesProvider === 'github'
                      ? 'tenban.github.io'
                      : pagesProvider === 'cloudflare'
                        ? 'du-an.pages.dev'
                        : pagesProvider === 'vercel'
                          ? 'du-an.vercel.app'
                          : 'my-site hoặc my-site.web.app'
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  {pagesProvider === 'vercel'
                    ? 'Mã TXT xác thực _vercel (tùy chọn)'
                    : pagesProvider === 'firebase'
                      ? 'Giá trị TXT tùy chỉnh (mặc định hosting-site)'
                      : 'Mã TXT xác thực bổ sung (tùy chọn)'}
                </label>
                <input
                  type="text"
                  value={pagesExtraTxt}
                  onChange={(e) => setPagesExtraTxt(e.target.value)}
                  disabled={pagesProvider === 'cloudflare'}
                  placeholder={
                    pagesProvider === 'vercel'
                      ? 'vc-domain-verify=...'
                      : pagesProvider === 'cloudflare'
                        ? 'Cloudflare tự xác thực qua CNAME/ALIAS'
                        : 'Chuỗi xác thực từ nhà cung cấp'
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pagesIncludeWww}
                  onChange={(e) => setPagesIncludeWww(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                Bao gồm bản ghi cho tên miền phụ www
              </label>

              {pagesProvider === 'github' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pagesIncludeIpv6}
                    onChange={(e) => setPagesIncludeIpv6(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  Bao gồm 4 bản ghi IPv6 (AAAA) chuẩn GitHub
                </label>
              )}
            </div>

            {/* Bảng xem trước các bản ghi sẽ được phát hành */}
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Xem trước bộ bản ghi ({pagesPreset.records.length} bản ghi)
                </span>
                {pagesPreset.notes && (
                  <span className="text-slate-500 hidden @md:inline truncate max-w-sm">
                    {pagesPreset.notes}
                  </span>
                )}
              </div>

              {pagesPreset.error ? (
                <div className="p-4 text-xs text-amber-800 bg-amber-50">{pagesPreset.error}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="py-2 px-4">Loại</th>
                        <th className="py-2 px-4">Host</th>
                        <th className="py-2 px-4">Giá trị</th>
                        <th className="py-2 px-4 text-right">TTL</th>
                        <th className="py-2 px-4 text-right">Tình trạng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pagesPreset.records.map((rec, idx) => {
                        const key = `${rec.type}::${rec.host.trim().toLowerCase()}::${rec.value
                          .trim()
                          .toLowerCase()
                          .replace(/\.$/, '')}`;
                        const exists = existingRecordSet.has(key);
                        return (
                          <tr key={`${rec.type}-${rec.host}-${rec.value}-${idx}`}>
                            <td className="py-2 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-xs font-semibold ${getRecordTypeBadgeClass(
                                  rec.type
                                )}`}
                              >
                                {rec.type}
                              </span>
                            </td>
                            <td className="py-2 px-4 font-mono text-slate-900">{rec.host}</td>
                            <td className="py-2 px-4 font-mono text-slate-700 break-all">
                              {rec.value}
                            </td>
                            <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-500">
                              {rec.ttl}s
                            </td>
                            <td className="py-2 px-4 text-right whitespace-nowrap font-medium">
                              {exists ? (
                                <span className="text-slate-500">Đã có</span>
                              ) : (
                                <span className="text-emerald-700">Sẽ thêm mới</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-col @sm:flex-row @sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Các bản ghi mới sẽ được gắn thẻ <span className="font-mono">pages</span> và lưu nhật ký kiểm toán.
              </p>
              <button
                type="button"
                disabled={pagesSaving || Boolean(pagesPreset.error) || pagesPreset.records.length === 0}
                onClick={handleProvisionPages}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] @md:min-h-0 @md:py-2.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {pagesSaving ? 'Đang phát hành...' : 'Phát hành bộ bản ghi Pages'}
              </button>
            </div>
          </div>
          </div>

          <GitHubPagesDeployPanel
            uid={uid}
            domain={domain}
            activeRecords={activeRecords}
            defaultTtl={profile?.defaultTtl ?? 3600}
            onNotify={onNotify}
          />
        </div>
      )}

      {/* Tab 6: Lịch sử thay đổi (Audit Log) */}
      {activeTab === 'audit' && (
        <AuditSearchPanel
          logs={enrichedAuditLogs}
          loading={auditLoading}
          showDomainFilter={false}
          exportFilePrefix={`audit-${domain.name}`}
          emptyTitle="Chưa có lịch sử thay đổi cho tên miền này"
          emptyDescription="Khi bạn thêm, sửa, xóa bản ghi DNS, nhập hàng loạt, bật/tắt chuyển tiếp hoặc xác thực tên miền, sự kiện sẽ được ghi bất biến vào Firestore."
          onNotify={onNotify}
        />
      )}

      {recordModalOpen && (
        <RecordFormModal
          domainName={domain.name}
          defaultTtl={profile?.defaultTtl || 3600}
          initialRecord={editingRecord}
          onClose={() => {
            setRecordModalOpen(false);
            setEditingRecord(null);
          }}
          onSubmit={async (draft) => {
            if (editingRecord) {
              await updateDnsRecord(uid, domain.id, editingRecord.id, draft, editingRecord);
              onNotify(`Đã cập nhật bản ghi ${draft.type} (${draft.host}).`);
            } else {
              await createDnsRecord(uid, domain.id, draft);
              onNotify(`Đã thêm bản ghi ${draft.type} (${draft.host}).`);
            }
          }}
        />
      )}
    </div>
  );
}
