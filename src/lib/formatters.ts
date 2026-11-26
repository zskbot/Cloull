import type { Timestamp } from 'firebase/firestore';
import type {
  AuditLogAction,
  DomainStatus,
  HealthStatus,
  PagesProvider,
  VerificationStatus,
} from '../types/dns';

export function formatTimestampVi(ts?: Timestamp | string | null): string {
  if (!ts) return 'Chưa có';
  const date = typeof ts === 'string' ? new Date(ts) : ts.toDate();
  if (Number.isNaN(date.getTime())) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateVi(ts?: Timestamp | string | null): string {
  if (!ts) return 'Chưa đặt';
  const date = typeof ts === 'string' ? new Date(ts) : ts.toDate();
  if (Number.isNaN(date.getTime())) return 'Chưa đặt';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function getDomainExpiryMeta(
  expiresAt?: Timestamp | null,
  soonThresholdDays = 30
): {
  hasExpiry: boolean;
  daysRemaining: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  label: string;
  colorClass: string;
} {
  if (!expiresAt) {
    return {
      hasExpiry: false,
      daysRemaining: null,
      isExpired: false,
      isExpiringSoon: false,
      label: 'Chưa khai báo hạn',
      colorClass: 'text-slate-500',
    };
  }
  const expDate = expiresAt.toDate();
  if (Number.isNaN(expDate.getTime())) {
    return {
      hasExpiry: false,
      daysRemaining: null,
      isExpired: false,
      isExpiringSoon: false,
      label: 'Chưa khai báo hạn',
      colorClass: 'text-slate-500',
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfExpiry = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate()).getTime();
  const daysRemaining = Math.round((startOfExpiry - startOfToday) / (24 * 60 * 60 * 1000));

  if (daysRemaining < 0) {
    return {
      hasExpiry: true,
      daysRemaining,
      isExpired: true,
      isExpiringSoon: true,
      label: `Đã hết hạn ${Math.abs(daysRemaining)} ngày`,
      colorClass: 'text-red-700',
    };
  }
  if (daysRemaining === 0) {
    return {
      hasExpiry: true,
      daysRemaining: 0,
      isExpired: false,
      isExpiringSoon: true,
      label: 'Hết hạn hôm nay',
      colorClass: 'text-red-700',
    };
  }
  if (daysRemaining <= soonThresholdDays) {
    return {
      hasExpiry: true,
      daysRemaining,
      isExpired: false,
      isExpiringSoon: true,
      label: `Còn ${daysRemaining} ngày`,
      colorClass: 'text-amber-700',
    };
  }
  return {
    hasExpiry: true,
    daysRemaining,
    isExpired: false,
    isExpiringSoon: false,
    label: `Còn ${daysRemaining} ngày`,
    colorClass: 'text-emerald-700',
  };
}

export function getDomainStatusLabel(status: DomainStatus): { text: string; colorClass: string } {
  switch (status) {
    case 'active':
      return { text: 'Đang hoạt động', colorClass: 'text-emerald-700' };
    case 'warning':
      return { text: 'Cần kiểm tra', colorClass: 'text-amber-700' };
    case 'pending':
    default:
      return { text: 'Chờ xác minh', colorClass: 'text-slate-600' };
  }
}

export function getHealthStatusLabel(status: HealthStatus): { text: string; colorClass: string } {
  switch (status) {
    case 'healthy':
      return { text: 'Bình thường', colorClass: 'text-emerald-700' };
    case 'warning':
      return { text: 'Có cảnh báo', colorClass: 'text-amber-700' };
    case 'critical':
      return { text: 'Lỗi ủy quyền', colorClass: 'text-red-700' };
    case 'unknown':
    default:
      return { text: 'Chưa kiểm tra', colorClass: 'text-slate-500' };
  }
}

export function getVerificationStatusLabel(status?: VerificationStatus): {
  text: string;
  colorClass: string;
} {
  switch (status) {
    case 'verified':
      return { text: 'Đã xác thực', colorClass: 'text-emerald-700' };
    case 'pending':
      return { text: 'Đang chờ xác thực DNS', colorClass: 'text-amber-700' };
    case 'unverified':
    default:
      return { text: 'Chưa xác thực', colorClass: 'text-slate-500' };
  }
}

export function getPagesProviderLabel(provider?: PagesProvider): string {
  switch (provider) {
    case 'github':
      return 'GitHub Pages';
    case 'cloudflare':
      return 'Cloudflare Pages';
    case 'vercel':
      return 'Vercel';
    case 'firebase':
      return 'Firebase Hosting';
    case 'none':
    default:
      return 'Chưa cấu hình';
  }
}

export function getAuditActionLabel(action: AuditLogAction): {
  text: string;
  badgeClass: string;
} {
  switch (action) {
    case 'domain_create':
      return { text: 'Khởi tạo tên miền', badgeClass: 'bg-slate-100 text-slate-800 border-slate-300' };
    case 'record_create':
      return { text: 'Thêm bản ghi', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'record_update':
      return { text: 'Cập nhật bản ghi', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'record_delete':
      return { text: 'Xóa bản ghi', badgeClass: 'bg-red-50 text-red-700 border-red-200' };
    case 'record_duplicate':
      return { text: 'Nhân bản bản ghi', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'bulk_import':
      return { text: 'Nhập hàng loạt', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'forward_create':
      return { text: 'Tạo chuyển tiếp', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'forward_toggle':
      return { text: 'Đổi trạng thái chuyển tiếp', badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200' };
    case 'forward_delete':
      return { text: 'Xóa chuyển tiếp', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'domain_verify_init':
      return { text: 'Tạo mã xác thực', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200' };
    case 'domain_verified':
      return { text: 'Xác thực thành công', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
    case 'pages_provision':
      return { text: 'Phát hành Pages Web', badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200' };
    case 'github_deploy':
      return { text: 'Triển khai GitHub Pages', badgeClass: 'bg-teal-50 text-teal-800 border-teal-200' };
    default:
      return { text: action, badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' };
  }
}
