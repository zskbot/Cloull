/**
 * Bộ kiểm thử đặc tả bảo mật Firestore Rules (Phase 0 - Dirty Dozen)
 * Khớp trực tiếp với security_spec.md và firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED' | 'ALLOW';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Domain Create',
    collectionPath: '/domains/dom_evil',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'victim_uid', name: 'example.com' },
  },
  {
    id: 2,
    name: 'Shadow Field Injection (isVerified)',
    collectionPath: '/domains/dom_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', name: 'example.com', isVerified: true },
  },
  {
    id: 3,
    name: 'Unverified Email Bypass on UserProfile',
    collectionPath: '/users/user_a',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'user_a', email: 'a@example.com' },
  },
  {
    id: 4,
    name: 'ID Poisoning with Invalid Characters',
    collectionPath: '/domains/invalid$id!name',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphan Record Write under Another Owner Domain',
    collectionPath: '/domains/victim_dom/records/rec_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'attacker_uid', domainId: 'victim_dom', type: 'A', host: '@', value: '1.1.1.1', ttl: 300 },
  },
  {
    id: 6,
    name: 'Parent Domain Mismatch in Record',
    collectionPath: '/domains/dom_a/records/rec_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', domainId: 'dom_b', type: 'A', host: '@', value: '1.1.1.1', ttl: 300 },
  },
  {
    id: 7,
    name: 'Immutable ownerId Tampering on Update',
    collectionPath: '/domains/dom_a',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_b' },
  },
  {
    id: 8,
    name: 'Client Timestamp Forgery',
    collectionPath: '/domains/dom_a',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 9,
    name: 'Value Poisoning on Update (negative TTL)',
    collectionPath: '/domains/dom_a/records/rec_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { ttl: -10 },
  },
  {
    id: 10,
    name: 'Array Exhaustion on Tags (>10 items)',
    collectionPath: '/domains/dom_a',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { tags: Array.from({ length: 12 }, (_, i) => `tag-${i}`) },
  },
  {
    id: 11,
    name: 'PII Cross-User Read / Blanket List',
    collectionPath: '/users',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Invalid Security Subdocument ID or TOTP Secret',
    collectionPath: '/users/user_a/security/custom',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { ownerId: 'user_a', secret: 'lowercase_invalid' },
  },
  {
    id: 13,
    name: 'Audit Log Immutability Tampering (Update/Delete Blocked)',
    collectionPath: '/domains/dom_a/auditLogs/log_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { summary: 'tampered log' },
  },
  {
    id: 14,
    name: 'Pages Deployment Invalid Scheme Rejection (javascript:)',
    collectionPath: '/domains/dom_a/deployments/dep_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { liveReviewUrl: 'javascript:alert(1)' },
  },
];
