import { useEffect, useState } from 'react';
import type { DashboardStats, PendingReview, RecentSighting, Screen } from '@/types';
import {
  getDashboardStats,
  getPendingReviews,
  getRecentSightings,
  IS_DEMO,
} from '@/services/api';
import {
  formatDateTime,
  timeAgo,
  statusColor,
  statusLabel,
} from '@/utils/format';
import {
  PawPrint,
  Trees,
  Camera,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (screen: Screen) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sightings, setSightings] = useState<RecentSighting[]>([]);
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardStats(), getRecentSightings(6), getPendingReviews()])
      .then(([s, r, p]) => {
        setStats(s);
        setSightings(r);
        setReviews(p);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-forest-800">Dashboard</h1>
          <p className="mt-1 text-forest-600">
            Conservation overview across all monitored reserves
          </p>
        </div>
        <button
          onClick={() => onNavigate('identify')}
          className="flex items-center gap-2 rounded-xl bg-forest-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-forest-600/20 transition-all hover:bg-forest-700 hover:shadow-xl active:scale-[0.98]"
        >
          <Camera size={18} />
          Identify New Animal
        </button>
      </div>

      {IS_DEMO && (
        <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-4 py-2.5 text-sm text-lime-800">
          <AlertCircle size={16} className="shrink-0" />
          <span>
            <strong>Demo Mode:</strong> This dashboard shows labeled sample data.
            Connect the backend to see live conservation data.
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={PawPrint}
          label="Total Animals"
          value={stats?.totalAnimals ?? 0}
          color="forest"
        />
        <StatCard
          icon={Trees}
          label="Species Tracked"
          value={stats?.totalSpecies ?? 0}
          color="lime"
        />
        <StatCard
          icon={Camera}
          label="Total Sightings"
          value={stats?.totalSightings ?? 0}
          color="ivory"
        />
        <StatCard
          icon={Clock}
          label="Pending Reviews"
          value={stats?.pendingReviews ?? 0}
          color="amber"
          onClick={() => onNavigate('verification')}
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent sightings */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-forest-800">Recent Sightings</h2>
              <span className="text-sm text-forest-500">Latest camera-trap detections</span>
            </div>
            <div className="space-y-3">
              {sightings.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-forest-50 animate-fade-in-up cursor-pointer"
                  style={{ animationDelay: `${i * 0.05}s` }}
                  onClick={() => onNavigate('registry')}
                >
                  <img
                    src={s.photoUrl}
                    alt={s.animalName}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-forest-800 truncate">{s.animalName}</h3>
                      <span className="text-xs text-forest-400">{s.animalId}</span>
                    </div>
                    <p className="text-sm text-forest-600 truncate">{s.species} · {s.location}</p>
                    <p className="text-xs text-forest-400 mt-0.5">
                      {s.cameraTrapId} · {timeAgo(s.timestamp)}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor(s.verified ? 'confirmed' : 'pending')}`}>
                    {s.verified ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {s.verified ? 'Verified' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pending reviews */}
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-ivory-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-forest-800">Pending Reviews</h2>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-white">
              {reviews.length}
            </span>
          </div>
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl bg-white/70 p-3 animate-fade-in-up cursor-pointer transition-all hover:bg-white hover:shadow-md"
                style={{ animationDelay: `${i * 0.05}s` }}
                onClick={() => onNavigate('verification')}
              >
                <img
                  src={r.uploadedPhotoUrl}
                  alt="Pending review"
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-forest-800 truncate">
                    {r.topMatchName}
                  </p>
                  <p className="text-xs text-forest-500 truncate">{r.topMatchSpecies}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-forest-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-forest-500 to-lime-400"
                        style={{ width: `${r.topMatchScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-forest-600">{r.topMatchScore}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate('verification')}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white/50 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-white"
          >
            Review all matches <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Species breakdown */}
      <div className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-forest-800">Species Breakdown</h2>
          <TrendingUp size={20} className="text-forest-400" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats?.speciesBreakdown.map((sp, i) => (
            <div
              key={sp.species}
              className="group relative overflow-hidden rounded-xl border border-forest-100 bg-forest-50/50 p-3 transition-all hover:shadow-md animate-fade-in-up"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <img
                src={sp.photoUrl}
                alt={sp.species}
                className="mb-2 h-20 w-full rounded-lg object-cover transition-transform group-hover:scale-105"
              />
              <p className="text-sm font-semibold text-forest-800 truncate">{sp.species}</p>
              <p className="text-2xl font-display font-bold text-forest-600">{sp.count}</p>
              <p className="text-xs text-forest-400">individuals</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: typeof PawPrint;
  label: string;
  value: number;
  color: 'forest' | 'lime' | 'ivory' | 'amber';
  onClick?: () => void;
}) {
  const colorMap = {
    forest: 'from-forest-500 to-forest-600 text-white',
    lime: 'from-lime-400 to-lime-500 text-white',
    ivory: 'from-ivory-300 to-ivory-400 text-forest-800',
    amber: 'from-amber-400 to-amber-500 text-white',
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`group rounded-2xl border border-forest-100 bg-white p-5 text-left shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${colorMap[color]} shadow-md`}>
        <Icon size={20} />
      </div>
      <p className="text-3xl font-display font-bold text-forest-800">{value}</p>
      <p className="text-sm text-forest-500">{label}</p>
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-9 w-48 rounded-lg bg-forest-100 animate-pulse" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-forest-50 animate-pulse" />
        ))}
      </div>
      <div className="h-96 rounded-2xl bg-forest-50 animate-pulse" />
    </div>
  );
}
