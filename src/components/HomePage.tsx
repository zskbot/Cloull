import { ArrowRight, Globe2, LockKeyhole, Radar, ShieldCheck, Zap } from 'lucide-react';

const features = [
  { icon: Globe2, title: 'Quản lý DNS', description: 'Quản lý vùng DNS và bản ghi tên miền trong một không gian tập trung.' },
  { icon: Radar, title: 'Giám sát hệ thống', description: 'Theo dõi trạng thái phân giải, phát hiện cấu hình cần được chú ý.' },
  { icon: ShieldCheck, title: 'Bảo mật tài khoản', description: 'Công cụ bảo mật và kiểm soát hoạt động được tổ chức rõ ràng.' },
];

export function HomePage() {
  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center border border-slate-600 bg-slate-900">
              <Globe2 className="h-5 w-5 text-blue-400" />
            </span>
            <span className="text-lg">Cloull</span>
          </a>
          <nav className="flex items-center gap-5 text-sm text-slate-400">
            <a href="#features" className="hidden transition-colors hover:text-white sm:inline">Tính năng</a>
            <a href="/dashboard" className="border border-slate-600 px-4 py-2 text-white transition-colors hover:border-blue-400 hover:bg-blue-500/10">
              Dashboard <ArrowRight className="ml-2 inline h-4 w-4" />
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid min-h-[640px] max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_.9fr]">
          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 border border-blue-400/30 bg-blue-400/5 px-3 py-2 text-xs font-mono uppercase tracking-[.18em] text-blue-300">
              <Zap className="h-3.5 w-3.5" /> DNS control center
            </div>
            <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
              Hạ tầng DNS.
              <span className="block text-blue-400">Trong tầm kiểm soát.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">
              Cloull giúp bạn quản lý tên miền, bản ghi DNS và tình trạng hệ thống từ một dashboard tập trung, rõ ràng và dễ vận hành.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="/dashboard" className="inline-flex min-h-12 items-center border border-blue-500 bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-500">
                Mở Dashboard <ArrowRight className="ml-3 h-4 w-4" />
              </a>
              <a href="#features" className="inline-flex min-h-12 items-center border border-slate-700 px-6 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white">
                Khám phá tính năng
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4" /> Kiểm soát truy cập</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Theo dõi bảo mật</span>
            </div>
          </div>

          <div className="relative border border-slate-700 bg-[#0d141d] p-5 shadow-2xl shadow-blue-950/20 sm:p-7">
            <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-slate-500">Cloull / Overview</p>
                <p className="mt-1 text-sm font-semibold text-slate-200">System snapshot</p>
              </div>
              <span className="flex items-center gap-2 text-xs text-emerald-400"><span className="h-2 w-2 bg-emerald-400" /> Interface preview</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['DOMAINS', '—'],
                ['DNS RECORDS', '—'],
                ['HEALTH CHECKS', '—'],
                ['SECURITY', 'READY'],
              ].map(([label, value]) => (
                <div key={label} className="border border-slate-800 bg-[#101a25] p-4">
                  <p className="text-[10px] font-mono tracking-widest text-slate-500">{label}</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-100">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 border border-slate-800 p-4">
              <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                <span>Infrastructure monitor</span><span className="font-mono">LIVE VIEW</span>
              </div>
              <div className="flex h-24 items-end gap-2 border-b border-slate-800 pb-2">
                {[35, 54, 43, 70, 57, 82, 64, 91, 72, 84, 62, 96, 75, 88, 68, 93].map((height, index) => (
                  <span key={index} className="flex-1 bg-blue-500/60" style={{ height: height + '%' }} />
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-600">Minh họa giao diện · dữ liệu thật hiển thị trong Dashboard</p>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-slate-800 bg-[#0a0f15]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <div className="max-w-xl">
              <p className="text-xs font-mono uppercase tracking-[.2em] text-blue-400">Platform capabilities</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Một nơi để vận hành toàn bộ DNS</h2>
              <p className="mt-4 leading-7 text-slate-400">Tách biệt trang giới thiệu và không gian vận hành để trải nghiệm Cloull luôn mạch lạc.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, title, description }) => (
                <article key={title} className="border border-slate-800 bg-[#0d141d] p-6">
                  <Icon className="h-6 w-6 text-blue-400" />
                  <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-800 px-5 py-7 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Cloull. DNS infrastructure control center.
      </footer>
    </div>
  );
}
