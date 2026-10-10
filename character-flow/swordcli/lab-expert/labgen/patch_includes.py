import re
import os

with open("main.py", "r") as f:
    content = f.read()

# For execute_dynamic_circuit
old1 = """    netlist_content = f"Dynamic Circuit: {exp_name}\\n"
    model_path = os.path.abspath("models/triac.sub").replace('\\\\', '/')
    if "triac" in circuit_prompt.lower():
        netlist_content += f'.include "{model_path}"\\n\\n'"""
new1 = """    netlist_content = f"Dynamic Circuit: {exp_name}\\n"
    triac_path = os.path.abspath("models/triac.sub").replace('\\\\', '/')
    diac_path = os.path.abspath("models/diac.sub").replace('\\\\', '/')
    netlist_str = str(circuit_json.get("netlist_components", [])).upper()
    if "TRIAC" in netlist_str or "triac" in circuit_prompt.lower():
        netlist_content += f'.include "{triac_path}"\\n'
    if "DIAC" in netlist_str or "diac" in circuit_prompt.lower():
        netlist_content += f'.include "{diac_path}"\\n'
    netlist_content += "\\n" """
content = content.replace(old1, new1)

# For run_generation
old2 = """    netlist_content = f"Dynamic Circuit: {args.name}\\n"
    model_path = os.path.abspath("models/triac.sub").replace('\\\\', '/')
    if "triac" in args.name.lower():
        netlist_content += f'.include "{model_path}"\\n\\n'"""
new2 = """    netlist_content = f"Dynamic Circuit: {args.name}\\n"
    triac_path = os.path.abspath("models/triac.sub").replace('\\\\', '/')
    diac_path = os.path.abspath("models/diac.sub").replace('\\\\', '/')
    netlist_str = str(circuit_json.get("netlist_components", [])).upper()
    if "TRIAC" in netlist_str or "triac" in args.name.lower():
        netlist_content += f'.include "{triac_path}"\\n'
    if "DIAC" in netlist_str or "diac" in args.name.lower():
        netlist_content += f'.include "{diac_path}"\\n'
    netlist_content += "\\n" """
content = content.replace(old2, new2)

with open("main.py", "w") as f:
    f.write(content)
