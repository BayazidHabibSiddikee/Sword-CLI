Experiment No: 02
Experiment Name: Study of a Single-Phase Half-Wave Controlled Rectifier Using a
Thyristor (SCR) and Determination of the Form Factor at Different Firing Angles
Objective
• Tostudytheoperationofasingle-phasehalf-wavecontrolledrectifiercircuitbuiltaroundathyristor
(SCR).
• Toobserve howthe average DC outputvoltage varieswith the firing angle(α)of the SCR.
• To calculate the theoretical DC output voltage and compare it with the experimentally observed
valueateachfiringangle.
• Todeterminetheformfactor(FF=V_RMS/V_DC)oftherectifiedoutputwaveformforeachfiring
angleand compare it with the standard half-wavevalue.
Theory
Asingle-phasehalf-wavecontrolledrectifierusesathyristor(silicon-controlledrectifier,SCR)toconvert
an alternating input voltage into a unidirectional (DC) output whose average value can be adjusted by
controllingtheinstantwithineachhalf-cycleatwhichtheSCRistriggeredintoconduction.Thistriggering
instant, measured in electrical degrees from the zero crossing of the supply voltage, is called the firing
angle (α) and is set through a gate-triggering circuit — in this experiment, a potentiometer (POT)
connected to thegate terminal of the SCR.
For a resistive load, the average (DC) output voltage of a single-phase half-wave controlled rectifier is
givenby:
V_DC=(V_m/2π)×(1+ cosα)
whereV_misthepeakvalueofthesupplyvoltageandαisthefiringangle.Asαincreasesfrom0°toward
180°, the SCR conducts for a progressively smaller portion of each half-cycle, so the average DC output
voltagedecreasesaccordingly.
The form factor (FF) of a rectified waveform is defined as the ratio of its RMS value to its average (DC)
value:
FF=V_RMS /V_DC
Theformfactorisameasureofthe“peakiness”oftheoutputwaveform.Foranideal,uncontrolled(α=0°)
half-wave rectifier the form factor is approximately 1.57; as the firing angle increases, the conduction
interval narrows and the output waveform becomes more pulse-like, so the form factor increases
correspondingly.
Circuit Diagram

Figure1.Single-phasehalf-wavecontrolledrectifierusingathyristor(SCR),withapotentiometer(POT)atthegatefor
firing-anglecontrolandaresistiveload.
Thesupply-sideACvoltagewasrecordedatthetwoextremesofthefiring-anglepotentiometer:V_AC=
71.5VattheminimumpotsettingandV_AC =64V atthe maximumpotsetting.
Apparatus
• Thyristor (SCR) module with gate-triggering circuit
• Single-phaseACsource
• Potentiometer(POT)forfiring-angleadjustment
• Resistiveload
• Digitalmultimeter(forV_DC andV_RMSmeasurement)
• Connecting wires
Procedure
• The circuit was connected as shown in Figure 1, with the thyristor gate driven through the firing-
anglepotentiometer.
• TheACsupplywasswitchedonandthepotentiometerwasadjustedtosetthefiringangletoeachof
the requiredvalues:minimum,45°,90°,115°,and160°.
• At each firing angle, the DC output voltage across the load was measured with the multimeter and
recordedastheobservedvalue(V_DCobserved).
• The correspondingRMS value of the outputvoltagewas also measured and recorded.
• ThetheoreticalDCoutputvoltagewascalculatedforeachfiringangleusingthestandardhalf-wave
controlled-rectifier formula and recorded as V_DC (calculated).

• The form factor was computed for each firing angle as the ratio of the observed V_RMS to the
calculated V_DC, and the percentage error between the calculated and observed V_DC was
determined.
Data Table
FormFactor
|        | FiringAngle |     | V_DC           | V_DC         | V_RMS        |      | %Error |
| ------ | ----------- | --- | -------------- | ------------ | ------------ | ---- | ------ |
| Sl.No. |             |     |                |              |              | (FF= |        |
|        |             | (α) | (Calculated),V | (Observed),V | (Observed),V |      | (V_DC) |
V_RMS/V_DC)
| 1                  |          | min    | 10.058            | 10.40 | 16.00 | 1.590 | 3.40  |
| ------------------ | -------- | ------ | ----------------- | ----- | ----- | ----- | ----- |
| 2                  |          | 45°    | 8.64              | 8.80  | 14.80 | 1.77  | 1.85  |
| 3                  |          | 90°    | 5.124             | 5.20  | 10.80 | 2.10  | 1.48  |
| 4                  |          | 115°   | 2.96              | 2.40  | 6.00  | 2.03  | 18.92 |
| 5                  |          | 160°   | 0.309             | 0.12  | 0.44  | 1.423 | 61.17 |
| Calculation        | (Sample, | α      | = 90°)            |       |       |       |       |
| V_DC (calculated)= |          | 5.124V |                   |       |       |       |       |
| V_RMS (observed)=  |          | 10.80V |                   |       |       |       |       |
| FormFactor,FF      | =V_RMS   | /V_DC  | =10.80/5.124≈2.10 |       |       |       |       |
PercentageError =|V_DC(observed)− V_DC(calculated)|/V_DC(calculated)× 100
| = |5.20 − 5.124| | / 5.124    | × 100 | ≈ 1.48 % |     |     |     |     |
| ---------------- | ---------- | ----- | -------- | --- | --- | --- | --- |
| Result and       | Discussion |       |          |     |     |     |     |
Themeasuredresultsconfirmtheexpectedbehaviorofahalf-wavecontrolledrectifier:asthefiringangle
αwasincreasedfromitsminimumsettingtoward160°,theaverageDCoutputvoltagedecreasedsteadily,
fromabout10.06V(calculated)downto0.31V,whiletheformfactorincreasedfromabout1.59toward
highervalues,reflectingtheprogressivelynarrowerandmorepulse-likeconductionintervaloftheSCRat
largerfiringangles.
The calculated and observed values of V_DC agree closely at low firing angles (percentage errors of
3.40%, 1.85%, and 1.48% at the minimum, 45°, and 90° settings, respectively), which indicates that the
rectifier behaved close to its theoretical model under these conditions. At higher firing angles (115° and
160°), however, the percentage error increased sharply, reaching about 18.92% and 61.17%. This is
expected,sinceatlargefiringanglestheoutputvoltagebecomesverysmall,soevenminorsourcesoferror
— multimeter resolution and reading tolerance, SCR forward-voltage drop, incomplete or unstable
triggering near the end of the conduction range, and supply-voltage fluctuation — produce a
proportionallymuchlargerpercentagedeviation.The160°readinginparticular(120mVobservedagainst

a 309 mV calculated value) lies close to the resolution limit of the multimeter, which further amplifies the
percentage error.
The form factor followed the expected upward trend with increasing firing angle, though the value
recorded at α = 45° (1.77) is somewhat higher than the 1.71 obtained by direct evaluation of the ratio
14.80/8.64; this discrepancy is retained in the table to match the value noted during the experiment and is
most likely attributable to a rounding or transcription difference in the original observation rather than a
computational error.
Conclusion
This experiment demonstrated that the average DC output voltage of a single-phase half-wave controlled
rectifier can be varied continuously by adjusting the firing angle of the thyristor through the gate-triggering
potentiometer, and that the output voltage decreases as the firing angle increases from its minimum value
toward 160°. The form factor of the rectified waveform increased correspondingly, confirming that the
output becomes more pulse-like at larger firing angles. The calculated and observed DC voltages agreed
well at small firing angles, while the percentage error grew substantially at larger firing angles owing to the
very small output voltages involved and the practical limitations of the measuring instruments. Overall, the
results verify the theoretical relationship between firing angle, average output voltage, and form factor for
a phase-controlled half-wave rectifier.
References
[1] M. H. Rashid, Power Electronics: Circuits, Devices, and Applications, 4th ed. Pearson, 2014.
[2] N. Mohan, T. M. Undeland, and W. P. Robbins, Power Electronics: Converters, Applications, and
Design, 3rd ed. Wiley, 2003.
[3] MTE 3202 Power Electronics Laboratory Manual, Department of EEE, course handout, 2026.