import type { CameraTrapRecord } from '@/types';
import { formatDateTime } from '@/utils/format';
import { MapPin, Camera, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface TrapMapProps {
  records: CameraTrapRecord[];
  showCoordinates: boolean;
  selectedId?: string;
  onSelect?: (id: string) => void;
  height?: string;
}

// Lightweight interactive map: renders a stylized forest terrain with positioned markers.
// Coordinates are mapped to relative positions within the bounding box of all records.
export function TrapMap({ records, showCoordinates, selectedId, onSelect, height = '400px' }: TrapMapProps) {
  if (records.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl bg-forest-50 text-forest-400">
        No location data available
      </div>
    );
  }

  const lats = records.map((r) => r.latitude);
  const lngs = records.map((r) => r.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  const positions = records.map((r) => ({
    id: r.id,
    x: ((r.longitude - minLng) / lngRange) * 80 + 10,
    y: 90 - ((r.latitude - minLat) / latRange) * 80 + 5,
    record: r,
  }));

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-forest-200"
      style={{ height }}
    >
      {/* Stylized terrain background */}
      <div className="absolute inset-0 bg-gradient-to-br from-forest-100 via-forest-50 to-lime-50" />
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="terrain" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
            <circle cx="30" cy="30" r="1.5" fill="#8ccb8c" opacity="0.3" />
            <circle cx="10" cy="15" r="1" fill="#54ab54" opacity="0.2" />
            <circle cx="45" cy="40" r="1" fill="#54ab54" opacity="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#terrain)" />
        {/* Rivers / paths */}
        <path
          d={`M 0 ${height ? '60%' : '60%'} Q 30% 40%, 50% 55% T 100% 45%`}
          stroke="#54ab54"
          strokeWidth="3"
          fill="none"
          opacity="0.15"
        />
        <path
          d="M 20% 0 Q 35% 30%, 25% 60% T 30% 100%"
          stroke="#54ab54"
          strokeWidth="2"
          fill="none"
          opacity="0.1"
        />
      </svg>

      {/* Grid lines */}
      <div className="absolute inset-0 opacity-[0.07]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`h${i}`} className="absolute left-0 right-0 border-t border-forest-600" style={{ top: `${(i + 1) * 12.5}%` }} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`v${i}`} className="absolute top-0 bottom-0 border-l border-forest-600" style={{ left: `${(i + 1) * 12.5}%` }} />
        ))}
      </div>

      {/* Map markers */}
      {positions.map((p) => {
        const isSelected = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onSelect?.(p.id)}
            className="absolute z-10 -translate-x-1/2 -translate-y-full cursor-pointer transition-transform hover:scale-110 focus:outline-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
            }}
            aria-label={`Camera trap at ${p.record.location}`}
          >
            <div className={`flex flex-col items-center ${isSelected ? 'scale-125' : ''} transition-transform`}>
              <div className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium shadow-md ${p.record.verified ? 'bg-forest-600 text-white' : 'bg-amber-500 text-white'}`}>
                <Camera size={10} />
                <span className="hidden sm:inline">{p.record.cameraTrapId}</span>
              </div>
              <div className={`mt-0.5 h-3 w-3 rounded-full border-2 border-white shadow-md ${p.record.verified ? 'bg-forest-600' : 'bg-amber-500'} ${isSelected ? 'animate-pulse-ring' : ''}`} />
              <div className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-white" />
            </div>
          </button>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg bg-white/85 px-3 py-2 text-xs shadow-md backdrop-blur">
        <div className="flex items-center gap-1.5 text-forest-700">
          <div className="h-2.5 w-2.5 rounded-full bg-forest-600" />
          Verified sighting
        </div>
        <div className="flex items-center gap-1.5 text-forest-700">
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Unverified
        </div>
      </div>

      {/* Coordinates toggle indicator */}
      {showCoordinates && (
        <div className="absolute right-3 top-3 rounded-lg bg-white/85 px-3 py-1.5 text-xs font-medium text-forest-700 shadow-md backdrop-blur">
          Coordinates visible
        </div>
      )}

      {/* Selected record popup */}
      {selectedId && (() => {
        const selected = positions.find((p) => p.id === selectedId);
        if (!selected) return null;
        return (
          <div className="absolute bottom-3 right-3 max-w-[240px] rounded-lg bg-white/95 p-3 shadow-lg backdrop-blur animate-fade-in">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-forest-700">
              <Camera size={12} />
              {selected.record.cameraTrapId}
            </div>
            <div className="mb-1 flex items-start gap-1 text-xs text-forest-600">
              <MapPin size={12} className="mt-0.5 shrink-0" />
              <span>{selected.record.location}</span>
            </div>
            <div className="mb-1 flex items-center gap-1 text-xs text-forest-600">
              <Clock size={12} />
              {formatDateTime(selected.record.timestamp)}
            </div>
            <div className="flex items-center gap-1 text-xs">
              {selected.record.verified ? (
                <span className="flex items-center gap-1 text-forest-600">
                  <CheckCircle2 size={12} /> Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle size={12} /> Unverified
                </span>
              )}
            </div>
            {showCoordinates && (
              <div className="mt-1 border-t border-forest-100 pt-1 text-xs text-forest-500">
                {selected.record.latitude.toFixed(4)}, {selected.record.longitude.toFixed(4)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
