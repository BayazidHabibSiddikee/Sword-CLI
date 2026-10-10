import logging
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

import argparse
import os
import datetime
import subprocess
import json
import pandas as pd
import matplotlib.pyplot as plt
import schemdraw
import schemdraw.elements as elm
from pipeline.assemble import load_config, render_latex, compile_pdf
from pipeline.llm import generate_report_sections, generate_circuit_design
from pipeline.research import save_research_context
from pipeline.rag import build_rag_index
from pipeline.cad import design_cad_agent
from pipeline.verify import run_all_checks, write_report, extract_features

def validate_schemdraw_ast(code):
    import ast
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            # allow schemdraw imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name not in ['schemdraw', 'schemdraw.elements']:
                        return False
            elif isinstance(node, ast.ImportFrom):
                if node.module not in ['schemdraw', 'schemdraw.elements']:
                    return False
        elif isinstance(node, ast.Name) and node.id in ['eval', 'exec', 'open', '__import__', 'globals', 'locals']:
            return False
        elif isinstance(node, ast.Attribute) and node.attr.startswith('__'):
            return False
    return True

def sanitize_netlist_comp(comp):
    import re
    if re.search(r'(;|\||&|`|\$|shell\s)', comp, re.IGNORECASE) or '.control' in comp.lower():
        return "* [SANITIZED]"
    return comp

def draw_triac_circuit(output_path):
    with schemdraw.Drawing(file=output_path, show=False) as d:
        d += elm.SourceV().up().label('Vac\n(Sweep)')
        d += elm.Resistor().right().label(r'1k$\Omega$')
        d += elm.Triac().down().label('TRIAC')
        d += elm.Line().left()
        d += elm.Ground()

def create_triac_netlist(run_dir):
    cir_path = os.path.join(run_dir, "triac_iv.cir")
    txt_out = os.path.join(run_dir, "iv_data.txt")

    model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "models", "triac.sub")).replace('\\', '/')
    netlist = f"""TRIAC V-I Characteristics
.include "{model_path}"

* Circuit
V1 1 0 DC 0
R1 1 2 1k
XT1 2 0 3 TRIAC

* Gate drive (constant current or voltage)
Ig 0 3 DC 5m

* Analysis
.dc V1 -15 15 0.1

.control
    run
    * Plot V(2) vs current (which is I(V1))
    let V_triac = V(2)
    let I_triac = -I(V1)
    wrdata {txt_out} V_triac I_triac
.endc
.end
"""
    with open(cir_path, 'w') as f:
        f.write(netlist)
    return cir_path, txt_out


def _build_data_table_from_simulation(txt_out: str) -> str:
    """Build a LaTeX table from ngspice wrdata output.

    ngspice wrdata with two signals produces 4-column output:
        index  val1  index  val2
    so actual values are in columns 1 and 3 (0-indexed).
    """
    if not os.path.exists(txt_out):
        for candidate in [
            txt_out.replace('.txt', '_0_tran.txt'),
            txt_out.replace('.txt', '_tran.txt'),
            txt_out.replace('.txt', '_0.txt'),
        ]:
            if os.path.exists(candidate):
                txt_out = candidate
                break

    if not os.path.exists(txt_out):
        return ""

    try:
        df = pd.read_csv(txt_out, sep=r'\s+', header=None)
        if df.shape[1] >= 4:
            # 4-col wrdata: [idx, V, idx, I]
            v = df[1]
            i = df[3]
        elif df.shape[1] >= 2:
            v = df[0]
            i = df[1]
        else:
            return ""

        v_sorted, i_sorted = zip(*sorted(zip(v, i)))
        v_sorted = list(v_sorted)
        i_sorted = list(i_sorted)

        n_points = min(10, len(v_sorted))
        if n_points <= 1:
            indices = [0] if n_points == 1 else []
        else:
            indices = [int(j * (len(v_sorted) - 1) / (n_points - 1)) for j in range(n_points)]

        rows = []
        for idx in indices:
            v_val = v_sorted[idx]
            i_val = i_sorted[idx] * 1000
            rows.append(f"        {v_val:.1f} & {i_val:.1f} \\\\")

        row_block = "\n".join(rows)
        table = (
            "\\begin{table}[H]\n"
            "    \\centering\n"
            "    \\begin{tabular}{|c|c|}\n"
            "        \\hline\n"
            "        \\textbf{Voltage / Time} & \\textbf{Current / Voltage} \\\\\n"
            "        \\hline\n"
            f"{row_block}\n"
            "        \\hline\n"
            "    \\end{tabular}\n"
            "    \\caption{Simulated Data (Sample Points)}\n"
            "\\end{table}"
        )
        return table
    except Exception as e:
        logger.error(f"Error building data table: {e}")
        return ""

def run_generation(args, settings):

    slug = args.name.lower().replace(" ", "_")
    run_dir = os.path.join(os.path.dirname(__file__), "runs", slug)
    os.makedirs(run_dir, exist_ok=True)
    os.makedirs(os.path.join(run_dir, "figs"), exist_ok=True)
    os.makedirs(os.path.join(run_dir, "sim"), exist_ok=True)

    logger.info(f"--- Running LabGen for: {args.name} ---")

    logger.info("Initializing RAG index...")
    build_rag_index()

    logger.info("Running LangGraph pipeline...")
    from pipeline.graph import run_pipeline

    circuit_prompt = args.circuit_prompt if args.circuit_prompt else ""

    graph_result = run_pipeline(args.name, circuit_prompt)
    circuit_json = graph_result.get("circuit_json", {})
    if not circuit_json or not circuit_json.get("netlist_components"):
        from pipeline.circuit_templates import get_fallback_circuit
        circuit_json = get_fallback_circuit(args.name, circuit_prompt)
    llm_sections = graph_result.get("report_sections", {})

    logger.info("Executing dynamic circuit...")
    cir_path = os.path.join(run_dir, "dynamic.cir")
    txt_out = os.path.join(run_dir, "iv_data.txt")
    schem_path = os.path.join(run_dir, "figs", "schematic.png")

    netlist_content = f"Dynamic Circuit: {args.name}\n"
    triac_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "models", "triac.sub")).replace('\\', '/')
    diac_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "models", "diac.sub")).replace('\\', '/')
    netlist_str = str(circuit_json.get("netlist_components", [])).upper()
    if "TRIAC" in netlist_str or "triac" in args.name.lower():
        netlist_content += f'.include "{triac_path}"\n'
    if "DIAC" in netlist_str or "diac" in args.name.lower():
        netlist_content += f'.include "{diac_path}"\n'
    netlist_content += "\n" 

    netlist_content += "* Circuit\n"
    for comp in circuit_json.get("netlist_components", []):
        netlist_content += f"{sanitize_netlist_comp(comp)}\n"


    # Extract components and find a resistor to vary
    comps = [sanitize_netlist_comp(c) for c in circuit_json.get("netlist_components", [])]
    var_res_idx = -1
    for i, c in enumerate(comps):
        if c.strip().upper().startswith("R"):
            var_res_idx = i
            break
            
    r_vals = ["1k", "5k", "10k"] if var_res_idx != -1 else ["1k"]
    colors = ['b', 'r', 'g']
    
    import matplotlib.pyplot as plt
    plt.figure(figsize=(8, 6))
    plt.title(f"{args.name} Characteristics", fontsize=14)
    plt.xlabel("Voltage (V)", fontsize=12)
    plt.ylabel("Current (mA)", fontsize=12)
    plt.grid(True, which='both', linestyle='--', linewidth=0.5)
    plt.axhline(0, color='black', linewidth=1)
    plt.axvline(0, color='black', linewidth=1)
    
    success_sim = False
    tran_data = []
    
    for r_idx, r_val in enumerate(r_vals):
        loop_txt_out = txt_out.replace('.txt', f'_{r_idx}.txt')
        
        loop_netlist = f"Dynamic Circuit: {args.name}\n"
        if "TRIAC" in netlist_str or "triac" in args.name.lower():
            loop_netlist += f'.include "{triac_path}"\n'
        if "DIAC" in netlist_str or "diac" in args.name.lower():
            loop_netlist += f'.include "{diac_path}"\n'
        loop_netlist += "\n* Circuit\n"
        
        for i, comp in enumerate(comps):
            if i == var_res_idx:
                parts = comp.split()
                if len(parts) >= 4:
                    parts[3] = r_val
                    loop_netlist += " ".join(parts) + "\n"
                else:
                    loop_netlist += f"{comp}\n"
            else:
                loop_netlist += f"{comp}\n"
                
        is_transient = any(kw in args.name.lower() for kw in ["buck", "boost", "converter", "rectifier", "inverter", "oscillator", "filter", "chopper", "switching"])
        
        # Try to infer the output node from the netlist
        out_node = "2"
        for comp in comps:
            parts = comp.split()
            if (comp.startswith("RLOAD") or comp.startswith("R_L")) and len(parts) >= 3:
                out_node = parts[1]
                break
            elif comp.startswith("R") and len(parts) >= 3 and parts[2] == "0":
                out_node = parts[1]
                
        loop_netlist += f"""
* Analysis
"""
        if is_transient:
            loop_netlist += f"""
.tran 10u 10m

.control
    run
    setplot tran1
    wrdata {loop_txt_out.replace('.txt', '_tran.txt')} time V({out_node}) -I(V1)
.endc
.end
"""
        else:
            loop_netlist += f"""
.dc V1 -15 15 0.1

.control
    run
    let V_target = V({out_node})
    let I_target = -I(V1)
    wrdata {loop_txt_out} V_target I_target
.endc
.end
"""
        loop_cir_path = cir_path.replace('.cir', f'_{r_idx}.cir')
        with open(loop_cir_path, 'w') as f:
            f.write(loop_netlist)
            
        res = subprocess.run(["ngspice", "-b", loop_cir_path], capture_output=True)
        if res.returncode == 0 and (os.path.exists(loop_txt_out) or os.path.exists(loop_txt_out.replace('.txt', '_tran.txt'))):
            success_sim = True
            if os.path.exists(loop_txt_out):
                try:
                    df = pd.read_csv(loop_txt_out, sep=r'\s+', header=None)
                    if df.shape[1] >= 4:
                        plt.plot(df[1], df[3] * 1000, linewidth=2, color=colors[r_idx % len(colors)], label=f"R={r_val}")
                    elif df.shape[1] >= 2:
                        plt.plot(df[0], df[1] * 1000, linewidth=2, color=colors[r_idx % len(colors)], label=f"R={r_val}")
                except Exception as e:
                    pass
            
            if os.path.exists(loop_txt_out.replace('.txt', '_tran.txt')):
                try:
                    df_tran = pd.read_csv(loop_txt_out.replace('.txt', '_tran.txt'), sep=r'\s+', header=None)
                    tran_data.append((r_val, colors[r_idx % len(colors)], df_tran))
                except Exception as e:
                    pass

    if not success_sim:
        logger.warning("Dynamic circuit failed, falling back to template circuit...")
        from pipeline.circuit_templates import get_fallback_circuit
        fallback_json = get_fallback_circuit(args.name, circuit_prompt)
        circuit_json.update(fallback_json)
        
        fb_netlist = f"Fallback Circuit: {args.name}\n"
        fb_netlist += "\n".join(circuit_json["netlist_components"])
        
        is_transient = any(kw in args.name.lower() for kw in ["buck", "boost", "converter", "rectifier", "inverter", "oscillator", "filter", "chopper", "switching"])
        
        # Try to infer the output node from the netlist
        out_node = "2"
        for comp in comps:
            parts = comp.split()
            if (comp.startswith("RLOAD") or comp.startswith("R_L")) and len(parts) >= 3:
                out_node = parts[1]
                break
            elif comp.startswith("R") and len(parts) >= 3 and parts[2] == "0":
                out_node = parts[1]
                
        fb_netlist += f"""
* Analysis
"""
        if is_transient:
            fb_netlist += f"""
.tran 10u 10m

.control
    run
    setplot tran1
    wrdata {txt_out.replace('.txt', '_tran.txt')} time V({out_node}) -I(V1)
.endc
.end
"""
        else:
            fb_netlist += f"""
.dc V1 -15 15 0.1

.control
    run
    let V_target = V({out_node})
    let I_target = -I(V1)
    wrdata {txt_out} V_target I_target
.endc
.end
"""
