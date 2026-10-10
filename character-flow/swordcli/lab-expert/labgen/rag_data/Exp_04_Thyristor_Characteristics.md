Heaven'sLightisOurGuide
| Rajshahi | University | of Engineering  | & Technology |
| -------- | ---------- | --------------- | ------------ |
|          | Department | of Mechatronics | Engineering  |
Lab Report
| Course Title      | : PowerElectronics                      | andDrives | Sessional   |
| ----------------- | --------------------------------------- | --------- | ----------- |
| Course Code       | : MTE 3201                              |           |             |
| ExperimentNo.     | : 04                                    |           |             |
| ExperimentName    | : StudyofThyristor(SCR)Characteristics. |           |             |
| Date ofExperiment | : 06-09-2026                            |           |             |
| Date ofSubmission | : 20-09-2026                            |           |             |
|                   | SubmittedBy                             |           | SubmittedTo |
SarafatHussainAbhi
BayazidHabibSiddikee
AssistantProfessor,
3rdyear(EvenSemester)
Dept.ofMTE,RUET
Roll:2208053
Session:2022-23
PrangonDas
RajshahiUniversityofEngineering&
AssistantProfessor,
Technology,Rajshahi
Dept.ofMTE,RUET

ExperimentNo:04
ExperimentName:StudyofThyristor (SCR)Characteristics.
Objectives:
1. Tostudythe gate-triggeringcharacteristics ofa thyristor(SCR).
2. Todetermine the gate triggervoltage (VGT)requiredtoturnonthe thyristor.
3. Toobserve the anode-to-cathode voltage (VAK)before andaftertriggering.
Introduction:
A thyristor (Silicon Controlled Rectifier, SCR) is a three-terminal, four-layer (PNPN)
semiconductor device that behaves as a controlled switch. When the anode is positive with
respecttothecathode,thedeviceremainsintheforward-blocking(off)stateandnosignificant
current flows, even though it is forward biased, until a suitable trigger signal is applied to the
gate terminal. As the gate-to-cathode voltage is increased, a corresponding gate current flows;
once this reaches the gate trigger voltage/current (VGT/IGT), the thyristor switches into the
forward-conduction (on) state. In this state, the anode-to-cathode voltage (VAK) collapses
from nearly the full supply voltage to a small forward voltage drop, and the device continues
to conduct even if the gate signal is removed, until the anode current falls below the holding
current. This experiment studies this triggering behaviour by varying the gate voltage with a
potentiometer and observing the corresponding change in VAK on a storage oscilloscope, in
ordertoidentifythe gate voltage at whichtriggeringoccurs.
Figure-01:PT970721POWERELECTRONICTRAINER

Required Apparatus:
1. Powersupply,PTE-047-01
2. Thyristorcharacteristics module,PTE-047-03
3. AC lamp,12V/2W
4. Diode,1N4002
5. Potentiometer,10kΩ
6. Thyristor(SCR),BT151
7. Digital multimeter
8. Storage oscilloscope
9. Connectingleads
Principle:
Thecircuitconsistsofa12VACsourcefeedingalamp(12V/2W,usedasacurrent-limiting
indicator)inserieswithadiode(1N4002)andaresistorR1,whichtogetherprovidearectified
reference voltage. A potentiometer R2 is used to derive an adjustable gate voltage, which is
appliedtothegateofthethyristor(BT151)throughthesmallresistorR3.Thegate-to-cathode
voltage developed across R3 (UGT) and the anode-to-cathode voltage of the thyristor (UAK)
are observed simultaneously on the two channels of the oscilloscope (CH1 = UAK, CH2 =
UGT).
As the potentiometer R2 is adjusted, the gate voltage UGT increases from zero. While UGT
remainsbelowthegatetriggervoltageofthethyristor,thedevicestaysintheforward-blocking
state and UAK remains high (close to the peak of the supply voltage appearing across the
device), i.e. the thyristor is "not triggered". Once UGT reaches the minimum gate trigger
voltage required for the device, the thyristor turns on, its anode-to-cathode voltage collapses
toasmallforwardconductiondrop,andthedeviceissaidtobe"triggered".ByrecordingUGT
and the corresponding UAK for several settings of the potentiometer, the gate-triggering
characteristic of the thyristor can be studied and the approximate gate trigger voltage of the
device canbe identified.

Procedure:
1) The requiredpower,thyristor-characteristics,andloadpanels were connected
| accordingtothe | circuit diagram | providedinthe | manual. |     |
| -------------- | --------------- | ------------- | ------- | --- |
2) The AC supply,lamp,diode D1,resistorR1,potentiometerR2,resistorR3,andthe
thyristorBT151were connectedinseries/parallel as showninthe circuit diagram.
3) The oscilloscope was connectedwithCH1across the anode-cathode terminals (to
| observe | UAK)andCH2across | R3(toobserve | the gate voltage | UGT). |
| ------- | ---------------- | ------------ | ---------------- | ----- |
4) The potentiometerR2was set toits minimum position,andthe circuit was switched
on.
5) The potentiometerwas variedgradually,andthe gate voltage UGT togetherwiththe
correspondinganode-cathode voltage UAK was recordedforeachsetting.
6) The point at whichthe thyristorchangedfrom the "not triggered" (blocking)state to
the "triggered" (conducting)state was notedfrom the suddenchange inUAK.
The observedvalues ofUGT andUAK were recordedinthe data table fordifferent
7)
potentiometersettings.
DataTable:
| VGT(GateTrigger |          | VAK(Anode-Cathode |     |              |
| --------------- | -------- | ----------------- | --- | ------------ |
| No.             |          |                   |     | Remarks      |
|                 | Voltage) | Voltage)          |     |              |
| 1               | 26mV     | 3.64V             |     | Nottriggered |
| 2               | 182mV    | 2.90V             |     | Triggered    |
| 3               | 224mV    | 3.68V             |     | Triggered    |
| 4               | 186mV    | 2.06V             |     | Triggered    |
| 5               | 184mV    | 3.20V             |     | Triggered    |
Note: CH1 was connected to measure UAK and CH2 was connected to measure UGT, as
showninthecircuitdiagram.Onlythefirstsetting(No.1)failedtotriggerthethyristor;forall
subsequent, higher settings of the gate voltage the thyristor was found to be successfully
triggered.

Result:
Figure-02:OscilloscopeGraphinVariousPhaseoftheExperiment

Figure-03:DCVariablePowerSupplyUnitUsedintheExperiment
Discussion:
The gate-triggering characteristic of the thyristor (SCR BT151) was studied by varying the
gate voltage UGT with a potentiometer and observing the resulting anode-to-cathode voltage
UAK on a storage oscilloscope. At the lowest gate-voltage setting (UGT = 26 mV), the gate
voltage was too small to trigger the device, so the thyristor remained in its forward-blocking
state and UAK stayed high, confirming that the device was "not triggered". As the
potentiometerwasincreasedfurther,thegatevoltageroseintotherangeofabout180-224mV,
atwhichpointthethyristorwasconsistentlytriggeredintoconductionforeverysettingtested,
andUAKwasobservedtofalltoalowervalueeachtime,consistentwiththedeviceswitching
into its on-state. The small variations in UAK among the triggered readings (2.06 V-3.68 V)
areattributedtotheexactinstantwithintheAChalf-cycleatwhichtriggeringoccurred,aswell
as to the loading effect of the lamp and diode branch and to normal measurement and reading
tolerances. Overall, the experiment confirmed that the thyristor requires a minimum gate
voltage of roughly 150-200 mV under this circuit configuration before it latches into
conduction, and that once triggered, the device continues to conduct with a comparatively
small anode-to-cathode voltage drop.

Conclusion:
The gate-triggering characteristics of a thyristor (SCR) were successfully studied. It was
observed that the thyristor remains in the forward-blocking state and does not conduct as long
asthegatevoltageisbelowacertainminimum(gatetrigger)value;oncethisvalueisexceeded,
thedeviceswitchesrapidlyintotheforward-conductionstate,andtheanode-to-cathodevoltage
falls sharply. The experiment verified the basic switching behaviour of the thyristor and
provideda practical estimate ofits gate triggervoltage.
References:
[1]Labmanual
[2]M.H.Rashid, Power Electronics:Circuits,Devices,andApplications,4thed.Pearson,
2014.
[3]N.Mohan,T.M.Undeland,andW.P.Robbins, Power Electronics:Converters,
Applications,andDesign,3rded.JohnWiley& Sons,2003.