HEAVEN’S LIGHT IS OUR GUIDE

RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY

DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series

Course No: MTE 3101
Course Title: Control Systems Sessional

Experiment No: 04
Experiment Name: Determination of controllability and observability of a system
using both transfer function and state space.

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

3rd May, 2025

Experiment No: 04

Experiment Name: Determination of controllability and observability of a system using both transfer

function and state space.

Objectives:

1.  Understand the concepts of controllability and observability in control systems.

2.  Analyze  a  system's  controllability  and  observability  using:  Transfer  function  &  State-space

representation

Theory:

Controllability  and  observability  are  key  principles
in  control  system  analysis  and  design.
Inputs and outputs are vital in defining a system's ability to be fully controlled and accurately infer internal
conditions.  This  report  focuses  on:  Two  methodologies  are  used  to  determine  controllability  and
observability in dynamic systems: the transfer function method and the state-space representation.

Controllability: If an input to a system can be found that takes every state variable from a desired initial
state to a desired final state, the system is said to be controllable; otherwise, the system is uncontrollable.
In order to be able to determine controllability or, alternatively, to design state feedback for a plant under
any representation or choice of state variables, a matrix can be derived that must have a particular property
if  all  state  variables  are  to  be  controlled  by  the  plant  input,  u.  We  now  state  the  requirement  for
controllability,  including  the  form,  property,  and  name  of  this  matrix.  An  nth-order  plant  whose  state
equation is

is completely controllable if the matrix

is of rank n, where 𝐶𝑀 is called the controllability matrix.[1]

𝐶𝑀 = [ 𝐵  𝐴𝐵  𝐴2𝐵  ∙∙∙   𝐴𝑛−1𝐵 ]

𝑥̇ = 𝐴𝑥 + 𝐵𝑢

Observability: Observability is the ability to deduce the state variables from a knowledge of the input, u(t),
and the output, y(t). Pole placement for an observer is a viable design technique only for systems that are
observable.
In  order  to  determine  observability  for  systems  under  any  representation  or  choice  of  state  variables,  a
matrix can be derived that must have a particular property if all state variables are to be observed at the
output. We now state the requirements for observability, including the form, property, and name of this
matrix. An nth-order plant whose state and output equations are, respectively,

is completely observable if the matrix

𝑥̇ = 𝐴𝑥 + 𝐵𝑢
𝑦 = 𝐶𝑥

𝑂𝑀 = [

𝐶
𝐶𝐴
… .
𝐶𝐴𝑛−1

]

is of rank n, where 𝑂𝑀 is called the observability matrix.[1]

Required Apparatus:

MATLAB

MATLAB Code:

1.  Using State Space

2.  Using Transfer Function

Result:

(a)                                                                                     (b)

Figure 1: Controllability and observability test using (a) state space (b) transfer function

Discussion:
This  experiment  focused  on  analyzing  a  system’s  controllability  and  observability  using  both  transfer
function  and  state-space  approaches.  The  state-space  method  provided  a  matrix-based  test  using
controllability and observability matrices. If these matrices had full rank, the system was controllable and
observable. The transfer function approach helped identify whether the system was minimal—i.e., free from
pole-zero cancellations that might affect control or observation. The comparison highlighted that while the
transfer function is useful for a quick check, state-space analysis gives deeper insight into system dynamics.

Conclusion:
The experiment successfully demonstrated how to verify the controllability and observability of a system
using  both  theoretical  and  practical  methods.  The  state-space  method  proved  more  comprehensive,
especially for systems with multiple states. Understanding these concepts is crucial for designing reliable
control systems.

Reference:
[1] N. S. Nise, Control Systems Engineering, 6th ed. Hoboken, NJ, USA: John Wiley & Sons, 2011.

