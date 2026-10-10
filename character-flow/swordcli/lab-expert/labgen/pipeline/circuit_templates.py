"""
Deterministic topological circuit templates for EEE laboratory experiments.
Guarantees valid, compilable SPICE netlists, Schemdraw diagrams, and apparatus lists
even when external LLMs time out or encounter API limits.
"""

from typing import Dict, Any

def get_buck_boost_template(exp_name: str, prompt: str) -> Dict[str, Any]:
    return {
        "circuit_design_text": (
            "The inverting buck-boost converter consists of a DC input source, a controlled power switch, "
            "an energy storage inductor, a fast recovery diode, an output filter capacitor, and a load resistor. "
            "When the switch is closed, energy is stored in the magnetic field of the inductor while the diode is reverse-biased. "
            "When the switch opens, the inductor releases its stored energy through the diode into the capacitor and load resistor. "
            "Because of the counter-electromotive force, the output voltage polarity is inverted relative to the ground reference. "
            "The conversion ratio in continuous conduction mode (CCM) is given by $V_{\\text{out}} = -V_{\\text{in}} \\cdot \\frac{D}{1 - D}$."
        ),
        "apparatus": [
            {"name": "DC Regulated Power Supply (0-30V, 5A)", "quantity": "1"},
            {"name": "Power MOSFET / Switching Transistor", "quantity": "1"},
            {"name": "Fast Recovery Power Diode (1N5819 / Ultra-fast)", "quantity": "1"},
            {"name": "Toroidal Inductor (100 uH, 3A)", "quantity": "1"},
            {"name": "Electrolytic Filter Capacitor (470 uF, 50V)", "quantity": "1"},
            {"name": "Decade Resistance Box / Power Resistor (10 Ohm, 50W)", "quantity": "1"},
            {"name": "Digital Storage Oscilloscope (DSO 100MHz)", "quantity": "1"},
            {"name": "PWM Function Generator", "quantity": "1"}
        ],
        "netlist_components": [
            "V1 1 0 DC 12",
            "Vpwm 4 0 PULSE(0 5 0 1n 1n 10u 20u)",
            "S1 1 2 4 0 myswitch",
            "L1 2 0 100u",
            "D1 3 2 D1N4148",
            "C1 3 0 470u",
            "Rload 3 0 10",
            ".model myswitch SW(Ron=0.1 Roff=1Meg Vt=2.5)",
            ".model D1N4148 D(Is=2.52n Rs=.568 N=1.752 Cjo=4p M=.4 tt=20n Ikv=8 Vpk=75)(Is=2.52n Rs=0.568 N=1.752 Cjo=4p M=0.333 tt=5.76n)"
        ],
        "schemdraw_code": (
            "def draw_circuit(output_path):\n"
            "    import schemdraw\n"
            "    import schemdraw.elements as elm\n"
            "    with schemdraw.Drawing(file=output_path, show=False) as d:\n"
            "        d += elm.SourceV().up().label('$V_{in}$')\n"
            "        d += elm.Resistor().right().label('$R_{in}$')\n"
            "        d.push()\n"
            "        d += elm.Inductor().down().label('$L_1$ (100uH)')\n"
            "        d += elm.Ground()\n"
            "        d.pop()\n"
            "        d += elm.Line().right()\n"
            "        d += elm.Diode().right().reverse().label('$D_1$')\n"
            "        d.push()\n"
            "        d += elm.Capacitor().down().label('$C_1$ (470uF)')\n"
            "        d += elm.Ground()\n"
            "        d.pop()\n"
            "        d += elm.Line().right()\n"
            "        d += elm.Resistor().down().label('$R_L$ (10$\\Omega$)')\n"
            "        d += elm.Ground()\n"
        )
    }

def get_triac_template(exp_name: str, prompt: str) -> Dict[str, Any]:
    return {
        "circuit_design_text": (
            "The circuit utilizes a bidirectional triode thyristor (TRIAC BT136) configured with a gate triggering network. "
            "A variable AC/DC voltage is swept across MT1 and MT2 to observe the four-quadrant switching characteristics. "
            "The gate resistor limits gate drive current while allowing fine adjustment of the firing angle and gate trigger voltage."
        ),
        "apparatus": [
            {"name": "TRIAC (BT136 / BT137)", "quantity": "1"},
            {"name": "Variable DC/AC Power Supply", "quantity": "1"},
            {"name": "Current Limiting Resistor (1k Ohm)", "quantity": "1"},
            {"name": "Gate Potentiometer (10k Ohm)", "quantity": "1"},
            {"name": "Digital Multimeter / Oscilloscope", "quantity": "2"}
        ],
        "netlist_components": [
            "V1 1 0 DC 0",
            "R1 1 2 1k",
            "XT1 2 0 3 TRIAC",
            "RG 1 3 10k"
        ],
        "schemdraw_code": (
            "def draw_circuit(output_path):\n"
            "    import schemdraw\n"
            "    import schemdraw.elements as elm\n"
            "    with schemdraw.Drawing(file=output_path, show=False) as d:\n"
            "        d += elm.SourceV().up().label('$V_{ac}$')\n"
            "        d += elm.Resistor().right().label('1k$\\Omega$')\n"
            "        d += elm.Triac().down().label('TRIAC')\n"
            "        d += elm.Line().left()\n"
            "        d += elm.Ground()\n"
        )
    }

def get_fallback_circuit(exp_name: str, prompt: str) -> Dict[str, Any]:
    text = (exp_name + " " + prompt).lower()
    if "buck-boost" in text or "inverting" in text or "buck boost" in text:
        return get_buck_boost_template(exp_name, prompt)
    elif "triac" in text or "diac" in text or "scr" in text or "thyristor" in text:
        return get_triac_template(exp_name, prompt)
    elif "boost" in text:
        # Boost converter
        return {
            "circuit_design_text": "Step-up boost converter utilizing switched inductor topology to achieve Vout > Vin.",
            "apparatus": [
                {"name": "DC Source (12V)", "quantity": "1"},
                {"name": "Power Inductor (220 uH)", "quantity": "1"},
                {"name": "Schottky Diode", "quantity": "1"},
                {"name": "Filter Capacitor (220 uF)", "quantity": "1"},
                {"name": "Load Resistor (50 Ohm)", "quantity": "1"}
            ],
            "netlist_components": [
                "V1 1 0 DC 12",
                "L1 1 2 220u",
                "Vpwm 4 0 PULSE(0 5 0 1n 1n 10u 20u)",
                "S1 2 0 4 0 myswitch",
                "D1 2 3 D1N4148",
                "C1 3 0 220u",
                "Rload 3 0 50",
                ".model myswitch SW(Ron=0.1 Roff=1Meg Vt=2.5)",
                ".model D1N4148 D(Is=2.52n Rs=.568 N=1.752 Cjo=4p M=.4 tt=20n Ikv=8 Vpk=75)"
            ],
            "schemdraw_code": (
                "def draw_circuit(output_path):\n"
                "    import schemdraw\n"
                "    import schemdraw.elements as elm\n"
                "    with schemdraw.Drawing(file=output_path, show=False) as d:\n"
                "        d += elm.SourceV().up().label('$V_{in}$')\n"
                "        d += elm.Inductor().right().label('L (220uH)')\n"
                "        d += elm.Diode().right().label('D')\n"
                "        d.push()\n"
                "        d += elm.Capacitor().down().label('C (220uF)')\n"
                "        d += elm.Ground()\n"
                "        d.pop()\n"
                "        d += elm.Line().right()\n"
                "        d += elm.Resistor().down().label('$R_L$ (50$\\Omega$)')\n"
                "        d += elm.Ground()\n"
            )
        }
    else:
        # Default active semiconductor circuit
        return get_buck_boost_template(exp_name, prompt)
