"""
Main entry point for starting the WildID Fusion MiewID inference service.

Run:
    python main.py
or:
    uvicorn miewid_service.api:app --host 0.0.0.0 --port 8000 --reload
"""

import uvicorn
from miewid_service.api import app

if __name__ == "__main__":
    print("Starting WildID Fusion MiewID Inference API on http://localhost:8000 ...")
    uvicorn.run("miewid_service.api:app", host="0.0.0.0", port=8000, reload=True)
