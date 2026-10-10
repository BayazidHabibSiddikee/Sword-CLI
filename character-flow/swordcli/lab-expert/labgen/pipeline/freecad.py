#!/usr/bin/env python3
"""
FreeCAD Integration for LabGen - Design validation and training data generation.

Provides:
1. Headless FreeCAD script execution (via freecadcmd)
2. Script validation (syntax, API usage, geometry validity)
3. Synthetic training data generation (NL -> FreeCAD script pairs)
4. Agent interface for iterative design refinement
"""

import os
import json
import subprocess
import tempfile
import ast
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict

# FreeCAD headless command
FREECAD_CMD = os.environ.get("FREECAD_CMD", "freecadcmd")

@dataclass
class FreeCADResult:
    success: bool
    output: str
    error: str
    return_code: int
    output_files: List[str]
    execution_time: float

@dataclass
class DesignSpec:
    """Natural language design specification."""
    description: str
    parameters: Dict[str, Any]
    constraints: List[str]
    output_format: str = "step"  # step, stl, brep

class FreeCADExecutor:
    """Executes FreeCAD Python scripts headlessly."""

    def __init__(self, freecad_cmd: str = FREECAD_CMD, timeout: int = 120):
        self.freecad_cmd = freecad_cmd
        self.timeout = timeout

    def check_available(self) -> bool:
        """Check if freecadcmd is available."""
        try:
            result = subprocess.run([self.freecad_cmd, "--version"], capture_output=True, timeout=10)
            return result.returncode == 0
        except Exception:
            return False

    def execute_script(self, script: str, output_dir: Optional[str] = None) -> FreeCADResult:
        """
        Execute a FreeCAD Python script headlessly.
        Returns FreeCADResult with success status, output, errors, and generated files.
        """
        import time
        start_time = time.time()

        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="freecad_")

        os.makedirs(output_dir, exist_ok=True)

        # Write script to temp file
        script_path = os.path.join(output_dir, "design.py")
        with open(script_path, "w") as f:
            f.write(script)

        # Execute
        try:
            result = subprocess.run(
                [self.freecad_cmd, script_path],
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=output_dir
            )
            execution_time = time.time() - start_time

            # Find generated files
            output_files = []
            for ext in [".step", ".stp", ".stl", ".brep", ".fcstd"]:
                output_files.extend([str(p) for p in Path(output_dir).glob(f"*{ext}")])

            return FreeCADResult(
                success=result.returncode == 0,
                output=result.stdout,
                error=result.stderr,
                return_code=result.returncode,
                output_files=output_files,
                execution_time=execution_time
            )
        except subprocess.TimeoutExpired:
            return FreeCADResult(
                success=False,
                output="",
                error=f"Timeout after {self.timeout}s",
                return_code=-1,
                output_files=[],
                execution_time=time.time() - start_time
            )
        except Exception as e:
            return FreeCADResult(
                success=False,
                output="",
                error=str(e),
                return_code=-1,
                output_files=[],
                execution_time=time.time() - start_time
            )

    def validate_script(self, script: str) -> Dict[str, Any]:
        """
        Validate FreeCAD script without executing.
        Checks: syntax, imports, basic API usage patterns.
        """
        issues = []
        warnings = []

        # Syntax check
        try:
            tree = ast.parse(script)
        except SyntaxError as e:
            return {"valid": False, "issues": [f"Syntax error: {e}"], "warnings": []}

        # Check for required imports
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.add(node.module.split(".")[0])

        required_imports = {"FreeCAD", "Part", "Mesh", "Draft"}
        missing = required_imports - imports
        if missing:
            issues.append(f"Missing recommended imports: {missing}")

        # Check for common patterns
        script_lower = script.lower()
        if "freecad" not in script_lower and "freecad" not in imports:
            warnings.append("FreeCAD not explicitly imported (may work via freecadcmd)")

        if "app.activedocument" not in script_lower and "freecad.active" not in script_lower:
            warnings.append("No ActiveDocument reference found")

        if "recompute" not in script_lower:
            warnings.append("No recompute() call - geometry may not update")

        # Check for export
        has_export = any(x in script_lower for x in [".step", ".stl", ".brep", "export"])
        if not has_export:
            warnings.append("No export operation found")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "warnings": warnings,
            "imports": list(imports)
        }


# Synthetic training data generators
class FreeCADDataGenerator:
    """Generates (NL description, FreeCAD script) pairs for training."""

    PRIMITIVE_TEMPLATES = [
        {
            "name": "box",
            "description": "A rectangular box with dimensions {length} x {width} x {height} mm",
            "parameters": {"length": 50, "width": 30, "height": 20},
            "script": """
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("Box")
box = Part.makeBox({length}, {width}, {height})
Part.show(box)
doc.recompute()
import Mesh
Mesh.export([box], "{output_dir}/box.step")
"""
        },
        {
            "name": "cylinder",
            "description": "A cylinder with radius {radius} mm and height {height} mm",
            "parameters": {"radius": 10, "height": 50},
            "script": """
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("Cylinder")
cyl = Part.makeCylinder({radius}, {height})
Part.show(cyl)
doc.recompute()
import Mesh
Mesh.export([cyl], "{output_dir}/cylinder.step")
"""
        },
        {
            "name": "sphere",
            "description": "A sphere with radius {radius} mm",
            "parameters": {"radius": 15},
            "script": """
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("Sphere")
sphere = Part.makeSphere({radius})
Part.show(sphere)
doc.recompute()
import Mesh
Mesh.export([sphere], "{output_dir}/sphere.step")
"""
        },
        {
            "name": "cone",
            "description": "A cone with base radius {radius1} mm, top radius {radius2} mm, height {height} mm",
            "parameters": {"radius1": 20, "radius2": 10, "height": 40},
            "script": """
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("Cone")
cone = Part.makeCone({radius1}, {radius2}, {height})
Part.show(cone)
doc.recompute()
import Mesh
Mesh.export([cone], "{output_dir}/cone.step")
"""
        },
        {
            "name": "torus",
            "description": "A torus with major radius {major_radius} mm and minor radius {minor_radius} mm",
            "parameters": {"major_radius": 30, "minor_radius": 8},
            "script": """
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("Torus")
torus = Part.makeTorus({major_radius}, {minor_radius})
Part.show(torus)
doc.recompute()
import Mesh
Mesh.export([torus], "{output_dir}/torus.step")
"""
        }
    ]

    BOOLEAN_TEMPLATES = [
        {
            "name": "box_with_cylindrical_hole",
            "description": "A {length} x {width} x {height} mm box with a {hole_radius} mm radius cylindrical hole through the center",
            "parameters": {"length": 50, "width": 50, "height": 20, "hole_radius": 8},
            "script": """
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("BoxWithHole")
box = Part.makeBox({length}, {width}, {height})
cyl = Part.makeCylinder({hole_radius}, {height})
cyl.translate(FreeCAD.Vector({length}/2, {width}/2, 0))
result = box.cut(cyl)
Part.show(result)
doc.recompute()
import Mesh
Mesh.export([result], "{output_dir}/box_with_hole.step")
"""
        },
        {
            "name": "box_with_spherical_cavity",
            "description": "A {size} mm cube with a {radius} mm spherical cavity at the center",
            "parameters": {"size": 40, "radius": 12},
            "script": """
import FreeCAD, Part, Mesh
doc = FreeCAD.newDocument("BoxWithCavity")
box = Part.makeBox({size}, {size}, {size})
sphere = Part.makeSphere({radius})
sphere.translate(FreeCAD.Vector({size}/2, {size}/2, {size}/2))
result = box.cut(sphere)
Part.show(result)
doc.recompute()
import Mesh
Mesh.export([result], "{output_dir}/box_with_cavity.step")
"""
        }
    ]

    def generate_primitive_samples(self, output_dir: str, count_per_template: int = 5) -> List[Dict]:
        """Generate training samples from primitive templates."""
        samples = []
        os.makedirs(output_dir, exist_ok=True)

        for template in self.PRIMITIVE_TEMPLATES:
            for i in range(count_per_template):
                # Vary parameters
                params = template["parameters"].copy()
                for k in params:
                    params[k] = int(params[k] * (0.8 + 0.4 * (i / max(count_per_template - 1, 1))))

                desc = template["description"].format(**params)
                script = template["script"].format(**params, output_dir=output_dir)

                samples.append({
                    "description": desc,
                    "script": script,
                    "parameters": params,
                    "category": "primitive"
                })

        return samples

    def generate_boolean_samples(self, output_dir: str, count_per_template: int = 3) -> List[Dict]:
        """Generate training samples from boolean operation templates."""
        samples = []
        os.makedirs(output_dir, exist_ok=True)

        for template in self.BOOLEAN_TEMPLATES:
            for i in range(count_per_template):
                params = template["parameters"].copy()
                for k in params:
                    params[k] = int(params[k] * (0.8 + 0.4 * (i / max(count_per_template - 1, 1))))

                desc = template["description"].format(**params)
                script = template["script"].format(**params, output_dir=output_dir)

                samples.append({
                    "description": desc,
                    "script": script,
                    "parameters": params,
                    "category": "boolean"
                })

        return samples

    def save_dataset(self, samples: List[Dict], output_file: str):
        """Save dataset in JSONL format for training."""
        with open(output_file, "w") as f:
            for s in samples:
                f.write(json.dumps(s) + "\n")
        print(f"Saved {len(samples)} samples to {output_file}")


class FreeCADAgent:
    """Agent for iterative FreeCAD design with error feedback."""

    def __init__(self, executor: FreeCADExecutor, max_iterations: int = 5):
        self.executor = executor
        self.max_iterations = max_iterations

    def design_from_spec(self, spec: DesignSpec, llm_call_fn) -> Tuple[FreeCADResult, str]:
        """
        Generate and refine a FreeCAD script from a design specification.
        llm_call_fn: function(system_prompt, user_prompt) -> script
        """
        system_prompt = """You are a FreeCAD Python expert. Generate a complete, executable FreeCAD script.
Requirements:
- Import FreeCAD, Part, Mesh
- Create document, build geometry, call doc.recompute()
- Export to STEP format
- Handle errors gracefully
- Use only standard FreeCAD Python API"""

        user_prompt = f"""Design: {spec.description}

Parameters: {json.dumps(spec.parameters)}
Constraints: {json.dumps(spec.constraints)}
Output format: {spec.output_format}

Generate the FreeCAD Python script."""

        script = llm_call_fn(system_prompt, user_prompt)

        for iteration in range(self.max_iterations):
            print(f"[FreeCAD Agent] Iteration {iteration + 1}/{self.max_iterations}")

            # Validate first
            validation = self.executor.validate_script(script)
            if not validation["valid"]:
                script = self._fix_script(script, validation["issues"], llm_call_fn)
                continue

            # Execute
            result = self.executor.execute_script(script)
            if result.success:
                print(f"[FreeCAD Agent] Success! Generated: {result.output_files}")
                return result, script

            # Fix errors
            print(f"[FreeCAD Agent] Error: {result.error[:200]}")
            script = self._fix_script(script, [result.error], llm_call_fn)

        return FreeCADResult(success=False, output="", error="Max iterations reached", return_code=-1, output_files=[], execution_time=0), script

    def _fix_script(self, script: str, issues: List[str], llm_call_fn) -> str:
        """Ask LLM to fix script based on issues."""
        fix_prompt = f"""The following FreeCAD script has issues:
{chr(10).join(f"- {i}" for i in issues)}

Script:
```python
{script}
```

Fix the script and return ONLY the corrected Python code."""

        return llm_call_fix(script, issues, llm_call_fn)


def llm_call_fix(original_script: str, issues: List[str], llm_call_fn) -> str:
    """Helper to call LLM for fixing."""
    fix_prompt = f"""Fix this FreeCAD script. Issues:
{chr(10).join(f"- {i}" for i in issues)}

Original:
```python
{original_script}
```

Return ONLY the corrected Python code."""
    system_prompt = "You are a FreeCAD Python expert. Fix the script and return only valid Python code."
    return llm_call_fn(system_prompt, fix_prompt)


def generate_training_dataset(output_dir: str = "freecad_training_data", num_samples: int = 100) -> List[Dict]:
    """Generate a synthetic FreeCAD training dataset."""
    generator = FreeCADDataGenerator()
    os.makedirs(output_dir, exist_ok=True)

    samples = []
    samples.extend(generator.generate_primitive_samples(output_dir, count_per_template=10))
    samples.extend(generator.generate_boolean_samples(output_dir, count_per_template=5))

    # Add variations
    for i in range(num_samples - len(samples)):
        # Mix and match
        samples.append({
            "description": f"Custom design {i}",
            "script": generator.PRIMITIVE_TEMPLATES[i % len(generator.PRIMITIVE_TEMPLATES)]["script"],
            "parameters": {},
            "category": "mixed"
        })

    dataset_path = os.path.join(output_dir, "freecad_dataset.jsonl")
    generator.save_dataset(samples[:num_samples], dataset_path)

    return samples[:num_samples]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="FreeCAD integration")
    parser.add_argument("--check", action="store_true", help="Check FreeCAD availability")
    parser.add_argument("--execute", help="Execute a FreeCAD script file")
    parser.add_argument("--generate-dataset", action="store_true", help="Generate training dataset")
    parser.add_argument("--output-dir", default="freecad_training_data", help="Output directory")
    parser.add_argument("--num-samples", type=int, default=100, help="Number of samples")
    args = parser.parse_args()

    executor = FreeCADExecutor()

    if args.check:
        available = executor.check_available()
        print(f"FreeCAD available: {available}")
        if available:
            result = subprocess.run([FREECAD_CMD, "--version"], capture_output=True, text=True)
            print(f"Version: {result.stdout.strip()}")

    elif args.execute:
        with open(args.execute, "r") as f:
            script = f.read()
        result = executor.execute_script(script)
        print(f"Success: {result.success}")
        print(f"Output: {result.output[:500]}")
        print(f"Error: {result.error[:500]}")
        print(f"Files: {result.output_files}")

    elif args.generate_dataset:
        samples = generate_training_dataset(args.output_dir, args.num_samples)
        print(f"Generated {len(samples)} samples")

    else:
        parser.print_help()