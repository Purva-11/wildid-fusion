"""
Comprehensive Validation and Reliability Test Suite for WildID Fusion.

Covers Phase 3 objectives:
1. Valid images via API.
2. Corrupted and truncated file payloads (HTTP 400).
3. Unsupported MIME types and non-image files (HTTP 400).
4. Oversized uploads exceeding 15 MiB limit (HTTP 413).
5. Degenerate images: sub-10x10 px and completely uniform/blank canvases (HTTP 400).
6. Parameter constraints: top_k out of [1, 50] range (HTTP 422), empty/whitespace species (HTTP 400).
7. Zero-norm vector handling (no division by zero or NaNs).
8. Numerical stability: strict [-1.0, 1.0] clamping, dimensionality checks, and non-finite value rejection.
"""

from io import BytesIO
import sys
import unittest
from pathlib import Path
import numpy as np
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from miewid_service.api import app, MAX_UPLOAD_BYTES
from miewid_service.config import config
from miewid_service.gallery import ReferenceGallery
from miewid_service.preprocessor import MiewIDPreprocessor, ImagePreprocessingError


class TestValidationAndReliability(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_cm = TestClient(app)
        cls.client = cls.client_cm.__enter__()
        cls.test_data_dir = BACKEND_DIR / "test_data"
        cls.preprocessor = MiewIDPreprocessor()

    @classmethod
    def tearDownClass(cls):
        cls.client_cm.__exit__(None, None, None)

    def _create_synthetic_png(self, width: int, height: int, color_variance: bool = True) -> bytes:
        if color_variance:
            arr = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
            img = Image.fromarray(arr, mode="RGB")
        else:
            # Completely uniform solid image
            img = Image.new("RGB", (width, height), color=(128, 128, 128))
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    # 1. Valid Images
    def test_valid_image_returns_200(self):
        valid_img_path = self.test_data_dir / "zebra_1_b.png"
        with open(valid_img_path, "rb") as f:
            res = self.client.post(
                "/api/reid/identify",
                data={"species": "zebra", "top_k": 3},
                files={"file": ("zebra_1_b.png", f, "image/png")}
            )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["species"], "Plains Zebra")
        self.assertIn(data["match_status"], ["MATCHED", "UNCERTAIN", "UNKNOWN"])
        self.assertTrue(len(data["top_candidates"]) > 0)

    # 2. Corrupted and Truncated Files
    def test_corrupted_image_returns_400(self):
        corrupt_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"random_corrupted_payload_ending_prematurely"
        res = self.client.post(
            "/api/reid/identify",
            data={"species": "zebra"},
            files={"file": ("corrupt.png", corrupt_bytes, "image/png")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid or corrupted image payload", res.json()["detail"])

    # 3. Unsupported MIME Types
    def test_unsupported_mime_type_returns_400(self):
        pdf_payload = b"%PDF-1.4 header text not an image"
        res = self.client.post(
            "/api/reid/identify",
            data={"species": "zebra"},
            files={"file": ("document.pdf", pdf_payload, "application/pdf")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported file MIME type", res.json()["detail"])

    def test_mismatched_image_extension_with_invalid_content_returns_400(self):
        # Declares image/png but payload is plaintext
        fake_png = b"This is plain ASCII text posing as a PNG file."
        res = self.client.post(
            "/api/reid/identify",
            data={"species": "zebra"},
            files={"file": ("fake.png", fake_png, "image/png")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid or corrupted image payload", res.json()["detail"])

    # 4. Oversized Uploads (> 15 MiB)
    def test_oversized_upload_returns_413(self):
        # 15 MiB + 1024 bytes
        oversized_data = b"0" * (MAX_UPLOAD_BYTES + 1024)
        res = self.client.post(
            "/api/reid/identify",
            data={"species": "zebra"},
            files={"file": ("large.png", oversized_data, "image/png")}
        )
        self.assertEqual(res.status_code, 413)
        self.assertIn("exceeds maximum allowed limit of 15 MiB", res.json()["detail"])

    # 5. Degenerate Images: Sub-10x10 px and Uniform Images
    def test_tiny_image_below_10x10_rejected(self):
        tiny_png = self._create_synthetic_png(width=8, height=8, color_variance=True)
        res = self.client.post(
            "/api/reid/identify",
            data={"species": "zebra"},
            files={"file": ("tiny.png", tiny_png, "image/png")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Minimum required dimensions are 10x10", res.json()["detail"])

    def test_uniform_solid_image_rejected(self):
        uniform_png = self._create_synthetic_png(width=64, height=64, color_variance=False)
        res = self.client.post(
            "/api/reid/identify",
            data={"species": "zebra"},
            files={"file": ("uniform.png", uniform_png, "image/png")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Image is degenerate/uniform", res.json()["detail"])

    # 6. Parameter Constraints
    def test_empty_or_whitespace_species_rejected(self):
        valid_img = self._create_synthetic_png(width=64, height=64, color_variance=True)

        # Empty string
        res1 = self.client.post(
            "/api/reid/identify",
            data={"species": ""},
            files={"file": ("chip.png", valid_img, "image/png")}
        )
        self.assertIn(res1.status_code, [400, 422])

        # Whitespace string
        res2 = self.client.post(
            "/api/reid/identify",
            data={"species": "    \t \n"},
            files={"file": ("chip.png", valid_img, "image/png")}
        )
        self.assertIn(res2.status_code, [400, 422])


    def test_invalid_top_k_parameters_rejected(self):
        valid_img = self._create_synthetic_png(width=64, height=64, color_variance=True)

        for invalid_k in [0, -3, 51, 100]:
            res = self.client.post(
                "/api/reid/identify",
                data={"species": "zebra", "top_k": invalid_k},
                files={"file": ("chip.png", valid_img, "image/png")}
            )
            self.assertEqual(res.status_code, 422, f"Expected 422 for top_k={invalid_k}")
            self.assertIn("Parameter 'top_k' must be between 1 and 50", res.json()["detail"])

    # 7. Zero-Norm Vectors
    def test_zero_norm_vector_handling_in_gallery(self):
        gallery = ReferenceGallery()
        zero_vec = np.zeros(config.embedding_dim, dtype=np.float32)

        # Registering zero-norm vector must not crash or produce NaNs
        gallery.register_image(
            species="Plains Zebra",
            individual_id="IND-ZERO",
            embedding=zero_vec,
            image_id="zero_chip"
        )
        self.assertEqual(gallery.get_species_count("Plains Zebra"), 1)

        # Querying with zero-norm vector
        res = gallery.rank("Plains Zebra", zero_vec)
        self.assertEqual(res.match_status, "UNKNOWN")
        self.assertEqual(res.top_candidates[0].similarity_score, 0.0)
        self.assertFalse(np.isnan(res.top_candidates[0].similarity_score))

    # 8. Numerical Stability and Validation
    def test_embedding_dimensions_and_finite_validation(self):
        gallery = ReferenceGallery()

        # Dimension mismatch
        wrong_dim_vec = np.ones(512, dtype=np.float32)
        with self.assertRaises(ValueError):
            gallery.register_image("Plains Zebra", "IND-ERR", wrong_dim_vec)

        # Non-finite values (NaN / Inf)
        nan_vec = np.ones(config.embedding_dim, dtype=np.float32)
        nan_vec[0] = np.nan
        with self.assertRaises(ValueError):
            gallery.register_image("Plains Zebra", "IND-ERR", nan_vec)

        inf_vec = np.ones(config.embedding_dim, dtype=np.float32)
        inf_vec[0] = np.inf
        with self.assertRaises(ValueError):
            gallery.register_image("Plains Zebra", "IND-ERR", inf_vec)

    def test_similarity_clamping_to_unit_range(self):
        gallery = ReferenceGallery()
        unit_vec = np.random.randn(config.embedding_dim).astype(np.float32)
        unit_vec /= np.linalg.norm(unit_vec)

        gallery.register_image("Plains Zebra", "IND-CLAMP", unit_vec)

        # Identical vector query (guarantee clamping <= 1.0)
        res = gallery.rank("Plains Zebra", unit_vec)
        self.assertLessEqual(res.top_candidates[0].similarity_score, 1.0)
        self.assertGreaterEqual(res.top_candidates[0].similarity_score, -1.0)

        # Inverted vector query (guarantee clamping >= -1.0)
        res_inv = gallery.rank("Plains Zebra", -unit_vec)
        self.assertLessEqual(res_inv.top_candidates[0].similarity_score, 1.0)
        self.assertGreaterEqual(res_inv.top_candidates[0].similarity_score, -1.0)


if __name__ == "__main__":
    unittest.main()
