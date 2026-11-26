import type { CaaTag, DnsRecord, PagesProvider, RecordType } from '../types/dns';

// Đồng bộ nguyên văn giới hạn & regex với firebase-blueprint.json và firestore.rules
export const BLUEPRINT_LIMITS = {
  DOMAIN_NAME_REGEX: /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
  DOMAIN_MIN_LEN: 3,
  DOMAIN_MAX_LEN: 253,
  DOMAIN_NOTES_MAX: 500,
  DOMAIN_TAGS_MAX: 10,
  TAG_MAX_LEN: 32,
  RECORD_HOST_MAX: 253,
  RECORD_VALUE_MAX: 2048,
  RECORD_NOTES_MAX: 300,
  RECORD_TAGS_MAX: 8,
  TTL_MIN: 60,
  TTL_MAX: 604800,
  FORWARD_URL_MAX: 1024,
  FORWARD_URL_REGEX: /^https?:\/\/.+/,
  DISPLAY_NAME_MAX: 100,
  AUDIT_LABEL_MAX: 120,
  AUDIT_SUMMARY_MAX: 400,
  PAGES_TARGET_MAX: 253,
  VERIFY_TOKEN_MAX: 64,
  GITHUB_REPO_REGEX: /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,
  DEPLOYMENT_BRANCH_MAX: 120,
  DEPLOYMENT_DIR_MAX: 120,
  DEPLOYMENT_SHA_MAX: 64,
  DEPLOYMENT_STATUS_MAX: 200,
};

export interface RecordTypeMeta {
  type: RecordType;
  group: 'common' | 'advanced';
  label: string;
  description: string;
  valueLabel: string;
  valuePlaceholder: string;
  hostPlaceholder: string;
}

export const RECORD_TYPE_META: Record<RecordType, RecordTypeMeta> = {
  A: {
    type: 'A',
    group: 'common',
    label: 'A (Địa chỉ IPv4)',
    description: 'Ánh xạ tên miền sang địa chỉ IPv4 32-bit.',
    valueLabel: 'Địa chỉ IPv4',
    valuePlaceholder: '203.0.113.10',
    hostPlaceholder: '@ hoặc www',
  },
  AAAA: {
    type: 'AAAA',
    group: 'common',
    label: 'AAAA (Địa chỉ IPv6)',
    description: 'Ánh xạ tên miền sang địa chỉ IPv6 128-bit.',
    valueLabel: 'Địa chỉ IPv6',
    valuePlaceholder: '2001:db8::1',
    hostPlaceholder: '@ hoặc www',
  },
  CNAME: {
    type: 'CNAME',
    group: 'common',
    label: 'CNAME (Tên bí danh)',
    description: 'Chuyển hướng phân giải tên miền phụ sang một tên miền chuẩn khác.',
    valueLabel: 'Tên miền đích',
    valuePlaceholder: 'app.nhacungcap.com',
    hostPlaceholder: 'www hoặc cdn',
  },
  MX: {
    type: 'MX',
    group: 'common',
    label: 'MX (Máy chủ thư)',
    description: 'Chỉ định máy chủ tiếp nhận email cho tên miền kèm độ ưu tiên.',
    valueLabel: 'Máy chủ thư (Mail Exchange)',
    valuePlaceholder: 'mail.example.com',
    hostPlaceholder: '@',
  },
  TXT: {
    type: 'TXT',
    group: 'common',
    label: 'TXT (Văn bản xác thực)',
    description: 'Lưu chuỗi xác minh tên miền, DKIM, DMARC hoặc SPF.',
    valueLabel: 'Nội dung văn bản',
    valuePlaceholder: 'v=spf1 include:_spf.google.com ~all',
    hostPlaceholder: '@ hoặc _dmarc',
  },
  NS: {
    type: 'NS',
    group: 'common',
    label: 'NS (Máy chủ tên miền)',
    description: 'Ủy quyền quản lý tên miền hoặc tên miền phụ cho máy chủ DNS.',
    valueLabel: 'Máy chủ tên miền',
    valuePlaceholder: 'ns1.example.com',
    hostPlaceholder: '@ hoặc sub',
  },
  PTR: {
    type: 'PTR',
    group: 'common',
    label: 'PTR (Phân giải ngược)',
    description: 'Ánh xạ ngược từ địa chỉ IP về tên miền chính thống.',
    valueLabel: 'Tên miền chuẩn đích',
    valuePlaceholder: 'host.example.com',
    hostPlaceholder: '10.113.0.203.in-addr.arpa',
  },
  SRV: {
    type: 'SRV',
    group: 'common',
    label: 'SRV (Định vị dịch vụ)',
    description: 'Khai báo máy chủ, cổng và trọng số cho dịch vụ (SIP, XMPP, Minecraft...).',
    valueLabel: 'Máy chủ đích',
    valuePlaceholder: 'sipserver.example.com',
    hostPlaceholder: '_sip._tcp',
  },
  CAA: {
    type: 'CAA',
    group: 'common',
    label: 'CAA (Ủy quyền chứng chỉ SSL)',
    description: 'Giới hạn tổ chức CA được phép cấp chứng chỉ SSL/TLS cho tên miền.',
    valueLabel: 'Tên miền CA hoặc địa chỉ báo cáo',
    valuePlaceholder: 'letsencrypt.org',
    hostPlaceholder: '@',
  },
  SPF: {
    type: 'SPF',
    group: 'common',
    label: 'SPF (Chính sách gửi thư)',
    description: 'Khai báo chính sách máy chủ gửi thư (khuyến nghị dùng song song TXT).',
    valueLabel: 'Chuỗi chính sách SPF',
    valuePlaceholder: 'v=spf1 mx -all',
    hostPlaceholder: '@',
  },
  ALIAS: {
    type: 'ALIAS',
    group: 'advanced',
    label: 'ALIAS (Bí danh đỉnh Apex)',
    description: 'Tương tự CNAME nhưng hỗ trợ trực tiếp tại tên miền gốc (@).',
    valueLabel: 'Tên miền đích',
    valuePlaceholder: 'edge.provider.net',
    hostPlaceholder: '@',
  },
  DS: {
    type: 'DS',
    group: 'advanced',
    label: 'DS (Ủy quyền khóa DNSSEC)',
    description: 'Lưu mã băm khóa ký vùng (KSK) để xác thực chuỗi tin cậy DNSSEC.',
    valueLabel: 'Chuỗi băm Digest (Hex)',
    valuePlaceholder: '2BB183AF5F22588179A53B0A98631FAD1A292118',
    hostPlaceholder: 'sub hoặc @',
  },
  HINFO: {
    type: 'HINFO',
    group: 'advanced',
    label: 'HINFO (Thông tin phần cứng/OS)',
    description: 'Khai báo cấu trúc CPU và hệ điều hành của máy chủ.',
    valueLabel: 'CPU và Hệ điều hành',
    valuePlaceholder: '"AMD64" "Linux"',
    hostPlaceholder: 'node1',
  },
  HTTPS: {
    type: 'HTTPS',
    group: 'advanced',
    label: 'HTTPS (Tham số kết nối HTTP/3)',
    description: 'Tăng tốc đàm phán TLS, hỗ trợ ALPN (h2, h3) và ECH cho dịch vụ HTTPS.',
    valueLabel: 'Đích và tham số dịch vụ',
    valuePlaceholder: '. alpn="h3,h2"',
    hostPlaceholder: '@',
  },
  NAPTR: {
    type: 'NAPTR',
    group: 'advanced',
    label: 'NAPTR (Con trỏ quy tắc tên)',
    description: 'Biến đổi định danh URI/ENUM phục vụ viễn thông và VoIP.',
    valueLabel: 'Flags, Service, Regexp và Đích',
    valuePlaceholder: '100 10 "U" "E2U+sip" "!^.*$!sip:info@example.com!" .',
    hostPlaceholder: '@',
  },
  RP: {
    type: 'RP',
    group: 'advanced',
    label: 'RP (Người phụ trách)',
    description: 'Khai báo hộp thư người phụ trách kỹ thuật (dạng DNS) và bản ghi TXT.',
    valueLabel: 'Hộp thư DNS và tên miền TXT',
    valuePlaceholder: 'admin.example.com info.example.com',
    hostPlaceholder: '@',
  },
  SSHFP: {
    type: 'SSHFP',
    group: 'advanced',
    label: 'SSHFP (Dấu vân tay khóa SSH)',
    description: 'Công bố vân tay khóa công khai SSH của máy chủ qua DNS.',
    valueLabel: 'Chuỗi vân tay Hex',
    valuePlaceholder: '123456789abcdef67890123456789abcdef67890',
    hostPlaceholder: 'ssh',
  },
  SVCB: {
    type: 'SVCB',
    group: 'advanced',
    label: 'SVCB (Gắn kết dịch vụ tổng quát)',
    description: 'Cung cấp thông số kết nối thay thế cho các giao thức dịch vụ.',
    valueLabel: 'Đích và tham số SVCB',
    valuePlaceholder: 'svc.example.com port=8443',
    hostPlaceholder: '_dns',
  },
  TLSA: {
    type: 'TLSA',
    group: 'advanced',
    label: 'TLSA (Chứng thực DANE TLS)',
    description: 'Gắn kết chứng chỉ TLS của máy chủ trực tiếp với tên miền qua DNSSEC.',
    valueLabel: 'Dữ liệu liên kết chứng chỉ (Hex)',
    valuePlaceholder: 'd2abde240d7cd3ee6b4b28c54df034b97983a1d16e8a410e4561cb106618e971',
    hostPlaceholder: '_443._tcp',
  },
};

export const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const IPV6_REGEX =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d))$/;

export const HOSTNAME_REGEX = /^([a-zA-Z0-9_*]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)*[a-zA-Z0-9_-]{1,63}\.?$/;

export function validateDomainName(name: string): string | null {
  const clean = name.trim().toLowerCase().replace(/\.$/, '');
  if (clean.length < BLUEPRINT_LIMITS.DOMAIN_MIN_LEN || clean.length > BLUEPRINT_LIMITS.DOMAIN_MAX_LEN) {
    return 'Tên miền phải có độ dài từ 3 đến 253 ký tự.';
  }
  if (!BLUEPRINT_LIMITS.DOMAIN_NAME_REGEX.test(clean)) {
    return 'Tên miền không hợp lệ (ví dụ đúng: tenmien.vn hoặc api.congty.com).';
  }
  return null;
}

export function sanitizeTags(rawTags: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const tag of rawTags) {
    const trimmed = tag.trim().slice(0, BLUEPRINT_LIMITS.TAG_MAX_LEN);
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      clean.push(trimmed);
      if (clean.length >= maxCount) break;
    }
  }
  return clean;
}

export interface RecordDraftInput {
  type: RecordType;
  host: string;
  value: string;
  ttl: number;
  priority?: number;
  weight?: number;
  port?: number;
  caaFlags?: number;
  caaTag?: CaaTag;
  dsKeyTag?: number;
  dsAlgorithm?: number;
  dsDigestType?: number;
  sshfpAlgorithm?: number;
  sshfpFingerprintType?: number;
  tlsaUsage?: number;
  tlsaSelector?: number;
  tlsaMatchingType?: number;
  tags: string[];
  notes: string;
}

export function validateRecordInput(input: RecordDraftInput): string | null {
  const host = input.host.trim();
  const value = input.value.trim();

  if (!host || host.length > BLUEPRINT_LIMITS.RECORD_HOST_MAX) {
    return 'Tên bản ghi (Host) không được để trống và tối đa 253 ký tự.';
  }
  if (host !== '@' && host !== '*' && !/^[a-zA-Z0-9_.*-]+$/.test(host)) {
    return 'Tên bản ghi (Host) chỉ được chứa chữ cái, số, dấu chấm (.), gạch ngang (-), gạch dưới (_) hoặc dấu sao (*).';
  }
  if (!value || value.length > BLUEPRINT_LIMITS.RECORD_VALUE_MAX) {
    return 'Giá trị bản ghi không được để trống và tối đa 2048 ký tự.';
  }
  if (!Number.isInteger(input.ttl) || input.ttl < BLUEPRINT_LIMITS.TTL_MIN || input.ttl > BLUEPRINT_LIMITS.TTL_MAX) {
    return 'TTL phải là số nguyên từ 60 đến 604800 giây.';
  }
  if (input.notes.length > BLUEPRINT_LIMITS.RECORD_NOTES_MAX) {
    return 'Ghi chú bản ghi tối đa 300 ký tự.';
  }

  switch (input.type) {
    case 'A':
      if (!IPV4_REGEX.test(value)) return 'Bản ghi A yêu cầu một địa chỉ IPv4 hợp lệ (ví dụ: 203.0.113.10).';
      break;
    case 'AAAA':
      if (!IPV6_REGEX.test(value)) return 'Bản ghi AAAA yêu cầu một địa chỉ IPv6 hợp lệ (ví dụ: 2001:db8::1).';
      break;
    case 'CNAME':
    case 'NS':
    case 'PTR':
    case 'ALIAS':
      if (host === '@' && input.type === 'CNAME') {
        return 'CNAME không thể đặt tại tên miền gốc (@). Hãy sử dụng bản ghi ALIAS cho tên miền gốc.';
      }
      if (!HOSTNAME_REGEX.test(value) || !value.includes('.')) {
        return `Bản ghi ${input.type} yêu cầu giá trị là một tên miền đầy đủ hợp lệ.`;
      }
      break;
    case 'MX':
      if (input.priority === undefined || !Number.isInteger(input.priority) || input.priority < 0 || input.priority > 65535) {
        return 'Bản ghi MX yêu cầu độ ưu tiên (Priority) từ 0 đến 65535.';
      }
      if (!HOSTNAME_REGEX.test(value) || !value.includes('.')) {
        return 'Bản ghi MX yêu cầu tên máy chủ thư hợp lệ (ví dụ: mail.example.com).';
      }
      break;
    case 'SRV':
      if (
        input.priority === undefined ||
        input.weight === undefined ||
        input.port === undefined ||
        input.priority < 0 ||
        input.priority > 65535 ||
        input.weight < 0 ||
        input.weight > 65535 ||
        input.port < 0 ||
        input.port > 65535
      ) {
        return 'Bản ghi SRV yêu cầu đầy đủ Priority, Weight và Port từ 0 đến 65535.';
      }
      if (!HOSTNAME_REGEX.test(value)) {
        return 'Bản ghi SRV yêu cầu tên máy chủ đích hợp lệ.';
      }
      break;
    case 'CAA':
      if (input.caaFlags === undefined || input.caaFlags < 0 || input.caaFlags > 255) {
        return 'Bản ghi CAA yêu cầu cờ (Flags) từ 0 đến 255 (thường là 0 hoặc 128).';
      }
      if (!input.caaTag || !['issue', 'issuewild', 'iodef'].includes(input.caaTag)) {
        return 'Bản ghi CAA yêu cầu chọn thẻ (issue, issuewild hoặc iodef).';
      }
      break;
    case 'DS':
      if (
        input.dsKeyTag === undefined ||
        input.dsKeyTag < 0 ||
        input.dsKeyTag > 65535 ||
        input.dsAlgorithm === undefined ||
        input.dsAlgorithm < 1 ||
        input.dsAlgorithm > 255 ||
        input.dsDigestType === undefined ||
        input.dsDigestType < 1 ||
        input.dsDigestType > 4
      ) {
        return 'Bản ghi DS yêu cầu Key Tag (0-65535), Algorithm (1-255) và Digest Type (1-4).';
      }
      if (!/^[a-fA-F0-9]+$/.test(value)) {
        return 'Giá trị Digest của bản ghi DS phải là chuỗi thập lục phân (Hex).';
      }
      break;
    case 'SSHFP':
      if (
        input.sshfpAlgorithm === undefined ||
        input.sshfpAlgorithm < 1 ||
        input.sshfpAlgorithm > 6 ||
        input.sshfpFingerprintType === undefined ||
        input.sshfpFingerprintType < 1 ||
        input.sshfpFingerprintType > 2
      ) {
        return 'Bản ghi SSHFP yêu cầu Algorithm (1-6) và Fingerprint Type (1-2).';
      }
      if (!/^[a-fA-F0-9]+$/.test(value)) {
        return 'Dấu vân tay SSHFP phải là chuỗi thập lục phân (Hex).';
      }
      break;
    case 'TLSA':
      if (
        input.tlsaUsage === undefined ||
        input.tlsaUsage < 0 ||
        input.tlsaUsage > 3 ||
        input.tlsaSelector === undefined ||
        input.tlsaSelector < 0 ||
        input.tlsaSelector > 1 ||
        input.tlsaMatchingType === undefined ||
        input.tlsaMatchingType < 0 ||
        input.tlsaMatchingType > 2
      ) {
        return 'Bản ghi TLSA yêu cầu Usage (0-3), Selector (0-1) và Matching Type (0-2).';
      }
      if (!/^[a-fA-F0-9]+$/.test(value)) {
        return 'Dữ liệu TLSA phải là chuỗi thập lục phân (Hex).';
      }
      break;
    default:
      break;
  }

  return null;
}

export interface ParsedBulkRow {
  lineNumber: number;
  raw: string;
  valid: boolean;
  error?: string;
  record?: RecordDraftInput;
}

const SUPPORTED_SET = new Set<string>(Object.keys(RECORD_TYPE_META));

function parseLineTokens(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes && /\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseBindZoneFile(content: string, domainName: string, defaultTtl = 3600): ParsedBulkRow[] {
  const lines = content.split(/\r?\n/);
  const rows: ParsedBulkRow[] = [];
  let currentTtl = defaultTtl;

  lines.forEach((rawLine, index) => {
    const lineNoComment = rawLine.replace(/;.*$/, '').trim();
    if (!lineNoComment) return;

    if (lineNoComment.toUpperCase().startsWith('$TTL')) {
      const ttlToken = lineNoComment.split(/\s+/)[1];
      const parsed = Number.parseInt(ttlToken, 10);
      if (!Number.isNaN(parsed) && parsed >= 60 && parsed <= 604800) {
        currentTtl = parsed;
      }
      return;
    }
    if (lineNoComment.toUpperCase().startsWith('$ORIGIN')) {
      return;
    }

    const tokens = parseLineTokens(lineNoComment);
    if (tokens.length < 3) {
      rows.push({
        lineNumber: index + 1,
        raw: rawLine,
        valid: false,
        error: 'Thiếu trường thông tin bản ghi BIND.',
      });
      return;
    }

    let cursor = 0;
    let host = tokens[cursor++];
    if (host.endsWith('.')) {
      const noDot = host.slice(0, -1).toLowerCase();
      if (noDot === domainName.toLowerCase()) {
        host = '@';
      } else if (noDot.endsWith(`.${domainName.toLowerCase()}`)) {
        host = noDot.slice(0, -domainName.length - 1);
      } else {
        host = noDot;
      }
    }

    let ttl = currentTtl;
    if (/^\d+$/.test(tokens[cursor])) {
      ttl = Number.parseInt(tokens[cursor++], 10);
    }

    if (tokens[cursor]?.toUpperCase() === 'IN') {
      cursor++;
    }
    if (/^\d+$/.test(tokens[cursor] ?? '')) {
      ttl = Number.parseInt(tokens[cursor++], 10);
    }

    const typeStr = (tokens[cursor++] || '').toUpperCase();
    if (typeStr === 'SOA') {
      return; // Bỏ qua dòng SOA hệ thống khi nhập
    }
    if (!SUPPORTED_SET.has(typeStr)) {
      rows.push({
        lineNumber: index + 1,
        raw: rawLine,
        valid: false,
        error: `Loại bản ghi "${typeStr}" chưa được hỗ trợ.`,
      });
      return;
    }

    const type = typeStr as RecordType;
    const rest = tokens.slice(cursor);
    if (rest.length === 0) {
      rows.push({
        lineNumber: index + 1,
        raw: rawLine,
        valid: false,
        error: 'Thiếu giá trị bản ghi.',
      });
      return;
    }

    const draft: RecordDraftInput = {
      type,
      host,
      value: rest.join(' ').replace(/^"|"$/g, ''),
      ttl,
      tags: ['nhap-bind'],
      notes: '',
    };

    if (type === 'MX' && rest.length >= 2) {
      draft.priority = Number.parseInt(rest[0], 10);
      draft.value = rest.slice(1).join(' ').replace(/\.$/, '');
    } else if (type === 'SRV' && rest.length >= 4) {
      draft.priority = Number.parseInt(rest[0], 10);
      draft.weight = Number.parseInt(rest[1], 10);
      draft.port = Number.parseInt(rest[2], 10);
      draft.value = rest.slice(3).join(' ').replace(/\.$/, '');
    } else if (type === 'CAA' && rest.length >= 3) {
      draft.caaFlags = Number.parseInt(rest[0], 10);
      draft.caaTag = rest[1] as CaaTag;
      draft.value = rest.slice(2).join(' ').replace(/^"|"$/g, '');
    } else if (type === 'DS' && rest.length >= 4) {
      draft.dsKeyTag = Number.parseInt(rest[0], 10);
      draft.dsAlgorithm = Number.parseInt(rest[1], 10);
      draft.dsDigestType = Number.parseInt(rest[2], 10);
      draft.value = rest.slice(3).join('');
    } else if (type === 'SSHFP' && rest.length >= 3) {
      draft.sshfpAlgorithm = Number.parseInt(rest[0], 10);
      draft.sshfpFingerprintType = Number.parseInt(rest[1], 10);
      draft.value = rest.slice(2).join('');
    } else if (type === 'TLSA' && rest.length >= 4) {
      draft.tlsaUsage = Number.parseInt(rest[0], 10);
      draft.tlsaSelector = Number.parseInt(rest[1], 10);
      draft.tlsaMatchingType = Number.parseInt(rest[2], 10);
      draft.value = rest.slice(3).join('');
    } else if ((type === 'HTTPS' || type === 'SVCB') && /^\d+$/.test(rest[0])) {
      draft.priority = Number.parseInt(rest[0], 10);
      draft.value = rest.slice(1).join(' ');
    } else if (type === 'CNAME' || type === 'NS' || type === 'PTR' || type === 'ALIAS') {
      draft.value = rest.join(' ').replace(/\.$/, '');
    }

    const validationError = validateRecordInput(draft);
    rows.push({
      lineNumber: index + 1,
      raw: rawLine,
      valid: !validationError,
      error: validationError || undefined,
      record: draft,
    });
  });

  return rows;
}

export function parseCsvRecords(content: string, defaultTtl = 3600): ParsedBulkRow[] {
  const lines = content.split(/\r?\n/);
  const rows: ParsedBulkRow[] = [];

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const cols = trimmed.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

    // Bỏ qua dòng tiêu đề CSV
    if (index === 0 && (cols[0].toLowerCase() === 'type' || cols[0].toLowerCase() === 'loai')) {
      return;
    }
    if (cols.length < 3) {
      rows.push({
        lineNumber: index + 1,
        raw: rawLine,
        valid: false,
        error: 'CSV cần tối thiểu 3 cột: Loại, Tên bản ghi (Host), Giá trị.',
      });
      return;
    }

    const typeStr = cols[0].toUpperCase();
    if (!SUPPORTED_SET.has(typeStr)) {
      rows.push({
        lineNumber: index + 1,
        raw: rawLine,
        valid: false,
        error: `Loại bản ghi "${typeStr}" không hợp lệ.`,
      });
      return;
    }

    const type = typeStr as RecordType;
    const host = cols[1];
    const value = cols[2];
    const ttl = cols[3] ? Number.parseInt(cols[3], 10) : defaultTtl;
    const priority = cols[4] ? Number.parseInt(cols[4], 10) : undefined;
    const weight = cols[5] ? Number.parseInt(cols[5], 10) : undefined;
    const port = cols[6] ? Number.parseInt(cols[6], 10) : undefined;

    const draft: RecordDraftInput = {
      type,
      host,
      value,
      ttl: Number.isNaN(ttl) ? defaultTtl : ttl,
      priority: priority !== undefined && !Number.isNaN(priority) ? priority : undefined,
      weight: weight !== undefined && !Number.isNaN(weight) ? weight : undefined,
      port: port !== undefined && !Number.isNaN(port) ? port : undefined,
      tags: ['nhap-csv'],
      notes: '',
    };

    const err = validateRecordInput(draft);
    rows.push({
      lineNumber: index + 1,
      raw: rawLine,
      valid: !err,
      error: err || undefined,
      record: draft,
    });
  });

  return rows;
}

export function exportBindZoneFile(domainName: string, records: DnsRecord[], defaultTtl = 3600): string {
  const todaySerial = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01';
  const lines: string[] = [
    `; Tệp vùng BIND xuất từ Trạm Điều Khiển DNS`,
    `; Tên miền: ${domainName}`,
    `; Ngày xuất: ${new Date().toISOString()}`,
    `$ORIGIN ${domainName}.`,
    `$TTL ${defaultTtl}`,
    `@   ${defaultTtl}   IN  SOA   ns1.${domainName}. hostmaster.${domainName}. (`,
    `              ${todaySerial} ; Serial`,
    `              7200       ; Refresh`,
    `              1800       ; Retry`,
    `              1209600    ; Expire`,
    `              300 )      ; Minimum TTL`,
    ``,
  ];

  const sorted = [...records].sort((a, b) => a.type.localeCompare(b.type) || a.host.localeCompare(b.host));
  for (const r of sorted) {
    const hostPad = r.host.padEnd(20, ' ');
    const ttlPad = String(r.ttl).padEnd(7, ' ');
    const typePad = r.type.padEnd(8, ' ');
    let rdata = r.value;

    if (r.type === 'MX') {
      rdata = `${r.priority ?? 10} ${ensureTrailingDot(r.value)}`;
    } else if (r.type === 'SRV') {
      rdata = `${r.priority ?? 0} ${r.weight ?? 0} ${r.port ?? 0} ${ensureTrailingDot(r.value)}`;
    } else if (r.type === 'CAA') {
      rdata = `${r.caaFlags ?? 0} ${r.caaTag ?? 'issue'} "${r.value}"`;
    } else if (r.type === 'DS') {
      rdata = `${r.dsKeyTag ?? 0} ${r.dsAlgorithm ?? 13} ${r.dsDigestType ?? 2} ${r.value}`;
    } else if (r.type === 'SSHFP') {
      rdata = `${r.sshfpAlgorithm ?? 1} ${r.sshfpFingerprintType ?? 2} ${r.value}`;
    } else if (r.type === 'TLSA') {
      rdata = `${r.tlsaUsage ?? 3} ${r.tlsaSelector ?? 1} ${r.tlsaMatchingType ?? 1} ${r.value}`;
    } else if (r.type === 'TXT' || r.type === 'SPF') {
      rdata = r.value.startsWith('"') ? r.value : `"${r.value}"`;
    } else if (r.type === 'CNAME' || r.type === 'NS' || r.type === 'PTR' || r.type === 'ALIAS') {
      rdata = ensureTrailingDot(r.value);
    } else if ((r.type === 'HTTPS' || r.type === 'SVCB') && r.priority !== undefined) {
      rdata = `${r.priority} ${r.value}`;
    }

    lines.push(`${hostPad} ${ttlPad} IN  ${typePad} ${rdata}`);
  }

  return lines.join('\n');
}

function ensureTrailingDot(host: string): string {
  const trimmed = host.trim();
  if (!trimmed || trimmed === '.' || trimmed.endsWith('.')) return trimmed;
  return `${trimmed}.`;
}

export interface PagesPresetOptions {
  includeWww?: boolean;
  includeIpv6?: boolean;
  extraTxtValue?: string;
  ttl?: number;
}

export function buildPagesRecordsPreset(
  provider: Exclude<PagesProvider, 'none'>,
  rawTarget: string,
  domainName: string,
  options: PagesPresetOptions = {}
): { normalizedTarget: string; records: RecordDraftInput[]; notes: string; error?: string } {
  const ttl = Math.min(BLUEPRINT_LIMITS.TTL_MAX, Math.max(BLUEPRINT_LIMITS.TTL_MIN, Math.trunc(options.ttl || 3600)));
  const includeWww = options.includeWww !== false;
  const includeIpv6 = Boolean(options.includeIpv6);
  const extraTxt = (options.extraTxtValue || '').trim();
  const cleanTarget = rawTarget
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');

  const records: RecordDraftInput[] = [];

  if (provider === 'github') {
    const githubHost = cleanTarget
      ? cleanTarget.includes('.')
        ? cleanTarget
        : `${cleanTarget}.github.io`
      : '';

    const ipv4List = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
    for (const ip of ipv4List) {
      records.push({
        type: 'A',
        host: '@',
        value: ip,
        ttl,
        tags: ['pages', 'github-pages'],
        notes: 'IPv4 chuẩn cho GitHub Pages',
      });
    }

    if (includeIpv6) {
      const ipv6List = ['2606:50c0:8000::153', '2606:50c0:8001::153', '2606:50c0:8002::153', '2606:50c0:8003::153'];
      for (const ip6 of ipv6List) {
        records.push({
          type: 'AAAA',
          host: '@',
          value: ip6,
          ttl,
          tags: ['pages', 'github-pages'],
          notes: 'IPv6 chuẩn cho GitHub Pages',
        });
      }
    }

    if (includeWww) {
      if (!githubHost || !HOSTNAME_REGEX.test(githubHost)) {
        return {
          normalizedTarget: cleanTarget,
          records: [],
          notes: '',
          error: 'Vui lòng nhập tên tài khoản hoặc đích GitHub Pages (ví dụ: tenban.github.io).',
        };
      }
      records.push({
        type: 'CNAME',
        host: 'www',
        value: githubHost,
        ttl,
        tags: ['pages', 'github-pages'],
        notes: 'Chuyển hướng www về GitHub Pages',
      });
    }

    if (extraTxt) {
      records.push({
        type: 'TXT',
        host: `@`,
        value: extraTxt,
        ttl,
        tags: ['pages', 'github-pages', 'xac-thuc'],
        notes: 'Bản ghi TXT xác thực bổ sung cho GitHub Pages',
      });
    }

    return {
      normalizedTarget: githubHost || `${domainName} (A apex)`,
      records,
      notes: 'Bộ bản ghi GitHub Pages gồm 4 địa chỉ IPv4 apex' + (includeIpv6 ? ', 4 IPv6' : '') + (includeWww ? ` và CNAME www → ${githubHost}` : '') + '.',
    };
  }

  if (provider === 'cloudflare') {
    const cfHost = cleanTarget
      ? cleanTarget.includes('.')
        ? cleanTarget
        : `${cleanTarget}.pages.dev`
      : '';
    if (!cfHost || !HOSTNAME_REGEX.test(cfHost)) {
      return {
        normalizedTarget: cleanTarget,
        records: [],
        notes: '',
        error: 'Vui lòng nhập tên dự án hoặc tên miền đích Cloudflare Pages (ví dụ: du-an.pages.dev).',
      };
    }

    records.push({
      type: 'ALIAS',
      host: '@',
      value: cfHost,
      ttl,
      tags: ['pages', 'cloudflare-pages'],
      notes: 'Ánh xạ tên miền gốc (@) tới Cloudflare Pages',
    });

    if (includeWww) {
      records.push({
        type: 'CNAME',
        host: 'www',
        value: cfHost,
        ttl,
        tags: ['pages', 'cloudflare-pages'],
        notes: 'Ánh xạ www tới Cloudflare Pages',
      });
    }

    return {
      normalizedTarget: cfHost,
      records,
      notes: `Bộ bản ghi Cloudflare Pages trỏ @ (ALIAS)${includeWww ? ' và www (CNAME)' : ''} về ${cfHost}.`,
    };
  }

  if (provider === 'vercel') {
    records.push({
      type: 'A',
      host: '@',
      value: '76.76.21.21',
      ttl,
      tags: ['pages', 'vercel'],
      notes: 'IPv4 Anycast chuẩn cho Vercel',
    });

    if (includeWww) {
      records.push({
        type: 'CNAME',
        host: 'www',
        value: 'cname.vercel-dns.com',
        ttl,
        tags: ['pages', 'vercel'],
        notes: 'CNAME chuẩn cho Vercel',
      });
    }

    if (extraTxt) {
      records.push({
        type: 'TXT',
        host: '_vercel',
        value: extraTxt,
        ttl,
        tags: ['pages', 'vercel', 'xac-thuc'],
        notes: 'Mã TXT xác thực tên miền trên Vercel',
      });
    }

    return {
      normalizedTarget: cleanTarget || 'cname.vercel-dns.com',
      records,
      notes: `Bộ bản ghi Vercel gồm A apex 76.76.21.21${includeWww ? ', CNAME www → cname.vercel-dns.com' : ''}${extraTxt ? ' và TXT _vercel' : ''}.`,
    };
  }

  // Firebase Hosting
  const siteId = cleanTarget
    .replace(/\.web\.app$/, '')
    .replace(/\.firebaseapp\.com$/, '');
  if (!siteId || !/^[a-z0-9-]+$/.test(siteId)) {
    return {
      normalizedTarget: cleanTarget,
      records: [],
      notes: '',
      error: 'Vui lòng nhập Firebase Hosting Site ID hợp lệ (ví dụ: my-site hoặc my-site.web.app).',
    };
  }

  records.push({
    type: 'A',
    host: '@',
    value: '199.36.158.100',
    ttl,
    tags: ['pages', 'firebase-hosting'],
    notes: 'IPv4 chuẩn cho Firebase Hosting',
  });

  if (includeWww) {
    records.push({
      type: 'A',
      host: 'www',
      value: '199.36.158.100',
      ttl,
      tags: ['pages', 'firebase-hosting'],
      notes: 'IPv4 chuẩn www cho Firebase Hosting',
    });
  }

  records.push({
    type: 'TXT',
    host: '@',
    value: extraTxt || `hosting-site=${siteId}`,
    ttl,
    tags: ['pages', 'firebase-hosting', 'xac-thuc'],
    notes: 'TXT xác thực dự án Firebase Hosting',
  });

  return {
    normalizedTarget: `${siteId}.web.app`,
    records,
    notes: `Bộ bản ghi Firebase Hosting gồm A 199.36.158.100 và TXT hosting-site=${siteId}.`,
  };
}
