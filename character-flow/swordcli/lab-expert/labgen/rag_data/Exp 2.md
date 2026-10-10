HEAVEN’S LIGHT IS OUR GUIDE
RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY
DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series
Course No:MTE 3101
Course Title:Control Systems Sessional
Experiment No: 02
Experiment Name: Design of Open Loop System and Investigate the
Performance
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
19th April, 2025

Experiment No: 02
Experiment Name: Design of Open Loop System and Investigate the Performance.
Objectives:
To design an open-loop system for a given plant or process.
To simulate or implement the designed system using appropriate tools (e.g., MATLAB,
Simulink).
To analyze the system performance parameters such as rise time, steady-state error, and system
stability.
Theory:
An open-loop control system is a type of control system in which the output has no influence on the control
action. It operates solely based on the input signal and the system’s predefined behavior, without using
feedback to compare the actual output to the desired output. Unlike closed-loop systems, there is no
mechanism to correct errors or respond to external disturbances in open-loop systems. The system assumes
the relationship between input and output remains consistent over time.
Figure 1: Open loop system diagram.[1]
Key Features of open loop control system:
a. No feedback loop = output is not measured or used for correction.
b. Simple design = fewer components and easy to implement.
c. Low cost = ideal for systems where precision is not critical.
d. Less accurate = due to lack of error correction from feedback.
e. Fast response = no time is spent in measuring output or adjusting.
Performance Characteristics of Open Loop Systems:
1. Rise Time (T ): The rise time is determined by the system's inherent dynamics and the input signal.
r
It is not adjusted based on the output since there's no feedback.

2. Settling Time (T): Without feedback, the settling time depends on the natural response of the
s
system. If the system has oscillatory modes, the settling time could be long.
3. Peak Time (T ): The peak time is the time taken for the response to reach the first peak of the
peak
overshoot. Open-loop systems might exhibit significant overshoot if not properly designed.
4. Percentage Overshoot (%OS): The percentage by which the output exceeds the final steady-state
value. It is a measure of how much the system "overreacts" before settling, and it is frequently used
to analyze stability and damping characteristics.[2]
5. Steady-State Error (Ess): Steady-state error can be significant because the system does not correct
itself based on the output. It is determined by the system type and input.
Required Components:
• MATLAB
System Models:
(a) (b)
Figure 2: System Representation of (a) DC Motor (b) Mechanical Equivalent System.
Transfer Functions:
Motor system transfer function,
𝜃(𝑠̇ ) 𝐾
=
𝑣(𝑠) [(𝐽𝑠+𝑏)(𝐿𝑠+𝑅)+𝐾2]
Mechanical System Transfer Function,
1
𝑇𝐹(𝑠) =
[𝑀𝑠2 +𝐷𝑠+(𝐾 +𝐾 )]
1 2
K
K
2
1
D
M

MATLAB Codes:

| System 1 – DC Motor  |     | System 2 – A Mechanical System  |
| -------------------- | --- | ------------------------------- |

State Space Model:

| System 1 – DC Motor  |     | System 2 – A Mechanical System  |
| -------------------- | --- | ------------------------------- |

|         |     |         |
| ------- | --- | ------- |
|   A =   |     |   A =   |

|            x1      x2  |     |            x1      x2  |
| ---------------------- | --- | ---------------------- |
|    x1     -20  -12.63  |     |    x1  -15.83  -10.42  |
|    x2       8       0  |     |    x2       8       0  |

|         |     |         |
| ------- | --- | ------- |
|   B =   |     |   B =   |

|        u1  |     |        u1  |
| ---------- | --- | ---------- |
|    x1   4  |     |    x1   4  |

|    x2   0  |     |    x2   0  |
| ---------- | --- | ---------- |
|            |     |            |
|   C =      |     |   C =      |

|           x1     x2  |     |           x1     x2  |
| -------------------- | --- | -------------------- |
|    y1      0  3.125  |     |    y1      0  2.604  |

|         |     |         |
| ------- | --- | ------- |
|   D =   |     |   D =   |

|        u1  |     |        u1  |
| ---------- | --- | ---------- |
   y1   0
|     |     |    y1   0  |
| --- | --- | ---------- |

Simulink Model:
Figure 3: State-Space Model in Simulink
Result:
System 1 – DC Motor
Figure 4: System Response in MATLAB
Figure 5: System Response in Simulink

System 2 – A Mechanical System
Figure 5: System Response in MATLAB
Figure 6: System Response in Simulink
Performance Analysis:
System Rise Time Settling Time Peak Time Overshoot (%) Delay Time
(s) (s) (s) (s)
DC Motor 0.332 0.575 1.2388 0 -
Mechanical 0.3 0.477 0.692 0.42 1.0052
System

Discussion:
The performance analysis shows that the Mechanical System beats the DC Motor in terms of speed, with a
shorter rise time (0.3 s), settling time (0.477 s), and peak time (0.6922 s). This shows that the system
responds more quickly to inputs. However, it also has a tiny overrun (0.42%) and a substantial delay time
(1.0052 s), which may affect control precision and responsiveness. The DC Motor, on the other hand,
responds slowly but produces a perfectly stable output with no overshoot and a short delay period. This
trade-off demonstrates the two systems' differing strengths in terms of speed and stability.
Conclusion:
To summarize, the Mechanical System is better suited for applications that value speed and responsiveness,
such as real-time feedback systems or fast actuation activities. Its faster dynamics, however, come with the
disadvantage of overshoot and a longer delay time, which may affect precision. In contrast, the DC Motor,
while slower to respond, is suited for applications demanding great precision, stability, and minimal delay-
particularly where overshoot is undesirable. The decision between the two systems should therefore be
based on specific application requirements: speed and responsiveness favor the Mechanical System, but
control accuracy and consistent behavior promote the use of the DC Motor.
References:
[1] “Open Loop Control System,” GeeksforGeeks, May 27,2024.
[2] C. S. Lessard, “Characteristics and types of feedback control systems,” in Synthesis Lectures
on Biomedical Engineering, Cham: Springer International Publishing, 2009, pp. 36–48.