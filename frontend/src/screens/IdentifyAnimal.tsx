import { useCallback, useRef, useState } from 'react';
import type { MatchCandidate, Screen } from '@/types';
import { identifyAnimal, IS_DEMO } from '@/services/api';
import {
  Upload,
  ImageIcon,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  Camera,
  FileImage,
} from 'lucide-react';

interface IdentifyProps {
  onMatchFound: (candidates: MatchCandidate[], uploadedImageUrl: string) => void;
  onNavigate: (screen: Screen) => void;
}

export function IdentifyAnimal({ onMatchFound }: IdentifyProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, etc.)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10 MB');
      return;
    }
    setError(null);
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFindMatch = async () => {
    if (!photoFile) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await identifyAnimal({ photoFile });
      onMatchFound(result.candidates, result.uploadedImageUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to process the photo. Please try again.'
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-forest-800">Identify an Animal</h1>
        <p className="mt-2 text-forest-600">
          Upload a photo from a camera trap or field sighting to find matching individuals
        </p>
      </div>

      {IS_DEMO && (
        <div className="flex items-start gap-2 rounded-xl border border-lime-200 bg-lime-50 px-4 py-2.5 text-sm text-lime-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Demo Mode:</strong> Identification results will show sample matches.
            The AI engine is not connected.
          </span>
        </div>
      )}

      {/* Upload zone */}
 {!photoUrl ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
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
            accept="image/*"
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
            Drop a photo here or click to browse
          </h2>
          <p className="mt-2 text-sm text-forest-500">
            Supports JPG, PNG, and HEIC up to 10 MB
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-600">
              <Camera size={14} /> Camera trap photos
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-600">
              <FileImage size={14} /> Field photographs
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-600">
              <ImageIcon size={14} /> Motion-triggered captures
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-scale-in">
          {/* Photo preview */}
          <div className="relative overflow-hidden rounded-2xl border border-forest-200 bg-white shadow-md">
            <img src={photoUrl} alt="Uploaded animal" className="max-h-[400px] w-full object-contain bg-forest-950" />
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
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-forest-950/70 backdrop-blur">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 to-forest-500 shadow-lg">
                  <Sparkles size={28} className="text-white animate-pulse" />
                </div>
                <p className="font-display text-xl font-bold text-white">Analyzing photo...</p>
                <p className="mt-1 text-sm text-forest-200">
                  Matching against registered individuals
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
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
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
                  Finding Matches...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Find Matching Animal
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-display text-lg font-bold text-forest-800">Tips for Best Results</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            'Use clear, well-lit photos with the animal visible',
            'Front-facing or side-profile photos work best',
            'Include the full body when possible for body markings',
            'Avoid heavily blurred or motion-smeared images',
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
