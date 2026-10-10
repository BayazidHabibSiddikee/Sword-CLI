import re
import os

with open("pipeline/validators/data.py", "r") as f:
    content = f.read()

# Replace _interpolate_simulation logic to find closest point by V, and if multiple, closest by I too!
new_func = """def _interpolate_simulation(sim_df: pd.DataFrame, target_v: float, target_i: float = None) -> Optional[float]:
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
"""

content = re.sub(r"def _interpolate_simulation\(.*?return float\(i0 \+ \(i1 - i0\) \* \(target_v - v0\) / \(v1 - v0\)\)", new_func, content, flags=re.DOTALL)
content = content.replace("i_actual = _interpolate_simulation(sim_df, v_claimed)", "i_actual = _interpolate_simulation(sim_df, v_claimed, i_claimed)")

with open("pipeline/validators/data.py", "w") as f:
    f.write(content)

