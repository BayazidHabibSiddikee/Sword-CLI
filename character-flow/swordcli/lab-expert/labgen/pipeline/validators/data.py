import re
import os
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Tuple, Optional

def _parse_latex_table(latex: str) -> List[Tuple[float, float]]:
    rows = []
    in_tabular = False
    for line in latex.splitlines():
        line = line.strip()
        if line.startswith("\\begin{tabular}"):
            in_tabular = True
            continue
        if line.startswith("\\end{tabular}"):
            in_tabular = False
            continue
        if not in_tabular:
            continue
        if line.startswith("\\hline") or line.startswith("\\midrule") or line.startswith("\\toprule") or line.startswith("\\bottomrule"):
            continue
        if line.startswith("\\caption") or line.startswith("\\centering"):
            continue
        parts = [p.strip() for p in line.split("&")]
        if len(parts) >= 2:
            try:
                v = float(re.sub(r"[^\d\.\-eE]", "", parts[0]))
                i = float(re.sub(r"[^\d\.\-eE]", "", parts[1]))
                rows.append((v, i))
            except ValueError:
                pass
    return rows

def _load_iv_data(path: str) -> Optional[pd.DataFrame]:
    if not path or not os.path.exists(path):
        return None
    try:
        df = pd.read_csv(path, sep=r"\s+", header=None)
        if df.shape[1] >= 4:
            df.columns = ["V1", "I1", "V2", "I2"]
            v = pd.concat([df["V1"], df["V2"]]).reset_index(drop=True)
            i = pd.concat([df["I1"], df["I2"]]).reset_index(drop=True)
            return pd.DataFrame({"V": v, "I": i}).sort_values("V").reset_index(drop=True)
        elif df.shape[1] == 2:
            df.columns = ["V", "I"]
            return df.sort_values("V").reset_index(drop=True)
    except Exception:
        pass
    return None

def _interpolate_simulation(sim_df: pd.DataFrame, target_v: float, target_i: float = None) -> Optional[float]:
    if sim_df is None or sim_df.empty:
        return None
    # Find all points within 0.15V of target_v
    mask = (sim_df["V"] >= target_v - 0.15) & (sim_df["V"] <= target_v + 0.15)
    close_points = sim_df[mask]
    if close_points.empty:
        # Fallback to absolute closest V
        closest_idx = (sim_df["V"] - target_v).abs().idxmin()
        return float(sim_df.loc[closest_idx, "I"])
    
    if target_i is not None:
        # If we have a target I, find the closest I among the close V points
        closest_idx = (close_points["I"] * 1000 - target_i).abs().idxmin()
        return float(close_points.loc[closest_idx, "I"])
    else:
        # Just return the first one
        return float(close_points.iloc[0]["I"])


def _relative_error(claimed: float, actual: float) -> float:
    if actual == 0:
        return abs(claimed) * 100 if claimed != 0 else 0.0
    return abs(claimed - actual) / abs(actual) * 100

def check_data(report: Dict[str, Any]) -> List[Dict]:
    issues = []
    sections = report.get("sections", {})
    latex_table = sections.get("data_table_latex", "")
    iv_path = report.get("iv_data_path", "")

    table_rows = _parse_latex_table(latex_table)
    sim_df = _load_iv_data(iv_path)

    if not table_rows:
        issues.append({
            "module": "data",
            "severity": "high",
            "category": "no_data_table",
            "message": "No parsable data table found in report",
            "location": {"section": "Result"}
        })
        return issues

    if sim_df is None:
        issues.append({
            "module": "data",
            "severity": "medium",
            "category": "no_simulation_data",
            "message": "No simulation data (iv_data.txt) available for cross-check",
            "location": {"section": "Result"}
        })
        return issues

    mismatch_count = 0
    max_rel_error = 0.0
    for v_claimed, i_claimed in table_rows:
        i_actual = _interpolate_simulation(sim_df, v_claimed, i_claimed)
        if i_actual is None:
            continue
        i_claimed_ma = i_claimed
        i_actual_ma = i_actual * 1000
        rel_err = _relative_error(i_claimed_ma, i_actual_ma)
        if rel_err > 20.0:
            mismatch_count += 1
            max_rel_error = max(max_rel_error, rel_err)
            issues.append({
                "module": "data",
                "severity": "high",
                "category": "data_mismatch",
                "message": f"Table claims {i_claimed:.1f} mA at {v_claimed:.1f}V; simulation shows {i_actual_ma:.1f} mA (error {rel_err:.0f}%)",
                "location": {"section": "Result", "voltage": v_claimed}
            })

    if mismatch_count == 0 and table_rows:
        issues.append({
            "module": "data",
            "severity": "low",
            "category": "data_ok",
            "message": f"All {len(table_rows)} data points match simulation within 20%",
            "location": {"section": "Result"}
        })

    return issues

def feature_vector(report: Dict[str, Any]) -> Dict[str, float]:
    sections = report.get("sections", {})
    latex_table = sections.get("data_table_latex", "")
    iv_path = report.get("iv_data_path", "")

    table_rows = _parse_latex_table(latex_table)
    sim_df = _load_iv_data(iv_path)

    feat = {
        "table_rows": float(len(table_rows)),
        "sim_match_rate": 1.0,
        "max_rel_error": 0.0,
        "impossible_values_flag": 0.0,
    }

    if table_rows and sim_df is not None:
        mismatches = 0
        max_err = 0.0
        for v_claimed, i_claimed in table_rows:
            i_actual = _interpolate_simulation(sim_df, v_claimed, i_claimed)
            if i_actual is None:
                continue
            i_claimed_ma = i_claimed
            i_actual_ma = i_actual * 1000
            rel_err = _relative_error(i_claimed_ma, i_actual_ma)
            if rel_err > 20.0:
                mismatches += 1
            max_err = max(max_err, rel_err)
            if abs(i_claimed_ma) > 1000 or abs(i_actual_ma) > 1000:
                feat["impossible_values_flag"] = 1.0
        feat["sim_match_rate"] = 1.0 - mismatches / len(table_rows) if table_rows else 1.0
        feat["max_rel_error"] = max_err

    return feat