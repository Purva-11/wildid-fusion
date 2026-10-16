export type KnownSpecies =
  | 'Bengal Tiger'
  | 'Indian Leopard'
  | 'Asian Elephant'
  | 'Sambar Deer'
  | 'Indian Wolf'
  | 'Sloth Bear'
  | 'Jaguar'
  | 'Plains Zebra'
  | 'Cheetah';

export type Species = KnownSpecies | string;

export type MatchConfidence = 'high' | 'medium' | 'low';

export type MatchTier = 'HIGH' | 'MODERATE' | 'LOW';

export type ReIDMatchStatus = 'MATCHED' | 'UNCERTAIN' | 'UNKNOWN' | 'NO_DATA';

export interface CandidateMatch {
  individual_id: string;
  animal_name?: string | null;
  similarity_score: number;
  match_tier: MatchTier;
  metadata: Record<string, string | number | boolean | null | undefined>;
}

export interface ReIDRankingResult {
  species: string;
  match_status: ReIDMatchStatus;
  top_candidates: CandidateMatch[];
  best_score: number | null;
  thresholds_applied: {
    high_threshold: number;
    moderate_threshold: number;
  };
  disclaimer: string;
  detector_applied: boolean;
  detector_status?: string | null;
  primary_detection_box?: [number, number, number, number] | null;
  total_animals_detected: number;
}

export interface SystemHealth {
  status: string;
  model_loaded: boolean;
  resolved_model_path: string | null;
  blocker_reason: string | null;
  detector_loaded: boolean;
  detector_model_path: string | null;
  detector_blocker_reason: string | null;
  registered_species: string[];
  total_individuals: number;
  total_reference_images: number;
  input_resolution: string;
  embedding_dimensions: number;
}

export type VerificationStatus = 'confirmed' | 'pending' | 'rejected';

export interface Animal {
  id: string;
  name: string;
  species: Species;
  photoUrl: string;
  firstSighted: string;
  lastSighted: string;
  totalSightings: number;
  status: VerificationStatus;
  description: string;
  distinguishingFeatures: string[];
  habitat: string;
  conservationStatus: 'Endangered' | 'Vulnerable' | 'Near Threatened' | 'Least Concern';
}

export interface CameraTrapRecord {
  id: string;
  animalId: string;
  cameraTrapId: string;
  location: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  photoUrl: string;
  verified: boolean;
  notes: string;
}

export interface MatchCandidate {
  animal: Animal;
  confidence: number;
  matchConfidence: MatchConfidence;
  matchScore: number;
  distinguishingFeatureNote: string;
  cameraTrapHistory: CameraTrapRecord[];
}

export interface DashboardStats {
  totalAnimals: number;
  totalSpecies: number;
  totalSightings: number;
  pendingReviews: number;
  speciesBreakdown: { species: Species; count: number; photoUrl: string }[];
}

export interface RecentSighting {
  id: string;
  animalId: string;
  animalName: string;
  species: Species;
  photoUrl: string;
  location: string;
  timestamp: string;
  cameraTrapId: string;
  verified: boolean;
}

export interface PendingReview {
  id: string;
  uploadedPhotoUrl: string;
  topMatchName: string;
  topMatchSpecies: Species;
  topMatchScore: number;
  timestamp: string;
}

export type ViewMode = 'map' | 'list' | 'timeline';

export type Screen =
  | 'dashboard'
  | 'identify'
  | 'match-results'
  | 'camera-trap-history'
  | 'registry'
  | 'verification';
