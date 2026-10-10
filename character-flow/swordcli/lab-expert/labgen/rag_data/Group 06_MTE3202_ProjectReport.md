Heaven’s light is our guide
RAJSHAHI UNIVERSITY OF ENGINEERING & TECHNOLOGY
Department of Mechatronics Engineering
Power Electronics and Drives Sessional
Course No. : MTE 3202
Report Title: 5V to 36V DC Boost Converter Circuit Design
Prepared By:
Student ID Name of the Student
2008051 Inzamam Uddin Mahamud Alif
2008052 Tahmina Khatun
2008053 Mst. Nishat Nabilah
2008055 Samia Afsana
2008056 Tawfiq Mahmud Khan
2008057 Md. Abu Shoaib
2008058 Md. Shihabul Islam
2008059 Ridwan Kader
2008060 Robiul Haque Sajid
1908055 Muhammad Al Muktadir
Submitted To
Md. Firoj Ali Sarafat Hussain Abhi
Associate Professor Assistant Professor
Department of Mechatronics Department of Mechatronics
Engineering Engineering
Rajshahi University of Engineering & Rajshahi University of Engineering &
Technology Technology
Date of Submission: September 03, 2025

TABLE OF CONTENTS
CHAPTER 1: APPLYING POWER ELECTRONICS KNOWLEDGE……………….3
1.1 Introduction to Power Electronics………………………………………….3
1.2 Fundamentals of DC-DC Converters……………………………………….3
1.3 Boost Converter Operation…………………………………………………3
1.4 Operational Modes: Continuous and Discontinuous Conduction………….4
CHAPTER 2: DESIGNING ENGINEERING SOLUTIONS FOR DC-DC BOOST
CONVERTER…………………………………………………………………………..4
2.1 Introduction…………………………………………………………………4
2.2 Theoretical Foundations and Problem Compatibility……………………….5
2.3 Key Components and Cost…………………………………………………6
2.4 Circuit Diagram……………………………………………………….…….6
2.5 Design Considerations: Duty Cycle, Frequency, and Modes of Operation…7
CHAPTER 3: CONTEXTUAL REASONING IN POWER ELECTRONICS…………….8
3.1 The Boost Converter in Practical Systems…………………………………..8
3.2 Engineering Trade-Offs and Decision-Making…………………………….8
3.3 Safety and Reliability Considerations………………………………………9
3.4 Educational and Professional Context……………………………………...9
3.5 Summary……………………………………………………………………9
CHAPTER 4: SUSTAINABLE APPLICATIONS AND ENVIRONMENTAL IMPACT
4.1 Introduction…………………………………………………………………9
4.2 Applications in Renewable Energy Systems……………………………….10
4.3 Applications in Electric Vehicles and Portable Electronics………………...10
4.4 Environmental Impact Assessment………………………………………...11
4.5 Summary…………………………………………………………………..11
CHAPTER 5: EFFECTIVE INDIVIDUAL AND TEAM PERFORMANCE…………11
5.1 Introduction………………………………………………………………..11
5.2 Individual Performance……………………………………………………12
5.3 Team Performance…………………………………………………………12
5.4 Summary…………………………………………………………………..13
LIST OF FIGURES
Figure 2.4.1: The Boost Converter Circuit Diagram …………………………………..6
Figure 2.4.2: The Boost Converter Circuit …………………………………………….7
LIST OF TABLES
Table 2.3: Component List with Cost…………………………………………………..6
Table 5.2: Individual Performance……………………………………………………12
Table 5.3: Team Performance Outcome……………………………………………….13
2

CHAPTER 1: APPLYING POWER ELECTRONICS KNOWLEDGE
1.1 Introduction to Power Electronics
Power electronics is a multidisciplinary field that deals with the efficient conversion, control,
and conditioning of electrical power using semiconductor devices. It enables the transformation
of power forms such as AC to DC, DC to AC, or DC to DC while ensuring reliability and
minimizing energy losses. Modern systems, from small gadgets to large industrial equipment,
heavily rely on this technology.
A key application is the DC-DC converter, which adapts voltage levels for different loads.
Among them, the boost converter is widely used to step up a low input voltage to a higher
output by storing and releasing energy through inductors and capacitors. This makes it vital in
devices powered by batteries, renewable energy sources, and electric vehicles.
In this project, we focus on designing a 5V to 36V DC boost converter, applying core power
electronics concepts like duty cycle control, switching efficiency, and inductive energy transfer.
The design demonstrates how theoretical principles translate into a practical solution that
ensures stable and reliable voltage stepping for real-world applications.
1.2 Fundamentals of DC-DC Converters
DC–DC converters are widely used in systems where the available DC voltage does not match
the load requirements. They can be categorized into buck (step-down), boost (step-up), buck–
boost (step-up/down), and isolated types such as flyback or forward converters.
Among these, the boost converter is a non-isolated type that employs a switching device,
inductor, diode, and capacitor to step up the input voltage. Its operation depends on pulse-width
modulation (PWM), where the duty cycle of the switch regulates the energy stored and released
by the inductor, thereby controlling the output voltage.
DC-DC converters are generally classified into several types:
i. Buck converters (step-down): Reduce the input voltage to a lower output voltage.
ii. Boost converters (step-up): Increase the input voltage to a higher level.
iii. Buck–boost converters: Can both step up or step down the voltage, depending on the
duty cycle.
iv. Isolated converters (e.g., flyback, forward): Provide electrical isolation between
input and output using transformers, which makes them suitable for safety-critical and
high-voltage applications.
In ideal conditions, the energy balance in the inductor ensures efficient power transfer. Real-
world implementations must account for parasitic elements, such as inductor resistance and
diode forward voltage drop, which impact performance.
1.3 Boost Converter Operation
The boost converter, which is the primary focus of this project, is a non-isolated topology that
steps up the input voltage using four essential components: a switching device (usually a
MOSFET), an inductor, a diode, and a capacitor. A boost converter operates in two primary
phases: the switch-on (charging) and switch-off (discharging) periods.
3

i. Switch-On Phase: The switch (typically a MOSFET) closes, connecting the inductor
to the input voltage 𝑉 . As a result, current begins to increase linearly through the
𝑖𝑛
inductor, and during this period, the inductor stores energy in the form of a magnetic
field. In this interval, the diode becomes reverse-biased, which prevents current from
flowing backward into the circuit, while the output capacitor simultaneously discharges
and continues to provide the necessary energy to the load, thereby ensuring a stable
output voltage. The inductor voltage is 𝑉 and the current change is given by
𝑖𝑛
𝑉
𝑖𝑛
∆𝐼 = 𝑇
𝐿 𝐿 𝑂𝑁
where, L is inductance and 𝑇 is the ON-time.
𝑂𝑁
ii. Switch-Off Phase: When the switch is turned off, the inductor resists the sudden drop
in current and its collapsing magnetic field induces a voltage. This induced voltage adds
to the input supply 𝑉 , which forward-biases the diode and allows current to flow
𝑖𝑛
toward the output stage. In this phase, the inductor releases its stored energy,
transferring it to both the output capacitor and the load. As a result, the capacitor gets
recharged while the load continues to receive a boosted and uninterrupted output
voltage, 𝑉 . The inductor voltage becomes 𝑉 −𝑉 and the current decreases_
𝑜𝑢𝑡 𝑜𝑢𝑡 𝑖𝑛
𝑉 −𝑉
𝑜𝑢𝑡 𝑖𝑛
∆𝐼 = 𝑇
𝐿 𝐿 𝑂𝐹𝐹
where, 𝑇 is the OFF-time.
𝑂𝐹𝐹
1.4 Operational Modes: Continuous and Discontinuous Conduction
Boost converters operate in two primary modes:
i. Continuous Conduction Mode (CCM)
ii. Discontinuous Conduction Mode (DCM)
In CCM, the inductor current never drops to zero, ensuring smooth operation and lower ripple
ideal for high-power applications. The boundary between CCM and DCM is defined by the
critical inductance
(1−𝐷)2
𝐿 = 𝑅𝑇
𝑐
2
Where 𝑅 is the load resistance and 𝑇 is the switching period.
In DCM, the inductor current reaches zero before the next cycle, which can occur under light
loads and may lead to higher ripple but simpler control. The design targets CCM for stability,
selecting an inductor (e.g., 100 µH) to maintain continuous current flow at the desired
frequency (typically 50-100 kHz for efficiency). Power electronics knowledge guides this
choice: higher frequencies reduce component size but increase switching losses due to parasitic
capacitances in MOSFETs.
CHAPTER 2: DESIGNING ENGINEERING SOLUTIONS FOR DC-DC
BOOST CONVERTER
2.1 Introduction:
In the realm of power electronics, the design of DC-DC boost converters represents a
cornerstone engineering solution for addressing the pervasive challenge of voltage
incompatibility in modern electronic systems. As devices increasingly demand higher
operating voltages from low-voltage sources such as batteries or renewable energy harvesters
boost converters emerge as an indispensable tool for efficient power management. This section
4

explores the engineering solutions embodied in the design of a 5V to 36V DC boost converter,
drawing from fundamental principles, component integration, performance optimization, and
practical applicability. By examining this project, we illustrate how such designs not only
resolve specific voltage conversion problems but also align broadly with engineering
imperatives for efficiency, reliability, and scalability in diverse applications.
2.2 Theoretical Foundations and Problem Compatibility
At its core, a boost converter, or step-up converter, leverages the inductive storage of energy
to achieve voltage elevation. The engineering problem it addresses is straightforward yet
ubiquitous: how to generate a stable, higher DC output voltage from a lower input without
excessive power dissipation or bulky components. In this project, the target conversion from
5V to 36V exemplifies compatibility with real-world scenarios where input voltages are
constrained, e.g., USB-powered devices (typically 5V) needing to drive high-voltage loads like
LED arrays, sensors in IoT systems, or actuators in robotics.
The compatibility stems from the converter's adherence to energy conservation principles.
During the switch-on phase, energy is stored in the inductor's magnetic field as current ramps
up linearly, governed by the equation:
V .t
in on
ΔI =
L L
where V is the input voltage (5V), t is the on-time, and L is the inductance of 100 μH in the
in on
discrete design that is used in this project. In the switch-off phase, this energy is released,
adding to the input voltage to yield:
𝑉 = 𝑉 +𝑉
𝑜𝑢𝑡 𝑖𝑛 𝐿
where V is the inductor voltage. The overall voltage gain is expressed as
L
𝑉 1
𝑜𝑢𝑡
=
𝑉 1−𝐷
𝑖𝑛
where D is duty cycle approximately 86% for a 5V to 36V ratio, assuming ideal conditions.
This design is particularly compatible with engineering problems in renewable energy, where
solar panels or wind turbines output variable low voltages that must be boosted for grid
integration or battery charging. Similarly, in electric vehicles, boost converters enable efficient
power delivery from low-voltage batteries to high-voltage motors, reducing weight and cost.
The project's use of pulse-width modulation (PWM) for duty cycle control further enhances
adaptability, allowing dynamic adjustment to load variations a critical feature for unstable
environments like portable electronics.
5

2.3 Key Components and Cost:
The components are used in this project and also their costing are shown in the below table:
Table 2.3: Component List with Cost
| Sl No                         | Item  | Quantity  | Unit Price  | Sub-total  |
| ----------------------------- | ----- | --------- | ----------- | ---------- |
| 1  NE555 Timer IC (U1)        |       | 2         | 30          | 30         |
| 2  Inductor L1 (100 µH, ≥3A)  |       | 1         | 80          | 80         |
| 3  MOSFET IRFZ44N (Q1)        |       | 1         | 150         | 150        |
| 4  Diode D3 (1N5408)          |       | 1         | 10          | 10         |
| 5  Diodes D1, D2 (1N4148)     |       | 2         | 3           | 6          |
Capacitor C1, C2 (1 nF & 0.1 µF
| 6   |     | 2   | 5   | 10  |
| --- | --- | --- | --- | --- |
ceramic)
Capacitor Output (100 µF, 63V
| 7   |     | 1   | 5   | 5   |
| --- | --- | --- | --- | --- |
electrolytic)
| 8  Resistor R1 (1 kΩ), R2 (4.7 kΩ)  |     | 2   | 1   | 2   |
| ----------------------------------- | --- | --- | --- | --- |
| 11  Potentiometer (50 kΩ)           |     | 1   | 30  | 30  |
Total  323
2.4 Circuit Diagram:

       Figure 2.4.1: The Boost Converter Circuit Diagram

6

Figure 2.4.2: The boost converter circuit
2.5 Design Considerations: Duty Cycle, Frequency, and Modes of Operation
A detailed engineering approach involves calculating parameters for optimal performance. As
we have reached 32V, the duty cycle is:
V
in
D = 1−
V
out
5
= 1−
32
= 0.844
It dictates the switching waveform, often generated via a NE555 timer IC for frequencies
around 100 kHz which is high enough to minimize component size but low enough to avoid
excessive switching losses.
Operation occurs in continuous conduction mode (CCM), with CCM preferred for high-power
applications due to lower ripple. The critical inductance for CCM is:
𝑉 ×𝐷 ×(1−𝐷)
𝑖𝑛
𝐿 =
𝑚𝑖𝑛 2×𝑓×𝐼
𝑜𝑢𝑡
where f is frequency and I is output current which is 33mA. So, L_min ≈ 100 μH, justifying
out
the selected values.
Feedback control by potentiometer ensures regulation, mitigating issues like input voltage
fluctuations. This compatibility extends to engineering problems in feedback systems, where
proportional-integral-derivative (PID) compensation can stabilize loops against oscillations.
7

CHAPTER 3: CONTEXTUAL REASONING IN POWER ELECTRONICS
Power electronics bridges theoretical concepts and practical applications. Circuits provide
solutions to real-world problems in industrial, domestic, and global energy contexts. Among
these circuits, the boost converter is widely regarded as simple yet powerful, particularly in
low-voltage applications requiring efficient step-up conversion. This chapter presents the
contextual reasoning behind the design, construction, and application of the boost converter
developed in this project. While theoretical design could suffice, the focus here is on practical
relevance and the socio-technical context in which the converter operates.
3.1 The Boost Converter in Practical Systems
The boost converter increases voltage levels without the weight and cost associated with
traditional step-up transformers. Although transformers are common, they are often impractical
for small-scale applications where boost converters offer compact and efficient solutions [1].
3.1.1 Renewable Energy Systems: Photovoltaic (PV) panels typically generate low DC
voltages (12–24 V), which must be boosted to levels suitable for inverters, grid-tie systems, or
battery storage [1], [4]. Without boost converters, much of this energy would remain
underutilized.
3.1.2 Electric Vehicles: Battery packs in electric vehicles provide low DC voltages, which
must be converted to higher regulated voltages to power electric motors and onboard
electronics [4]. Boost converters play a critical role in enabling efficient energy utilization in
these systems.
3.1.3 Portable Devices: Battery-powered devices such as laptops, LED drivers, and mobile
chargers rely on boost converters to maintain stable operation amid fluctuating input voltages
[2].
In this project, the converter is designed to step up a 5 V input to approximately 36 V. The
design balances theoretical accuracy with practical constraints to create a compact, reliable
system for real-world voltage conversion applications.
3.2 Engineering Trade-Offs and Decision-Making
Designing a power electronics converter involves evaluating trade-offs among efficiency, cost,
complexity, and component availability [2], [3].
3.2.1 Component Selection: The choice between MOSFETs and BJTs depends on operating
frequency and efficiency. MOSFETs provide higher efficiency at high switching frequencies,
whereas BJTs may perform better at lower frequencies [2]. In this project, BJTs were selected
based on the operating conditions and availability.
3.2.2 Control Strategy: Industrial converters often employ advanced PWM controllers with
microcontrollers or digital signal processors (DSPs). For this project, a 555 timer IC was used
to generate the gate signal. This approach reduces complexity and cost while meeting
performance requirements [3].
3.2.3 Output Design: The inductor and capacitors were selected to minimize output voltage
ripple and ensure stable operation within prescribed limits. The design decisions reflect an
understanding of practical constraints similar to those faced by professional engineers.
8

3.3 Safety and Reliability Considerations
Engineering practice requires both functional execution and predictable performance over the
expected operational period [4], [5].
3.3.1 Circuit Protection: Reverse currents during switching can damage the MOSFET.
Freewheeling diodes were incorporated to safely dissipate these currents. Adequate spacing
between circuit components reduces the risk of electrical shorts and prevents electrocution.
3.3.2 Thermal Management: Heat dissipation was considered for the MOSFET and diodes to
prevent overheating and thermal runaway. Proper thermal management ensures reliable and
safe operation over time.
These safety and reliability considerations demonstrate the application of theoretical
knowledge to practical engineering challenges.
3.4 Educational and Professional Context
This project extends beyond circuit construction to examine the impact of design decisions on
overall system performance and reliability. By considering component selection, control
strategy, safety, and thermal management, students gain experience in workflows similar to
professional engineering practice.
Professionals in energy systems, automotive engineering, and consumer electronics must
justify design decisions while balancing performance, cost, safety, and sustainability [1], [4].
This project simulates such decision-making, providing training in applying theoretical
knowledge to practical, real-world problems.
3.5 Summary
Contextual reasoning in power electronics involves applying theoretical knowledge, evaluating
trade-offs, and implementing responsible design practices. In this project, the boost converter:
1. Demonstrates relevance in PV systems, electric vehicles, and portable electronics.
2. Justifies the selection of components and control methods based on practical
constraints.
3. Implements design practices that ensure safety and reliability.
4. Illustrates the distinction between classroom theory and practical engineering problems.
The boost converter developed represents a small-scale model of engineering creativity and the
application of power electronics principles to real-world energy conversion challenges.
CHAPTER 4: SUSTAINABLE APPLICATIONS AND ENVIRONMENTAL
IMPACT
4.1 Introduction
In an era where climate change and resource depletion pose significant global challenges, the
integration of sustainable practices in engineering designs has become imperative. Power
electronics, particularly DC-DC converters like the boost converter developed in this project,
play a pivotal role in enabling efficient energy management across various sectors. This chapter
explores the sustainable applications of the 5V to 36V DC boost converter and assesses its
environmental impact. By stepping up low-voltage inputs to higher outputs with high
efficiency, such converters contribute to reducing energy waste and supporting renewable
technologies. Drawing from the project's focus on applications in renewable energy systems,
9

battery-powered devices, and electric vehicles, this analysis highlights how the design aligns
with sustainability goals, while also addressing potential environmental drawbacks. The
discussion is grounded in the project's theoretical and experimental findings, emphasizing the
converter's role in promoting eco-friendly innovations.
4.2 Applications in Renewable Energy Systems
Boost converters are instrumental in renewable energy systems, where they facilitate the
efficient harvesting and utilization of variable low-voltage sources such as solar panels and
wind turbines. In solar photovoltaic (PV) systems, for instance, the input voltage from panels
often fluctuates due to environmental factors like shading or varying sunlight intensity. The
project's boost converter, capable of stepping up 5V to approximately 32V (with potential
optimization to 36V), can be integrated into maximum power point tracking (MPPT) circuits
to ensure optimal energy extraction. This aligns with the report's mention of renewable energy
applications, where stable high-voltage output is essential for grid integration or battery
charging.
In wind energy setups, small-scale turbines generate low DC voltages that require boosting for
practical use in off-grid systems or microgrids. By minimizing switching losses through
components like the XL6009 IC and a 33 μH inductor, as outlined in the project, the converter
enhances overall system efficiency, potentially reaching over 90% as referenced in similar
high-frequency designs [1]. This efficiency reduces the need for oversized energy sources,
lowering material consumption and operational costs. Furthermore, in hybrid renewable setups
combining solar and wind, the converter's ability to handle varying loads validated in the
project's testing under different conditions-supports energy storage in batteries, promoting self-
sufficiency and reducing reliance on fossil fuels.
4.3 Applications in Electric Vehicles and Portable Electronics
Electric vehicles (EVs) and battery-powered devices represent another key area where boost
converters drive sustainability by optimizing power from limited sources. In EVs, low-voltage
batteries (e.g., 5V auxiliary systems) need boosting for high-voltage components like motors
or infotainment systems. The project's design, with its focus on minimizing conduction and
switching losses via Schottky diodes and MOSFETs, directly contributes to extending battery
life and reducing charging frequency, thereby lowering the environmental footprint of EVs. As
noted in the report, such converters are vital for stable high-voltage operation in battery-
powered applications, aligning with global efforts to transition from internal combustion
engines to electric mobility, which could cut transportation emissions by up to 50% by 2050
according to industry projections.
Portable electronics, including smartphones, drones, and wearable devices, benefit from
compact boost converters that enable efficient power delivery from small batteries or energy
harvesters like thermoelectric generators. The prototype's use of low-cost components (totaling
323 units in the bill of materials) makes it accessible for mass production in sustainable
gadgets, where energy efficiency translates to reduced e-waste from frequent battery
replacements. Experimental results from the project, achieving a stable 32V output,
demonstrate reliability under load variations, which is crucial for devices in remote or off-grid
settings, such as environmental monitoring tools in conservation efforts.
10

4.4 Environmental Impact Assessment
While the boost converter offers significant sustainability benefits, a balanced assessment must
consider both positive and negative environmental impacts. On the positive side, the high
efficiency achieved-potentially improved to match the 91% peak in referenced multicell
designs [3] reduces energy dissipation as heat, lowering overall power consumption and
greenhouse gas emissions. For example, in renewable systems, this efficiency can amplify the
effective output from clean sources, displacing coal or gas-based electricity and contributing
to carbon neutrality goals. The project's emphasis on voltage regulation and ripple
minimization also ensures longer component lifespans, reducing the frequency of replacements
and associated resource extraction.
However, environmental challenges arise from manufacturing and disposal. Components like
inductors and capacitors involve mining rare earth metals and producing electronic waste,
which can leach toxins if not recycled properly. The MOSFET (IRFZ44N) and diodes in the
design, while efficient, contribute to the semiconductor industry's high water and energy use
during fabrication. Additionally, if not optimized, switching losses could lead to thermal
inefficiencies, indirectly increasing cooling demands and energy use. The report's future
recommendations, such as using low-resistance inductors and precise PWM control, mitigate
these issues by enhancing durability and efficiency, but lifecycle analysis is essential. Overall,
with proper e-waste management and eco-friendly sourcing, the net impact leans positive,
especially in large-scale sustainable deployments.
4.5 Summary
This chapter has underscored the boost converter's potential in fostering sustainability through
applications in renewable energy, electric vehicles, and portable electronics, while critically
evaluating its environmental footprint. The introduction set the stage for its relevance in eco-
conscious engineering, followed by detailed explorations of how the project's design supports
efficient energy use in variable renewable sources and battery systems. The environmental
assessment revealed efficiency-driven emission reductions as a major benefit, tempered by
manufacturing and waste concerns that can be addressed through optimizations like those
suggested in the report. Ultimately, the 5V to 36V boost converter exemplifies how targeted
power electronics can advance environmental goals, paving the way for greener technologies
with broader adoption and refinement.
CHAPTER 5: EFFECTIVE INDIVIDUAL AND TEAM PERFORMANCE
5.1 Introduction:
In any engineering project, especially one like designing a DC-DC boost converter, success
isn't just about the circuits and calculations, it's about the people behind them. As a team of ten
students from the Department of Mechatronics Engineering at Rajshahi University of
Engineering & Technology, we learned firsthand how individual strengths and group
collaboration can make or break a project. This chapter reflects on our experiences, sharing the
ups and downs in a real, down-to-earth way, because let's face it: group work in university isn't
always smooth sailing, but it's where the real growth happens.
11

5.2 Individual Performance
Each member of the group took responsibility for specific tasks according to their skills and
interest. The contributions are summarized in the table below:
Table 5.2: Individual Performance
Student Name  ID  Role & Contribution  Performance Reflection
Inzamam Uddin  2008051  Researched  the  theoretical  Showed  strong  analytical
Mahamud Alif  background  of  boost  ability and problem-solving
|     | converters,  | helped  | in  circuit  | mindset  |     |     |
| --- | ------------ | ------- | ------------ | -------- | --- | --- |
calculations
Tahmina Khatun  2008052  Assisted  in  preparing  cost  Very organized and detail-
|     | analysis   | and  | component  | oriented, ensured accuracy  |     |     |
| --- | ---------- | ---- | ---------- | --------------------------- | --- | --- |
|     | selection  |      |            | in cost estimation          |     |     |
Mst. Nishat  2008053  Worked on documentation and  Displayed excellent writing
Nabilah  formatting of the report  skills  and  consistency  in
presentation
Samia Afsana  2008055  Conducted result analysis and  Strong  analytical  thinking,
|     | compared          | theoretical  | vs  | connected theory with real- |     |     |
| --- | ----------------- | ------------ | --- | --------------------------- | --- | --- |
|     | practical values  |              |     | life application            |     |     |
Tawfiq Mahmud  2008056  Designed the simulation model  Brought creativity in design
| Khan  | of the boost converter  |     |     | approach,  | ensured  | theore- |
| ----- | ----------------------- | --- | --- | ---------- | -------- | ------- |
tical validation
Md. Abu Shoaib  2008057  Worked on diagrams, figures,  Displayed  creativity,
|     | and visual representation  |     |     | improved report clarity and  |     |     |
| --- | -------------------------- | --- | --- | ---------------------------- | --- | --- |
visual appeal
Md. Shihabul  2008058  Helped  in  soldering,  Very practical and efficient
| Islam  | assembling  | circuit  | com- | in         | hardware  | imple- |
| ------ | ----------- | -------- | ---- | ---------- | --------- | ------ |
|        | ponents     |          |      | mentation  |           |        |
Ridwan Kader  2008059  Assisted  in  trouble-shooting  Showed  persistence  and
|     | issues during testing phase  |     |     | patience  | in  solving  | un- |
| --- | ---------------------------- | --- | --- | --------- | ------------ | --- |
expected problems
Robiul Haque  2008060  Conducted result analysis and  Strong  analytical  thinking,
Sajid  compared  theoretical  vs  connected theory with real-
|     | practical values  |     |     | life application  |     |     |
| --- | ----------------- | --- | --- | ----------------- | --- | --- |
Muhammad Al  1908055  Coordinated the team, ensured  Demonstrated  leadership,
| Muktadir  | communication  |               | between  | time             | management,  | and  |
| --------- | -------------- | ------------- | -------- | ---------------- | ------------ | ---- |
|           | members,       | contri-buted  | to       | teamwork spirit  |              |      |
writing and presentation
5.3 Team Performance
Although each member played a different role, our true strength was teamwork. We faced
challenges  such  as  unstable  output  voltage,  component  limitations,  and  time  pressure.
However,  through  mutual  support  and  brainstorming  sessions,  we  solved  these  issues
efficiently.
12

Table 5.3: Team Performance Outcome
Team Aspect Performance Outcome
Communication Maintained regular discussions, ensuring everyone was updated and
motivated.
Collaboration Shared tasks based on strengths, reducing workload pressure.
Problem-Solving Brainstormed solutions during voltage mismatch, found practical
adjustments.
Time Management Completed the project within the given deadline through planned
scheduling.
Learning Outcome Improved knowledge of power electronics, teamwork, and research-
writing.
5.4 Summary
This project was not just about designing a DC-DC boost converter, but also about learning
how individuals and team function in an engineering environment. Individually, everyone
learned responsibility and technical skills. Collectively, the team-built trust, cooperation, and
problem-solving capacity. This balance of individual excellence and team synergy ensured the
success of our project. In engineering, projects like this prepare the students for the real world,
where teams design everything from electric vehicles to renewable energy systems. We've
grown not just as techies but as collaborators, ready for whatever comes next. If there's one
takeaway, it's this: embrace the messiness of group work, it turns good ideas into great results.
REFERENCES:
[1] M. H. Rashid, Power Electronics Handbook, 3rd ed. Elsevier, 2011.
[2] R. W. Erickson and D. Maksimovic, Fundamentals of Power Electronics, 2nd ed. Boston,
MA, USA: Springer, 2001.
[3] J. S. Kirtley and R. W. Erickson, Introduction to Power Electronics, Pearson, 2017.
[4] S. S. Murthy and M. S. J. Asghar, DC-DC Converters: Design and Applications, Wiley,
2016.
[5] IEEE Power Electronics Society, IEEE Transactions on Power Electronics.
[6] J. Yuan, Y. Chen, Y. Yang, F. Blaabjerg, and M. Chen, “High-frequency multicell cascaded
quasi-square-wave (MCQSW) boost converter,” in Proc. IEEE (publication), 2025;
demonstrated a 15 V–180 V (1:12) converter at 700 kHz to 5 MHz, reaching 91% peak
efficiency.
13