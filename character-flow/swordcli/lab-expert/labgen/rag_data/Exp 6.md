HEAVEN’S LIGHT IS OUR GUIDE
RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY
DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series
Course No:MTE 3102
Course Title:Control Systems Sessional
Experiment No: 06
Experiment Name: Design of a Fuzzy Logic Controller to Control the Washing
Time of a Washing Machine
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

Experiment No: 06
Experiment Name: Design of a Fuzzy Logic Controller to Control the Washing Time of a Washing
Machine
Problem:
Design a controller to determine the wash time of a domestic washing machine. Assume the input is dirt &
grease on cloths. Use five (5) descriptors for input variables and seven (7) descriptors for output variable.
Derive the set of rules for controller action and defuzzification. The design should be supported by figure
wherever possible. Show that if the cloths are solid to a larger degree the wash time will be more and vice
versa.
Objectives:
1. To understand the principles of fuzzy logic.
2. To simulate and implement the FLC using MATLAB’s Fuzzy Logic Toolbox.
3. To analyze key factors affecting washing time, such as load size, dirtiness level, and fabric type,
and formulate fuzzy input variables accordingly.
Theory:
The Fuzzy Logic or the Fuzzy Logic Control is an Artificial Intelligence approach/technique, which is
especially used for designing and developing intelligent controlling systems. It provides an effective and
efficient method to simulate the human thinking and behaviors in order to ensure the related intelligent
controlling structure. [1]
Fuzzy Logic Process:
1. Fuzzification:
o Converts real-world crisp input values (like load size, dirtiness level, etc.) into fuzzy
values using membership functions (e.g., Small, Medium, Large).
o Example: A dirt level of 70% might belong partially to both “Medium” and “High”
dirtiness sets.
2. Rule Evaluation (Inference Engine):
o Applies a set of IF-THEN rules based on fuzzy inputs.
o Example rule: IF Dirtiness is High AND Load is Large THEN Washing Time is Long
3. Aggregation of Rule Outputs:
o Combines the outputs of all rules using fuzzy operators (like MIN, MAX, AND, OR) to
form a combined fuzzy output set.
4. Defuzzification:
o Converts the aggregated fuzzy output back into a crisp, real-world value (e.g., 42 minutes
of wash time).
o Common methods: Centroid, Bisector, Mean of Maximum (MoM).
Figure 1: Block Diagram of Fuzzy Logic Process [2]

Required Apparatus:
MATLAB (Fuzzy Inference System)
Figure 2: Fuzzy Inference System in MATLAB
Working Procedure in MATLAB (Using Fuzzy Logic Toolbox) [3]:
1. Open MATLAB and the Fuzzy Logic Toolbox by writing fuzzyLogicDesigner in the command
window.
2. Create a New FIS file for the washing machine controller.
3. Define two input variables:
a. Dirt with five fuzzy sets (Very Small Dirt, Small Dirt, Medium Dirt, Large Dirt, Very
Large Dirt).
b. Grease with five fuzzy sets (Very Small Grease, Small Grease, Medium Grease, Large
Grease, Very Large Grease).
4. Define the output variable:
a. Time with seven fuzzy sets (Extremely Small, Very Small, Small, Medium, Large, Very
Large, Extremely Large).
5. Assign membership functions for inputs and output to define value ranges.
a. Dirt Level (range: [0-100]):
i. Very Small Dirt (VSD): [-20.5 0 20.5]
ii. Small Dirt (SD): [4.5 25 45.5]
iii. Medium Dirt (MD): [29.5 50 70.5]
iv. Large Dirt (LD): [54.5 75 95.5]
v. Very Large Dirt (VLD): [79.5 100 120.5]

Figure 3: Membership Function of Dirt
b. Grease Level (range: [0-100]):
i. Very Small Grease (VSG): [-20.5 0 20.5]
ii. Small Grease (SG): [4.5 25 45.5]
iii. Medium Grease (MG): [29.5 50 70.5]
iv. Large Grease (LG): [54.5 75 95.5]
v. Very Large Grease (VLG): [79.5 100 120.5]
Figure 4: Membership Function of Grease
c. Wash Time (output range: [0-100] minutes):
i. Extremely Small Time (EST): [-8.5 0 8.5]
ii. Very Small Time (VST): [1.5 10 18.5]
iii. Small Time (ST): [11.5 20 28.5]
iv. Medium Time (MT): [21.5 30 38.5]
v. Large Time (LT): [31.5 40 48.5]
vi. Very Large Time (VLT): [41.5 50 58.5]
vii. Extremely Large Time (ELT): [51.5 60 68.5]

Figure 3: Membership Function of Dirt

Creating Fuzzy Rules:
|     |     |     |         Grease  |     |     |     |     |
| --- | --- | --- | --------------- | --- | --- | --- | --- |
The  fuzzy  rules  described  the  relationship  Dirt  VSG  SG  MG  LG  VLG
| between  the  | input  variables  | (dirt  level  | and  |     |     |     |     |
| ------------- | ----------------- | ------------- | ---- | --- | --- | --- | --- |
|               |                   |               |      |     |     |     |     |
grease level) and the output (wash time). Used
|                                                 |     |     |     | VSD  | EST  VST  | ST  MT  | MT  |
| ----------------------------------------------- | --- | --- | --- | ---- | --------- | ------- | --- |
| the following rules to define the relationship  |     |     |     |      |           |         |     |
|                                                 |     |     |     | SD   | VST  VST  | MT  LT  | LT  |

|     |     |     |     |     |         |         |      |
| --- | --- | --- | --- | --- | ------- | ------- | ---- |
|     |     |     |     | MD  | ST  ST  | LT  LT  | VLT  |

|     |     |     |     |     |         |           |      |
| --- | --- | --- | --- | --- | ------- | --------- | ---- |
|     |     |     |     | LD  | MT  LT  | VLT  VLT  | VLT  |
|     |     |     |     |     |         |           |      |

|     |     |     |     | VLD  | MT  LT  | VLT  VLT  | ELT  |
| --- | --- | --- | --- | ---- | ------- | --------- | ---- |
Results and Graph:
Test 01: If Dirt is 25% and Grease is 60% then Time is 33.6 minutes
Figure 6: Dirt 20% and Grease 80% then Time 31.8 minutes

Figure 7: Surface Mapping Portraying the Relationship between Time and Dirt-Grease
Discussion: The fuzzy logic controller was designed to determine optimal washing time based on dirt and
grease levels. Using triangular membership functions, input variables (dirt and grease) and output (washing
time) were categorized into linguistic terms from very small to very large. Fuzzy rules, like "IF Dirt is Very
Small AND Grease is Very Small THEN Time is Extremely Small," guided the system. Implemented in
MATLAB’s Fuzzy Logic Toolbox, simulations showed that higher dirt and grease levels led to longer wash
times. The surface plot confirmed smooth and realistic transitions in wash time decisions.
Conclusion: A fuzzy logic controller was developed to set washing time based on dirt and grease levels.
Triangular and trapezoidal membership functions defined input and output variables using linguistic terms.
Fuzzy rules guided decision-making, and MATLAB simulations showed that increased dirt and grease
resulted in longer wash cycles. Surface plots confirmed smooth, human-like adjustments in wash time.
Reference:
[1] Köse, U. and Deperlioğlu, Ö., “FL-LAB v2: Design and Development of an Easy-to-Use, Interactive
Fuzzy Logic Control Software System,” Applied Mathematics & Information Sciences, vol. 9, no. 2,
pp. 883–897, March 1, 2015.
[2] Vicerra R. R. P., David K. K. A., dela Cruz A. R., Roxas E. A., Simbulan K. B. C., Bandala A. A., “A
multiple level MIMO fuzzy logic based intelligence for multiple agent cooperative robot system,” 2015
IEEE Region 10 Conference (TENCON), Macao, China, Nov. 2015, pp. 1–7.
[3] J. D. Padhya and S. S. Salankar, "Fuzzy logic based intelligent washing machine," in Proc. Int. Conf.
Energy Efficient Technol. Sustain., Nagercoil, India, Apr. 2013, pp. 760–764. doi:
10.1109/ICEETS.2013.6533469