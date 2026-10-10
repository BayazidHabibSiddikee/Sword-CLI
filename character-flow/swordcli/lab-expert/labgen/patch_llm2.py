import re

with open("pipeline/llm.py", "r") as f:
    content = f.read()

old_user_prompt = """    user_prompt = f\"\"\"
Experiment: {experiment_name}
Connection Instructions: {connection_prompt if connection_prompt else "Design a standard, typical circuit for this experiment."}

Provide a JSON representation of the circuit:
{{
    "circuit_design_text": "Detailed explanation of how the circuit is designed and works.",
    "apparatus": [
        {{"name": "Resistor (1k Ohm)", "quantity": "1"}},
        {{"name": "TRIAC (BT136)", "quantity": "1"}}
    ],
    "netlist_components": [
        "V1 1 0 DC 0",
        "R1 1 2 1k",
        "XT1 2 0 3 TRIAC"
    ],
    "schemdraw_code": "def draw_circuit(output_path):\\\\n    import schemdraw\\\\n    import schemdraw.elements as elm\\\\n    with schemdraw.Drawing(file=output_path, show=False) as d:\\\\n        d += elm.SourceV().up().label('Vac')\\\\n        d += elm.Resistor().right().label('1k')\\\\n        # Add other components...\\\\n"
}}
Ensure the schemdraw_code contains a single function named draw_circuit(output_path).
\"\"\""""

new_user_prompt = """    user_prompt = f\"\"\"
Experiment: {experiment_name}
Connection Instructions: {connection_prompt if connection_prompt else "Design a standard, typical circuit for this experiment."}

CRITICAL NGSPICE RULES:
1. The voltage source MUST be named V1 and connected to node 1 and 0 (e.g. V1 1 0 DC 0).
2. The circuit MUST use numbers for nodes (0, 1, 2, 3...) not letters.
3. Subcircuits like TRIAC and DIAC MUST start with X (e.g. XT1 3 0 4 TRIAC, XD1 2 3 DIAC).
4. Do NOT use generic names like LAMP or AC_LOAD. Use R for resistors, C for capacitors.
5. Node 2 MUST be the primary voltage node of interest because the simulation sweeps V1 and plots V(2) vs I(V1).
6. DO NOT use variables like {{Rvar}} in the netlist components. Give concrete values (e.g. R1 1 2 10k).

Provide a JSON representation of the circuit:
{{
    "circuit_design_text": "Detailed explanation of how the circuit is designed and works.",
    "apparatus": [
        {{"name": "Resistor (1k Ohm)", "quantity": "1"}},
        {{"name": "TRIAC (BT136)", "quantity": "1"}}
    ],
    "netlist_components": [
        "V1 1 0 DC 0",
        "R1 1 2 1k",
        "XD1 2 3 DIAC",
        "XT1 3 0 4 TRIAC"
    ],
    "schemdraw_code": "def draw_circuit(output_path):\\n    import schemdraw\\n    import schemdraw.elements as elm\\n    with schemdraw.Drawing(file=output_path, show=False) as d:\\n        d += elm.SourceV().up().label('Vac')\\n        d += elm.Resistor().right().label('1k')\\n        # Add other components...\\n"
}}
Ensure the schemdraw_code contains a single function named draw_circuit(output_path).
\"\"\""""

content = content.replace(old_user_prompt, new_user_prompt)
with open("pipeline/llm.py", "w") as f:
    f.write(content)
