"""Pinned CPU encoder and content-addressed, resumable embedding batches."""
from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path
import numpy as np

MODEL = 'sentence-transformers/all-mpnet-base-v2'
REVISION = 'e8c3b32edf5434bc2275fc9bab85f82640a19130'
DIMENSION = 768


class Encoder:
    def __init__(self, cache: Path, *, local_only: bool = False, query_cache: Path | None = None):
        from sentence_transformers import SentenceTransformer
        import torch
        torch.set_num_threads(4)
        self.cache = Path(query_cache or cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.model = SentenceTransformer(MODEL, revision=REVISION, device='cpu',
                                        cache_folder=str(Path(cache)/'model'),
                                        local_files_only=local_only, trust_remote_code=False)

    def encode(self, texts: list[str], batch_size: int = 8) -> np.ndarray:
        if not texts:
            return np.empty((0, DIMENSION), dtype=np.float32)
        if batch_size < 1 or batch_size > 32:
            raise ValueError('Embedding batch size must be 1–32.')
        blocks = []
        for offset in range(0, len(texts), batch_size):
            batch = texts[offset:offset+batch_size]
            digest = hashlib.sha256(json.dumps([MODEL, REVISION, batch], ensure_ascii=False).encode()).hexdigest()
            target = self.cache/(digest+'.npy')
            if target.exists():
                values = np.load(target, allow_pickle=False)
            else:
                values = self.model.encode(batch, batch_size=batch_size, normalize_embeddings=True,
                                           convert_to_numpy=True, show_progress_bar=False).astype(np.float32)
                with tempfile.NamedTemporaryFile(dir=self.cache,suffix='.tmp',delete=False) as file:
                    temporary=Path(file.name)
                    np.save(file, values, allow_pickle=False)
                temporary.replace(target)
            if values.shape != (len(batch), DIMENSION) or not np.isfinite(values).all():
                raise ValueError('Invalid embedding cache shape or nonfinite vector.')
            if not np.allclose(np.linalg.norm(values, axis=1), 1, atol=1e-4):
                raise ValueError('Embedding vectors must be normalized.')
            blocks.append(values)
        return np.concatenate(blocks)
