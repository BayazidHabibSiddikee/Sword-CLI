HEAVEN’S LIGHT IS OUR GUIDE
RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY
DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series
Course No:MTE 3102
Course Title:Control Systems Sessional
Experiment No: 08
Experiment Name: Design of a PID Controller for the systems by using Root
Locus Method and Performance Analysis.
Submitted To:
Md. Faisal Rahman Badal
Assistant Professor
Department of Mechatronics Engineering
Rajshahi University of Engineering & Technology, Rajshahi-6204.
Safwat Mukarrama Choudhury
Lecturer,
Department of Mechatronics Engineering,
Rajshahi University of Engineering & Technology.
Submitted by:
Adiba Binta Newaz
2108043
Date of Submission:
15th July, 2025

Experiment No: 08
Experiment Name: Design of a PID Controller for the systems by using Root Locus Method and
Performance Analysis.
Objectives:
1. To design PID, PD & PI controllers for given systems
2. To analyze and compare the performance of PID, PD & PI controllers through simulation
3. To design a PID controller for the given systems using the root locus method and to analyze and
compare its performance characteristics
Theory:
PID Controller: PID control, representing
proportional-integral-derivative control, is
a feedback mechanism in control system,
often referred to as three-term control. By
adjusting three parameters—the
proportional, integral, and derivative
values of a process variable’s deviation
from its set point—specific control actions
are effectively tailored.[1]
We need to add a complex zero and a pole
Figure 1: Basic PID controller block diagram. [3]
to the system.
Proportional (P) response: The proportional gain (Kc) determines the ratio of output response to the error
signal. In general, increasing the proportional gain will increase the speed of the control system response.
Integral (I) response: The integral component sums the error term over time. The result is that even a
small error term will cause the integral component to increase slowly. The integral response will continually
increase over time unless the error is zero, so the effect is to drive the Steady-State error to zero.
Derivative(D) response: The derivative component causes the output to decrease if the process variable is
increasing rapidly. The derivative response is proportional to the rate of change of the process variable.[2]
PID Controller Equation:
𝑑𝑒(𝑡)
𝑢(𝑡) = 𝐾 𝑒(𝑡)+𝐾 ∫𝑒(𝑡)𝑑𝑡+𝐾
𝑝 𝑖 𝑑 𝑑𝑡
In Laplace Domain,
𝐾
𝑖
𝐺(𝑠) = 𝐾 + +𝐾 𝑠
𝑝 𝑠 𝑑

𝐾
|     |     |     |         |     |       |     | 𝑝    | 𝐾     |     |
| --- | --- | --- | ------- | --- | ----- | --- | ---- | ----- | --- |
|     |     |     |         |     |       | 𝐾   | (𝑠2+ | 𝑠+ 𝑖) |     |
|     |     |     | 𝐾 𝑠 + 𝐾 |     | +𝐾 𝑠2 | 𝑑   | 𝐾    | 𝐾     |     |
|     |     |     | 𝑝       | 𝑖   | 𝑑     | =   | 𝑑    | 𝑑     |     |
|     |     | 𝑃𝐼𝐷 | =       |     |       |     |      |       |     |
|     |     |     |         | 𝑠   |       |     | 𝑠    |       |     |

Control
|     | Rise time  |     |     | Settling time  |     |     | Overshoot  |     | Steady state error  |
| --- | ---------- | --- | --- | -------------- | --- | --- | ---------- | --- | ------------------- |
Response
| K   | decrease  |     |     | small change  |     |     | increase  |     | decrease  |
| --- | --------- | --- | --- | ------------- | --- | --- | --------- | --- | --------- |
p
| K   | small change  |     |     | decrease  |     |     | decrease  |     | no change  |
| --- | ------------- | --- | --- | --------- | --- | --- | --------- | --- | ---------- |
d
| K  i | decrease  |     |     | increase  |     |     | increase  |     | eliminate  |
| ---- | --------- | --- | --- | --------- | --- | --- | --------- | --- | ---------- |

Table 1: PID Parameters Summary Table [1]

PI Controller: PI control, a combination in PID systems, doesn’t include derivative control. It’s a type of
feedback control that combines proportional and integral actions. PI control responds faster than integral-
only control because it includes proportional action. It helps stabilize the system and brings it back to the
set point. [4]
We need to add a zero and a pole at origin to the system.

|     |     | Figure 2: Basic PI controller block diagram. [5]  |     |     |     |     |     |     |     |
| --- | --- | ------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- |
𝐾
𝑖)
𝐾 (𝑠+
|     |     |     |     | 𝐾   | 𝐾 𝑠+𝐾 |     | 𝑝   | 𝐾   |     |
| --- | --- | --- | --- | --- | ----- | --- | --- | --- | --- |
|     |     |     |     | 𝑖   | 𝑝     | 𝑖   |     | 𝑝   |     |
|     |     | 𝑃𝐼  | = 𝐾 | +   | =     | =   |     |     |     |
|     |     |     | 𝑝   | 𝑠   | 𝑠     |     | 𝑠   |     |     |
PD Controller: PD control, another combination in PID systems, doesn’t include integral control. It’s a
mix of feedforward and feedback control, taking into account current and predicted process conditions. In
PD control, the controller output is a combination of the error signal and its derivative. This means it
considers both how much the error is right now and how fast it’s changing.[4]
We need to add a zero to the system.

Figure 3: Basic PD controller block diagram. [5]
𝐾
𝑝
𝑃𝐷 = 𝐾 +𝑠𝐾 = 𝐾 (𝑠+ )
𝑝 𝑑 𝑑 𝐾
𝑑
Root Locus: A graphical method used for analyzing the location and movement of poles in the s-plane
with the variation in the gain factor of the system is known as Root Locus. This technique is used to check
the stability of the closed-loop control system. So, in simple terms, a graph plotted for roots of a
characteristic equation by varying the system parameter (generally gain) from 0 to infinity is called Root
Locus. Root Locus Analysis was proposed by W R Evans in the year 1948. [6] It is especially useful for
designing compensators such as PID controllers in systems like DC motors, where precise performance
specifications are required.
Required Apparatus:
MATLAB
System Models:
Figure 4: System Representation of DC Motor
Transfer Function:
Motor system transfer function,
𝜃(𝑠̇ ) 𝐾
=
𝑣(𝑠) {(𝐽𝑠+𝑏)(𝐿𝑠+𝑅)+𝐾2}

MATLAB Code:
PID
PD PI
Result:
PID Controller
Figure 5: Root Locus Plot & Step response of PID in MATLAB

Figure 6: Root Locus Editor and Step response of PID in Control System Designer App
PD Controller
Figure 7: Root Locus Plot & Step response of PD in MATLAB
Figure 8: Root Locus Editor and Step response of PD in Control System Designer
App

PI Controller
Figure 9: Root Locus Plot & Step response of PD in MATLAB
Figure 10: Root Locus Editor and Step response of PD in Control System Designer
App
Performance Analysis:
Controller K K K Rise Time Settling Time Overshot (%)
p i d
PID 11.83 2.183 15.99 1.60599 2.8441 0
PD 9.2638 0 66.17 0.130038 0.33886 0
PI 1.319 5.0973 0 2.9523 5.0441 0

Discussion: The root locus method graphically shows how closed-loop poles shift with varying controller
gain, helping assess stability and performance. Performance comparisons reveal that the PD controller has
the fastest response but requires high gains. The PI controller eliminates steady-state error with no
overshoot but responds more slowly. The PID controller offers a balanced performance with moderate
speed and zero overshoot, making it a good compromise between response time and control effort.
Conclusion: The root locus method visually tracks closed-loop pole movement as controller gain changes,
aiding in stability analysis. Among PI, PD, and PID controllers, the PD gives the fastest response but
demands high gain. The PI eliminates steady-state error with slower response and no overshoot. The PID
balances speed and control, making it an effective overall choice.
Reference:
[1] Electrical4U, "PID control – proportional integral derivative," Electrical4U, [Online]. Available:
https://www.electrical4u.com/pid-control/. Accessed: Apr. 26, 2025
[2] National Instruments, "PID Theory Explained," NI, [Online]. Available:
https://www.ni.com/en/shop/labview/pid-theory-explained.html. Accessed: Apr. 26, 2025.
[3] M. Malekabadi, M. Haghparast, and F. Nasiri, "Air Condition's PID Controller Fine-Tuning Using
Artificial Neural Networks and Genetic Algorithms," Computers, vol. 7, no. 2, p. 32, May 2018, doi:
10.3390/computers7020032.
[4] Kamboj, A., “Types of Controller | I, D, PD, P, PI, PID Control,” Engineeringa2z, March 1, 2024.
Available: https://www.engineeringa2z.com/types-of-controller-i-d-pd-p-pi-pid-control/.
[5] Introduction to PID. WPILib Docs. Updated: June 2, 2025. Available:
https://docs.wpilib.org/en/stable/docs/software/advanced-controls/introduction/introduction-to-pid.html.
[6] Root Locus Construction with Examples, Electronics Coach, ca. 4.9 years ago. Available:
https://electronicscoach.com/proportional-integral-controller.html.