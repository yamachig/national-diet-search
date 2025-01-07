import json
from pathlib import Path

from fastapi.openapi.utils import get_openapi

from ..app import app


def main():
    openapi = get_openapi(
        title="National Diet Search with Questions",
        version="0.0.1",
        routes=app.routes,
    )

    (Path(__file__).parent.parent.parent / "openapi.json").write_text(
        json.dumps(openapi), "utf-8"
    )


if __name__ == "__main__":
    main()
