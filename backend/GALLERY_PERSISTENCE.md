# Persistent Reference Gallery for WildID Fusion

This document details the design, storage layout, manifest specification, CLI workflows, and future dataset onboarding protocol for the persistent reference gallery in WildID Fusion.

---

## 1. Architecture & Design Principles

The reference gallery subsystem ([backend/miewid_service/gallery.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/gallery.py)) manages the storage, persistence, and cosine-similarity ranking of catalogued animal individuals.

### Key Principles:
1. **Strict Species Partitioning**: Queries are matched exclusively against the candidate pool of the target species. Cross-species matching is disallowed.
2. **Multiple Images Per Individual**: An individual animal may have multiple reference image chips (capturing different angles, lighting, or postures). During ranking:
   $$\text{sim}(\mathbf{q}, \text{individual}) = \max_{j \in \text{images}} (\mathbf{q} \cdot \mathbf{r}_j)$$
   The top candidate list contains **unique individual animal IDs** without duplicate entries.
3. **Safe Taxonomy & Alias Normalization**: Resolves common synonyms (e.g., `"zebra"` $\to$ `"Plains Zebra"`) safely via [backend/miewid_service/taxonomy.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/taxonomy.py). Distinct species (such as Plains Zebra vs. Grevy's Zebra, or Tiger vs. Leopard) are **never** merged.
4. **Persistent On-Disk Storage**: Pre-extracted unit embeddings and metadata are stored on disk and loaded in $O(1)$ time at application startup, avoiding repetitive ONNX inference across server reboots.
5. **Metric Distance, Not Probability**: Cosine similarity is a geometric alignment score in $[-1.0, 1.0]$. It is never presented as a Bayesian probability.
6. **Graceful Degradation**: If no gallery files exist, the API starts without crashing and returns `match_status="NO_DATA"`.

---

## 2. Storage Directory & File Formats

Configured in [backend/miewid_service/config.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/config.py):

| Component | Path | Description |
| :--- | :--- | :--- |
| **Gallery Directory** | `backend/gallery_store/` | Directory holding serialized gallery assets. |
| **Metadata Manifest** | `backend/gallery_store/manifest.json` | JSON catalog of all registered image chips and individual metadata. |
| **Embeddings Archive** | `backend/gallery_store/embeddings.npz` | Compressed NumPy archive containing `embeddings` (2D float32 array, shape $(N, 2152)$) and `image_ids` (1D array). |

> [!NOTE]
> Large generated artifacts (`*.npz`) in `backend/gallery_store/` are excluded from Git via `.gitignore`.

---

## 3. Manifest Specification

An input manifest is a JSON array of image registration objects.

### Example Entry:
```json
[
  {
    "image_id": "zebra_1_a",
    "image_file": "zebra_1_a.png",
    "individual_id": "IND-ZEB-001",
    "species": "Plains Zebra",
    "animal_name": "Kip (Alpha Stallion)",
    "source_metadata": {
      "view": "left_flank",
      "source": "reference_fixture"
    }
  },
  {
    "image_id": "demo_zebra",
    "image_file": "demo_zebra.png",
    "individual_id": "IND-ZEB-001",
    "species": "Plains Zebra",
    "animal_name": "Kip (Alpha Stallion)",
    "source_metadata": {
      "view": "standing_profile",
      "source": "reference_fixture"
    }
  }
]
```

### Field Definitions:
- `image_id` *(string, optional)*: Unique identifier for this specific image chip. If omitted, defaults to the image file's stem.
- `image_file` or `image_path` *(string, required)*: Path to the cropped chip image, relative to `--image-dir` (or absolute).
- `individual_id` *(string, required)*: Unique identifier for the individual animal (e.g. `"IND-ZEB-001"`).
- `species` *(string, required)*: Biological species name or supported alias (e.g. `"Plains Zebra"`, `"zebra"`).
- `animal_name` *(string, optional)*: Vernacular or reserve name (e.g. `"Kip"`). Defaults to `individual_id` if omitted.
- `source_metadata` *(object, optional)*: Contextual metadata (viewpoint, angle, camera ID, split). **Never include sensitive GPS coordinates.**

---

## 4. Building the Gallery (CLI Workflows)

The reproducible script [backend/build_gallery.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/build_gallery.py) parses the manifest, validates inputs, generates 2152-dimensional unit embeddings using MiewID, and writes the persistent store.

### Commands:

1. **Dry-Run Validation** (Validates JSON syntax, required fields, and image paths without running inference):
   ```powershell
   .\backend\.venv\Scripts\python.exe backend/build_gallery.py --dry-run
   ```

2. **Standard Gallery Build** (Using default paths):
   ```powershell
   .\backend\.venv\Scripts\python.exe backend/build_gallery.py
   ```

3. **Custom Dataset / Manifest Build**:
   ```powershell
   .\backend\.venv\Scripts\python.exe backend/build_gallery.py `
       --manifest path/to/my_manifest.json `
       --image-dir path/to/image_folder `
       --output-dir backend/gallery_store
   ```

---

## 5. Startup Lifecycle in FastAPI

FastAPI uses an `asynccontextmanager` lifespan handler in [backend/miewid_service/api.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/api.py):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    loaded = gallery.load_from_disk()
    if loaded:
        print(f"[MiewID API] Reference gallery loaded: {gallery.get_registered_species()}")
    else:
        print("[MiewID API] No reference gallery on disk. Graceful NO_DATA mode.")
    yield
```

### Health Check Verification:
Calling `GET /health` reports gallery readiness:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "registered_species": ["Cheetah", "Plains Zebra"],
  "total_individuals": 3,
  "total_reference_images": 4,
  "input_resolution": "440x440",
  "embedding_dimensions": 2152
}
```

---

## 6. How to Import Future Authorized Datasets (e.g., WildlifeReID-10k)

When an authorized dataset (such as WildlifeReID-10k or a reserve camera-trap catalog) is integrated:

### Step 1: Query vs. Reference Partitioning
- **Strict Separation**: Split dataset images into a **gallery set** (reference records) and a **query set** (evaluation images).
- **Rule**: Never register a query image into the gallery used to evaluate that same query.

### Step 2: Generate the JSON Manifest
Write a transformation script converting the dataset annotations (CSV/DataFrame) into `manifest.json`:
```python
manifest_entries.append({
    "image_id": row["image_id"],
    "image_file": row["file_path"],
    "individual_id": row["identity"],
    "species": row["species"],
    "animal_name": row.get("name", row["identity"]),
    "source_metadata": {
        "dataset": "WildlifeReID-10k",
        "split": "gallery",
        "body_part": row.get("body_part", "flank")
    }
})
```

### Step 3: Run the Gallery Builder
Execute `build_gallery.py` with `--image-dir` pointing to the downloaded image directory.

### Step 4: Security and Wildlife Protection
- Sensitive locations, precise latitude/longitude, and timestamp data of endangered wildlife must **never** be baked into public manifests or API responses.
- Use coarse reserve zone descriptors only (e.g., `"Serengeti Corridor"`).
