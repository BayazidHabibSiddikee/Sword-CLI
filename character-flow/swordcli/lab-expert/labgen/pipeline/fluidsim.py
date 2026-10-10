import os
import json
from pipeline.llm import call_llm

FLUIDSIM_SYSTEM_PROMPT = """You are an expert pneumatic and hydraulic systems engineer using FluidSIM.
The user will provide a specification for a pneumatic or hydraulic circuit (e.g. AND gate, OR gate, cylinder actuation).
Your task is to generate a structured JSON representation of the FluidSIM components and their connections, and a Mermaid flowchart representing the schematic.

Output valid JSON:
{
    "reasoning": "A short explanation of the pneumatic logic.",
    "components": [{"id": "C1", "type": "Double-acting cylinder"}, {"id": "V1", "type": "5/2-way valve"}],
    "connections": [{"from": "V1_out1", "to": "C1_in1"}],
    "mermaid_graph": "graph TD;\n  Supply-->V1;\n  V1-->C1;"
}
"""

def generate_fluidsim_circuit(spec: str, output_path: str) -> bool:
    print(f"Generating FluidSim Design for: {spec}")
    try:
        response = call_llm(FLUIDSIM_SYSTEM_PROMPT, f"Design Specification: {spec}", response_json=True)
        reasoning = response.get("reasoning", "")
        print(f"  Reasoning: {reasoning}")
        
        # Save JSON definition
        json_path = output_path.replace(".ct", ".json")
        with open(json_path, "w") as f:
            json.dump(response, f, indent=2)
            
        # Removed fake .ct file generation since FluidSIM cannot open it.
        # Users should use the generated JSON and Mermaid graph instead.
            
        print(f"  Success! Exported FluidSim files to {output_path.replace('.ct', '.json')}")
        return True
    except Exception as e:
        print(f"  FluidSim generation failed: {e}")
        return False
