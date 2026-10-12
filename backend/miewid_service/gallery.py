"""
Modular Reference Gallery and Cosine Similarity Ranking Engine.

Design Principles:
1. Keeps species identification separated from individual re-identification.
2. Ranks candidate individual animals using cosine similarity.
3. Treats similarity as geometric distance, NOT probability.
4. Categorizes results as MATCHED, UNCERTAIN, or UNKNOWN based on explicit thresholds.
"""

from typing import List, Dict, Optional, Any
import numpy as np
from pydantic import BaseModel, Field

from .config import config


class CandidateMatch(BaseModel):
    individual_id: str
    animal_name: Optional[str] = None
    similarity_score: float = Field(..., description="Cosine similarity in [-1.0, 1.0]")
    match_tier: str = Field(..., description="'HIGH', 'MODERATE', or 'LOW'")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ReIDRankingResult(BaseModel):
    species: str
    match_status: str = Field(..., description="'MATCHED', 'UNCERTAIN', 'UNKNOWN', or 'NO_DATA'")
    top_candidates: List[CandidateMatch]
    best_score: Optional[float] = None
    thresholds_applied: Dict[str, float]
    disclaimer: str = (
        "Cosine similarity measures metric feature space alignment [-1.0, 1.0] "
        "and is NOT a calibrated probability score."
    )


class ReferenceGallery:
    def __init__(
        self,
        high_threshold: float = config.high_confidence_threshold,
        moderate_threshold: float = config.moderate_confidence_threshold
    ):
        self.high_threshold = high_threshold
        self.moderate_threshold = moderate_threshold
        # Partitioned store: species -> list of individual records
        # Record format: {"individual_id": str, "animal_name": str, "embedding": np.ndarray (unit vector), "metadata": dict}
        self._gallery_by_species: Dict[str, List[Dict[str, Any]]] = {}

    def register_individual(
        self,
        species: str,
        individual_id: str,
        embedding: np.ndarray,
        animal_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Registers an individual animal reference vector under a specific species.
        Ensures the embedding is saved as a unit (L2-normalized) float32 vector.
        """
        norm = float(np.linalg.norm(embedding))
        if norm > 1e-12:
            normalized_vec = (embedding / norm).astype(np.float32)
        else:
            normalized_vec = embedding.astype(np.float32)

        species_key = species.strip().lower()
        if species_key not in self._gallery_by_species:
            self._gallery_by_species[species_key] = []

        self._gallery_by_species[species_key].append({
            "individual_id": individual_id,
            "animal_name": animal_name or individual_id,
            "embedding": normalized_vec,
            "metadata": metadata or {}
        })

    def rank(
        self,
        species: str,
        query_embedding: np.ndarray,
        top_k: int = 3
    ) -> ReIDRankingResult:
        """
        Ranks reference individuals of the specified species using cosine similarity.
        
        Cosine similarity:
          sim(q, r) = (q · r) / (||q|| * ||r||)
        When vectors are L2-normalized:
          sim(q, r) = q · r
        """
        species_key = species.strip().lower()
        thresholds = {
            "high_threshold": self.high_threshold,
            "moderate_threshold": self.moderate_threshold
        }

        if species_key not in self._gallery_by_species or len(self._gallery_by_species[species_key]) == 0:
            return ReIDRankingResult(
                species=species,
                match_status="NO_DATA",
                top_candidates=[],
                best_score=None,
                thresholds_applied=thresholds
            )

        # Normalize query vector
        q_norm = float(np.linalg.norm(query_embedding))
        if q_norm > 1e-12:
            q_vec = (query_embedding / q_norm).astype(np.float32)
        else:
            q_vec = query_embedding.astype(np.float32)

        candidates: List[CandidateMatch] = []
        for record in self._gallery_by_species[species_key]:
            ref_vec = record["embedding"]
            sim = float(np.dot(q_vec, ref_vec))
            # Clamp numerical drift to [-1.0, 1.0]
            sim = max(-1.0, min(1.0, sim))

            if sim >= self.high_threshold:
                tier = "HIGH"
            elif sim >= self.moderate_threshold:
                tier = "MODERATE"
            else:
                tier = "LOW"

            candidates.append(CandidateMatch(
                individual_id=record["individual_id"],
                animal_name=record["animal_name"],
                similarity_score=round(sim, 4),
                match_tier=tier,
                metadata=record["metadata"]
            ))

        # Rank descending by similarity score
        candidates.sort(key=lambda c: c.similarity_score, reverse=True)
        top_selected = candidates[:top_k]

        best_score = top_selected[0].similarity_score if top_selected else None

        # Determine Match Classification
        if best_score is not None:
            if best_score >= self.high_threshold:
                status = "MATCHED"
            elif best_score >= self.moderate_threshold:
                status = "UNCERTAIN"
            else:
                status = "UNKNOWN"
        else:
            status = "NO_DATA"

        return ReIDRankingResult(
            species=species,
            match_status=status,
            top_candidates=top_selected,
            best_score=best_score,
            thresholds_applied=thresholds
        )

    def get_registered_species(self) -> List[str]:
        return list(self._gallery_by_species.keys())

    def get_species_count(self, species: str) -> int:
        return len(self._gallery_by_species.get(species.strip().lower(), []))
