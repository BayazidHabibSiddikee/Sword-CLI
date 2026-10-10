Assignment - 01
Analogy & Mathematical Modeling of Boost and Buck-Boost Converters
Introduction
Both Boost and Buck-Boost converters are fundamental DC-DC power converter topologies. They
utilize the exact same four core components: an inductor (L), a controlled semiconductor switch (S), a
diode (D), and an output capacitor (C). The primary distinction between the two lies purely in their
circuit topology—specifically, how these elements are arranged relative to the source and the load.
1. Basic Circuit Configuration & Simulation
Boost Converter
The Boost converter acts as a step-up converter. The inductor is located at the input side, leading to
continuous input current.
Vin ──L──┬────►|──── Vo │ D S │ │ C ── R GND GND
Figure 1: Boost Converter Simulation (using 555 Timer PWM configuration)
As observed in the simulation (Figure 1), the switching action of the MOSFET causes the inductor to
charge during the ON-state and discharge into the output capacitor during the OFF-state, producing a
voltage greater than the input.
Assignment 01 Page 1 of 4

Buck-Boost Converter
The Buck-Boost converter can both step up and step down the input voltage. Its topology features the
switch in series with the source, and the inductor placed in parallel with the load. This arrangement
results in an inverted output voltage polarity.
Vin ──S──┬─── (Vo, inverted polarity) │ L │ ►|── C ── R D
Figure 2: Buck-Boost Converter Simulation (Demonstrating inverted negative output voltage)
Figure 2 verifies the characteristic inverting nature of the Buck-Boost topology, where a positive input
generates a regulated negative output voltage relative to a common ground.
2. Analogy Between Boost and Buck-Boost
Feature Boost Converter Buck-Boost Converter
Output Polarity Same as input (Positive) Inverted (Negative)
Output Magnitude Always ≥ V (Step-up only) Can be < or > V (Step up/down)
in in
Inductor during Connected directly to load Isolated from source, dumps into load
OFF-state (direct energy transfer) (indirect/energy-transfer type)
Voltage Gain
V / V = 1 / (1 - D) V / V = D / (1 - D)
o in o in
Formula
Key Mathematical Analogy: The Buck-Boost transfer function is conceptually the mathematical
productoftheBuckconvertergainandtheBoostconvertergain:
Assignment 01 Page 2 of 4

3. Mathematical Model — Boost Converter
The system is modeled by analyzing the two distinct topological states during one switching period T,
governed by the duty cycle D.
Switch ON (0 → DT): The inductor charges from the source; the diode is reverse biased; the
capacitor alone supplies the load.
di dv v
L C C
L = V C = -
in
dt dt R
Switch OFF (DT → T): The inductor discharges through the diode into the load.
di dv v
L C C
L = V - v C = i -
in C L
dt dt R
State-Space Averaged Model (weighted by d and 1−d):
di
L
L = V - (1 - d)v
in C
dt
dv v
C C
C = (1 - d)i -
L
dt R
Steady-State Solution (Applying volt-second and charge balance, derivatives = 0):
V o 1 V o
= I =
L
V 1 - D R(1 - D)
in
4. Mathematical Model — Buck-Boost Converter
Switch ON (0 → DT): Inductor charges directly from V ; diode blocks; capacitor supplies load.
in
di dv v
L C C
L = V C = -
in
dt dt R
Switch OFF (DT → T): Inductor discharges through diode into the (inverted-polarity) output.
di dv v
L C C
L = -v C = i -
C L
dt dt R
State-Space Averaged Model:
di
Assignment 01 Page 3 of 4

5. Solar (PV) Plant Application — Why Buck-Boost is Preferred
The Problem: A Photovoltaic (PV) panel's terminal voltage (V ) swings significantly with changes
pv
in solar irradiance and temperature. Depending on environmental conditions, V  may rise above or
pv
drop below the required battery or DC-bus voltage. A simple Buck or simple Boost converter cannot
handle  bidirectional  voltage  regulation.  The  Buck-Boost  converter  naturally  accommodates  both
scenarios.
PV Source Model (Single-Diode Equivalent):
|     |        | q(V  + I       | R )         | V  + I R |
| --- | ------ | -------------- | ----------- | -------- |
|     |        | pv             | pv s        | pv pv s  |
|     | I  = I |  - I  [ exp (  |  ) - 1 ] -  |          |
|     | pv ph  | 0              |             |          |
|     |        | nkT            |             | R        |
sh
Coupling the PV source to the Buck-Boost converter (MPPT interface):
| Assuming lossless power conversion (P |     |  = P ), we know: |     |     |
| ------------------------------------- | --- | ---------------- | --- | --- |
in out
2
V
o
|     |     | V  · I  =  |     |     |
| --- | --- | ---------- | --- | --- |
|     |     | pv pv      |     |     |
R
load
Since V  = [D / (1 - D)] · V , the effective input resistance (R ) seen by the PV panel becomes:
| o   | pv  |            |       | in  |
| --- | --- | ---------- | ----- | --- |
|     |     | V          | 1 - D |     |
|     |     | pv         |       |  )2 |
|     |     | R  =   = R |  · (  |     |
|     |     | in load    |       |     |
|     |     | I          | D     |     |
pv
This equation forms the core of the solar-plant MPPT (Maximum Power Point Tracking) model. By
dynamically adjusting the duty cycle D (using algorithms such as Perturb & Observe or Incremental
Conductance), the controller continuously reshapes the apparent input resistance R . It forces it to
in
precisely match the PV panel's optimum resistance R  = V  / I , ensuring the panel operates at
|     |     |     | mpp mpp | mpp |
| --- | --- | --- | ------- | --- |
its peak efficiency irrespective of load variations or changing weather conditions.
      PV Panel(Vpv, Ipv) → Buck-Boost Converter → Battery/DC Bus (Vo)
↑ MPPT Controller (Adjusts Duty Cycle D)

6. Conclusion
While Boost and Buck-Boost converters share identical fundamental building blocks, the strategic
Assignment 01 Page 4 of 4