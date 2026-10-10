Rajshahi University of Engineering & Technology

Department  of  Mechatronics  Engineering

MTE LAB REPORT - 02

Course No.: MTE 3202
Course Title: Power Electronics and Drives Sessional

Submitted By:

Submitted To:

Abrar Faiyaz Anan Chowdhury

ID: 2008008
3rd Year, Even Semester
Department of Mechatronics Engineering

Md. Firoj Ali

Assistant Professor

Department of Mechatronics Engineering

Rajshahi University of Engineering &

Rajshahi University of Engineering &

Technology, Rajshahi-6204.

Technology, Rajshahi-6204.

Sarafat Hussain Abhi

Assistant Professor

Department of Mechatronics Engineering

Rajshahi University of Engineering &

Technology, Rajshahi-6204.

Date of Experiment: January 06, 2025
Date of Submission: February 10, 2025

Experiment No.: 02
Name of the Experiment: Observation of A Single-Phase Half Wave Rectifier with R
Load.

Objective:

1.  To understand the concept of diode-based half-wave rectification.
2.  To analyse and observe the waveform of the rectified output graphically.

Theory:

A half-wave rectifier is an electrical circuit designed to transform alternating current (AC) into
pulsating direct current (DC) by permitting current flow during only one half of the AC cycle.
This is accomplished using a diode, which acts as a one-way switch. During the positive half-
cycle of the AC input, the diode is forward-biased, allowing current to pass through, whereas
in the negative half-cycle, it becomes reverse-biased and prevents current flow. Consequently,
only the positive half of the waveform reaches the output, while the negative half is blocked,
producing a pulsating DC output [1].

Fig 2.1: Forward Biased Circuit [4]

In  a  single-phase  half-wave  rectifier  with  a  resistive  (R)  load,  the  output  voltage  remains
directly  proportional  to  the  input  AC  waveform  throughout  the  conducting  phase.  Several
essential parameters help evaluate the performance of a half-wave rectifier. The peak voltage
(Vm) denotes the highest voltage attained in the rectified waveform. The DC output voltage
(VDC), which represents the average value of the rectified waveform over an entire cycle, is
mathematically given as:

VDC =

𝑉𝑚

𝑛

Similarly, the root mean square (RMS) voltage (Vrms), which indicates the effective voltage,
is expressed as:

Vrms =

𝑉𝑚

2

The ripple factor (RF) quantifies the AC component present in the DC output signal and is
determined using the following equation:

  Fig 2.2: Reversed Biased Circuit [4]

Another crucial parameter is the form factor (FF), which is the ratio of Vrms to VDC, calculated
as:

FF =

𝑉𝑟𝑚𝑠

𝑉𝑑𝑐

A half-wave rectifier circuit generally comprises an AC voltage source, a diode, and a resistive
load  arranged  in  series.  The  AC  voltage  source  supplies  the  input  signal,  while  the  diode
functions  as  the  rectifier,  permitting  current  flow  only  during  the  positive  half-cycle.  The
resistive load consumes rectified power. The voltage measured across the load is a pulsating
DC waveform that corresponds to the positive half of the AC signal input. However, due to the
elimination of the negative half-cycles, this outputs experiences significant fluctuations, known
as ripples, making it less stable than a full-wave rectifier [2].

This experiment aims to observe the rectified waveform and examine its behavior in a half-
wave  rectifier  with  a  resistive  load.  In  real-world  applications,  capacitors  or  other  filtering
components are often used to smooth the pulsating DC output. However, this study specifically
focuses  on  analyzing  the  unfiltered  waveform  to  understand  the  fundamental  rectification
process.  Half-wave  rectifiers  are  commonly  employed  in  low-power  applications,  such  as
signal demodulation circuits and basic power supplies for small DC devices [3].

Required Apparatus:

1.  Resistor
2.  AC supply
3.  Diode
4.  Oscilloscope

Circuit Diagram:

Data table and calculation:

Output, Vpp

Input, Vpp

VDC

Vrms

Ripple Factor

Form Factor (FF)

Oscilloscope Output:

RL
10 kΩ

Fig 2.3: Circuit Diagram

10.20 V

21.20 V

𝑉𝑚

𝑛

 =

10.6

𝑛

 = 3.374 V

𝑉𝑚

2

 =

10.6

2

 = 5.3 V

2

√𝑉𝑟𝑚𝑠
𝑉𝑑𝑐2

− 1 = 1.21

𝑉𝑟𝑚𝑠

𝑉𝑑𝑐

 = 1.57

Fig 2.4: Oscilloscope Output of Single-Phase Half Wave Rectifier with R Load

Discussion:

In this experiment, the single-phase half-wave rectifier with a resistive load generated an output
peak-to-peak voltage of 10.20V from an input voltage of 21.20V. The calculated DC voltage was
3.374V, while the RMS voltage measured 5.3V. With a ripple factor of 1.21, the output exhibited
noticeable fluctuations, which are characteristic of half-wave rectifiers. Additionally, the form
factor of 1.5708 indicates a significant  difference between the RMS  and  DC voltages. These
findings  emphasize  the  inherent  drawbacks  of  half-wave  rectifiers,  such  as  high  ripple,  low
efficiency, and potential power losses due to the inability to produce a smooth DC output.

Conclusion:

The  experiment  validated  the  expected  behavior  of  a  single-phase  half-wave  rectifier,
demonstrating substantial ripple and a high form factor. Although the output DC voltage was
present,  its  instability  due  to  ripple  made  the  rectification  process  inefficient.  These  results
underscore  the  limitations  of  half-wave  rectifiers,  particularly  in  applications  that  demand  a
stable and efficient DC power supply.

References:

[1]  R.  L.  Boylestad  and  L.  Nashelsky,  Electronic  Devices  and  Circuit  Theory,  11th

ed.,  Pearson Education, 2012.

[2]  Ayushi, “Single Phase Half Wave Rectifier- Circuit Diagram,Theory & Applications,”
Electrical  Volt,  May  25,  2020.  https://www.electricalvolt.com/single-phase-half-
wave-rectifier-circuit- diagramtheory-applications/

[3]  A.S.  Sedra  and  K.  C.  Smith,  Microelectronic  Circuits,  7th  ed.,  Oxford  University

Press, 2015.

[4]  "Diode  as  a  Rectifier,"  Electronics  Tutorials,  Accessed:  Jan.  25,  2025.  [Online].

Available: https://www.electronics-tutorials.ws

