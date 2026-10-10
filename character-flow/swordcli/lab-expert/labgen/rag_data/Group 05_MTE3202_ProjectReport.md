Heaven’s Light is Our Guide
RAJSHAHI UNIVERSITY OF ENGINEERING & TECHNOLOGY
Department of Mechatronics Engineering
A PROJECT REPORT
ON
DESIGN AND IMPLEMENTATION OF A 5V TO 24V BOOST
CONVERTER USING ESP32 CONTROL
Course No: MTE 3202
Course Title: Power Electronics and Drives Sessional
Submitted To
Md. Firoj Ali
Sarafat Hussain Abhi
Head,
Assistant Professor,
Department of Mechatronics Engineering,
Department of Mechatronics Engineering,
Rajshahi University of Engineering &
Rajshahi University of Engineering &
Technology,
Technology,
Rajshahi-6204.
Rajshahi-6204.
Submitted By
No. Name Roll
1 Tanjim Samad Swapnil 2008041
2 Al Nimra Kabir 2008042
3 Sowran Dev 2008043
4 Mostofa Shakil Rafi 2008044
5 Maliha Tanjim 2008045
6 Md.Meherazul Karim 2008046
7 Sarower Hosen Tanim 2008047
8 Mahmuda Islam Opshora 2008049
9 Afnan Akhter 2008050
Date of Submission: August 18, 2025.

Chapter 1
Applying Power Electronics Knowledge
1.1 Introduction
Power electronics is a crucial field in modern electrical and electronic engineering, enabling
the efficient conversion, regulation, and control of electrical power. It is widely applied in
renewable energy systems, electric vehicles, industrial drives, and consumer electronics. One
of the most fundamental areas of power electronics is DC-DC conversion, where voltage levels
are adjusted to meet the requirements of different loads or subsystems.
Among DC-DC converter topologies, the boost converter has gained special significance due
to its ability to step up a low input voltage to a higher output voltage with high efficiency. This
makes it indispensable in battery-powered systems, USB-powered devices, renewable energy
integration, and embedded electronics.
In this project, titled “Design and Implementation of a 5V to 24V Boost Converter Using
ESP32 Control,” we focus on both theoretical and practical aspects of boost converter design.
The project combines classical power electronics knowledge such as converter topologies,
switching device selection, inductor and capacitor sizing with modern embedded control using
the ESP32 microcontroller. The ESP32 provides programmable Pulse Width Modulation
(PWM) signals, which are used to drive the switching MOSFET of the boost converter. This
enables precise duty cycle control and creates opportunities for further system enhancements
such as closed-loop regulation, monitoring, and digital control strategies.
The development of this converter not only strengthens our understanding of fundamental
power electronics concepts but also bridges the gap between theoretical classroom knowledge
and real-world implementation.
1.2 Relevance of Power Electronics in the Project
This project is a direct application of power electronics knowledge to solve a practical
engineering challenge. A typical USB port or small battery pack supplies 5V DC, which is
insufficient to power higher voltage loads such as certain sensors, actuators, communication
devices, or industrial modules that require 24V DC. Instead of using bulky linear regulators or
multiple batteries, a boost converter provides a compact, efficient, and reliable solution.
Key contributions of power electronics in this project include:
1. Switching Devices and Control: The project makes use of a MOSFET switch,
controlled by ESP32-generated PWM signals. Understanding the characteristics of
switching devices, their conduction and switching losses, and gate driving requirements
is a direct application of power electronics knowledge.
Page | 1

2. Energy Storage Components: Inductors and capacitors form the backbone of the
converter. Their correct sizing, based on ripple current and voltage ripple requirements,
highlights the importance of analyzing energy storage and transfer mechanisms.
1. Conversion Principles: The boost converter is governed by the fundamental relation:
𝑉
𝑖𝑛
𝑉 =
𝑜𝑢𝑡 1−𝐷
where 𝐷 is the duty cycle. This project applies this formula both in theoretical design
and experimental validation.
2. Efficiency Considerations: Knowledge of power losses—switching losses,
conduction losses, diode recovery losses—helps in selecting appropriate devices and
operating conditions to maximize efficiency.
3. Digital Control Integration: Using an ESP32, which is not traditionally taught in pure
power electronics, demonstrates the interdisciplinary nature of modern systems where
embedded control and power electronics work hand-in-hand.
1.3 Application of Theoretical Knowledge
The design and implementation of this boost converter is not only a practical exercise but also
a direct application of the theoretical concepts learned in the Power Electronics & Drives
course. Throughout the project, several classroom principles such as converter operation, duty
cycle control, switching device characteristics, and energy storage behavior are translated into
real hardware decisions. By bridging these theoretical foundations with experimental
validation, the project demonstrates how abstract equations and models are essential for
guiding practical design choices and ensuring reliable converter performance.
Several concepts taught in the Power Electronics & Drives course are directly applied in this
project:
• Converter Topology Selection: Understanding the operation of buck, boost, and buck-
boost converters allows us to select the appropriate circuit for stepping up 5V to 24V.
The boost topology is most efficient and suitable for this requirement.
• Duty Cycle and Voltage Gain Relationship: From the basic boost converter relation, we
calculate the required duty cycle to step 5V up to 24V. This demonstrates the critical
link between theory and hardware implementation.
• Inductor Design: Using equations for inductor ripple current, we determine the
minimum inductance required. This ensures continuous conduction mode (CCM)
operation and minimizes current ripple.
• Capacitor Design: The output capacitor is calculated based on voltage ripple
requirements, ensuring a stable DC output.
• Switching Frequency Trade-offs: High frequency reduces component size but increases
switching losses. Choosing the correct switching frequency (using ESP32 PWM)
balances efficiency and component performance.
Page | 2

• MOSFET and Diode Selection: Based on expected current levels, switching speed, and
voltage rating, appropriate power semiconductor devices are chosen.
• Simulation and Analysis: Theoretical design is often validated using software
simulation (MATLAB/PSIM/Proteus), followed by real-world testing.
Thus, the project represents a hands-on application of almost every major concept taught in the
Power Electronics & Drives course.
1.4 Objectives of the Project
The objectives of this project are both technical and educational in nature:
1. Design and Analysis: To design a boost converter circuit that steps up a 5V input
voltage to a regulated 24V output.
2. Microcontroller Integration: To integrate the ESP32 microcontroller for generating
PWM signals to control the MOSFET switch.
3. Component Selection and Optimization: To calculate and select suitable values for the
inductor, capacitor, diode, and MOSFET for stable and efficient operation.
4. Prototype Development: To build and test a working hardware prototype of the
converter.
5. Performance Evaluation: To compare theoretical results with experimental
measurements in terms of output voltage, efficiency, and ripple.
6. Application of Power Electronics Knowledge: To demonstrate how classroom
knowledge of power electronics and drives can be applied to solve a real-world
engineering problem.
1.5 Expected Outcomes
By completing this project, the following outcomes are expected:
• Functional Prototype: A working boost converter circuit capable of reliably stepping
up 5V to 24V.
• Theoretical Validation: Experimental results that match or closely follow theoretical
predictions.
• Efficiency Analysis: Measurement of conversion efficiency, ripple voltage, and
transient response.
• ESP32-Based Control Demonstration: Proof that a low-cost microcontroller can
effectively control power electronic circuits.
• Skill Development: Enhanced skills in circuit design, embedded control programming,
PCB implementation, and experimental testing.
• Practical Understanding: Deeper appreciation of how theoretical knowledge in power
electronics is essential for real-world systems like renewable energy inverters, electric
drives, and portable electronics.
Page | 3

Figure 1.1: Output of the Converter
1.6 Significance of the Project
This project not only demonstrates technical learning but also carries broader practical
significance. From an educational perspective, it strengthens the connection between academic
knowledge and laboratory practice, allowing theoretical concepts to be validated through
hands-on experimentation. Its industrial relevance is evident, as many modules and IoT devices
require higher DC voltages than what is typically supplied, making this converter design
directly applicable. Finally, it promotes interdisciplinary learning by bridging the principles of
power electronics with microcontroller programming and embedded system design.
1. Simplicity and Practical Value:
The boost converter design is based on well-known DC–DC power conversion
principles, making it straightforward to implement with basic power electronics
knowledge.
2. Common and Affordable Components:
The required components such as Arduino, MOSFET, diode, inductor, and capacitors
are inexpensive and widely available in local and online markets. This ensures that the
project can be implemented without relying on costly or specialized hardware.
3. Cost-Effectiveness:
Since the project uses low-power components and open-source hardware (Arduino), the
overall cost remains within a student-friendly budget. This makes the design suitable
for academic, prototype, and laboratory applications.
4. Safety Considerations:
The project operates with a low input voltage of 5V, which is safe for handling during
Page | 4

prototyping. With careful selection of components rated for 24V output, the circuit can
be implemented with minimal safety risks as long as standard precautions are followed.
5. Ease of Prototyping and Testing:
The boost converter can be first assembled on a breadboard or PCB for rapid
prototyping and easy debugging. Arduino-based control allows for quick code
modifications, testing of different duty cycles, and real-time adjustments in the
feedback loop.
6. Educational and Research Value:
This project provides hands-on exposure to power electronics, microcontroller-based
control, and feedback systems. It serves as a valuable academic exercise and can also
form the basis for more advanced research in renewable energy, embedded systems,
and efficient power management.
1.7 Summary
In this chapter, we have highlighted how this project applies to fundamental and advanced
concepts of power electronics. The design of a 5V to 24V boost converter using an ESP32
microcontroller integrates the principles of DC-DC conversion, duty cycle control, switching
device operation, and embedded control. This chapter establishes the theoretical foundation
and motivation for the project, which will be further elaborated in subsequent chapters on
literature review, methodology, design, implementation, and testing.
Page | 5

Chapter 2
Designing Engineering Solutions
Introduction
2.1
Engineering design is the process of transforming theoretical knowledge into a practical
system, which will thinkingly solve a given problem. In this project, the design and
implementation of a boost converter to convert 5V DC to a stable output of 2V DC is to be
accomplished. While conventional boost converters are used primarily to step up the voltage,
our design is geared toward controlled conversion and regulation to provide a lower, precise
output voltage to be used for low power electronic applications.The design of this converter
involves a delicate consideration of a range of engineering principles, such as power
electronics, circuit analysis, and component selection. Dutycyle computation, switching
frequency, inductor sizing, and output filtering are optimized to get a better efficient, stable,
and safe design. Moreover, theoretical calculations are validated through numerical simulation
and prototyping, and the system is optimized for improvements in performance.This chapter
explains the systematic design approach used for the boost converter from specification
definition, mathematical modeling, through component selection and operational performance
trade-offs. Apart from achieving the desired voltage conversion, the goal is for the solution to
be cost-effective, reliable and adaptable for real-world applications.
Objectives
2.2
• To solve a complex engineering problem.
• To design a boost converter which will convert 5V DC to 24V DC.
• To analyze output and result.
Methodology
2.3
2.3.1 Theoretical Calculation
• Inductor,capacitor and resistor value was calculated with theoretical formula.
• Clock pulse frequency and duty cycle was calculated to convert 5V DC to 24V DC.
2.3.2 MATLAB Simulation
• The whole circuit was modeled in Simulink with inductor,IGBT
module,diode,capacitor and resistor.
• Input was set at 5V DC with dc voltage source and the output was measured by
oscilloscope and display.
• The duty cycle was kept 79% and frequeny was 40000Hz.
Page | 6

2.3.3  PWM Signal Generation
ESP 32 was used to generate PWM signal at gate terminal.
•
•  GPIO PIN 5 was used to generate PWM signal.
2.3.4  Hardware Construction
•  The whole circuit was build on breadboard so that if need any component can be
changed quickly.
ESP 32 GPIO 5 PIN was connected to TIP 120 transistor which is used to switch the
•
inductor and store energy.
•  Diode  is  connected  with  inductor  and  accordingly  resistor  and  capacitors  are
connected.
2.3.5  Testing
•  5V DC voltage was applied at input side.
•  By digital multimeter the output voltage was checked.Output was measured through
capacitor terminal
•
MATLAB simulation verified the result.
Component List
2.4
Table 2.4.1: Overall Cost of Our Project
| Component Name  | Functionality  | Quantity  | Price (BDT)  |
| --------------- | -------------- | --------- | ------------ |
ESP32 Development Board  Generates PWM control signal  1  449
| Inductor (5.44 µH)  | Stores and releases magnetic  | 1   | 10  |
| ------------------- | ----------------------------- | --- | --- |
energy
| Capacitor (39.5 µF)      | Smooths output voltage ripple  | 1   | 4          |
| ------------------------ | ------------------------------ | --- | ---------- |
| MOSFET IRF530            | Main switching device          | 1   | 25         |
| Fast Recovery Diode      | Provides current path during   | 1   | 5          |
| (UF4007)                 | OFF cycle                      |     |            |
| Resistor (10 Ω)          | Load/stabilization resistor    | 1   | 1          |
| DC Source (9 V battery)  | Input supply                   | 1   | 75         |
| Load Resistor (1 kΩ)     | For output voltage testing     | 1   | 1          |
| Total Price              |                                |     | = 570 BDT  |

|     |     |     |     |
| --- | --- | --- | --- |
Page | 7

Theoretical Calculation
2.5
Figure 2.1: Boost Converter circuit diagram with ESP 32
Given Parameters
𝑉 = 5 𝑉
𝑠
𝑉 = 25 𝑉
𝑜
𝑅 = 10 Ω
𝑛 = 0.5%
𝑓 = 40,000 𝐻𝑧
Duty Ratio
𝑉
𝑠
𝐷 = 1−
𝑉
𝑜
5
𝐷 = 1− = 0.79
24
Minimum Inductance
𝐷(1−𝐷)𝑅
𝐿 =
𝑚𝑖𝑛 2𝑓
0.79(1−0.79)×10
𝐿 =
𝑚𝑖𝑛 2×40,000
𝐿 = 4.35 𝜇𝐻
𝑚𝑖𝑛
Page | 8

Maximum Inductance (25% Larger)
𝐿 = 1.25×𝐿
𝑚𝑎𝑥 𝑚𝑖𝑛
𝐿 = 1.25×4.35 = 5.44 𝜇𝐻
𝑚𝑎𝑥
Minimum Capacitance
𝐷
𝐶 =
𝑅𝑛𝑓
0.79
𝐶 =
10×0.05×40,000
𝐶 = 39.5 𝜇𝐹
Design and Simulation
2.6
MATLAB Simulink was used to simulate and verify the result.5V DC was applied to the input
terminal.Inductor (5.44µH) was connected in series with power supply.To store power in that
a N-chanel mosfet was connected.Which gate terminal is connected with ESP 32 GPIO PIN
5.A diode is connected in series and as usal capacitor (39.5µH) is used to smoothen the output
and the voltage is measured across load resistor (10Ω).In Simulink a oscilloscope and display
is connected at output.And another two output oscilloscope is connected to measure both input
and output.
Figure 2.2: Simulation of boost converter in MATLAB Simulink
Page | 9

ESP 32 PWM Generation
2.7
ESP32 produces PWM by using its hardware LEDC (LED Control driver), a counter of cycles
and a switch between a HIGH and a LOW state on a GPIO pin per cycle. Each cycle has a
duration of 25 µs and the pin-level is ON with a 79% duty cycle and in each cycle, the pin is
ON 19.75 µs and OFF 5.25 µs. This hardware-based, high-resolution PWM is necessary to
control the boost converter since the duty cycle is what directly controls switching in the
MOSFET, energy flow in the inductor, and eventually the output voltage. It is also operated at
40 kHz to minimize ripple and to enable smaller passive components, making the system
efficient and more stable.
2.7.1 ESP 32 Code for generating PWM frequeny
const int pwmFreq = 40000;
const int pwmChannel = 0;
const int pwmResolution = 10;
const int pwmPin = 5;
const int dutyCycle = (int)(0.79 * ((1 << pwmResolution) - 1));
void setup() {
ledcSetup(pwmChannel, pwmFreq, pwmResolution);
ledcAttachPin(pwmPin, pwmChannel);
ledcWrite(pwmChannel, dutyCycle);
}
void loop() {
}
Page | 10

Simulation Result
2.8
The designed boost converter was simulated in MATLAB/Simulink and the output waveforms
were viewed with an oscilloscope block. The input voltage of 5 V (yellow trace) is effectively
stepped up to about 24-25 V at the output (blue trace), as shown in the figure thus confirming
the theoretical design calculations. The output voltage shows that there is a small ripple about
the steady-state value. This ripple should occur because of charging and discharging nature of
the inductor and switching behavior of the diode and MOSFET. The value of ripple is not too
large to be acceptable, which means that the values of inductance and capacitance used is
sufficiently large to keep the voltage constant within the specified load.
Figure 2.3: MATLAB Simulink Result
The measured performance allows us to conclude that the boost converter functions as
intended, and the target voltage gain is obtained using a duty cycle of 79 percent and a
switching frequency of 40 kHz. Ripple shows the pragmatic character of switching converters,
in which an ideal DC output can not be reached, but can be reduced through smoothing of
passive components. Generally, both the theoretical design and the control approach are
confirmed in the simulation showing that converter can effectively scale-up a 5 V supply to
controlled 25 V output.
Page | 11

Hardware Implementation
2.9
The boost converter was implemented on a breadboard platform in hardware to do quick
prototyping and testing. To place the PWM signal at 40 kHz with a duty cycle of about 79
percent, an ESP32 microcontroller was utilized to supply the switching control necessary to
the MOSFET. The circuit is powered by inductors over toroidal cores which are the storage of
the energy needed to step-up the input voltage. A potentiometer was added to enable the control
parameters to be adjusted and a 9 V DC battery was taken as the input supply source.The power
stage of the boost converter is interconnected by the wiring with the passive and active
components, the inductor, diode, and the capacitor. The ESP32 is supplied through the USB to
be stable and generate signals. This system proves the implementation of the converter in a
practical manner that can bridge the gap between the simulation results and experimental
validation. Despite the use of a breadboard in the first testing, the design has been able to re-
create the desired step-up behavior, thus it is possible to note that the proposed engineering
solution is viable.
Figure 2.4: Hardware implementation of boost converter
Page | 12

Chapter 3
Contextual Reasoning for Power Electronics
3.1 Component Selection and Trade-Offs for Efficiency
The Boost Converter requires careful selection of components to ensure high efficiency and
stable performance. Given the high duty cycle of the converter, components must be chosen to
handle significant stress while minimizing losses.
Inductor and Capacitor: The inductor should be large in order for energy storage not to saturate
and result in poor performance, and the capacitor smooths out the output voltage. A proper
inductor size and capacitance should be chosen not to have much ripple and ensure continuous
conduction mode (CCM), where energy transmission is done efficiently and smoothly.
MOSFET and Diode: MOSFET and diode are responsible for switching and energy flow
control. In order to reduce conduction loss and switching loss, low resistance MOSFETs and
Schottky diodes are chosen. They support the high current and switching rate needed by the
high duty cycle while remaining efficient and lessening heat production.
The selection of appropriate components ensures that the Boost Converter operates optimally,
with low energy loss and thermal stress.
3.2 Voltage Regulation and Stability
One of the significant challenges for a Boost Converter is stable voltage control. The load and
input voltage variations will lead to output voltage variations. A feedback control system is
employed for counteracting this. The system varies the duty cycle adaptively for a stable output
of 24V, enabling the converter consistently to accommodate variations in the input or in the
load conditions.
This real-time correction is essential for the converter output stability and shows the need for
feedback control for a successful power electronic design.
3.3 Thermal Management
The high duty cycle also increases the component stress, especially that of MOSFET and
inductor, and results in more power dissipation and overheating. Proper thermal management
has to be done in order to prevent component failure due to excessive heating.
Heat sinking and efficient design of a PCB are also essential in enabling the components to
remain at safe temperatures. Efficient heat dissipation also makes the converter reliable for
Page | 13

long periods of usage, particularly in real-world applications where thermal stress is a serious
issue.
3.4 Optimization and Trade-offs
Whereas design at a theoretical level creates a basis, practical applications very often require
compromise. The selection of switching frequency, for example, has a direct bearing both on
efficiency and component packaging. Higher switching frequencies minimize component
packaging at the expense of increased switching loss, and a delicate balance has to be struck
for a desired performance.
Likewise, PWM control integration using ESP32 gives highly accurate duty cycle adjustments
for optimized performance and ease of adjustments and monitoring. This identifies that there
need to be both analog and digital solutions for today's power electronics design applications
that need accurate control and efficiency.
3.5 Conclusion
Contextual reasoning for Boost Converter design stresses the importance of applying practical
constraints to theoretical knowledge. By employing the appropriate components, real-time
control of voltage, thermal control, and optimization of system performance by trade-off, the
converter can efficiently and reliably function. The design decisions that are made within this
chapter verify that the Boost Converter reliably raises from 5V to 24V and meets real-world
applications performance requirements.
Page | 14

CHAPTER 4
Sustainable Applications and Environmental Impact
4.1 Introduction
In the modern world the engineering practice sustainability has become more important as
performance and efficiency. In Power Electronics, DC-DC converters as the boost converter,
are designed not only for electrical functionality but also for their broader role in environmental
and societal development. The project “Design and Implementation of a 5V to 24V Boost
Converter Using ESP32” is aligned with these sustainable goals because it demonstrates how
small, efficient, and low-cost electronic systems can reduce resource consumption and promote
the integration of renewable energy.
4.2 Role of Boost Converter in Sustainable Systems
The boost converter contributes to sustainability in several ways:
• Efficiency: Boost converters operate more efficiently than linear regulators by
transferring energy rather than wasting excess energy through heat. Since the goal is to
avoid energy waste and burn when an energy source is limited, especially, for example,
a battery or solar panel.
• Renewable Energy: Many renewable energy devices, regardless of their power
potential, have low (5-12V) outputs, like most small-scale photovoltaic (PV) panels. A
boost converter will step up voltages to viable levels in batteries or devices and make
using renewable energy simple and practical.
• Compact and Low-Cost: Relying on inexpensive and available components to build
this converter, it does not have large, resource-intensive equipment, reducing much
resource impact to create a material footprint.
4.3 Environmental Impact of the Project
The ecological importance of this project can be classified as either direct or indirect impacts:
• The direct impact is that the converter operates at low voltage and uses minimum power
during the experiments, allowing for safe operation (with little emission and no
hazardous byproducts).
• The indirect impact is that the converter provides the technical basis for applications
that would reduce fossil fuel reliance; for example, solar-powered applications, energy-
efficient portable electronics, and green IoT devices. This indirect use of small-scale
renewable energy sources reduces greenhouse gases and encourages greener energy
use.
Page | 15

4.4 Sustainable Applications
This project demonstrates several practical applications that align with sustainable
development goals:
1. Solar-Powered Systems: A 5V solar panel can be boosted to 24V to charge batteries
or operate equipment, promoting renewable energy in rural or off-grid areas.
2. Low-Cost Educational Tools: The design can be replicated by students using
affordable components, making it an accessible learning tool without requiring high
resource consumption.
3. Energy-Conscious Devices: Many IoT sensors and microcontrollers operate from
limited energy sources. Using a boost converter allows them to run longer and more
reliably, lowering the frequency of battery replacements and reducing electronic waste.
4. Portable and Wearable Electronics: By providing efficient voltage conversion, the
project supports lightweight and eco-friendly device design, which uses fewer materials
and consumes less power.
4.5 Sustainability Considerations in Design
While developing the converter, several choices were made that reflect sustainable engineering
practices:
• Low Power Input: Operating with a 5V source ensures safety and minimal energy
usage during testing and operation.
• Reusable Components: The MOSFET, inductor, and capacitors are standard parts that
can be reused in future projects, avoiding waste.
• Scalability: The same design principles can be applied to larger systems such as solar
inverters or electric drives, amplifying their long-term sustainable impact.
• Minimizing Heat Dissipation: Efficient switching operations reduce unnecessary
heating, which not only saves energy but also prolongs the lifespan of components,
thereby reducing electronic waste.
4.6 Educational and Environmental Value
The project is not limited to academic purposes. It has broader educational and environmental
value:
1. Students and researchers learn about energy efficient systems design with sustainability
in mind.
2. The converter provides an entry point for real world projects based on renewable
energy, green electronics, and environmentally friendly technology.
3. Raising awareness of efficient energy conversion is part of the culture of responsible
engineering, in which the care for the environment prevails.
Page | 16

4.7 Summary
In summary, the boost converter project is not merely a technical act of solving a problem but
begins to cross into the realm of sustainable engineering. So, energy efficiency, renewable
energy, size reduction, and waste considerations can contribute to the global movement
towards reducing impact on the environment. Its applications to solar power, portable devices,
and education are more relevant to building a more sustainable, green future.
Page | 17

Chapter 5
Effective Individual and Team Performance
5.1 Introduction
Effective engineering projects rely on coordinated teamwork. It is common practice for
complex systems to be developed by groups rather than individuals. In our 5V→24V boost-
converter project, the team explicitly divided the work so that all key tasks were covered. For
example, some members focused on circuit design and simulation (selecting the inductor,
diode, MOSFET, and capacitors), while others developed and tested the Arduino firmware for
PWM control and feedback. Additional members built the hardware prototype on a breadboard
and performed measurements, and others compiled reports and documentation. This
distribution follows engineering education best practice: as one source notes, students “are
increasingly expected to work in teams and participate in projects”. Frequent meetings and
shared documentation ensured that, despite working on different parts, everyone stayed aligned
toward the project’s goal.
5.2 Division of Responsibilities
To manage our distributed effort, the team allocated responsibilities along functional lines.
i. Circuit design and simulation: Calculating component values and modelling the boost
converter’s power stage (inductor, diode, MOSFET, output capacitor) to predict its behaviour
under various loads.
ii. Control software: Writing and testing the Arduino code, including configuring PWM
generation and implementing the feedback control algorithm.
iii. Hardware prototyping: Assembling the boost circuit on a breadboard or PCB, wiring the
MOSFET and passive components, and setting up the Arduino connections.
iv. Testing and debugging: Measuring voltages and waveforms (using multimeters and
oscilloscopes), identifying issues in the converter’s operation, and iterating on design.
v. Documentation and coordination: Recording test results, creating schematics, and writing the
report, while ensuring that all team members were up to date on progress and changes.
Figure 5.1: Circuit diagram of Boost Converter Figure 5.2: Generic topology for a
Using Arduino boost convert
Page | 18

The Arduino generates the PWM drive to the MOSFET and reads the converter’s output via an
analog input. The physical prototype was assembled on a standard solderless breadboard, as
shown above. In this setup, the Arduino board provided the PWM signal to the MOSFET gate
and measured the converter’s output through an analog input. The required inductor, diode and
a large output capacitor are visible, illustrating how the power stage and controller were
connected. This hands-on arrangement enabled rapid testing: when one member tweaked a
component or uploaded new code, the effects were immediately observable. Dividing the
workload in this way allowed the team to make parallel progress and later integrate subsystems
smoothly. By clearly defining roles but maintaining open communication, each member’s
efforts contributed to the shared objectives without duplication of work.
5.3 Technical Challenge
5.3.1 Achieving the Voltage Boost
During testing, the team encountered a significant technical hurdle: the converter initially failed
to reach the intended 24V output. Under open-loop (fixed duty-cycle) conditions, the output
stalled well below the target. Recognising that a simple PWM setting was insufficient, the team
embarked on systematic troubleshooting. One contributor had warned that “control loops are
hard” and that factors like sampling rate and PWM frequency make boost regulator design “a
highly mathematical exercise”. With that in mind, we first verified each subsystem carefully.
We checked the MOSFET’s switching waveform on an oscilloscope, confirmed that the
inductor and diode were the correct type and rating, and ensured proper grounding and wiring.
To improve hardware stability, the team added a large electrolytic capacitor (≈2200 µF at 25V)
at the converter output. This smoothing capacitor helps hold the boosted voltage during
switching and is a standard practice for stabilising boost converters.
Our debugging process included:
• Subsystem testing: Verifying individual components and signals. We measured the
raw output voltage and the MOSFET gate waveform, checking that the circuit topology
matched the design. Any wiring errors or faulty components were ruled out.
• Hardware improvements: Adding or adjusting components to support boosting. As
noted, a large output capacitor was installed. We also ensured the input supply was stiff
and added small decoupling capacitors to the Arduino supply to prevent resets.
• Feedback control implementation: Implementing closed-loop control in the Arduino
code. The converter’s output (scaled into the Arduino’s 0-5 V input range) was fed into
an analog pin, and the software adjusted the PWM duty cycle based on the voltage
error. In this way, the converter operated as a closed-loop system. This approach
matches standard voltage-mode control schemes for boost converters. We coded a
simple proportional controller that increased the duty cycle when the measured output
was below the 24V setpoint.
• Iterative tuning: Gradually adjusting parameters based on test results. After enabling
feedback, we performed a sequence of tests: if the output overshot or oscillated, we
reduced the control gain or added a small dead-time; if the output was slow to rise, we
Page | 19

incrementally increased the gain. Each iteration involved measuring the response and
discussing the results as a group. Eventually, the output converged to 24V reliably, even
under varying input or load conditions.
Through this structured approach combining hardware fixes with control software
improvements, the team overcame the initial limitation. The converter ultimately achieved the
required boost as specified. The process demonstrated how collaborative troubleshooting and
an improved control strategy can resolve complex power-electronics challenges.
5.3.2 Communication and Adaptive Learning
Throughout the project, continuous communication and learning were crucial. The team held
regular meetings to share findings and coordinate next steps. When a problem arose in one
area, that insight was immediately communicated: for instance, if the circuit team observed
unexpected voltage ripple, they discussed it with the software team to see if the code should
compensate, and vice versa. This exchange ensured that knowledge was pooled, not siloed.
Team members also did not hesitate to learn from external sources or from one another. For
example, when one person researched Arduino timer settings to increase PWM frequency, they
taught the team how to modify the code. This collaborative, open culture reflects recognised
teamwork principles. As one educational framework observes, strong engineering teams
“collaborate across disciplines and show respect for the contributions of all members and their
unique roles”. In our group, everyone’s perspective was valued. If the coder suggested a new
algorithm, the circuit designer was open to test it; if a builder noticed a wiring issue, the
software developer adjusted the code accordingly. By listening to each other and adapting
together, the team quickly bridged knowledge gaps. This adaptive learning meant that hardware
and control limitations were progressively overcome by collective effort rather than individual
trial-and-error.
5.3.3 Aspects of our individual and team performance included
• Clear role division: Each member focused on a specific area (design, coding, testing,
documentation) while remaining aware of the overall goal.
• Iterative troubleshooting: Problems were resolved through systematic testing,
combining hardware modifications (such as adding output capacitance) with refined
control software.
• Effective communication: Regular coordination ensured that new ideas or problems
were shared promptly; peers reviewed and cross-checked each other’s work to catch
issues early.
• Adaptive learning: Team members quickly researched solutions or taught each other
unfamiliar concepts, turning setbacks into learning opportunities.
• Unified objective: Despite varied tasks, everyone remained committed to the project’s
single goal (achieving 24V output). This focus meant that all individual contributions
aligned toward a successful, integrated solution.
By distributing responsibilities, communicating openly, and learning from each challenge, the
team’s individual efforts coalesced into a coherent system. This synergy, each person’s work
reinforcing the others’, was instrumental in achieving the boost converter’s design objectives.
Page | 20

Reference
[1] R. W. Erickson and D. Maksimović, Fundamentals of Power Electronics, 2nd ed. Boston,
MA, USA: Springer, 2001.
[2] N. Mohan, T. M. Undeland, and W. P. Robbins, Power Electronics: Converters,
Applications, and Design, 3rd ed. Hoboken, NJ, USA: Wiley, 2003.
[3] M. H. Rashid, Power Electronics: Circuits, Devices, and Applications, 4th ed. London,
U.K.: Pearson, 2013.
[4] S. Cuk and R. D. Middlebrook, “A general unified approach to modelling switching DC-
to-DC converters in discontinuous conduction mode,” in Proc. IEEE Power Electronics
Specialists Conf., Cleveland, OH, USA, 1977, pp. 36–57.
[5] A. Prodic, D. Maksimović, and R. W. Erickson, “Design and implementation of a digital
PWM controller for a high-frequency switching DC–DC power converter,” in Proc. IEEE
Power Electronics Specialists Conf., Cairns, QLD, Australia, 2002, pp. 510–516.
[6] Espressif Systems, “ESP32 Technical Reference Manual,” Espressif, 2022. [Online].
Available: https://www.espressif.com/en/support/documents/technical-docs
[7] M. A. Khan, M. S. Hossain, and M. A. Rahman, “Design and implementation of a boost
converter for renewable energy applications,” Int. J. Renewable Energy Res., vol. 8, no. 3, pp.
1521–1529, Sep. 2018.
[8] H. Kanaan, F. Bacha, and P. Venet, “Design and implementation of a digitally controlled
boost converter,” IEEE Trans. Ind. Electron., vol. 58, no. 6, pp. 2491–2494, Jun. 2011.
[9] S. Buso and P. Mattavelli, Digital Control in Power Electronics, 2nd ed. San Rafael, CA,
USA: Morgan & Claypool, 2015.
[10] A. P. Chandrakasan, W. J. Bowhill, and F. Fox, Design of High-Performance
Microprocessor Circuits. Piscataway, NJ, USA: IEEE Press, 2000.
Page | 21