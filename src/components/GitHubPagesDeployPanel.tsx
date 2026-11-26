import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Globe,
  History,
  Link2,
  LogOut,
  RefreshCw,
  Rocket,
  ShieldAlert,
} from 'lucide-react';
import {
  createPagesDeployment,
  provisionPagesRecords,
  subscribeDomainDeployments,
} from '../lib/dnsService';
import { buildPagesRecordsPreset } from '../lib/dnsValidation';
import { formatTimestampVi } from '../lib/formatters';
import type {
  DnsRecord,
  Domain,
  GitHubBranchSummary,
  GitHubDeployResponse,
  GitHubRepoSummary,
  GitHubUser,
  PagesDeployment,
  PagesDeploymentStatus,
} from '../types/dns';

interface GitHubPagesDeployPanelProps {
  uid: string;
  domain: Domain;
  activeRecords: DnsRecord[];
  defaultTtl: number;
  onNotify: (msg: string) => void;
}

type SourceDirOption = 'auto' | '/' | 'dist' | 'build' | 'docs' | 'public';

function getDeploymentStatusMeta(status: PagesDeploymentStatus): { text: string; colorClass: string } {
  switch (status) {
    case 'live':
      return { text: 'Đang chạy Live Review', colorClass: 'text-emerald-700' };
    case 'configured':
      return { text: 'Đã cấp Live Review', colorClass: 'text-blue-700' };
    case 'failed':
    default:
      return { text: 'Thất bại', colorClass: 'text-red-700' };
  }
}

export function GitHubPagesDeployPanel({
  uid,
  domain,
  activeRecords,
  defaultTtl,
  onNotify,
}: GitHubPagesDeployPanelProps) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [ghSessionToken, setGhSessionToken] = useState<string>('');
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState('');

  const [branches, setBranches] = useState<GitHubBranchSummary[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('main');

  const [sourceDir, setSourceDir] = useState<SourceDirOption>('auto');
  const [enablePagesApi, setEnablePagesApi] = useState(true);
  const [writeCnameFile, setWriteCnameFile] = useState(true);
  const [syncDnsRecords, setSyncDnsRecords] = useState(true);

  const [authLoading, setAuthLoading] = useState(false);
  const [deployLoading, setDeployLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [latestLiveFileCount, setLatestLiveFileCount] = useState<number | null>(null);
  const [deployments, setDeployments] = useState<PagesDeployment[]>([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const buildAuthHeaders = useCallback(
    (extra: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...extra };
      if (ghSessionToken) {
        headers['X-GitHub-Session'] = ghSessionToken;
      }
      return headers;
    },
    [ghSessionToken]
  );

  const copyText = async (key: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  useEffect(() => {
    setDeploymentsLoading(true);
    const unsub = subscribeDomainDeployments(uid, domain.id, (list) => {
      setDeployments(list);
      setDeploymentsLoading(false);
    });
    return () => unsub();
  }, [uid, domain.id]);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/auth/github/status', {
        headers: buildAuthHeaders(),
        credentials: 'include',
      });
      const data = (await res.json()) as {
        oauthConfigured?: boolean;
        connected?: boolean;
        user?: GitHubUser | null;
        callbackUrl?: string;
      };
      setOauthConfigured(Boolean(data.oauthConfigured));
      if (data.callbackUrl) {
        setCallbackUrl(data.callbackUrl);
      }
      if (data.connected && data.user) {
        setGhUser(data.user);
        setAvatarFailed(false);
      } else if (!ghSessionToken) {
        setGhUser(null);
      }
    } catch {
      // Giữ trạng thái hiện tại nếu mạng tạm gián đoạn
    } finally {
      setStatusLoading(false);
    }
  }, [buildAuthHeaders, ghSessionToken]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const fetchRepos = useCallback(
    async (overrideToken?: string) => {
      setReposLoading(true);
      setErrorMsg(null);
      try {
        const headers: Record<string, string> = {};
        const tokenToUse = overrideToken ?? ghSessionToken;
        if (tokenToUse) {
          headers['X-GitHub-Session'] = tokenToUse;
        }
        const res = await fetch('/api/github/repos', {
          headers,
          credentials: 'include',
        });
        const data = (await res.json()) as { repos?: GitHubRepoSummary[]; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Không tải được danh sách kho lưu trữ GitHub.');
        }
        const repoList = data.repos || [];
        setRepos(repoList);
        if (repoList.length > 0) {
          setSelectedRepo((prev) =>
            prev && repoList.some((r) => r.fullName === prev) ? prev : repoList[0].fullName
          );
        } else {
          setSelectedRepo('');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải danh sách repository GitHub.');
      } finally {
        setReposLoading(false);
      }
    },
    [ghSessionToken]
  );

  useEffect(() => {
    if (ghUser) {
      void fetchRepos();
    }
  }, [ghUser, fetchRepos]);

  useEffect(() => {
    if (!ghUser || !selectedRepo) {
      setBranches([]);
      return;
    }

    let cancelled = false;
    const loadBranches = async () => {
      setBranchesLoading(true);
      try {
        const res = await fetch(
          `/api/github/branches?repo=${encodeURIComponent(selectedRepo)}`,
          {
            headers: buildAuthHeaders(),
            credentials: 'include',
          }
        );
        const data = (await res.json()) as { branches?: GitHubBranchSummary[]; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Không tải được danh sách nhánh.');
        }
        if (cancelled) return;
        const list = data.branches || [];
        setBranches(list);

        const activeRepoObj = repos.find((r) => r.fullName === selectedRepo);
        const preferredBranch = activeRepoObj?.defaultBranch || 'main';
        if (list.some((b) => b.name === preferredBranch)) {
          setSelectedBranch(preferredBranch);
        } else if (list.length > 0) {
          setSelectedBranch(list[0].name);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải danh sách nhánh GitHub.');
        }
      } finally {
        if (!cancelled) {
          setBranchesLoading(false);
        }
      }
    };

    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [ghUser, selectedRepo, repos, buildAuthHeaders]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      const isAllowedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost');
      if (!isAllowedOrigin) return;

      const payload = event.data as
        | { type?: string; sessionToken?: string; user?: GitHubUser; error?: string }
        | undefined;
      if (!payload || typeof payload.type !== 'string') return;

      if (payload.type === 'GITHUB_OAUTH_SUCCESS' && payload.user) {
        setAuthLoading(false);
        setErrorMsg(null);
        setAvatarFailed(false);
        if (payload.sessionToken) {
          setGhSessionToken(payload.sessionToken);
        }
        setGhUser(payload.user);
        onNotify(`Đã kết nối tài khoản GitHub @${payload.user.login}.`);
        void fetchRepos(payload.sessionToken);
      } else if (payload.type === 'GITHUB_OAUTH_ERROR') {
        setAuthLoading(false);
        setErrorMsg(payload.error || 'Ủy quyền GitHub OAuth không thành công.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchRepos, onNotify]);

  const handleConnectGitHub = async () => {
    setAuthLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/github/url', {
        credentials: 'include',
      });
      const data = (await res.json()) as { url?: string; callbackUrl?: string; error?: string };
      if (data.callbackUrl) {
        setCallbackUrl(data.callbackUrl);
      }
      if (!res.ok || !data.url) {
        setOauthConfigured(false);
        setAuthLoading(false);
        setErrorMsg(
          data.error ||
            'Chưa cấu hình GitHub OAuth (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET) trên máy chủ.'
        );
        return;
      }

      const popup = window.open(
        data.url,
        'github_oauth_popup',
        'width=640,height=740,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes'
      );
      if (!popup) {
        setAuthLoading(false);
        setErrorMsg('Trình duyệt đang chặn cửa sổ bật lên. Vui lòng cho phép popup rồi thử lại.');
        return;
      }
      popup.focus();
    } catch (err) {
      setAuthLoading(false);
      setErrorMsg(err instanceof Error ? err.message : 'Không thể khởi tạo phiên GitHub OAuth.');
    }
  };

  const handleDisconnectGitHub = async () => {
    setErrorMsg(null);
    try {
      await fetch('/api/auth/github/logout', {
        method: 'POST',
        headers: buildAuthHeaders({ 'X-Requested-With': 'XMLHttpRequest' }),
        credentials: 'include',
      });
    } catch {
      // Bỏ qua lỗi mạng khi dọn phiên phía client
    } finally {
      setGhSessionToken('');
      setGhUser(null);
      setRepos([]);
      setBranches([]);
      setSelectedRepo('');
      onNotify('Đã ngắt kết nối tài khoản GitHub khỏi phiên hiện tại.');
    }
  };

  const handleDeployPages = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ghUser) {
      setErrorMsg('Vui lòng kết nối tài khoản GitHub trước khi triển khai.');
      return;
    }
    if (!selectedRepo || !selectedBranch) {
      setErrorMsg('Vui lòng chọn kho lưu trữ và nhánh triển khai.');
      return;
    }

    setDeployLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/github/deploy-pages', {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        }),
        credentials: 'include',
        body: JSON.stringify({
          repoFullName: selectedRepo,
          branch: selectedBranch,
          sourceDir,
          domainName: domain.name,
          enablePagesApi,
          writeCnameFile,
        }),
      });
      const data = (await res.json()) as GitHubDeployResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Triển khai GitHub Pages và tạo Live Review thất bại.');
      }

      setLatestLiveFileCount(data.fileCount);

      await createPagesDeployment(uid, domain.id, domain.name, {
        repoFullName: data.repoFullName,
        branch: data.branch,
        sourceDir: data.sourceDir,
        commitSha: data.commitSha,
        liveReviewUrl: data.liveReviewUrl,
        githubPagesUrl: data.githubPagesUrl,
        customDomainUrl: data.customDomainUrl,
        status: data.status,
        pagesApiStatus: data.pagesApiStatus,
      });

      let dnsSummary = '';
      if (syncDnsRecords) {
        const ownerLogin = data.repoFullName.split('/')[0] || ghUser.login;
        const targetHost = `${ownerLogin.toLowerCase()}.github.io`;
        const preset = buildPagesRecordsPreset('github', targetHost, domain.name, {
          includeWww: true,
          includeIpv6: false,
          ttl: defaultTtl,
        });
        if (!preset.error && preset.records.length > 0) {
          const syncRes = await provisionPagesRecords(
            uid,
            domain.id,
            domain.name,
            'github',
            targetHost,
            preset.records,
            activeRecords
          );
          dnsSummary =
            syncRes.createdCount > 0
              ? ` Đã đồng bộ thêm ${syncRes.createdCount} bản ghi DNS GitHub Pages.`
              : ' Bộ bản ghi DNS GitHub Pages đã sẵn sàng.';
        }
      }

      onNotify(
        `Đã cấp URL Live Review (${data.fileCount} tệp) từ ${data.repoFullName}@${data.branch}.${dnsSummary}`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Lỗi trong quá trình triển khai GitHub Pages.'
      );
    } finally {
      setDeployLoading(false);
    }
  };

  const activeDeployment = useMemo(() => deployments[0] || null, [deployments]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 @md:p-6 space-y-5">
      {/* Tiêu đề & trạng thái tài khoản GitHub OAuth */}
      <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-blue-700" />
            <h3 className="text-base font-semibold text-slate-900">
              Tích hợp GitHub Pages &amp; Cấp URL Live Review
            </h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Kết nối GitHub OAuth để chọn kho lưu trữ, phát hành GitHub Pages cho{' '}
            <span className="font-mono text-slate-700">{domain.name}</span> và cấp ngay URL Live Review trực tiếp trên máy chủ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {statusLoading ? (
            <span className="text-xs text-slate-500">Đang kiểm tra kết nối GitHub...</span>
          ) : ghUser ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                {ghUser.avatarUrl && !avatarFailed ? (
                  <img
                    src={ghUser.avatarUrl}
                    alt={ghUser.login}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-6 h-6 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center">
                    {ghUser.login.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="text-xs leading-tight">
                  <div className="font-semibold text-slate-900">{ghUser.name}</div>
                  <div className="font-mono text-[11px] text-slate-500">@{ghUser.login}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDisconnectGitHub}
                className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] @md:min-h-0 @md:py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                <LogOut className="w-3.5 h-3.5" />
                Ngắt kết nối
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={authLoading || !oauthConfigured}
              onClick={handleConnectGitHub}
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] @md:min-h-0 @md:py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md whitespace-nowrap"
            >
              <FolderGit2 className="w-4 h-4" />
              {authLoading ? 'Đang chờ xác thực...' : 'Kết nối tài khoản GitHub'}
            </button>
          )}
        </div>
      </div>

      {/* Hướng dẫn cấu hình OAuth khi chưa đặt Secrets */}
      {!statusLoading && !oauthConfigured && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-md space-y-2.5 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                Chưa cấu hình GitHub OAuth App trong biến môi trường máy chủ
              </p>
              <p className="leading-relaxed text-amber-800">
                Vui lòng tạo GitHub OAuth App, đăng ký Callback URL bên dưới và thêm hai biến bí mật{' '}
                <span className="font-mono font-semibold">GITHUB_CLIENT_ID</span> và{' '}
                <span className="font-mono font-semibold">GITHUB_CLIENT_SECRET</span> vào phần Secrets của ứng dụng.
              </p>
            </div>
          </div>

          {callbackUrl && (
            <div className="flex flex-col @sm:flex-row @sm:items-center justify-between gap-2 p-2.5 bg-white border border-amber-200 rounded">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500">Authorization Callback URL:</div>
                <div className="font-mono text-xs text-slate-900 break-all">{callbackUrl}</div>
              </div>
              <button
                type="button"
                onClick={() => void copyText('callbackUrl', callbackUrl)}
                className="inline-flex items-center justify-center gap-1 px-3 min-h-[36px] @md:min-h-0 @md:py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded shrink-0"
              >
                {copiedKey === 'callbackUrl' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedKey === 'callbackUrl' ? 'Đã chép' : 'Sao chép URL'}
              </button>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Biểu mẫu chọn Repo / Branch / Thư mục build khi đã kết nối GitHub */}
      {ghUser && (
        <form onSubmit={handleDeployPages} className="space-y-4">
          <div className="grid grid-cols-1 @md:grid-cols-12 gap-4">
            <div className="@md:col-span-5 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700">
                  Kho lưu trữ GitHub (Repository)
                </label>
                <button
                  type="button"
                  disabled={reposLoading}
                  onClick={() => void fetchRepos()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${reposLoading ? 'animate-spin' : ''}`} />
                  Làm mới
                </button>
              </div>
              <select
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                disabled={reposLoading || repos.length === 0}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
              >
                {repos.length === 0 ? (
                  <option value="">
                    {reposLoading ? 'Đang tải kho lưu trữ...' : 'Chưa có kho lưu trữ nào'}
                  </option>
                ) : (
                  repos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName} ({r.isPrivate ? 'Riêng tư' : 'Công khai'})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="@md:col-span-3 space-y-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-slate-700">
                <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                Nhánh (Branch)
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={branchesLoading || branches.length === 0}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
              >
                {branches.length === 0 ? (
                  <option value={selectedBranch}>
                    {branchesLoading ? 'Đang tải...' : selectedBranch}
                  </option>
                ) : (
                  branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="@md:col-span-4 space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Thư mục tĩnh xuất bản
              </label>
              <select
                value={sourceDir}
                onChange={(e) => setSourceDir(e.target.value as SourceDirOption)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="auto">Tự động phát hiện (dist, build, docs, /)</option>
                <option value="/">Thư mục gốc (/)</option>
                <option value="dist">dist/</option>
                <option value="build">build/</option>
                <option value="docs">docs/</option>
                <option value="public">public/</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enablePagesApi}
                onChange={(e) => setEnablePagesApi(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Kích hoạt GitHub Pages qua API
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={writeCnameFile}
                onChange={(e) => setWriteCnameFile(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Ghi tệp <span className="font-mono">CNAME</span> ({domain.name}) vào nhánh
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncDnsRecords}
                onChange={(e) => setSyncDnsRecords(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Tự động đồng bộ bản ghi DNS GitHub Pages
            </label>
          </div>

          <div className="flex flex-col @sm:flex-row @sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500">
              Hệ thống trích xuất bản tĩnh từ commit mới nhất, dựng URL Live Review và ghi nhật ký kiểm toán.
            </p>
            <button
              type="submit"
              disabled={deployLoading || !selectedRepo || !selectedBranch}
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] @md:min-h-0 @md:py-2.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
            >
              <Rocket className={`w-3.5 h-3.5 ${deployLoading ? 'animate-pulse' : ''}`} />
              {deployLoading
                ? 'Đang triển khai & dựng Live Review...'
                : 'Triển khai Pages & Cấp URL Live Review'}
            </button>
          </div>
        </form>
      )}

      {/* Khối URL kết quả triển khai gần nhất */}
      {activeDeployment && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
          <div className="flex flex-col @sm:flex-row @sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Link2 className="w-4 h-4 text-blue-700" />
              <span>
                Bản triển khai hiện tại: <span className="font-mono">{activeDeployment.repoFullName}</span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="font-mono text-slate-600">
                  {activeDeployment.branch} ({activeDeployment.sourceDir})
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {latestLiveFileCount !== null && (
                <span className="font-mono tabular-nums text-slate-500">
                  {latestLiveFileCount} tệp tĩnh
                </span>
              )}
              <span className="font-mono tabular-nums text-slate-500">
                SHA {activeDeployment.commitSha.slice(0, 7)}
              </span>
              <span className={`font-semibold ${getDeploymentStatusMeta(activeDeployment.status).colorClass}`}>
                {getDeploymentStatusMeta(activeDeployment.status).text}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600">{activeDeployment.pagesApiStatus}</p>

          <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-3">
            {[
              {
                key: 'live',
                label: 'URL Live Review (Máy chủ)',
                url: activeDeployment.liveReviewUrl,
                hint: 'Xem trước tức thì không cần chờ DNS',
                primary: true,
              },
              {
                key: 'ghpages',
                label: 'URL GitHub Pages mặc định',
                url: activeDeployment.githubPagesUrl,
                hint: 'Trang đích xuất bản trên github.io',
                primary: false,
              },
              {
                key: 'custom',
                label: 'URL Tên miền Pages riêng',
                url: activeDeployment.customDomainUrl,
                hint: 'Hoạt động sau khi DNS phân giải',
                primary: false,
              },
            ].map((item) => (
              <div
                key={item.key}
                className={`p-3 rounded-md border bg-white space-y-2 ${
                  item.primary ? 'border-blue-300' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">{item.label}</span>
                  <button
                    type="button"
                    onClick={() => void copyText(item.key, item.url)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded shrink-0"
                  >
                    {copiedKey === item.key ? (
                      <Check className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedKey === item.key ? 'Đã chép' : 'Chép'}
                  </button>
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 text-xs font-mono text-blue-700 hover:text-blue-800 hover:underline break-all"
                >
                  <span className="break-all">{item.url}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>

                <div className="text-[11px] text-slate-500">{item.hint}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lịch sử triển khai & Live Review lưu bền vững trên Firestore */}
      <div className="space-y-2.5 pt-2 border-t border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <History className="w-3.5 h-3.5 text-slate-500" />
            Lịch sử triển khai &amp; Live Review ({deployments.length})
          </div>
          {callbackUrl && oauthConfigured && (
            <span className="hidden @md:inline text-[11px] text-slate-400 font-mono truncate max-w-md">
              Callback: {callbackUrl}
            </span>
          )}
        </div>

        {deploymentsLoading ? (
          <p className="text-xs text-slate-500 py-2">Đang tải lịch sử triển khai...</p>
        ) : deployments.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500 flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Chưa có lượt triển khai GitHub Pages nào cho <span className="font-mono">{domain.name}</span>. Kết nối GitHub OAuth phía trên để cấp URL Live Review đầu tiên.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md overflow-hidden">
            {deployments.map((dep) => {
              const statusMeta = getDeploymentStatusMeta(dep.status);
              return (
                <div
                  key={dep.id}
                  className="p-3.5 bg-white flex flex-col @lg:flex-row @lg:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{dep.repoFullName}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-slate-700">
                        {dep.branch} ({dep.sourceDir})
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {dep.commitSha.slice(0, 7)}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className={`font-medium ${statusMeta.colorClass}`}>{statusMeta.text}</span>
                    </div>
                    <div className="text-slate-500 flex flex-wrap items-center gap-2">
                      <span className="font-mono tabular-nums">{formatTimestampVi(dep.createdAt)}</span>
                      <span className="text-slate-300">·</span>
                      <span>{dep.pagesApiStatus}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={dep.liveReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 min-h-[36px] @md:min-h-0 @md:py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md"
                    >
                      Mở Live Review
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={dep.githubPagesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 min-h-[36px] @md:min-h-0 @md:py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md"
                    >
                      GitHub Pages
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={dep.customDomainUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 min-h-[36px] @md:min-h-0 @md:py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md"
                    >
                      {domain.name}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
