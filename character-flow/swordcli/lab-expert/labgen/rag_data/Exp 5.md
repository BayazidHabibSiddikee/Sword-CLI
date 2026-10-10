HEAVEN’S LIGHT IS OUR GUIDE
RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY
DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series
Course No:MTE 3102
Course Title:Control Systems Sessional
Experiment No: 05
Experiment Name: Design of a LQR controller for a given system using trial &
error method
Submitted To:
Md. Faisal Rahman Badal
Assistant Professor
Department of Mechatronics Engineering
Rajshahi University of Engineering & Technology
Safwat Mukarrama Choudhury
Lecturer
Department of Mechatronics Engineering,
Rajshahi University of Engineering & Technology
Submitted by:
Adiba Binta Newaz
2108043
Date of Submission:
17th May, 2025

Experiment No: 5
Experiment name: Design of a LQR controller for a given system using trial & error method.
Objectives:
1. To design a Linear Quadratic Regulator (LQR) controller for a given linear time-invariant system.
2. To apply the trial-and-error method for tuning Q and R to achieve desired dynamic response
characteristics (e.g., stability, minimal overshoot, and fast settling time).
3. To analyze the performance of the closed-loop system under different weight configurations.
Theory:
Linear Quadratic Regulator (LQR) is a mathematical method used in optimal control theory to design a
controller that regulates the state of a linear dynamic system while minimizing a cost function. LQR is
widely used in automatic control systems due to its ability to achieve optimal performance with minimal
control effort.
Figure 1: Block Diagram of a basic LQR system [1]
Key Features of LQR:
• It is based on state-space representation.
• Provides optimal control by minimizing a quadratic cost function.
• Balances performance (e.g., fast response) and control effort (e.g., energy consumption).
• The solution involves solving an Algebraic Riccati Equation (ARE)
Cost Function Criteria:
The LQR approach allows multiple criteria for optimizing the performance index:
1. Minimum Time: Time taken to reach steady state (90% final value)
• Performance Index: 𝐽 =𝑇, where T is the final time and J is Performance criterion/
Cost function.
2. Minimum Final Error: Achieve the desired final state with minimal error.
• Cost function: 𝐽 =∥ 𝑥(𝑡)∥; x(t) = System Trajectory

3.  Minimum Transient Response: Improve the transient characteristics (e.g., overshoot, settling
| time) by minimizing area under ∥ |                     |     | 𝑥(𝑡) ∥2 .  |        |
| -------------------------------- | ------------------- | --- | ---------- | ------ |
|                                  | •  Cost function: 𝐽 |     | 𝑇 𝑥(𝑡)     | ∥2 𝑑𝑡  |
|                                  |                     |     | = ∫ ∥      |        |
0
4.  Minimum Control Input: Minimize the control input u(t)
|     |                     |     | 𝑇 𝑢(𝑇)∥2 |     |
| --- | ------------------- | --- | -------- | --- |
|     | •  Cost function: 𝐽 |     | = ∫ 𝑇 ∥  | 𝑑𝑡  |
0
Quadratic Cost Function [2]:
𝑇
|     |     | 𝑥𝑇(𝑡)𝑆𝑥(𝑇)+∫ | [ 𝑥𝑇(𝑡)𝑄𝑥(𝑇)+ 𝑢𝑇(𝑡)𝑅𝑥(𝑇)]𝑑𝑡  |     |
| --- | --- | ------------ | ---------------------------- | --- |
|     | 𝐽 = |              |                              |     |
0
Here, S = weighting matrix; symmetric, non-negative definite
Q = weighting matrix; symmetric, non-negative definite
R = weighting matrix; symmetric, positive definite
S, Q, R are quadratic regulator.

Designing LQR Controller:
Given a system in state-space form:
𝑥(𝑡̇
)= 𝐴𝑥(𝑡)+𝐵𝑢(𝑡)
|     |     |     | 𝑦(𝑡) = | 𝐶𝑥(𝑡)+𝐷𝑢(𝑡)   |
| --- | --- | --- | ------ | ------------- |
Assuming disparity matrix, D=0, the goal is to determine the control input u(t) such that a quadratic cost
function is minimized:
∞
𝐽 = ∫ [ 𝑥𝑇(𝑡)𝑄𝑥(𝑇)+ 𝑢𝑇(𝑡)𝑅𝑥(𝑇)]𝑑𝑡
0
The optimal control law is:
|     |     |     | 𝑢(𝑡) | = −𝑘𝑥(𝑡)   |
| --- | --- | --- | ---- | ---------- |
Where the gain matrix K is:
|     |     |     | 𝐾   | = 𝑅−1𝐵𝑇𝑃   |
| --- | --- | --- | --- | ---------- |
Here, P is the unique positive solution of the matrix
B is the control input co-efficient matrix
R is the control input weighting matrix
Algebraic Riccati Equation (ARE) [3]:
𝐴𝑇𝑃 + 𝑃𝐴 − 𝑃𝐵𝑅−1𝐵𝑇𝑃 + 𝑄 =  0
Substituting the control law into the system yields the closed-loop dynamics:
𝑥(𝑡̇
|     |     |     |     | )= 𝐴𝑥(𝑡)+𝐵𝑢(𝑡)     |
| --- | --- | --- | --- | ------------------ |
|     |     |     |     | = 𝐴𝑥(𝑡)+𝐵(−𝑘𝑥(𝑡))  |
|     |     |     |     | =𝐴𝑥(𝑡)−𝑘𝐵𝑥(𝑡)      |
=[𝐴−𝑘𝐵]𝑥(𝑡)
|     |     |     |     | =𝐴 𝑥(𝑡); where [𝐴−𝑘𝐵] = 𝐴   |
| --- | --- | --- | --- | --------------------------- |
𝑐 𝑐

Required Software:
•  MATLAB

State Space Example:
Let, a sample state-space system is represented as:
−𝟏 −𝟓 𝟏𝟎
𝒙̇ = [ ]𝒙+[ ]𝒖
𝟏𝟎 −𝟏 𝟎
𝒚= [𝟏 𝟎]𝒙
Code:
Result:
Figure 2: Output Performance of an LQR system

Figure 3: Controllability test of the system in MATLAB
Performance Analysis:
Controller Rise Time Settling Time Peak Time Overshoot (%) Peak Value
System 1 0.0573 0.1215 0.22 5.66 1.31
System 2 0.0066 0.0108 0.0319 1.2996 1.0009
Discussion & Conclusion:
The performance analysis clearly shows that System 2 outperforms System 1 in all key time-domain
metrics. With a significantly faster rise time (0.0066 s vs. 0.0573 s) and settling time (0.0108 s vs. 0.1215
s), System 2 responds more quickly and stabilizes faster. Additionally, it exhibits a much lower overshoot
(1.30% compared to 5.66%), indicating better damping and control precision. The peak value of System 2
(1.0009) is nearly ideal, while System 1 overshoots to 1.31. These results highlight that the LQR controller
used in System 2 was more effectively tuned, leading to superior performance. This demonstrates the
importance of selecting appropriate weighting matrices in LQR design to achieve optimal system behavior
with minimal control effort.
References:
[1] B. D. O. Anderson and J. B. Moore, Optimal Control: Linear Quadratic Methods, Prentice Hall, 1990.
[2] K. Ogata, Modern Control Engineering, 5th ed., Pearson Education, 2010.
[3] R. C. Dorf and R. H. Bishop, Modern Control Systems, 13th ed., Pearson, 2017.