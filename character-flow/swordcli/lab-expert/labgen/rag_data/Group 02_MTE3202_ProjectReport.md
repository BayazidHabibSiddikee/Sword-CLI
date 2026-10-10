Rajshahi University of Engineering &
Technology, Rajshahi-6204
Course No.: MTE 3202
Course Title: Power Electronics and Drives Sessional
Project Report
Project Title
Design and Implementation of a DC-DC Boost Converter (9V to 24V)
using ESP32-based PWM Control
Submitted By
Md. Raihanul Haque Rahi - 2008011
Sumaya Tasnim - 2008012
Avik Md. Emtiaz Arefin - 2008013
Md. Ismail Hossain Sohag - 2008014
Fahim Fahad Nabil - 2008015
Siam Billah - 2008016
Siam Mridha - 2008017
Md. Mahbubur Rahman - 2008018
Sarker Shadman Alinda - 2008019
Humaira Adiba Trisha - 2008020
Submitted To
Md. Firoj Ali Sarafat Hussain Abhi
Associate Professor, Assistant Professor,
Department of Mechatronics Engineering, Department of Mechatronics Engineering,
Rajshahi University of Engineering & Rajshahi University of Engineering &
Technology, Technology,
Rajshahi-6204 Rajshahi-6204

Chapter 1: Power Electronics Knowledge
1.1 Introduction:
Efficiency and power density have been at the heart of the power electronics community over
the course of the last five decades. The improvements in efficiency and power density are
heavily driven by power technologies, circuit topologies, and control methods. The historical
development of power electronics, and reliability engineering. With the increasing demands of
application-driven research, reliability has become a considerable practical challenge in power
electronics. Reliability is an important performance factor that is considered during the design,
manufacturing, and field operation of power electronic converters. Over the past decade, the
business model in the industry has been transitioning from product suppliers to holistic service
providers. This demands life-cycle-cost reduction and operation optimization of power
electronic converters through innovative design, in-depth understanding of failure mechanisms
and mission profiles, and predictive maintenance [1]. This work presents a classification of the
main power quality problems and the respective context with the standards, a review of power
quality problems related to the power production from renewables, the contextualization with
electric mobility and electrical systems, a power electronics solutions to compensate the main
power quality problems, as well as power electronics solutions to guarantee high levels of
power quality. Relevant experimental results and exemplificative developed power electronics
prototypes are also presented throughout the work [2].
1.2 DC-DC Boost Converter:
Direct current (DC to DC) converters are circuits which convert sources of direct current (DC)
from one voltage level to another by changing the duty cycle of the main switches in the
circuits. Since DC-DC converters are nonlinear systems, they represent a big challenge for
control design [3]. DC converters are used in DC voltage regulators; and also, are used, with
an inductor in conjunction, to generate a DC current source, specifically for the current source
inverter [4]. It works by storing energy in the inductor when the switch is closed and releasing
it to the load when the switch is open.
Fig.1. ON and OFF states of DC/DC Boost Converter
The relation between input voltage, output voltage, and duty cycle is given as:
𝑉
𝑖𝑛
𝑉 =
𝑜 1−𝐷
Where:
𝑉 = Output voltage
𝑜
𝑉 = Input voltage
𝑖𝑛
𝐷 = Duty cycle
1 | P age

For this design, the theoretical duty cycle was calculated as:
9
𝐷 = 1− = 0.625 (62.5%)
24
However, in the experimental setup, a 47.5% duty cycle was used to obtain around 24V due to
practical non-idealities.
Since classical control methods are designed at one nominal operating point, they are
not able to respond satisfactorily to operating point variations and load disturbance. They often
fail to perform satisfactorily under large parameter or load variations [3].
The boost type DC-DC converters are used in applications where the required output
voltage needed to be higher than the source voltage. The control of this type DC-DC converters
are more difficult than the buck type where the output voltage is smaller than the source
voltage. The difficulties in the control of boost converters are due to the non-minimum phase
structure since, the control input appears both in voltage and current equations, from the control
point of view the control of boost type converters are more difficult than buck type.
1.3 PWM DC to DC converter:
PWM DC-to-DC converters are very popular for the last three decades, and that are widely
used at all power levels. Since switching converters constitute a case of variable structure
systems, the conventional control technique can be a possible option to control this kind of
circuits [5]. When designing dc-dc power converters using pulse width modulation (PWM),
fault analysis is crucial. It provides us with comprehensive information about the potential
harm and aids in our understanding of the severity of different fault types. It provides us with
precise details regarding the highest resist durability of each part of a converter. It is quite
helpful to us while constructing the converters to operate within their maximum capabilities.
In this section we measure the converter's performance after introducing various flaws [6].
1.4 ESP-32 based Control:
ESP32 is a powerful and cost-effective platform for developing electronics applications. ESP32
has the following features: (1) a dual-core processor, (2) a large number of general-purpose
input/output (GPIO) pins, and (3) low power consumption, which provides higher processing
power and facilitates multitasking and efficient execution of complex tasks. It gives the user
precise control over frequency, amplitude, and waveform shape, and it is usually used for
testing and stimulus purposes. In addition, Analog Discovery offers two programmable power
supplies, with adjustable voltage outputs for powering external circuits or components. The
device also has a built-in logic analyzer that captures and analyzes digital signals with up to 32
channels [7]. The ESP32 produces PWM (Pulse Width Modulation) signals using its built-in
timers to manage the MOSFET switching in the boost converter. By varying the PWM duty
cycle, it controls the output voltage in relation to the input.
2 | P age

Chapter 2: Designing Engineering Solutions
2.1 Objectives
1. To design and implement a DC-DC boost converter capable of converting 9V input to
approximately 24V output.
2. To utilize ESP32 for generating PWM signals for converter control.
3. To validate the design through MATLAB simulation and practical hardware
implementation.
2.2 Methodology:
Theoretical Design
a. The duty cycle for converting 9V input to 24V output was calculated.
b. Component values such as inductor size, capacitor rating, and transistor type were selected
based on the design requirements.
Simulation in MATLAB
a. The boost converter circuit was modeled with inductor, transistor, diode, and capacitor.
b. A 9V input and desired 24V output were set.
c. Duty cycles of 47.5% and 62.5% were tested to observe voltage boosting and ripple
performance.
PWM Implementation on ESP32
a. ESP32 was programmed to generate a 100 kHz PWM signal with 47.5% duty cycle on
GPIO21.
b. The PWM signal was verified using an oscilloscope in Simulation before connecting it to
the circuit.
Hardware Construction:
a. The circuit was built on a breadboard following the boost converter topology.
b. ESP32 output was connected to the TIP120 transistor, which switched the inductor current.
c. Diode and capacitor were added to complete the circuit.
Testing and Measurement:
a. A 9V battery was applied as the input source.
b. The output voltage was measured across the load resistor using a digital multimeter.
c. The measured output was compared with MATLAB simulation results for validation
3 | P age

2.3 Component List:

| Component Name           |                                      | Functionality  | Price (BDT)  |
| ------------------------ | ------------------------------------ | -------------- | ------------ |
| ESP32 Development Board  | Generates PWM control signal         |                | 449          |
| Inductor (680 µH)        | Stores and releases magnetic energy  |                | 10           |
| Capacitor (100 nF)       | Smooths output voltage ripple        |                | 4            |
| TIP120 Transistor        | Main switching device                |                | 25           |
Fast Recovery Diode (UF4007)  Provides current path during OFF cycle  5
| Resistor (10 kΩ)         | Load/stabilization resistor  |     | 1          |
| ------------------------ | ---------------------------- | --- | ---------- |
| DC Source (9 V battery)  | Input supply                 |     | 75         |
| Load Resistor (10 kΩ)    | For output voltage testing   |     | 1          |
| Total Price              |                              |     | = 570 BDT  |

2.4 Design and Simulation:

The converter was designed in MATLAB/Simulink with 9V input, 24V target, 680 µH
inductor, 100 nF capacitor, transistor, diode and 10 kΩ load resistor. Simulation waveforms
showed inductor current buildup and capacitor charging. The output exceeded 24V at 62.5%
duty cycle, while 47.5% duty cycle gave a more stable 24V output.

Fig. 2. Simulink Model of the DC/DC Boost Converter (9v to 24v)

2.5 PWM Generation with ESP32:
Pulse Width Modulation (PWM) is a technique used to control the effective voltage by
switching a signal between HIGH and LOW states. The average voltage depends on the duty
cycle, which is the ratio of ON time to the total switching period.
4 | P age

The ESP32 microcontroller has built-in hardware PWM functionality through the LEDC (LED
Control) module. It allows precise control of frequency, duty cycle, and resolution across
multiple channels.
In this project, the ESP32 was programmed to generate a PWM signal at 100 kHz with a 47.5%
duty cycle. The PWM signal controlled the TIP120 transistor, which switched the inductor
current, enabling the boost converter to step up the voltage from 9V to ~24V
.
2.6 Simulation Result:
Fig. 3. Voltage output across the resistor during Simulation with 47.5% Duty Cycle
Fig. 4. Voltage output across the resistor during Simulation with 62.5% Duty Cycle
5 | P age

2.7 Calculations:
Duty Cycle (Theoretical):
𝑉
𝑖𝑛
𝑉 =
𝑜 1−𝐷
9
𝐷 = 1− = 0.625 (62.5%)
24
In practical implementation, a 47.5% duty cycle was used, which provided an output voltage
close to 24V due to non-idealities in the components.
Inductor Selection:
The inductor value was chosen to limit current ripple and ensure continuous conduction. The
inductor current ripple is given by:
𝑉 ×𝐷
𝑖𝑛
Δ𝐼 =
𝐿 𝐿 ×𝑓
𝑠
Substituting the values:
9×0.5
Δ𝐼 = ≈ 0.066 𝐴
𝐿 680×10−6 ×100×103
Thus, a 680 µH inductor was selected to maintain manageable current ripple.
Capacitor Selection:
The output capacitor was chosen to reduce voltage ripple. The approximate voltage ripple is
given by:
𝐼 ×𝐷
𝑜
Δ𝑉 =
𝑜 𝐶 ×𝑓
𝑠
Assuming a load current 𝐼 = 0.1 𝐴:
𝑜
0.1×0.5
Δ𝑉 = ≈ 5 𝑉
𝑜 100×10−9 ×100×103
A 100 nF capacitor was used in this experiment, but a larger capacitor would further reduce
the ripple for more stable output.
Switching Frequency:
𝑓 = 100 𝑘𝐻𝑧
𝑠
High frequency was selected to reduce inductor and capacitor size while maintaining
efficiency.
6 | P age

2.8 Hardware Implementation:
The circuit was built on a breadboard using ESP32, TIP120 transistor, inductor, capacitor, and
diode. ESP32 generated a 100 kHz PWM with 47.5% duty cycle at GPIO21, which switched
the transistor. When 9V input was applied, the converter successfully boosted the voltage to
~24V.
Fig. 5. Hardware Implementation of the DC/DC Boost Converter and Testing
2.9 ESP32 PWM Code Used:
// ESP32 Boost Converter PWM, Vin = 9V, Vout = 24V, Duty Cycle ≈ 47.5%, Freq =
100kHz
const int pwmPin = 21; // GPIO21 output
const int pwmChannel = 0; // PWM channel
const int pwmFreq = 100000; // 100 kHz switching frequency
const int pwmResolution = 8; // 8-bit resolution (0-255)
// Duty cycle for 47.5% (24V out from 9V in)
int dutyCycle = 122; // ≈ 47.5%
void setup() {// Setup PWM
ledcSetup(pwmChannel, pwmFreq, pwmResolution);
ledcAttachPin(pwmPin, pwmChannel);
ledcWrite(pwmChannel, dutyCycle); // Apply duty cycle
}
void loop() {
// Constant 100 kHz, 47.5% duty }
7 | P age

Chapter 3: Contextual Reasoning in Power Electronics
Power electronics is not only the science of switching devices, voltage conversion, or current
regulation, it is also an art of reasoning in context. When an engineer works with circuits such
as a DC-DC boost converter, the process involves more than solving equations; it involves
understanding the real-world context, anticipating problems, making trade-offs, and drawing
meaningful conclusions from both theory and practice.
3.1 Why Context Matters in Power Electronics
In textbooks, we see neat equations such as:
𝑉
𝑖𝑛
𝑉 =
𝑜 1−𝐷
where V is the output voltage, V is the input voltage, and D is the duty cycle.
o in
Theoretically, if we want to step up 9V to 24V, the equation tells us to use a 62.5% duty cycle.
But when the circuit was built in the lab, something different happened; the converter produced
almost 24V at just 47.5% duty cycle.
There are resistive losses, switching delays, and diode drops that shift the behaviour of the
system. This gap between theory and practice is exactly where contextual reasoning becomes
essential. An engineer must learn to interpret, adapt, and refine designs based on the
environment in which they are applied.
3.2 Reasoning Behind Design Decisions
Every design choice in this project was guided by contextual reasoning:
Microcontroller (ESP32): Selected not only because it could generate PWM signals, but also
because it is affordable, widely available, and easy to program. In a developing country or a
resource-limited lab, these factors matter as much as raw technical performance.
Inductor (680 µH): The choice of inductor was not random. A smaller inductor would have
made the ripple intolerable; a much larger one would be expensive and bulky. Thus, the 680
µH value reflects a balance between practicality and theoretical requirements. Also, it was
verified by the simulations as well.
Switching Frequency (100 kHz): Too low a frequency would need huge inductors and
capacitors. Too high a frequency would create excessive switching losses. Choosing 100 kHz
was again a reasoning exercise balancing efficiency, component size, and feasibility.
Capacitor (100 nF): Though small, it demonstrated the concept effectively within budget
limits. The reasoning here was educational value over absolute performance.
This shows that engineering is not about finding a "perfect" solution, but about finding a
workable, contextual solution.
8 | P age

3.3 Bridging Simulation and Experiment
The project used MATLAB/Simulink simulations before building the hardware.
In simulation: The circuit behaved in a nearly ideal way, producing smooth waveforms and
stable voltage.
In hardware: Results included noise, ripple, and unexpected shifts in duty cycle requirements.
Instead of treating these differences as "errors," we treated them as lessons in contextual
reasoning. We realized that simulations provide guidance, but experiments reveal the truth of
the real world. The act of comparing both and reasoning through the differences is one of the
most valuable skills an engineer can develop.
3.4 Economic, Educational, and Social Context
Contextual reasoning does not stop at the lab bench it also considers the wider context:
Economic: The project cost was only 570 BDT, making it accessible to students. This shows
that innovation does not always require high budgets.
Educational: We learned not only circuit theory but also the discipline of adapting to
limitations skills that prepare them for real engineering challenges.
Social: In countries striving for energy independence, small-scale, low-cost power electronics
solutions like this can play a crucial role in rural electrification, off-grid applications, and
renewable integration.
Thus, the reasoning behind every choice connects theory, practice, economy, and society.
3.5 Conclusion
Contextual reasoning in power electronics is what makes designs successful outside the
classroom. Equations may describe what “should” happen, but reasoning explains why
something else “does” happen and how to adapt accordingly. The boost converter project
illustrates this journey beautifully: from theory to practice, from simulation to hardware, from
ideal assumptions to real-world compromises.
9 | P age

Chapter 4: Sustainable Applications and Environmental Impact
In recent days, as engineers we cannot ignore sustainability. Power electronics, especially
converters like the one built in this project, are at the heart of the global shift toward clean
energy and efficient systems. A simple 9V to 24V boost converter may appear small, but its
principle underpins the technologies that power solar homes, electric vehicles, and LED
lighting.
4.1 Role of Boost Converters in Sustainable Technology
Boost converters play critical roles in many green applications:
Solar Energy: Solar panels often generate only 9-18V, which is too low for charging batteries
or running appliances. A boost converter raises this voltage to a stable, usable level.
Wind Turbines: Small turbines produce fluctuating outputs; converters stabilize them for
storage.
Battery Devices: From medical equipment to mobile gadgets, boost converters extend battery
life by squeezing usable energy from low-voltage sources.
Electric Vehicles: E-bikes and EVs rely on converters for efficient battery-to-motor energy
transfer, reducing fossil-fuel dependence.
LED Lighting: LEDs need regulated higher DC voltages. Boost converters supply this
efficiently, saving both power and costs.
Through these roles, a boost converter is not just a circuit it is a building block of sustainability.
4.2 Environmental Benefits
Using efficient converters brings several environmental advantages:
1. Lower Carbon Footprint: Efficient conversion means less wasted energy, lowering CO₂
emissions.
2. Resource Conservation: By prolonging battery life and improving energy usage,
converters reduce the need for frequent replacements, lowering electronic waste.
3. Scalability to Green Grids: The same principles can be scaled up to megawatt solar or
wind farms, ensuring that renewable sources integrate smoothly into power systems.
4.3 Hidden Environmental Costs
Sustainability also requires honesty about challenges:
Component Waste: Cheap parts may degrade faster, generating more e-waste.
Efficiency Limits: Using a TIP120 transistor instead of a MOSFET increases energy loss as
heat. While affordable, it reduces long-term efficiency.
10 | P age

Material Extraction: Capacitors, inductors, and semiconductors depend on mined resources,
which carry their own ecological impact.
Thus, the sustainability of a design must consider not only its benefits but also its costs to the
environment.
4.4 Future Pathways to Greener Design
This project could be improved to enhance its sustainability:
MOSFET Instead of TIP120: This change would drastically improve efficiency.
Larger Output Capacitor: Would reduce voltage ripple, prolonging device and battery life.
IoT-Enabled ESP32 Control: Adaptive duty cycle algorithms could adjust performance
dynamically, minimizing waste.
Recyclable Materials: Using recyclable circuit boards and components would further reduce
long-term impact.
These steps show how even a small academic project can evolve into a truly green design.
4.5 Educational Sustainability
Finally, one of the biggest contributions of this project is educational sustainability. By learning
how converters work, students are not only building circuits—they are preparing to build the
future. Each project like this creates engineers who can design greener devices, optimize
renewable systems, and reduce environmental harm. In this way, education itself becomes a
sustainable resource for society.
4.6 Conclusion
The boost converter project demonstrates that sustainability is not an abstract idea it is present
in every circuit we build. Whether in solar panels powering a village or in an LED lamp
reducing electricity bills, converters help create a cleaner world. By considering efficiency,
component selection, and future improvements, engineers ensure that their designs serve both
humanity and the planet.
11 | P age

Chapter 5: Effective Individual and Team Performance
Engineering projects are collective journeys where success depends not only on technical
knowledge but also on how effectively individuals and teams perform. The development of the
DC-DC boost converter (9V to 24V) using ESP32 PWM control highlighted the importance of
both individual excellence and teamwork. This chapter reflects on each member’s
contributions, how the group coordinated tasks, and the skills developed along the way.
5.1 Individual Contributions
Each student took responsibility for specific tasks, ensuring that the workload was balanced
and that every stage of the project received full attention. Contributions can be summarized
according to roll numbers:
Roll Contribution Details
2008011 Coding Took primary responsibility for programming the ESP32
microcontroller. Developed and refined PWM code to
achieve a 100 kHz frequency with the correct duty cycle for
smooth converter operation.
2008012 Report Writing Played a key role in preparing the written report, ensuring
clarity and structure. Contributed to documenting project
details, results, and insights for the final submission.
2008013 Circuit Build-up Concentrated on assembling the hardware, connecting
components like the TIP120 transistor, inductor, diode, and
capacitor, ensuring wiring integrity and stability during
testing.
2008014 Report Writing Focused on preparing the written report, refining technical
language, formatting results, and ensuring clarity and
coherence in the documentation.
2008015 Calculations Performed theoretical calculations, including duty cycle
determination, inductor current ripple, and capacitor sizing,
ensuring accuracy for both simulation and practical setups.
2008016 Coding & Contributed to programming the ESP32 microcontroller and
Simulations modelled the boost converter circuit in MATLAB/Simulink.
Tested multiple duty cycles and analysed voltage ripple to
validate theoretical predictions.
2008017 Calculations Assisted in theoretical analysis, performing calculations for
duty cycle, ripple values, and capacitor sizing to support both
simulation and hardware implementation.
2008018 Circuit Build-up Actively worked on constructing and testing the hardware
setup, troubleshooting component issues to ensure reliable
performance during practical implementation.
2008019 Simulations and Modelled the boost converter in MATLAB/Simulink,
Circuit Testing analysed input-output relationships and waveform
behaviours, and assisted in testing the physical circuit to
verify performance.
2008020 Report Writing Assisted in preparing detailed documentation, with a special
focus on Chapter 5 (Teamwork and Individual Performance),
providing reflective insights on collaboration and personal
learning.
12 | P age

5.2 Team Coordination
Although roles were divided, the team worked in a highly collaborative manner. Simulation
results were continuously shared with the coding group to fine-tune PWM generation.
Similarly, theoretical calculations were verified against both MATLAB models and
experimental hardware. Report writers collected data and experiences from all groups to create
a cohesive and professional document.
5.3 Overcoming Challenges Together
The team faced several obstacles, including mismatches between theoretical duty cycles
(62.5%) and practical implementation (47.5%), unexpected output ripple, and voltage drops
due to non-ideal components. These challenges were not solved individually but collectively
by combining coding expertise, hardware adjustments, and simulation analysis.
5.4 Skill Development
Through this collaborative work, the team developed both technical and soft skills:
Technical Skills: Coding microcontrollers, running simulations, circuit building, and
analytical calculations.
Soft Skills: Communication, time management, problem-solving, and collaborative writing.
Every member left the project with new confidence in both engineering and teamwork.
5.5 Conclusion
The success of the DC-DC boost converter project was not the result of one person’s effort, but
of a well-coordinated team where everyone played their part. By distributing roles according
to strengths and interests, the group achieved a balance between individual excellence and
collective achievement. This chapter itself stands as proof of that teamwork, documenting the
contributions of each member and celebrating how effective collaboration transforms technical
challenges into shared success.
13 | P age

Reference
[1] H. Wang and F. Blaabjerg, “Power electronics reliability: State of the art and
outlook,” IEEE Journal of Emerging and Selected Topics in Power Electronics, 2020.
[Online]. Available: https://ieeexplore.ieee.org.
[2] J. L. Afonso, M. Tanta, J. G. O. Pinto, and L. F. C. Monteiro, “A review on power
electronics technologies for power quality improvement,” Energies, 2021. [Online].
Available: https://www.mdpi.com.
[3] J. N. Rai, N. Gupta, and P. Bansal, “Design and Analysis of DC-DC Boost
Converter,” Dept. of Electrical Engineering, Delhi Technological University, India.
[4] K. I. Hwu, C. F. Chuang, and W. C. Tu, “High Voltage-Boosting Converters Based
on Bootstrap Capacitors and Boost Inductors,” IEEE Transactions on Industrial
Electronics, vol. 60, no. 6, pp. –, Jun. 2013.
[5] S. Dhali, P. N. Rao, P. Mande, and K. V. Rao, “PWM-based sliding mode controller
for DC-DC boost converter,” International Journal of …, 2012. [Online]. Available:
https://www.academia.edu.
[6] A. M. Khudhur, F. G. Saber, et al., “Single-switch PWM converters for DC-to-DC
power with reliability tolerance for battery power purposes,” Edison Journal for …,
2024. [Online]. Available: https://ejeee.sss-publisher.com.
[7] D. Hercog, T. Lerher, M. Truntiˇc, and O. Težak, “Design and Implementation of
ESP32-Based IoT Devices,” 2024.
14 | P age