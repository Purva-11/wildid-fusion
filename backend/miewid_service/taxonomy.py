"""
Safe species taxonomy and alias resolution.
Ensures biological precision:
- Maps common vernacular and scientific synonyms to canonical species names.
- Does NOT merge distinct species (e.g. Plains Zebra vs Grevy's Zebra, or Tiger vs Leopard).
- Does NOT guess or re-interpret unknown labels; standardizes unknown names safely without data corruption.
"""

from typing import Dict, List, Optional

# Explicit mapping of lowercase vernacular/scientific aliases to canonical labels
SPECIES_ALIASES: Dict[str, str] = {
    # Plains Zebra
    "zebra": "Plains Zebra",
    "plains zebra": "Plains Zebra",
    "common zebra": "Plains Zebra",
    "equus quagga": "Plains Zebra",
    "equus quagga boehmi": "Plains Zebra",
    "burchell's zebra": "Plains Zebra",

    # Grevy's Zebra (Distinct species - never merge with Plains Zebra)
    "grevy's zebra": "Grevy's Zebra",
    "grevys zebra": "Grevy's Zebra",
    "equus grevyi": "Grevy's Zebra",

    # Mountain Zebra (Distinct species)
    "mountain zebra": "Mountain Zebra",
    "equus zebra": "Mountain Zebra",

    # Cheetah
    "cheetah": "Cheetah",
    "acinonyx jubatus": "Cheetah",

    # Bengal Tiger
    "bengal tiger": "Bengal Tiger",
    "tiger": "Bengal Tiger",
    "panthera tigris": "Bengal Tiger",
    "panthera tigris tigris": "Bengal Tiger",

    # Indian Leopard
    "indian leopard": "Indian Leopard",
    "leopard": "Indian Leopard",
    "panthera pardus": "Indian Leopard",
    "panthera pardus fusca": "Indian Leopard",

    # Snow Leopard (Distinct species)
    "snow leopard": "Snow Leopard",
    "panthera uncia": "Snow Leopard",

    # Asian Elephant
    "asian elephant": "Asian Elephant",
    "elephant": "Asian Elephant",
    "elephas maximus": "Asian Elephant",

    # African Bush Elephant (Distinct species)
    "african elephant": "African Bush Elephant",
    "african bush elephant": "African Bush Elephant",
    "loxodonta africana": "African Bush Elephant",

    # Jaguar
    "jaguar": "Jaguar",
    "panthera onca": "Jaguar",

    # Sloth Bear
    "sloth bear": "Sloth Bear",
    "melursus ursinus": "Sloth Bear",

    # Sambar Deer
    "sambar deer": "Sambar Deer",
    "sambar": "Sambar Deer",
    "rusa unicolor": "Sambar Deer",

    # Indian Wolf
    "indian wolf": "Indian Wolf",
    "wolf": "Indian Wolf",
    "canis lupus pallipes": "Indian Wolf",
}


def canonicalize_species(species: Optional[str]) -> str:
    """
    Safely normalizes an input species name to its canonical representation.

    Rules:
    1. Strips leading/trailing whitespace and collapses internal multiple spaces.
    2. Matches against documented biological synonyms and common names.
    3. If unknown, safely capitalizes without reinterpretation or merging.
    4. Never returns empty string unless input was empty/whitespace.
    """
    if not species or not isinstance(species, str):
        return ""

    cleaned = " ".join(species.strip().split())
    if not cleaned:
        return ""

    lookup_key = cleaned.lower()
    if lookup_key in SPECIES_ALIASES:
        return SPECIES_ALIASES[lookup_key]

    # For unknown labels, preserve original tokens in clean title case without guessing
    return " ".join(word.capitalize() for word in cleaned.split(" "))


def get_canonical_species_list() -> List[str]:
    """Returns sorted unique canonical species defined in the alias dictionary."""
    return sorted(list(set(SPECIES_ALIASES.values())))
