import { useEffect, useState } from 'react';
import type { Animal, CameraTrapRecord, MatchCandidate, PendingReview, Screen } from '@/types';
import {
  getAnimalById,
  getPendingReviews,
  submitVerification,
  IS_DEMO,
  type VerificationDecision,
} from '@/services/api';
import {
  formatDateTime,
  confidenceColor,
} from '@/utils/format';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
  Check,
  Loader2,
  Camera,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface VerificationProps {
  pendingCandidate?: MatchCandidate | null;
  pendingRecord?: CameraTrapRecord | null;
  pendingAnimal?: Animal | null;
  uploadedImageUrl?: string;
  onNavigate: (screen: Screen) => void;
}

export function Verification({
  pendingCandidate,
  pendingRecord,
  pendingAnimal,
  uploadedImageUrl,
  onNavigate,
}: VerificationProps) {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReview, setActiveReview] = useState<{
    candidate?: MatchCandidate;
    record?: CameraTrapRecord;
    animal: Animal;
    uploadedPhotoUrl: string;
  } | null>(null);
  const [decision, setDecision] = useState<VerificationDecision | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getPendingReviews().then(setReviews).finally(() => setLoading(false));
  }, []);

  // Handle incoming pending verification from other screens
  useEffect(() => {
    if (pendingCandidate && pendingAnimal) {
      setActiveReview({
        candidate: pendingCandidate,
        animal: pendingAnimal,
        uploadedPhotoUrl: uploadedImageUrl || pendingCandidate.animal.photoUrl,
      });
    } else if (pendingRecord && pendingAnimal) {
      setActiveReview({
        record: pendingRecord,
        animal: pendingAnimal,
        uploadedPhotoUrl: pendingRecord.photoUrl,
      });
    }
  }, [pendingCandidate, pendingRecord, pendingAnimal, uploadedImageUrl]);

  const handleStartReview = async (review: PendingReview) => {
    const animal = await getAnimalById(
      demoAnimalsByMatchName[review.topMatchName] || 'TGR-001'
    );
    if (animal) {
      setActiveReview({
        animal,
        uploadedPhotoUrl: review.uploadedPhotoUrl,
      });
      setDecision(null);
      setNotes('');
      setSubmitted(false);
    }
  };

  const handleSubmit = async () => {
    if (!decision || !activeReview) return;
    setSubmitting(true);
    try {
      await submitVerification({
        uploadedPhotoUrl: activeReview.uploadedPhotoUrl,
        matchedAnimalId: activeReview.animal.id,
        decision,
        notes: notes.trim() || undefined,
      });
      setSubmitted(true);
      // Remove from list after 1.5s
      setTimeout(() => {
        setReviews((prev) => prev.filter((r) => r.uploadedPhotoUrl !== activeReview.uploadedPhotoUrl));
        setActiveReview(null);
        setDecision(null);
        setNotes('');
        setSubmitted(false);
      }, 1500);
    } catch {
      // In demo mode this won't fail
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-forest-100 animate-pulse" />
        <div className="h-64 rounded-2xl bg-forest-50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-forest-800">Verification</h1>
        <p className="mt-1 text-forest-600">
          Compare photos and confirm whether a match is the same individual
        </p>
      </div>

      {IS_DEMO && (
        <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-4 py-2.5 text-sm text-lime-800">
          <Sparkles size={16} className="shrink-0" />
          <span><strong>Demo Mode:</strong> Verification decisions are not saved.</span>
        </div>
      )}

      {/* Active review panel */}
      {activeReview ? (
        <div className="rounded-2xl border border-forest-200 bg-white p-6 shadow-md animate-scale-in">
          {submitted ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-forest-100">
                <Check size={32} className="text-forest-600" />
              </div>
              <h2 className="font-display text-xl font-bold text-forest-800">Verification Submitted</h2>
              <p className="mt-1 text-sm text-forest-500">Thank you for your review</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-forest-800">
                  Compare Photos
                </h2>
                <button
                  onClick={() => { setActiveReview(null); setDecision(null); setNotes(''); }}
                  className="text-sm text-forest-500 hover:text-forest-700"
                >
                  Cancel
                </button>
              </div>

              {/* Photo comparison */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-semibold text-forest-600">Uploaded Photo</p>
                  <img
                    src={activeReview.uploadedPhotoUrl}
                    alt="Uploaded"
                    className="w-full h-56 rounded-xl object-cover border border-forest-200"
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-forest-600">
                    Registered: {activeReview.animal.name}
                  </p>
                  <img
                    src={activeReview.animal.photoUrl}
                    alt={activeReview.animal.name}
                    className="w-full h-56 rounded-xl object-cover border border-forest-200"
                  />
                </div>
              </div>

              {/* Animal info */}
              <div className="mt-4 rounded-xl bg-forest-50/60 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="font-semibold text-forest-800">{activeReview.animal.name}</p>
                    <p className="text-sm text-forest-500">
                      {activeReview.animal.species} · ID: {activeReview.animal.id}
                    </p>
                  </div>
                  {activeReview.candidate && (
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${confidenceColor(activeReview.candidate.matchConfidence)}`}>
                      {activeReview.candidate.matchScore}% match
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeReview.animal.distinguishingFeatures.map((f) => (
                    <span
                      key={f}
                      className="rounded-lg border border-lime-200 bg-lime-50 px-2 py-0.5 text-xs text-lime-800"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Decision buttons */}
              <div className="mt-5">
                <p className="mb-3 font-semibold text-forest-800">Is this the same animal?</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DecisionButton
                    selected={decision === 'same'}
                    onClick={() => setDecision('same')}
                    icon={CheckCircle2}
                    label="Same Animal"
                    color="forest"
                  />
                  <DecisionButton
                    selected={decision === 'different'}
                    onClick={() => setDecision('different')}
                    icon={XCircle}
                    label="Different Animal"
                    color="red"
                  />
                  <DecisionButton
                    selected={decision === 'uncertain'}
                    onClick={() => setDecision('uncertain')}
                    icon={HelpCircle}
                    label="Cannot Confirm"
                    color="amber"
                  />
                </div>
              </div>

              {/* Notes */}
              {decision && (
                <div className="mt-4 animate-fade-in">
                  <label className="mb-1.5 block text-sm font-semibold text-forest-700">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Add any observations about the comparison..."
                    className="w-full rounded-xl border border-forest-200 bg-white p-3 text-sm text-forest-800 placeholder-forest-400 outline-none transition-all focus:border-forest-400 focus:ring-2 focus:ring-forest-200"
                  />
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!decision || submitting}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-forest-600 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-forest-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    Submit Verification
                  </>
                )}
              </button>
            </>
          )}
        </div>
      ) : (
        /* Pending reviews queue */
        <div>
          {reviews.length === 0 ? (
            <div className="rounded-2xl border border-forest-100 bg-white p-12 text-center">
              <CheckCircle2 size={32} className="mx-auto mb-3 text-forest-400" />
              <p className="font-display text-lg font-bold text-forest-700">All caught up!</p>
              <p className="mt-1 text-sm text-forest-500">No pending reviews at this time</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">
                  {reviews.length}
                </span>
                <p className="text-sm font-medium text-forest-600">Pending reviews awaiting verification</p>
              </div>
              <div className="space-y-3">
                {reviews.map((review, i) => (
                  <div
                    key={review.id}
                    className="flex flex-col gap-3 rounded-2xl border border-forest-100 bg-white p-4 shadow-sm transition-all hover:shadow-md animate-fade-in-up sm:flex-row sm:items-center"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    <img
                      src={review.uploadedPhotoUrl}
                      alt="Pending review"
                      className="h-20 w-20 rounded-xl object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-forest-800 truncate">
                          Best match: {review.topMatchName}
                        </h3>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          review.topMatchScore >= 85
                            ? 'border-forest-200 bg-forest-50 text-forest-600'
                            : review.topMatchScore >= 65
                            ? 'border-amber-200 bg-amber-50 text-amber-600'
                            : 'border-red-200 bg-red-50 text-red-600'
                        }`}>
                          {review.topMatchScore}% match
                        </span>
                      </div>
                      <p className="text-sm text-forest-500">{review.topMatchSpecies}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-forest-400">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {formatDateTime(review.timestamp)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Camera size={12} /> Uploaded photo
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartReview(review)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-forest-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-forest-700 shrink-0"
                    >
                      Review <ArrowRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DecisionButton({
  selected,
  onClick,
  icon: Icon,
  label,
  color,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof CheckCircle2;
  label: string;
  color: 'forest' | 'red' | 'amber';
}) {
  const colorMap = {
    forest: { active: 'border-forest-600 bg-forest-50 text-forest-700', idle: 'border-forest-200 text-forest-600' },
    red: { active: 'border-red-500 bg-red-50 text-red-700', idle: 'border-forest-200 text-forest-600' },
    amber: { active: 'border-amber-500 bg-amber-50 text-amber-700', idle: 'border-forest-200 text-forest-600' },
  };
  const c = selected ? colorMap[color].active : colorMap[color].idle;
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${c} ${selected ? 'shadow-md scale-[1.02]' : 'hover:bg-forest-50/50'}`}
    >
      <Icon size={24} />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

// Map match names to animal IDs for demo review lookup
const demoAnimalsByMatchName: Record<string, string> = {
  'Bandhavgarh Prince': 'TGR-003',
  'Jawai Sentinel': 'LEO-002',
  'Termite Hunter': 'BER-001',
  'Antlered Sage': 'DER-001',
  'Pack Leader Asha': 'WLF-001',
  'Corbett King': 'TGR-001',
  'Ranthambore Queen': 'TGR-002',
  'Kabini Ghost': 'LEO-001',
  'Matriarch Sundari': 'ELE-001',
  'Young Bull Karna': 'ELE-002',
};
