import { useEffect, useState } from 'react';
import type { Animal, CameraTrapRecord, Screen, ViewMode } from '@/types';
import { getAnimalById, getCameraTrapHistory, IS_DEMO } from '@/services/api';
import { TrapMap } from '@/components/TrapMap';
import {
  formatDateTime,
  formatDate,
  timeAgo,
  statusColor,
} from '@/utils/format';
import {
  ArrowLeft,
  Map as MapIcon,
  List,
  Clock,
  MapPin,
  Camera,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

interface CameraTrapHistoryProps {
  animalId: string;
  onNavigate: (screen: Screen) => void;
  onVerify: (record: CameraTrapRecord, animal: Animal) => void;
}

export function CameraTrapHistory({ animalId, onNavigate, onVerify }: CameraTrapHistoryProps) {
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [records, setRecords] = useState<CameraTrapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<string | undefined>(undefined);

  useEffect(() => {
    Promise.all([getAnimalById(animalId), getCameraTrapHistory(animalId)])
      .then(([a, r]) => {
        setAnimal(a);
        setRecords(r);
        if (r.length > 0) setSelectedRecord(r[0].id);
      })
      .finally(() => setLoading(false));
  }, [animalId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-forest-100 animate-pulse" />
        <div className="h-96 rounded-2xl bg-forest-50 animate-pulse" />
      </div>
    );
  }

  if (!animal || records.length === 0) {
    return (
      <div className="mx-auto max-w-2xl text-center py-16">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-forest-100">
          <AlertCircle size={32} className="text-forest-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-forest-800">No Previous Records Found</h1>
        <p className="mt-2 text-forest-600">
          This individual has not been recorded by any camera traps yet.
        </p>
        <button
          onClick={() => onNavigate('identify')}
          className="mt-6 rounded-xl bg-forest-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-forest-700"
        >
          Back to Identify
        </button>
      </div>
    );
  }

  const verifiedCount = records.filter((r) => r.verified).length;

  return (
    <div className="space-y-6">
      {/* Header with animal info */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('identify')}
            className="rounded-lg p-2 text-forest-600 transition-colors hover:bg-forest-100"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display text-2xl font-bold text-forest-800">Camera-Trap History</h1>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-forest-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <img
            src={animal.photoUrl}
            alt={animal.name}
            className="h-20 w-20 rounded-xl object-cover shadow-md"
          />
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-forest-800">{animal.name}</h2>
            <p className="text-sm text-forest-600">{animal.species} · ID: {animal.id}</p>
            <p className="text-xs text-forest-400 mt-0.5">
              {records.length} detections · {verifiedCount} verified · Last seen {timeAgo(animal.lastSighted)}
            </p>
          </div>
        </div>
      </div>

      {IS_DEMO && (
        <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-4 py-2.5 text-sm text-lime-800">
          <Sparkles size={16} className="shrink-0" />
          <span>
            <strong>Demo Mode:</strong> Camera-trap records are sample data.
          </span>
        </div>
      )}

      {/* View toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-forest-200 bg-white p-1 shadow-sm">
          {[
            { mode: 'map' as const, label: 'Map', icon: MapIcon },
            { mode: 'timeline' as const, label: 'Timeline', icon: Clock },
            { mode: 'list' as const, label: 'List', icon: List },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.mode}
                onClick={() => setViewMode(tab.mode)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === tab.mode
                    ? 'bg-forest-600 text-white shadow-sm'
                    : 'text-forest-600 hover:bg-forest-50'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Coordinates toggle */}
        <button
          onClick={() => setShowCoordinates(!showCoordinates)}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
            showCoordinates
              ? 'border-forest-300 bg-forest-50 text-forest-700'
              : 'border-forest-200 bg-white text-forest-500'
          }`}
        >
          {showCoordinates ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          <span className="flex items-center gap-1">
            {showCoordinates ? <Lock size={14} className="text-forest-600" /> : <Lock size={14} />}
            Coordinates {showCoordinates ? 'Visible' : 'Hidden'}
          </span>
        </button>
      </div>

      {/* Content by mode */}
      {viewMode === 'map' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TrapMap
              records={records}
              showCoordinates={showCoordinates}
              selectedId={selectedRecord}
              onSelect={setSelectedRecord}
              height="500px"
            />
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto rounded-2xl border border-forest-100 bg-white p-3 shadow-sm">
            <p className="px-1 text-sm font-semibold text-forest-700">All Detections</p>
            {records.map((rec) => (
              <button
                key={rec.id}
                onClick={() => setSelectedRecord(rec.id)}
                className={`flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-all ${
                  selectedRecord === rec.id
                    ? 'bg-forest-50 ring-2 ring-forest-300'
                    : 'hover:bg-forest-50/50'
                }`}
              >
                <img
                  src={rec.photoUrl}
                  alt={rec.id}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-forest-800 truncate">{rec.location}</p>
                  <p className="text-xs text-forest-500 truncate">
                    {rec.cameraTrapId} · {formatDate(rec.timestamp)}
                  </p>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColor(rec.verified ? 'confirmed' : 'pending')}`}>
                    {rec.verified ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                    {rec.verified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'timeline' && (
        <div className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-forest-100" />

            <div className="space-y-6">
              {records.map((rec, i) => (
                <div
                  key={rec.id}
                  className="relative flex gap-4 animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  {/* Dot */}
                  <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-md ${
                    rec.verified ? 'bg-forest-500' : 'bg-amber-400'
                  }`}>
                    <Camera size={16} className="text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 rounded-xl border border-forest-100 bg-forest-50/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-forest-800">{rec.location}</p>
                        <p className="text-sm text-forest-500">{formatDateTime(rec.timestamp)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor(rec.verified ? 'confirmed' : 'pending')}`}>
                        {rec.verified ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {rec.verified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <img
                        src={rec.photoUrl}
                        alt={rec.id}
                        className="h-32 w-full max-w-[200px] rounded-lg object-cover"
                      />
                      <div className="flex-1 space-y-1.5 text-sm">
                        <div className="flex items-center gap-1.5 text-forest-600">
                          <Camera size={14} className="text-forest-400" />
                          {rec.cameraTrapId}
                        </div>
                        <div className="flex items-center gap-1.5 text-forest-600">
                          <MapPin size={14} className="text-forest-400" />
                          {rec.location}
                        </div>
                        {showCoordinates && (
                          <div className="flex items-center gap-1.5 text-forest-500 text-xs">
                            <MapPin size={12} />
                            {rec.latitude.toFixed(4)}, {rec.longitude.toFixed(4)}
                          </div>
                        )}
                        <p className="pt-1 text-xs text-forest-500 italic">{rec.notes}</p>
                      </div>
                    </div>
                    {!rec.verified && (
                      <button
                        onClick={() => onVerify(rec, animal)}
                        className="mt-3 flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-forest-700"
                      >
                        <CheckCircle2 size={14} />
                        Verify this sighting
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-3">
          {records.map((rec, i) => (
            <div
              key={rec.id}
              className="overflow-hidden rounded-2xl border border-forest-100 bg-white shadow-sm animate-fade-in-up"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex flex-col sm:flex-row">
                <img
                  src={rec.photoUrl}
                  alt={rec.id}
                  className="h-40 w-full object-cover sm:h-auto sm:w-56"
                />
                <div className="flex-1 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold text-forest-800">{rec.location}</p>
                      <p className="text-sm text-forest-500">{formatDateTime(rec.timestamp)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor(rec.verified ? 'confirmed' : 'pending')}`}>
                      {rec.verified ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      {rec.verified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center gap-1.5 text-sm text-forest-600">
                      <Camera size={14} className="text-forest-400" />
                      Camera Trap: <span className="font-medium">{rec.cameraTrapId}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-forest-600">
                      <MapPin size={14} className="text-forest-400" />
                      {showCoordinates
                        ? `${rec.latitude.toFixed(4)}, ${rec.longitude.toFixed(4)}`
                        : 'Coordinates hidden'}
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-forest-500 italic">{rec.notes}</p>

                  {!rec.verified && (
                    <button
                      onClick={() => onVerify(rec, animal)}
                      className="mt-3 flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-forest-700"
                    >
                      <CheckCircle2 size={14} />
                      Verify this sighting
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
