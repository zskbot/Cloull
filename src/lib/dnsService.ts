import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { BLUEPRINT_LIMITS, sanitizeTags, type RecordDraftInput } from './dnsValidation';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { getPagesProviderLabel } from './formatters';
import type {
  AuditLogAction,
  AuditLogEntry,
  AuditLogTargetType,
  DnsRecord,
  Domain,
  DomainStatus,
  EnrichedAuditLogEntry,
  HealthStatus,
  PagesDeployment,
  PagesDeploymentStatus,
  PagesProvider,
  UserProfile,
  UserTotpSecret,
  WebForward,
} from '../types/dns';

function generateDocId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${rand}`;
}

function getActorEmail(): string {
  const email = (auth.currentUser?.email || 'admin@local.dns').trim();
  if (email.length < 3) return 'admin@local.dns';
  return email.slice(0, 254);
}

function summarizeRecord(input: {
  type: string;
  host: string;
  value: string;
  ttl: number;
  priority?: number;
}): string {
  const val =
    input.type === 'MX' && input.priority !== undefined
      ? `${input.priority} ${input.value}`
      : input.value;
  return `${input.type} ${input.host} → ${val} (TTL ${input.ttl}s)`.slice(
    0,
    BLUEPRINT_LIMITS.AUDIT_SUMMARY_MAX
  );
}

function buildAuditLogPayload(
  ownerId: string,
  domainId: string,
  params: {
    action: AuditLogAction;
    targetType: AuditLogTargetType;
    targetLabel: string;
    summary: string;
    beforeSummary?: string;
    afterSummary?: string;
  }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ownerId,
    domainId,
    actorEmail: getActorEmail(),
    action: params.action,
    targetType: params.targetType,
    targetLabel: (params.targetLabel.trim() || domainId).slice(0, BLUEPRINT_LIMITS.AUDIT_LABEL_MAX),
    summary: (params.summary.trim() || 'Thay đổi cấu hình DNS').slice(
      0,
      BLUEPRINT_LIMITS.AUDIT_SUMMARY_MAX
    ),
    createdAt: serverTimestamp(),
  };

  if (params.beforeSummary && params.beforeSummary.trim()) {
    payload.beforeSummary = params.beforeSummary.trim().slice(0, BLUEPRINT_LIMITS.AUDIT_SUMMARY_MAX);
  }
  if (params.afterSummary && params.afterSummary.trim()) {
    payload.afterSummary = params.afterSummary.trim().slice(0, BLUEPRINT_LIMITS.AUDIT_SUMMARY_MAX);
  }

  return payload;
}

function buildRecordPayload(
  ownerId: string,
  domainId: string,
  input: RecordDraftInput,
  isCreate: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ownerId,
    domainId,
    type: input.type,
    host: input.host.trim().slice(0, BLUEPRINT_LIMITS.RECORD_HOST_MAX),
    value: input.value.trim().slice(0, BLUEPRINT_LIMITS.RECORD_VALUE_MAX),
    ttl: Math.min(BLUEPRINT_LIMITS.TTL_MAX, Math.max(BLUEPRINT_LIMITS.TTL_MIN, Math.trunc(input.ttl))),
    tags: sanitizeTags(input.tags, BLUEPRINT_LIMITS.RECORD_TAGS_MAX),
    notes: input.notes.trim().slice(0, BLUEPRINT_LIMITS.RECORD_NOTES_MAX),
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  const optionalNums: Array<[keyof RecordDraftInput, number | undefined]> = [
    ['priority', input.priority],
    ['weight', input.weight],
    ['port', input.port],
    ['caaFlags', input.caaFlags],
    ['dsKeyTag', input.dsKeyTag],
    ['dsAlgorithm', input.dsAlgorithm],
    ['dsDigestType', input.dsDigestType],
    ['sshfpAlgorithm', input.sshfpAlgorithm],
    ['sshfpFingerprintType', input.sshfpFingerprintType],
    ['tlsaUsage', input.tlsaUsage],
    ['tlsaSelector', input.tlsaSelector],
    ['tlsaMatchingType', input.tlsaMatchingType],
  ];

  for (const [key, val] of optionalNums) {
    if (val !== undefined && !Number.isNaN(val)) {
      payload[key] = Math.trunc(val);
    } else if (!isCreate) {
      payload[key] = deleteField();
    }
  }

  if (input.caaTag !== undefined) {
    payload.caaTag = input.caaTag;
  } else if (!isCreate) {
    payload.caaTag = deleteField();
  }

  return payload;
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const displayName = (user.displayName || user.email?.split('@')[0] || 'Quản trị viên').slice(
        0,
        BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
      );
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email: (user.email || 'admin@example.com').slice(0, 254),
        defaultTtl: 3600,
        notifyHealthAlerts: true,
        notifyDanglingRecords: true,
        totpEnabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export async function updateUserProfile(
  uid: string,
  updates: Pick<UserProfile, 'displayName' | 'defaultTtl' | 'notifyHealthAlerts' | 'notifyDanglingRecords'>
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: updates.displayName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Quản trị viên',
      defaultTtl: Math.min(BLUEPRINT_LIMITS.TTL_MAX, Math.max(BLUEPRINT_LIMITS.TTL_MIN, Math.trunc(updates.defaultTtl))),
      notifyHealthAlerts: Boolean(updates.notifyHealthAlerts),
      notifyDanglingRecords: Boolean(updates.notifyDanglingRecords),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getTotpSecret(uid: string): Promise<UserTotpSecret | null> {
  const path = `users/${uid}/security/totp`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'security', 'totp'));
    return snap.exists() ? (snap.data() as UserTotpSecret) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function enableTotpSecurity(uid: string, secret: string): Promise<void> {
  const path = `users/${uid}/security/totp`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'security', 'totp'), {
      ownerId: uid,
      secret: secret.toUpperCase(),
      verifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', uid), {
      totpEnabled: true,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function disableTotpSecurity(uid: string): Promise<void> {
  const path = `users/${uid}/security/totp`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid, 'security', 'totp'));
    batch.update(doc(db, 'users', uid), {
      totpEnabled: false,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeDomains(uid: string, onData: (domains: Domain[]) => void): Unsubscribe {
  const path = 'domains';
  const q = query(collection(db, 'domains'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Domain, 'id'>) }))
        .sort((a, b) => {
          const ta = a.updatedAt ? a.updatedAt.toMillis() : 0;
          const tb = b.updatedAt ? b.updatedAt.toMillis() : 0;
          return tb - ta;
        });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createDomain(
  uid: string,
  input: {
    name: string;
    tags: string[];
    notes: string;
    defaultIp?: string;
    defaultTtl?: number;
    expiresAt?: Date | null;
  }
): Promise<string> {
  const domainId = generateDocId('dom');
  const path = `domains/${domainId}`;
  const cleanName = input.name.trim().toLowerCase().replace(/\.$/, '');
  const hasStarter = Boolean(input.defaultIp && input.defaultIp.trim());

  try {
    // Tạo document tên miền trước để isDomainOwner(domainId) trong Firestore Rules thấy exists() == true
    const payload: Record<string, unknown> = {
      ownerId: uid,
      name: cleanName,
      tags: sanitizeTags(input.tags, BLUEPRINT_LIMITS.DOMAIN_TAGS_MAX),
      notes: input.notes.trim().slice(0, BLUEPRINT_LIMITS.DOMAIN_NOTES_MAX),
      status: 'pending',
      recordCount: hasStarter ? 1 : 0,
      lastHealthStatus: 'unknown',
      lastHealthSummary: 'Chưa chạy kiểm tra sức khỏe DNS.',
      verificationStatus: 'unverified',
      pagesProvider: 'none',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.expiresAt instanceof Date && !Number.isNaN(input.expiresAt.getTime())) {
      payload.expiresAt = Timestamp.fromDate(input.expiresAt);
    }
    await setDoc(doc(db, 'domains', domainId), payload);

    const batch = writeBatch(db);
    if (hasStarter && input.defaultIp) {
      const recId = generateDocId('rec');
      batch.set(
        doc(db, 'domains', domainId, 'records', recId),
        buildRecordPayload(
          uid,
          domainId,
          {
            type: 'A',
            host: '@',
            value: input.defaultIp.trim(),
            ttl: input.defaultTtl || 3600,
            tags: ['khoi-tao'],
            notes: 'Bản ghi gốc mặc định',
          },
          true
        )
      );
    }

    const logId = generateDocId('log');
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'domain_create',
        targetType: 'domain',
        targetLabel: cleanName,
        summary: hasStarter
          ? `Khởi tạo vùng tên miền ${cleanName} kèm bản ghi A gốc (${input.defaultIp?.trim()}).`
          : `Khởi tạo vùng tên miền ${cleanName}.`,
        afterSummary: hasStarter
          ? `A @ → ${input.defaultIp?.trim()} (TTL ${input.defaultTtl || 3600}s)`
          : 'Vùng DNS trống',
      })
    );

    await batch.commit();
    return domainId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDomainMeta(
  domainId: string,
  updates: { tags: string[]; notes: string; status: DomainStatus; expiresAt?: Date | null }
): Promise<void> {
  const path = `domains/${domainId}`;
  try {
    const payload: Record<string, unknown> = {
      tags: sanitizeTags(updates.tags, BLUEPRINT_LIMITS.DOMAIN_TAGS_MAX),
      notes: updates.notes.trim().slice(0, BLUEPRINT_LIMITS.DOMAIN_NOTES_MAX),
      status: updates.status,
      updatedAt: serverTimestamp(),
    };
    if (updates.expiresAt instanceof Date && !Number.isNaN(updates.expiresAt.getTime())) {
      payload.expiresAt = Timestamp.fromDate(updates.expiresAt);
    } else if (updates.expiresAt === null) {
      payload.expiresAt = deleteField();
    }
    await updateDoc(doc(db, 'domains', domainId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateDomainHealthSummary(
  domainId: string,
  healthStatus: HealthStatus,
  summary: string,
  domainStatus: DomainStatus
): Promise<void> {
  const path = `domains/${domainId}`;
  try {
    await updateDoc(doc(db, 'domains', domainId), {
      lastHealthStatus: healthStatus,
      lastHealthSummary: summary.slice(0, 300),
      lastHealthCheckAt: serverTimestamp(),
      status: domainStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDomainCascade(uid: string, domainId: string): Promise<void> {
  const path = `domains/${domainId}`;
  try {
    const recSnap = await getDocs(
      query(collection(db, 'domains', domainId, 'records'), where('ownerId', '==', uid))
    );
    const fwdSnap = await getDocs(
      query(collection(db, 'domains', domainId, 'forwards'), where('ownerId', '==', uid))
    );
    const depSnap = await getDocs(
      query(collection(db, 'domains', domainId, 'deployments'), where('ownerId', '==', uid))
    );

    const allRefs = [
      ...recSnap.docs.map((d) => d.ref),
      ...fwdSnap.docs.map((d) => d.ref),
      ...depSnap.docs.map((d) => d.ref),
    ];
    for (let i = 0; i < allRefs.length; i += 400) {
      const batch = writeBatch(db);
      allRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, 'domains', domainId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeDomainRecords(
  uid: string,
  domainId: string,
  onData: (records: DnsRecord[]) => void
): Unsubscribe {
  const path = `domains/${domainId}/records`;
  const q = query(collection(db, 'domains', domainId, 'records'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DnsRecord, 'id'>) }));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeDomainAuditLogs(
  uid: string,
  domainId: string,
  onData: (logs: AuditLogEntry[]) => void
): Unsubscribe {
  const path = `domains/${domainId}/auditLogs`;
  const q = query(collection(db, 'domains', domainId, 'auditLogs'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) }))
        .sort((a, b) => {
          const ta = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const tb = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return tb - ta;
        });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeAllDomainsAuditLogs(
  uid: string,
  domains: Domain[],
  onData: (logs: EnrichedAuditLogEntry[]) => void
): Unsubscribe {
  if (domains.length === 0) {
    onData([]);
    return () => {};
  }

  const logsByDomain = new Map<string, EnrichedAuditLogEntry[]>();
  const emitMerged = () => {
    const merged: EnrichedAuditLogEntry[] = [];
    for (const entries of logsByDomain.values()) {
      merged.push(...entries);
    }
    merged.sort((a, b) => {
      const ta = a.createdAt ? a.createdAt.toMillis() : Date.now();
      const tb = b.createdAt ? b.createdAt.toMillis() : Date.now();
      return tb - ta;
    });
    onData(merged);
  };

  const unsubscribers = domains.map((dom) => {
    const path = `domains/${dom.id}/auditLogs`;
    const q = query(collection(db, 'domains', dom.id, 'auditLogs'), where('ownerId', '==', uid));
    return onSnapshot(
      q,
      (snap) => {
        const list: EnrichedAuditLogEntry[] = snap.docs.map((d) => ({
          id: d.id,
          domainName: dom.name,
          ...(d.data() as Omit<AuditLogEntry, 'id'>),
        }));
        logsByDomain.set(dom.id, list);
        emitMerged();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, path)
    );
  });

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}

export async function createDnsRecord(
  uid: string,
  domainId: string,
  input: RecordDraftInput,
  options?: { isDuplicate?: boolean }
): Promise<void> {
  const recId = generateDocId('rec');
  const logId = generateDocId('log');
  const path = `domains/${domainId}/records/${recId}`;
  const isDuplicate = Boolean(options?.isDuplicate);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'domains', domainId, 'records', recId), buildRecordPayload(uid, domainId, input, true));
    batch.update(doc(db, 'domains', domainId), {
      recordCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: isDuplicate ? 'record_duplicate' : 'record_create',
        targetType: 'record',
        targetLabel: `${input.type} ${input.host}`,
        summary: isDuplicate
          ? `Nhân bản bản ghi ${input.type} cho host ${input.host}.`
          : `Thêm bản ghi ${input.type} mới cho host ${input.host}.`,
        afterSummary: summarizeRecord(input),
      })
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDnsRecord(
  uid: string,
  domainId: string,
  recordId: string,
  input: RecordDraftInput,
  previousRecord?: DnsRecord
): Promise<void> {
  const logId = generateDocId('log');
  const path = `domains/${domainId}/records/${recordId}`;
  try {
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'domains', domainId, 'records', recordId),
      buildRecordPayload(uid, domainId, input, false)
    );
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'record_update',
        targetType: 'record',
        targetLabel: `${input.type} ${input.host}`,
        summary: `Cập nhật bản ghi ${input.type} tại host ${input.host}.`,
        beforeSummary: previousRecord ? summarizeRecord(previousRecord) : undefined,
        afterSummary: summarizeRecord(input),
      })
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDnsRecord(
  uid: string,
  domainId: string,
  recordId: string,
  deletedRecord?: DnsRecord
): Promise<void> {
  const logId = generateDocId('log');
  const path = `domains/${domainId}/records/${recordId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'domains', domainId, 'records', recordId));
    batch.update(doc(db, 'domains', domainId), {
      recordCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'record_delete',
        targetType: 'record',
        targetLabel: deletedRecord ? `${deletedRecord.type} ${deletedRecord.host}` : recordId,
        summary: deletedRecord
          ? `Xóa bản ghi ${deletedRecord.type} tại host ${deletedRecord.host}.`
          : `Xóa bản ghi DNS (${recordId}).`,
        beforeSummary: deletedRecord ? summarizeRecord(deletedRecord) : undefined,
      })
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function bulkImportDnsRecords(
  uid: string,
  domainId: string,
  inputs: RecordDraftInput[],
  formatLabel = 'BIND/CSV'
): Promise<number> {
  const path = `domains/${domainId}/records`;
  let imported = 0;
  try {
    for (let i = 0; i < inputs.length; i += 350) {
      const chunk = inputs.slice(i, i + 350);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const recId = generateDocId('rec');
        batch.set(doc(db, 'domains', domainId, 'records', recId), buildRecordPayload(uid, domainId, item, true));
      }
      batch.update(doc(db, 'domains', domainId), {
        recordCount: increment(chunk.length),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      imported += chunk.length;
    }

    if (imported > 0) {
      const previewList = inputs
        .slice(0, 3)
        .map((r) => `${r.type} ${r.host}`)
        .join(', ');
      await setDoc(
        doc(db, 'domains', domainId, 'auditLogs', generateDocId('log')),
        buildAuditLogPayload(uid, domainId, {
          action: 'bulk_import',
          targetType: 'bulk',
          targetLabel: `${imported} bản ghi (${formatLabel})`,
          summary: `Nhập hàng loạt ${imported} bản ghi từ định dạng ${formatLabel}.`,
          afterSummary: `${previewList}${inputs.length > 3 ? ` và ${inputs.length - 3} bản ghi khác` : ''}`,
        })
      );
    }
    return imported;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeWebForwards(
  uid: string,
  domainId: string,
  onData: (forwards: WebForward[]) => void
): Unsubscribe {
  const path = `domains/${domainId}/forwards`;
  const q = query(collection(db, 'domains', domainId, 'forwards'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WebForward, 'id'>) }));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createWebForward(
  uid: string,
  domainId: string,
  input: Pick<WebForward, 'sourceHost' | 'targetUrl' | 'redirectType' | 'preservePath' | 'enabled'>
): Promise<void> {
  const fwdId = generateDocId('fwd');
  const logId = generateDocId('log');
  const path = `domains/${domainId}/forwards/${fwdId}`;
  const cleanHost = input.sourceHost.trim().slice(0, BLUEPRINT_LIMITS.RECORD_HOST_MAX);
  const cleanUrl = input.targetUrl.trim().slice(0, BLUEPRINT_LIMITS.FORWARD_URL_MAX);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'domains', domainId, 'forwards', fwdId), {
      ownerId: uid,
      domainId,
      sourceHost: cleanHost,
      targetUrl: cleanUrl,
      redirectType: input.redirectType,
      preservePath: Boolean(input.preservePath),
      enabled: Boolean(input.enabled),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'forward_create',
        targetType: 'forward',
        targetLabel: `HTTP ${input.redirectType} ${cleanHost}`,
        summary: `Tạo quy tắc chuyển tiếp ${cleanHost} → ${cleanUrl} (${input.redirectType}).`,
        afterSummary: `${cleanHost} → ${cleanUrl} (${input.enabled ? 'Đang bật' : 'Tạm tắt'})`,
      })
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateWebForward(
  uid: string,
  domainId: string,
  forwardId: string,
  input: Pick<WebForward, 'sourceHost' | 'targetUrl' | 'redirectType' | 'preservePath' | 'enabled'>
): Promise<void> {
  const logId = generateDocId('log');
  const path = `domains/${domainId}/forwards/${forwardId}`;
  const cleanHost = input.sourceHost.trim().slice(0, BLUEPRINT_LIMITS.RECORD_HOST_MAX);
  const cleanUrl = input.targetUrl.trim().slice(0, BLUEPRINT_LIMITS.FORWARD_URL_MAX);
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'domains', domainId, 'forwards', forwardId), {
      sourceHost: cleanHost,
      targetUrl: cleanUrl,
      redirectType: input.redirectType,
      preservePath: Boolean(input.preservePath),
      enabled: Boolean(input.enabled),
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'forward_toggle',
        targetType: 'forward',
        targetLabel: `HTTP ${input.redirectType} ${cleanHost}`,
        summary: `${input.enabled ? 'Bật lại' : 'Tạm tắt'} quy tắc chuyển tiếp ${cleanHost} → ${cleanUrl}.`,
        beforeSummary: `Trạng thái cũ: ${input.enabled ? 'Tạm tắt' : 'Đang bật'}`,
        afterSummary: `Trạng thái mới: ${input.enabled ? 'Đang bật' : 'Tạm tắt'}`,
      })
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteWebForward(
  uid: string,
  domainId: string,
  forwardId: string,
  deletedForward?: WebForward
): Promise<void> {
  const logId = generateDocId('log');
  const path = `domains/${domainId}/forwards/${forwardId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'domains', domainId, 'forwards', forwardId));
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'forward_delete',
        targetType: 'forward',
        targetLabel: deletedForward
          ? `HTTP ${deletedForward.redirectType} ${deletedForward.sourceHost}`
          : forwardId,
        summary: deletedForward
          ? `Xóa quy tắc chuyển tiếp ${deletedForward.sourceHost} → ${deletedForward.targetUrl}.`
          : `Xóa quy tắc chuyển tiếp (${forwardId}).`,
        beforeSummary: deletedForward
          ? `${deletedForward.sourceHost} → ${deletedForward.targetUrl}`
          : undefined,
      })
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function initDomainVerification(
  uid: string,
  domainId: string,
  domainName: string
): Promise<string> {
  const token = `dns-verify-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const logId = generateDocId('log');
  const path = `domains/${domainId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'domains', domainId), {
      verificationToken: token,
      verificationStatus: 'pending',
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'domain_verify_init',
        targetType: 'domain',
        targetLabel: domainName,
        summary: `Khởi tạo mã TXT xác thực sở hữu cho tên miền ${domainName}.`,
        afterSummary: `_dns-verify.${domainName} TXT ${token}`,
      })
    );
    await batch.commit();
    return token;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markDomainVerified(
  uid: string,
  domainId: string,
  domainName: string,
  matchedHost: string
): Promise<void> {
  const logId = generateDocId('log');
  const path = `domains/${domainId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'domains', domainId), {
      verificationStatus: 'verified',
      verifiedAt: serverTimestamp(),
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'domain_verified',
        targetType: 'domain',
        targetLabel: domainName,
        summary: `Xác thực thành công quyền sở hữu tên miền ${domainName} qua bản ghi TXT tại ${matchedHost}.`,
        beforeSummary: 'Trạng thái: Đang chờ xác thực DNS',
        afterSummary: `Đã xác thực (${matchedHost})`,
      })
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function provisionPagesRecords(
  uid: string,
  domainId: string,
  domainName: string,
  provider: Exclude<PagesProvider, 'none'>,
  target: string,
  drafts: RecordDraftInput[],
  existingRecords: DnsRecord[]
): Promise<{ createdCount: number; skippedCount: number }> {
  const path = `domains/${domainId}/records`;
  const normalizeVal = (val: string) => val.trim().toLowerCase().replace(/\.$/, '');
  const toCreate = drafts.filter(
    (d) =>
      !existingRecords.some(
        (ex) =>
          ex.type === d.type &&
          ex.host.trim().toLowerCase() === d.host.trim().toLowerCase() &&
          normalizeVal(ex.value) === normalizeVal(d.value)
      )
  );
  const skippedCount = drafts.length - toCreate.length;
  const cleanTarget = target.trim().slice(0, BLUEPRINT_LIMITS.PAGES_TARGET_MAX);
  const providerName = getPagesProviderLabel(provider);

  try {
    if (toCreate.length === 0) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'domains', domainId), {
        pagesProvider: provider,
        pagesTarget: cleanTarget,
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'domains', domainId, 'auditLogs', generateDocId('log')),
        buildAuditLogPayload(uid, domainId, {
          action: 'pages_provision',
          targetType: 'pages',
          targetLabel: `${providerName} · ${domainName}`,
          summary: `Cập nhật cấu hình ${providerName} (${cleanTarget}); toàn bộ ${skippedCount} bản ghi chuẩn đã tồn tại.`,
          afterSummary: `${providerName} → ${cleanTarget}`,
        })
      );
      await batch.commit();
      return { createdCount: 0, skippedCount };
    }

    let createdCount = 0;
    for (let i = 0; i < toCreate.length; i += 350) {
      const chunk = toCreate.slice(i, i + 350);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const recId = generateDocId('rec');
        batch.set(
          doc(db, 'domains', domainId, 'records', recId),
          buildRecordPayload(uid, domainId, item, true)
        );
      }

      if (i === 0) {
        batch.update(doc(db, 'domains', domainId), {
          pagesProvider: provider,
          pagesTarget: cleanTarget,
          recordCount: increment(chunk.length),
          updatedAt: serverTimestamp(),
        });
        batch.set(
          doc(db, 'domains', domainId, 'auditLogs', generateDocId('log')),
          buildAuditLogPayload(uid, domainId, {
            action: 'pages_provision',
            targetType: 'pages',
            targetLabel: `${providerName} · ${domainName}`,
            summary: `Phát hành ${toCreate.length} bản ghi Pages Web cho ${providerName}${skippedCount > 0 ? ` (bỏ qua ${skippedCount} bản ghi trùng)` : ''}.`,
            afterSummary: `${providerName} → ${cleanTarget} (${toCreate.length} bản ghi mới)`,
          })
        );
      } else {
        batch.update(doc(db, 'domains', domainId), {
          recordCount: increment(chunk.length),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      createdCount += chunk.length;
    }

    return { createdCount, skippedCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeDomainDeployments(
  uid: string,
  domainId: string,
  onData: (deployments: PagesDeployment[]) => void
): Unsubscribe {
  const path = `domains/${domainId}/deployments`;
  const q = query(collection(db, 'domains', domainId, 'deployments'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PagesDeployment, 'id'>) }))
        .sort((a, b) => {
          const ta = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const tb = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return tb - ta;
        });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createPagesDeployment(
  uid: string,
  domainId: string,
  domainName: string,
  input: {
    repoFullName: string;
    branch: string;
    sourceDir: string;
    commitSha: string;
    liveReviewUrl: string;
    githubPagesUrl: string;
    customDomainUrl: string;
    status: PagesDeploymentStatus;
    pagesApiStatus: string;
  }
): Promise<string> {
  const depId = generateDocId('dep');
  const logId = generateDocId('log');
  const path = `domains/${domainId}/deployments/${depId}`;

  const cleanRepo = input.repoFullName.trim().slice(0, 140);
  const cleanBranch = (input.branch.trim() || 'main').slice(0, BLUEPRINT_LIMITS.DEPLOYMENT_BRANCH_MAX);
  const cleanDir = (input.sourceDir.trim() || '/').slice(0, BLUEPRINT_LIMITS.DEPLOYMENT_DIR_MAX);
  const cleanSha = (input.commitSha.trim() || 'HEAD').slice(0, BLUEPRINT_LIMITS.DEPLOYMENT_SHA_MAX);
  const cleanReviewUrl = input.liveReviewUrl.trim().slice(0, BLUEPRINT_LIMITS.FORWARD_URL_MAX);
  const cleanPagesUrl = input.githubPagesUrl.trim().slice(0, BLUEPRINT_LIMITS.FORWARD_URL_MAX);
  const cleanCustomUrl = input.customDomainUrl.trim().slice(0, BLUEPRINT_LIMITS.FORWARD_URL_MAX);
  const cleanApiStatus = (input.pagesApiStatus.trim() || 'Đã tạo bản xem trước Live Review').slice(
    0,
    BLUEPRINT_LIMITS.DEPLOYMENT_STATUS_MAX
  );

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'domains', domainId, 'deployments', depId), {
      ownerId: uid,
      domainId,
      repoFullName: cleanRepo,
      branch: cleanBranch,
      sourceDir: cleanDir,
      commitSha: cleanSha,
      liveReviewUrl: cleanReviewUrl,
      githubPagesUrl: cleanPagesUrl,
      customDomainUrl: cleanCustomUrl,
      status: input.status,
      pagesApiStatus: cleanApiStatus,
      createdAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'domains', domainId, 'auditLogs', logId),
      buildAuditLogPayload(uid, domainId, {
        action: 'github_deploy',
        targetType: 'pages',
        targetLabel: `${cleanRepo}@${cleanBranch}`,
        summary: `Triển khai GitHub Pages từ ${cleanRepo} (${cleanBranch}, ${cleanDir}) và cấp URL Live Review cho ${domainName}.`,
        afterSummary: `${cleanReviewUrl} (SHA ${cleanSha.slice(0, 7)})`,
      })
    );
    await batch.commit();
    return depId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
