import { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Server,
} from 'lucide-react';
import { formatTimestampVi } from '../lib/formatters';
import type {
  Domain,
  RegionalDnsCheckReport,
  RegionalDnsNodeResult,
  VietnamRegion,
} from '../types/dns';

interface RegionalMapViewProps {
  domains: Domain[];
}

interface VietnamClusterNode {
  id: string;
  region: VietnamRegion;
  city: string;
  label: string;
  role: string;
  datacenter: string;
  resolverIp: string;
  lat: number;
  lng: number;
  capacityLabel: string;
}

const VIETNAM_CLUSTERS: VietnamClusterNode[] = [
  {
    id: 'hanoi-core',
    region: 'bac',
    city: 'Hà Nội',
    label: 'Cụm Lõi Miền Bắc (Hà Nội)',
    role: 'Anycast Core · Trạm trung chuyển VNIX Bắc',
    datacenter: 'Khu CNC Hòa Lạc · Hà Nội',
    resolverIp: '8.8.8.8',
    lat: 21.0285,
    lng: 105.8542,
    capacityLabel: 'Cụm chính Miền Bắc',
  },
  {
    id: 'haiphong-edge',
    region: 'bac',
    city: 'Hải Phòng',
    label: 'Cụm Biên Duyên Hải (Hải Phòng)',
    role: 'Edge Resolver · Cửa ngõ Đông Bắc',
    datacenter: 'Cụm hạ tầng Lạch Tray · Hải Phòng',
    resolverIp: '1.1.1.1',
    lat: 20.8449,
    lng: 106.6881,
    capacityLabel: 'Cụm dự phòng Đông Bắc',
  },
  {
    id: 'danang-relay',
    region: 'trung',
    city: 'Đà Nẵng',
    label: 'Cụm Trung Chuyển (Đà Nẵng)',
    role: 'Regional Relay · Trục cáp quang Miền Trung',
    datacenter: 'Khu CNTT Tập trung · Đà Nẵng',
    resolverIp: '8.8.4.4',
    lat: 16.0544,
    lng: 108.2022,
    capacityLabel: 'Cụm chính Miền Trung',
  },
  {
    id: 'quynhon-pop',
    region: 'trung',
    city: 'Quy Nhơn',
    label: 'Cụm PoP Nam Trung Bộ (Quy Nhơn)',
    role: 'Edge PoP · Duyên hải Nam Trung Bộ',
    datacenter: 'Trạm tuyến ven biển · Quy Nhơn',
    resolverIp: '1.0.0.1',
    lat: 13.7829,
    lng: 109.2197,
    capacityLabel: 'Cụm vệ tinh Miền Trung',
  },
  {
    id: 'hcm-core',
    region: 'nam',
    city: 'TP. Hồ Chí Minh',
    label: 'Cụm Lõi Miền Nam (TP. HCM)',
    role: 'Anycast Core · Trạm trung chuyển VNIX Nam',
    datacenter: 'Khu Công nghệ cao Thủ Đức · TP. HCM',
    resolverIp: '9.9.9.9',
    lat: 10.8231,
    lng: 106.6297,
    capacityLabel: 'Cụm chính Miền Nam',
  },
  {
    id: 'cantho-edge',
    region: 'nam',
    city: 'Cần Thơ',
    label: 'Cụm Biên ĐBSCL (Cần Thơ)',
    role: 'Edge Resolver · Tây Nam Bộ',
    datacenter: 'Trung tâm dữ liệu Cái Răng · Cần Thơ',
    resolverIp: '208.67.222.222',
    lat: 10.0452,
    lng: 105.7469,
    capacityLabel: 'Cụm vệ tinh Miền Nam',
  },
];

const REGION_META: Record<
  VietnamRegion,
  { name: string; pinColor: string; ringColor: string; textColor: string; bgSoft: string }
> = {
  bac: {
    name: 'Miền Bắc',
    pinColor: '#1D4ED8',
    ringColor: '#BFDBFE',
    textColor: 'text-blue-700',
    bgSoft: 'bg-blue-50',
  },
  trung: {
    name: 'Miền Trung',
    pinColor: '#D97706',
    ringColor: '#FDE68A',
    textColor: 'text-amber-700',
    bgSoft: 'bg-amber-50',
  },
  nam: {
    name: 'Miền Nam',
    pinColor: '#059669',
    ringColor: '#A7F3D0',
    textColor: 'text-emerald-700',
    bgSoft: 'bg-emerald-50',
  },
};

// Chiếu tọa độ địa lý Việt Nam (101.8°E–115.5°E, 8.0°N–23.8°N) sang khung SVG 500x660
function projectVnPoint(lat: number, lng: number): { x: number; y: number } {
  const minLng = 101.8;
  const maxLng = 115.5;
  const minLat = 8.0;
  const maxLat = 23.8;
  const x = 36 + ((lng - minLng) / (maxLng - minLng)) * 428;
  const y = 626 - ((lat - minLat) / (maxLat - minLat)) * 586;
  return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
}

function buildPolygonPath(coords: Array<[number, number]>): string {
  return (
    coords
      .map(([lat, lng], i) => {
        const pt = projectVnPoint(lat, lng);
        return `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`;
      })
      .join(' ') + ' Z'
  );
}

// Đường bao địa lý 3 miền Việt Nam theo tọa độ thực (lat, lng)
const NORTH_REGION_COORDS: Array<[number, number]> = [
  [23.38, 105.32],
  [22.8, 106.75],
  [21.55, 108.05],
  [20.75, 106.85],
  [19.8, 105.95],
  [19.2, 105.75],
  [19.4, 104.1],
  [20.4, 104.5],
  [21.4, 103.0],
  [22.45, 102.15],
  [22.85, 103.9],
];

const CENTRAL_REGION_COORDS: Array<[number, number]> = [
  [19.2, 105.75],
  [18.2, 106.35],
  [16.8, 107.35],
  [16.05, 108.35],
  [14.9, 109.0],
  [13.4, 109.32],
  [12.15, 109.32],
  [11.2, 108.7],
  [11.35, 107.55],
  [12.3, 107.6],
  [14.5, 107.55],
  [16.1, 107.1],
  [17.5, 105.7],
  [18.9, 105.0],
  [19.4, 104.1],
];

const SOUTH_REGION_COORDS: Array<[number, number]> = [
  [11.35, 107.55],
  [11.2, 108.7],
  [10.55, 107.55],
  [10.35, 106.85],
  [9.55, 106.55],
  [8.58, 104.82],
  [9.6, 104.85],
  [10.35, 104.4],
  [10.95, 105.1],
  [11.6, 106.0],
  [12.0, 106.85],
];

const PHU_QUOC_COORDS: Array<[number, number]> = [
  [10.42, 103.92],
  [10.38, 104.06],
  [10.02, 104.04],
  [10.05, 103.92],
];

export function RegionalMapView({ domains }: RegionalMapViewProps) {
  const [regionFilter, setRegionFilter] = useState<'all' | VietnamRegion>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('hanoi-core');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const [targetFqdn, setTargetFqdn] = useState<string>(domains[0]?.name || 'google.com');
  const [targetType, setTargetType] = useState<string>('A');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [report, setReport] = useState<RegionalDnsCheckReport | null>(null);

  const visibleNodes = useMemo(
    () =>
      regionFilter === 'all'
        ? VIETNAM_CLUSTERS
        : VIETNAM_CLUSTERS.filter((n) => n.region === regionFilter),
    [regionFilter]
  );

  const selectedNode = useMemo(
    () => VIETNAM_CLUSTERS.find((n) => n.id === selectedNodeId) || VIETNAM_CLUSTERS[0],
    [selectedNodeId]
  );

  const resultMap = useMemo(() => {
    const map = new Map<string, RegionalDnsNodeResult>();
    if (report) {
      report.nodes.forEach((n) => map.set(n.id, n));
    }
    return map;
  }, [report]);

  const selectedLiveResult = resultMap.get(selectedNode.id) || null;

  const avgLatency = useMemo(() => {
    if (!report || report.nodes.length === 0) return null;
    const sum = report.nodes.reduce((acc, n) => acc + n.latencyMs, 0);
    return Math.round(sum / report.nodes.length);
  }, [report]);

  const resolvedCount = useMemo(() => {
    if (!report) return 0;
    return report.nodes.filter((n) => n.status === 'resolved').length;
  }, [report]);

  const runRegionalCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = targetFqdn.trim().toLowerCase().replace(/\.$/, '');
    if (!clean) {
      setCheckError('Vui lòng nhập tên miền cần kiểm tra trên bản đồ.');
      return;
    }
    setChecking(true);
    setCheckError(null);
    try {
      const res = await fetch('/api/dns/regional-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fqdn: clean, type: targetType }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể kiểm tra phân giải DNS theo khu vực.');
      }
      setReport(data as RegionalDnsCheckReport);
    } catch (err) {
      setCheckError(
        err instanceof Error ? err.message : 'Lỗi kết nối máy chủ kiểm tra DNS toàn quốc.'
      );
    } finally {
      setChecking(false);
    }
  };

  const northPath = useMemo(() => buildPolygonPath(NORTH_REGION_COORDS), []);
  const centralPath = useMemo(() => buildPolygonPath(CENTRAL_REGION_COORDS), []);
  const southPath = useMemo(() => buildPolygonPath(SOUTH_REGION_COORDS), []);
  const phuQuocPath = useMemo(() => buildPolygonPath(PHU_QUOC_COORDS), []);
  const hoangSaPos = useMemo(() => projectVnPoint(16.5, 112.1), []);
  const truongSaPos = useMemo(() => projectVnPoint(10.4, 114.2), []);

  // Đường kết nối trục Bắc - Trung - Nam
  const backboneCoords = useMemo(() => {
    const hn = projectVnPoint(21.0285, 105.8542);
    const dn = projectVnPoint(16.0544, 108.2022);
    const hcm = projectVnPoint(10.8231, 106.6297);
    const ct = projectVnPoint(10.0452, 105.7469);
    const hp = projectVnPoint(20.8449, 106.6881);
    const qn = projectVnPoint(13.7829, 109.2197);
    return { hn, hp, dn, qn, hcm, ct };
  }, []);

  return (
    <div className="space-y-6">
      {/* Tiêu đề & Thanh kiểm tra thực tế toàn quốc */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">
              Bản đồ cụm nút DNS khu vực toàn quốc
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Theo dõi phân bổ 6 cụm phân giải DNS tại 3 miền Bắc – Trung – Nam và kiểm tra độ trễ phân giải thực tế trên toàn quốc.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-full @2xl:w-fit overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Toàn quốc (6)' },
                { id: 'bac', label: 'Miền Bắc (2)' },
                { id: 'trung', label: 'Miền Trung (2)' },
                { id: 'nam', label: 'Miền Nam (2)' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setRegionFilter(item.id);
                  if (item.id !== 'all') {
                    const firstInRegion = VIETNAM_CLUSTERS.find((n) => n.region === item.id);
                    if (firstInRegion) setSelectedNodeId(firstInRegion.id);
                  }
                }}
                className={`px-3 min-h-[38px] @2xl:min-h-0 @2xl:py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                  regionFilter === item.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thanh truy vấn kiểm tra toàn quốc */}
        <form
          onSubmit={runRegionalCheck}
          className="pt-3 border-t border-slate-200 flex flex-col @2xl:flex-row items-stretch @2xl:items-center gap-2.5"
        >
          {domains.length > 0 && (
            <select
              value={domains.some((d) => d.name === targetFqdn) ? targetFqdn : ''}
              onChange={(e) => {
                if (e.target.value) setTargetFqdn(e.target.value);
              }}
              aria-label="Chọn nhanh tên miền của tôi"
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-md bg-white @2xl:w-52"
            >
              <option value="">Chọn tên miền nhanh...</option>
              {domains.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <input
            type="text"
            value={targetFqdn}
            onChange={(e) => setTargetFqdn(e.target.value)}
            placeholder="Nhập tên miền kiểm tra (ví dụ: tenmien.vn)"
            className="flex-1 px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <div className="flex items-center gap-2">
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              aria-label="Chọn loại bản ghi"
              className="px-3 py-2 text-xs font-mono font-semibold border border-slate-300 rounded-md bg-white"
            >
              {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={checking}
              className="flex-1 @2xl:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] @2xl:min-h-0 @2xl:py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md whitespace-nowrap"
            >
              <Activity className="w-3.5 h-3.5" />
              {checking ? 'Đang đo khu vực...' : 'Kiểm tra toàn quốc'}
            </button>
          </div>
        </form>

        {checkError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {checkError}
          </div>
        )}

        {report && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-1">
            <span>
              Kết quả đo <strong className="font-mono text-slate-900">{report.fqdn}</strong> ({report.type}):{' '}
              <strong className="font-mono tabular-nums text-emerald-700">
                {resolvedCount}/{report.nodes.length} cụm phản hồi
              </strong>
            </span>
            <span className="font-mono tabular-nums text-slate-500">
              Độ trễ TB: {avgLatency ?? 0} ms · {formatTimestampVi(report.checkedAt)}
            </span>
          </div>
        )}
      </div>

      {/* Bố cục chính: Bản đồ Việt Nam + Chi tiết cụm nút */}
      <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-6 items-start">
        {/* Khung Bản đồ Tương tác Việt Nam */}
        <div className="@3xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-700" />
              <h3 className="text-sm font-semibold text-slate-900">Bản đồ phân bố Việt Nam</h3>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.85, Number((z - 0.15).toFixed(2))))}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                title="Thu nhỏ bản đồ"
                aria-label="Thu nhỏ bản đồ"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-mono tabular-nums text-slate-600">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                title="Phóng to bản đồ"
                aria-label="Phóng to bản đồ"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomLevel(1);
                  setRegionFilter('all');
                }}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                title="Đặt lại khung nhìn"
                aria-label="Đặt lại khung nhìn"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative bg-slate-50 overflow-auto p-3">
            <div
              className="mx-auto transition-transform duration-150 origin-center"
              style={{
                maxWidth: '460px',
                transform: `scale(${zoomLevel})`,
              }}
            >
              <svg
                viewBox="0 0 500 660"
                className="w-full h-auto select-none"
                role="img"
                aria-label="Bản đồ phân bố cụm nút DNS theo 3 miền toàn quốc Việt Nam"
              >
                {/* Lưới kinh vĩ tuyến nhẹ */}
                <g stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 4">
                  {[120, 240, 360, 480, 580].map((y) => (
                    <line key={`lat-${y}`} x1="20" y1={y} x2="480" y2={y} />
                  ))}
                  {[100, 200, 300, 400].map((x) => (
                    <line key={`lng-${x}`} x1={x} y1="20" x2={x} y2="640" />
                  ))}
                </g>

                {/* Biển Đông label */}
                <text
                  x="355"
                  y="415"
                  fill="#94A3B8"
                  fontSize="12"
                  fontStyle="italic"
                  letterSpacing="2"
                >
                  BIỂN ĐÔNG
                </text>

                {/* Miền Bắc */}
                <path
                  d={northPath}
                  fill={regionFilter === 'all' || regionFilter === 'bac' ? '#DBEAFE' : '#F1F5F9'}
                  stroke={regionFilter === 'all' || regionFilter === 'bac' ? '#2563EB' : '#CBD5E1'}
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  className="transition-colors cursor-pointer"
                  onClick={() => setRegionFilter(regionFilter === 'bac' ? 'all' : 'bac')}
                />

                {/* Miền Trung */}
                <path
                  d={centralPath}
                  fill={regionFilter === 'all' || regionFilter === 'trung' ? '#FEF3C7' : '#F1F5F9'}
                  stroke={regionFilter === 'all' || regionFilter === 'trung' ? '#D97706' : '#CBD5E1'}
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  className="transition-colors cursor-pointer"
                  onClick={() => setRegionFilter(regionFilter === 'trung' ? 'all' : 'trung')}
                />

                {/* Miền Nam + Phú Quốc */}
                <path
                  d={southPath}
                  fill={regionFilter === 'all' || regionFilter === 'nam' ? '#D1FAE5' : '#F1F5F9'}
                  stroke={regionFilter === 'all' || regionFilter === 'nam' ? '#059669' : '#CBD5E1'}
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  className="transition-colors cursor-pointer"
                  onClick={() => setRegionFilter(regionFilter === 'nam' ? 'all' : 'nam')}
                />
                <path
                  d={phuQuocPath}
                  fill={regionFilter === 'all' || regionFilter === 'nam' ? '#D1FAE5' : '#F1F5F9'}
                  stroke={regionFilter === 'all' || regionFilter === 'nam' ? '#059669' : '#CBD5E1'}
                  strokeWidth="1.4"
                />

                {/* Quần đảo Hoàng Sa & Trường Sa */}
                <g fill="#CBD5E1" stroke="#64748B" strokeWidth="1">
                  <circle cx={hoangSaPos.x} cy={hoangSaPos.y} r="3" />
                  <circle cx={hoangSaPos.x + 8} cy={hoangSaPos.y - 4} r="2.2" />
                  <circle cx={hoangSaPos.x + 5} cy={hoangSaPos.y + 6} r="2.2" />
                  <circle cx={truongSaPos.x} cy={truongSaPos.y} r="3" />
                  <circle cx={truongSaPos.x + 9} cy={truongSaPos.y + 5} r="2.2" />
                  <circle cx={truongSaPos.x - 6} cy={truongSaPos.y + 8} r="2.2" />
                </g>
                <text
                  x={hoangSaPos.x - 24}
                  y={hoangSaPos.y + 20}
                  fill="#475569"
                  fontSize="10"
                  fontWeight="600"
                >
                  QĐ. Hoàng Sa
                </text>
                <text
                  x={truongSaPos.x - 26}
                  y={truongSaPos.y + 22}
                  fill="#475569"
                  fontSize="10"
                  fontWeight="600"
                >
                  QĐ. Trường Sa
                </text>

                {/* Tuyến kết nối trục giữa các cụm DNS */}
                <g stroke="#64748B" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.65">
                  <line
                    x1={backboneCoords.hn.x}
                    y1={backboneCoords.hn.y}
                    x2={backboneCoords.hp.x}
                    y2={backboneCoords.hp.y}
                  />
                  <line
                    x1={backboneCoords.hn.x}
                    y1={backboneCoords.hn.y}
                    x2={backboneCoords.dn.x}
                    y2={backboneCoords.dn.y}
                  />
                  <line
                    x1={backboneCoords.dn.x}
                    y1={backboneCoords.dn.y}
                    x2={backboneCoords.qn.x}
                    y2={backboneCoords.qn.y}
                  />
                  <line
                    x1={backboneCoords.qn.x}
                    y1={backboneCoords.qn.y}
                    x2={backboneCoords.hcm.x}
                    y2={backboneCoords.hcm.y}
                  />
                  <line
                    x1={backboneCoords.hcm.x}
                    y1={backboneCoords.hcm.y}
                    x2={backboneCoords.ct.x}
                    y2={backboneCoords.ct.y}
                  />
                </g>

                {/* Nhãn 3 miền */}
                <text x="64" y="102" fill="#1E40AF" fontSize="11" fontWeight="700">
                  MIỀN BẮC
                </text>
                <text x="150" y="346" fill="#B45309" fontSize="11" fontWeight="700">
                  MIỀN TRUNG
                </text>
                <text x="86" y="556" fill="#065F46" fontSize="11" fontWeight="700">
                  MIỀN NAM
                </text>

                {/* Ghim các cụm nút DNS */}
                {VIETNAM_CLUSTERS.map((node) => {
                  const pt = projectVnPoint(node.lat, node.lng);
                  const isVisible = regionFilter === 'all' || regionFilter === node.region;
                  const isSelected = selectedNode.id === node.id;
                  const meta = REGION_META[node.region];
                  const live = resultMap.get(node.id);
                  const labelXOffset = node.id === 'haiphong-edge' || node.id === 'quynhon-pop' || node.id === 'danang-relay' ? 14 : -14;
                  const textAnchor = labelXOffset > 0 ? 'start' : 'end';

                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer"
                      opacity={isVisible ? 1 : 0.28}
                      onClick={() => setSelectedNodeId(node.id)}
                    >
                      {/* Vòng chạm ẩn giúp bấm dễ trên màn hình cảm ứng */}
                      <circle cx={pt.x} cy={pt.y} r="20" fill="transparent" />

                      {isSelected && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="15"
                          fill={meta.ringColor}
                          opacity="0.7"
                        />
                      )}

                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? '8.5' : '6.5'}
                        fill={meta.pinColor}
                        stroke="#FFFFFF"
                        strokeWidth="2.2"
                      />

                      <text
                        x={pt.x + labelXOffset}
                        y={pt.y + 4}
                        textAnchor={textAnchor}
                        fill="#0F172A"
                        fontSize="11"
                        fontWeight={isSelected ? '700' : '600'}
                      >
                        {node.city}
                        {live ? ` · ${live.latencyMs}ms` : ''}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Chú giải 3 miền */}
          <div className="px-5 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600">
            <span className="font-medium text-blue-700">Miền Bắc: Hà Nội, Hải Phòng</span>
            <span className="font-medium text-amber-700">Miền Trung: Đà Nẵng, Quy Nhơn</span>
            <span className="font-medium text-emerald-700">Miền Nam: TP. HCM, Cần Thơ</span>
          </div>
        </div>

        {/* Cột phải: Thông tin cụm nút được chọn & danh sách cụm */}
        <div className="@3xl:col-span-5 space-y-5">
          {/* Thẻ chi tiết cụm đang chọn */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500">
                  {REGION_META[selectedNode.region].name} · {selectedNode.capacityLabel}
                </div>
                <h3 className="text-base font-bold text-slate-900">{selectedNode.label}</h3>
                <p className="text-xs text-slate-600">{selectedNode.role}</p>
              </div>
              <Server className="w-5 h-5 text-slate-400 shrink-0" />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
              <div>
                <div className="text-slate-500">Trung tâm dữ liệu</div>
                <div className="font-medium text-slate-900 mt-0.5">{selectedNode.datacenter}</div>
              </div>
              <div>
                <div className="text-slate-500">Máy chủ đại diện</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {selectedNode.resolverIp}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Tọa độ địa lý</div>
                <div className="font-mono tabular-nums text-slate-800 mt-0.5">
                  {selectedNode.lat.toFixed(4)}°N, {selectedNode.lng.toFixed(4)}°E
                </div>
              </div>
              <div>
                <div className="text-slate-500">Độ trễ thực đo</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                  {selectedLiveResult ? `${selectedLiveResult.latencyMs} ms` : 'Chưa đo'}
                </div>
              </div>
            </div>

            {selectedLiveResult ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    Kết quả phân giải {report?.fqdn} ({report?.type})
                  </span>
                  <span
                    className={`font-semibold ${
                      selectedLiveResult.status === 'resolved'
                        ? 'text-emerald-700'
                        : selectedLiveResult.status === 'empty'
                          ? 'text-amber-700'
                          : 'text-red-700'
                    }`}
                  >
                    {selectedLiveResult.status === 'resolved'
                      ? 'Thành công'
                      : selectedLiveResult.status === 'empty'
                        ? 'Không có bản ghi'
                        : 'Lỗi truy vấn'}
                  </span>
                </div>
                <div className="font-mono text-slate-700 break-all">
                  {selectedLiveResult.values.length > 0
                    ? selectedLiveResult.values.join(', ')
                    : 'Không nhận được bản ghi phản hồi.'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Nguồn kiểm tra: {selectedLiveResult.source}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500">
                Bấm nút <strong>Kiểm tra toàn quốc</strong> ở phía trên để đo độ trễ và đối chiếu bản ghi phân giải thực tế tại cụm {selectedNode.city}.
              </div>
            )}
          </div>

          {/* Danh sách 6 cụm nút */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Danh sách cụm nút DNS ({visibleNodes.length})</span>
              <span className="text-slate-500 font-normal">Chạm để chọn trên bản đồ</span>
            </div>
            <div className="divide-y divide-slate-200">
              {visibleNodes.map((node) => {
                const isSelected = node.id === selectedNode.id;
                const live = resultMap.get(node.id);
                const meta = REGION_META[node.region];
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`w-full px-5 py-3 min-h-[52px] text-left flex items-center justify-between gap-3 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <span className="truncate">{node.city}</span>
                        <span className="text-slate-300">·</span>
                        <span className={`text-xs font-medium ${meta.textColor}`}>
                          {meta.name}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">{node.role}</div>
                    </div>

                    <div className="text-right font-mono tabular-nums text-xs shrink-0">
                      {live ? (
                        <div className="space-y-0.5">
                          <div className="inline-flex items-center gap-1 font-semibold text-slate-900">
                            {live.status === 'resolved' && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            )}
                            {live.latencyMs} ms
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {live.values.length} bản ghi
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">{node.resolverIp}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
