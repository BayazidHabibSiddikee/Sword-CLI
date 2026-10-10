HEAVEN’S LIGHT IS OUR GUIDE

RAJSHAHI UNIVERSITY OF ENGINEERING & TECHNOLOGY

DEPARTMENT OF MECHATRONICS ENGINEERING, 22Series

Course No: MTE 3102

Course Title: Control Systems Sessional

Experiment No: 02

Experiment Name: Design of PID controller for DC motor by using trial & error method and

analysis their performance

Remarks

Submitted By

Submitted To

Name: Md. Sadif Hossain Rit

Md. Faisal Rahman Badal

ID:2208002

Assistant Professor

Department of Mechatronics Engineering

Rajshahi University of Engineering & Technology,
Rajshahi-6204.

Submission Date: 29 April,2026.

0 | P a g e

Experiment No: 03

Experiment Name: Design of an LQR controller for a given system using trial & error method.

Objectives:

1.  To design PID controller, PD controller, and PI controller for given systems using the Root

Locus method.

2.  To evaluate and analyze the performance of these controllers based on their Root Locus

plots.

3.  To  adjust  and  optimize  the  PID  controller  parameters  to  achieve  the  desired  system

performance.

Theory:

Linear Quadratic Regulator (LQR):

The Linear Quadratic Regulator (LQR) is an optimal control strategy designed for linear systems
to  minimize  a  quadratic  cost  function,  typically  representing  a  trade-off  between  tracking
performance and control energy. It provides a systematic methodology for calculating a feedback
gain matrix K that ensures the stability and optimality of the system's state regulation or tracking
[2].

Proportional-Integral-Derivative (PID):

A  Proportional-Integral-Derivative  (PID)  controller  is  a  three-term  feedback  mechanism  that
generates a control signal based on the error between a desired setpoint and a measured process
variable [1].

1.  Proportional (P): Provides an action proportional to the current error.

2.  Integral (I): Reduces steady-state error by accumulating past errors.

3.  Derivative (D): Improves transient response by predicting future error based on its current

rate of change [1].

1 | P a g e

Root Locus:

The Root Locus method is a graphical technique used in control system design to show how the
roots (poles) of the closed-loop characteristic equation move in the complex s-plane as a specific
parameter, typically the loop gain $k$, varies from zero to infinity. It allows designers to evaluate
system stability and transient performance visually by observing the trajectories of these poles.

Trial and Error Method:

In the context of LQR design, trial and error refers to the iterative process of manually adjusting
the  weighting  matrices  Q  (state  penalty)  and  R  (control  penalty)  to  meet  specific  performance
criteria such as rise time, overshoot, or settling time [2].

Because  the  relationship  between  the  weights  in  Q  and  R  and  the  resulting  time-domain
performance is often non-linear and complex, designers frequently start with Bryson’s Rule or an
identity matrix and then "tune" the diagonal elements until the system response is optimized [2].

Required Apparatus:

1.  MATLAB 2024a.
2.  Laptop.

System model:

2 | P a g e

Transfer Function

Transfer Function of DC Motor,

=

𝜃𝜃`(𝑠𝑠)
𝑉𝑉(𝑠𝑠)

𝑘𝑘
(𝑅𝑅+𝑠𝑠𝑠𝑠)(𝑗𝑗𝑠𝑠+𝑐𝑐)+𝑘𝑘

2

Transfer Function of PID Controller =

Transfer Function of PI Controller =

𝑘𝑘𝐷𝐷�𝑠𝑠

2

𝑘𝑘𝑘𝑘
𝑘𝑘𝐷𝐷𝑠𝑠+

𝑘𝑘𝐼𝐼
𝑘𝑘𝐷𝐷�

+

𝑠𝑠

Transfer Function of PD Controller =

(𝑠𝑠𝑘𝑘𝑠𝑠+𝑘𝑘𝑘𝑘)
𝑠𝑠

𝑘𝑘𝐷𝐷 �𝑠𝑠 +

𝑘𝑘𝑠𝑠
𝑘𝑘𝐷𝐷�

clc;

clear;

close all;

% System Parameters (DC Motor)

J = 0.01;

b = 0.1;

K = 0.01;

R = 1;

L = 0.5;

s = tf('s');

% Transfer Function

TF = K/((J*s + b)*(L*s + R) + K^2);

%% ---------------- PID Controller ----------------

Kp_pid = 800;

Ki_pid = 500;

Kd_pid = 50;

PID = pid(Kp_pid, Ki_pid, Kd_pid);

CL_PID = feedback(PID*TF, 1);

3 | P a g e

%% ---------------- PI Controller ----------------

Kp_pi = 400;

Ki_pi = 250;

PI = pid(Kp_pi, Ki_pi, 0);

CL_PI = feedback(PI*TF, 1);

%% ---------------- PD Controller ----------------

Kp_pd = 1000;

Kd_pd = 20;

PD = pid(Kp_pd, 0, Kd_pd);

CL_PD = feedback(PD*TF, 1);

%% ---------------- Function to Calculate Delay Time ----------------

% Defining a small helper function to find the 50% mark

getDelayTime = @(sys) info_with_delay(sys);

%% ---------------- Step Responses ----------------

figure;

step(CL_PID, CL_PI, CL_PD);

legend('PID (to 1.0)','PI (to 1.0)','PD (settles < 1.0)');

title('Closed Loop Step Response Comparison');

grid on;

set(gca, 'FontSize', 12);

lines = findall(gcf, 'Type', 'line');

set(lines, 'LineWidth', 2);

%% ---------------- Performance Info & Delay Time Calculation ----------------

controllers = {CL_PID, CL_PI, CL_PD};

names = {'PID', 'PI', 'PD'};

for i = 1:3

    fprintf('\n--- %s ---\n', names{i});

    info = stepinfo(controllers{i});

4 | P a g e

    % Calculate Delay Time (Time to reach 50% of steady-state value)

    [y, t] = step(controllers{i});

    final_val = y(end);

    delay_index = find(y >= 0.5 * final_val, 1);

    delay_time = t(delay_index);

    % Display Info

    disp(info);

    fprintf('DelayTime: %.4f seconds\n', delay_time);

end

%% ---------------- Root Locus ----------------

% (Keep your existing root locus code here if needed)

Tuning Steps:

(selecting Control System Designer)

(Selecting Edit Architecture)

5 | P a g e

(import data for G and chose TF to import and pressing ok)

(Adding pole to Real zero)

(Design Requirements to New)

6 | P a g e

7 | P a g e

Results:

8 | P a g e

9 | P a g e

10 | P a g e

Systems  Delay Time(s)  Rise Time(s)  Peak Time(s)  % Overshoot
PI
PD
PID

50.3545
0
1.5808

0.0404
0.0142
0.0073

0.0429
0.0250
0.0200

0.1133
0.0585
0.0567

Settling Time(s)
0.7165
0.1497
0.0311

Discussion and Conclusion:

In this experiment, the control of a DC motor was analyzed using PID, PI, and PD strategies. Initial
faults were identified as system instability, characterized by a "runaway" response, and significant
steady-state error where the output failed to reach the unit step of 1.0. These faults were attributed
to the accidental placement of zeros in the Right Half Plane (RHP) and the lack of integral action
in a Type 0 system.

To mitigate these errors, the controller was redesigned to ensure all closed-loop poles remained in
the  Left  Half  Plane  (LHP). An  Integrator  was  incorporated  to  eliminate  steady-state  error,  and
gains  (Kp,  Ki,  Kd)  were  increased  to  overcome  the  small  motor  constant  (K  =  0.01).  It  was
concluded that while PD control improved speed, only the PID and PI controllers achieved the
target amplitude of 1.0. The PID controller was ultimately determined to be the superior solution,
providing the best balance of stability, zero tracking error, and optimized transient performance.

11 | P a g e

Reference:

[1]. Ang, K. H., Chong, G., & Li, Y. (2005). PID control system analysis, design, and technology.
559–576.
IEEE
https://doi.org/10.1109/tcst.2005.847331

Transactions

Technology,

Systems

Control

13(4),

on

Cited by: 4563.

[2].  Salem,  N.,  Mateen,  K., Alharbi,  W.,  &  Kamal,  J.  (2023).  Performance  of  LQR  and  PID
Controllers  for  RS-550VC  Motor  Speed  Enhancement.  2023  6th  International  Conference  on
Intelligent
1–6.
Control
https://doi.org/10.1109/irce59430.2023.10255039

Engineering

Robotics

(IRCE),

and

Cited by: 8.

[3].  MathWorks,
https://www.mathworks.com/discovery/optimal-control.html

Is  Optimal  Control?”  MathWorks.

“What

[Online].  Available:

. [Accessed: Apr. 21, 2026].

[4]. A. Marzouki, “PID Block Diagram: PID stands for Proportional-Integral-Derivative control,”
ResearchGate,  2012.
[Online].  Available:  https://www.researchgate.net/figure/PID-Block-
Diagram-PID-stands-for-Proportional-Integral-Derivative-control-A-PID_fig1_316709017

. [Accessed: Apr. 21, 2026].

[5].  University  of  Michigan,  “DC  Motor  Speed:  System  Modeling,”  Control  Tutorials  for
MATLAB
Available:
http://ctms.engin.umich.edu/CTMS/index.php?example=MotorSpeed&section=SystemModeling

Simulink

(CTMS).

[Online].

and

. [Accessed: Apr. 21, 2026].

12 | P a g e

