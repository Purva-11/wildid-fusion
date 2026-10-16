"""
Reproducible Reference Gallery Builder for WildID Fusion.

Accepts:
- Configurable image directory containing cropped animal chips.
- Documented metadata manifest (JSON) specifying individual IDs, species, and image files.

Executes:
- Validates manifest schema and image integrity.
- Safe species alias resolution via miewid_service.taxonomy.
- Documented MiewID preprocessing and ONNX embedding extraction (2152-dimensional unit vectors).
- Persists manifest.json and embeddings.npz to the configured gallery store.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np
from PIL import Image

# Ensure backend root is in Python module search path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from miewid_service.config import config
from miewid_service.model import MiewIDEngine
from miewid_service.gallery import ReferenceGallery
from miewid_service.taxonomy import canonicalize_species


def validate_manifest_entry(entry: Dict[str, Any], index: int, image_dir: Path) -> Dict[str, Any]:
    """
    Validates a single entry from the input manifest.
    Ensures required fields are present and image file exists.
    """
    if not isinstance(entry, dict):
        raise ValueError(f"Manifest entry #{index} is not a valid JSON object.")

    # 1. Validate image file reference
    img_filename = entry.get("image_file") or entry.get("image_path")
    if not img_filename or not str(img_filename).strip():
        raise ValueError(f"Manifest entry #{index} missing required 'image_file' or 'image_path'.")

    img_path = image_dir / str(img_filename).strip()
    if not img_path.is_file():
        # Also check if it was given as an absolute path
        abs_candidate = Path(str(img_filename).strip())
        if abs_candidate.is_file():
            img_path = abs_candidate
        else:
            raise FileNotFoundError(f"Manifest entry #{index}: image file not found at {img_path}")

    # 2. Validate Individual ID
    individual_id = entry.get("individual_id")
    if not individual_id or not str(individual_id).strip():
        raise ValueError(f"Manifest entry #{index}: missing or empty 'individual_id'.")

    # 3. Validate Species
    species_input = entry.get("species")
    if not species_input or not str(species_input).strip():
        raise ValueError(f"Manifest entry #{index}: missing or empty 'species'.")

    canonical_sp = canonicalize_species(str(species_input))
    if not canonical_sp:
        raise ValueError(f"Manifest entry #{index}: species '{species_input}' could not be canonicalized.")

    # 4. Resolve Image ID
    image_id = entry.get("image_id")
    if not image_id or not str(image_id).strip():
        image_id = img_path.stem

    return {
        "image_id": str(image_id).strip(),
        "resolved_image_path": img_path,
        "individual_id": str(individual_id).strip(),
        "canonical_species": canonical_sp,
        "animal_name": entry.get("animal_name") or str(individual_id).strip(),
        "source_metadata": entry.get("source_metadata") or {}
    }


def build_gallery_from_manifest(
    manifest_path: Path,
    image_dir: Path,
    output_dir: Path,
    model_path: Optional[Path] = None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Core function to parse manifest, extract embeddings with MiewID, and persist gallery.
    """
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Manifest file not found: {manifest_path}")

    if not image_dir.is_dir():
        raise NotADirectoryError(f"Image directory not found: {image_dir}")

    print(f"[Gallery Builder] Reading manifest from: {manifest_path}")
    with open(manifest_path, "r", encoding="utf-8") as f:
        raw_manifest = json.load(f)

    if not isinstance(raw_manifest, list):
        raise ValueError(f"Expected top-level JSON array in manifest, got {type(raw_manifest).__name__}")

    if len(raw_manifest) == 0:
        raise ValueError("Manifest is empty (0 entries).")

    print(f"[Gallery Builder] Validating {len(raw_manifest)} entries...")
    validated_entries: List[Dict[str, Any]] = []
    seen_image_ids = set()

    for idx, raw_item in enumerate(raw_manifest):
        clean_item = validate_manifest_entry(raw_item, idx, image_dir)
        if clean_item["image_id"] in seen_image_ids:
            raise ValueError(f"Duplicate image_id '{clean_item['image_id']}' detected in manifest entry #{idx}.")
        seen_image_ids.add(clean_item["image_id"])
        validated_entries.append(clean_item)

    print(f"[Gallery Builder] Validation passed: {len(validated_entries)} valid entries.")

    if dry_run:
        print("[Gallery Builder] Dry run complete. Exiting without model inference or file write.")
        return {"status": "dry_run_success", "total_entries": len(validated_entries)}

    print(f"[Gallery Builder] Initializing MiewID Inference Engine...")
    engine = MiewIDEngine(model_path=model_path)
    if not engine.is_loaded:
        raise RuntimeError(f"Cannot build gallery: MiewID model is not loaded. Reason: {engine.blocker_reason}")

    gallery = ReferenceGallery()

    print(f"[Gallery Builder] Extracting embeddings for {len(validated_entries)} reference chips...")
    for idx, entry in enumerate(validated_entries, 1):
        img_path = entry["resolved_image_path"]
        print(f"  [{idx}/{len(validated_entries)}] Processing {entry['canonical_species']} | "
              f"{entry['individual_id']} ({entry['image_id']}) -> {img_path.name}")

        with Image.open(img_path) as pil_img:
            emb = engine.extract_embedding(pil_img)

        gallery.register_image(
            species=entry["canonical_species"],
            individual_id=entry["individual_id"],
            embedding=emb,
            image_id=entry["image_id"],
            animal_name=entry["animal_name"],
            source_metadata=entry["source_metadata"]
        )

    print(f"[Gallery Builder] Saving persistent gallery to: {output_dir}")
    gallery.save_to_disk(gallery_dir=output_dir)

    summary = {
        "output_directory": str(output_dir),
        "registered_species": gallery.get_registered_species(),
        "total_individuals": gallery.get_total_individuals(),
        "total_reference_images": gallery.get_total_images()
    }

    print("\n" + "=" * 65)
    print(" [SUCCESS] GALLERY BUILD COMPLETE")
    print(f"  Output Directory:       {summary['output_directory']}")
    print(f"  Registered Species:     {summary['registered_species']}")
    print(f"  Total Individuals:      {summary['total_individuals']}")
    print(f"  Total Reference Images: {summary['total_reference_images']}")
    print("=" * 65 + "\n")

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Build persistent reference gallery for WildID Fusion using MiewID."
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=BACKEND_DIR / "test_data" / "reference_gallery_manifest.json",
        help="Path to JSON manifest specifying reference images."
    )
    parser.add_argument(
        "--image-dir",
        type=Path,
        default=BACKEND_DIR / "test_data",
        help="Base directory where reference image files are located."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=config.gallery_dir,
        help="Target directory to write manifest.json and embeddings.npz."
    )
    parser.add_argument(
        "--model-path",
        type=Path,
        default=None,
        help="Optional explicit path to miewid.onnx."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate manifest and file paths without running inference."
    )

    args = parser.parse_args()

    try:
        build_gallery_from_manifest(
            manifest_path=args.manifest,
            image_dir=args.image_dir,
            output_dir=args.output_dir,
            model_path=args.model_path,
            dry_run=args.dry_run
        )
    except Exception as e:
        print(f"\n[ERROR] Gallery build failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
