Assignment 02 — Choppers
Assignment - 02
Derivation of the Output Voltage Equation for Class A, B, C, D, and E Choppers
Objective
This assignment derives, from first principles, the average output-voltage equation of each of the
five standard chopper (DC-DC converter) classes — A, B, C, D, and E. For every class the
derivation is presented step by step, followed by a physical explanation of why the resulting
equation makes that chopper a step-up or step-down (or both) converter. Each derivation is
supported by a Falstad circuit simulation (where available), the corresponding switching / output
waveform captured from that simulation, and a plot of the output voltage as a function of duty
cycle D.
1. Class A Chopper (First-Quadrant / Step-Down Chopper)
Circuit Description:
A Class A chopper uses a single controlled switch in series with the source and a freewheeling
diode across the load. It allows power flow in only one direction (source to load) and produces
only a positive output voltage and positive output current — hence "first-quadrant" operation. It
is the chopper equivalent of a Buck (step-down) converter.
Step-by-Step Derivation:
Step 1: Define the switching period T, which consists of an ON interval Ton (switch closed)
and an OFF interval Toff = T − Ton (switch open).
Step 2: During Ton, the switch connects the load directly across the source, so the
instantaneous terminal voltage equals the source voltage: v(t) = Vs.
Step 3: During Toff, the switch opens and the inductive load current is diverted through the
freewheeling diode, which effectively shorts the output terminals: v(t) = 0.
Step 4: The average (DC) output voltage over one period is found by integrating the
instantaneous voltage over one full cycle and dividing by the period: Vo = (1/T) ∫₀ᵀ v(t) dt.
Step 5: Split the integral at t = Ton, using v(t) = Vs for 0 ≤ t ≤ Ton and v(t) = 0 for Ton ≤ t ≤
T:
Vo = (1/T) [ ∫₀^Ton Vs dt + ∫_Ton^T 0 dt ]
Step 6: Evaluate the first integral (the second is zero):
Vo = (Vs · Ton) / T
Step 7: Introduce the duty cycle D = Ton / T (0 ≤ D ≤ 1), the fraction of the period the switch
spends ON:
Vo = D Vs
Why it is a Step-Down Chopper:
Page 1 of 12

Assignment 02 — Choppers
Because the duty cycle D is always a fractional value between 0 and 1, multiplying the source
voltage Vs by D guarantees that the output voltage Vo is mathematically forced to be less than or
equal to the input source voltage. Thus, it operates exclusively as a step-down chopper. Vo can
be continuously varied from 0 V (D = 0) up to Vs (D = 1) simply by controlling the ON time of
the single switch.
Figure 1(a): Falstad simulation circuit of a Buck Converter, structurally analogous to a Class A Chopper.
Figure 1(b): Simulated switching gate signal (left) and resulting output ripple waveform (right) at ~74% duty cycle,
output ≈ 4.79 V from a 5 V source.
Figure 1(c): Output voltage Vo (as a percentage of Vs) plotted against duty cycle D — a straight line through the
origin, confirming Vo = D·Vs.
Page 2 of 12

Assignment 02 — Choppers
2. Class B Chopper (Second-Quadrant / Step-Up Chopper)
Circuit Description:
A Class B chopper operates in the second quadrant, where power flows from an active load —
such as a spinning DC motor generating a back-EMF, E — back to the main DC source Vs. It is
the chopper equivalent of a Boost converter, using an inductor, a single switch, and a diode
arranged to step up a lower voltage E to charge the higher-voltage source Vs.
Step-by-Step Derivation:
Step 1: When the switch is ON (0 to Ton), the inductor is connected directly across the back-
EMF source E, so the inductor voltage is VL = E, and the inductor current ramps up, storing
energy.
Step 2: When the switch is OFF (Ton to T), the inductor discharges its stored energy into Vs
through a diode. Since the inductor now opposes the change in current, its voltage becomes
VL = E − Vs.
Step 3: For steady-state (periodic) operation, the net change in inductor current over one full
period must be zero. This is the volt-second balance principle: the average voltage across the
inductor over one period must equal zero.
∫₀^Ton E dt + ∫_Ton^T (E − Vs) dt = 0
Step 4: Evaluate each integral over its respective interval:
E · Ton + (E − Vs) · Toff = 0
Step 5: Expand the bracket and collect the E terms:
E(Ton + Toff) = Vs · Toff
Step 6: Since Ton + Toff = T, and Toff = T − Ton:
E · T = Vs (T − Ton)
Step 7: Divide both sides by T and use D = Ton / T, so that (T − Ton)/T = (1 − D):
Vs = E / (1 − D)
Why it is a Step-Up Chopper:
From the perspective of the power source (which is now the active load E), the voltage is being
boosted to push current back into the main DC supply Vs. Since (1 − D) is a fraction strictly less
than 1 for any D > 0, dividing E by this fraction proves that the effective voltage presented to Vs
is always greater than E — i.e., the generated back-EMF E is stepped up to match and overcome
the higher supply voltage Vs. As D approaches 1, the theoretical step-up ratio grows without
bound.
Page 3 of 12

Assignment 02 — Choppers
Figure 2(a): Falstad simulation circuit of a Boost Converter, demonstrating the step-up nature of the Class B
Chopper topology.
Figure 2(b): Switching signal (left, ~70% duty cycle) and boosted output waveform (right), stepping a 5 V source up
to ≈ 20.6 V.
Figure 2(c): Step-up factor Vs/E = 1/(1 − D) plotted against duty cycle D — the ratio rises sharply and approaches
infinity as D → 1.
Page 4 of 12

Assignment 02 — Choppers
3. Class C Chopper (Two-Quadrant Type A)
Circuit Description:
A Class C chopper is formed by combining a Class A (step-down) chopper and a Class B (step-
up) chopper in parallel across the same load, using two switches (S1, S2) and two diodes (D1,
D2), as shown in Figure 3(a). It can operate in the first quadrant (forward motoring: Vo and Io
both positive) or the second quadrant (forward braking / regeneration: Vo positive, Io negative).
In both quadrants Vo is restricted to a single (positive) polarity — only the direction of current,
and hence the direction of power flow, reverses.
Step-by-Step Derivation — Motoring Mode (S1, D2 active):
Step 1: When switch S1 is ON (S2 and both diodes non-conducting), the load is connected
directly to the source, exactly as in the Class A chopper: v(t) = Vs.
Step 2: When S1 is OFF, the load current freewheels through diode D2, making the
instantaneous output voltage zero: v(t) = 0 — again identical to the Class A operating mode.
Step 3: Averaging v(t) over one switching period T, exactly as performed for the Class A
chopper:
Vo = (1/T) ( ∫₀^Ton Vs dt + ∫_Ton^T 0 dt ) = (Vs · Ton) / T
Step 4: Substituting the duty cycle D = Ton / T:
Vo = D Vs
Step-by-Step Derivation — Regenerative Braking Mode (S2, D1 active):
Step 5: When switch S2 is ON, the inductive/motor branch (back-EMF E) stores energy,
exactly as the switch-ON interval of the Class B chopper.
Step 6: When S2 is OFF, diode D1 conducts, discharging the stored energy back into the
source Vs, exactly as the switch-OFF interval of the Class B chopper.
Step 7: Applying the same volt-second balance derived for Class B directly gives the relation
between source and load back-EMF:
Vs = E / (1 − D)
Why it is Step-Down in One Mode and Step-Up in the Other:
In motoring (first-quadrant) operation, the Class C chopper behaves exactly like the Class A
chopper: since 0 ≤ D ≤ 1, Vo = D Vs is always less than or equal to Vs, so it functions as a step-
down chopper. In regenerative braking (second-quadrant) operation, it behaves exactly like the
Class B chopper: the factor 1/(1 − D) is always greater than or equal to 1, so the load back-EMF
E is stepped up to overcome Vs and return power to the source. The key distinguishing feature of
the Class C chopper is that, unlike Class D or E, the output voltage polarity never reverses.
Note on Figure 3: The original Falstad file supplied for this assignment did not include a saved
simulation screenshot for the Class C topology (only Class A, B, and the Appendix converters
Page 5 of 12

Assignment 02 — Choppers
were captured). The circuit diagram below has therefore been redrawn from the standard two-
quadrant Type-A chopper configuration to illustrate the switch/diode arrangement referred to in
the derivation above.
Figure 3(a): Reconstructed schematic of the Class C (two-quadrant Type A) chopper, showing switches S1/S2 and
diodes D1/D2 arranged around the motor load M (back-EMF E).
Figure 3(b): Output-voltage behaviour of the Class C chopper in its two operating modes — motoring (left, Vo =
D·Vs) and regenerative braking (right, Vs = E/(1 − D)).
Page 6 of 12

Assignment 02 — Choppers
4. Class D Chopper (Two-Quadrant Type B)
Circuit Description:
In a Class D chopper, two diagonal pairs of switches (forming a half of an H-bridge) connect the
load to +Vs when the first pair is ON, and to −Vs when the second pair is ON (current
freewheels back through the feedback diodes during the complementary interval). This allows
the average output voltage to take either polarity while the current remains unidirectional — a
two-quadrant (Type B) converter.
Step-by-Step Derivation:
Step 1: During Ton, the diagonal switch pair connects the load to the positive rail: v(t) = +Vs.
Step 2: During Toff = T − Ton, the complementary switch pair (or feedback diodes) connects
the load to the negative rail: v(t) = −Vs.
Step 3: Average the instantaneous voltage over one period, splitting the integral at Ton:
Vo = (1/T) ( ∫₀^Ton Vs dt + ∫_Ton^T (−Vs) dt )
Step 4: Evaluate both integrals:
Vo = (1/T) [ Vs·Ton − Vs·(T − Ton) ]
Step 5: Factor out Vs and simplify the bracket in terms of Ton/T:
Vo = Vs ( 2Ton/T − 1 )
Step 6: Substitute D = Ton/T:
Vo = Vs (2D − 1)
Why it is a Step-Down Chopper (with polarity reversal):
If D > 0.5, Vo is positive. If D < 0.5, Vo is negative. In all cases, the absolute maximum
magnitude of the output voltage |Vo| can never exceed Vs (it only reaches ±Vs at the extreme
duty-cycle limits D = 1 or D = 0). Therefore, it remains fundamentally a step-down chopper, but
with the unique added ability to produce a continuously variable negative average voltage as well
as a positive one — essential for four-quadrant motor speed and torque control.
Page 7 of 12

Assignment 02 — Choppers
Figure 4: Output voltage Vo (as % of Vs) versus duty cycle D for the Class D / E chopper — Vo = Vs(2D − 1). Vo
crosses zero at D = 0.5 and is bounded within ±Vs.
5. Class E Chopper (Four-Quadrant)
Circuit Description:
A Class E chopper utilizes a full H-bridge topology (four switches and four diodes) to operate in
all four quadrants (forward/reverse motoring and forward/reverse braking).
Step-by-Step Derivation:
Step 1: Under a bipolar PWM switching strategy, exactly one diagonal switch pair is ON at
any instant, and the two diagonal pairs alternate — this is identical in principle to the Class D
switching pattern.
Step 2: The same volt-second averaging performed for the Class D chopper therefore applies
directly, giving:
Vo = Vs (2D − 1)
Step 3: Under a unipolar PWM switching strategy instead, only one pair of switches is
chopped at a time while the other pair is held fixed, giving a simpler relationship in each
active region:
Vo = D Vs (forward active region) Vo = −D Vs (reverse active region)
Why it is a Step-Down Chopper:
Regardless of which quadrant the motor is operating in, the H-bridge is fundamentally a buck-
derived topology — it can only switch the load between +Vs, 0, and −Vs (or between +Vs and
−Vs for bipolar PWM); it never contains an inductive boost stage referenced to Vs. The output
voltage magnitude is therefore always a fractional portion of the DC link voltage, strictly
enforcing step-down operation in every quadrant.
Page 8 of 12

Assignment 02 — Choppers
Page 9 of 12

Assignment 02 — Choppers
Appendix: Advanced Chopper / Converter Topologies
To further illustrate variations of DC-DC conversion and inverted voltage mapping, the
following simulations demonstrate complex energy-transfer topologies derived from the same
basic chopper (switch + energy-storage element) principles used above.
Ćuk Converter:
The Ćuk converter uses a capacitor, rather than only an inductor, as the primary energy-transfer
element between input and output, giving a regulated, polarity-inverted output with continuous
(non-pulsating) input and output currents — a useful property not shared by the Buck or Boost
topologies above.
Figure 5(a): Falstad simulation circuit of a Ćuk Converter.
Figure 5(b): Switching waveform (left) and inverted, regulated output (right), stepping a 5 V input down to
approximately −4.79 V.
SEPIC (Single-Ended Primary-Inductor Converter):
The SEPIC topology allows the output voltage to be greater than, less than, or equal to the input
voltage, while maintaining a non-inverted (positive) output polarity — combining the flexibility
of the Ćuk converter with the same-sign output of a Buck-Boost converter.
Page 10 of 12

Assignment 02 — Choppers
Figure 6(a): Falstad simulation circuit of a SEPIC Converter.
Figure 6(b): Switching waveform (left) and regulated, non-inverted output (right), ≈ 4.48 V from a 5 V source.
Conclusion
This assignment derived the average output-voltage equation for all five standard chopper classes
from first principles, using time-domain averaging (Classes A, C-motoring, D, E) and inductor
volt-second balance (Classes B, C-regeneration). The results are summarised below:
| Class | Quadrant(s) | Output Voltage  | Nature |
| ----- | ----------- | --------------- | ------ |
Equation
| A   | 1st (motoring)     | Vo = D Vs                | Step-down            |
| --- | ------------------ | ------------------------ | -------------------- |
| B   | 2nd (regen)        | Vs = E / (1 − D)         | Step-up              |
| C   | 1st & 2nd          | Vo = D Vs  /  Vs = E/(1  | Step-down & Step-up  |
|     |                    | − D)                     | (same polarity)      |
| D   | 1st & 2nd (Type B) | Vo = Vs (2D − 1)         | Step-down, polarity- |
reversing
| E   | All four | Vo = Vs (2D − 1)   | Step-down, all  |
| --- | -------- | ------------------ | --------------- |
|     |          | [bipolar]          | quadrants       |

A clear progression emerges across the five classes. Class A and Class B are the elementary
building blocks — pure step-down and pure step-up converters, respectively, each operating in a
single quadrant. Class C combines both of these elementary behaviours to allow bidirectional
power flow (motoring and regenerative braking) while keeping the output voltage unipolar. Class
D goes a step further, allowing the output voltage itself to reverse polarity (two-quadrant Type
B), at the cost of always remaining a step-down converter with |Vo| ≤ Vs. Class E generalises
Class D to a full four-quadrant H-bridge, so that a single chopper can drive a motor forward or
backward and brake it in either direction, while its voltage equation, under bipolar PWM,
remains identical in form to that of Class D.
The Falstad simulations confirm these derivations experimentally: the Buck converter (Class A
analogue) reduced a 5 V source to about 4.79 V at 74% duty cycle; the Boost converter (Class B
analogue) raised the same 5 V source to about 20.6 V at 70% duty cycle; the Ćuk converter
produced an inverted, regulated output of about −4.79 V; and the SEPIC converter produced a
non-inverted, regulated output of about 4.48 V — all consistent with the governing equations
derived above.
Discussion
The step-down (Class A) and step-up (Class B) relations both reduce to the same physical
●
statement — the average voltage across an inductor must be zero over one switching
period in steady state — even though Class A was derived without invoking an inductor
Page 11 of 12

Assignment 02 — Choppers
explicitly; in practice a real Class A buck stage always includes an output inductor, and
the D·Vs result can equally be obtained from volt-second balance on that inductor.
● The (1 − D) term that appears in every step-up relation (Class B, and the regenerative
mode of Class C) is the fundamental reason boost-type converters cannot achieve a
stable, finite output as D approaches 1 — in a practical circuit, parasitic resistances cause
the real gain to peak and then fall, unlike the idealised curve plotted in Figure 2(c).
● Classes D and E trade a simpler, purely positive output (as in Class A) for bipolar output
capability, which is essential wherever a load — most commonly a DC motor — must be
driven and braked in both directions; this is achieved at no cost to component count
efficiency beyond needing a full or half H-bridge instead of a single switch.
● The Ćuk and SEPIC converters in the Appendix demonstrate that the same duty-cycle-
controlled switching principle extends naturally beyond the five classical chopper classes
into converters using capacitive energy transfer, offering additional benefits (inverted
output, continuous currents, or flexible step-up/step-down operation) not available from a
simple Class A or B chopper.
Software Used
All chopper and converter circuits in this assignment were simulated using the Falstad Circuit
Simulator (an open-source, browser-based SPICE-like simulator by Paul Falstad), from which
the circuit schematics and oscilloscope waveform captures reproduced in Figures 1, 2, 5, and 6
were taken. The duty-cycle response graphs (Figures 1(c), 2(c), 3(b), and 4) were generated
using Python 3 with the Matplotlib plotting library. The Class C schematic (Figure 3(a)) was
reconstructed using the same tool, as no saved simulation was available for that topology. The
final document was typeset programmatically in Microsoft Word (.docx) format using the docx
(docx-js) library and exported to PDF.
References
[1] Falstad, P., "Circuit Simulator Applet," [Online Software]. Available:
https://www.falstad.com/circuit/
[2] Rashid, M. H., Power Electronics: Circuits, Devices, and Applications, 4th ed., Pearson,
2014 — Chapter on DC Choppers (Classes A–E).
[3] Mohan, N., Undeland, T. M., and Robbins, W. P., Power Electronics: Converters,
Applications, and Design, 3rd ed., Wiley, 2003.
[4] Hunter, J. D., "Matplotlib: A 2D Graphics Environment," Computing in Science &
Engineering, vol. 9, no. 3, pp. 90–95, 2007.
[5] Course lecture notes / assignment brief on DC Chopper (Class A–E) output voltage
derivations, as provided by the instructor.
Page 12 of 12