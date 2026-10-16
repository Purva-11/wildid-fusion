import type { MatchConfidence, VerificationStatus } from '@/types';

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHrs < 24) return `${diffHrs} hr ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return formatDate(dateStr);
}

export function confidenceLabel(confidence: MatchConfidence): string {
  switch (confidence) {
    case 'high':
      return 'High Confidence';
    case 'medium':
      return 'Medium Confidence';
    case 'low':
      return 'Low Confidence';
  }
}

export function confidenceColor(confidence: MatchConfidence): string {
  switch (confidence) {
    case 'high':
      return 'text-forest-600 bg-forest-50 border-forest-200';
    case 'medium':
      return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'low':
      return 'text-red-600 bg-red-50 border-red-200';
  }
}

export function statusLabel(status: VerificationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending':
      return 'Pending Review';
    case 'rejected':
      return 'Rejected';
  }
}

export function statusColor(status: VerificationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'text-forest-600 bg-forest-50 border-forest-200';
    case 'pending':
      return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'rejected':
      return 'text-red-600 bg-red-50 border-red-200';
  }
}

export function conservationColor(status: string): string {
  switch (status) {
    case 'Endangered':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'Vulnerable':
      return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'Near Threatened':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    default:
      return 'text-forest-600 bg-forest-50 border-forest-200';
  }
}

export function tierColor(tier: 'HIGH' | 'MODERATE' | 'LOW' | string): string {
  switch (tier.toUpperCase()) {
    case 'HIGH':
      return 'text-forest-700 bg-forest-50 border-forest-300';
    case 'MODERATE':
      return 'text-amber-700 bg-amber-50 border-amber-300';
    case 'LOW':
    default:
      return 'text-zinc-600 bg-zinc-50 border-zinc-200';
  }
}

export function formatSimilarity(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'N/A';
  const prefix = score > 0 ? '+' : '';
  return `${prefix}${score.toFixed(4)}`;
}

export function matchStatusDetails(status: string): {
  bg: string;
  text: string;
  border: string;
  title: string;
  description: string;
} {
  switch (status.toUpperCase()) {
    case 'MATCHED':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        border: 'border-emerald-300',
        title: 'Confident Match Verified',
        description:
          'Highest similarity score meets or exceeds the high-confidence verification threshold (≥ 0.70). Individual identification confirmed.',
      };
    case 'UNCERTAIN':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-300',
        title: 'Moderate Match — Visual Review Recommended',
        description:
          'Candidate matched with moderate alignment (0.55 – 0.70). Manual expert comparison recommended before logging as verified.',
      };
    case 'UNKNOWN':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        border: 'border-blue-300',
        title: 'Potential New / Unregistered Individual',
        description:
          'No catalogued candidate met the minimum identification threshold (< 0.55). This sighting likely represents a new or unregistered animal.',
      };
    case 'NO_DATA':
    default:
      return {
        bg: 'bg-zinc-50',
        text: 'text-zinc-700',
        border: 'border-zinc-300',
        title: 'No Reference Data / No Animals Detected',
        description:
          'Either no reference gallery profiles exist for this species, or no wildlife subjects were detected in the uploaded frame.',
      };
  }
}
