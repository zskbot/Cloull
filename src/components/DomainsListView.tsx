import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Globe,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  IPV4_REGEX,
  sanitizeTags,
  validateDomainName,
} from '../lib/dnsValidation';
import { createDomain, deleteDomainCascade, getTotpSecret, updateDomainMeta } from '../lib/dnsService';
import {
  formatDateVi,
  formatTimestampVi,
  getDomainExpiryMeta,
  getDomainStatusLabel,
  getHealthStatusLabel,
} from '../lib/formatters';
import { verifyTotpCode } from '../lib/totp';
import type { Domain, DomainStatus, UserProfile } from '../types/dns';
import { TotpVerifyModal } from './TotpVerifyModal';

interface DomainsListViewProps {
  uid: string;
  domains: Domain[];
  profile: UserProfile | null;
  loading: boolean;
  openAddTrigger: number;
  onSelectDomain: (domainId: string) => void;
  onNotify: (msg: string) => void;
}

const PAGE_SIZE = 10;

export function DomainsListView({
  uid,
  domains,
  profile,
  loading,
  openAddTrigger,
  onSelectDomain,
  onNotify,
}: DomainsListViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DomainStatus>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'recordCount' | 'updatedAt'>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [showAddModal, setShowAddModal] = useState(false);
  const [lastTrigger, setLastTrigger] = useState(openAddTrigger);
  if (openAddTrigger !== lastTrigger) {
    setLastTrigger(openAddTrigger);
    setShowAddModal(true);
  }

  // Biểu mẫu thêm tên miền
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDefaultIp, setNewDefaultIp] = useState('');
  const [newExpiresDate, setNewExpiresDate] = useState('');
  const [rdapLoadingMode, setRdapLoadingMode] = useState<'add' | 'edit' | null>(null);
  const [rdapNote, setRdapNote] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Chỉnh sửa tên miền
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<DomainStatus>('active');
  const [editExpiresDate, setEditExpiresDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Xóa tên miền
  const [deletingDomain, setDeletingDomain] = useState<Domain | null>(null);
  const [requireTotpForDelete, setRequireTotpForDelete] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    domains.forEach((d) => d.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [domains]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = domains.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (tagFilter !== 'all' && !d.tags.includes(tagFilter)) return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.notes.toLowerCase().includes(q)) return false;
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'recordCount') {
        cmp = a.recordCount - b.recordCount;
      } else {
        const ta = a.updatedAt ? a.updatedAt.toMillis() : 0;
        const tb = b.updatedAt ? b.updatedAt.toMillis() : 0;
        cmp = ta - tb;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [domains, search, statusFilter, tagFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (col: 'name' | 'recordCount' | 'updatedAt') => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateDomainName(newName);
    if (err) {
      setAddError(err);
      return;
    }
    const cleanName = newName.trim().toLowerCase().replace(/\.$/, '');
    if (domains.some((d) => d.name === cleanName)) {
      setAddError('Tên miền này đã tồn tại trong danh sách của bạn.');
      return;
    }
    if (newDefaultIp.trim() && !IPV4_REGEX.test(newDefaultIp.trim())) {
      setAddError('Địa chỉ IPv4 khởi tạo không hợp lệ (ví dụ: 203.0.113.10).');
      return;
    }
    if (newNotes.length > BLUEPRINT_LIMITS.DOMAIN_NOTES_MAX) {
      setAddError('Ghi chú tối đa 500 ký tự.');
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const tags = sanitizeTags(newTags.split(','), BLUEPRINT_LIMITS.DOMAIN_TAGS_MAX);
      const parsedExpiry = newExpiresDate ? new Date(`${newExpiresDate}T00:00:00`) : undefined;
      const createdId = await createDomain(uid, {
        name: cleanName,
        tags,
        notes: newNotes,
        defaultIp: newDefaultIp.trim() || undefined,
        defaultTtl: profile?.defaultTtl || 3600,
        expiresAt: parsedExpiry && !Number.isNaN(parsedExpiry.getTime()) ? parsedExpiry : undefined,
      });
      setShowAddModal(false);
      setNewName('');
      setNewTags('');
      setNewNotes('');
      setNewDefaultIp('');
      setNewExpiresDate('');
      setRdapNote(null);
      onNotify(`Đã thêm tên miền ${cleanName}.`);
      onSelectDomain(createdId);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Không thể tạo tên miền.');
    } finally {
      setAdding(false);
    }
  };

  const openEditModal = (dom: Domain) => {
    setEditingDomain(dom);
    setEditTags(dom.tags.join(', '));
    setEditNotes(dom.notes);
    setEditStatus(dom.status);
    setEditExpiresDate(
      dom.expiresAt ? dom.expiresAt.toDate().toISOString().slice(0, 10) : ''
    );
    setRdapNote(null);
  };

  const handleLookupRdapExpiry = async (domainNameInput: string, mode: 'add' | 'edit') => {
    const clean = domainNameInput.trim().toLowerCase().replace(/\.$/, '');
    const err = validateDomainName(clean);
    if (err) {
      setRdapNote(err);
      return;
    }
    setRdapLoadingMode(mode);
    setRdapNote(null);
    try {
      const res = await fetch('/api/dns/rdap-expiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: clean }),
      });
      const data = (await res.json()) as { expiresDateInput?: string; error?: string };
      if (!res.ok || !data.expiresDateInput) {
        setRdapNote(data.error || 'Không tra cứu được ngày hết hạn qua RDAP.');
        return;
      }
      if (mode === 'add') {
        setNewExpiresDate(data.expiresDateInput);
      } else {
        setEditExpiresDate(data.expiresDateInput);
      }
      setRdapNote(`Đã lấy hạn đăng ký thực tế từ RDAP: ${data.expiresDateInput}.`);
    } catch {
      setRdapNote('Không kết nối được máy chủ tra cứu RDAP.');
    } finally {
      setRdapLoadingMode(null);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDomain) return;
    setSavingEdit(true);
    try {
      const parsedExpiry = editExpiresDate ? new Date(`${editExpiresDate}T00:00:00`) : null;
      await updateDomainMeta(editingDomain.id, {
        tags: sanitizeTags(editTags.split(','), BLUEPRINT_LIMITS.DOMAIN_TAGS_MAX),
        notes: editNotes,
        status: editStatus,
        expiresAt:
          parsedExpiry && !Number.isNaN(parsedExpiry.getTime()) ? parsedExpiry : null,
      });
      onNotify(`Đã cập nhật thông tin tên miền ${editingDomain.name}.`);
      setEditingDomain(null);
      setRdapNote(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRequestDelete = (dom: Domain) => {
    setDeletingDomain(dom);
    if (profile?.totpEnabled) {
      setRequireTotpForDelete(true);
    }
  };

  const executeDeleteDomain = async () => {
    if (!deletingDomain) return;
    setDeletingBusy(true);
    try {
      const name = deletingDomain.name;
      await deleteDomainCascade(uid, deletingDomain.id);
      setDeletingDomain(null);
      setRequireTotpForDelete(false);
      onNotify(`Đã xóa tên miền ${name} cùng toàn bộ bản ghi liên quan.`);
    } finally {
      setDeletingBusy(false);
    }
  };

  const verifyTotpAndDelete = async (code: string): Promise<boolean> => {
    const secretDoc = await getTotpSecret(uid);
    if (!secretDoc) return false;
    const valid = await verifyTotpCode(secretDoc.secret, code);
    if (!valid) return false;
    await executeDeleteDomain();
    return true;
  };

  return (
    <div className="space-y-6">
      {/* Thanh công cụ tìm kiếm & lọc */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3">
          <div className="relative flex-1 @2xl:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm tên miền hoặc ghi chú..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-full @md:w-fit overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'active', label: 'Hoạt động' },
                  { id: 'pending', label: 'Chờ xác minh' },
                  { id: 'warning', label: 'Cần kiểm tra' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 min-h-[36px] @md:min-h-0 @md:py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => {
                  setTagFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo thẻ tên miền"
                className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">Mọi thẻ phân loại</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    Thẻ: {tag}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] @md:min-h-0 @md:py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm tên miền
            </button>
          </div>
        </div>
      </div>

      {/* Bảng danh sách tên miền */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Globe className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">
                {domains.length === 0 ? 'Danh sách tên miền trống' : 'Không tìm thấy tên miền phù hợp'}
              </h3>
              <p className="text-xs text-slate-500">
                {domains.length === 0
                  ? 'Thêm tên miền đầu tiên để khai báo và theo dõi bản ghi DNS.'
                  : 'Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái.'}
              </p>
            </div>
            {domains.length === 0 && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm tên miền
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-5">
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        Tên miền
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('recordCount')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        Bản ghi
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-4">Trạng thái</th>
                    <th className="py-2.5 px-4">Sức khỏe DNS</th>
                    <th className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => toggleSort('updatedAt')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        Cập nhật
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {paged.map((dom) => {
                    const st = getDomainStatusLabel(dom.status);
                    const hl = getHealthStatusLabel(dom.lastHealthStatus);
                    const expMeta = getDomainExpiryMeta(dom.expiresAt);
                    return (
                      <tr key={dom.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-5">
                          <button
                            type="button"
                            onClick={() => onSelectDomain(dom.id)}
                            className="font-mono font-semibold text-slate-900 hover:text-blue-700 text-left"
                          >
                            {dom.name}
                          </button>
                          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-md">
                            {dom.tags.length > 0 ? dom.tags.join(' · ') : 'Không có thẻ'}
                            {expMeta.hasExpiry ? ` · Hạn: ${formatDateVi(dom.expiresAt)} (${expMeta.label})` : ''}
                            {dom.notes ? ` — ${dom.notes}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {dom.recordCount}
                        </td>
                        <td className={`py-3 px-4 text-xs font-medium whitespace-nowrap ${st.colorClass}`}>
                          {st.text}
                        </td>
                        <td className={`py-3 px-4 text-xs font-medium whitespace-nowrap ${hl.colorClass}`}>
                          {hl.text}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                          {formatTimestampVi(dom.updatedAt)}
                        </td>
                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelectDomain(dom.id)}
                              className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded transition-colors"
                            >
                              Mở vùng DNS
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(dom)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                              title="Sửa thông tin tên miền"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRequestDelete(dom)}
                              className="p-1.5 text-slate-500 hover:text-red-700 rounded hover:bg-red-50"
                              title="Xóa tên miền"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span className="font-mono tabular-nums">
                  Trang {safePage} / {totalPages} ({filtered.length} tên miền)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40"
                    aria-label="Trang trước"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-40"
                    aria-label="Trang sau"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hộp thoại thêm tên miền */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Thêm tên miền mới</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {addError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {addError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Tên miền chuẩn (FQDN)
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="tenmiencuaban.vn"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Địa chỉ IPv4 gốc mặc định (tùy chọn)
                </label>
                <input
                  type="text"
                  value={newDefaultIp}
                  onChange={(e) => setNewDefaultIp(e.target.value)}
                  placeholder="Ví dụ: 203.0.113.10 (tự tạo bản ghi A cho @)"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Thẻ phân loại (cách nhau bằng dấu phẩy, tối đa 10 thẻ)
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="san-xuat, ca-nhan, web-chinh"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Ngày hết hạn tên miền (tùy chọn)
                  </label>
                  <button
                    type="button"
                    disabled={rdapLoadingMode === 'add' || !newName.trim()}
                    onClick={() => void handleLookupRdapExpiry(newName, 'add')}
                    className="text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-50"
                  >
                    {rdapLoadingMode === 'add' ? 'Đang tra cứu RDAP...' : 'Tra cứu hạn RDAP'}
                  </button>
                </div>
                <input
                  type="date"
                  value={newExpiresDate}
                  onChange={(e) => setNewExpiresDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {rdapNote && showAddModal && (
                  <p className="text-[11px] text-slate-500">{rdapNote}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Ghi chú</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Mô tả mục đích sử dụng hoặc nhà đăng ký tên miền..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
                >
                  {adding ? 'Đang lưu...' : 'Tạo tên miền'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hộp thoại chỉnh sửa thông tin tên miền */}
      {editingDomain && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Cập nhật tên miền <span className="font-mono">{editingDomain.name}</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditingDomain(null)}
                className="p-1 text-slate-400 hover:text-slate-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Trạng thái</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as DomainStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="pending">Chờ xác minh</option>
                  <option value="warning">Cần kiểm tra</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Thẻ phân loại</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Ngày hết hạn tên miền (tùy chọn)
                  </label>
                  <button
                    type="button"
                    disabled={rdapLoadingMode === 'edit'}
                    onClick={() => editingDomain && void handleLookupRdapExpiry(editingDomain.name, 'edit')}
                    className="text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-50"
                  >
                    {rdapLoadingMode === 'edit' ? 'Đang tra cứu RDAP...' : 'Tra cứu hạn RDAP'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editExpiresDate}
                    onChange={(e) => setEditExpiresDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                  {editExpiresDate && (
                    <button
                      type="button"
                      onClick={() => setEditExpiresDate('')}
                      className="px-2.5 py-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md"
                    >
                      Xóa hạn
                    </button>
                  )}
                </div>
                {rdapNote && editingDomain && (
                  <p className="text-[11px] text-slate-500">{rdapNote}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Ghi chú</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDomain(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md"
                >
                  {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Xác nhận xóa tên miền (không bật 2FA) */}
      {deletingDomain && !requireTotpForDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Xác nhận xóa tên miền</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Thao tác này sẽ xóa vĩnh viễn vùng DNS <span className="font-mono font-semibold">{deletingDomain.name}</span> cùng toàn bộ{' '}
              <span className="font-mono tabular-nums">{deletingDomain.recordCount}</span> bản ghi và quy tắc chuyển tiếp bên trong.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingDomain(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={executeDeleteDomain}
                className="px-4 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-md"
              >
                {deletingBusy ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Xác thực 2FA TOTP trước khi xóa tên miền nếu đã bật 2FA */}
      {deletingDomain && requireTotpForDelete && (
        <TotpVerifyModal
          title="Xác thực 2 lớp để xóa tên miền"
          description={`Tài khoản của bạn đang bật bảo vệ 2FA. Vui lòng nhập mã OTP 6 chữ số để xác nhận xóa vĩnh viễn ${deletingDomain.name}.`}
          confirmLabel="Xác minh và xóa"
          onCancel={() => {
            setDeletingDomain(null);
            setRequireTotpForDelete(false);
          }}
          onVerify={verifyTotpAndDelete}
        />
      )}
    </div>
  );
}
