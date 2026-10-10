Rajshahi University of Engineering & Technology
Department of Mechatronics Engineering
MTE LAB REPORT - 03
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
Date of Experiment: January 13, 2025
Date of Submission: February 10, 2025

Experiment No.: 03
Name of the Experiment:
Observation f A Single-Phase Full Wave (Centre Tapped) Rectifier with R Load.
Objective:
1. To observe the operation of a single-phase full-wave (center-tapped) rectifier with a
resistive load.
2. To measure and calculate the DC output voltage (V ), RMS voltage (V ),
DC RMS
ripple factor, and form factor of the rectified signal.
3. To analyze the performance of the full-wave rectifier in terms of efficiency
and output quality.
Theory:
A single-phase full-wave rectifier with a center-tapped transformer is an AC-to-DC conversion
circuit that makes use of both the positive and negative halves of the input AC signal. The
center-tapped transformer divides the input voltage into two equal and opposite voltages
relative to the center tap, which serves as the reference point. Two diodes are arranged so that
each one conducts during alternating half-cycles of the AC input, resulting in a rectified output
with twice the frequency of the input signal.
The output voltage of the rectifier can be expressed as,
2𝑉𝑚
V =
DC
𝑛
Where V is the peak voltage of the transformer secondary winding.
m
The RMS voltage is given by,
𝑉𝑚
V =
rms
√2
The ripple factor measures the presence of AC components in the DC output and is defined as
the ratio of the RMS value of the AC components to the DC value. In a full-wave rectifier, the
ripple factor is lower compared to a half-wave rectifier, resulting in a more stable DC output
[1].
A full-wave rectifier is also more efficient than a half-wave rectifier, achieving up to 81.2%
efficiency under ideal conditions. Additionally, it requires a smaller filter to produce a smooth
DC output, making it well-suited for applications that demand higher output quality [2].

Fig 3 .1: Single Phase Full Wave Rectifier [3]
Required Apparatus:
1. Resistor
2. AC supply
3. Diode
4. Oscilloscope
Circuit Diagram:
Fig 3.2: Circuit Diagram

Data table and calculation:

|          |     | Parameter  | Value    |
| -------- | --- | ---------- | -------- |
| Input, V |     |            | 21.20 V  |
pp
| Output, V |     |     | 10.40 V  |
| --------- | --- | --- | -------- |
pp
𝑉𝑝𝑝
| Peak Voltage, V |     |     |  = 10.6 V  |
| --------------- | --- | --- | ---------- |
m
2
2𝑉𝑚
| Average Voltage, V |     |     |  = 6.74 V  |
| ------------------ | --- | --- | ---------- |
avg
𝜋
𝑉𝑚
 = 7.4953 V
| RMS Voltage, V |     |     |     |
| -------------- | --- | --- | --- |
rms
√2
| Ripple Factor (R.F)  |     |     | 0.486 or 48.6%  |
| -------------------- | --- | --- | --------------- |
𝑉𝑟𝑚𝑠
| Form Factor (F.F)  |     |     | = 1.112  |
| ------------------ | --- | --- | -------- |
𝑉𝑑𝑐
| Efficiency (η)  |     |     | 81.06%  |
| --------------- | --- | --- | ------- |

Oscilloscope output:

Fig 3.3: Input and output waveform of Single-Phase Full Wave Rectifier with R Load

Discussion:
This experiment examined the performance of a single-phase full-wave (center-tapped)
rectifier using a resistive load. The input peak-to-peak voltage was measured at 21.20V, while
the output peak-to-peak voltage (Vpp) was 10.20V, resulting in a peak voltage of 10.6V. The
calculated average voltage was 6.7481V, with an RMS voltage of 7.4953V.
The ripple factor, determined to be 48.34%, indicates a moderate level of ripple in the output
signal—characteristic of full-wave rectification, though significantly lower than that of a half-
wave rectifier. The form factor of 1.1107 suggests only slight variation between the RMS and
DC values, confirming that the rectifier delivers a relatively stable DC output.
With an efficiency of 81.06%, the rectifier aligns closely with the theoretical efficiency of a
full-wave rectifier, demonstrating a notable improvement over a half-wave rectifier, which
typically achieves around 40.5% efficiency.
Conclusion:
The experiment successfully validated the expected characteristics of a single-phase full-wave
(center-tapped) rectifier. The output exhibited a moderate ripple factor alongside a high
efficiency of 81.06%. Compared to a half-wave rectifier, the full-wave rectifier provides a more
stable and efficient DC output, making it ideal for applications requiring smoother DC voltage.
While some ripple remains present, implementing additional smoothing techniques, such as
capacitive filtering, could further enhance the output quality.
References:
[1] M. H. Rashid, Power Electronics: Circuits, Devices, and Applications, 4th ed., Pearson,
2013.
[2] R. Boylestad and L. Nashelsky, Electronic Devices and Circuit Theory, 11th ed.,
Pearson, 2015
[3] T. Agarwal, “Center Tapped Full Wave Rectifier: Circuit, working & applications,”
ElProCus - Electronic Projects for Engineering Students, Jul. 14, 2022. Available:
https://www.elprocus.com/ center-tapped-full-wave-rectifier/