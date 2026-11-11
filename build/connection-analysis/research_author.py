"""Current author entry point: preserve source results and publish a new revision.

The original geometric research author is frozen in research_author_v11.py.
This entry point never rewrites the predecessor input or its captured references.
"""
from pathlib import Path
import runpy

if __name__ == "__main__":
    revision = Path(__file__).resolve().parents[1] / "connection-sites-review" / "author_revision.py"
    runpy.run_path(str(revision), run_name="__main__")
