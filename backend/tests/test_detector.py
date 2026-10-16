"""
Deterministic Unit and Integration Tests for Wildlife Detector and Geometry Pipeline.

Covers:
1. Normalized bounding-box geometry and validation.
2. Padding, scaling, and boundary clamping.
3. Cropping behavior on PIL images.
4. IoU computation and Non-Maximum Suppression (NMS).
5. Confidence threshold filtering (< 0.30 discarded).
6. Zero detection and no-animal detection handling.
7. Multi-animal detection handling (highest-confidence primary, full list preserved).
8. Missing model weights explicit rejection (DetectorModelError / HTTP 503).
9. Letterbox preprocessing for wide, tall, and square images.
10. Unletterbox coordinate inversion reversibility.
11. Output parsing contracts:
    - Contract 1: 'decoded_boxes' (1, N, 6)
    - Contract 2: 'yolov5_raw' (1, N, 5 + num_classes) with objectness * class_prob
    - Contract 3: 'yolov8_raw' (1, 4 + num_classes, N) channel-first
12. Unsupported format and shape mismatch error rejections (DetectorModelError).
13. Non-finite tensor (NaN/Inf) rejection.
14. API endpoints with and without detector weights.
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
from miewid_service.api import app
from miewid_service.detector import (
    BoundingBoxNormalized,
    DetectionResult,
    DetectionBatchResult,
    WildlifeDetector,
    DetectorModelError,
    validate_and_normalize_box,
    apply_padding_and_scale_box,
    crop_detection,
    compute_iou,
    apply_nms,
    letterbox_image,
    unletterbox_box
)


class TestWildlifeDetectorGeometryAndPipeline(unittest.TestCase):
    def setUp(self):
        self.detector = WildlifeDetector(
            model_path="non_existent_detector_weights.onnx",
            confidence_threshold=0.30,
            nms_threshold=0.45,
            crop_padding=0.08,
            output_format="yolov5_raw"
        )

    # 1. Bounding Box Geometry & Validation
    def test_bounding_box_validation(self):
        # Valid box
        box = validate_and_normalize_box([0.1, 0.2, 0.8, 0.9])
        self.assertEqual(box.to_list(), [0.1, 0.2, 0.8, 0.9])

        # Inverted vertical coordinates
        with self.assertRaises(ValueError):
            validate_and_normalize_box([0.8, 0.2, 0.1, 0.9])

        # Inverted horizontal coordinates
        with self.assertRaises(ValueError):
            validate_and_normalize_box([0.1, 0.9, 0.8, 0.2])

        # Invalid number of coordinates
        with self.assertRaises(ValueError):
            validate_and_normalize_box([0.1, 0.2, 0.3])

        # Degenerate zero-area box
        with self.assertRaises(ValueError):
            validate_and_normalize_box([0.5, 0.5, 0.5, 0.5])

    # 2. Padding, Scaling, and Clamping
    def test_padding_and_boundary_clamping(self):
        # Center box on 1000x1000 canvas
        box = BoundingBoxNormalized(ymin=0.2, xmin=0.2, ymax=0.6, xmax=0.6)
        x1, y1, x2, y2 = apply_padding_and_scale_box(box, padding=0.08, image_width=1000, image_height=1000)

        # Original width=400, height=400, pad=32px each side -> 168 to 632
        self.assertEqual((x1, y1, x2, y2), (168, 168, 632, 632))

        # Corner box near edge [0.0, 0.0, 0.1, 0.1]
        edge_box = BoundingBoxNormalized(ymin=0.0, xmin=0.0, ymax=0.1, xmax=0.1)
        ex1, ey1, ex2, ey2 = apply_padding_and_scale_box(edge_box, padding=0.10, image_width=500, image_height=500)

        # Must be clamped strictly at 0 without negative pixels
        self.assertEqual(ex1, 0)
        self.assertEqual(ey1, 0)
        self.assertGreater(ex2, ex1)
        self.assertGreater(ey2, ey1)
        self.assertLessEqual(ex2, 500)
        self.assertLessEqual(ey2, 500)

    # 3. Image Cropping
    def test_crop_detection_execution(self):
        img = Image.new("RGB", (200, 200), color="blue")
        box = BoundingBoxNormalized(ymin=0.25, xmin=0.25, ymax=0.75, xmax=0.75)
        chip = crop_detection(img, box, padding=0.0)
        self.assertEqual(chip.size, (100, 100))
        self.assertEqual(chip.mode, "RGB")

    # 4. IoU and Non-Maximum Suppression
    def test_iou_and_nms(self):
        b1 = BoundingBoxNormalized(ymin=0.1, xmin=0.1, ymax=0.5, xmax=0.5)
        b2 = BoundingBoxNormalized(ymin=0.1, xmin=0.1, ymax=0.5, xmax=0.5)  # Identical
        b3 = BoundingBoxNormalized(ymin=0.6, xmin=0.6, ymax=0.9, xmax=0.9)  # Disjoint

        self.assertAlmostEqual(compute_iou(b1, b2), 1.0)
        self.assertEqual(compute_iou(b1, b3), 0.0)

        # Overlapping same category
        det_high = DetectionResult(box=b1, category_id=1, category_name="animal", confidence=0.92)
        det_low = DetectionResult(box=b2, category_id=1, category_name="animal", confidence=0.70)
        # Separate disjoint animal
        det_disjoint = DetectionResult(box=b3, category_id=1, category_name="animal", confidence=0.85)

        suppressed = apply_nms([det_low, det_high, det_disjoint], iou_threshold=0.45)
        self.assertEqual(len(suppressed), 2)
        self.assertIn(det_high, suppressed)
        self.assertIn(det_disjoint, suppressed)
        self.assertNotIn(det_low, suppressed)

    # 5. Confidence Threshold Filtering
    def test_confidence_threshold_filtering(self):
        box = BoundingBoxNormalized(ymin=0.1, xmin=0.1, ymax=0.5, xmax=0.5)
        raw = [
            DetectionResult(box=box, category_id=1, category_name="animal", confidence=0.45),
            DetectionResult(box=box, category_id=1, category_name="animal", confidence=0.25),  # Below 0.30
            DetectionResult(box=box, category_id=1, category_name="animal", confidence=0.10)   # Below 0.30
        ]
        batch = self.detector.process_detections(raw)
        self.assertEqual(batch.status, "SUCCESS")
        self.assertEqual(len(batch.animal_detections), 1)
        self.assertEqual(batch.animal_detections[0].confidence, 0.45)

    # 6. Empty and No-Animal Detections
    def test_empty_and_no_animal_detections(self):
        # Empty input
        batch_empty = self.detector.process_detections([])
        self.assertEqual(batch_empty.status, "NO_ANIMALS")
        self.assertEqual(batch_empty.total_detections, 0)
        self.assertIsNone(batch_empty.primary_animal)

        # Vehicle only (non-animal)
        box = BoundingBoxNormalized(ymin=0.1, xmin=0.1, ymax=0.5, xmax=0.5)
        vehicle_det = DetectionResult(box=box, category_id=3, category_name="vehicle", confidence=0.88)
        batch_vehicle = self.detector.process_detections([vehicle_det])
        self.assertEqual(batch_vehicle.status, "NO_ANIMALS")
        self.assertEqual(len(batch_vehicle.animal_detections), 0)
        self.assertEqual(len(batch_vehicle.non_animal_detections), 1)
        self.assertIsNone(batch_vehicle.primary_animal)

    # 7. Multiple Animals Selects Highest Confidence
    def test_multiple_animal_detections(self):
        box1 = BoundingBoxNormalized(ymin=0.1, xmin=0.1, ymax=0.4, xmax=0.4)
        box2 = BoundingBoxNormalized(ymin=0.5, xmin=0.5, ymax=0.8, xmax=0.8)

        det_a = DetectionResult(box=box1, category_id=1, category_name="animal", confidence=0.62)
        det_b = DetectionResult(box=box2, category_id=1, category_name="animal", confidence=0.91)

        batch = self.detector.process_detections([det_a, det_b])
        self.assertEqual(batch.status, "SUCCESS")
        self.assertEqual(len(batch.animal_detections), 2)
        # Primary is det_b (highest confidence)
        self.assertEqual(batch.primary_animal.confidence, 0.91)
        # Both animals are preserved in the list
        confidences = [d.confidence for d in batch.animal_detections]
        self.assertEqual(confidences, [0.91, 0.62])

    # 8. Missing Weights Explicit Handling
    def test_missing_weights_raises_detector_model_error(self):
        self.assertFalse(self.detector.is_loaded)
        self.assertIn("Detector model weights not found", self.detector.blocker_reason)

        dummy_img = Image.new("RGB", (64, 64), color="green")
        with self.assertRaises(DetectorModelError):
            self.detector.detect(dummy_img)


class TestLetterboxAndBoxInversion(unittest.TestCase):
    def test_letterbox_wide_image(self):
        img = Image.new("RGB", (1920, 1080), color="red")
        letterboxed, scale, pad_offset = letterbox_image(img, target_size=(640, 640))
        self.assertEqual(letterboxed.size, (640, 640))
        self.assertAlmostEqual(scale, 640 / 1920, places=4)
        # Pad should be vertical: pad_left = 0, pad_top = (640 - 360) / 2 = 140
        self.assertEqual(pad_offset, (0, 140))
        # Top-left padding pixel should be fill color (114, 114, 114)
        self.assertEqual(letterboxed.getpixel((0, 0)), (114, 114, 114))
        # Center pixel should be image color (255, 0, 0)
        self.assertEqual(letterboxed.getpixel((320, 320)), (255, 0, 0))

    def test_letterbox_tall_image(self):
        img = Image.new("RGB", (1080, 1920), color="green")
        letterboxed, scale, pad_offset = letterbox_image(img, target_size=(640, 640))
        self.assertEqual(letterboxed.size, (640, 640))
        self.assertAlmostEqual(scale, 640 / 1920, places=4)
        # Pad should be horizontal: pad_left = (640 - 360) / 2 = 140, pad_top = 0
        self.assertEqual(pad_offset, (140, 0))
        # Corner padding pixel should be fill color (114, 114, 114)
        self.assertEqual(letterboxed.getpixel((0, 0)), (114, 114, 114))
        # Center pixel should be image color (0, 128, 0)
        self.assertEqual(letterboxed.getpixel((320, 320)), (0, 128, 0))

    def test_letterbox_square_image(self):
        img = Image.new("RGB", (1000, 1000), color="blue")
        letterboxed, scale, pad_offset = letterbox_image(img, target_size=(640, 640))
        self.assertEqual(letterboxed.size, (640, 640))
        self.assertAlmostEqual(scale, 0.64, places=4)
        self.assertEqual(pad_offset, (0, 0))

    def test_unletterbox_box_reversibility_wide(self):
        orig_w, orig_h = 1920, 1080
        target_w, target_h = 640, 640
        scale = min(target_w / orig_w, target_h / orig_h)  # 640 / 1920 = 1/3
        pad_offset = (0, 140)

        # Ground truth normalized box in original image: [ymin, xmin, ymax, xmax]
        orig_ymin, orig_xmin, orig_ymax, orig_xmax = 0.25, 0.10, 0.75, 0.90

        # Map to model pixel space
        orig_px_x1 = orig_xmin * orig_w
        orig_px_y1 = orig_ymin * orig_h
        orig_px_x2 = orig_xmax * orig_w
        orig_px_y2 = orig_ymax * orig_h

        model_x1 = orig_px_x1 * scale + pad_offset[0]
        model_y1 = orig_px_y1 * scale + pad_offset[1]
        model_x2 = orig_px_x2 * scale + pad_offset[0]
        model_y2 = orig_px_y2 * scale + pad_offset[1]

        reconstructed = unletterbox_box(
            box_coords=[model_x1, model_y1, model_x2, model_y2],
            scale=scale,
            pad_offset=pad_offset,
            orig_size=(orig_w, orig_h),
            target_size=(target_w, target_h)
        )
        self.assertIsNotNone(reconstructed)
        self.assertAlmostEqual(reconstructed.ymin, orig_ymin, delta=1e-3)
        self.assertAlmostEqual(reconstructed.xmin, orig_xmin, delta=1e-3)
        self.assertAlmostEqual(reconstructed.ymax, orig_ymax, delta=1e-3)
        self.assertAlmostEqual(reconstructed.xmax, orig_xmax, delta=1e-3)

    def test_unletterbox_box_reversibility_tall(self):
        orig_w, orig_h = 1080, 1920
        target_w, target_h = 640, 640
        scale = min(target_w / orig_w, target_h / orig_h)
        pad_offset = (140, 0)

        orig_ymin, orig_xmin, orig_ymax, orig_xmax = 0.15, 0.20, 0.85, 0.80

        model_x1 = (orig_xmin * orig_w) * scale + pad_offset[0]
        model_y1 = (orig_ymin * orig_h) * scale + pad_offset[1]
        model_x2 = (orig_xmax * orig_w) * scale + pad_offset[0]
        model_y2 = (orig_ymax * orig_h) * scale + pad_offset[1]

        reconstructed = unletterbox_box(
            box_coords=[model_x1, model_y1, model_x2, model_y2],
            scale=scale,
            pad_offset=pad_offset,
            orig_size=(orig_w, orig_h),
            target_size=(target_w, target_h)
        )
        self.assertIsNotNone(reconstructed)
        self.assertAlmostEqual(reconstructed.ymin, orig_ymin, delta=1e-3)
        self.assertAlmostEqual(reconstructed.xmin, orig_xmin, delta=1e-3)
        self.assertAlmostEqual(reconstructed.ymax, orig_ymax, delta=1e-3)
        self.assertAlmostEqual(reconstructed.xmax, orig_xmax, delta=1e-3)


class TestDetectorOutputContracts(unittest.TestCase):
    """
    Tests parsing logic for the 3 explicit output formats using synthetic fixtures.
    Synthetic fixtures represent array layouts only; not claimed as real model predictions.
    """

    # 1. Contract 1: 'decoded_boxes'
    def test_parse_decoded_boxes_contract(self):
        detector = WildlifeDetector(
            model_path="dummy.onnx",
            confidence_threshold=0.30,
            output_format="decoded_boxes"
        )
        # Synthetic tensor shape: (1, 4, 6) -> [x1, y1, x2, y2, confidence, category_id]
        # In decoded_boxes, category IDs are NOT offset by 1
        synthetic_out = np.array([[
            [64.0, 64.0, 256.0, 256.0, 0.88, 1.0],  # Animal (cat 1)
            [100.0, 100.0, 200.0, 200.0, 0.75, 2.0],  # Person (cat 2)
            [300.0, 300.0, 500.0, 500.0, 0.65, 3.0],  # Vehicle (cat 3)
            [10.0, 10.0, 50.0, 50.0, 0.15, 1.0],     # Filtered by confidence < 0.30
        ]], dtype=np.float32)

        results = detector._parse_onnx_outputs(
            outputs=[synthetic_out],
            orig_size=(640, 640),
            target_size=(640, 640),
            scale=1.0,
            pad_offset=(0, 0)
        )
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0].category_id, 1)
        self.assertEqual(results[0].category_name, "animal")
        self.assertEqual(results[0].confidence, 0.88)

        self.assertEqual(results[1].category_id, 2)
        self.assertEqual(results[1].category_name, "person")
        self.assertEqual(results[1].confidence, 0.75)

        self.assertEqual(results[2].category_id, 3)
        self.assertEqual(results[2].category_name, "vehicle")
        self.assertEqual(results[2].confidence, 0.65)

    # 2. Contract 2: 'yolov5_raw'
    def test_parse_yolov5_raw_contract(self):
        detector = WildlifeDetector(
            model_path="dummy.onnx",
            confidence_threshold=0.30,
            output_format="yolov5_raw"
        )
        # Synthetic tensor shape: (1, 3, 8) -> [xc, yc, w, h, obj_conf, p_class0, p_class1, p_class2]
        # class0=animal, class1=person, class2=vehicle
        # category_id = class_idx + 1
        synthetic_out = np.array([[
            # Anchor 0: xc=320, yc=320, w=160, h=160, obj=0.90, p_animal=0.95 -> score = 0.855, cat=1
            [320.0, 320.0, 160.0, 160.0, 0.90, 0.95, 0.05, 0.0],
            # Anchor 1: xc=100, yc=100, w=50, h=50, obj=0.80, p_person=0.90 -> score = 0.72, cat=2
            [100.0, 100.0, 50.0, 50.0, 0.80, 0.05, 0.90, 0.05],
            # Anchor 2: obj=0.20, max_prob=0.50 -> score = 0.10 < 0.30 -> filtered
            [50.0, 50.0, 20.0, 20.0, 0.20, 0.50, 0.30, 0.20],
        ]], dtype=np.float32)

        results = detector._parse_onnx_outputs(
            outputs=[synthetic_out],
            orig_size=(640, 640),
            target_size=(640, 640),
            scale=1.0,
            pad_offset=(0, 0)
        )
        self.assertEqual(len(results), 2)
        # Check winning class and category ID
        self.assertEqual(results[0].category_id, 1)
        self.assertEqual(results[0].category_name, "animal")
        self.assertEqual(results[0].confidence, 0.855)
        # Check corner conversion: xc=320, w=160 -> x1=240/640=0.375, x2=400/640=0.625
        self.assertAlmostEqual(results[0].box.xmin, 0.375, places=3)
        self.assertAlmostEqual(results[0].box.xmax, 0.625, places=3)

        self.assertEqual(results[1].category_id, 2)
        self.assertEqual(results[1].category_name, "person")
        self.assertEqual(results[1].confidence, 0.72)

    # 3. Contract 3: 'yolov8_raw'
    def test_parse_yolov8_raw_contract(self):
        detector = WildlifeDetector(
            model_path="dummy.onnx",
            confidence_threshold=0.30,
            output_format="yolov8_raw"
        )
        # Synthetic tensor shape: (1, 7, 3) -> [channel, num_anchors]
        # Row 0: xc, Row 1: yc, Row 2: w, Row 3: h
        # Row 4: p_animal, Row 5: p_person, Row 6: p_vehicle
        synthetic_out = np.zeros((1, 7, 3), dtype=np.float32)

        # Anchor 0: animal
        synthetic_out[0, 0, 0] = 320.0  # xc
        synthetic_out[0, 1, 0] = 320.0  # yc
        synthetic_out[0, 2, 0] = 200.0  # w
        synthetic_out[0, 3, 0] = 200.0  # h
        synthetic_out[0, 4, 0] = 0.84   # p_animal

        # Anchor 1: vehicle
        synthetic_out[0, 0, 1] = 450.0  # xc
        synthetic_out[0, 1, 1] = 450.0  # yc
        synthetic_out[0, 2, 1] = 100.0  # w
        synthetic_out[0, 3, 1] = 100.0  # h
        synthetic_out[0, 6, 1] = 0.76   # p_vehicle

        # Anchor 2: low confidence
        synthetic_out[0, 4, 2] = 0.15

        results = detector._parse_onnx_outputs(
            outputs=[synthetic_out],
            orig_size=(640, 640),
            target_size=(640, 640),
            scale=1.0,
            pad_offset=(0, 0)
        )
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].category_id, 1)
        self.assertEqual(results[0].category_name, "animal")
        self.assertEqual(results[0].confidence, 0.84)
        # Corner conversion: xc=320, w=200 -> x1=220/640=0.34375, x2=420/640=0.65625
        self.assertAlmostEqual(results[0].box.xmin, 0.3438, places=3)
        self.assertAlmostEqual(results[0].box.xmax, 0.6562, places=3)

        self.assertEqual(results[1].category_id, 3)
        self.assertEqual(results[1].category_name, "vehicle")
        self.assertEqual(results[1].confidence, 0.76)

    # 4. Unsupported Format & Shape Rejections
    def test_unsupported_format_raises_detector_model_error(self):
        with self.assertRaises(DetectorModelError):
            WildlifeDetector(model_path="dummy.onnx", output_format="unsupported_custom_format")

    def test_tensor_shape_mismatches_raise_detector_model_error(self):
        detector_v5 = WildlifeDetector(model_path="dummy.onnx", output_format="yolov5_raw")
        with self.assertRaises(DetectorModelError):
            detector_v5._parse_onnx_outputs([np.zeros((1, 10, 4), dtype=np.float32)])

        detector_v8 = WildlifeDetector(model_path="dummy.onnx", output_format="yolov8_raw")
        with self.assertRaises(DetectorModelError):
            detector_v8._parse_onnx_outputs([np.zeros((1, 3, 10), dtype=np.float32)])

        detector_dec = WildlifeDetector(model_path="dummy.onnx", output_format="decoded_boxes")
        with self.assertRaises(DetectorModelError):
            detector_dec._parse_onnx_outputs([np.zeros((1, 10, 5), dtype=np.float32)])

    def test_nan_or_inf_in_outputs_raises_detector_model_error(self):
        detector = WildlifeDetector(model_path="dummy.onnx", output_format="yolov5_raw")
        nan_array = np.zeros((1, 5, 8), dtype=np.float32)
        nan_array[0, 0, 0] = np.nan
        with self.assertRaises(DetectorModelError):
            detector._parse_onnx_outputs([nan_array])

    def test_degenerate_box_in_padding_is_safely_ignored(self):
        detector = WildlifeDetector(model_path="dummy.onnx", output_format="decoded_boxes")
        # A box located in the top padding region (outside the active image canvas)
        synthetic_out = np.array([[
            [10.0, 10.0, 50.0, 20.0, 0.95, 1.0],  # y1=10, y2=20, but pad_top=140
        ]], dtype=np.float32)

        results = detector._parse_onnx_outputs(
            outputs=[synthetic_out],
            orig_size=(1920, 1080),
            target_size=(640, 640),
            scale=640 / 1920,
            pad_offset=(0, 140)
        )
        # Degenerate/clamped zero-area box should be safely discarded, not crash
        self.assertEqual(len(results), 0)


class TestDetectorAPIEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_cm = TestClient(app)
        cls.client = cls.client_cm.__enter__()
        cls.test_data_dir = BACKEND_DIR / "test_data"

    @classmethod
    def tearDownClass(cls):
        cls.client_cm.__exit__(None, None, None)

    def test_health_reports_detector_availability(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("detector_loaded", data)
        self.assertIn("detector_blocker_reason", data)
        self.assertTrue(data["detector_loaded"])
        self.assertIsNone(data["detector_blocker_reason"])

    def test_dedicated_detector_endpoint_with_installed_weights(self):
        valid_img_path = self.test_data_dir / "demo_zebra.png"
        with open(valid_img_path, "rb") as f:
            res = self.client.post(
                "/api/detector/detect",
                files={"file": ("demo_zebra.png", f, "image/png")}
            )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "SUCCESS")
        self.assertGreater(data["total_detections"], 0)
        self.assertIsNotNone(data["primary_animal"])

    def test_reid_with_detect_animals_installed_weights(self):
        valid_img_path = self.test_data_dir / "zebra_1_b.png"
        with open(valid_img_path, "rb") as f:
            res = self.client.post(
                "/api/reid/identify",
                data={"species": "zebra", "detect_animals": "true"},
                files={"file": ("zebra_1_b.png", f, "image/png")}
            )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["match_status"], "MATCHED")
        self.assertTrue(data["detector_applied"])
        self.assertEqual(data["detector_status"], "ANIMAL_DETECTED")

    def test_reid_with_detect_animals_missing_weights_returns_503(self):
        # Temporarily mock detector as unavailable to verify HTTP 503 fail-safe
        import miewid_service.api as api_module
        orig_detector = api_module.detector
        api_module.detector = WildlifeDetector(model_path="non_existent_weights.onnx")
        try:
            valid_img_path = self.test_data_dir / "zebra_1_b.png"
            with open(valid_img_path, "rb") as f:
                res = self.client.post(
                    "/api/reid/identify",
                    data={"species": "zebra", "detect_animals": "true"},
                    files={"file": ("zebra_1_b.png", f, "image/png")}
                )
            self.assertEqual(res.status_code, 503)
            self.assertIn("Animal detection service is unavailable", res.json()["detail"])
        finally:
            api_module.detector = orig_detector

    def test_dedicated_detector_endpoint_missing_weights_returns_503(self):
        # Dedicated /api/detector/detect returns 503 when weights are unavailable
        import miewid_service.api as api_module
        orig_detector = api_module.detector
        api_module.detector = WildlifeDetector(model_path="non_existent_weights.onnx")
        try:
            valid_img_path = self.test_data_dir / "zebra_1_b.png"
            with open(valid_img_path, "rb") as f:
                res = self.client.post(
                    "/api/detector/detect",
                    files={"file": ("zebra_1_b.png", f, "image/png")}
                )
            self.assertEqual(res.status_code, 503)
            self.assertIn("Wildlife detector is unavailable", res.json()["detail"])
        finally:
            api_module.detector = orig_detector

    def test_reid_direct_chip_mode_preserves_reid(self):
        # Default detect_animals=False operates direct chip Re-ID with full success
        valid_img_path = self.test_data_dir / "zebra_1_b.png"
        with open(valid_img_path, "rb") as f:
            res = self.client.post(
                "/api/reid/identify",
                data={"species": "zebra"},
                files={"file": ("zebra_1_b.png", f, "image/png")}
            )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["match_status"], "MATCHED")
        self.assertEqual(data["detector_applied"], False)
        self.assertEqual(data["detector_status"], "BYPASS")


if __name__ == "__main__":
    unittest.main()
