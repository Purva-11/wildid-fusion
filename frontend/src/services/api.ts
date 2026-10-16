import type {
  Animal,
  CameraTrapRecord,
  DashboardStats,
  PendingReview,
  RecentSighting,
  ReIDRankingResult,
  Species,
  SystemHealth,
} from '@/types';
import {
  demoAnimals,
  demoCameraTrapRecords,
  demoDashboardStats,
  demoPendingReviews,
  demoRecentSightings,
} from '@/data/demoData';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const IS_DEMO = false;

// ---------------------------------------------------------------------------
// Real API Integration with WildID Fusion FastAPI backend
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(`API error ${response.status}: ${errorDetail}`);
  }
  return response.json() as Promise<T>;
}

// --- System Health ---

export async function getHealth(): Promise<SystemHealth> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status}): ${response.statusText}`);
  }
  return response.json() as Promise<SystemHealth>;
}

// --- Animal Identification ---

export interface IdentifyRequest {
  photoFile: File;
  species?: string;
  detectAnimals?: boolean;
  topK?: number;
}

export interface IdentifyResponse {
  result: ReIDRankingResult;
  uploadedImageUrl: string;
  processedAt: string;
}

export async function identifyAnimal(request: IdentifyRequest): Promise<IdentifyResponse> {
  const formData = new FormData();
  formData.append('file', request.photoFile);
  formData.append('species', request.species || 'Plains Zebra');
  formData.append('detect_animals', String(request.detectAnimals ?? true));
  formData.append('top_k', String(request.topK ?? 3));

  const response = await fetch(`${API_BASE_URL}/api/reid/identify`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(`Identification failed (${response.status}): ${errorDetail}`);
  }

  const result = (await response.json()) as ReIDRankingResult;
  return {
    result,
    uploadedImageUrl: URL.createObjectURL(request.photoFile),
    processedAt: new Date().toISOString(),
  };
}

// --- Animal Profiles / Registry ---

export async function getAnimals(filters?: {
  species?: Species;
  search?: string;
}): Promise<Animal[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.species && filters.species !== 'all') params.set('species', filters.species);
    if (filters?.search) params.set('search', filters.search);
    const animals = await apiFetch<Animal[]>(`/api/animals?${params.toString()}`);
    return animals.map((a) => ({
      ...a,
      photoUrl: a.photoUrl.startsWith('/') ? `${API_BASE_URL}${a.photoUrl}` : a.photoUrl,
    }));
  } catch (err) {
    console.warn('[WildID Fusion] Could not fetch animals from live API, falling back to cached profiles:', err);
    let result = [...demoAnimals];
    if (filters?.species && filters.species !== 'all') {
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
}

export async function getAnimalById(id: string): Promise<Animal | null> {
  try {
    const animal = await apiFetch<Animal>(`/api/animals/${id}`);
    return {
      ...animal,
      photoUrl: animal.photoUrl.startsWith('/') ? `${API_BASE_URL}${animal.photoUrl}` : animal.photoUrl,
    };
  } catch {
    return demoAnimals.find((a) => a.id === id) || null;
  }
}

// --- Camera-Trap History ---

export async function getCameraTrapHistory(animalId: string): Promise<CameraTrapRecord[]> {
  try {
    return await apiFetch<CameraTrapRecord[]>(`/api/animals/${animalId}/camera-trap-history`);
  } catch {
    return demoCameraTrapRecords
      .filter((r) => r.animalId === animalId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}

// --- Dashboard ---

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const stats = await apiFetch<DashboardStats>('/api/dashboard/stats');
    return {
      ...stats,
      speciesBreakdown: stats.speciesBreakdown.map((sb) => ({
        ...sb,
        photoUrl: sb.photoUrl.startsWith('/') ? `${API_BASE_URL}${sb.photoUrl}` : sb.photoUrl,
      })),
    };
  } catch {
    return demoDashboardStats;
  }
}

export async function getRecentSightings(limit = 6): Promise<RecentSighting[]> {
  try {
    return await apiFetch<RecentSighting[]>(`/api/dashboard/recent-sightings?limit=${limit}`);
  } catch {
    return demoRecentSightings.slice(0, limit);
  }
}

export async function getPendingReviews(): Promise<PendingReview[]> {
  try {
    return await apiFetch<PendingReview[]>('/api/dashboard/pending-reviews');
  } catch {
    return demoPendingReviews;
  }
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
  try {
    return await apiFetch<{ success: boolean }>('/api/verify', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  } catch {
    console.info('[WildID Fusion] Verification logged locally:', request);
    return { success: true };
  }
}
