|     |     | Assignment |     | - 01 |
| --- | --- | ---------- | --- | ---- |
AnalogyandMathematical Modelingof Boost andBuck-Boost Converters
Introduction
The boost and buck-boost converters are two basic non-isolated DC-DC power converter
topologies. Both are built from the same four elements: an inductor (L), a controlled
semiconductor switch (S), a diode (D) and an output capacitor (C) supplying a load
resistance (R). What separates them is the way these elements are arranged between the
source and the load,andthat arrangement decides the voltage gainandthe output polarityof
eachconverter.
This assignment first presents the circuit configuration of each converter together with its
simulation, then compares the two converters, derives a mathematical model of each from the
two switching states, and finally applies the buck-boost model to a solar (photovoltaic) plant,
where the converter is used as the interface between the solar panel and the load in a
| maximum  | power point           | tracking(MPPT) | scheme. |     |
| -------- | --------------------- | -------------- | ------- | --- |
| 1. Basic | Circuit Configuration |                |         |     |
| 1.1Boost | Converter             |                |         |     |
In the boost converter the inductor is connected in series with the input source, and the switch
isconnectedacrossthecircuitaftertheinductor.Whentheswitchisclosedthesourcecharges
the inductor. When the switch opens the inductor current is forced through the diode into the
output capacitor and the load, so the inductor voltage adds to the source voltage. The output
voltage is therefore always higher than the input voltage and has the same polarity. Because
| the inductor | is at the | input,the input   | current is continuous. |                        |
| ------------ | --------- | ----------------- | ---------------------- | ---------------------- |
|              |           | Figure 1: Circuit | diagram                | of the boost converter |
1

1.2Buck-Boost Converter
In the buck-boost converter the switch is connected in series with the source and the inductor
is connected across the circuit after the switch. When the switch is closed the whole input
voltage appears across the inductor, and the diode is reverse biased. When the switch opens,
theinductorcurrentcontinuestoflowthroughthediodeintotheoutputcapacitorandtheload,
in the reverse direction with respect to the source. The output voltage is therefore ofinverted
polarity, and its magnitude may be smaller or larger than the input, depending on the duty
cycle.
Figure 2: Circuit diagram of the buck-boost converter (inverting)
2. Circuit Simulation
Both converters were simulated in a circuit simulator with a 5 V DC source, a 10 mH
inductor, a 10 µF output capacitor and a 1 kΩ load. A MOSFET is used as the switch in both
cases.
2

Figure 3: Boost converter simulation. The MOSFET gate is driven by a 555 timer in astable
mode (upper part: circuit; lower part: timer capacitor waveform and load voltage)
In Figure 3 the load voltage settles at about 9.4 V from a 5 V source, a voltage gain of roughly
1.9. This confirms that the boost converter steps the voltage up while keeping the same
polarity as the input.
Figure 4: Buck-boost converter simulation. The MOSFET gate is driven by a 1 kHz
square-wave generator (upper part: circuit; lower part: gate signal and output voltage)
In Figure 4 the output voltage is about −16 V (between −15.2 V and −17.0 V, the difference
being the output ripple) from a +5 V source. This confirms the inverting nature of the
buck-boost converter: a positive input produces a negative output with respect to the common
3

ground.
Note. The gain formulas derived in Sections 4 and 5 assume continuous conduction mode
(CCM). With the light load and the small inductance used in this simulation, the inductor
current falls to zero during part of each cycle (discontinuous conduction mode). In this mode
the gain is higher than the CCM value; for example, at the 57% duty cycle shown by the
generator, the CCM formula gives |V | = 6.6 V, which is lower than the 16 V observed. The
o
CCM  equations  hold  when  the  inductance  is  greater  than  the  critical  value  L   =
crit
R(1−D) 2 /(2f).
3. Analogy Between Boost and Buck-Boost
The two converters are compared in Table 1.
| Feature    | Boost converter |     | Buck-boost converter |     |
| ---------- | --------------- | --- | -------------------- | --- |
| Components | L, S, D, C      |     | L, S, D, C (same)    |     |
Switch position Shunt (across the circuit) Series with the source
Inductor position Series with the source Shunt (across the circuit)
| Output polarity | Same as input (positive) |     | Inverted (negative) |     |
| --------------- | ------------------------ | --- | ------------------- | --- |
Smaller or larger than V
| Output magnitude | Always ≥ V                      |  (step-up only) |                               | in  |
| ---------------- | ------------------------------- | --------------- | ----------------------------- | --- |
|                  |                                 | in              | (step-down and step-up)       |     |
|                  | Connected to the load in series |                 | Disconnected from the source, |     |
Inductor in OFF
|     | with the source (input current |     | delivers its stored energy to the |     |
| --- | ------------------------------ | --- | --------------------------------- | --- |
state
|               | is continuous)  |     | load only         |     |
| ------------- | --------------- | --- | ----------------- | --- |
| Input current | Continuous      |     | Pulsating         |     |
| Voltage gain  | V /V  = 1/(1−D) |     | |V |/V  = D/(1−D) |     |
|               | o in            |     | o in              |     |
Table 1: Comparison of boost and buck-boost converters
Key mathematical analogy. The gain of the buck-boost converter is conceptually the product
of the gain of a buck converter and the gain of a boost converter operated with the same duty
cycle:
(1)
So the buck-boost converter can be seen as a buck stage and a boost stage combined into one
inductor, one switch and one diode. As a result it can step the voltage down when D < 0.5 and
step it up when D > 0.5, whereas the boost converter can only step up (Figure 5). Both gains
grow very rapidly as D approaches 1, so in practice the duty cycle is limited to a value below
about 0.9 because of losses.
4

Figure 5: Ideal voltage gain of the boost, buck-boost and buck converters versus duty cycle
4. Mathematical Model of the Boost Converter
The converter is analysed over one switching period T with duty cycle D. The state variables
are the inductor current i and the capacitor voltage v , and all components are assumed ideal.
L C
Switch ON (0 < t < DT). The inductor is connected across the source and charges. The diode
is reverse biased, so the capacitor alone supplies the load.
(2)
Switch OFF (DT < t < T). The diode conducts, and the inductor and the source together feed
the capacitor and the load.
(3)
Averaged state-space model. Weighting the ON-state equations by d and the OFF-state
equations by (1−d) and adding them gives
(4)
(5)
Steady state. In steady state the average inductor voltage is zero (volt-second balance) and
the average capacitor current is zero (charge balance). Setting the derivatives to zero, with V
o
and I as the steady-state values:
L
(6)
(7)
5

5. Mathematical Model of the Buck-Boost Converter
For the buck-boost converter, v denotes the magnitude of the capacitor voltage, so that the
C
actual output voltage is V = −v .
o C
Switch ON (0 < t < DT). The full input voltage is applied across the inductor. The diode
blocks and the capacitor supplies the load.
(8)
Switch OFF (DT < t < T). The source is disconnected. The inductor current flows through
the diode into the capacitor and the load, and the inductor voltage is equal to the output
voltage.
(9)
Averaged state-space model.
(10)
(11)
Steady state. Volt-second balance on the inductor and charge balance on the capacitor give
(12)
(13)
For D = 0.5 the output magnitude equals the input, for D < 0.5 the converter steps down, and
for D > 0.5 it steps up, with the output always negative with respect to the input ground.
6. Solar (PV) Plant Application
6.1 Why the Buck-Boost Converter is Preferred
The terminal voltage of a photovoltaic (PV) panel changes considerably with solar irradiance
and cell temperature. Depending on the conditions, the panel voltage V can be above or
pv
below the voltage required by the battery or DC bus. A buck converter can only step down
and a boost converter can only step up, so neither can cover both situations. The buck-boost
converter can, and for this reason it is preferred for the PV interface. (The inverted output
polarity is not a problem for a DC bus or battery, as it only requires a reversed connection or
an additional inverting stage.)
6.2 PV Source Model
A PV panel is modelled by the single-diode equivalent circuit. The panel current is
6

(14)
where I is the photo-generated current (proportional to irradiance), I is the diode saturation
ph 0
current, R and R are the series and shunt resistances, n is the diode ideality factor, q is the
s sh
electron charge, k is the Boltzmann constant and T is the cell temperature. Figure 6 shows the
resulting I-V and P-V characteristics, computed from this model for an example 36-cell panel
(I = 3.5 A, R = 0.3 Ω, R = 300 Ω, n = 1.3, 25 °C). The power is maximum at a single
ph s sh
point, the maximum power point (MPP), at which the panel voltage and current are V and
mpp
I . This point corresponds to an optimum resistance R = V /I , which is about 6 Ω
mpp mpp mpp mpp
for the example panel.
Figure 6: I-V and P-V characteristics of the example PV panel obtained from the single-diode
model
6.3 Coupling the PV Panel with the Buck-Boost Converter
Assuming lossless conversion, the power taken from the panel is equal to the power delivered
to the load:
(15)
Using the buck-boost gain V = [D/(1−D)]V , the resistance seen by the panel at the
o pv
converter input is
(16)
This is the central equation of the solar-plant model. The panel does not see the actual load; it
sees R , which is set by the duty cycle. An MPPT algorithm such as Perturb and Observe
in
(P&O) or Incremental Conductance adjusts D continuously so that R = R , which forces
in mpp
the panel to operate at its maximum power point whatever the irradiance, temperature or load.
The complete arrangement is shown in Figure 7.
7

Figure 7: Block diagram of the PV system with buck-boost converter and MPPT controller
The converter topologies differ in the range of resistance they can present to the panel (Table
2).
| Converter | Input resistance |     | Range of R |  (0 < D < 1) |     |
| --------- | ---------------- | --- | ---------- | ------------ | --- |
in
2
| Buck | R /D |     | R  to infinity (R |  ≥ R | )    |
| ---- | ---- | --- | ----------------- | ---- | ---- |
|      | load |     | load              | in   | load |
2
| Boost | R (1−D) |     | 0 to R |  (R  ≤ R | )   |
| ----- | ------- | --- | ------ | -------- | --- |
|       | load    |     | load   | in load  |     |
2
| Buck-boost | R ((1−D)/D) |     | 0 to infinity (any value) |     |     |
| ---------- | ----------- | --- | ------------------------- | --- | --- |
load
Table 2: Input resistance presented to the PV panel by each converter
Only the buck-boost converter can present any value of R  to the panel, so it can track the
in
maximum power point for every combination of panel and load. A boost converter can only
match a maximum power resistance smaller than the load resistance, and a buck converter
only one larger than the load resistance.
6.4 Design Example
Consider the example panel of Figure 6 with V  = 19.3 V, I  = 3.22 A and P  = 62.2
|     |     | mpp | mpp |     | mpp |
| --- | --- | --- | --- | --- | --- |
W (so R  = 5.99 Ω), charging a 12 V battery bus. The equivalent load resistance is R  =
| mpp |     |     |     |     | load |
| --- | --- | --- | --- | --- | ---- |
2
| 12 /62.2 = 2.31 Ω. From Equation (16) with R |     |  = R | :   |     |     |
| -------------------------------------------- | --- | ---- | --- | --- | --- |
in mpp
The check gives |V | = [0.383/(1−0.383)] × 19.3 = 12.0 V, as required. Here the converter
o
steps the panel voltage down (D < 0.5). If the irradiance or the battery voltage changes so that
the required output is higher than the panel voltage, the MPPT controller simply increases D
above 0.5 and the same converter steps the voltage up, which a buck-only or boost-only
converter could not do.
8

7. Conclusion
The boost and buck-boost converters are built from identical elements and differ only in the
positions of the inductor and the switch. This changes the voltage gain from 1/(1−D) for the
boost converter to D/(1−D) for the buck-boost converter, and gives the buck-boost converter
an inverted output that can be either smaller or larger than the input. The simulations
confirmed a positive step-up output for the boost converter and a negative output for the
buck-boost converter.
Both converters were modelled by writing the inductor and capacitor equations for the ON
and OFF states, averaging them into a state-space model, and solving the steady state with
volt-second and charge balance. In a solar plant the buck-boost converter is the natural choice,
2
because its input resistance R [(1−D)/D] can be set to any value by the duty cycle. An
load
MPPT controller can therefore match it to the panel resistance R at all operating
mpp
conditions, which a boost or buck converter alone cannot do.
References
[1] R. W. Erickson and D. Maksimović, Fundamentals of Power Electronics, 3rd ed. Cham,
Switzerland: Springer, 2020.
[2] N. Mohan, T. M. Undeland and W. P. Robbins, Power Electronics: Converters,
Applications, and Design, 3rd ed. Hoboken, NJ, USA: John Wiley & Sons, 2003.
[3] M. H. Rashid, Power Electronics: Circuits, Devices, and Applications, 4th ed. Upper
Saddle River, NJ, USA: Pearson, 2014.
[4] D. W. Hart, Power Electronics. New York, NY, USA: McGraw-Hill, 2011.
9