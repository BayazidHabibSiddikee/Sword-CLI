Experiment No. 01
Experiment Name: Simulation and Verification of Basic Pneumatic Logic     Operations Using
FluidSim Software.

Objectives:

  To understand the basic working environment, components, and simulation procedure of

FluidSIM software.

  To study  the  working principle  of  pneumatic  logic  valves  used  to realize Boolean logic

operations.

  To verify the output response of each simulated circuit against its corresponding truth table.

Introduction:

FluidSIM is a specialized simulation software, developed by Festo Didactic in cooperation with
the  Universities  of  Paderborn  and  Kaiserslautern  that  is  used  for  the  design,  simulation,  and
analysis  of  pneumatic,  hydraulic,  and  electro-pneumatic  circuits.  The  software  provides  a
graphical  drag-and-drop  environment  in  which  standard  ISO-symbol  components,  including
compressors,  directional  control  valves,  cylinders,  sensors,  and  logic  valves,  can  be  selected,
interconnected,  and  animated  to  observe  the  dynamic  behavior  of  a  circuit  under  simulated
operating conditions.

Pneumatic  systems  form  one  of  the  oldest  and  most  widely  used  branches  of  automation
technology, in which compressed air is employed as the working medium to transmit energy and
signals for the performance of mechanical work. Long before the advent of electronic and digital
controllers, pneumatic components such as directional control valves, cylinders, and logic valves
were  combined  to  build  control  circuits  capable  of  performing  switching  and  decision-making
functions  analogous  to  those  carried  out  by  electronic  logic  gates.  The  fundamental  Boolean
operations,  namely  AND,  OR,  NOT,  NAND,  NOR,  and  Exclusive-OR  (X-OR),  can  each  be
physically  realized  through  an  appropriate  arrangement  of  pneumatic  valves,  and  such  circuits
remain relevant in industrial environments where explosion hazards, electromagnetic interference,
moisture, or extreme temperatures make electrical control systems unsuitable.

In this report I have discussed and displayed how FluidSIM was employed to design and simulate
pneumatic  circuits  corresponding  to  the  AND,  OR,  NOT,  NAND,  NOR,  and  X-OR  logic
operations, and the response of each circuit was verified against its respective truth table.

Building Logic Gates:

1.  OR Gate:

The  OR  logic  gate  was  constructed  in  FluidSIM  by  using  two  pneumatic  input  lines
connected to a shuttle valve (OR valve). The two inputs were designated as A and B, while
the output was connected to a pneumatic actuator or indicator. Compressed air was supplied
to  both  input  lines  through  separate  3/2-way  push-button  valves.  The  outputs  of  these
valves were connected to the two input ports of the shuttle valve. When either input valve

was actuated, compressed air was allowed to pass through the shuttle valve to the output.
The  same  response was  obtained  when both  input  valves  were actuated  simultaneously.
Thus, the output became active when A or B or both were active, satisfying the Boolean
expression Y = A + B.

                                                          Figure-01: OR gate.

2.  AND Gate:
      The AND logic gate was constructed by connecting two pneumatic input valves in such a
way that compressed air had to pass through both valves before reaching the output. Two 3/2-
way push-button valves were used as inputs A and B, and their pneumatic connections were
arranged in series. The output of the first valve was connected to the input of the second valve,
and the output of the second valve was connected to the actuator or indicator. Air could reach
the output only when both input valves were actuated at the same time.  If either one of the
input valves remained unactuated, the air path was interrupted and no output was produced.
Therefore, the circuit performed the AND operation according to Y = A · B.

3.  NOT Gate:
The NOT logic gate was constructed using a pneumatic valve with a normally open or normally
closed  configuration  arranged  so  that  the  output  condition  became  opposite  to  the  input
condition. A  3/2-way  pneumatic valve was used  as the input element, and its actuation was
controlled by input A.  In the normal state, compressed air was allowed to reach the output,
producing an active output when the input was inactive. When input A was actuated, the valve
changed  its  position  and  interrupted  the  air  supply  to  the  output.  Consequently,  the  output
became inactive when the input was active and vice versa. Hence, the circuit performed the
NOT operation, represented by Y = Ā.

                                   Figure-03: NOT Gate.

4.  NOR Gate:

The NOR logic gate was constructed by combining an OR pneumatic arrangement with a
NOT function. Two 3/2-way push-button valves  were used as  inputs A  and B, and their
outputs were connected to a shuttle valve to perform the OR operation. The output of the
shuttle valve was then directed to a pneumatic valve arranged to invert the signal. When
either A or B was actuated, an output signal was generated by the OR section, but this signal
was  subsequently  blocked  or  inverted  by  the  NOT  section.  Therefore,  the  final  output
remained active only when both inputs were inactive. The resulting circuit represented the
NOR operation according to Y = ¬(A + B).

5.  NAND Gate:

The NAND logic gate was constructed by combining an AND pneumatic arrangement with
a NOT function. Two 3/2-way input valves were connected in series so that the output of
the AND section became active only when both A and B were actuated. This output was
then connected to an inverting pneumatic valve. When both input valves were actuated, the
AND section produced an air signal, which caused the inverting section to switch and make
the final output inactive. If either one or both inputs were not actuated, the AND output
was  absent  and  the  final  output  remained  active.  Therefore,  the  circuit  performed  the
NAND operation expressed as Y = ¬(A · B).

                                          Figure-05: NAND Gate.

6.  X-OR Gate:

The  XOR  logic  gate  was  constructed  by  combining  pneumatic  AND,  OR,  and  NOT
functions so that the output became active only when one of the two inputs was active. Two
input signals A and B were supplied to the pneumatic circuit. An OR arrangement was used
to produce an output when either input was active, while an AND arrangement was used
to detect the condition in which both inputs were active. The AND signal was then inverted
and combined appropriately with the OR signal. As a result, the final output was activated
when A = 1, B = 0 or A = 0, B = 1, but it remained inactive when both inputs were either
active or inactive. Thus, the XOR operation was obtained according to Y = A ⊕ B = ĀB +
A B̄.

                                                      Figure-06: X-OR Gate.
Discussion:
Prior to the implementation of the individual logic circuits, the FluidSIM environment have been
introduced, and the basic components required for pneumatic circuit construction, including the
compressed air supply, push-button-actuated three by two directional control valves used as input
signal generators, two-pressure valves, shuttle valves, and single-acting cylinders used as output
indicators,  have been  identified  and  placed  on  the  simulation  worksheet.  Connections  between
components  have  been  made  using  pneumatic  supply  lines,  and  each  circuit  have  been
subsequently  simulated  by  activating  the  input  valves  in  the  required  combinations  while  the
resulting extension or retraction of the output cylinder was observed and recorded. Some problems
have been occurred during the simulation that, the NOR, NAND and X-OR Gate gave inconsistent
result while A=0, B=0 &A=1, B=1 conditions. So, there have been some limitation designing these
three circuits.

Conclusion:
Experimental results have been significantly matched with the theoretical result. Some problem
and design limitations have also been recognized. The introduction and importance of pneumatic
control have been understood and the use of FluidSim in this field have been realized. To sum up,
through this exercise, a foundational understanding of pneumatic logic control have been gained,
which  is  expected  to  be  of  value  in  subsequent  studies  of  electro-pneumatic  and  industrial
automation systems.

References:
[1]  Festo  Didactic  GmbH  &  Co.  KG,  FluidSIM  5  Pneumatics  User  Manual,  Festo  Didactic,
Denkendorf, Germany.
[2] Croser, P. and Ebel, F., Pneumatics: Basic Level, Festo Didactic GmbH & Co. KG, Esslingen,
Germany.
[3]  Majumdar,  S.  R.,  Pneumatic  Systems:  Principles  and  Maintenance,  Tata  McGraw-Hill
Education, New Delhi, India.

