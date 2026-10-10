HEAVEN’S LIGHT IS OUR GUIDE
RAJSHAHI UNIVERSITY OF ENGINEERING &
TECHNOLOGY
DEPARTMENT OF MECHATRONICS ENGINEERING, 21Series
Course No:MTE 3104
Course Title:Microcontroller and Interfacing Sessional
Experiment No: 10
Experiment Name: Interfacing LM35 Temperature sensor using Atmega32 with
proteus simulation.
Submitted To:
Md. Sakib Hassan
Lecturer,
Department of Mechatronics Engineering,
Rajshahi University of Engineering & Technology
Md Zunaid Hossen
Lecturer,
Department of Mechatronics Engineering,
Rajshahi University of Engineering & Technology
Submitted by:
Adiba Binta Newaz
2108043
Date of Submission:
28th June, 2025

Experiment No: 10
Experiment Name: Interfacing LM35 Temperature sensor using Atmega32 with proteus simulation.
Objectives:
1. To understand the working principle and interfacing of the LM35 temperature sensor with a
microcontroller.
2. To learn how to use Atmega32 microcontroller for analog to digital conversion (ADC).
3. To simulate the hardware setup using Proteus software before actual implementation.
Theory:
The LM35 temperature sensor is a precision IC that
provides an output voltage linearly proportional to
the Celsius temperature. It doesn’t require any
external calibration and offers a scale factor of 10
mV per degree Celsius. This makes it easy to
interface with microcontrollers via ADC.[1]
An LCD display, typically a 16x2 character-based
module, is used to show real-time temperature
readings. It connects to the microcontroller via its
data and control pins and requires initialization in 4-
bit or 8-bit mode. This experiment combines all
these components into a system where the
Atmega32 reads temperature from the LM35 using
its ADC, processes the data, and displays it on the
Figure 1: LM35 Temperature Sensor
LCD. The simulation is performed in Proteus, and
the firmware is developed in Atmel Studio.
Required Software:
1. Atmel Studio 7
2. Proteus 8
Code:

Code Explanations:
1. SAMPLE 32: Number of samples to average for accurate ADC readings.
2. lcd_lib.h: Custom LCD library for initializing and writing data to an LCD.
3. static uint16_t ReadADC(uint8_t chn); Declares a static function to read 10-bit ADC data from the
specified channel.
4. Initial 100 ms delay stabilizes LCD; variables store ADC results and processed
voltage/temperature; ADMUX = 0x40 sets AVCC ref & channel 0; ADCSRA = 0x83 enables ADC
with prescaler 8.
5. Initializes LCD, displays "ADC Example" on row 0, and waits 2 seconds.
6. Reads 32 samples from ADC channel 0, averages them, converts to voltage, splits into integer and
decimal parts, and displays as X.XXV on LCD at row 1, column 2.
7. Reads 32 samples from channel 1 (LM35), averages them, converts to temperature using ADC/2,
and displays result as XX°C on LCD at row 1, column 9.
8. Reads 10-bit ADC value from selected channel (0–7) by setting ADMUX, starting conversion,
waiting for completion, combining ADCL and ADCH, clearing channel bits, and returning the
result.

Circuit Diagram:

L C D 1
LM 016L

|     |     |     |     | R V 1 | S D E                |                                 |
| --- | --- | --- | --- | ----- | -------------------- | ------------------------------- |
|     |     |     |     |       | S V D V E V SR W R E | 0 D 1 D 2 D 3 D 4 D 5 D 6 D 7 D |
|     |     |     |     |       | 1 2 3 4 5 6          | 7 8 9 0 1 1 2 3 4               |
|     |     |     |     | %05   |                      | 1 1 1 1                         |
1k

U 1
|     |     |     | 9                         | 2223242526272829 |     |     |
| --- | --- | --- | ------------------------- | ---------------- | --- | --- |
|     |     |     | RESET                     | PC0/SCL          |     |     |
|     |     |     | 1312                      | PC1/SDA          |     |     |
|     |     |     | XTAL1                     | PC2/TCK          |     |     |
|     |     |     | XTAL2                     | PC3/TM S         |     |     |
|     |     |     | 4039383736353433 PA0/ADC0 | PC4/TDO PC5/TDI  |     |     |
|     |     |     | PA1/ADC1                  | PC6/TOSC1        |     |     |
|     |     |     | PA2/ADC2                  | PC7/TOSC2        |     |     |
PA3/ADC3
|     |       |         | PA4/ADC4         | PD0/RXD 1415161718192021 |     |     |
| --- | ----- | ------- | ---------------- | ------------------------ | --- | --- |
|     |       |         | PA5/ADC5         | PD1/TXD                  |     |     |
|     |       | B A T 1 | PA6/ADC6         | PD2/INT0                 |     |     |
|     |       |         | PA7/ADC7         | PD3/INT1                 |     |     |
|     |       | 1.25    | 12345678         | PD4/OC1B                 |     |     |
|     |       |         | PB0/T0/XCK       | PD5/OC1A                 |     |     |
|     |       |         | PB1/T1           | PD6/ICP1                 |     |     |
|     |       |         | PB2/AIN0/INT2    | PD7/OC2                  |     |     |
|     | 1 U 2 |         | PB3/AIN1/OC0     |                          |     |     |
|     |       |         | PB4/SS PB5/M OSI |                          | C 1 |     |
|     |       |         | PB6/M ISO        | AREF 3230                |     |     |
|     | 25.0  |         | PB7/SCK          | AVCC                     |     |     |
10nF
ATM EGA32
|     | VOUT 2 |     |     |     |     |     |
| --- | ------ | --- | --- | --- | --- | --- |
3 LM 35

Figure 2: LM35 Temperature sensor circuit diagram

Result:

LCD1
LM016L

|     |     |     |     | RV1 | VSSDD VVEE RSW |     |
| --- | --- | --- | --- | --- | -------------- | --- |
RE D0D1D2D3D4D5D6D7
|     |     |     |     | %   | 123 456 | 7891011121314 |
| --- | --- | --- | --- | --- | ------- | ------------- |
|     |     |     |     | 50  |         |               |
1k

U1
|     |     |     | 9                   | 2 2                             |     |     |
| --- | --- | --- | ------------------- | ------------------------------- | --- | --- |
|     |     |     | R E S E T           | P C 0 / S C L 2 3               |     |     |
|     |     |     | 1 3                 | P C 1 / S D A 2 4               |     |     |
|     |     |     | 1 2 X T A L 1       | P C 2 / T C K 2 5               |     |     |
|     |     |     | X T A L 2           | P P C C 3 4 / / T T M D O S 2 6 |     |     |
|     |     |     | 4 0 P A 0 / A D C 0 | P C 5 /T D I 2 7                |     |     |
|     |     |     | 3 9 P A 1 / A D C 1 | P C 6 / T O S C 1 2 8           |     |     |
|     |     |     | 3 8 P A 2 / A D C 2 | P C 7 / T O S C 2 2 9           |     |     |
3 7 P A 3 / A D C 3
|     |       |        | 3 6 P A 4 / A D C 4                             | P D 0 / R X D 1 4     |     |     |
| --- | ----- | ------ | ----------------------------------------------- | --------------------- | --- | --- |
|     |       |        | 3 3 4 5 P A 5 / A D C 5                         | P D 1 / T X D 1 1 5 6 |     |     |
|     |       | B A T1 | 3 3 P A 6 / A D C 6                             | P D 2 / I N T 0 1 7   |     |     |
|     |       |        | P A 7 / A D C 7                                 | P D 3 / I N T 1 1 8   |     |     |
|     |       | 1.2 5  | 1                                               | P D 4 / O C 1 B 1 9   |     |     |
|     |       |        | 2 P B 0 / T 0 / X C K                           | P D 5 / O C 1 A 2 0   |     |     |
|     |       |        | 3 P B 1 / T 1                                   | P D 6 / I C P 1 2 1   |     |     |
|     |       |        | 4 P P B B 2 3 / / A A I I N N 0 1 / / I O N C T | 0 2 P D 7 / O C 2     |     |     |
|     | 1 U2  |        | 5 P B 4 / S S                                   |                       | C 1 |     |
|     |       |        | 6 P B 5 / M O S I                               |                       |     |     |
|     |       |        | 7 P B 6 / M I S O                               | A R E F 3 2           |     |     |
|     | 2 4.0 |        | 8 P B 7 / S C K                                 | A V C C 3 0           |     |     |
10 nF
|     | 2   |     | ATMEGA32 |     |     |     |
| --- | --- | --- | -------- | --- | --- | --- |
VOUT
3 LM35

Figure 3: LM35 Temperature sensor Proteus Simulation

Discussion: The experiment shows how to interface an LM35 sensor with ATmega32 using its ADC.
Averaging 32 samples improved reading accuracy. The measured voltage and temperature were displayed
on an LCD. Proteus simulation verified the system's correct functionality.
Conclusion: LM35 interfacing with ATmega32 was successfully implemented and simulated. ADC
readings were accurate and stable. LCD display and Proteus simulation worked as expected. The
experiment met its objectives effectively.
Reference:
[1] Texas Instruments, “LM35 Precision Centigrade Temperature Sensor,” Datasheet SNIS159G,
2000.