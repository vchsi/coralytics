"""
Simulated coral reef sensor — mimics a full bleaching event cycle.

Phase layout (repeating):
  0 – Baseline      (~80 polls)  normal healthy-reef conditions
  1 – Thermal ramp  (~50 polls)  SST climbs, light intensifies
  2 – Bleaching     (~70 polls)  prolonged heat stress, pH crash, turbidity spike
  3 – Recovery      (~60 polls)  SST retreats, chemistry slowly normalises

All values include per-reading Gaussian noise so the charts look organic.
"""

import math
import random
import time

import flask as f

app = f.Flask(__name__)

# ── Phase definitions ─────────────────────────────────────────────────────────
# Each phase is (duration_polls, {param: (start, end)})
# Values are linearly interpolated across the phase then noise is added.

PHASES = [
    # ── Phase 0: Baseline ─────────────────────────────────────────────────────
    (12, {
        "temperature":   (22.5, 23.0),
        "ph":            (8.25, 8.20),
        "turbidity":     (0.8,  1.0),
        "surface_light": (350,  420),
        "sst":           (25.5, 26.0),
    }),
    # ── Phase 1: Thermal ramp ─────────────────────────────────────────────────
    (8, {
        "temperature":   (23.0, 27.5),
        "ph":            (8.20, 8.00),
        "turbidity":     (1.0,  2.8),
        "surface_light": (420,  680),
        "sst":           (26.0, 29.5),
    }),
    # ── Phase 2: Bleaching peak ───────────────────────────────────────────────
    (12, {
        "temperature":   (27.5, 30.0),
        "ph":            (8.00, 7.75),
        "turbidity":     (2.8,  4.5),
        "surface_light": (680,  820),
        "sst":           (29.5, 31.2),
    }),
    # ── Phase 3: Recovery ─────────────────────────────────────────────────────
    (8, {
        "temperature":   (30.0, 23.5),
        "ph":            (7.75, 8.15),
        "turbidity":     (4.5,  1.2),
        "surface_light": (820,  380),
        "sst":           (31.2, 26.5),
    }),
]

# Noise stddev per parameter (same units as the value)
NOISE = {
    "temperature":   0.15,
    "ph":            0.03,
    "turbidity":     0.12,
    "surface_light": 18.0,
    "sst":           0.10,
}

# ── State ─────────────────────────────────────────────────────────────────────
_poll_count: int = 0


def _current_values() -> dict:
    """Return sensor values for the current poll index."""
    global _poll_count

    # Find which phase we're in and the fractional progress through it.
    idx = _poll_count
    total = sum(d for d, _ in PHASES)
    idx_in_cycle = idx % total

    elapsed = 0
    for duration, params in PHASES:
        if idx_in_cycle < elapsed + duration:
            t = (idx_in_cycle - elapsed) / duration  # 0 → 1
            vals = {
                k: v0 + (v1 - v0) * t + random.gauss(0, NOISE[k])
                for k, (v0, v1) in params.items()
            }
            # Hard-clamp to physically plausible ranges
            vals["temperature"]   = max(18.0, min(36.0, vals["temperature"]))
            vals["ph"]            = max(7.50, min(8.50, vals["ph"]))
            vals["turbidity"]     = max(0.10, min(6.00, vals["turbidity"]))
            vals["surface_light"] = max(50.0, min(1100.0, vals["surface_light"]))
            vals["sst"]           = max(20.0, min(35.0, vals["sst"]))
            # Add a subtle diel cycle to light (sine wave over 36 polls ≈ 3 hours)
            diel = 0.5 * (1 + math.sin(2 * math.pi * idx / 36))
            vals["surface_light"] *= (0.75 + 0.50 * diel)
            vals["surface_light"]  = max(50.0, min(1100.0, vals["surface_light"]))
            _poll_count += 1
            return vals
        elapsed += duration

    # Should never reach here
    _poll_count += 1
    return {}


def _phase_label() -> str:
    total = sum(d for d, _ in PHASES)
    idx = (_poll_count - 1) % total
    elapsed = 0
    for i, (duration, _) in enumerate(PHASES):
        if idx < elapsed + duration:
            return ["baseline", "thermal_ramp", "bleaching_peak", "recovery"][i]
        elapsed += duration
    return "unknown"


# ── Flask endpoint ─────────────────────────────────────────────────────────────

@app.route("/sensor_poll", methods=["GET"])
def sensors():
    vals = _current_values()
    return {
        "sensor_values": [{
            "id":            "1",
            "temperature":   round(vals["temperature"],   2),
            "ph":            round(vals["ph"],            3),
            "turbidity":     round(vals["turbidity"],     3),
            "surface_light": round(vals["surface_light"], 1),
            "sst":           round(vals["sst"],           2),
        }],
        "_meta": {
            "phase":      _phase_label(),
            "poll_index": _poll_count - 1,
        },
    }


if __name__ == "__main__":
    app.run(debug=True, port=6767)
