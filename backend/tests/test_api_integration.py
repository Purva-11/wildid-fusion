"""
Integration Tests for WildID Fusion FastAPI Service with Persistent Reference Gallery.
"""

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from miewid_service.api import app


class TestAPIWithGallery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_cm = TestClient(app)
        cls.client = cls.client_cm.__enter__()
        cls.test_data_dir = BACKEND_DIR / "test_data"

    @classmethod
    def tearDownClass(cls):
        cls.client_cm.__exit__(None, None, None)

    def test_health_endpoint_reports_registered_gallery(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["model_loaded"])
        self.assertIn("Plains Zebra", data["registered_species"])
        self.assertGreater(data["total_individuals"], 0)
        self.assertGreater(data["total_reference_images"], 0)

    def test_reid_identify_with_alias_returns_matched(self):
        query_img_path = self.test_data_dir / "zebra_1_b.png"
        self.assertTrue(query_img_path.is_file(), f"Missing query image fixture at {query_img_path}")

        with open(query_img_path, "rb") as f:
            res = self.client.post(
                "/api/reid/identify",
                data={"species": "zebra"},  # Alias for Plains Zebra
                files={"file": ("zebra_1_b.png", f, "image/png")}
            )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["species"], "Plains Zebra")
        self.assertEqual(data["match_status"], "MATCHED")
        self.assertGreaterEqual(data["best_score"], 0.70)
        self.assertTrue(len(data["top_candidates"]) > 0)
        self.assertEqual(data["top_candidates"][0]["individual_id"], "IND-ZEB-001")
        self.assertEqual(data["top_candidates"][0]["match_tier"], "HIGH")

    def test_reid_identify_uncatalogued_species_returns_no_data(self):
        query_img_path = self.test_data_dir / "zebra_1_b.png"
        with open(query_img_path, "rb") as f:
            res = self.client.post(
                "/api/reid/identify",
                data={"species": "Asian Elephant"},  # Not in gallery
                files={"file": ("zebra_1_b.png", f, "image/png")}
            )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["match_status"], "NO_DATA")
        self.assertEqual(data["top_candidates"], [])
        self.assertIsNone(data["best_score"])


if __name__ == "__main__":
    unittest.main()
