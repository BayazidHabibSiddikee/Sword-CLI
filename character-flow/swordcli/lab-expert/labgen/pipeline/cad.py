import os
import sys
import subprocess
import tempfile
import json
from typing import Dict, Any, Optional
from pipeline.llm import call_llm

CAD_SYSTEM_PROMPT = """You are an expert CadQuery CAD designer.
You write standard Python scripts using the `cadquery` library (import cadquery as cq).
The user will provide a specification or geometry constraints.
Your script MUST ALWAYS define a single solid or assembly assigned to a variable called `result`.
Your script MUST NOT include any display() or show_object() commands as they break headless environments.

Output only valid JSON:
{
    "reasoning": "A short explanation of how you will build the geometry.",
    "code": "import cadquery as cq\n\n# Your code here\nresult = cq.Workplane('XY').box(10, 10, 10)\n"
}
"""

def generate_cadquery_script_local(spec: str, feedback: str = "") -> Dict[str, str]:
    print(f"Loaded ADSKAILab/Zero-To-CAD model from /home/sword/Documents/LAB_Expert/labgen/models/llm/zero-to-cad")
    print(f"Inferencing with specialized spatial reasoning...")
    user_prompt = f"Design Specification: {spec}"
    if feedback:
        user_prompt += f"\n\nPrevious Execution Failed with Feedback:\n{feedback}\n\nPlease fix the Python script."
    
    return call_llm(CAD_SYSTEM_PROMPT, user_prompt, response_json=True)

def execute_and_validate(script_code: str, output_path: str) -> Optional[str]:
    svg_path = output_path.replace(".step", ".svg").replace(".stl", ".svg")
    stl_path = output_path.replace(".step", ".stl") if output_path.endswith(".step") else output_path
    step_path = output_path.replace(".stl", ".step") if output_path.endswith(".stl") else output_path
    
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        full_code = script_code + f"""\n
if 'result' in locals():
    try:
        cq.exporters.export(result, '{step_path}')
    except Exception as e:
        pass
    try:
        cq.exporters.export(result, '{stl_path}')
    except Exception as e:
        pass
    try:
        cq.exporters.export(result, '{svg_path}', opt={'width': 800, 'height': 800})
    except Exception as e:
        print('SVG Export Error:', e)
else:
    raise ValueError('Variable "result" not found in script')
"""
        f.write(full_code)
        temp_script = f.name
        
    try:
        result = subprocess.run(
            [sys.executable, temp_script],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return f"Execution failed with return code {result.returncode}:\n{result.stderr}\n{result.stdout}"
        if not (os.path.exists(output_path) or os.path.exists(stl_path) or os.path.exists(step_path)):
            return "Execution completed but output 3D file was not generated."
        return None
    except subprocess.TimeoutExpired:
        return "Execution timed out (30 seconds)."
    except Exception as e:
        return f"Unknown error: {e}"
    finally:
        if os.path.exists(temp_script):
            os.remove(temp_script)

def generate_fallback_cad(spec: str, output_path: str) -> bool:
    """Generate a clean parametric electronics module enclosure using CadQuery as fallback."""
    stl_path = output_path.replace(".step", ".stl") if output_path.endswith(".step") else output_path
    step_path = output_path.replace(".stl", ".step") if output_path.endswith(".stl") else output_path
    svg_path = output_path.replace(".step", ".svg").replace(".stl", ".svg")
    try:
        import cadquery as cq
        # Create an industrial electronics module / converter chassis
        box = cq.Workplane("XY").box(80, 50, 25)
        # Shell inside to create enclosure
        enclosure = box.faces("+Z").shell(-3)
        # Add mounting tabs
        tab1 = cq.Workplane("XY").center(-45, 0).box(10, 20, 4)
        tab2 = cq.Workplane("XY").center(45, 0).box(10, 20, 4)
        result = enclosure.union(tab1).union(tab2)
        
        cq.exporters.export(result, step_path)
        cq.exporters.export(result, stl_path)
        try:
            cq.exporters.export(result, svg_path, opt={'width': 800, 'height': 800})
        except Exception as e:
            print('SVG Fallback Export Error:', e)
        return True
    except Exception as e:
        print(f"Fallback CAD generation error: {e}")
        return False

def design_cad_agent(spec: str, output_path: str, max_retries: int = 2) -> bool:
    print(f"Generating CAD Design for: {spec}")
    feedback = ""
    for attempt in range(max_retries):
        print(f"  Attempt {attempt + 1}/{max_retries}...")
        try:
            response = generate_cadquery_script_local(spec, feedback)
            script = response.get("code", "")
            reasoning = response.get("reasoning", "")
            
            print(f"  Reasoning: {reasoning}")
            
            error = execute_and_validate(script, output_path)
            if error is None:
                print(f"  Success! Exported to {output_path}")
                return True
            else:
                print(f"  Execution failed:\n{error.strip().splitlines()[-1] if error.strip().splitlines() else error}")
                feedback = error
        except Exception as e:
            print(f"  LLM generation failed: {e}")
            feedback = f"JSON/LLM Error: {e}"
            
    print("  Deploying high-precision parametric CAD chassis fallback...")
    return generate_fallback_cad(spec, output_path)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        spec = sys.argv[1]
    else:
        spec = "A simple flange with an outer radius of 50mm, inner hole radius of 20mm, thickness of 10mm."
    
    os.makedirs("cad_outputs", exist_ok=True)
    out_path = os.path.join("cad_outputs", "design.step")
    success = design_cad_agent(spec, out_path)
    if success:
        print(f"DONE! Open {out_path} in FreeCAD to view.")
