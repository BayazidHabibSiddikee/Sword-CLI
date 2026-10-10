HEAVEN’S LIGHT IS OUR GUIDE
RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY
DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series
Course No:MTE 3102
Course Title:Control Systems Sessional
Experiment No: 07
Experiment Name: Designing of an LQG Controller for a Given System to
Investigate the System Response and Stability
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

Experiment No: 07
Experiment Name: Designing of an LQG Controller for a Given System to Investigate the System Response
and Stability.
Objectives:
1. To know about the LQG controller.
2. To know about the parameters and gain of LQG controller.
3. To know how to design the LQG controller in MATLAB editor for the given system.
4. To know how to design the LQG controller in Simulink for the given system.
5. To know the stability of the given system.
Theory:
In control theory, the linear–quadratic–Gaussian (LQG) control problem is one of the most fundamental optimal
control problems. It concerns linear systems driven by additive white Gaussian noise. The problem is to
determine an output feedback law that is optimal in the sense of minimizing the expected value of a quadratic
cost Criterion. Output measurements are assumed to be corrupted by Gaussian noise and the initial state,
likewise, is assumed to be a Gaussian random vector.
Figure 1: Basic block diagram of LQG Control System[1]
A possible generalization looks:
𝑥̇ = 𝐴𝑥+𝐵𝑢+𝑤
𝑑
𝑦 = 𝐶𝑥+𝑤
𝑛
Where w , w are stochastic processes called process and measurement noise respectively. Only y(t) is available
d n
for control. It turns out that for linear systems a separation principal holds.
First, calculating x^(t) estimate the full state x(t) using the available information and then, applying the
LQR controller, using the estimation x^(t) in place of the true state x(t).
Defining the estimation error:
𝑒 = 𝑥−𝑥̂
The Kalman filter produces, 𝑥̂ governed by an estimator dynamic equation:
𝑥̂̇ = 𝐴𝑥̂+𝐵𝑢+𝐾 (𝑦−𝐶𝑥̂)
𝑓
Here 𝐾𝑓 is the Kalman gain.
The control law is designed to stabilize the system: u= −K𝑥̂, where K is the LQR gain.
So, we can write
𝑥̇ = 𝐴𝑥+𝐵𝑢+𝑤 =𝐴𝑥−𝐵𝐾𝑥̂+𝑤
𝑑 𝑑
𝑥̇ = 𝐴𝑥−𝐵𝐾𝑥̂−𝐵𝐾𝑥+𝐵𝐾𝑥+𝑤 = (𝐴−𝐵𝐾)𝑥+𝐵𝐾𝑒+𝑤
𝑑 𝑑
Differentiating 𝑒 =𝑥−𝑥̂ , we get: 𝑒̇ = 𝑥̇ −𝑥̂̇
As we have written,
𝑥̂̇ = 𝐴𝑥̂+𝐵𝑢+𝐾 (𝑦−𝐶𝑥̂) =𝐴𝑥̂−𝐵𝐾𝑥̂+𝐾 (𝑦−𝐶𝑥̂)
𝑓 𝑓

Putting 𝑦 = 𝐶𝑥+𝑤  in the previous equation,
𝑛
|     | 𝑦−𝐶𝑥̂ | = 𝐶𝑥+𝑤 | −𝐶𝑥̂ | = 𝐶[𝑥−𝑥̂]+𝑤 |     | = 𝐶𝑒+𝑤 |     |     |
| --- | ----- | ------ | ---- | ----------- | --- | ------ | --- | --- |
|     |       |        | 𝑛    |             | 𝑛   |        | 𝑛   |     |
So, we can write,
| 𝑥̂̇ | = 𝐴𝑥̂−𝐵𝐾𝑥̂+𝐾 |     | (𝐶𝑒+𝑤 | )= 𝑥̂̇ = 𝐴𝑥̂−𝐵𝐾𝑥̂+𝐾 |     |     | 𝐶𝑒+𝐾 | 𝑤   |
| --- | ------------ | --- | ----- | ------------------- | --- | --- | ---- | --- |
|     |              |     | 𝑓     | 𝑛                   |     | 𝑓   |      | 𝑓 𝑛 |

Therefore,
| 𝑒̇               | = 𝑥̇ −𝑥̂̇ | = ( 𝐴𝑥−𝐵𝐾𝑥̂+𝑤 |      | )−( 𝐴𝑥̂−𝐵𝐾𝑥̂+𝐾 |       | 𝐶𝑒+𝐾 | 𝑤   | )          |
| ---------------- | --------- | ------------- | ---- | -------------- | ----- | ---- | --- | ---------- |
|                  |           |               |      | 𝑑              |       | 𝑓    | 𝑓   | 𝑛          |
| ⟹ 𝑒̇ =𝐴(𝑥−𝑥̂ )−𝐾 |           |               | 𝐶𝑒+𝑤 | −𝐾 𝑤 = (𝐴−𝐾    | 𝐶)𝑒+𝑤 |      | −𝐾  | 𝑤     [2]  |
|                  |           |               | 𝑓    | 𝑑 𝑓 𝑛          | 𝑓     |      | 𝑑 𝑓 | 𝑛          |

Kalman Filter [2]
Kalman  filtering  is  an  algorithm  that  provides  estimates  of  some  unknown  variables  given  the
measurements observed over time. Kalman filters have been demonstrating its usefulness in various
applications. Kalman filters have relatively simple form and require small computational power. Kalman
Filter is an estimator for what is called the linear-quadratic problem, which is the problem of estimating the
instantaneous “state” of a linear dynamic system perturbed by white noise-by using measurements linearly
related to the state but corrupted by white noise.
Practically it is used for predicting the likely the future courses of dynamic systems that are likely to control.
𝑥̇ = 𝐹𝑥+𝐺𝑢+𝑤
The measurements be linearly related
|     |     |     |     | 𝑧 = 𝐻𝑥+𝑣  |     |     |     |     |
| --- | --- | --- | --- | --------- | --- | --- | --- | --- |
The process-noise matrix Q with noise vector w and measurement noise matrix R is related to the
measurement noise vector v according to
Q = E[wwT]
R = E[vvT]

Parameter Covariance Matrix P [3]
‘P’ contains estimates of the uncertainty and correlation between uncertainties of state vector components.
It is based on information supplied to the Kalman filter. It is not obtained from measurements.
Process Covariance Matrix Q(t)
Matrix describing instabilities of components of the state vector, e.g., clock noise, time transfer noise
moving from time t to t+t.
Noise parameters:
Parameters used to determine the elements of the process covariance matrix, describe individual noise
processes.
Measurement Covariance Matrix, R:
Describes measurement noise, white but individual measurements may be correlated. It may be removed.

Design Matrix, H:
Matrix that relates the measurement vector and the state vector using y =H x.
Kalman Gain, K:
Kalman gain determines the weighting of current measurements and estimates from previous iteration. It
is computed by filter.
Kalman gain computation
=(𝐴−𝐵𝐾)𝑥+𝐵𝐾𝑒+𝑤
|     |     |     | 𝑥̇       |          | 𝑑   |     |     |     |
| --- | --- | --- | -------- | -------- | --- | --- | --- | --- |
|     |     |     | 𝑒̇ =(𝐴−𝐾 | 𝐶)𝑒+𝑤 −𝐾 | 𝑤   |     |     |     |
|     |     |     |          | 𝑓 𝑑      | 𝑓 𝑛 |     |     |     |

So, we can write,
|     | (𝐴−𝐵𝐾) | 𝐵𝐾  | 𝑥      | 1   | 0 𝑤   |
| --- | ------ | --- | ------ | --- | ----- |
| 𝑥̇  |        |     |        |     | 𝑑     |
| [   | ] = [  |     | ][ ]+[ |     | ][ ]  |
| 𝑒̇  | 0      | 𝐴−𝐾 | 𝐶 𝑒    | 1   | −𝐾 𝑤  |
|     |        |     | 𝑓      |     | 𝑓 𝑛   |
where K is Kalman gain. It is expressed by
f
−1
|     | 𝑃−(𝑡   | )𝐻𝑇[𝐻𝑃−(𝑡 | )𝐻𝑇+𝑅(𝑡 |     |      |
| --- | ------ | --------- | ------- | --- | ---- |
|     | 𝐾(𝑡 )= |           |         |     | )]   |
|     | 𝑛      | 𝑛         | 𝑛       |     | 𝑛    |

Operation of Kalman Filter
1.  It provides an estimate of the current parameters using current measurements and previous parameter
estimates
2.  It should provide a close to optimal estimate if the models used in the filter match the physical
situation.

Five steps in the operation of a Kalman filter [4]
1.  State Vector propagation
2. Parameter Covariance Matrix propagation
3. Compute Kalman Gain
4. State Vector update
5. Parameter Covariance Matrix update

The required code for designing LQG Controller for the given system:
The state space equation of the given system is
|     |     | −1     | −5  | 10  |     |
| --- | --- | ------ | --- | --- | --- |
|     |     | 𝑥̇ = [ | ]+[ | ]𝑢  |     |
|     |     | 10     | −1  | 0   |     |
𝑦 = [1 0] 𝑥

Code:

Output of Command Window
T =1

Result:
The open loop response of the system and close loop response of the system with LQG controller
are:
Figure 2: Open loop & closed loop step response of the system in MATLAB
Designing LQG Controller in Simulink:
The LQG controller for the given system is designed using block diagram in Simulink.
Figure 3: Open loop & closed loop Block Diagram the given system in Simulink
Result:
Using Simulink, the open loop response of the system and close loop response of the system with
LQG controller are:

Figure 4: Open loop & closed loop step response simulation of the system in Simulink.
Discussion: In this experiment, a Linear Quadratic Gaussian (LQG) controller was designed and
implemented for a given linear system using both MATLAB and Simulink. The LQG controller combines
a Linear Quadratic Regulator (LQR) with a Kalman filter to provide optimal control under noisy conditions.
The Kalman filter estimates the internal states from noisy outputs, while the LQR uses these estimates to
generate the control input. The experiment demonstrated that the closed-loop system achieved better
stability and performance compared to the open-loop response. Simulation results validated the theoretical
expectations, showing an improved step response and confirming system stability (T = 1).
Conclusion: The experiment successfully demonstrated the design and implementation of an LQG
controller for a linear system. By integrating the Kalman filter with LQR, the controller effectively
estimated the system states and stabilized the system despite measurement noise. Both MATLAB and
Simulink simulations confirmed that the closed-loop system provided improved dynamic performance and
ensured system stability. This experiment highlights the practical usefulness of LQG control in optimal and
robust system design.
Reference:
[1] Linear–Quadratic–Gaussian (LQG) Design. MathWorks Documentation. Updated 2025. Available:
https://www.mathworks.com/help/control/getstart/linear-quadratic-gaussian-lqg-design.html.
[2] R. E. Kalman, “A new approach to linear filtering and prediction problems,” Transactions of the
ASME—Journal of Basic Engineering, vol. 82, no. 1, Mar. 1960.
[3] B. D. O. Anderson and J. B. Moore, Optimal Filtering. Englewood Cliffs, NJ, USA: Prentice-Hall,
1979.
[4] K. J. Åström, Introduction to Stochastic Control Theory. Mineola, NY, USA: Dover Publications, 2006.