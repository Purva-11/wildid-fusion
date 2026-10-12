# MiewID Re-Identification Integration Guide

This document details the evaluation, local ONNX deployment, inference pipeline, and API integration contract for **MiewID** in the **WildID Fusion** project.

---

## 1. Model Evaluation & Licensing Report

### Target Evaluation: `james-burgess/miewid-onnx`
- **Host Platform:** Hugging Face Space (`james-burgess/miewid-onnx`)
- **License:** **MIT License** (Permissive open research and conservation use).
- **Core Architecture:** EfficientNetV2-M backbone trained with ArcFace metric learning.
- **Input Specifications:** $(1, 3, 440, 440)$ float32 RGB tensor.
- **Embedding Output:** $2152$-dimensional dense float32 vector, post-processed with L2 unit normalization.

### Dependency & Upstream Asset Findings
1. **Upstream Blocker in HF Space:** The Hugging Face Space `james-burgess/miewid-onnx` expects a file `miewid.onnx` that was never pushed into the space's public repository tree, resulting in an upstream `HTTP 404 Not Found`. Furthermore, the author's underlying model repository `james-burgess/miewid` is private (`HTTP 401 Unauthorized`).
2. **Authoritative Open Upstream:** The model was originally trained and released by **Conservation X Labs** under [`conservationxlabs/miewid-msv3`](https://huggingface.co/conservationxlabs/miewid-msv3) (the canonical multi-species individual identification model evaluated on 64 wildlife species including zebras, cheetahs, leopards, and tigers).
3. **Local ONNX Export & Verification:** The official weights (`model.safetensors`, 196.2 MB) were loaded with the exact architecture and compiled into `models/miewid.onnx` ($203.9\text{ MB}$, Opset 18) for native execution via **ONNX Runtime** (`CPUExecutionProvider`).

---

## 2. Documented Preprocessing Pipeline

Implemented in [`backend/miewid_service/preprocessor.py`](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/preprocessor.py):

```python
chip = image.convert("RGB")
chip = chip.resize((440, 440), Image.Resampling.BILINEAR)
arr = np.array(chip, dtype=np.float32)
arr = (arr - MEAN_255) / STD_255  # ImageNet mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
arr = np.transpose(arr, (2, 0, 1))
tensor = np.expand_dims(arr, axis=0)  # Shape: (1, 3, 440, 440)
```

---

## 3. Metric Learning & Similarity Semantics

### Critical Rule: Similarity is NOT Probability
Cosine similarity measures angular alignment in metric space:
$$\text{sim}(\mathbf{q}, \mathbf{r}) = \frac{\mathbf{q} \cdot \mathbf{r}}{\|\mathbf{q}\| \|\mathbf{r}\|} \in [-1.0, 1.0]$$
Cosine similarity does **not** represent a calibrated Bayesian probability. It indicates geometric proximity in feature space.

### Decision Thresholds
- **High Threshold ($\ge 0.70$):** `MATCHED` — strong individual feature alignment (same individual).
- **Moderate Threshold ($0.55 \le \text{score} < 0.70$):** `UNCERTAIN` — potential match requiring expert ranger/researcher verification.
- **Below Moderate ($< 0.55$):** `UNKNOWN` — uncatalogued individual, candidate for new registry entry.

### Species Separation
Individual re-identification (Re-ID) is partitioned by species. A query against `"Plains Zebra"` only searches within the zebra partition, preventing cross-species false positives.

---

## 4. Reproducible Test Results

Ran via [`backend/test_reproducible_reid.py`](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/test_reproducible_reid.py):

```text
[STEP 1] Model Session: Loaded from models/miewid.onnx (2152 dims)
[STEP 2] Preprocessing: Tensor shape (1, 3, 440, 440), float32, normalized.
[STEP 3] Gallery Setup: Registered Plains Zebra (3 individuals), Cheetah (1 individual).
[STEP 4] Test Case A (Ground Truth Same Individual: zebra_1_a vs zebra_1_b):
         Top Candidate: IND-ZEB-001 (Kip)
         Cosine Similarity: 0.7182 [HIGH Tier] -> Status: MATCHED
         Candidate #2:      0.4358 [LOW Tier]
[STEP 5] Test Case B (Unseen / Distinct Individual):
         Best Similarity:   0.0165 [LOW Tier] -> Status: UNKNOWN
[STEP 6] Test Case C (Species Partition Isolation):
         Query uncatalogued species: Status NO_DATA (No cross-species leakage)
Result: ALL VERIFICATION TESTS PASSED
```

---

## 5. API Integration Contract

### Endpoint 1: Dedicated Modular Re-ID
- **URL:** `POST /api/reid/identify`
- **Request (Multipart Form):**
  - `species`: String (e.g. `"Plains Zebra"`)
  - `file`: Image file (cropped chip)
  - `top_k`: Integer (default: 3)
- **Response JSON:**
```json
{
  "species": "Plains Zebra",
  "match_status": "MATCHED",
  "best_score": 0.7182,
  "top_candidates": [
    {
      "individual_id": "IND-ZEB-001",
      "animal_name": "Kip",
      "similarity_score": 0.7182,
      "match_tier": "HIGH",
      "metadata": {}
    },
    {
      "individual_id": "IND-ZEB-002",
      "animal_name": "Zara",
      "similarity_score": 0.4358,
      "match_tier": "LOW",
      "metadata": {}
    }
  ],
  "thresholds_applied": {
    "high_threshold": 0.7,
    "moderate_threshold": 0.55
  },
  "disclaimer": "Cosine similarity measures metric feature space alignment [-1.0, 1.0] and is NOT a calibrated probability score."
}
```

### Endpoint 2: Frontend Adapter
- **URL:** `POST /api/identify`
- **Request (Multipart Form):**
  - `photo`: Image file
- **Response JSON:** Returns candidates compliant with the existing frontend `IdentifyResponse` and `MatchCandidate` types in [`frontend/src/types/index.ts`](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/frontend/src/types/index.ts).

---

## 6. How to Run

### Start the FastAPI Inference Service
```powershell
cd "d:\Ansh Dekstop\WildHack Prototype\backend"
.\.venv\Scripts\python.exe main.py
```
Or with Uvicorn:
```powershell
.\.venv\Scripts\uvicorn.exe miewid_service.api:app --host 0.0.0.0 --port 8000 --reload
```

### Connect Frontend
In `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:8000
```
Run frontend:
```powershell
cd "d:\Ansh Dekstop\WildHack Prototype\frontend"
npm run dev
```
