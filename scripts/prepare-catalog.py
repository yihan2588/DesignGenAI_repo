"""Extract only teaching image fields. Never copy user/profile/caption records."""
import json
import pathlib
import sys
import zipfile

archive = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(archive) as source:
    data = json.loads(source.read("funnybone-data/data.json"))
    # Support the supplied table-name dictionary and common table/rows envelopes.
    print("Top-level format:", type(data).__name__) if "--inspect" in sys.argv else None
    if isinstance(data, dict):
        tables = data.get("tables", data)
        images = tables.get("images") if isinstance(tables, dict) else next(t for t in tables if t.get("table", t.get("name")) == "images")
    else:
        images = next(t for t in data if t.get("table", t.get("name")) == "images")
    if isinstance(images, dict):
        images = images.get("rows", images.get("data"))
    if not isinstance(images, list):
        raise ValueError("Unsupported teaching export; inspect its table envelope before adapting this extractor")
    rows = [{k: row.get(k) for k in ("id", "url", "image_description", "additional_context")} for row in images]
out = pathlib.Path(".cowriter-cache")
out.mkdir(exist_ok=True)
(out / "source.json").write_text(json.dumps(rows))
print(f"Prepared {len(rows)} image records; no user fields exported")
