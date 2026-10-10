Experiment No. :05
Name of The Experiment: Study and Observation of TRIAC Characteristics
Objectives
• To display the characteristic curve of a TRIAC on the oscilloscope using X-Y mode.
• To investigate the relationship between the gate trigger voltage 𝑈 and the off-state
𝐺𝑇
forward voltage 𝑈 .
𝐷
• To observe the blocking and conduction behavior of the TRIAC in both positive and
negative directions.
• To observe the TRIAC voltage and current waveforms in time-domain mode.
• To verify the bidirectional switching operation of the TRIAC.
Introduction
A TRIAC (Triode for Alternating Current) is a bidirectional thyristor used for controlling AC
power. It can be considered as two thyristors connected in anti-parallel with their gates joined
together. Therefore, unlike a conventional thyristor, a TRIAC can conduct current in both
directions.
The two main terminals of a TRIAC are called MT1 and MT2, while the third terminal is the
gate (G). The TRIAC remains in the off-state or blocking state until it is triggered. Triggering
can occur when an appropriate gate current is applied or when the voltage across the main
terminals reaches the breakover voltage.
Once triggered, the TRIAC changes from the blocking state to the conducting state. It remains
conducting as long as the current through the device remains above its holding current.
Increasing the gate trigger voltage 𝑈 generally allows the TRIAC to turn on at a lower off-
𝐺𝑇
state voltage 𝑈 .
𝐷
The characteristic curve of a TRIAC is approximately symmetrical about the origin. It consists
of a blocking region followed by a rapid transition into the conducting state in both positive
and negative directions. Thus, TRIAC is suitable for AC switching and power-control
applications such as lamp dimming and AC voltage control.
Figure 1: Characteristic curve of a TRIAC

Apparatus
Main Equipment
• Power Supply PTE-047-01
• Characteristic PTE-047-03 (TRIAC BT137 module, 12 V / 2 W lamp, R1 = 100 Ω,
R2 = 100 kΩ potentiometer, R3 = 10 Ω)
• Container Box Section PTE-047-08
Auxiliary Equipment
• Digital Multimeter
• Digital Storage Oscilloscope (Protek 5100, 100 MHz, 500 MSa/s)
Circuit Diagram
The experimental circuit consists of a 12 V AC supply, a BT137 TRIAC, a 12 V / 2 W lamp,
and the associated triggering and sensing components. The TRIAC is connected in series with
the lamp as the AC load.
The gate of the TRIAC is triggered through the 100 kΩ potentiometers 𝑅 and the 100 Ω
2
current-limiting resistors 𝑅 . The gate trigger voltage 𝑈 is measured using a digital
1 𝐺𝑇
multimeter.
The voltage across MT2 and MT1 of the TRIAC is connected to Channel 1 (CH1) of the
oscilloscope and represents the X-axis in X-Y mode. The voltage across the 10 Ω sense resistor
𝑅 is connected to Channel 2 (CH2) and represents the Y-axis. Since the value of 𝑅 is known,
3 3
the TRIAC current can be calculated using Ohm's law:
𝑈
𝑅3
𝐼 =
𝑇𝑅𝐼𝐴𝐶 𝑅
3
Thus, the oscilloscope can be used to obtain the voltage-current characteristic of the TRIAC.
Figure 2: Circuit diagram for obtaining the TRIAC characteristic

Procedure
1. Connect the Power Supply, TRIAC Characteristic Module, and Container Box panels
according to the experimental circuit diagram.
2. Set the oscilloscope to X-Y mode.
3. Connect Channel 1 (CH1) across the TRIAC between MT2 and MT1 to represent the
X-axis.
4. Connect Channel 2 (CH2) across the 10 Ω sense resistor 𝑅 to represent the Y-axis. Set
3
the channel to inverted mode as required.
5. Apply the 12 V AC supply to the circuit and close the load switch so that the lamp is
connected.
6. Close switch 𝑆 and trigger the TRIAC by adjusting the potentiometer 𝑅 .
1 2
7. Record the gate trigger voltage 𝑈 , the off-state voltage 𝑈 , and the voltage across the
𝐺𝑇 𝐷
sense resistor 𝑈 .
𝑅3
8. Repeat the measurements for different settings of the potentiometer and record the
corresponding values.
9. Capture the TRIAC characteristic curve in X-Y mode for the different trigger
conditions.
10. Switch the oscilloscope to normal time-domain mode and observe the voltage across
the TRIAC and the voltage across 𝑅 .
3
11. Record the peak-to-peak voltage and period of the observed waveforms.
12. Calculate the TRIAC current using:
𝑈
𝑅3
𝐼 =
𝑇𝑅𝐼𝐴𝐶 𝑅
3

Figure 3: Circuit Diagram
Figure 4: Complete experimental setup with the Pudak PT970721 trainer, multimeter and digital
oscilloscope

Data Table
| No.  | 𝐔 (V)  | 𝐔 (V)  | 𝐔 (V)  | 𝐈 (A)  |
| ---- | ------ | ------ | ------ | ------ |
|      | 𝐆𝐓     | 𝐃      | 𝐑𝟑     | 𝐓𝐑𝐈𝐀𝐂  |
| 1    | 1.70   | 3.52   | 3.08   | 0.308  |
| 2    | 1.24   | 2.44   | 1.84   | 0.184  |
| 3    | 1.77   | 1.02   | 3.16   | 0.316  |
| 4    | 1.60   | 2.30   | 3.32   | 0.332  |
| 5    | 1.76   | 1.18   | 3.12   | 0.312  |
Table 1: Experimental data

Oscillograms in X-Y Mode

Figure 5: TRIAC characteristic in X-Y mode (CH1 = 20 mV/div, CH2 = 50 mA/div)

Figure 6: TRIAC characteristic in X-Y mode (CH1 = 20 mV/div, CH2 = 200 mA/div)

Oscillograms in Time-Domain Mode
Figure 7: Voltage across TRIAC (CH1) and across R3 (CH2), CH1 V = 1.00 V
pp
Figure 8: Voltage across TRIAC (CH1) and across R3 (CH2), CH1 V = 1.18 V
pp
Figure 9: Voltage across TRIAC (CH1) and across R3 (CH2), CH1 V = 1.52 V
pp

Figure 10: Voltage across TRIAC (CH1) and across R3 (CH2), CH1 V  = 2.32 V
pp

Figure 11: Voltage across TRIAC (CH1) and across R3 (CH2), CH1 V  = 2.44 V (largest U )
|     |     |     | pp  |     | D   |
| --- | --- | --- | --- | --- | --- |

Table 2: Peak-to-peak values read from the oscilloscope measurements
| Figure     | CH1 𝑉 (V)  | CH2 𝑉 (mV)  | Period (ms)  | 𝐼 = 𝑉 | /𝑅 (mA)  |
| ---------- | ---------- | ----------- | ------------ | ----- | -------- |
|            | 𝑝𝑝         | 𝑝𝑝          |              | 𝑝𝑝 𝑝𝑝 | 3        |
| Figure 7   | 1.00       | 312         | 20.03        | 31.2  |          |
| Figure 8   | 1.18       | 320         | 20.05        | 32.0  |          |
| Figure 9   | 1.52       | 300         | 20.06        | 30.0  |          |
| Figure 10  | 2.32       | 332         | 20.03        | 33.2  |          |
| Figure 11  | 2.44       | 184         | 20.03        | 18.4  |          |

Discussion
From Table 1, when U is low (1.24 V), the TRIAC needs a large off-state voltage before it
GT
fires (U = 2.44 V). When U is increased to 1.60 V, 1.76 V and 1.77 V, the off-state voltage
AK GT
at which the TRIAC fires decreases to 2.30 V, 1.18 V and 1.02 V respectively. This agrees
with the theory that a stronger gate drive lets the TRIAC switch on at a lower forward voltage,
so the blocking region of the characteristic becomes shorter.
The reading U = 1.70 V with U = 3.52 V does not follow this trend. It is also higher than
GT AK
the largest CH1 value captured on the oscilloscope (2.44 V), and one capture reads 1.52 V
(Figure 9). This point is therefore likely to be a reading or recording error, and it should be
rechecked if the experiment is repeated.
The X-Y oscillograms (Figures 5 and 6) confirm the symmetrical behaviour of the TRIAC.
The device blocks in the off-state with almost zero current, then switches to a low-voltage on-
state in both the positive (first quadrant) and negative (third quadrant) directions. This differs
from a thyristor, which conducts in only one direction. The time-domain captures also show
that the TRIAC conducts in both half-cycles of the 50 Hz supply, with the flat on-state voltage
visible once it has been triggered.
Possible sources of error include noise and trace dispersion in X-Y mode (visible as scattered
points in Figures 5 and 6), contact resistance in the patch leads, limited resolution of the
potentiometer setting, and reading errors when taking values from the oscilloscope display.
Conclusion
The characteristic behavior of the BT137 TRIAC was successfully observed using an
oscilloscope in both X-Y and time-domain modes. The X-Y characteristic demonstrated the
blocking and conduction regions of the TRIAC in both positive and negative directions,
confirming its bidirectional switching behavior.
The experimental observations also showed that an increase in gate trigger voltage
𝑈 generally reduces the off-state voltage 𝑈 required to trigger the TRIAC. The time-domain
𝐺𝑇 𝐷
waveforms further confirmed the transition of the TRIAC from the blocking state to the
conducting state during the AC cycle.
Therefore, the experiment successfully demonstrated the fundamental voltage-current
characteristics and switching operation of a TRIAC in an AC circuit.
References
[1] Rashid, Muhammad H., Power Electronics: Circuits, Devices, and Applications, Prentice-
Hall International, Inc., New Jersey, 1998.
[2] Pudak Scientific, Characteristics of TRIAC (LE30003E), Power Electronics Trainer
PT970721 Laboratory Manual.