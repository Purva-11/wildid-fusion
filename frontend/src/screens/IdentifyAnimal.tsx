import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReIDRankingResult, Screen, SystemHealth } from '@/types';
import { getHealth, identifyAnimal, API_BASE_URL } from '@/services/api';
import {
  Upload,
  ImageIcon,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  Camera,
  FileImage,
  CheckCircle2,
  Scan,
  Filter,
} from 'lucide-react';

interface IdentifyProps {
  onMatchFound: (result: ReIDRankingResult, uploadedImageUrl: string) => void;
  onNavigate: (screen: Screen) => void;
}

export function IdentifyAnimal({ onMatchFound }: IdentifyProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live controls
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [species, setSpecies] = useState('Plains Zebra');
  const [customSpecies, setCustomSpecies] = useState('');
  const [detectAnimals, setDetectAnimals] = useState(true);
  const [topK, setTopK] = useState(3);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        if (h.registered_species && h.registered_species.length > 0) {
          if (h.registered_species.includes('Plains Zebra')) {
            setSpecies('Plains Zebra');
          } else {
            setSpecies(h.registered_species[0]);
          }
        }
      })
      .catch((err) => {
        console.warn('Backend health check error:', err);
        setHealthError(err instanceof Error ? err.message : 'Backend unreachable');
      });
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, or WebP)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Image must be less than 15 MB');
      return;
    }
    setError(null);
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFindMatch = async () => {
    if (!photoFile) return;
    setIsAnalyzing(true);
    setError(null);
    const chosenSpecies = species === '__custom__' ? customSpecies.trim() : species;

    if (!chosenSpecies) {
      setError('Please select or specify a target species partition.');
      setIsAnalyzing(false);
      return;
    }

    try {
      const response = await identifyAnimal({
        photoFile,
        species: chosenSpecies,
        detectAnimals,
        topK,
      });
      onMatchFound(response.result, response.uploadedImageUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Unable to process the photo. Ensure backend is running at ${API_BASE_URL}.`
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setPhotoUrl(null);
    setPhotoFile(null);
    setError(null);
  };

  const availableSpecies = health?.registered_species || ['Plains Zebra', 'Cheetah'];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-forest-800">Identify an Animal</h1>
        <p className="mt-2 text-forest-600">
          Upload a camera-trap photo or field capture to identify matching individuals with MiewID & MegaDetector
        </p>
      </div>

      {/* Backend Engine Status Banner */}
      {health && health.model_loaded ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              <strong>AI Identification Pipeline Active:</strong> MiewID (440×440) + MegaDetector v6 (YOLOv9-c)
            </span>
          </div>
          <span className="hidden sm:inline font-mono text-[11px] text-emerald-700">
            {health.total_individuals} catalogued animals ({health.registered_species.length} species)
          </span>
        </div>
      ) : healthError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <strong>AI Engine Disconnected:</strong> Could not reach FastAPI backend at{' '}
            <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-red-900">{API_BASE_URL}</code>.
            Please verify the backend server is running.
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-forest-100 bg-forest-50 px-4 py-2.5 text-xs text-forest-700">
          <Loader2 size={14} className="animate-spin text-forest-500" />
          <span>Verifying AI inference server connection...</span>
        </div>
      )}

      {/* Pipeline Controls */}
      <div className="rounded-2xl border border-forest-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-forest-800 flex items-center gap-2">
          <Filter size={16} className="text-forest-600" /> Identification Parameters
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-forest-700 mb-1.5">
              Target Species Partition:
            </label>
            <select
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              className="w-full rounded-xl border border-forest-200 bg-forest-50/40 px-3.5 py-2.5 text-sm text-forest-800 outline-none transition focus:border-forest-500 focus:bg-white focus:ring-2 focus:ring-forest-200"
            >
              {availableSpecies.map((sp) => (
                <option key={sp} value={sp}>
                  {sp} {sp === 'Plains Zebra' ? '(2 individuals, 3 images)' : sp === 'Cheetah' ? '(1 individual, 1 image)' : ''}
                </option>
              ))}
              <option value="__custom__">Other / Uncatalogued Species...</option>
            </select>
            {species === '__custom__' && (
              <input
                type="text"
                placeholder="Enter species name (e.g., Bengal Tiger)"
                value={customSpecies}
                onChange={(e) => setCustomSpecies(e.target.value)}
                className="mt-2 w-full rounded-xl border border-forest-200 bg-white px-3.5 py-2 text-sm text-forest-800 outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-200"
              />
            )}
            <p className="mt-1 text-[11px] text-forest-500">
              MiewID partitions individual re-identification strictly by biological species.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-forest-700 mb-1.5">
                Top Candidates to Retrieve:
              </label>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full rounded-xl border border-forest-200 bg-forest-50/40 px-3.5 py-2.5 text-sm text-forest-800 outline-none transition focus:border-forest-500 focus:bg-white focus:ring-2 focus:ring-forest-200"
              >
                <option value={1}>Top 1 (Best Match only)</option>
                <option value={3}>Top 3 Candidates</option>
                <option value={5}>Top 5 Candidates</option>
              </select>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={detectAnimals}
                onChange={(e) => setDetectAnimals(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-forest-300 text-forest-600 focus:ring-forest-500"
              />
              <span className="text-xs text-forest-700 leading-snug">
                <strong>Run MegaDetector v6 detection</strong>
                <span className="block text-[11px] text-forest-500">
                  Detects wildlife bounding boxes, crops primary subject, and filters empty frames.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Upload zone */}
      {!photoUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative cursor-pointer rounded-3xl border-2 border-dashed p-12 text-center transition-all ${
            isDragging
              ? 'border-forest-500 bg-forest-50 scale-[1.01]'
              : 'border-forest-200 bg-white hover:border-forest-400 hover:bg-forest-50/50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-forest-500 to-lime-400 shadow-lg">
            <Upload size={32} className="text-white" />
          </div>
          <h2 className="font-display text-xl font-bold text-forest-800">
            Drop an animal photo here or click to browse
          </h2>
          <p className="mt-2 text-sm text-forest-500">
            Supports JPG, PNG, and WebP up to 15 MB
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-600">
              <Camera size={14} /> Camera trap photos
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-600">
              <FileImage size={14} /> Field photographs
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-600">
              <Scan size={14} /> Cropped or wide-angle captures
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-scale-in">
          {/* Photo preview */}
          <div className="relative overflow-hidden rounded-2xl border border-forest-200 bg-white shadow-md">
            <img
              src={photoUrl}
              alt="Uploaded animal"
              className="max-h-[400px] w-full object-contain bg-forest-950"
            />
            {!isAnalyzing && (
              <button
                onClick={handleReset}
                className="absolute right-3 top-3 rounded-lg bg-forest-950/60 p-2 text-white backdrop-blur transition-colors hover:bg-forest-950/80"
                aria-label="Remove photo"
              >
                <X size={20} />
              </button>
            )}
            {isAnalyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-forest-950/75 backdrop-blur-sm">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 to-forest-500 shadow-lg">
                  <Sparkles size={28} className="text-white animate-pulse" />
                </div>
                <p className="font-display text-xl font-bold text-white">Running AI Identification...</p>
                <p className="mt-1 text-sm text-forest-200">
                  {detectAnimals
                    ? 'MegaDetector v6 localization → MiewID feature embedding'
                    : 'Extracting MiewID 2152-dim L2-normalized feature vector'}
                </p>
                <div className="mt-4 flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full bg-lime-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600" />
              <div>
                <p className="font-semibold">Identification Error</p>
                <p className="mt-0.5 text-xs text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-forest-500">
              {photoFile && (
                <span className="flex items-center gap-1.5">
                  <ImageIcon size={14} />
                  {photoFile.name} ({(photoFile.size / 1024).toFixed(0)} KB)
                </span>
              )}
            </p>
            <button
              onClick={handleFindMatch}
              disabled={isAnalyzing}
              className="flex items-center justify-center gap-2 rounded-xl bg-forest-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-forest-600/20 transition-all hover:bg-forest-700 hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Analyzing with AI Models...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Identify Individual
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-display text-lg font-bold text-forest-800">
          Tips for Maximum Re-ID Accuracy
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            'Side-flank or clear lateral profiles expose maximum distinctive coat patterns',
            'MegaDetector automatically handles wide-angle camera-trap frames',
            'Pre-filter species to match the correct reference partition',
            'Ensure image resolution is at least 440×440 for optimal embedding quality',
          ].map((tip) => (
            <div key={tip} className="flex items-start gap-2 text-sm text-forest-600">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
              {tip}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
