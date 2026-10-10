Experiment No: 03
Experiment Name: Full-Wave Rectifier Using Thyristor (Single Phase Semi-Converter)
Objective
1. To study the operation of a single-phase full-wave rectifier employing two thyristors (T1,
T2) and two diodes (D1, D2), i.e. a single-phase semi-converter.
2. To observe the effect of the thyristor firing angle (α) on the average DC output voltage.
3. To calculate the theoretical DC output voltage and compare it with the value observed
experimentally.
4. To determine the form factor (FF) of the rectified output at different firing angles.
Apparatus Required
• Single-phase AC supply source
• Two thyristors (SCRs) - T1, T2
• Two power diodes - D1, D2
• Resistive load, R
• Gate triggering/firing circuit for the thyristors
• Digital multimeter / voltmeter (DC and true-RMS AC)
• Cathode ray oscilloscope (CRO), connecting leads
Theory
A single-phase semi-converter (half-controlled full-wave rectifier) uses two thyristors and two
diodes arranged in a bridge configuration to convert AC to a controllable DC output. Thyristors
T1 and T2 form the top arms of the bridge and are triggered with a firing angle α, while diodes
D1 and D2 occupy the bottom arms and conduct naturally whenever forward biased. Because
two of the four devices are uncontrolled diodes, the circuit is 'half-controlled': it can only
control the average output voltage in one polarity and provides an inherent free-wheeling path
through the diodes, which improves the load current waveform for inductive loads.
During the positive half-cycle of the supply, thyristor T1 and diode D2 conduct once T1 is
triggered at angle α1 (measured from the zero-crossing of the supply voltage), connecting the
source to the load. During the negative half-cycle, thyristor T2 and diode D1 conduct once T2
is triggered at angle α2. By delaying the firing instant, the portion of each half-cycle during
which the source is connected to the load is reduced, thereby reducing the average DC output
voltage.
For an ideal semi-converter with a common firing angle α for both thyristors, the average DC
output voltage for a resistive load is given by:

Vdc = (Vm / π) × (1 + cos α)
where Vm is the peak value of the supply voltage. In practice, the two triggering circuits for
T1 and T2 are rarely perfectly matched, so the two thyristors fire at slightly different angles,
α1 and α2. The average DC output voltage is then more accurately expressed as:
Vdc = (Vm / 2π) × [(1 + cos α1) + (1 + cos α2)] = (Vm / 2π) × [2 + cos α1 + cos α2]
The quality of the rectified DC output is assessed using the form factor (FF), defined as the
ratio of the RMS value of the output voltage to its DC (average) value:
FF = Vrms / Vdc
An ideal DC source has a form factor of 1; values greater than 1 indicate the presence of AC
ripple superimposed on the DC output. As the firing angle α increases, the output voltage
waveform becomes narrower and more pulsed, which lowers Vdc while Vrms falls more
slowly - so the form factor increases with firing angle.
Circuit Diagram
Figure 1. Single-phase full-wave semi-converter using thyristors T1, T2 and diodes D1, D2 with
resistive load R.
Procedure
1. The circuit was connected as shown in Figure 1, with the AC source, thyristors T1 and
T2, diodes D1 and D2, and the resistive load R.
2. The firing angles α1 and α2 of thyristors T1 and T2 were initially set to their minimum
value.
3. The RMS supply voltage (Vrms) and the DC output voltage (Vdc) were measured using
the multimeter, and the output waveform was observed on the CRO.
4. The firing angles α1 and α2 were increased in steps (30°/35°, 50°/40°, 80°/80°), and at
each step the RMS voltage and DC output voltage were recorded.
5. For each setting, the theoretical Vdc was calculated using the semi-converter formula and
compared with the observed value.
6. The form factor was calculated for each case as the ratio of Vrms to the observed Vdc.

Data and Observations
Peak supply voltage, Vm = 30.40 V
| No.  | α1 (deg)  | α2 (deg)  | Vrms (V)  |             |           |            |           |
| ---- | --------- | --------- | --------- | ----------- | --------- | ---------- | --------- |
|      |           |           |           | Vdc1 -      | Vdc2 -    | FF =       | % Error   |
|      |           |           |           | Calculated  | Observed  | Vrms/Vdc2  | (Vdc1 vs  |
|      |           |           |           | (V)         | (V)       |            | Vdc2)     |
| 1    | Minimum   | Minimum   | 21.20     | 19.35       | 18.80     | 1.13       | 2.84%     |
|      | (≈0°)     | (≈0°)     |           |             |           |            |           |
| 2    | 30        | 35        | 20.80     | 17.83       | 17.20     | 1.21       | 4.07%     |
| 3    | 50        | 40        | 20.40     | 16.50       | 16.00     | 1.275      | 3.89%     |
| 4    | 80        | 80        | 15.20     | 11.36       | 11.60     | 1.36       | 2.71%     |
Calculation
For α1 = 30° and α2 = 35°, with Vm = 30.40 V:
Vdc = (Vm / 2π) × [2 + cosα1 + cosα2]
Vdc = 4.839 × [2 + 0.866 + 0.819] = 4.839 × 3.685 ≈ 17.83 V
This calculated value matches the theoretical entry in Row 2 of the observation table. The form
factor for this case is:
FF = Vrms / Vdc(observed) = 20.80 / 17.20 ≈ 1.21
The percentage error between the calculated and observed Vdc for this row is: % Error =
[(17.83 − 17.20) / 17.83] × 100 ≈ 3.5-4%, consistent with the recorded value of 4.07%.
Result and Discussion
The variation of the calculated and observed DC output voltage with the average firing angle
is plotted in Figure 2. Both curves fall steadily as the firing angle increases, confirming that a
larger firing delay reduces the conduction period of the thyristors and hence the average output
voltage.

Figure 2. DC output voltage (calculated and observed) versus average firing angle.

The observed Vdc is consistently slightly lower than the calculated value at small firing angles,
mainly due to voltage drops across the conducting thyristors and diodes, transformer/source
impedance, and meter loading, which are neglected in the ideal formula. Figure 3 shows that
the form factor increases steadily with firing angle, rising from about 1.13 at minimum firing
angle to 1.36 at 80°, indicating that the ripple content of the output waveform increases as the
conduction angle is reduced.
Figure 3. Form factor (Vrms/Vdc) versus average firing angle.
The percentage error between the calculated and observed DC voltages remained small (under
about 4.1%) across all firing angles, showing good agreement between theory and the
experimental hardware, with the free-wheeling action of diodes D1 and D2 helping to maintain
a well-defined output waveform throughout the firing-angle range tested.
Conclusion
The single-phase full-wave semi-converter using thyristors T1, T2 and diodes D1, D2 was
successfully constructed and tested. The DC output voltage was found to decrease with
increasing firing angle, in close agreement with the theoretical relationship Vdc = (Vm/2π)[2
+ cosα1 + cosα2]. The form factor increased with firing angle, confirming greater ripple content
at higher delay angles. The small deviations between calculated and observed values (2.7-
4.1%) can be attributed to practical non-idealities such as device voltage drops and source
impedance. Overall, the experiment confirmed that the firing angle of the thyristors provides
an effective means of controlling the DC output voltage of a full-wave rectifier.
Reference:
[1] M. H. Rashid, Power Electronics: Circuits, Devices, and Applications, 4th ed. Pearson, 2014.
[2] N. Mohan, T. M. Undeland, and W. P. Robbins, Power Electronics: Converters, Applications, and
Design, 3rd ed. Wiley, 2003.
[3] MTE 3202 Power Electronics Laboratory Manual, Department of EEE, course handout, 2026.