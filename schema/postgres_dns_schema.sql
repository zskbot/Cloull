-- Lược đồ PostgreSQL cho Hệ thống Quản lý DNS Đa người thuê (Multi-tenant Enterprise DNS)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Người dùng & Xác thực
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(254) NOT NULL UNIQUE,
    display_name    VARCHAR(100) NOT NULL,
    password_hash   TEXT,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    totp_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    totp_secret_enc TEXT,
    default_ttl     INTEGER NOT NULL DEFAULT 3600 CHECK (default_ttl BETWEEN 60 AND 604800),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- 2. Tổ chức / Không gian làm việc (Multi-tenant Isolation)
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(120) NOT NULL,
    slug            VARCHAR(80) NOT NULL UNIQUE,
    owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_tier       VARCHAR(32) NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Vai trò & Phân quyền (RBAC)
CREATE TABLE roles (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            VARCHAR(40) NOT NULL UNIQUE, -- owner, admin, dns_editor, viewer
    description     TEXT NOT NULL,
    permissions     JSONB NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO roles (code, description, permissions) VALUES
('owner',      'Toàn quyền tổ chức, thanh toán và xóa tên miền', '{"domains":"*","records":"*","members":"*"}'),
('admin',      'Quản trị tên miền, bản ghi và thành viên',       '{"domains":"*","records":"*","members":"read,write"}'),
('dns_editor', 'Thêm, sửa, xóa bản ghi DNS trong vùng được gán',  '{"domains":"read","records":"read,write"}'),
('viewer',     'Chỉ xem cấu hình vùng và báo cáo DNS',            '{"domains":"read","records":"read"}');

CREATE TABLE organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members (user_id, organization_id);

-- 4. Tên miền (Zones)
CREATE TYPE domain_status AS ENUM ('active', 'pending', 'warning', 'suspended');
CREATE TYPE health_status AS ENUM ('unknown', 'healthy', 'warning', 'critical');

CREATE TABLE domains (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    name                VARCHAR(253) NOT NULL,
    status              domain_status NOT NULL DEFAULT 'pending',
    soa_serial          BIGINT NOT NULL DEFAULT 1,
    default_ttl         INTEGER NOT NULL DEFAULT 3600 CHECK (default_ttl BETWEEN 60 AND 604800),
    dnssec_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    tags                TEXT[] NOT NULL DEFAULT '{}',
    notes               VARCHAR(500) NOT NULL DEFAULT '',
    last_health_status  health_status NOT NULL DEFAULT 'unknown',
    last_health_summary VARCHAR(300) NOT NULL DEFAULT '',
    last_health_check_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_domains_name UNIQUE (name)
);

CREATE INDEX idx_domains_org_status ON domains (organization_id, status);
CREATE INDEX idx_domains_tags_gin ON domains USING GIN (tags);

-- Phân quyền chi tiết theo từng tên miền (ghi đè vai trò tổ chức nếu cần)
CREATE TABLE domain_member_overrides (
    domain_id       UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    PRIMARY KEY (domain_id, user_id)
);

-- 5. Bản ghi DNS (Hỗ trợ chuẩn & nâng cao)
CREATE TYPE dns_record_type AS ENUM (
    'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA', 'SPF',
    'ALIAS', 'DS', 'HINFO', 'HTTPS', 'NAPTR', 'RP', 'SSHFP', 'SVCB', 'TLSA'
);

CREATE TABLE dns_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id       UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    type            dns_record_type NOT NULL,
    host            VARCHAR(253) NOT NULL,   -- '@', 'www', '_dmarc', '*'
    fqdn            VARCHAR(253) NOT NULL,   -- Tên đầy đủ phục vụ máy chủ phân giải tra cứu nhanh
    value           TEXT NOT NULL,
    ttl             INTEGER NOT NULL DEFAULT 3600 CHECK (ttl BETWEEN 60 AND 604800),
    priority        INTEGER CHECK (priority BETWEEN 0 AND 65535),
    weight          INTEGER CHECK (weight BETWEEN 0 AND 65535),
    port            INTEGER CHECK (port BETWEEN 0 AND 65535),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb, -- Tham số CAA, DS, SSHFP, TLSA
    tags            TEXT[] NOT NULL DEFAULT '{}',
    notes           VARCHAR(300) NOT NULL DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục hiệu năng cao cho Control Plane và DNS Engine (PowerDNS/CoreDNS)
CREATE INDEX idx_records_domain_type_host ON dns_records (domain_id, type, host);
CREATE INDEX idx_records_lookup_fqdn ON dns_records (fqdn, type) WHERE is_active = TRUE;
CREATE INDEX idx_records_tags_gin ON dns_records USING GIN (tags);
CREATE INDEX idx_records_metadata_gin ON dns_records USING GIN (metadata);

-- 6. Chuyển tiếp Web (Web Forwarding)
CREATE TABLE web_forwards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id       UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    source_host     VARCHAR(253) NOT NULL,
    target_url      VARCHAR(1024) NOT NULL CHECK (target_url ~ '^https?://.+'),
    redirect_code   SMALLINT NOT NULL DEFAULT 301 CHECK (redirect_code IN (301, 302)),
    preserve_path   BOOLEAN NOT NULL DEFAULT TRUE,
    is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forwards_domain ON web_forwards (domain_id, is_enabled);

-- 7. Nhật ký kiểm toán (Audit Logs)
CREATE TABLE audit_logs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain_id       UUID REFERENCES domains(id) ON DELETE SET NULL,
    actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(64) NOT NULL, -- RECORD_CREATE, RECORD_UPDATE, ZONE_IMPORT...
    target_type     VARCHAR(32) NOT NULL,
    target_id       TEXT,
    diff_payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org_time ON audit_logs (organization_id, created_at DESC);
CREATE INDEX idx_audit_domain_time ON audit_logs (domain_id, created_at DESC);
