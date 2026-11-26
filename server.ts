import express from 'express';
import crypto from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const FQDN_REGEX = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HOST_FQDN_REGEX = /^([a-z0-9_*]([a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z]{2,63}$/;

const PUBLIC_RESOLVER = new Resolver();
PUBLIC_RESOLVER.setServers(['1.1.1.1', '8.8.8.8']);

const CLOUD_TAKEOVER_SIGNATURES: Array<{ suffix: string; provider: string }> = [
  { suffix: '.github.io', provider: 'GitHub Pages' },
  { suffix: '.herokuapp.com', provider: 'Heroku' },
  { suffix: '.herokudns.com', provider: 'Heroku' },
  { suffix: '.s3.amazonaws.com', provider: 'Amazon S3' },
  { suffix: '.s3-website', provider: 'Amazon S3 Website' },
  { suffix: '.azurewebsites.net', provider: 'Microsoft Azure App Service' },
  { suffix: '.cloudapp.net', provider: 'Microsoft Azure' },
  { suffix: '.cloudfront.net', provider: 'Amazon CloudFront' },
  { suffix: '.netlify.app', provider: 'Netlify' },
  { suffix: '.vercel.app', provider: 'Vercel' },
  { suffix: '.pages.dev', provider: 'Cloudflare Pages' },
  { suffix: '.ghost.io', provider: 'Ghost' },
  { suffix: '.myshopify.com', provider: 'Shopify' },
  { suffix: '.bitbucket.io', provider: 'Bitbucket Pages' },
];

const DNS_TYPE_CODES: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  HINFO: 13,
  MX: 15,
  TXT: 16,
  RP: 17,
  AAAA: 28,
  SRV: 33,
  NAPTR: 35,
  DS: 43,
  SSHFP: 44,
  TLSA: 52,
  SVCB: 64,
  HTTPS: 65,
  SPF: 99,
  CAA: 257,
};

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

async function queryDoh(fqdn: string, type: string): Promise<{ status: number; answers: DohAnswer[]; latencyMs: number }> {
  const started = performance.now();
  const typeParam = DNS_TYPE_CODES[type] ? String(DNS_TYPE_CODES[type]) : encodeURIComponent(type);
  const url = `https://dns.google/resolve?name=${encodeURIComponent(fqdn)}&type=${typeParam}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as DohResponse;
    return {
      status: json.Status ?? -1,
      answers: json.Answer ?? [],
      latencyMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFqdn(host: string, domain: string): string {
  const cleanHost = host.trim().toLowerCase().replace(/\.$/, '');
  const cleanDomain = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!cleanHost || cleanHost === '@') return cleanDomain;
  if (cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`)) {
    return cleanHost;
  }
  return `${cleanHost}.${cleanDomain}`;
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function normalizeAnswerValue(val: string): string {
  return val.trim().toLowerCase().replace(/^"|"$/g, '').replace(/\.$/, '');
}

async function resolveRecordValues(fqdn: string, type: string): Promise<{ values: string[]; dohStatus: number }> {
  const queryType = type === 'ALIAS' ? 'A' : type === 'SPF' ? 'TXT' : type;
  try {
    if (queryType === 'A') {
      const ips = await PUBLIC_RESOLVER.resolve4(fqdn);
      return { values: ips, dohStatus: 0 };
    }
    if (queryType === 'AAAA') {
      const ips = await PUBLIC_RESOLVER.resolve6(fqdn);
      return { values: ips, dohStatus: 0 };
    }
    if (queryType === 'CNAME') {
      const cnames = await PUBLIC_RESOLVER.resolveCname(fqdn);
      return { values: cnames, dohStatus: 0 };
    }
    if (queryType === 'NS') {
      const ns = await PUBLIC_RESOLVER.resolveNs(fqdn);
      return { values: ns, dohStatus: 0 };
    }
    if (queryType === 'MX') {
      const mx = await PUBLIC_RESOLVER.resolveMx(fqdn);
      return { values: mx.map((item) => `${item.priority} ${item.exchange}`), dohStatus: 0 };
    }
    if (queryType === 'TXT') {
      const txt = await PUBLIC_RESOLVER.resolveTxt(fqdn);
      return { values: txt.map((chunks) => chunks.join('')), dohStatus: 0 };
    }
    if (queryType === 'CAA') {
      const caa = await PUBLIC_RESOLVER.resolveCaa(fqdn);
      return {
        values: caa.map((c) => {
          const tag = c.issue ? 'issue' : c.issuewild ? 'issuewild' : c.iodef ? 'iodef' : 'unknown';
          const val = c.issue || c.issuewild || c.iodef || '';
          return `${c.critical ?? 0} ${tag} "${val}"`;
        }),
        dohStatus: 0,
      };
    }
    if (queryType === 'SRV') {
      const srv = await PUBLIC_RESOLVER.resolveSrv(fqdn);
      return { values: srv.map((s) => `${s.priority} ${s.weight} ${s.port} ${s.name}`), dohStatus: 0 };
    }
    if (queryType === 'PTR') {
      const ptr = await PUBLIC_RESOLVER.resolvePtr(fqdn);
      return { values: ptr, dohStatus: 0 };
    }
    if (queryType === 'NAPTR') {
      const naptr = await PUBLIC_RESOLVER.resolveNaptr(fqdn);
      return {
        values: naptr.map((n) => `${n.order} ${n.preference} "${n.flags}" "${n.service}" "${n.regexp}" ${n.replacement}`),
        dohStatus: 0,
      };
    }
  } catch {
    // Fallback sang DoH bên dưới để nhận biết chính xác NXDOMAIN / các loại nâng cao
  }

  try {
    const doh = await queryDoh(fqdn, queryType);
    const typeCode = DNS_TYPE_CODES[queryType];
    const filtered = typeCode ? doh.answers.filter((a) => a.type === typeCode) : doh.answers;
    return {
      values: filtered.map((a) => a.data),
      dohStatus: doh.status,
    };
  } catch {
    return { values: [], dohStatus: -1 };
  }
}

const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const OAUTH_STATE_SECRET = process.env.OAUTH_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface GitHubSession {
  accessToken: string;
  login: string;
  name: string;
  avatarUrl: string;
  createdAt: number;
}

interface LiveReviewSnapshot {
  reviewId: string;
  repoFullName: string;
  branch: string;
  sourceDir: string;
  commitSha: string;
  domainName: string;
  files: Map<string, { content: Buffer; contentType: string }>;
  createdAt: number;
}

const githubSessions = new Map<string, GitHubSession>();
const liveReviewSnapshots = new Map<string, LiveReviewSnapshot>();

function getGitHubCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: (process.env.GITHUB_CLIENT_ID || '').trim(),
    clientSecret: (process.env.GITHUB_CLIENT_SECRET || '').trim(),
  };
}

function getAppBaseUrl(req: express.Request): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\/.+/.test(envUrl)) {
    return envUrl;
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = typeof protoHeader === 'string' ? protoHeader.split(',')[0].trim() : req.protocol || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  const host = typeof hostHeader === 'string' ? hostHeader.split(',')[0].trim() : `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function signOAuthState(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = String(Date.now());
  const payload = `${nonce}.${issuedAt}`;
  const sig = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyOAuthState(raw: string): boolean {
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const [nonce, issuedAtStr, sigHex] = parts;
  if (!nonce || !issuedAtStr || !sigHex) return false;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 15 * 60 * 1000) {
    return false;
  }
  const payload = `${nonce}.${issuedAtStr}`;
  const expectedHex = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(payload).digest('hex');
  const sigBuf = Buffer.from(sigHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (sigBuf.length !== expectedBuf.length || sigBuf.length === 0) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

function getGitHubSessionFromReq(req: express.Request): { sid: string; session: GitHubSession } | null {
  const headerSid =
    typeof req.headers['x-github-session'] === 'string' ? req.headers['x-github-session'].trim() : '';
  const cookieSid = parseCookieValue(req.headers.cookie, 'gh_sid') || '';
  const sid = headerSid || cookieSid;
  if (!sid) return null;
  const session = githubSessions.get(sid);
  if (!session) return null;
  if (Date.now() - session.createdAt > 12 * 60 * 60 * 1000) {
    githubSessions.delete(sid);
    return null;
  }
  return { sid, session };
}

function verifyMutationCsrf(req: express.Request): boolean {
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || '');
    const appUrlHost = (() => {
      const envUrl = (process.env.APP_URL || '').trim();
      if (envUrl && /^https?:\/\//.test(envUrl)) return new URL(envUrl).host;
      return '';
    })();
    return originHost === hostHeader || (Boolean(appUrlHost) && originHost === appUrlHost);
  } catch {
    return false;
  }
}

function getStaticMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.xml':
      return 'application/xml; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

async function githubApiFetch<T>(
  endpointPath: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`https://api.github.com${endpointPath}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'DNS-Control-Plane-Pages-Deployer',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/dns/lookup', async (req, res) => {
    try {
      const fqdnRaw = typeof req.body?.fqdn === 'string' ? req.body.fqdn.trim().toLowerCase().replace(/\.$/, '') : '';
      const typeRaw = typeof req.body?.type === 'string' ? req.body.type.trim().toUpperCase() : 'A';
      if (!fqdnRaw || !HOST_FQDN_REGEX.test(fqdnRaw)) {
        res.status(400).json({ error: 'Tên miền tra cứu không hợp lệ.' });
        return;
      }
      const doh = await queryDoh(fqdnRaw, typeRaw);
      res.json({
        fqdn: fqdnRaw,
        type: typeRaw,
        status: doh.status,
        latencyMs: doh.latencyMs,
        answers: doh.answers.map((a) => ({
          name: a.name,
          ttl: a.TTL,
          data: a.data,
        })),
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Không thể thực hiện truy vấn DNS trực tuyến.',
      });
    }
  });

  app.post('/api/dns/health', async (req, res) => {
    try {
      const domainRaw = typeof req.body?.domain === 'string' ? req.body.domain.trim().toLowerCase().replace(/\.$/, '') : '';
      const records = Array.isArray(req.body?.records) ? req.body.records.slice(0, 100) : [];

      if (!FQDN_REGEX.test(domainRaw)) {
        res.status(400).json({ error: 'Tên miền không đúng định dạng FQDN.' });
        return;
      }

      const started = performance.now();

      let nameservers: string[] = [];
      try {
        nameservers = await PUBLIC_RESOLVER.resolveNs(domainRaw);
      } catch {
        const dohNs = await queryDoh(domainRaw, 'NS').catch(() => ({ answers: [] as DohAnswer[] }));
        nameservers = dohNs.answers.map((a) => a.data.replace(/\.$/, ''));
      }

      let soa: {
        nsname: string;
        hostmaster: string;
        serial: number;
        refresh: number;
        retry: number;
        expire: number;
        minttl: number;
      } | null = null;
      try {
        soa = await PUBLIC_RESOLVER.resolveSoa(domainRaw);
      } catch {
        soa = null;
      }

      const recordChecks = await Promise.all(
        records.map(async (rec: { id?: string; type?: string; host?: string; value?: string; priority?: number }) => {
          const recId = String(rec.id || '');
          const recType = String(rec.type || 'A').toUpperCase();
          const recHost = String(rec.host || '@');
          const fqdn = normalizeFqdn(recHost, domainRaw);
          const expectedRaw =
            recType === 'MX' && typeof rec.priority === 'number'
              ? `${rec.priority} ${rec.value || ''}`
              : String(rec.value || '');

          if (fqdn.includes('*')) {
            return {
              id: recId,
              fqdn,
              type: recType,
              configuredValue: expectedRaw,
              liveValues: [],
              status: 'unsupported' as const,
              message: 'Bản ghi ký tự đại diện (*) không thể kiểm tra đối chiếu trực tiếp.',
            };
          }

          const { values, dohStatus } = await resolveRecordValues(fqdn, recType);
          const normExpected = normalizeAnswerValue(expectedRaw);
          const normExpectedNoPrio = normalizeAnswerValue(String(rec.value || ''));

          if (values.length === 0) {
            return {
              id: recId,
              fqdn,
              type: recType,
              configuredValue: expectedRaw,
              liveValues: [],
              status: 'missing' as const,
              message:
                dohStatus === 3
                  ? 'Tên miền phụ chưa tồn tại trên hệ thống phân giải thực tế (NXDOMAIN).'
                  : 'Chưa ghi nhận phản hồi phân giải thực tế cho bản ghi này.',
            };
          }

          const matched = values.some((v) => {
            const nv = normalizeAnswerValue(v);
            return nv === normExpected || nv === normExpectedNoPrio || nv.includes(normExpectedNoPrio);
          });

          return {
            id: recId,
            fqdn,
            type: recType,
            configuredValue: expectedRaw,
            liveValues: values,
            status: matched ? ('matched' as const) : ('mismatch' as const),
            message: matched
              ? 'Giá trị thực tế trùng khớp với cấu hình đã khai báo.'
              : 'Giá trị phân giải thực tế đang khác với giá trị khai báo trong bảng.',
          };
        })
      );

      const latencyMs = Math.round(performance.now() - started);
      const hasNs = nameservers.length > 0;
      const missingCount = recordChecks.filter((r) => r.status === 'missing').length;
      const mismatchCount = recordChecks.filter((r) => r.status === 'mismatch').length;

      let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      let summary = 'Ủy quyền NS, bản ghi SOA và các bản ghi được kiểm tra đều hoạt động bình thường.';

      if (!hasNs) {
        overallStatus = 'critical';
        summary = 'Không tìm thấy máy chủ tên miền (NS) ủy quyền ngoài Internet cho tên miền này.';
      } else if (mismatchCount > 0 || missingCount > 0) {
        overallStatus = 'warning';
        summary = `Phát hiện ${mismatchCount} bản ghi lệch giá trị và ${missingCount} bản ghi chưa phân giải thực tế.`;
      } else if (records.length === 0) {
        overallStatus = soa ? 'healthy' : 'warning';
        summary = soa
          ? `Ủy quyền hợp lệ với ${nameservers.length} máy chủ NS. Chưa có bản ghi nào để đối chiếu.`
          : 'Đã thấy bản ghi NS nhưng chưa truy vấn được bản ghi SOA.';
      }

      res.json({
        domain: domainRaw,
        checkedAt: new Date().toISOString(),
        latencyMs,
        overallStatus,
        summary,
        nameservers,
        soa,
        recordChecks,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi khi kiểm tra sức khỏe DNS.',
      });
    }
  });

  app.post('/api/dns/dangling', async (req, res) => {
    try {
      const domainRaw = typeof req.body?.domain === 'string' ? req.body.domain.trim().toLowerCase().replace(/\.$/, '') : '';
      const records = Array.isArray(req.body?.records) ? req.body.records.slice(0, 100) : [];

      if (!FQDN_REGEX.test(domainRaw)) {
        res.status(400).json({ error: 'Tên miền không đúng định dạng FQDN.' });
        return;
      }

      const targetRecords = records.filter((r: { type?: string }) =>
        ['CNAME', 'ALIAS', 'A', 'AAAA', 'MX', 'NS'].includes(String(r.type || '').toUpperCase())
      );

      const findings = await Promise.all(
        targetRecords.map(async (rec: { id?: string; type?: string; host?: string; value?: string }) => {
          const recId = String(rec.id || '');
          const recType = String(rec.type || '').toUpperCase();
          const recHost = String(rec.host || '@');
          const fqdn = normalizeFqdn(recHost, domainRaw);
          const target = String(rec.value || '').trim().toLowerCase().replace(/\.$/, '');

          if (recType === 'A') {
            if (isPrivateOrReservedIpv4(target)) {
              return {
                id: recId,
                fqdn,
                type: recType,
                target,
                risk: 'warning' as const,
                reason: 'Địa chỉ IPv4 thuộc dải mạng nội bộ/dành riêng (RFC 1918), không thể truy cập từ Internet.',
              };
            }
            return {
              id: recId,
              fqdn,
              type: recType,
              target,
              risk: 'safe' as const,
              reason: 'Địa chỉ IPv4 công cộng hợp lệ.',
            };
          }

          if (recType === 'AAAA') {
            const isLocalV6 = target === '::1' || target.startsWith('fc') || target.startsWith('fd') || target.startsWith('fe80');
            return {
              id: recId,
              fqdn,
              type: recType,
              target,
              risk: isLocalV6 ? ('warning' as const) : ('safe' as const),
              reason: isLocalV6 ? 'Địa chỉ IPv6 nội bộ/link-local không định tuyến công cộng.' : 'Địa chỉ IPv6 công cộng hợp lệ.',
            };
          }

          // Kiểm tra CNAME, ALIAS, MX, NS trỏ tới tên miền đích
          if (!target || target.includes(' ')) {
            return {
              id: recId,
              fqdn,
              type: recType,
              target,
              risk: 'warning' as const,
              reason: 'Giá trị đích không phải là tên miền hợp lệ.',
            };
          }

          const cloudMatch = CLOUD_TAKEOVER_SIGNATURES.find((sig) => target.endsWith(sig.suffix) || target.includes(sig.suffix));
          const { values, dohStatus } = await resolveRecordValues(target, 'A');
          const v6 = values.length === 0 ? await resolveRecordValues(target, 'AAAA') : { values: [], dohStatus: 0 };

          if (values.length === 0 && v6.values.length === 0) {
            if (cloudMatch) {
              return {
                id: recId,
                fqdn,
                type: recType,
                target,
                risk: 'high_risk' as const,
                reason: `Đích trỏ tới ${cloudMatch.provider} (${target}) không phân giải được (${dohStatus === 3 ? 'NXDOMAIN' : 'Không có bản ghi A/AAAA'}), có nguy cơ bị chiếm quyền tên miền phụ.`,
              };
            }
            return {
              id: recId,
              fqdn,
              type: recType,
              target,
              risk: 'dangling' as const,
              reason: `Tên miền đích (${target}) không trả về địa chỉ IP (${dohStatus === 3 ? 'NXDOMAIN' : 'Không phân giải được'}).`,
            };
          }

          return {
            id: recId,
            fqdn,
            type: recType,
            target,
            risk: 'safe' as const,
            reason: `Tên miền đích phân giải bình thường (${[...values, ...v6.values].slice(0, 2).join(', ')}).`,
          };
        })
      );

      res.json({
        domain: domainRaw,
        scannedAt: new Date().toISOString(),
        totalScanned: findings.length,
        highRiskCount: findings.filter((f) => f.risk === 'high_risk').length,
        danglingCount: findings.filter((f) => f.risk === 'dangling' || f.risk === 'warning').length,
        findings,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi khi quét bản ghi lơ lửng.',
      });
    }
  });

  app.post('/api/dns/verify-txt', async (req, res) => {
    try {
      const domainRaw =
        typeof req.body?.domain === 'string' ? req.body.domain.trim().toLowerCase().replace(/\.$/, '') : '';
      const tokenRaw = typeof req.body?.token === 'string' ? req.body.token.trim() : '';

      if (!FQDN_REGEX.test(domainRaw)) {
        res.status(400).json({ error: 'Tên miền không đúng định dạng FQDN.' });
        return;
      }
      if (tokenRaw.length < 12 || tokenRaw.length > 64) {
        res.status(400).json({ error: 'Mã xác thực TXT không hợp lệ (cần từ 12 đến 64 ký tự).' });
        return;
      }

      const started = performance.now();
      const checkedHosts = [`_dns-verify.${domainRaw}`, domainRaw];
      const hostResults = await Promise.all(
        checkedHosts.map(async (host) => {
          const { values } = await resolveRecordValues(host, 'TXT');
          const normalized = values.map((v) => v.trim().replace(/^"|"$/g, ''));
          return { host, values: normalized };
        })
      );

      let matchedHost: string | null = null;
      const foundSet = new Set<string>();
      for (const item of hostResults) {
        for (const val of item.values) {
          if (val) foundSet.add(val);
          if (!matchedHost && (val === tokenRaw || val.includes(tokenRaw))) {
            matchedHost = item.host;
          }
        }
      }

      const latencyMs = Math.round(performance.now() - started);
      res.json({
        domain: domainRaw,
        token: tokenRaw,
        verified: Boolean(matchedHost),
        matchedHost,
        checkedHosts,
        foundTxtValues: Array.from(foundSet).slice(0, 12),
        latencyMs,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi khi xác thực bản ghi TXT trực tiếp.',
      });
    }
  });

  const REGIONAL_CLUSTER_NODES: Array<{
    id: string;
    region: 'bac' | 'trung' | 'nam';
    city: string;
    label: string;
    role: string;
    resolverIp: string;
    dohFallback: 'google' | 'cloudflare';
  }> = [
    {
      id: 'hanoi-core',
      region: 'bac',
      city: 'Hà Nội',
      label: 'Cụm Lõi Miền Bắc (Hà Nội)',
      role: 'Anycast Core · VNIX Bắc',
      resolverIp: '8.8.8.8',
      dohFallback: 'google',
    },
    {
      id: 'haiphong-edge',
      region: 'bac',
      city: 'Hải Phòng',
      label: 'Cụm Biên Duyên Hải (Hải Phòng)',
      role: 'Edge Resolver · Cửa ngõ Đông Bắc',
      resolverIp: '1.1.1.1',
      dohFallback: 'cloudflare',
    },
    {
      id: 'danang-relay',
      region: 'trung',
      city: 'Đà Nẵng',
      label: 'Cụm Trung Chuyển (Đà Nẵng)',
      role: 'Regional Relay · Trục cáp Miền Trung',
      resolverIp: '8.8.4.4',
      dohFallback: 'google',
    },
    {
      id: 'quynhon-pop',
      region: 'trung',
      city: 'Quy Nhơn',
      label: 'Cụm PoP Nam Trung Bộ (Quy Nhơn)',
      role: 'Edge PoP · Duyên hải Nam Trung Bộ',
      resolverIp: '1.0.0.1',
      dohFallback: 'cloudflare',
    },
    {
      id: 'hcm-core',
      region: 'nam',
      city: 'TP. Hồ Chí Minh',
      label: 'Cụm Lõi Miền Nam (TP. HCM)',
      role: 'Anycast Core · VNIX Nam',
      resolverIp: '9.9.9.9',
      dohFallback: 'cloudflare',
    },
    {
      id: 'cantho-edge',
      region: 'nam',
      city: 'Cần Thơ',
      label: 'Cụm Biên ĐBSCL (Cần Thơ)',
      role: 'Edge Resolver · Tây Nam Bộ',
      resolverIp: '208.67.222.222',
      dohFallback: 'google',
    },
  ];

  async function probeRegionalNode(
    fqdn: string,
    type: string,
    node: (typeof REGIONAL_CLUSTER_NODES)[number]
  ): Promise<{
    id: string;
    region: 'bac' | 'trung' | 'nam';
    city: string;
    label: string;
    resolverIp: string;
    status: 'resolved' | 'empty' | 'error';
    values: string[];
    latencyMs: number;
    source: string;
  }> {
    const started = performance.now();
    const resolver = new Resolver();
    resolver.setServers([node.resolverIp]);

    const resolveViaUdp = async (): Promise<string[]> => {
      if (type === 'A') return resolver.resolve4(fqdn);
      if (type === 'AAAA') return resolver.resolve6(fqdn);
      if (type === 'CNAME') return resolver.resolveCname(fqdn);
      if (type === 'NS') return resolver.resolveNs(fqdn);
      if (type === 'MX') {
        const mx = await resolver.resolveMx(fqdn);
        return mx.map((m) => `${m.priority} ${m.exchange}`);
      }
      if (type === 'TXT') {
        const txt = await resolver.resolveTxt(fqdn);
        return txt.map((parts) => parts.join(''));
      }
      return resolver.resolve4(fqdn);
    };

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2200)
      );
      const values = await Promise.race([resolveViaUdp(), timeoutPromise]);
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      return {
        id: node.id,
        region: node.region,
        city: node.city,
        label: node.label,
        resolverIp: node.resolverIp,
        status: values.length > 0 ? 'resolved' : 'empty',
        values,
        latencyMs,
        source: `DNS ${node.resolverIp}`,
      };
    } catch {
      try {
        const doh = await queryDoh(fqdn, type);
        const typeCode = DNS_TYPE_CODES[type];
        const filtered = typeCode ? doh.answers.filter((a) => a.type === typeCode) : doh.answers;
        const values = filtered.map((a) => a.data.replace(/^"|"$/g, ''));
        const latencyMs = Math.max(1, Math.round(performance.now() - started));
        return {
          id: node.id,
          region: node.region,
          city: node.city,
          label: node.label,
          resolverIp: node.resolverIp,
          status: values.length > 0 ? 'resolved' : 'empty',
          values,
          latencyMs,
          source: node.dohFallback === 'cloudflare' ? 'DoH Relay' : 'DoH Google',
        };
      } catch {
        const latencyMs = Math.max(1, Math.round(performance.now() - started));
        return {
          id: node.id,
          region: node.region,
          city: node.city,
          label: node.label,
          resolverIp: node.resolverIp,
          status: 'error',
          values: [],
          latencyMs,
          source: node.resolverIp,
        };
      }
    }
  }

  app.post('/api/dns/regional-check', async (req, res) => {
    try {
      const fqdnRaw =
        typeof req.body?.fqdn === 'string' ? req.body.fqdn.trim().toLowerCase().replace(/\.$/, '') : '';
      const typeRaw = typeof req.body?.type === 'string' ? req.body.type.trim().toUpperCase() : 'A';

      if (!fqdnRaw || !HOST_FQDN_REGEX.test(fqdnRaw)) {
        res.status(400).json({ error: 'Tên miền kiểm tra khu vực không hợp lệ.' });
        return;
      }

      const allowedTypes = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']);
      const safeType = allowedTypes.has(typeRaw) ? typeRaw : 'A';
      const nodes = await Promise.all(
        REGIONAL_CLUSTER_NODES.map((node) => probeRegionalNode(fqdnRaw, safeType, node))
      );

      res.json({
        fqdn: fqdnRaw,
        type: safeType,
        checkedAt: new Date().toISOString(),
        nodes,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi khi kiểm tra DNS theo khu vực toàn quốc.',
      });
    }
  });

  app.post('/api/dns/rdap-expiry', async (req, res) => {
    try {
      const domainRaw =
        typeof req.body?.domain === 'string' ? req.body.domain.trim().toLowerCase().replace(/\.$/, '') : '';
      if (!FQDN_REGEX.test(domainRaw)) {
        res.status(400).json({ error: 'Tên miền tra cứu hạn không đúng định dạng FQDN.' });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const rdapRes = await fetch(`https://rdap.org/domain/${encodeURIComponent(domainRaw)}`, {
          headers: { Accept: 'application/rdap+json, application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!rdapRes.ok) {
          res.status(404).json({
            error: 'Máy chủ RDAP công cộng chưa cung cấp thông tin hạn cho tên miền này. Bạn có thể chọn ngày hết hạn thủ công.',
          });
          return;
        }
        const rdapJson = (await rdapRes.json()) as {
          events?: Array<{ eventAction?: string; eventDate?: string }>;
        };
        const expEvent = Array.isArray(rdapJson.events)
          ? rdapJson.events.find(
              (ev) => ev.eventAction === 'expiration' || ev.eventAction === 'soft expiration'
            )
          : undefined;
        if (!expEvent?.eventDate) {
          res.status(404).json({
            error: 'Dữ liệu RDAP không chứa ngày hết hạn. Bạn có thể nhập thủ công.',
          });
          return;
        }
        const parsed = new Date(expEvent.eventDate);
        if (Number.isNaN(parsed.getTime())) {
          res.status(404).json({ error: 'Định dạng ngày hết hạn RDAP không hợp lệ.' });
          return;
        }
        res.json({
          domain: domainRaw,
          expiresAtIso: parsed.toISOString(),
          expiresDateInput: parsed.toISOString().slice(0, 10),
        });
      } catch {
        clearTimeout(timeout);
        res.status(502).json({
          error: 'Không kết nối được tới máy chủ RDAP công cộng. Vui lòng nhập ngày hết hạn thủ công.',
        });
      }
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi khi tra cứu hạn tên miền.',
      });
    }
  });

  // --- GitHub OAuth & Pages Live Review Endpoints ---
  app.get('/api/auth/github/status', (req, res) => {
    const { clientId, clientSecret } = getGitHubCredentials();
    const baseUrl = getAppBaseUrl(req);
    const active = getGitHubSessionFromReq(req);
    res.json({
      oauthConfigured: Boolean(clientId && clientSecret),
      connected: Boolean(active),
      user: active
        ? {
            login: active.session.login,
            name: active.session.name,
            avatarUrl: active.session.avatarUrl,
          }
        : null,
      callbackUrl: `${baseUrl}/api/auth/github/callback`,
    });
  });

  app.get('/api/auth/github/url', (req, res) => {
    const { clientId, clientSecret } = getGitHubCredentials();
    const baseUrl = getAppBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/auth/github/callback`;
    if (!clientId || !clientSecret) {
      res.status(400).json({
        error: 'Chưa cấu hình GITHUB_CLIENT_ID và GITHUB_CLIENT_SECRET trong phần Secrets của ứng dụng.',
        callbackUrl,
      });
      return;
    }

    const state = signOAuthState();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'repo read:user',
      state,
    });
    res.json({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      callbackUrl,
    });
  });

  const handleGitHubCallback = async (req: express.Request, res: express.Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthError = typeof req.query.error_description === 'string' ? req.query.error_description : '';

    const renderPopupHtml = (payload: Record<string, unknown>, message: string) => {
      const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
      return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8" /><title>Xác thực GitHub</title></head>
<body style="font-family: system-ui, sans-serif; padding: 24px; color: #0f172a;">
  <p>${message.replace(/</g, '&lt;')}</p>
  <script>
    (function () {
      var data = ${safeJson};
      if (window.opener) {
        window.opener.postMessage(data, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    })();
  </script>
</body>
</html>`;
    };

    if (oauthError) {
      res.status(400).send(
        renderPopupHtml(
          { type: 'GITHUB_OAUTH_ERROR', error: oauthError },
          'Ủy quyền GitHub bị từ chối. Bạn có thể đóng cửa sổ này.'
        )
      );
      return;
    }

    if (!code || !state || !verifyOAuthState(state)) {
      res.status(400).send(
        renderPopupHtml(
          { type: 'GITHUB_OAUTH_ERROR', error: 'Mã trạng thái OAuth không hợp lệ hoặc đã hết hạn.' },
          'Phiên xác thực OAuth không hợp lệ hoặc đã hết hạn.'
        )
      );
      return;
    }

    const { clientId, clientSecret } = getGitHubCredentials();
    if (!clientId || !clientSecret) {
      res.status(500).send(
        renderPopupHtml(
          { type: 'GITHUB_OAUTH_ERROR', error: 'Thiếu cấu hình GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET.' },
          'Máy chủ chưa có thông tin cấu hình GitHub OAuth.'
        )
      );
      return;
    }

    try {
      const baseUrl = getAppBaseUrl(req);
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${baseUrl}/api/auth/github/callback`,
        }),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(tokenJson.error_description || 'Không đổi được mã xác thực GitHub.');
      }

      const userApi = await githubApiFetch<{ login?: string; name?: string; avatar_url?: string }>(
        '/user',
        tokenJson.access_token
      );
      if (!userApi.ok || !userApi.data.login) {
        throw new Error('Không đọc được thông tin tài khoản GitHub.');
      }

      const sid = crypto.randomBytes(24).toString('hex');
      const user = {
        login: userApi.data.login,
        name: userApi.data.name || userApi.data.login,
        avatarUrl: userApi.data.avatar_url || '',
      };

      githubSessions.set(sid, {
        accessToken: tokenJson.access_token,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: Date.now(),
      });

      res.setHeader(
        'Set-Cookie',
        `gh_sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=43200`
      );
      res.send(
        renderPopupHtml(
          { type: 'GITHUB_OAUTH_SUCCESS', sessionToken: sid, user },
          'Đã kết nối tài khoản GitHub thành công. Cửa sổ sẽ tự động đóng.'
        )
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Lỗi kết nối GitHub OAuth.';
      res.status(500).send(
        renderPopupHtml({ type: 'GITHUB_OAUTH_ERROR', error: msg }, `Lỗi xác thực GitHub: ${msg}`)
      );
    }
  };

  app.get(['/api/auth/github/callback', '/api/auth/github/callback/'], handleGitHubCallback);

  app.post('/api/auth/github/logout', (req, res) => {
    if (!verifyMutationCsrf(req)) {
      res.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
      return;
    }
    const active = getGitHubSessionFromReq(req);
    if (active) {
      githubSessions.delete(active.sid);
    }
    res.setHeader(
      'Set-Cookie',
      'gh_sid=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0'
    );
    res.json({ ok: true });
  });

  app.get('/api/github/repos', async (req, res) => {
    const active = getGitHubSessionFromReq(req);
    if (!active) {
      res.status(401).json({ error: 'Chưa kết nối tài khoản GitHub OAuth.' });
      return;
    }

    try {
      const api = await githubApiFetch<
        Array<{
          full_name: string;
          name: string;
          owner?: { login?: string };
          private: boolean;
          default_branch: string;
          html_url: string;
          description?: string | null;
          updated_at: string;
        }>
      >(
        '/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator,organization_member',
        active.session.accessToken
      );

      if (!api.ok || !Array.isArray(api.data)) {
        res.status(api.status || 502).json({ error: 'Không thể tải danh sách kho lưu trữ từ GitHub.' });
        return;
      }

      res.json({
        repos: api.data.map((r) => ({
          fullName: r.full_name,
          name: r.name,
          owner: r.owner?.login || r.full_name.split('/')[0],
          isPrivate: Boolean(r.private),
          defaultBranch: r.default_branch || 'main',
          htmlUrl: r.html_url,
          description: r.description || '',
          updatedAt: r.updated_at,
        })),
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Lỗi kết nối GitHub API.',
      });
    }
  });

  app.get('/api/github/branches', async (req, res) => {
    const active = getGitHubSessionFromReq(req);
    if (!active) {
      res.status(401).json({ error: 'Chưa kết nối tài khoản GitHub OAuth.' });
      return;
    }

    const repoFullName = typeof req.query.repo === 'string' ? req.query.repo.trim() : '';
    if (!GITHUB_REPO_REGEX.test(repoFullName)) {
      res.status(400).json({ error: 'Tên kho lưu trữ GitHub không hợp lệ.' });
      return;
    }

    try {
      const [owner, repo] = repoFullName.split('/');
      const api = await githubApiFetch<Array<{ name: string; commit?: { sha?: string } }>>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=50`,
        active.session.accessToken
      );

      if (!api.ok || !Array.isArray(api.data)) {
        res.status(api.status || 502).json({ error: 'Không thể tải danh sách nhánh từ GitHub.' });
        return;
      }

      res.json({
        branches: api.data.map((b) => ({
          name: b.name,
          sha: b.commit?.sha || '',
        })),
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Lỗi khi truy vấn nhánh GitHub.',
      });
    }
  });

  app.post('/api/github/deploy-pages', async (req, res) => {
    if (!verifyMutationCsrf(req)) {
      res.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
      return;
    }

    const active = getGitHubSessionFromReq(req);
    if (!active) {
      res.status(401).json({ error: 'Vui lòng kết nối tài khoản GitHub OAuth trước khi triển khai.' });
      return;
    }

    try {
      const repoFullName = typeof req.body?.repoFullName === 'string' ? req.body.repoFullName.trim() : '';
      const branch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : '';
      const sourceDirRaw = typeof req.body?.sourceDir === 'string' ? req.body.sourceDir.trim() : 'auto';
      const domainName =
        typeof req.body?.domainName === 'string'
          ? req.body.domainName.trim().toLowerCase().replace(/\.$/, '')
          : '';
      const enablePagesApi = Boolean(req.body?.enablePagesApi);
      const writeCnameFile = Boolean(req.body?.writeCnameFile);

      if (!GITHUB_REPO_REGEX.test(repoFullName)) {
        res.status(400).json({ error: 'Tên kho lưu trữ phải có dạng owner/repo hợp lệ.' });
        return;
      }
      if (!branch || branch.length > 120 || branch.includes('..') || /[\r\n]/.test(branch)) {
        res.status(400).json({ error: 'Tên nhánh triển khai không hợp lệ.' });
        return;
      }
      if (!FQDN_REGEX.test(domainName)) {
        res.status(400).json({ error: 'Tên miền gắn Pages không hợp lệ.' });
        return;
      }
      if (sourceDirRaw.includes('..')) {
        res.status(400).json({ error: 'Thư mục nguồn không hợp lệ.' });
        return;
      }

      const [owner, repo] = repoFullName.split('/');
      const token = active.session.accessToken;

      const branchRes = await githubApiFetch<{
        commit?: { sha?: string; commit?: { tree?: { sha?: string } } };
        message?: string;
      }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
        token
      );

      if (!branchRes.ok || !branchRes.data.commit?.sha) {
        res.status(branchRes.status || 400).json({
          error: `Không tìm thấy nhánh "${branch}" trong ${repoFullName}.`,
        });
        return;
      }

      const commitSha = branchRes.data.commit.sha;
      const treeSha = branchRes.data.commit.commit?.tree?.sha || commitSha;

      const treeRes = await githubApiFetch<{
        tree?: Array<{ path: string; type: string; sha: string; size?: number }>;
        truncated?: boolean;
      }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
        token
      );

      if (!treeRes.ok || !Array.isArray(treeRes.data.tree)) {
        res.status(treeRes.status || 502).json({
          error: 'Không đọc được danh sách tệp từ nhánh GitHub đã chọn.',
        });
        return;
      }

      const blobs = treeRes.data.tree.filter((item) => item.type === 'blob');

      const normalizeSubDir = (dir: string) => dir.replace(/^\/+|\/+$/g, '');
      let resolvedDir = '';
      if (sourceDirRaw === 'auto') {
        const candidates = ['dist', 'build', 'docs', 'public', ''];
        const found = candidates.find((cand) => {
          const targetIndex = cand ? `${cand}/index.html` : 'index.html';
          return blobs.some((b) => b.path === targetIndex);
        });
        if (found === undefined) {
          res.status(400).json({
            error: `Không tìm thấy tệp tĩnh index.html ở thư mục gốc hoặc dist/, build/, docs/, public/ trên nhánh ${branch}. Hãy build tĩnh hoặc tạo index.html trước khi cấp Live Review.`,
          });
          return;
        }
        resolvedDir = found;
      } else {
        resolvedDir = normalizeSubDir(sourceDirRaw);
        const targetIndex = resolvedDir ? `${resolvedDir}/index.html` : 'index.html';
        if (!blobs.some((b) => b.path === targetIndex)) {
          res.status(400).json({
            error: `Không tìm thấy ${targetIndex} trên nhánh ${branch}. Hãy chọn lại thư mục đầu ra (ví dụ: Tự động phát hiện hoặc docs, dist).`,
          });
          return;
        }
      }

      const prefix = resolvedDir ? `${resolvedDir}/` : '';
      const targetBlobs = blobs
        .filter((b) => (prefix ? b.path.startsWith(prefix) : !b.path.startsWith('.git/')))
        .slice(0, 80);

      const snapshotFiles = new Map<string, { content: Buffer; contentType: string }>();
      let totalBytes = 0;

      for (const blobItem of targetBlobs) {
        if ((blobItem.size || 0) > 2 * 1024 * 1024) continue;
        if (totalBytes + (blobItem.size || 0) > 12 * 1024 * 1024) break;

        const blobApi = await githubApiFetch<{ content?: string; encoding?: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(blobItem.sha)}`,
          token
        );
        if (!blobApi.ok || !blobApi.data.content) continue;

        const buf = Buffer.from(
          blobApi.data.content.replace(/\n/g, ''),
          blobApi.data.encoding === 'base64' ? 'base64' : 'utf8'
        );
        totalBytes += buf.length;
        const relPath = prefix ? blobItem.path.slice(prefix.length) : blobItem.path;
        if (relPath) {
          snapshotFiles.set(relPath, {
            content: buf,
            contentType: getStaticMimeType(relPath),
          });
        }
      }

      if (!snapshotFiles.has('index.html')) {
        res.status(400).json({ error: 'Không thể tải tệp index.html để dựng bản xem trước Live Review.' });
        return;
      }

      const reviewId = `rv_${crypto.randomBytes(8).toString('hex')}`;
      if (liveReviewSnapshots.size >= 30) {
        const oldestKey = liveReviewSnapshots.keys().next().value;
        if (oldestKey) liveReviewSnapshots.delete(oldestKey);
      }

      const displaySourceDir = resolvedDir ? `/${resolvedDir}` : '/';
      liveReviewSnapshots.set(reviewId, {
        reviewId,
        repoFullName,
        branch,
        sourceDir: displaySourceDir,
        commitSha,
        domainName,
        files: snapshotFiles,
        createdAt: Date.now(),
      });

      const baseUrl = getAppBaseUrl(req);
      const liveReviewUrl = `${baseUrl}/live-review/${reviewId}/`;
      const isUserSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
      let githubPagesUrl = isUserSite
        ? `https://${owner.toLowerCase()}.github.io/`
        : `https://${owner.toLowerCase()}.github.io/${repo}/`;
      let status: 'live' | 'configured' = 'live';
      let pagesApiStatus = 'Live Review đang chạy trên máy chủ';

      if (writeCnameFile) {
        try {
          const existingCname = await githubApiFetch<{ sha?: string }>(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/CNAME?ref=${encodeURIComponent(branch)}`,
            token
          );
          await githubApiFetch(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/CNAME`,
            token,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: `Cấu hình CNAME ${domainName} từ Trạm Điều Khiển DNS`,
                content: Buffer.from(`${domainName}\n`, 'utf8').toString('base64'),
                branch,
                ...(existingCname.ok && existingCname.data.sha ? { sha: existingCname.data.sha } : {}),
              }),
            }
          );
        } catch {
          // Tiếp tục quy trình ngay cả khi repo không cho phép ghi CNAME
        }
      }

      if (enablePagesApi) {
        const pagesPath = displaySourceDir === '/docs' ? '/docs' : '/';
        const currentPages = await githubApiFetch<{ html_url?: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`,
          token
        );

        const pagesMethod = currentPages.ok ? 'PUT' : 'POST';
        const pagesRes = await githubApiFetch<{ html_url?: string; message?: string }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`,
          token,
          {
            method: pagesMethod,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: { branch, path: pagesPath },
              ...(currentPages.ok ? { cname: domainName } : {}),
            }),
          }
        );

        if (pagesRes.ok) {
          if (pagesRes.data.html_url) githubPagesUrl = pagesRes.data.html_url;
          status = 'live';
          pagesApiStatus = `Đã bật GitHub Pages (${branch}:${pagesPath}) và cấp Live Review`;
        } else {
          status = 'configured';
          pagesApiStatus = `Live Review sẵn sàng (GitHub Pages API: ${
            pagesRes.data.message || `HTTP ${pagesRes.status}`
          })`;
        }
      }

      res.json({
        reviewId,
        repoFullName,
        branch,
        sourceDir: displaySourceDir,
        commitSha,
        liveReviewUrl,
        githubPagesUrl,
        customDomainUrl: `https://${domainName}`,
        fileCount: snapshotFiles.size,
        status,
        pagesApiStatus,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lỗi khi triển khai GitHub Pages và tạo Live Review.',
      });
    }
  });

  const handleLiveReviewRequest = (req: express.Request, res: express.Response) => {
    const reviewId = req.params.reviewId;
    const rawSubPath = (req.params as Record<string, string>)[0];

    if (rawSubPath === undefined && !req.path.endsWith('/')) {
      res.redirect(302, `/live-review/${encodeURIComponent(reviewId)}/`);
      return;
    }

    const snapshot = liveReviewSnapshots.get(reviewId);
    if (!snapshot) {
      res
        .status(404)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(`<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8" /><title>Bản xem trước Live Review đã hết hạn</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 48px auto; padding: 24px; color: #0f172a;">
  <h2 style="margin-bottom: 8px;">Bản xem trước Live Review không còn khả dụng</h2>
  <p style="color: #475569; font-size: 14px; line-height: 1.6;">
    Phiên xem trước tạm thời đã hết hạn hoặc máy chủ vừa khởi động lại. Hãy quay lại thẻ <strong>Xác thực &amp; Pages Web</strong> và nhấn triển khai lại để cấp URL Live Review mới.
  </p>
</body>
</html>`);
      return;
    }

    const cleanedPath = path.posix
      .normalize(`/${rawSubPath || ''}`)
      .replace(/^\/+/, '');

    if (cleanedPath.includes('..') || cleanedPath.includes('\0')) {
      res.status(400).send('Đường dẫn không hợp lệ.');
      return;
    }

    const candidateKeys = cleanedPath
      ? [cleanedPath, `${cleanedPath}/index.html`, 'index.html']
      : ['index.html'];

    let matched: { content: Buffer; contentType: string } | undefined;
    for (const key of candidateKeys) {
      if (key === 'index.html' && cleanedPath && path.posix.extname(cleanedPath)) {
        // Nếu yêu cầu tệp asset cụ thể (.js/.css/.png) mà không tồn tại thì trả 404 thay vì fallback HTML
        break;
      }
      const found = snapshot.files.get(key);
      if (found) {
        matched = found;
        break;
      }
    }

    if (!matched) {
      res.status(404).send('Không tìm thấy tệp trong bản xem trước Live Review.');
      return;
    }

    res.setHeader('Content-Type', matched.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.send(matched.content);
  };

  app.get('/live-review/:reviewId', handleLiveReviewRequest);
  app.get('/live-review/:reviewId/*', handleLiveReviewRequest);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DNS Control Plane server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
