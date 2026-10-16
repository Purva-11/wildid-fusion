import type { CandidateMatch, ReIDRankingResult, Screen } from '@/types';
import { API_BASE_URL } from '@/services/api';
import {
  TierBadge,
  CosineSimilarityRing,
  CosineSimilarityBar,
} from '@/components/Badges';
import { matchStatusDetails, formatSimilarity } from '@/utils/format';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Scan,
  ShieldAlert,
  Info,
  History,
  Tag,
  Layers,
} from 'lucide-react';

interface MatchResultsProps {
  result: ReIDRankingResult | null;
  uploadedImageUrl: string;
  onViewHistory: (animalId: string) => void;
  onVerify: (candidate: CandidateMatch) => void;
  onNavigate: (screen: Screen) => void;
}

export function MatchResults({
  result,
  uploadedImageUrl,
  onViewHistory,
  onVerify,
  onNavigate,
}: MatchResultsProps) {
  if (!result || !uploadedImageUrl) {
    return (
      <div className="mx-auto max-w-2xl text-center py-16">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-forest-100">
          <AlertCircle size={32} className="text-forest-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-forest-800">No Active Identification</h1>
        <p className="mt-2 text-forest-600">
          Upload an animal photo through the identification pipeline to view live matching results.
        </p>
        <button
          onClick={() => onNavigate('identify')}
          className="mt-6 rounded-xl bg-forest-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-forest-700"
        >
          Go to Identify Animal
        </button>
      </div>
    );
  }

  const {
    species,
    match_status,
    top_candidates,
    best_score,
    thresholds_applied,
    disclaimer,
    detector_applied,
    detector_status,
    primary_detection_box,
    total_animals_detected,
  } = result;

  const statusInfo = matchStatusDetails(match_status);
  const bestCandidate = top_candidates.length > 0 ? top_candidates[0] : null;

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
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-bold text-forest-800">Match Results</h1>
              <span className="rounded-full bg-forest-100 px-3 py-0.5 text-xs font-semibold text-forest-800">
                {species}
              </span>
            </div>
            <p className="mt-1 text-sm text-forest-600">
              Evaluated against registered {species} reference gallery individuals
            </p>
          </div>
        </div>
      </div>

      {/* Match Status Banner */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border ${statusInfo.border} ${statusInfo.bg} p-4 shadow-sm`}
      >
        <div className="flex items-start gap-3">
          {match_status === 'MATCHED' ? (
            <CheckCircle2 size={22} className="text-emerald-600 mt-0.5 shrink-0" />
          ) : match_status === 'UNCERTAIN' ? (
            <AlertCircle size={22} className="text-amber-600 mt-0.5 shrink-0" />
          ) : match_status === 'UNKNOWN' ? (
            <HelpCircle size={22} className="text-blue-600 mt-0.5 shrink-0" />
          ) : (
            <ShieldAlert size={22} className="text-zinc-600 mt-0.5 shrink-0" />
          )}
          <div>
            <h2 className={`font-semibold text-sm ${statusInfo.text}`}>
              Status: {match_status} — {statusInfo.title}
            </h2>
            <p className="mt-0.5 text-xs text-forest-700">{statusInfo.description}</p>
          </div>
        </div>

        {/* Threshold Reference */}
        <div className="flex items-center gap-2 self-start sm:self-auto rounded-lg bg-white/70 px-3 py-1.5 text-[11px] font-mono text-forest-700 shrink-0 border border-forest-100">
          {best_score !== null && <span>Best Alignment: {formatSimilarity(best_score)}</span>}
          {best_score !== null && <span className="text-forest-300">|</span>}
          <span>High: ≥{thresholds_applied.high_threshold.toFixed(2)}</span>
          <span className="text-forest-300">|</span>
          <span>Mod: ≥{thresholds_applied.moderate_threshold.toFixed(2)}</span>
        </div>
      </div>

      {/* Uploaded photo with MegaDetector Box + Best Match Card */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Uploaded Photo View */}
        <div className="rounded-2xl border border-forest-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-forest-800 flex items-center gap-2">
              <Scan size={16} className="text-forest-600" />
              Uploaded Query Photo
            </p>
            {detector_applied ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-300 bg-lime-50 px-2.5 py-0.5 text-[11px] font-medium text-forest-800">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-500 animate-pulse" />
                MegaDetector: {total_animals_detected} detected ({detector_status})
              </span>
            ) : (
              <span className="rounded-full border border-forest-200 bg-forest-50 px-2.5 py-0.5 text-[11px] font-medium text-forest-600">
                Detection Bypassed
              </span>
            )}
          </div>

          <div className="relative overflow-hidden rounded-xl bg-forest-950 flex items-center justify-center min-h-[300px]">
            <img
              src={uploadedImageUrl}
              alt="Uploaded animal query"
              className="w-full max-h-[340px] object-contain mx-auto"
            />
            {/* Visual Bounding Box Overlay if MegaDetector localized animal */}
            {primary_detection_box && primary_detection_box.length === 4 && (
              <div
                className="absolute border-2 border-lime-400 bg-lime-400/15 pointer-events-none rounded shadow-sm"
                style={{
                  top: `${primary_detection_box[0] * 100}%`,
                  left: `${primary_detection_box[1] * 100}%`,
                  height: `${Math.max(2, (primary_detection_box[2] - primary_detection_box[0]) * 100)}%`,
                  width: `${Math.max(2, (primary_detection_box[3] - primary_detection_box[1]) * 100)}%`,
                }}
              >
                <span className="absolute -top-5 left-0 rounded bg-forest-900/90 text-lime-300 px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wider backdrop-blur shadow">
                  MDv6 Primary Crop
                </span>
              </div>
            )}
          </div>

          {primary_detection_box && (
            <p className="text-[11px] text-forest-500 font-mono">
              Crop Box [ymin, xmin, ymax, xmax]: [{primary_detection_box.map((v) => v.toFixed(4)).join(', ')}]
            </p>
          )}
        </div>

        {/* Best Match Candidate Card */}
        {bestCandidate ? (
          <div className="rounded-2xl border border-forest-200 bg-gradient-to-br from-forest-50 to-lime-50 p-5 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-bold text-forest-700">
                  Best Ranked Candidate
                </span>
                <TierBadge tier={bestCandidate.match_tier} size="sm" />
              </div>

              <div className="flex items-start gap-4">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-forest-200 bg-forest-900 shadow">
                  <img
                    src={
                      typeof bestCandidate.metadata.photo_url === 'string'
                        ? bestCandidate.metadata.photo_url
                        : `${API_BASE_URL}/static/images/${typeof bestCandidate.metadata.matched_reference_image_id === 'string' ? bestCandidate.metadata.matched_reference_image_id : 'demo_zebra'}.png`
                    }
                    alt={bestCandidate.animal_name || bestCandidate.individual_id}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      // Fallback image if reference photo is missing
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1551009175-8a68da93d5f9?auto=format&fit=crop&w=400&q=80';
                    }}
                  />
                  <span className="absolute bottom-1 right-1 rounded bg-forest-950/80 px-1 py-0.5 text-[9px] font-mono text-white">
                    Ref #{String(bestCandidate.metadata.matched_reference_image_id || '1')}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-xl font-bold text-forest-900 truncate">
                    {bestCandidate.animal_name || bestCandidate.individual_id}
                  </h2>
                  <p className="text-xs font-medium text-forest-700">{species}</p>
                  <p className="text-xs font-mono text-forest-500 mt-0.5">
                    Individual ID: <strong className="text-forest-800">{bestCandidate.individual_id}</strong>
                  </p>

                  <div className="mt-3">
                    <CosineSimilarityBar
                      score={bestCandidate.similarity_score}
                      tier={bestCandidate.match_tier}
                      label="Feature Cosine Similarity"
                    />
                  </div>
                </div>
              </div>

              {/* Distinguishing details from reference gallery */}
              <div className="mt-4 rounded-xl bg-white/80 p-3 text-xs text-forest-700 space-y-1 border border-forest-100">
                <div className="flex items-center gap-1.5 font-semibold text-forest-800">
                  <Layers size={13} className="text-forest-600" />
                  Gallery Reference Details
                </div>
                <p className="text-forest-600">
                  Matched Reference Image:{' '}
                  <code className="font-mono text-forest-800">
                    {bestCandidate.metadata.matched_reference_image_id || 'reference_fixture'}
                  </code>
                  {bestCandidate.metadata.view ? ` • View: ${bestCandidate.metadata.view}` : ''}
                </p>
                <p className="text-[11px] text-forest-500">
                  Total Reference Images catalogued for this animal:{' '}
                  <strong>{bestCandidate.metadata.total_reference_images || 1}</strong>
                </p>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl border border-forest-200 bg-white/60 p-3 text-[11px] text-forest-600 flex items-start gap-2">
              <Info size={14} className="mt-0.5 shrink-0 text-forest-500" />
              <span>{disclaimer}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-forest-200 bg-forest-50/50 p-6 flex flex-col items-center justify-center text-center">
            <HelpCircle size={40} className="text-forest-400 mb-2" />
            <h3 className="font-display text-lg font-bold text-forest-800">No Candidates Found</h3>
            <p className="mt-1 text-xs text-forest-600 max-w-sm">
              No matching profiles found in the {species} reference gallery. This photo may belong to a newly catalogued subject.
            </p>
          </div>
        )}
      </div>

      {/* Top Candidates Ranked List */}
      {top_candidates.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-forest-800 flex items-center gap-2">
              <Tag size={18} className="text-forest-600" /> Top {top_candidates.length} Ranked Candidates
            </h2>
            <span className="text-xs text-forest-500">
              Sorted descending by L2 cosine alignment [-1.0, +1.0]
            </span>
          </div>

          <div className="space-y-3">
            {top_candidates.map((c, idx) => (
              <CandidateCard
                key={c.individual_id}
                candidate={c}
                species={species}
                rank={idx + 1}
                onViewHistory={() => onViewHistory(c.individual_id)}
                onVerify={() => onVerify(c)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer navigation */}
      <div className="flex justify-end pt-2">
        <button
          onClick={() => onNavigate('identify')}
          className="flex items-center gap-2 rounded-xl border border-forest-200 bg-white px-5 py-2.5 text-xs font-semibold text-forest-700 shadow-sm transition hover:bg-forest-50"
        >
          <ArrowLeft size={16} /> Identify Another Photo
        </button>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  species,
  rank,
  onViewHistory,
  onVerify,
}: {
  candidate: CandidateMatch;
  species: string;
  rank: number;
  onViewHistory: () => void;
  onVerify: () => void;
}) {
  const rankColors = ['border-lime-500', 'border-amber-400', 'border-forest-300'];
  const rankBg = rank === 1 ? 'bg-gradient-to-r from-lime-50/60 to-white' : 'bg-white';

  const refImageId = typeof candidate.metadata.matched_reference_image_id === 'string'
    ? candidate.metadata.matched_reference_image_id
    : 'demo_zebra';
  const photoUrl = typeof candidate.metadata.photo_url === 'string'
    ? candidate.metadata.photo_url
    : `${API_BASE_URL}/static/images/${refImageId}.png`;

  return (
    <div
      className={`overflow-hidden rounded-2xl border-l-4 ${
        rankColors[rank - 1] || 'border-forest-200'
      } border border-forest-100 ${rankBg} p-4 shadow-sm transition-all hover:shadow-md animate-fade-in-up`}
      style={{ animationDelay: `${(rank - 1) * 0.08}s` }}
    >
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
        {/* Reference Image */}
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-forest-200 bg-forest-900 shadow-sm">
          <img
            src={photoUrl}
            alt={candidate.animal_name || candidate.individual_id}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1551009175-8a68da93d5f9?auto=format&fit=crop&w=400&q=80';
            }}
          />
          <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-forest-900/90 text-[11px] font-bold text-white shadow">
            #{rank}
          </div>
        </div>

        {/* Candidate Details */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold text-forest-900">
                  {candidate.animal_name || candidate.individual_id}
                </h3>
                <TierBadge tier={candidate.match_tier} size="sm" />
              </div>
              <p className="text-xs text-forest-600">{species}</p>
              <p className="text-xs font-mono text-forest-400 mt-0.5">
                ID: <span className="text-forest-700 font-semibold">{candidate.individual_id}</span>
              </p>
            </div>

            {/* Cosine Similarity Visual Ring */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="block text-[11px] uppercase tracking-wider text-forest-500 font-semibold">
                  Cosine Alignment
                </span>
                <span className="font-mono text-lg font-bold text-forest-800">
                  {formatSimilarity(candidate.similarity_score)}
                </span>
              </div>
              <CosineSimilarityRing score={candidate.similarity_score} size={58} />
            </div>
          </div>

          {/* Rationale & Source Metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-forest-600 rounded-lg bg-forest-50/60 p-2.5">
            <span className="font-medium text-forest-700">
              Matched Image: <code className="font-mono text-forest-900">{refImageId}</code>
            </span>
            {candidate.metadata.view && (
              <>
                <span className="text-forest-300">•</span>
                <span>View: {candidate.metadata.view}</span>
              </>
            )}
            <span className="text-forest-300">•</span>
            <span>Total Catalogued Views: {candidate.metadata.total_reference_images || 1}</span>
          </div>

          {/* Action buttons */}
          <div className="mt-3.5 flex flex-wrap gap-2">
            <button
              onClick={onVerify}
              className="flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-forest-700"
            >
              <CheckCircle2 size={14} /> Verify Identity
            </button>
            <button
              onClick={onViewHistory}
              className="flex items-center gap-1.5 rounded-lg border border-forest-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-forest-700 transition hover:bg-forest-50"
            >
              <History size={14} /> Sighting Records
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
