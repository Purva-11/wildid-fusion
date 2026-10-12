import { useEffect, useState } from 'react';
import type { CameraTrapRecord, MatchCandidate, Screen } from '@/types';
import {
  getCameraTrapHistory,
  IS_DEMO,
} from '@/services/api';
import {
  ConfidenceBadge,
  MatchScoreRing,
  MatchBar,
} from '@/components/Badges';
import {
  formatDateTime,
  timeAgo,
  conservationColor,
} from '@/utils/format';
import {
  ArrowLeft,
  MapPin,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  History,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface MatchResultsProps {
  candidates: MatchCandidate[];
  uploadedImageUrl: string;
  onViewHistory: (animalId: string) => void;
  onVerify: (candidate: MatchCandidate) => void;
  onNavigate: (screen: Screen) => void;
}

export function MatchResults({
  candidates,
  uploadedImageUrl,
  onViewHistory,
  onVerify,
  onNavigate,
}: MatchResultsProps) {
  if (candidates.length === 0) {
    return (
      <div className="mx-auto max-w-2xl text-center py-16">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-forest-100">
          <AlertCircle size={32} className="text-forest-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-forest-800">No Matches Found</h1>
        <p className="mt-2 text-forest-600">
          No registered individuals matched this photo. This could be a new animal.
        </p>
        <button
          onClick={() => onNavigate('identify')}
          className="mt-6 rounded-xl bg-forest-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-forest-700"
        >
          Upload Another Photo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('identify')}
            className="rounded-lg p-2 text-forest-600 transition-colors hover:bg-forest-100"
            aria-label="Back to upload"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-display text-3xl font-bold text-forest-800">Match Results</h1>
            <p className="mt-1 text-forest-600">
              Top {candidates.length} candidate {candidates.length === 1 ? 'match' : 'matches'} found
            </p>
          </div>
        </div>
      </div>

      {IS_DEMO && (
        <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-4 py-2.5 text-sm text-lime-800">
          <Sparkles size={16} className="shrink-0" />
          <span>
            <strong>Demo Mode:</strong> These are sample matches. The AI identification engine is not connected.
          </span>
        </div>
      )}

      {/* Uploaded photo + top match comparison */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-forest-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-forest-600">Your Uploaded Photo</p>
          <img
            src={uploadedImageUrl}
            alt="Uploaded"
            className="w-full max-h-[320px] rounded-xl object-contain bg-forest-950"
          />
        </div>
        <div className="rounded-2xl border border-forest-200 bg-gradient-to-br from-forest-50 to-lime-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-forest-600">Best Match</p>
            <ConfidenceBadge confidence={candidates[0].matchConfidence} size="sm" />
          </div>
          <div className="flex items-center gap-4">
            <img
              src={candidates[0].animal.photoUrl}
              alt={candidates[0].animal.name}
              className="h-28 w-28 rounded-xl object-cover shadow-md"
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-bold text-forest-800 truncate">
                {candidates[0].animal.name}
              </h2>
              <p className="text-sm text-forest-600">{candidates[0].animal.species}</p>
              <p className="text-xs text-forest-400 mt-0.5">ID: {candidates[0].animal.id}</p>
              <div className="mt-2">
                <MatchBar score={candidates[0].matchScore} label="Match Score" />
              </div>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-white/70 p-2.5 text-xs text-forest-600">
            {candidates[0].distinguishingFeatureNote}
          </p>
        </div>
      </div>

      {/* All candidates */}
      <div>
        <h2 className="mb-4 font-display text-xl font-bold text-forest-800">
          Top {candidates.length} Candidates
        </h2>
        <div className="space-y-4">
          {candidates.map((c, i) => (
            <CandidateCard
              key={c.animal.id}
              candidate={c}
              rank={i + 1}
              onViewHistory={() => onViewHistory(c.animal.id)}
              onVerify={() => onVerify(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  rank,
  onViewHistory,
  onVerify,
}: {
  candidate: MatchCandidate;
  rank: number;
  onViewHistory: () => void;
  onVerify: () => void;
}) {
  const { animal, matchScore, matchConfidence, distinguishingFeatureNote } = candidate;
  const rankColors = ['border-lime-400', 'border-amber-400', 'border-forest-300'];
  const rankBg = rank === 1 ? 'bg-gradient-to-br from-lime-50 to-forest-50' : 'bg-white';

  return (
    <div
      className={`overflow-hidden rounded-2xl border-l-4 ${rankColors[rank - 1] || 'border-forest-200'} border border-forest-100 ${rankBg} shadow-sm transition-all hover:shadow-md animate-fade-in-up`}
      style={{ animationDelay: `${(rank - 1) * 0.1}s` }}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Photo */}
        <div className="relative sm:w-48 shrink-0">
          <img
            src={animal.photoUrl}
            alt={animal.name}
            className="h-48 w-full object-cover sm:h-full"
          />
          <div className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-forest-900 text-xs font-bold text-white shadow-md">
            #{rank}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold text-forest-800">{animal.name}</h3>
              <p className="text-sm text-forest-600">{animal.species}</p>
              <p className="text-xs text-forest-400 mt-0.5">ID: {animal.id}</p>
            </div>
            <MatchScoreRing score={matchScore} size={64} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={matchConfidence} size="sm" />
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${conservationColor(animal.conservationStatus)}`}>
              {animal.conservationStatus}
            </span>
            <span className="text-xs text-forest-500">
              {animal.totalSightings} total sightings
            </span>
          </div>

          {/* Distinguishing features */}
          <div className="mt-3 rounded-lg bg-forest-50/70 p-2.5">
            <p className="text-xs font-semibold text-forest-600">Why this match?</p>
            <p className="mt-0.5 text-xs text-forest-600">{distinguishingFeatureNote}</p>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={onViewHistory}
              className="flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-forest-700"
            >
              <History size={14} />
              Camera-Trap History
            </button>
            <button
              onClick={onVerify}
              className="flex items-center gap-1.5 rounded-lg border border-forest-200 bg-white px-4 py-2 text-xs font-semibold text-forest-700 transition-colors hover:bg-forest-50"
            >
              <CheckCircle2 size={14} />
              Verify Match
            </button>
          </div>
        </div>
      </div>

      {/* Previous records preview */}
      {candidate.cameraTrapHistory.length > 0 && (
        <div className="border-t border-forest-100 bg-forest-50/40 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-forest-600">
            Previous Records ({candidate.cameraTrapHistory.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {candidate.cameraTrapHistory.slice(0, 4).map((rec) => (
              <div key={rec.id} className="shrink-0">
                <img
                  src={rec.photoUrl}
                  alt={`Record ${rec.id}`}
                  className="h-16 w-16 rounded-lg object-cover border border-forest-200"
                />
                <p className="mt-1 text-[10px] text-forest-400 max-w-[64px] truncate">
                  {timeAgo(rec.timestamp)}
                </p>
              </div>
            ))}
            {candidate.cameraTrapHistory.length > 4 && (
              <button
                onClick={onViewHistory}
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-forest-200 bg-white text-xs font-medium text-forest-600 transition-colors hover:bg-forest-50"
              >
                +{candidate.cameraTrapHistory.length - 4}
                <span className="text-[10px]">more</span>
              </button>
            )}
          </div>
        </div>
      )}

      {candidate.cameraTrapHistory.length === 0 && (
        <div className="border-t border-forest-100 bg-forest-50/40 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs text-forest-500">
            <AlertCircle size={14} />
            No previous records found for this individual
          </p>
        </div>
      )}
    </div>
  );
}
