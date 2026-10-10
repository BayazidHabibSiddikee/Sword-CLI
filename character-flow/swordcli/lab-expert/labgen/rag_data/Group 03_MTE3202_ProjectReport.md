Heaven’s light is our guide

RAJSHAHI UNIVERSITY OF ENGINEERING & TECHNOLOGY
Department of Mechatronics Engineering

|   Project Report Book |     |     |
| --------------------- | --- | --- |

| Course No.: MTE 3202  |     |     |
| --------------------- | --- | --- |
Course Title: Power Electronics and Drives Sessional
|     |     |     |
| --- | --- | --- |
|     |     |     |
Project Title:  Design of Boost Converter from 9V to 36V.

| Submitted By:          |          | Submitted To:        |
| ---------------------- | -------- | -------------------- |
|                        |          | Md. Firoj Ali        |
| Sumaiya Kabir Shashin  | 2008021  | Assistant Professor  |
Shajib Ahmed Turjo  2008022  Department of Mechatronics Engineering
Rajshahi University of Engineering &
| Sadik Sohan Ali  | 2008023  |     |
| ---------------- | -------- | --- |
Technology, Rajshahi-6204.
| Istiak Syfullah  | 2008024  |     |
| ---------------- | -------- | --- |
| Mamun Or Rashid  | 2008025  |     |
| Nazib Abrar      | 2008026  |     |
Sharafat Hussain Abhi
| S M Al Meraz  | 2008027  | Assistant Professor  |
| ------------- | -------- | -------------------- |
Md. Akkhor Hasan  2008028  Department of Mechatronics Engineering
Md. Emdadul Haque Emon  2008029  Rajshahi University of Engineering &
|     |     | Technology, Rajshahi-6204.  |
| --- | --- | --------------------------- |

Date of Submission: September 3, 2025

Chapter 1
Applying Power Electronics Knowledge
1.1 Introduction
A boost converter is a type of DC-to-DC converter that increases a low input voltage to a higher
output voltage. Its operation is based on the energy-storing property of an inductor. The circuit
consists of a single inductor, a controlled switch (MOSFET), a rectifier (diode), and a capacitor.
The conversion process is divided into two main stages, determined by the state of the switch.
1. Switch ON : When the switch is closed, the input voltage is applied across the inductor.
Current flows through the inductor, causing it to store energy in its magnetic field. The
diode is reverse-biased, isolating the output from the input, and the output capacitor
supplies power to the load.
2. Switch OFF : When the switch is opened, the inductor's magnetic field collapses, and
it releases the stored energy. To maintain current flow, the inductor's voltage reverses
polarity. This released energy, along with the input voltage, forward-biases the diode,
sending a combined, higher voltage to the output capacitor and the load.
In continuous-conduction mode, the ideal static conversion ratio is
𝑉 1
𝑜𝑢𝑡
=
𝑉 (1 − 𝐷)
𝑖𝑛
where D represents the duty cycle. Control, component ratings, and layout are crucial for
efficient and stable operation [1][3].
Step-up ratio calculation for the 9 V to 36 V target
▪ Target step-up ratio:
𝑉 9
𝑜𝑢𝑡= = 4
𝑉 𝑖𝑛 36
a 4:1 step-up.
▪ Ideal duty cycle at 9 V input:
𝑉 9
𝑜𝑢𝑡
𝐷 = 1 − = 1 − = 1 − 0.25 = 0.75
𝑉 36
𝑖𝑛
Current-mode control with slope compensation is used to maintain stable operation at duty
cycles above 50%. Device ratings, including the switch, diode/synchronous FET, inductor, and
capacitors, along with thermal margins, are selected to handle the higher voltages and currents
involved in this conversion [2]. Core sizing equations for the inductor, input/output capacitors,
sense and feedback resistors, as well as ripple and ripple-factor calculations, help set initial
values and define performance targets before making adjustments [3].
Beyond the power stage and control loop, the design focuses on electromagnetic compatibility
and practical manufacturability. High di/dt loop areas are minimized through careful PCB
layout. Snubbers and clamps help reduce ringing. Conducted and radiated emissions are
managed with filtering and measurement best practices.

1.2 Principle of Operation
The operation of the boost converter is governed by the fundamental energy storage and release
properties of an inductor. The circuit typically consists of four essential components:
1. An inductor (L) for energy storage.
2. A MOSFET (switch) for controlled energy transfer.
3. A diode (D) to enforce unidirectional current flow.
4. A capacitor (C) for voltage smoothing and load support.
The working cycle can be explained in two modes:
• Switch ON phase: When the MOSFET is turned ON, the input voltage is directly
applied across the inductor. The inductor resists the sudden change in current, resulting
in a gradual buildup of current and magnetic energy. During this period, the diode is
reverse biased, isolating the load from the input. The load is powered solely by the
capacitor.
• Switch OFF phase: When the MOSFET is turned OFF, the inductor’s magnetic field
collapses, releasing its stored energy. The polarity of the induced voltage reverses,
forward biasing the diode. The inductor current, combined with the source voltage,
charges the capacitor and supplies the load. The result is an output voltage greater than
the input voltage.
1.3 Mathematical Relation
In continuous conduction mode (CCM), where the inductor current never falls to zero, the
steady-state voltage conversion ratio is given as:
where:
• Vin = input voltage
• Vout = output voltage
• D = duty cycle (fraction of time switch is ON)
This equation shows that as the duty cycle increases, the output voltage rises. For instance, at
a duty cycle of 0.75 (75%), the output theoretically reaches four times the input. However, in
practical systems, factors such as diode forward voltage drop, MOSFET on-resistance, and
inductor resistance reduce the achievable output.
At higher duty cycles (>50%), stability becomes critical, requiring current-mode control with
slope compensation to prevent subharmonic oscillations.
Application of Knowledge in Design

The successful design of this project required the integration of multiple aspects of power
electronics theory into practical engineering decisions:
• Inductor and Capacitor Dynamics: Knowledge of inductor current ripple and
capacitor voltage ripple directly guided component sizing. By carefully selecting the
inductance and capacitance, we ensured continuous conduction and limited output
voltage ripple to within 1% of the rated voltage.
• Semiconductor Device Selection: Understanding the role of switching devices was
essential in choosing an appropriate MOSFET with low Rds(on) to minimize
conduction losses, and a Schottky diode with low forward voltage drop to enhance
efficiency.
• Thermal and EMI Considerations: Familiarity with electromagnetic interference
(EMI) sources and thermal effects allowed us to select switching frequencies and
component ratings that balance efficiency with safe operation. Proper PCB layout
practices, such as minimizing loop areas and providing adequate heat dissipation,
translated theoretical knowledge into a robust prototype.
1.4 Broader Implications
This project highlights how the application of core power electronics knowledge—from circuit
theory to practical component behavior—enables the realization of efficient, low-cost, and
scalable energy conversion solutions. It illustrates the link between theoretical analysis and
practical implementation, ensuring that abstract design equations become a working hardware
system capable of real-world performance.
Thus, the development of the 9 V to 36 V boost converter demonstrates not only the mastery
of fundamental concepts but also the capacity to apply them meaningfully in engineering
practice.

Chapter 2
Designing Engineering Solutions
Engineering design is the process of translating theoretical principles into practical, reliable,
and optimized solutions. In this project, the goal was to design a boost converter capable of
stepping up an input voltage of 9 V to a regulated 36 V output, operating at a switching
frequency of 32 kHz and supplying a 0.5 A load current.
The  design  process  involved  a  structured  approach:  defining  specifications,  performing
analytical calculations, selecting appropriate components, developing a control algorithm, and
validating the design through hardware implementation.
2.1 Boost Converter Design Calculations (f = 32 kHz)
1) System Specifications
| Input Voltage, V |     |     |     | 9 V  |     |     |
| ---------------- | --- | --- | --- | ---- | --- | --- |
in
| Output Voltage, V |     |     |     | 36 V  |     |     |
| ----------------- | --- | --- | --- | ----- | --- | --- |
out
| Switching Frequency, f  |     |     |     | 32 kHz  |     |     |
| ----------------------- | --- | --- | --- | ------- | --- | --- |
| Assumed Load Current, I |     |     |     | 0.5 A   |     |     |
out
| MOSFET          |     |     |     | IRFZ44N (N-channel)                         |     |     |
| --------------- | --- | --- | --- | ------------------------------------------- | --- | --- |
| PWM / Feedback  |     |     |     | Arduino NANO (Timer2, Pin 11) with voltage  |     |     |
divider feedback
Component shortlist used in the prototype: Arduino UNO ×1, IRFZ44N ×1, Schottky diode
(see note), Inductor ≈300–350 µH, Output Capacitor 50 V 470 µF ×1, Resistors 10 kΩ & 90
kΩ, Pins/Headers, Screw Terminal, Wires, PCB.
2) Key Design Targets
• Continuous Conduction Mode (CCM) operation at the nominal load.
• Output voltage ripple ≤ 1% (≈ 0.36 V) as a working target.
• Input ripple modest (≤ 0.3 V) to reduce source stress.
• Practical component ratings with ≥ 20–50% margin where possible.
3) Duty Cycle (D)
Ideal boost relation:
𝑉
𝑖𝑛
| 𝑉   | =   |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- | --- |
𝑜𝑢𝑡 (1−𝐷)
𝑉
|  ⇒𝐷 | = 1− | 𝑖𝑛   |     |     |     |     |
| --- | ---- | ---- | --- | --- | --- | --- |
𝑖𝑑𝑒𝑎𝑙
𝑉𝑜𝑢𝑡
| Using V |  = 9 V and V |     |  = 36 V:  D |  = 1 − 9/36 = 0.75 (75%).  |     |     |
| ------- | ------------ | --- | ----------- | -------------------------- | --- | --- |
|         | in           | out |             | ideal                      |     |     |
Including approximate drops (Schottky ~0.4 V, switch ~0.2 V):
𝑉 −𝑉 9−0.2
𝑖𝑛 𝑠𝑤𝑖𝑡𝑐ℎ
|     |     | 𝐷 ≈ 1− |     | = 1− | = 0.758 | = 75.8%  |
| --- | --- | ------ | --- | ---- | ------- | -------- |
𝑉 +𝑉 36+0.4
𝑜𝑢𝑡 𝑑𝑖𝑜𝑑𝑒
For V  = 30V: D=1-9/30=0.7(70%)
out

For V = 40V: D=1−9/40=0.775(77.5%) This corresponds to PWM values of approximately
out
179 to 198 (since analogWrite uses 0-255).
4) Inductor Design
The inductance  ripple current(∆𝐼 ) is calculated as :
𝐿
𝑉 ×𝐷
𝑖𝑛
|     | ∆𝐼 = |     |     |
| --- | ---- | --- | --- |
𝐿
𝑓 ×𝐿
Average inductor current in CCM equals input current: 𝐼 = 𝐼 = 𝐼𝑜𝑢𝑡
|     |     | 𝐿(𝑎𝑣𝑔) | 𝑖𝑛  |
| --- | --- | ------ | --- |
1−𝐷
1
| For V  = 40V (D = 0.775): ∆𝐼 | = ≈ | 4.44𝐴  |     |
| ---------------------------- | --- | ------ | --- |
out 𝐿(𝑎𝑣𝑔)
0.225
For V = 30V (D = 0.7): ∆𝐼 = 1 ≈ 3.33𝐴
out  𝐿(𝑎𝑣𝑔)
0.3
A typical design sets ΔIL to 20-40% of I .
L(avg)
Using 30% at Vout = 40V: ΔI =0.3×4.44≈1.33A
L
For simplicity, we target ΔI L =1A. Rearranging for L:
𝑉 ×𝐷
|     | 𝐿 = | 𝑖𝑛   |     |
| --- | --- | ---- | --- |
𝑓×∆𝐼
𝐿
V  = 9V, D = 0.775, f = 62500 Hz, ΔI =1A:
in L
| 9×0.775 | 6.975 |            |            |
| ------- | ----- | ---------- | ---------- |
| 𝐿 =     | =     | ≈ 0.1116𝑚𝐻 | = 111.6𝜇𝐻  |
| 62500×1 | 62500 |            |            |
Choosing a standard value, L=100μH is appropriate. Verify the ripple:
9×0.775
| ∆𝐼  | =   |     |     |
| --- | --- | --- | --- |
𝐿 62500×100×10−6
This is ≈25% of I , which is acceptable. The peak inductor current is:
Lavg
I =I +2ΔI =4.44+21.12≈5.0A
L(peak) Lavg L
Ensure the inductor is rated for at least 5A
5) Capacitance Calculation
The output voltage ripple (∆𝑉 ) is approximated as :
𝑜𝑢𝑡
𝐼 ×𝐷
𝑜𝑢𝑡
|     | ∆𝑉 = |      |     |
| --- | ---- | ---- | --- |
|     | 𝑜𝑢𝑡  | 𝑓 ×𝐶 |     |
Target ∆𝑉 = 0.4𝑉(1% of 40V) :
𝑜𝑢𝑡
|     | 𝐼   | ×𝐷  |     |
| --- | --- | --- | --- |
𝑜𝑢𝑡
|     | 𝐶 = |     |     |
| --- | --- | --- | --- |
|     | 𝑓   | ×∆𝑉 |     |
𝑜𝑢𝑡

| 𝐼 = 1𝐴, D=0.775, f=62500Hz, ∆𝑉 |     | =   | 0.4𝑉:  |     |
| ------------------------------ | --- | --- | ------ | --- |
𝑜𝑢𝑡 𝑜𝑢𝑡
|     |     | 1×0.775   | 0.775 |         |
| --- | --- | --------- | ----- | ------- |
|     |     | 𝐶 =       | =     | ≈ 31𝜇𝐹  |
|     |     | 62500×0.4 | 25000 |         |
A larger capacitor improves stability, using C=100 𝜇𝐹:
1×0.775
|     |     | ∆𝑉 = |     | ≈ 0.124𝑉  |
| --- | --- | ---- | --- | --------- |
𝑜𝑢𝑡 62500×100×10−6
This is ~0.31% of 40V, well below 1%. The capacitor should be rated for at least 50V.
6) Voltage Divider Design
The feedback voltage (V ) must be scaled to 0-5V for the Arduino’s ADC:
fb
| • V out  = 30V → V | fb  ≈ 3V (analogRead ≈ 614)      |     |     |     |
| ------------------ | -------------------------------- | --- | --- | --- |
| • V  = 40V → V     |  ≈ 4V (analogRead ≈ 818) using:  |     |     |     |
| out                | fb                               |     |     |     |
𝑅
|     |     | 𝑉 = 𝑉 | ×   | 2   |
| --- | --- | ----- | --- | --- |
𝑓𝑏 𝑜𝑢𝑡
𝑅 +𝑅
|                  |          |     | 1   | 2   |
| ---------------- | -------- | --- | --- | --- |
| Set V  = 4V at V |  = 40V:  |     |     |     |
| fb               | out      |     |     |     |
| 𝑅                | 4        |     |     |     |
2
= = 0.1
| 𝑅 +𝑅 | 40  |     |     |     |
| ---- | --- | --- | --- | --- |
1 2
| → 𝑅 = 9𝑅 |     |     |     |     |
| -------- | --- | --- | --- | --- |
| 1        | 2   |     |     |     |
Choose R2 = 10kΩ, R1 = 90kΩ. Verify:
10
| • V out  = 40V: V | fb =40× | =4V  |     |     |
| ----------------- | ------- | ---- | --- | --- |
100
10
| • V = 30V: V | =30× |  =3V  |     |     |
| ------------ | ---- | ----- | --- | --- |
| out          | fb   |       |     |     |
100
2.2 Algorithm
The control loop operated continuously. At each step, the feedback voltage was measured and
compared with the desired reference. If the actual feedback voltage was lower than expected,
the PWM duty cycle was incrementally increased, constrained within safe limits. Conversely,
if the actual feedback was higher than expected, the duty cycle was decreased accordingly.
When the actual and desired voltages were equal, the duty cycle remained unchanged. The
updated PWM value was then applied to the switching MOSFET. This closed-loop adjustment
ensured stable regulation of the output voltage.

The algorithm for the control of the pulse width modulation of the boost converter can be
described as:
1.  Initialization:
1.1 Set feedback as INPUT.
1.2 Set PWM as OUTPUT.
1.3 Configure PWM frequency.
1.4 Initialize pwm with starting duty cycle.

2. Control Loop (repeat indefinitely):
2.1 Read actualFeedback ← analogRead(feedback).
2.2 If desiredFeedback > actualFeedback:
a) Increase pwm ← pwm + 1.
b) Constrain pwm within [pwm_min, pwm_max].
2.3 Else if desiredFeedback < actualFeedback:
a) Decrease pwm ← pwm – 1.
b) Constrain pwm within [pwm_min, pwm_max].
2.4 Else: keep pwm unchanged.
2.5 Apply control: analogWrite(PWM, pwm).
3. Repeat Step 2 continuously until system is stopped.
2.3 Circuit Diagram
The proposed converter circuit consists of an IRFZ44N MOSFET as the switch, a Schottky
diode (1N5819), a wound-core inductor, and an electrolytic output capacitor. The input is a 9
V DC supply, boosted to 36 V through switching action. The Arduino Nano provides PWM
pulses at 32 kHz. The complete schematic of the designed converter is illustrated in Figure 1
[3].
9 v
4 0 0 u H
N M O S
S c h o t t k y
1 0 0 u F
Figure 2.1: Circuit diagram of the boost converter.
2.4 Component Selection
1. Arduino Nano
A compact microcontroller board based on ATmega328P, designed for embedded
applications. Works as the “brain” of your project, handling logic, control, and signal
processing [6].
Key Features:
I. Small, breadboard-friendly.
II. 14 digital I/O pins (6 PWM outputs).
III. 8 analog inputs.
IV. Operates at 5 V, clocked at 16 MHz.

Figure 2.2: Arduino Nano
2. IRFZ44N MOSFET
A powerful N-channel MOSFET designed for high current switching. Acts as an
electronic switch or amplifier. Controlled by the Arduino’s low-power output but can
handle large currents/voltages for motors, LEDs, or power circuits [7].
Key Features:
I. Drain–Source Voltage (Vds): 55 V.
II. Continuous Drain Current (Id): ~49 A.
III. Low Rds(on) (~0.017 Ω).
Figure 2.3: IRFZ44N MOSFET
3. 1N5819 Schottky Diode
A fast recovery diode with low forward voltage drops. Allows current to flow in only
one direction, protecting circuits from reverse polarity or serving in rectification [8].
Key Features:
I. Reverse Voltage: 40 V.
II. Forward Current: 1 A.
III. Very low forward voltage drops (~0.2–0.45 V).

Figure 2.4: 1N5819 Schottky Diode
4. Inductor 400 µH
Passive component that resists changes in current by storing energy in a magnetic field.
Stores energy and smooths current. When used in DC-DC converters, it helps regulate
and stabilize voltage [9].
Figure 2.5: Inductor 400 µH
5. Capacitor – 50 V, 470 µF
Electrolytic capacitor used for energy storage and filtering. Stores electrical energy
and releases it when needed, smoothing out voltage fluctuations [10].
Key Specs:
I. Voltage rating: 50 V.
II. Capacitance: 470 µF.
Figure 2.6: Capacitor – 50 V, 470 µF
6. Resistors
Basic components that resist the flow of current. Control current, divide voltages, or
set reference values [11].

Figure 2.7: Resistors
7. Screw Terminal
Connector with screw clamps for securing wires. Ensures a strong and removable
electrical connection [12].
Figure 2.8: Screw Terminal
8. Jumper Wires
Flexible insulated wires with connectors at the ends. Provide quick, temporary
connections between components without soldering.
Figure 2.9: Jumper Wires
2.5 PCB Design and Manufacturing
Figure 9 illustrates the schematic diagram of the boost converter circuit, meticulously crafted
within the Schematic Editor of KiCad software. The diagram is segmented into three distinct
stages: the DC Input, the Boost Stage, and the Header for I/O connections with an Arduino.
The DC Input section delivers a 9V input to the Boost Stage through a DC barrel jack, which
is then processed to step up the voltage. The Boost Stage incorporates key components such as
an IRFZ44N MOSFET, inductors (L1, L2, L3), diode (1N5819), capacitors (C1, C2), resistors
(R1, R2), and a PWM signal for precise control, enabling efficient voltage regulation. The

Header section facilitates seamless interfacing with an Arduino, providing feedback and power
connections to enhance the circuit's functionality and adaptability.
Figure 2.10: Schematic diagram of the boost converter circuit designed in KiCad Schematic Editor.
Figure 10 presents a comprehensive set of orthographic views of the printed circuit board
(PCB) visualized in KiCad's 3D viewer, offering a detailed perspective of the physical layout.
The leftmost image (a) depicts the top view without components, showcasing the bare PCB
design with its copper traces and solder pads. The rightmost image (b) displays the top view of
the PCB fully populated with components, highlighting the placement and orientation of the
inductors, capacitors, and other elements. Image (c) provides a side view, revealing the vertical
profile and layer arrangement of the PCB, while image (d) offers an orthographic view,
presenting a multi-angle representation that aids in verifying the overall structure and
component alignment of the boost converter PCB in the 3D viewer.
(a )
(c )
(b
(d
)
)
Figure 2.11: (a) Top view of the boost converter PCB without components, (b) Top view with
components, (c) Side view, and (d) Orthographic view of the boost converter PCB in KiCad 3D
viewer.

2.6 Experimental Setup
Figure 13 provides a detailed representation of the boost converter PCB, showcasing various
stages of its design and assembly process. Figure 13(a) presents the bottom view of the PCB
within KiCad's PCB Editor, where intricate traces and copper layers are clearly visible,
highlighting the electrical pathways. Figure 13 (b) displays the top view of the PCB without
components, offering a clean perspective of the board layout. Figure 13(c) shows the top view
of the actual manufactured PCB with components soldered in place, demonstrating the practical
assembly with capacitors, inductors, and other elements. Figure 13 (d) depicts the bottom view
of the soldered PCB, revealing the underside layout and solder joints, providing a
comprehensive view of the completed circuit.
(a )
(c )
(b
(d
)
)
Figure 2.12: (a) Bottom view in KiCad's PCB Editor, (b) Top view in KiCad 3D viewer, (c) Top
view, and (d) Bottom view of the manufactured boost converter PCB with soldered components
Figure 14 depicts the experimental setup for evaluating the performance of a boost converter
circuit. The setup includes a variable DC voltage source, configured to supply 9V to the boost
converter via a DC barrel jack, as indicated by the adapter power voltage display. An Arduino
Nano is integrated into the system, providing PWM signals to the boost converter while also
handling feedback control to regulate the output.

2.7 Project Finance
The financial planning of the project ensures that all required components are procured at a
reasonable price while maintaining quality and reliability. In laboratory projects such as this 9
V to 36 V Boost Converter, the cost mainly involves electronic components, prototyping
materials, and assembly consumables.
Table 1: Components used in designing boost converter and their market price
|                                                      | Component  | Qty  | Unit Price (BDT)  |
| ---------------------------------------------------- | ---------- | ---- | ----------------- |
| Arduino Nano                                         |            | 1    | 400               |
| IRFZ44N MOSFET                                       |            | 1    | 50                |
| Schottky Diode (1N5819)                              |            | 1    | 5                 |
| Inductor 400 µH (Radial)                             |            | 3    | 40                |
| Electrolytic Capacitor 100 µF, 50 V                  |            | 1    | 8                 |
| Resistors (1 kΩ, 9 kΩ)                               |            | 2    | 2                 |
| Pin Socket / Header 1×3                              |            | 1    | 10                |
| Screw Terminal 1×2 (5.08 mm)                         |            | 1    | 10                |
| Jumper Wire set (20 cm, 40 pcs)                      |            | 1    | 120               |
| Prototype PCB                                        |            | 1    | 280               |
| Consumables (solder, flux, wires, insulation, etc.)  |            |      | 100               |
| Contingency for damage/replacement (≈10%)            |            |      | 90                |
Components Subtotal                                                 1115

The components were chosen based on their electrical ratings, appropriateness for effective
boost converter functioning, and availability in local markets. Additional allowances were
included for prototyping tools, soldering consumables, and unforeseen replacements, which are
common in experimental setups.
2.8 Summary
This  chapter  demonstrated  the  systematic  engineering  design  process:  from  analytical
calculations to component selection and PCB layout. Each design choice duty cycle, inductor,
capacitor,  control  method  was  grounded  in  theory  but  adapted  to  practical  constraints,
showcasing the application of engineering judgment in power electronics design.
|     |     |     |     |
| --- | --- | --- | --- |

Chapter 3
Contextual Reasoning in Power Electronics
The design of a power electronic converter is not complete without rigorous validation and
contextual reasoning. A converter that performs well in equations must also be proven effective
through simulation, prototyping, and testing under real-world conditions. This chapter presents
the reasoning process followed to bridge theoretical design with practical outcomes for the 9
V to 36 V boost converter.
3.1 Simulation Analysis
The converter was modeled in LTspice using a 9 V source, IRFZ44N MOSFET, Schottky diode
(1N5819), 400 µH inductor, and a 100 µF capacitor. A duty cycle of 75% was applied. The
schematic of the circuit is shown in Figure 11.
Figure 3.1: LTspice schematic of the designed boost converter.
The simulated input and output voltages are shown in Figure 12(a) and Figure 12(b). The pwm
waveform, shown in Figure 12(c) and Figure 12(d), demonstrates a constant 9 V supply. In
contrast, the output waveform in Figure 12(e) shows a regulated output close to 36 V, validating
the theoretical design. A zoomed-in view of the output voltage is presented in Figure 12(f),
highlighting the ripple of approximately 200–300 mV. This value is within the design target of
less than 1% of the rated output voltage.
Reasoning: Simulation allowed prediction of converter performance without physical
constraints. Observing output ripple, switching transients, and inductor current confirmed that
design equations were correctly applied. It also served as a risk-mitigation step before investing
in hardware.

(a
(c
(e
)
)
)
(b )
(d )
(f)
Figure 3.2: (a) Simulated input and output voltages, (b) Zoomed-in simulated input and output
voltages, (c) Simulated input voltage waveform (d) Zoomed-in Simulated input voltage
waveform, (e) Simulated output voltage waveform and (f) Zoomed-in output voltage ripple at
~36 V
3.2 Experimental Validation
Once confidence was established in simulation, a printed circuit board (PCB) was fabricated
and populated with components. The experimental setup included:
1. DC power supply providing 9 V input
2. Arduino Nano generating PWM at 32 kHz
3. Boost converter circuit assembled on PCB
4. Multimeter and oscilloscope for measurement
Measured Outcomes:
The output voltage of the boost converter is measured using a multimeter, which registers a
value of 36.8V, closely aligning with the theoretical expected output, thereby validating the
circuit's design and functionality.
1. Output voltage: 36.8 V, closely matching theoretical value.
2. Efficiency: ~90% at 0.3 A load, decreasing to ~84% at 0.5 A due to conduction losses.
3. Output ripple: Minimum of ~0.18 V at mid-load, increasing to ~0.27 V at heavy load.

Figure 3.3: Experimental setup of the boost converter circuit with a variable DC voltage source,
Arduino Nano, and multimeter displaying an output of 36.8V.
The designed boost converter was implemented using an Arduino Nano as the PWM source,
an IRFZ44N N-channel MOSFET for switching, a Schottky diode (1N5819) for rectification,
and a 400 µH inductor. The output was stabilized using a 100 µF capacitor, while a voltage
divider was employed for feedback control. The converter was configured to step up an input
voltage of 9V to an output of approximately 36V, with a switching frequency of 32 kHz.
During testing, the circuit successfully achieved the targeted voltage amplification. With a load
current of 0.5 A, the converter maintained a stable output with minimal ripple, confirming that
the chosen inductor and capacitor values were appropriate for filtering. The Schottky diode
contributed to reducing forward voltage drop and improving overall efficiency compared to
conventional diodes, which is a common design practice in boost converters [1].
3.3 Efficiency and Ripple Characteristics
The efficiency of the system was observed to be within an acceptable range for a low-cost
prototype. Figure 15 illustrates the efficiency variation with respect to load current. The
converter achieved a maximum efficiency of around 90% at 0.3 A load, which gradually
decreased to 84% at 0.5 A load due to increased conduction losses in the MOSFET and
inductor. This behavior is consistent with theoretical expectations and findings reported in
literature on similar DC–DC converters [2].
Figure 3.4: Efficiency of the boost converter under varying load current.

Similarly, Figure 16 presents the output voltage ripple across different load conditions. Ripple
voltage was found to be relatively high at very light load (0.25 V at 0.1 A) and again at full
load (0.27 V at 0.5 A). However, ripple minimized around mid-load conditions (0.18 V at 0.3
A), reflecting the optimal filtering capability of the capacitor-inductor network. This non-linear
ripple pattern is typical of converters transitioning between continuous and discontinuous
conduction modes.
Figure 3.5: Output voltage ripple of the converter under varying load current.
In terms of dynamic response, the converter demonstrated good voltage regulation when
subjected to load variations. At lighter loads, the output voltage slightly overshot the target
value, which is characteristic of boost converters operating under discontinuous conduction
mode (DCM). At heavier loads, the voltage remained stable, although efficiency dropped
marginally.
Overall, the implemented boost converter met its design objective of stepping up the input
voltage from 9V to 36V. The system is a cost-effective and reliable solution for applications
requiring moderate power conversion, such as powering embedded systems, battery charging,
or renewable energy interfacing. Future improvements may include implementing a closed-
loop feedback algorithm using Arduino for more precise voltage regulation and testing with
different switching frequencies to optimize efficiency further.
Reasoning: These observations aligned with known converter behavior. Efficiency curves and
ripple patterns serve as diagnostic indicators of component sizing, switching frequency choice,
and filter effectiveness.
3.4 Dynamic Response
Load variation tests showed that:
• At light loads, the output voltage briefly overshot before stabilizing.
• At heavy loads, the output voltage remained stable, but efficiency reduced slightly.
Reasoning: Overshoot at light loads is typical of converters entering DCM, where energy
storage per cycle decreases. Stability under heavy loads demonstrated the robustness of the
inductor and MOSFET design, though it highlighted the need for thermal management.

3.5 Discussion
By combining simulation predictions, experimental results, and theoretical expectations,
the following insights were gained:
1. Theory–Practice Agreement: Voltage gain matched calculations, proving the
accuracy of duty cycle and component selection.
2. Practical Deviations: Ripple and efficiency variations revealed the influence of real-
world non-idealities (ESR of capacitors, MOSFET on-resistance, diode recovery
characteristics).
3. Design Refinement Needs:
• Using low-ESR capacitors could further reduce ripple.
• Optimized MOSFETs and synchronous rectification could improve
efficiency.
• Closed-loop digital control could address overshoot in light-load conditions.
Contextual reasoning thus played a crucial role, ensuring that the converter was not only
theoretically sound but also practically reliable and capable of real-world application.
3.6 Summary
This chapter demonstrated that engineering design is validated by contextual reasoning
integrating theoretical equations, simulated predictions, and experimental outcomes. By
analyzing discrepancies and understanding their causes, the project team ensured that the boost
converter not only achieved its design objectives but also offered valuable insights for future
optimization.

Chapter 4
Sustainable Applications and Environmental Impact
4.1 Purpose and sustainability lens
This chapter evaluates the 9 V → 36 V boost converter through a sustainability lens: how
efficiently it uses energy, how its material choices affect the environment across its life cycle,
and where it can be deployed to create meaningful social benefit with minimal ecological cost.
The analysis builds on the converter’s measured behavior (e.g., 36.8 V output, 84–90%
efficiency depending on load) and the specific design choices made in hardware and control
(IRFZ44N switch, Schottky rectifier, ~400 µH inductor, Arduino-based PWM around 32 kHz).
4.2 Energy efficiency and avoided losses
4.2.1 Measured baseline
At a nominal 36 V, 0.5 A load (≈18 W), the prototype achieved ~84% efficiency; peak
efficiency was ~90% around 0.3 A. Output ripple ranged ~0.18–0.27 V in hardware, aligning
with ~0.2–0.3 V predicted by simulation. These figures anchor the sustainability assessment.
4.2.2 Quantifying loss and yearly impact
• At 0.5 A (18 W load) and 84% efficiency:
Power lost as heat =21.43−18≈3.43 W
• If improved to 90% efficiency at the same load:
• Per-unit annual savings (example duty cycle 4 h/day):
In a fleet of 1,000 units, that’s ≈2.1 MWh/year avoided—purely from tightening conversion
losses.
These numbers matter because most real-world use cases (lighting, small DC distribution,
instrumentation) involve daily operation; even sub-watt improvements accumulate
meaningfully over time.
4.3 Design decisions that drive sustainability
4.3.1 Power stage topology and components
• Diode vs. synchronous rectification. The current design uses a Schottky (≈0.2–0.45 V
drop), which is simple and robust but dissipates I × V every cycle. Replacing it with a
f
synchronous MOSFET can cut rectification loss, improving efficiency at medium to

heavy loads and reducing thermal stress extending component life and lowering
embodied impacts from replacements.
• Switch selection. The IRFZ44N’s low R DS is a good starting point. A cooler-running
switch reduces conduction loss I2R shrinking the heatsink/copper area needed and
improving long-term reliability.
• Magnetics and capacitors. The prototype employed ~400 µH inductance and a 50 V
electrolytic output capacitor. Choosing inductors with low DC resistance (Litz or larger
wire gauge) and 105 °C, low-ESR capacitors (or polymer caps where feasible) lowers
ripple and temperature rise—directly improving efficiency and lifetime.
4.3.2 Control strategy and switching frequency
The Arduino-based feedback loop at ~32 kHz is accessible and easily tunable, but the
microcontroller’s quiescent usage and gate-drive style add fixed overhead. A dedicated PWM
controller with low quiescent current can reduce idle draw, while carefully optimizing
frequency trades switching losses against magnetic/capacitor size and ripple. The team’s
demonstrated closed-loop regulation and ripple control form a solid base for such refinement.
4.3.3 Thermal management = longevity
Lower thermal stress extends component lifetime, reducing premature e-waste. Practical steps
include: wide copper pours for heat spreading, short high-di/dt loops, snubbers to tame ringing,
and verifying inductor saturation current with margin. These were already considered in
layout/EMI choices; further optimization compounds both efficiency and reliability gains.
4.4 Sustainable applications (where this boost helps most)
1. High-efficiency DC lighting strings. Boosting to 30–40 V simplifies driving series
LED strings (with a downstream constant-current stage), common in task lighting and
street/area lights. The prototype’s regulated 36–40 V capability and low ripple make it
a suitable front-end for efficient, flicker-free lighting.
2. Battery-backed DC micro-systems. Small DC microgrids, lab benches, or educational
kits can standardize on a 36 V bus for low losses over wiring; the converter raises
modest sources (e.g., 9 V adapters) to that level with measured stability (36.8 V
observed).
3. Edge/IoT instrumentation. Many sensors and actuators are more efficient when
powered from a higher DC rail feeding localized point-of-load regulators. The
converter’s predictable behavior across load steps (overshoot control at light load,
stable at heavy load) supports such use.
Why these are “sustainable”: A higher-voltage DC backbone reduces I²R distribution losses;
efficient conversion minimizes source capacity and storage required; and stable regulation
protects downstream devices, extending their service life—collectively lowering total material
and energy footprints.

4.5 Life-cycle view: materials, manufacturing, and end-of-life
4.5.1 Bill-of-materials hotspots
• Copper and ferrite (inductor): Copper extraction and smelting are energy-intensive;
right-sizing the inductor (avoiding over-design), selecting low-loss cores, and ensuring
adequate saturation current reduce rework and scrap.
• Electrolytic capacitor: Electrolyte dry-out is a common field-failure mode. Selecting
105 °C, long-life, low-ESR parts (or polymer) and keeping them cool extends service
life—fewer replacements mean less material throughput over the product lifetime.
• PCB and solder: Prefer lead-free solder and halogen-free laminates when available.
Good manufacturability (clearances, pad sizing, thermal reliefs) lowers scrap and
rework.
4.5.2 Design for disassembly (DfD)
• Use screws and headers, not glue, for major subassemblies; expose test points; label
parts/values on silkscreen. This makes repair and part harvesting easier. The project’s
use of pluggable headers and screw terminals is aligned with DfD principles.
4.5.3 End-of-life (EoL) guidance
• Mark plastic types and indicate copper weights where possible.
• Provide a one-page EoL sheet: how to depopulate the board, remove the electrolytic
capacitor, and recycle copper-rich magnetics.
• Where regulations apply, conform to RoHS-type substance restrictions and WEEE-
style take-back practices (or the local equivalents).
4.6 Environmental risk reduction through performance tuning
Linking measured behavior to environmental outcomes:
• Ripple control: The prototype already meets a ≤1% ripple target in design and ~0.18–
0.27 V in tests; lowering ripple further can improve LED efficacy and reduce
electromagnetic interference, indirectly saving energy in downstream stages and
minimizing the need for oversized filters.
• Light-load behavior: Addressing the brief overshoot in light-load/near-DCM
transitions (e.g., with slope compensation, adaptive dead-time, or a small preload)
prevents stress on sensitive loads, reducing early-life failures and replacements.
• Thermal headroom: The observed efficiency droop at heavier loads suggests
conduction and thermal losses dominate; incremental improvements lower R
DS(on)
synchronous rectification, tighter loop areas, cooler caps) directly cut waste heat and
extend lifespan.

4.7 Practical roadmap for greener iterations
1. Move to synchronous rectification at the diode position; target ≥2 % absolute
efficiency gain at 0.5 A.
2. Select low-RDC magnetics and verify I ≥ peak current with ≥30% margin to avoid
sat
saturation-induced losses.
3. Adopt 105 °C, low-ESR (or polymer) output caps; validate ripple ≤0.5% under worst
case.
4. Controller optimization: compare Arduino vs. low-Iq controller IC for standby;
measure quiescent draw and step-load response at 32 kHz.
5. Layout refinements: minimize high-di/dt loop area (switch–diode–inductor–cap),
widen power traces, and add snubbers where needed to reduce ringing/EMI (less
radiated energy = less wasted energy).
6. Documentation for repair and EoL: publish a one-page service map (fuse, MOSFET,
diode, inductor, cap locations, test pads), and a recycling note for labs/workshops using
the board.
4.8 Socio-economic context and accessibility
The bill-of-materials selected was cost-aware and locally available, which is critical for
adoption in educational labs and community projects—places where sustainability is as much
about access and maintainability as it is about absolute peak efficiency. The modest cost and
familiar parts (Arduino Nano, IRFZ44N, common Schottky and passives) make repair and
replication feasible, keeping products in service longer and reducing e-waste.
4.9 Summary
The prototype already demonstrates responsible energy conversion—stable 36–40 V
regulation, acceptable ripple, and up to 90% efficiency at mid-load—forming a solid platform
for sustainable deployment. Targeted improvements (synchronous rectification, thermal and
layout tuning, long-life components, and low-Iq control) can abate ~1.4 W of loss at full load
per unit, saving ≈2.1 kWh/year in a typical daily-use scenario, while also extending service life
and easing end-of-life recovery. In applications like efficient DC lighting, small DC
distribution, and robust lab/educational systems, these changes compound into lower operating
energy, fewer replacements, and a lighter environmental footprint—without sacrificing the
accessibility and practicality that made this design succeed in the first place.

Chapter 5
Effective Individual and Team Performance
5.1 Introduction
Engineering projects such as the design and implementation of a Boost Converter are rarely
the outcome of a single person’s effort. They require collaboration, planning, division of
responsibilities, and communication to successfully move from theoretical design to
experimental verification. This chapter reflects on how individual contributions and teamwork
shaped the outcome of this sessional project, highlighting both technical and interpersonal
aspects.
5.2 Individual Contribution
Each team member applied their academic knowledge, problem-solving skills, and practical
expertise in specific areas of the project. Major individual contributions included:
Contribution Members
Circuit Analysis and Simulation 2008025, 2008024
Hardware Design and Component Selection 2008027, 2008028, 2008029
Microcontroller Programming 2008022, 2008026
Hardware Assembly and Testing 2008021, 2008023
Documentation and Report Writing 2008025, 2008024
• Circuit Analysis and Simulation – Some members took the lead in analyzing the boost
converter’s operation, deriving equations for voltage gain, duty cycle, ripple, and
efficiency. They also validated these with MATLAB/Simulink simulations.
• Hardware Design and Component Selection – Another group member focused on
selecting suitable components (MOSFET, diode, inductor, capacitor) considering
availability, ratings, and cost. For example, choosing the IRFZ44N ensured low
conduction loss, while a Schottky diode minimized switching loss.
• Microcontroller Programming – The Arduino-based PWM control was coded, tested,
and debugged by individuals skilled in embedded systems, ensuring duty cycle
modulation and stable output regulation.
• Hardware Assembly and Testing – Building the physical circuit on PCB/protoboard,
handling soldering, connections, and measurement setup required careful effort to
minimize errors and ensure safety.
• Documentation and Report Writing – Finally, structuring the project report,
preparing diagrams, and analyzing results were handled by members with strong
writing and presentation skills.

These contributions demonstrate how individual strengths complemented each other in
achieving the overall objective.
5.3 Team Coordination and Collaboration
The success of the project relied on effective team dynamics. Key aspects were:
• Task Division – The project was divided into simulation, hardware, control, and
documentation stages, with clear ownership of tasks.
• Communication – Regular discussions ensured synchronization between simulation
results and hardware implementation. Misalignments (e.g., ripple discrepancies
between simulation and hardware) were quickly addressed.
• Problem Solving Together – Issues such as overshoot at light load, thermal
management of MOSFET, and PCB layout optimization were brainstormed
collectively, leading to better solutions than working individually.
• Peer Learning – Team members with stronger programming or circuit design skills
guided others, creating a collaborative learning environment.
5.4 Challenges in Teamwork and Their Resolution
• Component Availability: Sometimes preferred components were not available in the
local market. The team collectively decided on suitable alternatives after reviewing
datasheets.
• Time Constraints: Managing simulation, hardware, and documentation under
academic deadlines required careful scheduling. Tasks were parallelized to save time.
• Measurement Errors: During initial hardware testing, mismatched probe connections
gave inconsistent results. By cross-checking as a team, these errors were eliminated.
• Workload Balance: Ensuring all members contributed fairly was achieved through
transparent discussions and rotating responsibilities.
5.5 Skills Developed
Working as a team in this project enhanced both technical and soft skills:
• Technical Skills:
o Power electronics circuit design and verification.
o Arduino-based PWM implementation.
o Oscilloscope and multimeter usage for ripple and efficiency measurement.
o PCB/protoboard assembly techniques.
• Soft Skills:
o Leadership in assigning and managing tasks.
o Communication and documentation.

o Time management under tight deadlines.
o Conflict resolution and consensus building.
5.6 Summary
The Boost Converter project showcased not only technical knowledge but also the importance
of teamwork, collaboration, and effective communication. Each member’s individual effort
combined through shared responsibility and peer support resulted in a successful design,
simulation, and hardware demonstration. The experience reflects how real-world engineering
solutions depend equally on human coordination and technical excellence, preparing the team
for future professional challenges.

Reference:
[1] R. W. Erickson and D. Maksimović, Fundamentals of Power Electronics, 2nd ed. New
York, NY, USA: Springer, 2001. doi: 10.1007/b100747.
[2] Pressman, K. Billings, and T. Morey, Switching Power Supply Design, 3rd ed. New
York, NY, USA: McGraw-Hill, 2009.
[3] Texas Instruments, Understanding Boost Power Stages in Switchmode Power Supplies
(SLVA061). Accessed: Aug. 17, 2025. [Online]. Available:
https://www.ti.com/lit/an/slva061/slva061.pdf
[4] M. H. Rashid, Power Electronics: Circuits, Devices, and Applications, 4th ed. London,
U.K.: Pearson, 2013.
[5] B. K. Bose, “Global energy scenario and impact of power electronics in 21st century,”
IEEE Transactions on Industrial Electronics, vol. 60, no. 7, pp. 2638–2651, Jul. 2013.
[6] D. Mellis, “Arduino Nano,” Flickr, Jul. 12, 2010. Accessed: Aug. 17, 2025. [Online].
Available: https://en.wikipedia.org/wiki/File:Arduino_Nano.jpg
[7] MifraElectronics, “IRFZ44N MOSFET,” MifraElectronics.com. Accessed: Aug. 17,
2025. [Online]. Available: https://mifraelectronics.com/product/irfz44n-mosfet/
[8] ElProCus, “1N5819 Schottky diode: Pin configuration & its applications,” ElProCus.
Accessed: Aug. 17, 2025. [Online]. Available: https://www.elprocus.com/1n5819-
schottky-diode/
[9] Udvabony, “100 µH radial inductor (100 µH, through-hole lead-type),” Udvabony.com.
Accessed: Aug. 17, 2025. [Online]. Available: https://udvabony.com/product/100uh-
lead-inductor-810mm/
[10] Udvabony, “470 µF 50 V electrolytic capacitor,” Udvabony.com. Accessed:
Aug. 17, 2025. [Online]. Available: https://udvabony.com/product/470uf-50v-
electrolytic-capacitor/
[11] TechieSMS, “10 kΩ, 1/4 W, ±1 % resistor,” TechieSMS.com. Accessed: Aug.
17, 2025. [Online]. Available: https://techiesms.com/product/10k-ohm-1-4-watt-
resistor-1-tolerance/
[12] Tianmao, “40x 2 Poles Blue 2 Pins Screw Terminal Block Connector Pitch
Panel PCB Mount New,” eBay, Aug. 3, 2025. Accessed: Aug. 17, 2025. [Online].
Available: https://www.ebay.com/itm/284157410591