import type { Timestamp } from 'firebase/firestore';

export const COMMON_RECORD_TYPES = [
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
] as const;

export const ADVANCED_RECORD_TYPES = [
  'ALIAS',
  'DS',
  'HINFO',
  'HTTPS',
  'NAPTR',
  'RP',
  'SSHFP',
  'SVCB',
  'TLSA',
] as const;

export const ALL_RECORD_TYPES = [...COMMON_RECORD_TYPES, ...ADVANCED_RECORD_TYPES] as const;

export type RecordType = (typeof ALL_RECORD_TYPES)[number];

export type DomainStatus = 'active' | 'pending' | 'warning';
export type HealthStatus = 'unknown' | 'healthy' | 'warning' | 'critical';
export type CaaTag = 'issue' | 'issuewild' | 'iodef';
export type RedirectType = '301' | '302';
export type VerificationStatus = 'unverified' | 'pending' | 'verified';
export type PagesProvider = 'none' | 'github' | 'cloudflare' | 'vercel' | 'firebase';
export type AuditLogAction =
  | 'domain_create'
  | 'record_create'
  | 'record_update'
  | 'record_delete'
  | 'record_duplicate'
  | 'bulk_import'
  | 'forward_create'
  | 'forward_toggle'
  | 'forward_delete'
  | 'domain_verify_init'
  | 'domain_verified'
  | 'pages_provision'
  | 'github_deploy';
export type AuditLogTargetType = 'record' | 'bulk' | 'forward' | 'domain' | 'pages';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  defaultTtl: number;
  notifyHealthAlerts: boolean;
  notifyDanglingRecords: boolean;
  totpEnabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserTotpSecret {
  ownerId: string;
  secret: string;
  verifiedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Domain {
  id: string;
  ownerId: string;
  name: string;
  tags: string[];
  notes: string;
  status: DomainStatus;
  recordCount: number;
  lastHealthStatus: HealthStatus;
  lastHealthSummary: string;
  lastHealthCheckAt?: Timestamp;
  verificationToken?: string;
  verificationStatus?: VerificationStatus;
  verifiedAt?: Timestamp;
  pagesProvider?: PagesProvider;
  pagesTarget?: string;
  expiresAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  records?: DnsRecord[];
}

export interface DnsRecord {
  id: string;
  ownerId: string;
  domainId: string;
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WebForward {
  id: string;
  ownerId: string;
  domainId: string;
  sourceHost: string;
  targetUrl: string;
  redirectType: RedirectType;
  preservePath: boolean;
  enabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface HealthRecordCheck {
  id: string;
  fqdn: string;
  type: string;
  configuredValue: string;
  liveValues: string[];
  status: 'matched' | 'mismatch' | 'missing' | 'unsupported';
  message: string;
}

export interface DnsHealthReport {
  domain: string;
  checkedAt: string;
  latencyMs: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
  summary: string;
  nameservers: string[];
  soa: {
    nsname: string;
    hostmaster: string;
    serial: number;
    refresh: number;
    retry: number;
    expire: number;
    minttl: number;
  } | null;
  recordChecks: HealthRecordCheck[];
}

export interface DanglingFinding {
  id: string;
  fqdn: string;
  type: string;
  target: string;
  risk: 'safe' | 'warning' | 'dangling' | 'high_risk';
  reason: string;
}

export interface DanglingScanReport {
  domain: string;
  scannedAt: string;
  totalScanned: number;
  highRiskCount: number;
  danglingCount: number;
  findings: DanglingFinding[];
}

export interface LiveLookupResult {
  fqdn: string;
  type: string;
  status: number;
  latencyMs: number;
  answers: Array<{
    name: string;
    ttl: number;
    data: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  ownerId: string;
  domainId: string;
  actorEmail: string;
  action: AuditLogAction;
  targetType: AuditLogTargetType;
  targetLabel: string;
  summary: string;
  beforeSummary?: string;
  afterSummary?: string;
  createdAt?: Timestamp;
}

export interface EnrichedAuditLogEntry extends AuditLogEntry {
  domainName: string;
}

export type AuditDatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';
export type AuditActionFilter = 'all' | AuditLogTargetType | AuditLogAction;

export interface DomainVerificationResult {
  domain: string;
  token: string;
  verified: boolean;
  matchedHost: string | null;
  checkedHosts: string[];
  foundTxtValues: string[];
  latencyMs: number;
}

export type RecordSearchField = 'all' | 'host' | 'type' | 'value';
export type VietnamRegion = 'bac' | 'trung' | 'nam';

export interface RegionalDnsNodeResult {
  id: string;
  region: VietnamRegion;
  city: string;
  label: string;
  resolverIp: string;
  status: 'resolved' | 'empty' | 'error';
  values: string[];
  latencyMs: number;
  source: string;
}

export interface RegionalDnsCheckReport {
  fqdn: string;
  type: string;
  checkedAt: string;
  nodes: RegionalDnsNodeResult[];
}

export interface GitHubUser {
  login: string;
  name: string;
  avatarUrl: string;
}

export interface GitHubRepoSummary {
  fullName: string;
  name: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description: string;
  updatedAt: string;
}

export interface GitHubBranchSummary {
  name: string;
  sha: string;
}

export type PagesDeploymentStatus = 'live' | 'configured' | 'failed';

export interface PagesDeployment {
  id: string;
  ownerId: string;
  domainId: string;
  repoFullName: string;
  branch: string;
  sourceDir: string;
  commitSha: string;
  liveReviewUrl: string;
  githubPagesUrl: string;
  customDomainUrl: string;
  status: PagesDeploymentStatus;
  pagesApiStatus: string;
  createdAt?: Timestamp;
}

export interface GitHubDeployResponse {
  reviewId: string;
  repoFullName: string;
  branch: string;
  sourceDir: string;
  commitSha: string;
  liveReviewUrl: string;
  githubPagesUrl: string;
  customDomainUrl: string;
  fileCount: number;
  status: PagesDeploymentStatus;
  pagesApiStatus: string;
}
