HEAVEN’S LIGHT IS OUR GUIDE

RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY

DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series

Course No: MTE 3101
Course Title: Control Systems Sessional

Experiment No: 03
Experiment Name: Design of a PID Controller for the systems by using trial and
error method and analysis their performance

Submitted To:
Dr. Sajal Kumar Das
Associate Professor
Department of Mechatronics Engineering
Rajshahi University of Engineering & Technology, Rajshahi-6204.

Md. Faisal Rahman Badal
Assistant Professor
Department of Mechatronics Engineering
Rajshahi University of Engineering & Technology, Rajshahi-6204.

Submitted by:
Adiba Binta Newaz
2108043

Date of Submission:
26th April, 2025

Experiment No: 03

Experiment  Name:  Design  of  a  PID  Controller  for  the  systems  by  using  trial  and  error  method  and
analysis their performance.

Objectives:

1.  To design PID, PD & PI controllers for given systems

2.  To analyze and compare the performance of PID, PD & PI controllers through simulation

3.  To design a PID controller for the given systems using the trial-and-error method and to analyze

and compare its performance characteristics

Theory:

PID  control,  representing  proportional-integral-derivative  control,  is  a  feedback  mechanism  in  control
system, often referred to as three-term control. By adjusting three parameters—the proportional, integral,
and  derivative  values  of  a  process  variable’s  deviation  from  its  set  point—specific  control  actions  are
effectively tailored.[1]

Proportional (P) response: The proportional gain (Kc) determines the ratio of output response to the error
signal. In general, increasing the proportional gain will increase the speed of the control system response.

Integral (I) response: The integral component sums the error term over time. The result is that even a
small error term will cause the integral component to increase slowly. The integral response will continually
increase over time unless the error is zero, so the effect is to drive the Steady-State error to zero.

Derivative(D) response: The derivative component causes the output to decrease if the process variable is
increasing rapidly. The derivative response is proportional to the rate of change of the process variable.[2]

Some control actions only require two of the PID controller’s parameters, setting the third to zero. This
flexibility allows PID controllers to operate as PI (proportional-integral), PD (proportional-derivative), or
simply P or I. The proportional, derivative and integral parameters can be expressed as – Kp, Kd and Ki. All
these three parameters have an effect on the closed loop control system. It affects rise time, settling time
and overshoot and also the Steady state error.[1]

PID Controller Equation:

𝑢(𝑡) = 𝐾𝑝 𝑒(𝑡) + 𝐾𝑖 ∫ 𝑒(𝑡)𝑑𝑡 + 𝐾𝑑

𝑑𝑒(𝑡)
𝑑𝑡

In Laplace Domain,

𝐺(𝑠) = 𝐾𝑝   +

𝐾𝑖
𝑠

+ 𝐾𝑑𝑠

Control
Response

Kp

Kd

Ki

Rise time

Settling time

Overshoot

Steady state error

decrease

small change

increase

decrease

small change

decrease

decrease

no change

decrease

increase

increase

eliminate

Table 1: PID Parameters Summary Table [1]

Figure 1: Basic PID controller block diagram. [3]

Required Apparatus:

MATLAB

System Models:

Figure 2: System Representation of DC Motor

Transfer Function:

Motor system transfer function,

𝜃(𝑠)̇
𝑣(𝑠)

=

𝐾
{(𝐽𝑠 + 𝑏)(𝐿𝑠 + 𝑅) + 𝐾2}

MATLAB Code:

 State-Space Model:

Simulink:

Figure 3: PID Control System Block

Figure 4: PI Control System Block

Figure 5: PD Control System Block

Result:

Figure 6: System Response with PID, PD & PI Controller

      Figure 7: System Response with PID Controller (Simulink)

Figure 8: System Response with PI Controller (Simulink)

Figure 9: System Response with PD Controller (Simulink)

Performance Analysis:

Controller  Rise Time

Settling Time

Peak Time

Overshoot (%)

Peak Value

PID

PI

PD

0.0470

0.3472

0.0379

0.2721

0.5293

0.1604

0.2272

0.7011

0.0926

2.0633

1.0958

4.6029

1.0206

1.0110

1.0196

Discussion & Conclusion:

The  performance analysis shows  that each  controller has  specific  advantages.  The  PID  controller  has a
balanced performance with a moderate rise time, settling time, and low overshoot, making it excellent for
systems  that  require  fast  but  reliable  responses.  While  having  zero  overshoot,  the  PI  controller  has  the
slowest  rise  and  settling  durations,  indicating  that  it  is  best  suited  to  applications  where  overshoot  is
carefully  avoided.  The  PD  controller  has  the  fastest  rise  and  settling  periods,  with  little  overshoot,  but
slightly lower peak value stability. Overall, the PID controller offers the optimum balance of speed and
accuracy, whereas PI and PD controllers are better suited for applications that prioritize overshoot removal
or response speed, respectively.

Reference:
[1]  Electrical4U,  "PID  control  –  proportional  integral  derivative,"  Electrical4U,  [Online].  Available:
https://www.electrical4u.com/pid-control/. Accessed: Apr. 26, 2025

National

[2]
[Online].
https://www.ni.com/en/shop/labview/pid-theory-explained.html. Accessed: Apr. 26, 2025.

Instruments,

Explained,"

Theory

"PID

NI,

Available:

[3]  M.  Malekabadi,  M.  Haghparast,  and  F.  Nasiri,  "Air  Condition's  PID  Controller  Fine-Tuning  Using
Artificial  Neural  Networks  and  Genetic  Algorithms,"  Computers,  vol.  7,  no.  2,  p.  32,  May  2018,  doi:
10.3390/computers7020032.

