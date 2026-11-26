import { readFile } from 'node:fs/promises';

export interface ParsedSoaRecord {
  primaryNs: string;
  hostmaster: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minimumTtl: number;
}

export interface DbDnsRecordRow {
  domain_id?: string;
  host: string;
  fqdn: string;
  record_class: 'IN';
  type: string;
  ttl: number;
  value: string;
  priority: number | null;
  weight: number | null;
  port: number | null;
  metadata: Record<string, unknown>;
}

export interface BindParseError {
  line: number;
  raw: string;
  reason: string;
}

export interface BindParseResult {
  origin: string | null;
  defaultTtl: number;
  soa: ParsedSoaRecord | null;
  records: DbDnsRecordRow[];
  errors: BindParseError[];
}

const SUPPORTED_TYPES = new Set([
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'NS',
  'PTR',
  'SRV',
  'CAA',
  'SPF',
  'SOA',
  'ALIAS',
  'DS',
  'HINFO',
  'HTTPS',
  'NAPTR',
  'RP',
  'SSHFP',
  'SVCB',
  'TLSA',
]);

const DNS_CLASSES = new Set(['IN', 'CH', 'HS']);

/**
 * Loai bo chu thich BIND (;) nhung giu nguyen dau ; nam trong dau ngoac kep "...".
 */
function stripBindComment(line: string): string {
  let inQuotes = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ';' && !inQuotes) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Chuyen doi chuoi thoi gian BIND (vi du: 1h, 1d, 30m, 3600) sang so giay.
 */
function parseBindTtl(token: string): number | null {
  if (/^\d+$/.test(token)) {
    return Number.parseInt(token, 10);
  }
  const match = token.match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  const num = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };
  return num * (multipliers[unit] ?? 1);
}

/**
 * Tach dong BIND thanh cac token, giu nguyen chuoi trong ngoac kep.
 */
function tokenizeBindLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function normalizeHostAndFqdn(
  rawOwner: string,
  origin: string | null
): { host: string; fqdn: string } {
  const cleanOrigin = origin ? origin.replace(/\.$/, '').toLowerCase() : null;
  if (rawOwner === '@') {
    return { host: '@', fqdn: cleanOrigin || '@' };
  }
  if (rawOwner.endsWith('.')) {
    const fqdn = rawOwner.slice(0, -1).toLowerCase();
    if (cleanOrigin && fqdn === cleanOrigin) {
      return { host: '@', fqdn };
    }
    if (cleanOrigin && fqdn.endsWith(`.${cleanOrigin}`)) {
      return { host: fqdn.slice(0, -(cleanOrigin.length + 1)), fqdn };
    }
    return { host: fqdn, fqdn };
  }
  const fqdn = cleanOrigin ? `${rawOwner.toLowerCase()}.${cleanOrigin}` : rawOwner.toLowerCase();
  return { host: rawOwner.toLowerCase(), fqdn };
}

/**
 * Gop cac dong nam trong cap ngoac don (...) (thuong dung trong ban ghi SOA hoac TXT nhieu dong).
 */
function collapseParenthesizedLines(rawContent: string): Array<{ startLine: number; text: string }> {
  const rawLines = rawContent.split(/\r?\n/);
  const logicalLines: Array<{ startLine: number; text: string }> = [];

  let buffer = '';
  let startLine = 1;
  let parenDepth = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const stripped = stripBindComment(rawLines[i]);
    if (!buffer && !stripped.trim()) continue;

    if (!buffer) {
      startLine = i + 1;
    }

    let inQuotes = false;
    for (let j = 0; j < stripped.length; j++) {
      const ch = stripped[j];
      if (ch === '"' && stripped[j - 1] !== '\\') inQuotes = !inQuotes;
      if (!inQuotes) {
        if (ch === '(') parenDepth++;
        else if (ch === ')' && parenDepth > 0) parenDepth--;
      }
    }

    const cleanedChunk = stripped.replace(/[()]/g, ' ').trimEnd();
    buffer = buffer ? `${buffer} ${cleanedChunk.trim()}` : cleanedChunk;

    if (parenDepth === 0) {
      if (buffer.trim()) {
        logicalLines.push({ startLine, text: buffer });
      }
      buffer = '';
    }
  }

  if (buffer.trim()) {
    logicalLines.push({ startLine, text: buffer });
  }

  return logicalLines;
}

/**
 * Phan tich noi dung tep vung BIND thanh cau truc JSON tuong thich DB.
 */
export function parseBindZoneToJson(
  zoneContent: string,
  options: { origin?: string; defaultTtl?: number; domainId?: string } = {}
): BindParseResult {
  let origin: string | null = options.origin ? options.origin.replace(/\.$/, '').toLowerCase() : null;
  let defaultTtl = options.defaultTtl ?? 3600;
  let lastOwner = '@';
  let soa: ParsedSoaRecord | null = null;
  const records: DbDnsRecordRow[] = [];
  const errors: BindParseError[] = [];

  const logicalLines = collapseParenthesizedLines(zoneContent);

  for (const { startLine, text } of logicalLines) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('$ORIGIN')) {
      const arg = trimmed.split(/\s+/)[1];
      if (arg) origin = arg.replace(/\.$/, '').toLowerCase();
      continue;
    }

    if (trimmed.startsWith('$TTL')) {
      const arg = trimmed.split(/\s+/)[1];
      const parsedTtl = arg ? parseBindTtl(arg) : null;
      if (parsedTtl !== null) defaultTtl = parsedTtl;
      continue;
    }

    // Kiem tra dong bat dau bang khoang trang -> ke thua owner cua dong truoc
    const startsWithWhitespace = /^\s/.test(text);
    const tokens = tokenizeBindLine(trimmed);
    if (tokens.length < 2) {
      errors.push({ line: startLine, raw: trimmed, reason: 'Dong ban ghi khong du thanh phan.' });
      continue;
    }

    let idx = 0;
    let rawOwner = lastOwner;
    if (!startsWithWhitespace) {
      const firstUpper = tokens[0].toUpperCase();
      const maybeTtl = parseBindTtl(tokens[0]);
      if (!DNS_CLASSES.has(firstUpper) && maybeTtl === null && !SUPPORTED_TYPES.has(firstUpper)) {
        rawOwner = tokens[idx++];
        lastOwner = rawOwner;
      }
    }

    let ttl = defaultTtl;
    let recordClass: 'IN' = 'IN';

    // Doc TTL va Class theo bat ky thu tu nao (IN 3600 hoac 3600 IN)
    for (let step = 0; step < 2 && idx < tokens.length; step++) {
      const tok = tokens[idx];
      const maybeTtl = parseBindTtl(tok);
      if (maybeTtl !== null) {
        ttl = maybeTtl;
        idx++;
      } else if (DNS_CLASSES.has(tok.toUpperCase())) {
        recordClass = 'IN';
        idx++;
      }
    }

    const typeToken = tokens[idx++]?.toUpperCase();
    if (!typeToken || !SUPPORTED_TYPES.has(typeToken)) {
      errors.push({
        line: startLine,
        raw: trimmed,
        reason: `Loai ban ghi khong hop le hoac chua ho tro: ${typeToken || 'trong'}`,
      });
      continue;
    }

    const rdata = tokens.slice(idx);
    if (rdata.length === 0) {
      errors.push({ line: startLine, raw: trimmed, reason: 'Thieu du lieu gia tri (RDATA).' });
      continue;
    }

    if (typeToken === 'SOA') {
      if (rdata.length >= 7) {
        soa = {
          primaryNs: rdata[0].replace(/\.$/, '').toLowerCase(),
          hostmaster: rdata[1].replace(/\.$/, '').toLowerCase(),
          serial: Number.parseInt(rdata[2], 10) || 0,
          refresh: parseBindTtl(rdata[3]) ?? 7200,
          retry: parseBindTtl(rdata[4]) ?? 1800,
          expire: parseBindTtl(rdata[5]) ?? 1209600,
          minimumTtl: parseBindTtl(rdata[6]) ?? 300,
        };
      }
      continue;
    }

    const { host, fqdn } = normalizeHostAndFqdn(rawOwner, origin);
    const row: DbDnsRecordRow = {
      ...(options.domainId ? { domain_id: options.domainId } : {}),
      host,
      fqdn,
      record_class: recordClass,
      type: typeToken,
      ttl,
      value: rdata.map(unquote).join(' '),
      priority: null,
      weight: null,
      port: null,
      metadata: {},
    };

    if (typeToken === 'MX') {
      if (rdata.length < 2 || !/^\d+$/.test(rdata[0])) {
        errors.push({ line: startLine, raw: trimmed, reason: 'Ban ghi MX thieu do uu tien (priority).' });
        continue;
      }
      row.priority = Number.parseInt(rdata[0], 10);
      row.value = rdata.slice(1).join(' ').replace(/\.$/, '').toLowerCase();
    } else if (typeToken === 'SRV') {
      if (rdata.length < 4) {
        errors.push({ line: startLine, raw: trimmed, reason: 'Ban ghi SRV yeu cau priority, weight, port va target.' });
        continue;
      }
      row.priority = Number.parseInt(rdata[0], 10);
      row.weight = Number.parseInt(rdata[1], 10);
      row.port = Number.parseInt(rdata[2], 10);
      row.value = rdata.slice(3).join(' ').replace(/\.$/, '').toLowerCase();
    } else if (typeToken === 'CAA' && rdata.length >= 3) {
      row.metadata = {
        flags: Number.parseInt(rdata[0], 10),
        tag: rdata[1],
      };
      row.value = unquote(rdata.slice(2).join(' '));
    } else if (typeToken === 'TXT' || typeToken === 'SPF') {
      row.value = rdata.map(unquote).join('');
    } else if (['CNAME', 'NS', 'PTR', 'ALIAS'].includes(typeToken)) {
      row.value = rdata[0].replace(/\.$/, '').toLowerCase();
    }

    records.push(row);
  }

  return { origin, defaultTtl, soa, records, errors };
}

/**
 * Doc truc tiep tep BIND zone tu o dia trong Node.js va tra ve ket qua JSON.
 */
export async function parseBindZoneFileFromDisk(
  filePath: string,
  options: { origin?: string; defaultTtl?: number; domainId?: string } = {}
): Promise<BindParseResult> {
  const content = await readFile(filePath, 'utf8');
  return parseBindZoneToJson(content, options);
}
