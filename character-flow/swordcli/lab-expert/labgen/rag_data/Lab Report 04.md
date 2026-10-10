Rajshahi University of Engineering & Technology
Department of Mechatronics Engineering
MTE LAB REPORT - 04
Course No.: MTE 3202
Course Title: Power Electronics and Drives Sessional
Submitted By: Submitted To:
Abrar Faiyaz Anan Chowdhury Md. Firoj Ali
ID: 2008008 Assistant Professor
3rd Year, Even Semester Department of Mechatronics Engineering
Department of Mechatronics Engineering Rajshahi University of Engineering &
Rajshahi University of Engineering & Technology, Rajshahi-6204.
Technology, Rajshahi-6204.
Sarafat Hussain Abhi
Assistant Professor
Department of Mechatronics Engineering
Rajshahi University of Engineering &
Technology, Rajshahi-6204.
Date of Experiment: February 10, 2025
Date of Submission: February 24, 2025

Experiment No.: 04
Name of the Experiment:
Observation of a Single-Phase SCR with R Load.
Objective:
1. To analyze the operation of a single-phase SCR circuit with a resistive load by observing its
voltage and current waveforms.
2. To understand the effect of varying the firing angle on the conduction period and power
delivered to the load.
3. To investigate the performance parameters of the circuit.
Theory:
A controlled single-phase SCR (Silicon Controlled Rectifier) operates by using a gate triggering pulse
to control the conduction period in an AC circuit. The phase-control thyristor remains in a non-
conducting state until a gate pulse is applied, at which point it turns on and conducts current until the
AC voltage crosses zero and the current falls below the holding level and is turned off due to natural
or line commutation. By adjusting the firing angle (the delay in triggering within each AC cycle), the
average power delivered to the load can be controlled. This principle is essential in phase-controlled
rectifiers, where partial conduction of the AC waveform allows precise voltage and power regulation.
Such control is widely used in applications like motor speed regulation, heater control, and dimming
circuits [2].
Effect of Firing Angle (α):
• For α = 0°, the circuit behaves like a normal diode rectifier.
• For α = 90° or more, the output voltage is significantly reduced, and for α ≥ 180°, no conduction
occurs.
Figure 4.1: General Waveform of Single-Phase Semi-Converter SCR with R Load [1]

Required Apparatus:

1.  Power Electronics Board (DE LORENZO)
2.  Oscilloscope (Protek 5100)

Circuit Diagram:

Figure 4.2: Circuit Diagram of a Single-Phase Semi-Converter SCR with Resistive Load

Procedure:

1.  The circuit was assembled on the power electronics board according to the circuit
diagram (Figure 4.2).
2.  Next, the input and output parameters were measured and recorded in the data table using
the oscilloscope.
3.  Finally, the relevant waveforms were captured from the oscilloscope.

Data table and calculation:

Vdc (V)  Vrms (V)
|               | Firing    | Vm   |         |           |                   | Frequency  |
| ------------- | --------- | ---- | ------- | --------- | ----------------- | ---------- |
| SI No.  Case  |           |      |         |           |                   |            |
|               | Angle, α  | (V)  | Theory  | Measured  | Theory  Measured  | (Hz)       |
R
| 01  | 45º  | 10.4  | 2.8  | 2.826  | 4.8  4.96  | 46.98  |
| --- | ---- | ----- | ---- | ------ | ---------- | ------ |
Load
Performance Rectification, η  Form Factor, FF  Ripple Factor, RF
|     | 32.46%  |     |     |     | 1.76  | 1.45  |
| --- | ------- | --- | --- | --- | ----- | ----- |

| Peak Input Voltage, V |  = 10.4 V  |     |     |     |     |     |
| --------------------- | ---------- | --- | --- | --- | --- | --- |
m
T 1
| Average Output Voltage, V |     |  = ∫  | V  (t) dωt  |     |     |     |
| ------------------------- | --- | ----- | ----------- | --- | --- | --- |
|                           |     | dc    | out         |     |     |     |
T
0
|     |     | V   |     |     |     |     |
| --- | --- | --- | --- | --- | --- | --- |
m
|     |     | =   | (1 + cos α)  |     |     |     |
| --- | --- | --- | ------------ | --- | --- | --- |
2π

10.4 (1 + cos 45°)
=
2π
= 2.8 V
= 4.8 V
𝑉 𝑟𝑚𝑠
FF =
𝑉 𝑑𝑐
= 1.76
RF = √ FF2 − 1
= 1.45
Performance Rectification, η = 32.46%
Discussion:
In the experiment, the operation of a single-phase SCR with an R load was observed by analyzing the
voltage and current waveforms. The SCR was triggered at different firing angles, and its conduction
characteristics were examined. It was found that as the firing angle increased, the conduction period
decreased, reducing the power delivered to the load. The waveforms confirmed the expected behavior,
demonstrating phase control of the AC signal. Some minor deviations were observed due to circuit
losses and triggering inaccuracies.
Conclusion:
The principle of controlled rectification using a single-phase SCR with an R load was successfully
demonstrated. The relationship between the firing angle and power delivered to the load was verified
through waveform analysis. It was concluded that increasing the firing angle reduces the conduction
period, thereby lowering the output power. The experiment validated the theoretical concepts of SCR
phase control. Overall, the results confirmed the effectiveness of SCRs in AC power regulation
applications. This converter is not normally used in industrial applications because it has high ripple
content and low ripple frequency.

References:
[1] M. H. Rashid, Power Electronics: Circuits, Devices, and Applications, 4th ed., Pearson,
2013.
[2] R. Boylestad and L. Nashelsky, Electronic Devices and Circuit Theory, 11th ed.,
Pearson, 2015