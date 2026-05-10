from __future__ import annotations

_embedder = None


def get_embedder():
    global _embedder
    if _embedder is None:
        import os
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
    return _embedder


def embed(text: str) -> list[float]:
    model = get_embedder()
    return model.encode([text], convert_to_numpy=True)[0].tolist()


def reading_text_repr(doc: dict) -> str:
    sst_c = doc.get("sst_k", 273.15) - 273.15
    return (
        f"sensor {doc.get('sensor_id')} reading at {doc.get('time')}: "
        f"SST={sst_c:.2f}C SSTA={doc.get('ssta', 0):.3f} "
        f"DHW={doc.get('ssta_dhw', 0):.3f} pH={doc.get('ph', 0):.2f} "
        f"turbidity={doc.get('turbidity', 0):.1f} "
        f"light_at_depth={doc.get('light_at_depth', 0):.2f}"
    )


def prediction_text_repr(doc: dict) -> str:
    notices = "; ".join(doc.get("notices", []))
    next_steps = "; ".join(doc.get("next_steps", []))
    return (
        f"sensor {doc.get('sensor_id')} prediction at {doc.get('time')}: "
        f"risk={doc.get('risk_level')} bleaching={doc.get('bleaching_pct', 0):.1f}% "
        f"risk_7d={doc.get('risk_7d', 0):.1f}% risk_14d={doc.get('risk_14d', 0):.1f}% "
        f"description={doc.get('risk_description', '')} "
        f"notices={notices} next_steps={next_steps}"
    )


def sensor_text_repr(doc: dict) -> str:
    return (
        f"sensor {doc.get('sensor_id')} metadata: "
        f"location={doc.get('location', 'unknown')} "
        f"depth={doc.get('depth', 0)}m "
        f"clim_sst={doc.get('clim_sst', 0)}C "
        f"salinity={doc.get('salinity', 33.5)}ppt"
    )
