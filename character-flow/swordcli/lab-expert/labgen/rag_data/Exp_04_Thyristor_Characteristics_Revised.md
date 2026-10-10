Heaven'sLightisOurGuide
| Rajshahi | University | of Engineering  | & Technology |
| -------- | ---------- | --------------- | ------------ |
|          | Department | of Mechatronics | Engineering  |
Lab Report
| Course Title      | : PowerElectronics                      | andDrives |     |
| ----------------- | --------------------------------------- | --------- | --- |
| Course Code       | Sessional:                              | MTE 3201  |     |
| ExperimentNo.     | : 04                                    |           |     |
| ExperimentName    | : StudyofThyristor(SCR)Characteristics. |           |     |
| Date ofExperiment | : 06-09-                                |           |     |
| Date ofSubmission | 2026: 20-09-                            |           |     |
2026
|     | SubmittedBy |     | SubmittedTo |
| --- | ----------- | --- | ----------- |
SarafatHussainAbhi
BayazidHabibSiddikee
AssistantProfessor,
3rdyear(EvenSemester)
Dept.ofMTE,RUET
Roll:2208053Session:
2022-23
PrangonDas
RajshahiUniversityofEngineering&
AssistantProfessor,
Technology,Rajshahi
Dept.ofMTE,RUET

Experiment No: 04
Experiment Name: Study of Thyristor (SCR) Characteristics.
Objectives:
1. To examine how the gate signal controls the turn-on of a thyristor (SCR).
2. To find the gate trigger voltage (V ) at which the device starts conducting.
GT
3. To compare the anode-to-cathode voltage (V ) of the device before and after it is triggered.
AK
Introduction:
The thyristor, also called a silicon controlled rectifier (SCR), is a four-layer (PNPN), three-terminal
semiconductor switch. With the anode made positive relative to the cathode, the device still stays in
its forward-blocking (off) state and passes only a negligible leakage current until a suitable pulse is
injected into the gate. Raising the gate-to-cathode voltage drives a growing gate current, and when it
reaches the gate trigger level (V /I ) the device snaps into the forward-conduction (on) state. At
GT GT
that instant V drops from almost the whole supply voltage to a small on-state drop of about one
AK
volt. The SCR then keeps conducting even after the gate drive is taken away and turns off again only
when the anode current falls under the holding current. In this experiment the gate voltage was raised
in steps with a potentiometer while a storage oscilloscope displayed V , so that the gate voltage at
AK
which triggering takes place could be located.
Figure-01: PT970721 Power Electronic Trainer
Required Apparatus:
1. Power supply unit, PTE-047-01
2. Thyristor characteristics module, PTE-047-03
3. AC lamp, 12 V / 2 W
4. Diode, 1N4002
5. Potentiometer, 10 kΩ
6. Thyristor (SCR), BT151
7. Digital multimeter
8. Storage oscilloscope
9. Connecting leads
2

Circuit Diagram:
The circuit that was wired on the trainer is shown in Figure-02. It is reproduced from the hand-drawn
sketch made in the laboratory during the experiment.
Figure-02: SCR gate-triggering circuit (R = 100 Ω, R = 10 kΩ, R = 10 Ω)
1 2 3
Principle:
A 12 V AC source feeds the circuit through a 12 V / 2 W lamp, which serves as a visible load and
limits the current. After the lamp the circuit divides into two paths. One path goes through the BT151
thyristor and the small sensing resistor R . The other goes through the 1N4002 diode D , the fixed
3 1
resistor R and the potentiometer R ; this path produces a rectified, adjustable voltage. The slider of
1 2
R is joined to the thyristor gate, so turning the knob changes the gate drive. The voltage across R is
2 3
the gate voltage U , and the voltage across the thyristor is U . Both are displayed together on the
GT AK
oscilloscope, with CH1 on U and CH2 on U .
AK GT
When the slider is near the low end, U is tiny and the gate current is too weak to start regeneration
GT
inside the PNPN structure. The SCR therefore keeps blocking, and the anode-cathode voltage follows
the supply waveform (the device is not triggered). As U is raised past the minimum gate trigger
GT
voltage, the device latches on, U falls to the small conduction drop, and the load starts drawing
AK
current (the device is triggered). Noting U and U at several potentiometer positions therefore
GT AK
gives an approximate value of the gate trigger voltage.
3

Procedure:
1. The power supply, thyristor-characteristics module and load panel were mounted on the trainer
and interconnected following the circuit diagram of the lab manual.
2. The AC source, lamp, diode D , resistor R , potentiometer R , resistor R  and the BT151 were
|     |     |     | 1   | 1   | 2   | 3   |     |
| --- | --- | --- | --- | --- | --- | --- | --- |
joined exactly as drawn in Figure-02.
3. Oscilloscope channel CH1 was placed across the anode and cathode to display U , and channel
AK
| CH2 was placed across R |     |  to display U |     | .   |     |     |     |
| ----------------------- | --- | ------------- | --- | --- | --- | --- | --- |
|                         |     | 3             |     | GT  |     |     |     |
4. Potentiometer R  was turned to its minimum position and the supply was then switched on.
2
5. The knob was turned up slowly, and at each position U  and the matching U  were read from
|     |     |     |     | GT  |     |     | AK  |
| --- | --- | --- | --- | --- | --- | --- | --- |
the oscilloscope.
6. The position at which the SCR moved from the blocking state to the conducting state was
| identified from the abrupt change in the U |     |     |     |  trace. |     |     |     |
| ------------------------------------------ | --- | --- | --- | ------- | --- | --- | --- |
AK
7. All readings were entered in the data table, and screenshots of the oscilloscope were taken at the
different stages.
Data Table:
|     |                   |     | U   |  (Anode-Cathode |         |     |               |
| --- | ----------------- | --- | --- | --------------- | ------- | --- | ------------- |
| No. | U  (Gate Voltage) |     | AK  |                 | I  = U  | /R  | Remarks       |
|     | GT                |     |     | Voltage)        | G GT    | 3   |               |
| 1   | 26 mV             |     |     | 3.64 V          | 2.6 mA  |     | Not triggered |
| 2   | 182 mV            |     |     | 2.90 V          | 18.2 mA |     | Triggered     |
| 3   | 224 mV            |     |     | 3.68 V          | 22.4 mA |     | Triggered     |
| 4   | 186 mV            |     |     | 2.06 V          | 18.6 mA |     | Triggered     |
| 5   | 184 mV            |     |     | 3.20 V          | 18.4 mA |     | Triggered     |
Note: CH1 measured U  and CH2 measured U , as shown in the circuit diagram. Only reading No. 1
|     | AK  |     |     | GT  |     |     |     |
| --- | --- | --- | --- | --- | --- | --- | --- |
left the thyristor untriggered; every later, higher gate-voltage setting turned it on. The gate current column
is an added estimate, obtained by dividing U  by the 10 Ω sensing resistor R .
|     |     |     |     | GT  |     | 3   |     |
| --- | --- | --- | --- | --- | --- | --- | --- |
4

Result:
Figure-03 collects the oscilloscope screenshots taken at the various stages of the experiment.
| yellow trace | is U | and the cyan trace | is U The. |
| ------------ | ---- | ------------------ | --------- |
|              | AK   |                    | GT        |
Figure-03:Oscilloscopecapturesatdifferentstagesoftheexperiment
5

Discussion:
The gate-triggering behaviour of the BT151 SCR was examined by increasing the gate voltage U
GT
with a potentiometer and watching the anode-cathode voltage U on a storage oscilloscope. With
AK
the lowest setting (U = 26 mV, corresponding to roughly 2.6 mA through R ) the gate drive was
GT 3
inadequate, so the device stayed in the forward-blocking state and was recorded as not triggered. Once
the potentiometer was moved on, the gate voltage lay between about 182 mV and 224 mV (roughly 18
to 22 mA), and the SCR turned on at every one of these settings.
The measurements therefore place the minimum trigger voltage between 26 mV and 182 mV; the
lowest value that actually fired the device, 182 mV, is the best upper estimate obtained. A finer sweep
between these two settings would be needed to narrow it down. The U figures of the triggered
AK
readings (2.06 V to 3.68 V) are scattered, and the 3.64 V of the untriggered reading is not clearly
different from them. This is understandable because a single meter-style number depends on the point
of the AC cycle at which the SCR fires, on the drop across the lamp and the diode branch, and on
reading tolerances. For this reason the change of state was decided from the shape of the U
AK
waveform on the oscilloscope rather than from the numbers alone.
Conclusion:
The gate-triggering characteristic of the thyristor was studied successfully. The SCR blocks in the
forward direction as long as the gate voltage stays under a minimum trigger value; when this value is
exceeded it changes rapidly to the conducting state and its anode-cathode voltage drops sharply. The
experiment confirmed the basic switching action of the SCR and gave an approximate gate trigger
voltage of about 182 mV (about 18 mA of gate current) for this circuit.
References:
[1] Laboratory manual, Power Electronics and Drives Sessional (MTE 3201), Dept. of Mechatronics
Engineering, RUET.
[2] D. W. Hart, Power Electronics. New York, NY, USA: McGraw-Hill, 2011.
[3] R. W. Erickson and D. Maksimović, Fundamentals of Power Electronics, 3rd ed. Cham,
Switzerland: Springer, 2020.
[4] P. S. Bimbhra, Power Electronics, 5th ed. New Delhi, India: Khanna Publishers, 2012.
[5] NXP/WeEn Semiconductors, “BT151 series, Thyristors (SCR), 12 A, 500-800 V,” product
datasheet.
6