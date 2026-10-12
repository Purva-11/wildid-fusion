export type Species =
  | 'Bengal Tiger'
  | 'Indian Leopard'
  | 'Asian Elephant'
  | 'Sambar Deer'
  | 'Indian Wolf'
  | 'Sloth Bear'
  | 'Jaguar';

export type MatchConfidence = 'high' | 'medium' | 'low';

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
