import { useEffect, useMemo, useState } from 'react';
import type { Animal, Screen, Species } from '@/types';
import { getAnimals, getCameraTrapHistory, IS_DEMO } from '@/services/api';
import {
  speciesList,
} from '@/data/demoData';
import {
  formatDate,
  timeAgo,
  conservationColor,
  statusColor,
  statusLabel,
} from '@/utils/format';
import {
  Search,
  Filter,
  PawPrint,
  MapPin,
  Camera,
  History,
  X,
  Sparkles,
  CheckCircle2,
  Clock,
  Trees,
} from 'lucide-react';

interface AnimalRegistryProps {
  onNavigate: (screen: Screen) => void;
  onViewHistory: (animalId: string) => void;
}

export function AnimalRegistry({ onNavigate: _onNavigate, onViewHistory }: AnimalRegistryProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<Species | 'all'>('all');
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);

  useEffect(() => {
    getAnimals().then(setAnimals).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return animals.filter((a) => {
      if (speciesFilter !== 'all' && a.species !== speciesFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.species.toLowerCase().includes(q) ||
          a.habitat.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [animals, search, speciesFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-forest-100 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-forest-50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-forest-800">Animal Registry</h1>
        <p className="mt-1 text-forest-600">
          Browse and search all registered individuals across species
        </p>
      </div>

      {IS_DEMO && (
        <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-4 py-2.5 text-sm text-lime-800">
          <Sparkles size={16} className="shrink-0" />
          <span><strong>Demo Mode:</strong> Profiles are sample data.</span>
        </div>
      )}

      {/* Search & filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, species, or location..."
            className="w-full rounded-xl border border-forest-200 bg-white py-3 pl-10 pr-4 text-sm text-forest-800 placeholder-forest-400 outline-none transition-all focus:border-forest-400 focus:ring-2 focus:ring-forest-200"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-forest-400 hover:bg-forest-100"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="relative">
          <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400 pointer-events-none" />
          <select
            value={speciesFilter}
            onChange={(e) => setSpeciesFilter(e.target.value as Species | 'all')}
            className="appearance-none rounded-xl border border-forest-200 bg-white py-3 pl-10 pr-8 text-sm font-medium text-forest-700 outline-none transition-all focus:border-forest-400 focus:ring-2 focus:ring-forest-200"
          >
            <option value="all">All Species</option>
            {speciesList.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-forest-500">
        {filtered.length} {filtered.length === 1 ? 'individual' : 'individuals'} found
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-forest-100 bg-white p-12 text-center">
          <Search size={32} className="mx-auto mb-3 text-forest-300" />
          <p className="font-display text-lg font-bold text-forest-700">No animals found</p>
          <p className="mt-1 text-sm text-forest-500">Try a different search or filter</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((animal, i) => (
            <AnimalCard
              key={animal.id}
              animal={animal}
              index={i}
              onSelect={() => setSelectedAnimal(animal)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedAnimal && (
        <AnimalDetailModal
          animal={selectedAnimal}
          onClose={() => setSelectedAnimal(null)}
          onViewHistory={() => {
            onViewHistory(selectedAnimal.id);
            setSelectedAnimal(null);
          }}
        />
      )}
    </div>
  );
}

function AnimalCard({
  animal,
  index,
  onSelect,
}: {
  animal: Animal;
  index: number;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="group overflow-hidden rounded-2xl border border-forest-100 bg-white text-left shadow-sm transition-all hover:shadow-lg hover:border-forest-200 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="relative h-44 overflow-hidden">
        <img
          src={animal.photoUrl}
          alt={animal.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/70 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="font-display text-lg font-bold text-white">{animal.name}</h3>
          <p className="text-xs text-forest-100">{animal.species}</p>
        </div>
        <div className="absolute right-3 top-3">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur ${statusColor(animal.status)}`}>
            {animal.status === 'confirmed' ? <CheckCircle2 size={10} className="inline mr-0.5" /> : <Clock size={10} className="inline mr-0.5" />}
            {statusLabel(animal.status)}
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between text-xs text-forest-500">
          <span className="font-mono font-semibold text-forest-700">{animal.id}</span>
          <span className={`rounded-full border px-2 py-0.5 font-medium ${conservationColor(animal.conservationStatus)}`}>
            {animal.conservationStatus}
          </span>
        </div>
        <div className="mt-3 space-y-1.5 text-sm text-forest-600">
          <div className="flex items-center gap-1.5">
            <Camera size={14} className="text-forest-400" />
            {animal.totalSightings} sightings
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="text-forest-400" />
            <span className="truncate">{animal.habitat}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-forest-400" />
            Last seen {timeAgo(animal.lastSighted)}
          </div>
        </div>
      </div>
    </button>
  );
}

function AnimalDetailModal({
  animal,
  onClose,
  onViewHistory,
}: {
  animal: Animal;
  onClose: () => void;
  onViewHistory: () => void;
}) {
  const [recordCount, setRecordCount] = useState<number | null>(null);

  useEffect(() => {
    getCameraTrapHistory(animal.id).then((r) => setRecordCount(r.length));
  }, [animal.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-forest-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-ivory-50 shadow-2xl animate-scale-in">
        {/* Hero image */}
        <div className="relative h-64 overflow-hidden rounded-t-2xl">
          <img src={animal.photoUrl} alt={animal.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-950/80 to-transparent" />
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg bg-forest-950/60 p-2 text-white backdrop-blur transition-colors hover:bg-forest-950/80"
          >
            <X size={20} />
          </button>
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="font-display text-2xl font-bold text-white">{animal.name}</h2>
            <p className="text-forest-100">{animal.species} · ID: {animal.id}</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusColor(animal.status)}`}>
              {statusLabel(animal.status)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${conservationColor(animal.conservationStatus)}`}>
              {animal.conservationStatus}
            </span>
            <span className="rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-xs font-medium text-forest-600">
              <PawPrint size={10} className="inline mr-1" />
              {animal.totalSightings} total sightings
            </span>
          </div>

          {/* Description */}
          <div>
            <h3 className="mb-1 font-display text-lg font-bold text-forest-800">About</h3>
            <p className="text-sm text-forest-600 leading-relaxed">{animal.description}</p>
          </div>

          {/* Distinguishing features */}
          <div>
            <h3 className="mb-2 font-display text-lg font-bold text-forest-800">Distinguishing Features</h3>
            <div className="flex flex-wrap gap-2">
              {animal.distinguishingFeatures.map((f) => (
                <span
                  key={f}
                  className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-1.5 text-sm text-lime-800"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-forest-100 bg-white p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-forest-400">
                <MapPin size={14} /> Habitat
              </div>
              <p className="text-sm text-forest-700">{animal.habitat}</p>
            </div>
            <div className="rounded-xl border border-forest-100 bg-white p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-forest-400">
                <Trees size={14} /> First Sighted
              </div>
              <p className="text-sm text-forest-700">{formatDate(animal.firstSighted)}</p>
            </div>
            <div className="rounded-xl border border-forest-100 bg-white p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-forest-400">
                <Camera size={14} /> Last Sighted
              </div>
              <p className="text-sm text-forest-700">{formatDate(animal.lastSighted)}</p>
            </div>
            <div className="rounded-xl border border-forest-100 bg-white p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-forest-400">
                <History size={14} /> Camera-Trap Records
              </div>
              <p className="text-sm text-forest-700">
                {recordCount !== null ? `${recordCount} detections` : 'Loading...'}
              </p>
            </div>
          </div>

          {/* Action */}
          <button
            onClick={onViewHistory}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-forest-700 active:scale-[0.98]"
          >
            <History size={18} />
            View Camera-Trap History
          </button>
        </div>
      </div>
    </div>
  );
}
