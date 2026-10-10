import re

with open("main.py", "r") as f:
    content = f.read()

# Fallback for ngspice
old_ngspice = """    print("Running ngspice simulation...")
    subprocess.run(["ngspice", "-b", cir_file], capture_output=True)"""
new_ngspice = """    print("Running ngspice simulation...")
    res = subprocess.run(["ngspice", "-b", cir_file], capture_output=True)
    if res.returncode != 0 or not os.path.exists(txt_out):
        print("Dynamic circuit failed, falling back to static triac circuit...")
        cir_file, txt_out = create_triac_netlist(run_dir)
        subprocess.run(["ngspice", "-b", cir_file], capture_output=True)
"""
content = content.replace(old_ngspice, new_ngspice)

# Escaping underscores in LaTeX
old_sections = """    sections = {
        "objectives": llm_sections.get("objectives", []),
        "theory": llm_sections.get("theory", ""),
        "discussion": llm_sections.get("discussion", ""),
        "conclusion": llm_sections.get("conclusion", ""),"""
new_sections = """    def esc(t):
        if isinstance(t, str): return t.replace('_', '\\\\_')
        if isinstance(t, list): return [esc(x) for x in t]
        return t

    sections = {
        "objectives": esc(llm_sections.get("objectives", [])),
        "theory": esc(llm_sections.get("theory", "")),
        "discussion": esc(llm_sections.get("discussion", "")),
        "conclusion": esc(llm_sections.get("conclusion", "")),"""
content = content.replace(old_sections, new_sections)

with open("main.py", "w") as f:
    f.write(content)
