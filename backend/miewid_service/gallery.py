"""
Modular Reference Gallery and Cosine Similarity Ranking Engine.

Design Principles:
1. Keeps species identification strictly partitioned from individual re-identification.
2. Supports multiple reference images per individual, ranking by maximum cosine similarity.
3. Groups candidates by unique individual ID, preventing duplicate candidates in top-K results.
4. Normalizes species aliases safely without merging distinct biological species.
5. Provides persistent serialization and loading via JSON manifests and NumPy compressed arrays.
6. Treats cosine similarity strictly as a geometric metric space alignment in [-1.0, 1.0], NOT a probability score.
7. Categorizes results as MATCHED, UNCERTAIN, or UNKNOWN based on explicit thresholds.
"""

import json
from pathlib import Path
from typing import List, Dict, Optional, Any, Union
import numpy as np
from pydantic import BaseModel, Field

from .config import config
from .taxonomy import canonicalize_species


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
    detector_applied: bool = False
    detector_status: Optional[str] = None
    primary_detection_box: Optional[List[float]] = None
    total_animals_detected: int = 0




class ReferenceGallery:
    def __init__(
        self,
        high_threshold: float = config.high_confidence_threshold,
        moderate_threshold: float = config.moderate_confidence_threshold
    ):
        self.high_threshold = high_threshold
        self.moderate_threshold = moderate_threshold
        # Partitioned store: canonical_species -> { individual_id -> individual_record }
        # individual_record = {
        #     "individual_id": str,
        #     "animal_name": str,
        #     "canonical_species": str,
        #     "images": List[{"image_id": str, "embedding": np.ndarray (unit vector), "source_metadata": dict}]
        # }
        self._gallery_by_species: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def clear(self) -> None:
        """Clears all stored reference individuals and images."""
        self._gallery_by_species.clear()

    def register_image(
        self,
        species: str,
        individual_id: str,
        embedding: np.ndarray,
        image_id: Optional[str] = None,
        animal_name: Optional[str] = None,
        source_metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Registers an image chip reference vector for an individual under a canonical species.
        Ensures the embedding is saved as an L2-normalized float32 unit vector.
        Supports registering multiple images for the same individual.
        """
        canonical_sp = canonicalize_species(species)
        if not canonical_sp:
            raise ValueError(f"Invalid or empty species name: {species!r}")

        ind_id_clean = individual_id.strip()
        if not ind_id_clean:
            raise ValueError("individual_id cannot be empty")

        # 1. Validate embedding dimensions and finiteness
        if not isinstance(embedding, np.ndarray):
            embedding = np.array(embedding, dtype=np.float32)
        if embedding.ndim != 1 or embedding.shape[0] != config.embedding_dim:
            raise ValueError(
                f"Embedding dimension mismatch: expected 1D vector of length {config.embedding_dim}, "
                f"got shape {embedding.shape}"
            )
        if not np.all(np.isfinite(embedding)):
            raise ValueError("Embedding contains non-finite values (NaN or Inf).")

        # 2. L2-normalization with safe zero-norm handling
        norm = float(np.linalg.norm(embedding))
        if norm > 1e-12:
            normalized_vec = (embedding / norm).astype(np.float32)
        else:
            normalized_vec = np.zeros(config.embedding_dim, dtype=np.float32)

        if canonical_sp not in self._gallery_by_species:
            self._gallery_by_species[canonical_sp] = {}


        if ind_id_clean not in self._gallery_by_species[canonical_sp]:
            self._gallery_by_species[canonical_sp][ind_id_clean] = {
                "individual_id": ind_id_clean,
                "animal_name": animal_name or ind_id_clean,
                "canonical_species": canonical_sp,
                "images": []
            }

        ind_record = self._gallery_by_species[canonical_sp][ind_id_clean]
        if animal_name and not ind_record.get("animal_name"):
            ind_record["animal_name"] = animal_name

        resolved_img_id = image_id or f"{ind_id_clean}_img_{len(ind_record['images']) + 1}"
        ind_record["images"].append({
            "image_id": resolved_img_id,
            "embedding": normalized_vec,
            "source_metadata": source_metadata or {}
        })

    def register_individual(
        self,
        species: str,
        individual_id: str,
        embedding: np.ndarray,
        animal_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        image_id: Optional[str] = None
    ) -> None:
        """
        Backward-compatible registration helper.
        Registers a reference image for the given individual.
        """
        self.register_image(
            species=species,
            individual_id=individual_id,
            embedding=embedding,
            image_id=image_id,
            animal_name=animal_name,
            source_metadata=metadata
        )

    def rank(
        self,
        species: str,
        query_embedding: np.ndarray,
        top_k: int = 3,
        detector_applied: bool = False,
        detector_status: Optional[str] = None,
        primary_detection_box: Optional[List[float]] = None,
        total_animals_detected: int = 0
    ) -> ReIDRankingResult:
        """
        Ranks reference individuals of the specified species using cosine similarity.

        For individuals with multiple reference images:
          sim(q, individual) = max_{j in images} (q · r_j)

        The result guarantees:
          1. Unique individual IDs in top_candidates (no duplicate animal listings).
          2. The highest similarity score achieved across any of that individual's reference images.
          3. Exact species partition isolation.
        """
        canonical_sp = canonicalize_species(species)
        thresholds = {
            "high_threshold": self.high_threshold,
            "moderate_threshold": self.moderate_threshold
        }

        if not canonical_sp or canonical_sp not in self._gallery_by_species or len(self._gallery_by_species[canonical_sp]) == 0:
            return ReIDRankingResult(
                species=canonical_sp or species,
                match_status="NO_DATA",
                top_candidates=[],
                best_score=None,
                thresholds_applied=thresholds,
                detector_applied=detector_applied,
                detector_status=detector_status,
                primary_detection_box=primary_detection_box,
                total_animals_detected=total_animals_detected
            )


        # Validate query embedding
        if not isinstance(query_embedding, np.ndarray):
            query_embedding = np.array(query_embedding, dtype=np.float32)
        if query_embedding.ndim != 1 or query_embedding.shape[0] != config.embedding_dim:
            raise ValueError(
                f"Query embedding dimension mismatch: expected 1D vector of length {config.embedding_dim}, "
                f"got shape {query_embedding.shape}"
            )
        if not np.all(np.isfinite(query_embedding)):
            raise ValueError("Query embedding contains non-finite values (NaN or Inf).")

        # Normalize query vector with safe zero-norm handling
        q_norm = float(np.linalg.norm(query_embedding))
        if q_norm > 1e-12:
            q_vec = (query_embedding / q_norm).astype(np.float32)
        else:
            q_vec = np.zeros(config.embedding_dim, dtype=np.float32)

        candidates: List[CandidateMatch] = []
        species_store = self._gallery_by_species[canonical_sp]

        for ind_id, record in species_store.items():
            if not record["images"]:
                continue

            best_sim_for_ind = -2.0
            best_img_for_ind = None

            for img_entry in record["images"]:
                ref_vec = img_entry["embedding"]
                sim = float(np.dot(q_vec, ref_vec))
                # Guarantee strict clamping to [-1.0, 1.0] to prevent IEEE-754 drift
                sim = max(-1.0, min(1.0, sim))

                if sim > best_sim_for_ind:
                    best_sim_for_ind = sim
                    best_img_for_ind = img_entry


            if best_img_for_ind is None:
                continue

            if best_sim_for_ind >= self.high_threshold:
                tier = "HIGH"
            elif best_sim_for_ind >= self.moderate_threshold:
                tier = "MODERATE"
            else:
                tier = "LOW"

            cand_metadata = dict(best_img_for_ind.get("source_metadata", {}))
            cand_metadata["matched_reference_image_id"] = best_img_for_ind["image_id"]
            cand_metadata["total_reference_images"] = len(record["images"])

            candidates.append(CandidateMatch(
                individual_id=record["individual_id"],
                animal_name=record["animal_name"],
                similarity_score=round(best_sim_for_ind, 4),
                match_tier=tier,
                metadata=cand_metadata
            ))

        # Rank descending by similarity score
        candidates.sort(key=lambda c: c.similarity_score, reverse=True)
        top_selected = candidates[:top_k]

        best_score = top_selected[0].similarity_score if top_selected else None

        # Categorize Match Classification
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
            species=canonical_sp,
            match_status=status,
            top_candidates=top_selected,
            best_score=best_score,
            thresholds_applied=thresholds,
            detector_applied=detector_applied,
            detector_status=detector_status,
            primary_detection_box=primary_detection_box,
            total_animals_detected=total_animals_detected
        )


    def save_to_disk(self, gallery_dir: Optional[Union[str, Path]] = None) -> Path:
        """
        Serializes the gallery state to disk:
        - manifest.json: Metadata entries for all registered reference images.
        - embeddings.npz: L2-normalized float32 embedding matrix and image ID index.
        """
        target_dir = Path(gallery_dir or config.gallery_dir)
        target_dir.mkdir(parents=True, exist_ok=True)

        manifest_items: List[Dict[str, Any]] = []
        image_ids: List[str] = []
        embedding_list: List[np.ndarray] = []

        for canonical_sp, ind_dict in self._gallery_by_species.items():
            for ind_id, ind_record in ind_dict.items():
                for img_entry in ind_record["images"]:
                    img_id = img_entry["image_id"]
                    image_ids.append(img_id)
                    embedding_list.append(img_entry["embedding"])

                    manifest_items.append({
                        "image_id": img_id,
                        "individual_id": ind_id,
                        "species": canonical_sp,
                        "animal_name": ind_record["animal_name"],
                        "source_metadata": img_entry.get("source_metadata", {})
                    })

        manifest_path = target_dir / config.gallery_manifest_filename
        embeddings_path = target_dir / config.gallery_embeddings_filename

        # Write manifest JSON
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_items, f, indent=2, ensure_ascii=False)

        # Write embeddings NPZ
        if embedding_list:
            embeddings_arr = np.vstack(embedding_list).astype(np.float32)
        else:
            embeddings_arr = np.empty((0, config.embedding_dim), dtype=np.float32)

        np.savez_compressed(
            embeddings_path,
            image_ids=np.array(image_ids, dtype=object),
            embeddings=embeddings_arr
        )

        return target_dir

    def load_from_disk(self, gallery_dir: Optional[Union[str, Path]] = None) -> bool:
        """
        Loads the gallery state from disk:
        Returns True if loaded successfully, False if files are missing or invalid.
        """
        target_dir = Path(gallery_dir or config.gallery_dir)
        manifest_path = target_dir / config.gallery_manifest_filename
        embeddings_path = target_dir / config.gallery_embeddings_filename

        if not manifest_path.exists() or not embeddings_path.exists():
            return False

        try:
            with open(manifest_path, "r", encoding="utf-8-sig") as f:
                manifest_items = json.load(f)

            if not isinstance(manifest_items, list):
                print(f"[Gallery] Corrupt manifest at {manifest_path}: expected JSON list.")
                return False

            with np.load(embeddings_path, allow_pickle=True) as data:
                if "image_ids" not in data or "embeddings" not in data:
                    print(f"[Gallery] Invalid embeddings archive at {embeddings_path}.")
                    return False
                image_ids = data["image_ids"].tolist()
                embeddings_arr = data["embeddings"].astype(np.float32)

            if len(manifest_items) != len(image_ids) or len(manifest_items) != len(embeddings_arr):
                print(f"[Gallery] Size mismatch in {target_dir}: manifest={len(manifest_items)}, embeddings={len(embeddings_arr)}")
                return False

            # Rebuild state atomically
            self.clear()
            for idx, item in enumerate(manifest_items):
                vec = embeddings_arr[idx]
                self.register_image(
                    species=item["species"],
                    individual_id=item["individual_id"],
                    embedding=vec,
                    image_id=item.get("image_id") or image_ids[idx],
                    animal_name=item.get("animal_name"),
                    source_metadata=item.get("source_metadata", {})
                )

            return True

        except Exception as e:
            print(f"[Gallery] Failed to load gallery from {target_dir}: {e}")
            return False

    def get_registered_species(self) -> List[str]:
        """Returns sorted list of registered canonical species with at least one individual."""
        return sorted([sp for sp, ind_map in self._gallery_by_species.items() if len(ind_map) > 0])

    def get_species_count(self, species: str) -> int:
        """Returns the number of unique individuals registered under the species."""
        canonical_sp = canonicalize_species(species)
        if not canonical_sp:
            return 0
        return len(self._gallery_by_species.get(canonical_sp, {}))

    def get_total_individuals(self) -> int:
        """Returns total unique individuals across all species partitions."""
        return sum(len(ind_dict) for ind_dict in self._gallery_by_species.values())

    def get_total_images(self, species: Optional[str] = None) -> int:
        """Returns total reference images across all individuals, optionally filtered by species."""
        if species:
            canonical_sp = canonicalize_species(species)
            if not canonical_sp:
                return 0
            return sum(len(rec["images"]) for rec in self._gallery_by_species.get(canonical_sp, {}).values())
        return sum(
            len(rec["images"])
            for ind_dict in self._gallery_by_species.values()
            for rec in ind_dict.values()
        )
