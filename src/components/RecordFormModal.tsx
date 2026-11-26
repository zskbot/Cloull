import { useState } from 'react';
import { X } from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  RECORD_TYPE_META,
  sanitizeTags,
  validateRecordInput,
  type RecordDraftInput,
} from '../lib/dnsValidation';
import {
  ADVANCED_RECORD_TYPES,
  COMMON_RECORD_TYPES,
  type CaaTag,
  type DnsRecord,
  type RecordType,
} from '../types/dns';

interface RecordFormModalProps {
  domainName: string;
  defaultTtl: number;
  initialRecord?: DnsRecord | null;
  onClose: () => void;
  onSubmit: (input: RecordDraftInput) => Promise<void>;
}

const TTL_PRESETS = [
  { label: '1 phút (60s)', value: 60 },
  { label: '5 phút (300s)', value: 300 },
  { label: '15 phút (900s)', value: 900 },
  { label: '1 giờ (3600s)', value: 3600 },
  { label: '12 giờ (43200s)', value: 43200 },
  { label: '1 ngày (86400s)', value: 86400 },
];

export function RecordFormModal({
  domainName,
  defaultTtl,
  initialRecord,
  onClose,
  onSubmit,
}: RecordFormModalProps) {
  const isEditing = Boolean(initialRecord);

  const [type, setType] = useState<RecordType>(initialRecord?.type || 'A');
  const [host, setHost] = useState(initialRecord?.host || '@');
  const [value, setValue] = useState(initialRecord?.value || '');
  const [ttl, setTtl] = useState(initialRecord?.ttl || defaultTtl || 3600);
  const [priority, setPriority] = useState<string>(
    initialRecord?.priority !== undefined ? String(initialRecord.priority) : '10'
  );
  const [weight, setWeight] = useState<string>(
    initialRecord?.weight !== undefined ? String(initialRecord.weight) : '0'
  );
  const [port, setPort] = useState<string>(
    initialRecord?.port !== undefined ? String(initialRecord.port) : '443'
  );
  const [caaFlags, setCaaFlags] = useState<string>(
    initialRecord?.caaFlags !== undefined ? String(initialRecord.caaFlags) : '0'
  );
  const [caaTag, setCaaTag] = useState<CaaTag>(initialRecord?.caaTag || 'issue');
  const [dsKeyTag, setDsKeyTag] = useState<string>(
    initialRecord?.dsKeyTag !== undefined ? String(initialRecord.dsKeyTag) : '12345'
  );
  const [dsAlgorithm, setDsAlgorithm] = useState<string>(
    initialRecord?.dsAlgorithm !== undefined ? String(initialRecord.dsAlgorithm) : '13'
  );
  const [dsDigestType, setDsDigestType] = useState<string>(
    initialRecord?.dsDigestType !== undefined ? String(initialRecord.dsDigestType) : '2'
  );
  const [sshfpAlgorithm, setSshfpAlgorithm] = useState<string>(
    initialRecord?.sshfpAlgorithm !== undefined ? String(initialRecord.sshfpAlgorithm) : '1'
  );
  const [sshfpFingerprintType, setSshfpFingerprintType] = useState<string>(
    initialRecord?.sshfpFingerprintType !== undefined ? String(initialRecord.sshfpFingerprintType) : '2'
  );
  const [tlsaUsage, setTlsaUsage] = useState<string>(
    initialRecord?.tlsaUsage !== undefined ? String(initialRecord.tlsaUsage) : '3'
  );
  const [tlsaSelector, setTlsaSelector] = useState<string>(
    initialRecord?.tlsaSelector !== undefined ? String(initialRecord.tlsaSelector) : '1'
  );
  const [tlsaMatchingType, setTlsaMatchingType] = useState<string>(
    initialRecord?.tlsaMatchingType !== undefined ? String(initialRecord.tlsaMatchingType) : '1'
  );
  const [tagsText, setTagsText] = useState(initialRecord?.tags.join(', ') || '');
  const [notes, setNotes] = useState(initialRecord?.notes || '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const meta = RECORD_TYPE_META[type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const draft: RecordDraftInput = {
      type,
      host: host.trim(),
      value: value.trim(),
      ttl: Number(ttl),
      tags: sanitizeTags(tagsText.split(','), BLUEPRINT_LIMITS.RECORD_TAGS_MAX),
      notes: notes.trim(),
    };

    if (type === 'MX' || type === 'HTTPS' || type === 'SVCB' || type === 'NAPTR') {
      draft.priority = Number.parseInt(priority, 10);
    }
    if (type === 'SRV') {
      draft.priority = Number.parseInt(priority, 10);
      draft.weight = Number.parseInt(weight, 10);
      draft.port = Number.parseInt(port, 10);
    }
    if (type === 'CAA') {
      draft.caaFlags = Number.parseInt(caaFlags, 10);
      draft.caaTag = caaTag;
    }
    if (type === 'DS') {
      draft.dsKeyTag = Number.parseInt(dsKeyTag, 10);
      draft.dsAlgorithm = Number.parseInt(dsAlgorithm, 10);
      draft.dsDigestType = Number.parseInt(dsDigestType, 10);
    }
    if (type === 'SSHFP') {
      draft.sshfpAlgorithm = Number.parseInt(sshfpAlgorithm, 10);
      draft.sshfpFingerprintType = Number.parseInt(sshfpFingerprintType, 10);
    }
    if (type === 'TLSA') {
      draft.tlsaUsage = Number.parseInt(tlsaUsage, 10);
      draft.tlsaSelector = Number.parseInt(tlsaSelector, 10);
      draft.tlsaMatchingType = Number.parseInt(tlsaMatchingType, 10);
    }

    const validationError = validateRecordInput(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu bản ghi DNS.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 space-y-5 my-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isEditing ? 'Chỉnh sửa bản ghi DNS' : 'Thêm bản ghi DNS mới'}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{domainName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">Loại bản ghi</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as RecordType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <optgroup label="Bản ghi phổ biến">
                  {COMMON_RECORD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RECORD_TYPE_META[t].label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Bản ghi nâng cao">
                  {ADVANCED_RECORD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RECORD_TYPE_META[t].label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Thời gian lưu đệm TTL (giây)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={60}
                  max={604800}
                  value={ttl}
                  onChange={(e) => setTtl(Number(e.target.value))}
                  className="w-28 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <select
                  value={TTL_PRESETS.some((p) => p.value === ttl) ? ttl : ''}
                  onChange={(e) => {
                    if (e.target.value) setTtl(Number(e.target.value));
                  }}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="">Chọn nhanh TTL</option>
                  {TTL_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            {meta.description}
          </p>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">
              Tên bản ghi / Host (dùng <span className="font-mono">@</span> cho tên miền gốc)
            </label>
            <div className="flex items-center border border-slate-300 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-blue-600">
              <input
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={meta.hostPlaceholder}
                className="flex-1 px-3 py-2 text-sm font-mono focus:outline-none"
              />
              <span className="px-3 py-2 bg-slate-50 border-l border-slate-200 text-xs font-mono text-slate-500">
                .{domainName}
              </span>
            </div>
          </div>

          {/* Trường chuyên biệt theo loại bản ghi */}
          {(type === 'MX' || type === 'HTTPS' || type === 'SVCB' || type === 'NAPTR') && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Độ ưu tiên (Priority)
              </label>
              <input
                type="number"
                min={0}
                max={65535}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-40 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
          )}

          {type === 'SRV' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Ưu tiên (Priority)</label>
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Trọng số (Weight)</label>
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Cổng (Port)</label>
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
            </div>
          )}

          {type === 'CAA' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Cờ (Flags)</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={caaFlags}
                  onChange={(e) => setCaaFlags(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Thẻ (Tag)</label>
                <select
                  value={caaTag}
                  onChange={(e) => setCaaTag(e.target.value as CaaTag)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md bg-white"
                >
                  <option value="issue">issue</option>
                  <option value="issuewild">issuewild</option>
                  <option value="iodef">iodef</option>
                </select>
              </div>
            </div>
          )}

          {type === 'DS' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Key Tag</label>
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={dsKeyTag}
                  onChange={(e) => setDsKeyTag(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Thuật toán (Algorithm)</label>
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={dsAlgorithm}
                  onChange={(e) => setDsAlgorithm(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Loại băm (Digest)</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={dsDigestType}
                  onChange={(e) => setDsDigestType(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
            </div>
          )}

          {type === 'SSHFP' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Thuật toán (1-6)</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={sshfpAlgorithm}
                  onChange={(e) => setSshfpAlgorithm(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Loại dấu vân tay (1-2)</label>
                <input
                  type="number"
                  min={1}
                  max={2}
                  value={sshfpFingerprintType}
                  onChange={(e) => setSshfpFingerprintType(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
            </div>
          )}

          {type === 'TLSA' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Usage (0-3)</label>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={tlsaUsage}
                  onChange={(e) => setTlsaUsage(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Selector (0-1)</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  value={tlsaSelector}
                  onChange={(e) => setTlsaSelector(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Matching (0-2)</label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  value={tlsaMatchingType}
                  onChange={(e) => setTlsaMatchingType(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">{meta.valueLabel}</label>
            <textarea
              rows={type === 'TXT' || type === 'SPF' || type === 'DS' || type === 'TLSA' ? 3 : 2}
              required
              maxLength={BLUEPRINT_LIMITS.RECORD_VALUE_MAX}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={meta.valuePlaceholder}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Thẻ bản ghi (cách nhau bằng dấu phẩy)
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="web, email, ssl"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">Ghi chú</label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.RECORD_NOTES_MAX}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú ngắn cho bản ghi..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
            >
              {submitting ? 'Đang lưu...' : isEditing ? 'Cập nhật bản ghi' : 'Lưu bản ghi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
