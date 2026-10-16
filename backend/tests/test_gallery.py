"""
Unit and Integration Tests for WildID Fusion Reference Gallery Subsystem.

Tests cover:
1. Missing gallery handling (graceful NO_DATA).
2. Persistence / reloading round-trip from disk (manifest + embeddings).
3. Multiple reference images per individual (max similarity, no duplicates in top candidates).
4. Strict species isolation (partition boundaries).
5. Safe species alias normalization (no cross-species merging, safe unknown handling).
6. Manifest validation (rejecting invalid/corrupt entries).
7. Decision thresholds and ranking tiers (HIGH / MODERATE / LOW).
"""

import json
import os
import sys
import shutil
import tempfile
import unittest
from pathlib import Path

# Add backend directory to path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
from PIL import Image

from miewid_service.config import config
from miewid_service.gallery import ReferenceGallery, CandidateMatch, ReIDRankingResult
from miewid_service.taxonomy import canonicalize_species, SPECIES_ALIASES
from build_gallery import validate_manifest_entry, build_gallery_from_manifest



class TestReferenceGallery(unittest.TestCase):
    def setUp(self):
        self.gallery = ReferenceGallery(high_threshold=0.70, moderate_threshold=0.55)
        self.dim = config.embedding_dim

    def _make_unit_vector(self, seed: int = 42) -> np.ndarray:
        rng = np.random.RandomState(seed)
        vec = rng.randn(self.dim).astype(np.float32)
        return vec / np.linalg.norm(vec)

    # 1. Missing gallery handling
    def test_missing_gallery_graceful_handling(self):
        empty_gallery = ReferenceGallery()
        self.assertEqual(empty_gallery.get_registered_species(), [])
        self.assertEqual(empty_gallery.get_total_individuals(), 0)
        self.assertEqual(empty_gallery.get_total_images(), 0)

        query_vec = self._make_unit_vector(10)
        result = empty_gallery.rank("Plains Zebra", query_vec)
        self.assertEqual(result.match_status, "NO_DATA")
        self.assertEqual(result.top_candidates, [])
        self.assertIsNone(result.best_score)

        # Loading from non-existent directory must return False without crashing
        with tempfile.TemporaryDirectory() as empty_dir:
            loaded = empty_gallery.load_from_disk(empty_dir)
            self.assertFalse(loaded)

    # 2. Persistence / reloading round-trip
    def test_persistence_save_and_reload(self):
        vec1 = self._make_unit_vector(101)
        vec2 = self._make_unit_vector(102)

        self.gallery.register_image(
            species="Plains Zebra",
            individual_id="IND-ZEB-001",
            embedding=vec1,
            image_id="img_zeb_1",
            animal_name="Kip",
            source_metadata={"angle": "left"}
        )
        self.gallery.register_image(
            species="Cheetah",
            individual_id="IND-CHT-001",
            embedding=vec2,
            image_id="img_cht_1",
            animal_name="Kendi",
            source_metadata={"angle": "profile"}
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            # Save
            self.gallery.save_to_disk(tmp_dir)
            self.assertTrue((Path(tmp_dir) / config.gallery_manifest_filename).exists())
            self.assertTrue((Path(tmp_dir) / config.gallery_embeddings_filename).exists())

            # Reload into clean instance
            new_gallery = ReferenceGallery()
            loaded = new_gallery.load_from_disk(tmp_dir)
            self.assertTrue(loaded)

            self.assertEqual(new_gallery.get_registered_species(), ["Cheetah", "Plains Zebra"])
            self.assertEqual(new_gallery.get_total_individuals(), 2)
            self.assertEqual(new_gallery.get_total_images(), 2)
            self.assertEqual(new_gallery.get_species_count("Plains Zebra"), 1)
            self.assertEqual(new_gallery.get_species_count("Cheetah"), 1)

            # Test ranking on reloaded gallery with identical query vector
            res = new_gallery.rank("Plains Zebra", vec1)
            self.assertEqual(res.match_status, "MATCHED")
            self.assertEqual(res.top_candidates[0].individual_id, "IND-ZEB-001")
            self.assertAlmostEqual(res.top_candidates[0].similarity_score, 1.0, places=3)
            self.assertEqual(res.top_candidates[0].metadata["matched_reference_image_id"], "img_zeb_1")

    # 3. Multiple reference images per individual
    def test_multiple_images_per_individual_selects_max_similarity(self):
        # IND-001 has two distinct reference images
        ref_vec_a = self._make_unit_vector(201)
        ref_vec_b = self._make_unit_vector(202)

        self.gallery.register_image(
            species="Plains Zebra",
            individual_id="IND-ZEB-001",
            embedding=ref_vec_a,
            image_id="chip_a",
            animal_name="Kip",
            source_metadata={"view": "front"}
        )
        self.gallery.register_image(
            species="Plains Zebra",
            individual_id="IND-ZEB-001",
            embedding=ref_vec_b,
            image_id="chip_b",
            animal_name="Kip",
            source_metadata={"view": "side"}
        )

        # IND-002 has one reference image
        ref_vec_c = self._make_unit_vector(203)
        self.gallery.register_image(
            species="Plains Zebra",
            individual_id="IND-ZEB-002",
            embedding=ref_vec_c,
            image_id="chip_c",
            animal_name="Zara"
        )

        self.assertEqual(self.gallery.get_species_count("Plains Zebra"), 2)
        self.assertEqual(self.gallery.get_total_images("Plains Zebra"), 3)

        # Query very close to ref_vec_b
        query_vec = ref_vec_b * 0.9 + self._make_unit_vector(999) * 0.1
        query_vec /= np.linalg.norm(query_vec)

        result = self.gallery.rank("Plains Zebra", query_vec, top_k=5)

        # Crucial check: IND-ZEB-001 must appear only ONCE in candidates (no duplicate rows)
        candidate_ids = [c.individual_id for c in result.top_candidates]
        self.assertEqual(len(candidate_ids), len(set(candidate_ids)))
        self.assertEqual(candidate_ids[0], "IND-ZEB-001")

        # Top candidate must reflect max similarity and identify the matching image chip
        top_cand = result.top_candidates[0]
        self.assertGreater(top_cand.similarity_score, 0.70)
        self.assertEqual(top_cand.match_tier, "HIGH")
        self.assertEqual(top_cand.metadata["matched_reference_image_id"], "chip_b")
        self.assertEqual(top_cand.metadata["total_reference_images"], 2)

    # 4. Species isolation
    def test_species_isolation(self):
        vec_zebra = self._make_unit_vector(301)
        vec_cheetah = self._make_unit_vector(302)

        self.gallery.register_image("Plains Zebra", "IND-ZEB-001", vec_zebra)
        self.gallery.register_image("Cheetah", "IND-CHT-001", vec_cheetah)

        # Query Plains Zebra with cheetah vector
        res_zebra = self.gallery.rank("Plains Zebra", vec_cheetah)
        self.assertEqual(res_zebra.species, "Plains Zebra")
        for cand in res_zebra.top_candidates:
            self.assertNotEqual(cand.individual_id, "IND-CHT-001")

        # Query uncatalogued species
        res_tiger = self.gallery.rank("Bengal Tiger", vec_zebra)
        self.assertEqual(res_tiger.match_status, "NO_DATA")
        self.assertEqual(res_tiger.top_candidates, [])

    # 5. Safe species alias normalization
    def test_safe_species_alias_normalization(self):
        # Vernacular and scientific synonyms resolve to canonical
        self.assertEqual(canonicalize_species("zebra"), "Plains Zebra")
        self.assertEqual(canonicalize_species("plains zebra"), "Plains Zebra")
        self.assertEqual(canonicalize_species("equus quagga"), "Plains Zebra")
        self.assertEqual(canonicalize_species("  EQUUS QUAGGA BOEHMI  "), "Plains Zebra")

        self.assertEqual(canonicalize_species("cheetah"), "Cheetah")
        self.assertEqual(canonicalize_species("tiger"), "Bengal Tiger")
        self.assertEqual(canonicalize_species("leopard"), "Indian Leopard")

        # Distinct species MUST NOT merge
        self.assertNotEqual(canonicalize_species("zebra"), canonicalize_species("grevy's zebra"))
        self.assertEqual(canonicalize_species("grevy's zebra"), "Grevy's Zebra")
        self.assertEqual(canonicalize_species("mountain zebra"), "Mountain Zebra")
        self.assertNotEqual(canonicalize_species("tiger"), canonicalize_species("leopard"))
        self.assertNotEqual(canonicalize_species("asian elephant"), canonicalize_species("african elephant"))

        # Unknown species must not guess or merge, but normalize title-case cleanly
        self.assertEqual(canonicalize_species("Tasmanian Devil"), "Tasmanian Devil")
        self.assertEqual(canonicalize_species("  red fox  "), "Red Fox")

        # Invalid or empty
        self.assertEqual(canonicalize_species(""), "")
        self.assertEqual(canonicalize_species("   "), "")
        self.assertEqual(canonicalize_species(None), "")

    # 6. Manifest validation for gallery builder
    def test_manifest_validation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            img_dir = Path(tmp_dir)
            img_file = img_dir / "valid_animal.png"
            # Create a small valid test image
            Image.new("RGB", (64, 64), color="green").save(img_file)

            # Valid entry
            valid_entry = {
                "image_file": "valid_animal.png",
                "individual_id": "IND-001",
                "species": "zebra"
            }
            validated = validate_manifest_entry(valid_entry, 0, img_dir)
            self.assertEqual(validated["individual_id"], "IND-001")
            self.assertEqual(validated["canonical_species"], "Plains Zebra")
            self.assertEqual(validated["image_id"], "valid_animal")

            # Missing individual_id
            invalid_entry_1 = {"image_file": "valid_animal.png", "species": "zebra"}
            with self.assertRaises(ValueError):
                validate_manifest_entry(invalid_entry_1, 1, img_dir)

            # Missing species
            invalid_entry_2 = {"image_file": "valid_animal.png", "individual_id": "IND-001"}
            with self.assertRaises(ValueError):
                validate_manifest_entry(invalid_entry_2, 2, img_dir)

            # Missing image file on disk
            invalid_entry_3 = {
                "image_file": "missing.png",
                "individual_id": "IND-001",
                "species": "zebra"
            }
            with self.assertRaises(FileNotFoundError):
                validate_manifest_entry(invalid_entry_3, 3, img_dir)

    # 7. Decision thresholds and ranking tiers
    def test_ranking_thresholds_and_tiers(self):
        ref_vec = self._make_unit_vector(401)
        self.gallery.register_image("Plains Zebra", "IND-HIGH", ref_vec)

        # High similarity (> 0.70)
        q_high = ref_vec * 0.95 + self._make_unit_vector(901) * 0.05
        q_high /= np.linalg.norm(q_high)
        res_high = self.gallery.rank("Plains Zebra", q_high)
        self.assertEqual(res_high.match_status, "MATCHED")
        self.assertEqual(res_high.top_candidates[0].match_tier, "HIGH")

        # Moderate similarity (between 0.55 and 0.70)
        # Using exact synthetic vectors with controlled dot product
        ortho_vec = self._make_unit_vector(402)
        ortho_vec = ortho_vec - float(np.dot(ortho_vec, ref_vec)) * ref_vec
        ortho_vec /= np.linalg.norm(ortho_vec)

        # Construct vector with exact dot product 0.62
        q_mod = 0.62 * ref_vec + np.sqrt(1 - 0.62**2) * ortho_vec
        res_mod = self.gallery.rank("Plains Zebra", q_mod)
        self.assertEqual(res_mod.match_status, "UNCERTAIN")
        self.assertEqual(res_mod.top_candidates[0].match_tier, "MODERATE")

        # Low similarity (< 0.55)
        # Construct vector with exact dot product 0.20
        q_low = 0.20 * ref_vec + np.sqrt(1 - 0.20**2) * ortho_vec
        res_low = self.gallery.rank("Plains Zebra", q_low)
        self.assertEqual(res_low.match_status, "UNKNOWN")
        self.assertEqual(res_low.top_candidates[0].match_tier, "LOW")


if __name__ == "__main__":
    unittest.main()
