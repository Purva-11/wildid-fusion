import type {
  Animal,
  CameraTrapRecord,
  DashboardStats,
  MatchCandidate,
  PendingReview,
  RecentSighting,
  Species,
} from '@/types';
import {
  demoAnimals,
  demoCameraTrapRecords,
  demoDashboardStats,
  demoPendingReviews,
  demoRecentSightings,
  getDemoMatchCandidates,
} from '@/data/demoData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const IS_DEMO = !API_BASE_URL;

if (IS_DEMO) {
  console.info(
    '%c[WildID Fusion] Running in DEMO mode — showing labeled sample data. Set VITE_API_BASE_URL to connect the real backend.',
    'color: #2e8b2e; font-weight: bold;'
  );
}

// ---------------------------------------------------------------------------
// Integration points — these functions will call the real backend (Antigravity)
// once VITE_API_BASE_URL is configured. Each function checks for the API URL
// and falls back to labeled demo data when it's not set.
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// --- Animal Identification ---

export interface IdentifyRequest {
  photoFile: File;
}

export interface IdentifyResponse {
  candidates: MatchCandidate[];
  uploadedImageUrl: string;
  processedAt: string;
}

export async function identifyAnimal(request: IdentifyRequest): Promise<IdentifyResponse> {
  if (IS_DEMO) {
    await simulateLatency(1500);
    return {
      candidates: getDemoMatchCandidates(),
      uploadedImageUrl: URL.createObjectURL(request.photoFile),
      processedAt: new Date().toISOString(),
    };
  }
  const formData = new FormData();
  formData.append('photo', request.photoFile);
  const response = await fetch(`${API_BASE_URL}/api/identify`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new Error(`Identification failed: ${response.statusText}`);
  return response.json() as Promise<IdentifyResponse>;
}

// --- Animal Profiles / Registry ---

export async function getAnimals(filters?: {
  species?: Species;
  search?: string;
}): Promise<Animal[]> {
  if (IS_DEMO) {
    await simulateLatency(400);
    let result = [...demoAnimals];
    if (filters?.species) {
      result = result.filter((a) => a.species === filters.species);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.species.toLowerCase().includes(q)
      );
    }
    return result;
  }
  const params = new URLSearchParams();
  if (filters?.species) params.set('species', filters.species);
  if (filters?.search) params.set('search', filters.search);
  return apiFetch<Animal[]>(`/api/animals?${params.toString()}`);
}

export async function getAnimalById(id: string): Promise<Animal | null> {
  if (IS_DEMO) {
    await simulateLatency(300);
    return demoAnimals.find((a) => a.id === id) || null;
  }
  return apiFetch<Animal>(`/api/animals/${id}`);
}

// --- Camera-Trap History ---

export async function getCameraTrapHistory(
  animalId: string
): Promise<CameraTrapRecord[]> {
  if (IS_DEMO) {
    await simulateLatency(500);
    return demoCameraTrapRecords
      .filter((r) => r.animalId === animalId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  return apiFetch<CameraTrapRecord[]>(`/api/animals/${animalId}/camera-trap-history`);
}

// --- Dashboard ---

export async function getDashboardStats(): Promise<DashboardStats> {
  if (IS_DEMO) {
    await simulateLatency(300);
    return demoDashboardStats;
  }
  return apiFetch<DashboardStats>('/api/dashboard/stats');
}

export async function getRecentSightings(limit = 6): Promise<RecentSighting[]> {
  if (IS_DEMO) {
    await simulateLatency(300);
    return demoRecentSightings.slice(0, limit);
  }
  return apiFetch<RecentSighting[]>(`/api/dashboard/recent-sightings?limit=${limit}`);
}

export async function getPendingReviews(): Promise<PendingReview[]> {
  if (IS_DEMO) {
    await simulateLatency(300);
    return demoPendingReviews;
  }
  return apiFetch<PendingReview[]>('/api/dashboard/pending-reviews');
}

// --- Verification ---

export type VerificationDecision = 'same' | 'different' | 'uncertain';

export interface VerificationRequest {
  uploadedPhotoUrl: string;
  matchedAnimalId: string;
  decision: VerificationDecision;
  notes?: string;
}

export async function submitVerification(
  request: VerificationRequest
): Promise<{ success: boolean }> {
  if (IS_DEMO) {
    await simulateLatency(600);
    console.info('[DEMO] Verification submitted:', request);
    return { success: true };
  }
  return apiFetch<{ success: boolean }>('/api/verify', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// --- Helpers ---

function simulateLatency(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { IS_DEMO };
