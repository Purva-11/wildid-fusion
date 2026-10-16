"""
WildID Fusion — Live End-to-End API Inference Verification
Tests all active endpoints in the production environment (.venv).
"""
import json
from pathlib import Path
from fastapi.testclient import TestClient
from miewid_service.api import app, WildlifeDetector

def run_live_verification():
    with TestClient(app) as client:
        test_data = Path(__file__).resolve().parent / "test_data"

    print("===========================================================================")
    print("[TEST 1] Live Health Endpoint (/health)")
    print("===========================================================================")
    res = client.get("/health")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    health_data = res.json()
    print("Status Code: 200 OK")
    print(json.dumps(health_data, indent=2))
    assert health_data["model_loaded"] is True, "MiewID model must be loaded"
    assert health_data["detector_loaded"] is True, "Wildlife detector must be loaded"
    assert health_data["detector_blocker_reason"] is None, "Blocker reason must be None"
    print("  [PASS] Health check verified.")

    print("\n===========================================================================")
    print("[TEST 2] Live Dedicated Detector Endpoint (/api/detector/detect)")
    print("===========================================================================")
    with open(test_data / "demo_zebra.png", "rb") as f:
        res = client.post(
            "/api/detector/detect",
            files={"file": ("demo_zebra.png", f, "image/png")}
        )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    det_data = res.json()
    print(f"Status Code: 200 OK")
    print(f"Total Detections: {det_data['total_detections']}")
    print(f"Animal Detections Count: {len(det_data['animal_detections'])}")
    primary = det_data.get("primary_animal")
    assert primary is not None, "Expected primary animal detection"
    print(f"Primary Animal Category: {primary['category_name']} (ID {primary['category_id']})")
    print(f"Primary Animal Confidence: {primary['confidence']:.4f}")
    print(f"Primary Animal Bounding Box: {primary['box']}")
    print("  [PASS] Dedicated detection endpoint verified.")

    print("\n===========================================================================")
    print("[TEST 3] Live Upstream Detection + Re-ID (/api/reid/identify?detect_animals=true)")
    print("===========================================================================")
    with open(test_data / "zebra_1_b.png", "rb") as f:
        res = client.post(
            "/api/reid/identify",
            data={"species": "Plains Zebra", "detect_animals": "true"},
            files={"file": ("zebra_1_b.png", f, "image/png")}
        )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    reid_data = res.json()
    print("Status Code: 200 OK")
    print(f"Match Status:               {reid_data['match_status']}")
    print(f"Detector Applied:           {reid_data['detector_applied']}")
    print(f"Detector Status:            {reid_data['detector_status']}")
    print(f"Total Animals Detected:     {reid_data['total_animals_detected']}")
    print(f"Primary Detection Box:      {reid_data['primary_detection_box']}")
    top = reid_data["top_candidates"][0]
    print(f"Top Candidate Individual:   {top['individual_id']} - {top['animal_name']}")
    print(f"Top Candidate Score:        {top['similarity_score']:.4f} [{top['match_tier']}]")
    assert reid_data["detector_applied"] is True, "Detector must be applied"
    assert reid_data["detector_status"] == "ANIMAL_DETECTED", "Status must be ANIMAL_DETECTED"
    assert reid_data["match_status"] == "MATCHED", "Match status must be MATCHED"
    print("  [PASS] Upstream detection + Re-ID pipeline verified.")

    print("\n===========================================================================")
    print("[TEST 4] Direct Chip Re-ID Bypass Mode (/api/reid/identify?detect_animals=false)")
    print("===========================================================================")
    with open(test_data / "zebra_1_b.png", "rb") as f:
        res = client.post(
            "/api/reid/identify",
            data={"species": "Plains Zebra", "detect_animals": "false"},
            files={"file": ("zebra_1_b.png", f, "image/png")}
        )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    bypass_data = res.json()
    print("Status Code: 200 OK")
    print(f"Match Status:     {bypass_data['match_status']}")
    print(f"Detector Applied: {bypass_data['detector_applied']}")
    print(f"Detector Status:  {bypass_data['detector_status']}")
    assert bypass_data["detector_applied"] is False
    assert bypass_data["detector_status"] == "BYPASS"
    print("  [PASS] Re-ID bypass mode verified.")

    print("\n===========================================================================")
    print("[TEST 5] HTTP 503 Fail-Safe when Detector Weights are Unavailable")
    print("===========================================================================")
    import miewid_service.api as api_module
    orig_detector = api_module.detector
    api_module.detector = WildlifeDetector(model_path="non_existent_weights.onnx")
    try:
        with open(test_data / "demo_zebra.png", "rb") as f:
            fail_detect = client.post(
                "/api/detector/detect",
                files={"file": ("demo_zebra.png", f, "image/png")}
            )
        assert fail_detect.status_code == 503, f"Expected 503, got {fail_detect.status_code}"
        print(f"Dedicated Detector 503 Response: {fail_detect.json()['detail']}")

        with open(test_data / "demo_zebra.png", "rb") as f:
            fail_reid = client.post(
                "/api/reid/identify",
                data={"species": "Plains Zebra", "detect_animals": "true"},
                files={"file": ("demo_zebra.png", f, "image/png")}
            )
        assert fail_reid.status_code == 503, f"Expected 503, got {fail_reid.status_code}"
        print(f"Re-ID Upstream Detection 503 Response: {fail_reid.json()['detail']}")

        # Ensure direct chip mode still operates cleanly even when detector is down
        with open(test_data / "zebra_1_b.png", "rb") as f:
            ok_chip = client.post(
                "/api/reid/identify",
                data={"species": "Plains Zebra", "detect_animals": "false"},
                files={"file": ("zebra_1_b.png", f, "image/png")}
            )
        assert ok_chip.status_code == 200
        print("Direct chip Re-ID continues to work independently when detector is down.")
        print("  [PASS] HTTP 503 fail-safe verified.")
    finally:
        api_module.detector = orig_detector

    print("\n===========================================================================")
    print(" [COMPLETE] ALL LIVE API INFERENCE TESTS PASSED SUCCESSFULLY!")
    print("===========================================================================")


if __name__ == "__main__":
    run_live_verification()
