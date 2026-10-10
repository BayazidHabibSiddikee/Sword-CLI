Experiment No: 01

Experiment Name: Study the Role of Power Electronics for Environment and Sustainability.

Abstract:

in environmental

sustainability by discussing its

Power electronics is the technology that converts, controls, and regulates electrical power using
semiconductor switching devices, and it has become one of the most important enablers of an
efficient, reliable, and sustainable energy system. This report examines the role of power
electronics
features, key
applications, recent technological developments, market trends, future prospects, and its growing
significance in Bangladesh. Power-electronic converters and inverters are central to integrating
renewable energy sources such as solar and wind into modern power systems, improving the
efficiency of industrial motor drives, supporting energy storage, and enabling the adoption of
electric vehicles. Recent advances in wide-bandgap semiconductors, particularly silicon carbide
(SiC) and gallium nitride (GaN), have pushed converter efficiencies beyond 98 percent [9]–[11].
In Bangladesh, renewable energy currently accounts for only a small share of total power
generation; however, national policy targets and real-time grid data analyzed in this report
indicate that power-electronic technologies will be essential for expanding solar capacity,
stabilizing the grid, and meeting the country's 2030 and 2041 renewable-energy targets.

fundamental

Introduction:

Climate change and the continuous growth of global electricity demand have made efficient
energy generation, transmission, and utilization one of the greatest engineering challenges of this
century. Power electronics — the conversion and control of electrical power using devices such
as diodes, thyristors, MOSFETs, and IGBTs — has become central to addressing this challenge,
since nearly every stage of a modern power system now passes through some form of electronic
conversion [2]. Beyond traditional motor drives and uninterruptible power supplies, power
electronics is now essential
integrating renewable sources, electric vehicles, HVDC
transmission, and smart grids, all of which depend on converters for voltage regulation,
frequency control, and grid synchronization [3].

for

This report presents a study of the fundamental features of power electronics, its contribution to
renewable-energy integration, recent developments in wide-bandgap semiconductors, global
trends, and the current situation and future prospects in Bangladesh, supported by
market
up-to-date generation and demand data obtained from the Power Grid Company of Bangladesh
(PGCB).

Key Features of Power Electronics for Sustainability:

Power-electronic converters transfer electricity from one stage of the power system to the next
while allowing its voltage, frequency, and waveform to be flexibly controlled. This flexibility
underlies several features that make power electronics central to environmental and energy
sustainability:

• Renewable integration: Inverters convert DC output from solar photovoltaic panels and
battery systems, and back-to-back converters regulate variable-frequency wind power,
into stable grid-compatible AC [3].

• Wide-bandgap devices: Silicon carbide (SiC) and gallium nitride (GaN) semiconductors
switch faster and operate at higher voltage and temperature than conventional silicon,
cutting conversion losses and reaching efficiencies close to 99 percent [9]–[11].

• Smart-grid and HVDC integration: Power-electronic interfaces allow bidirectional power
flow, voltage regulation, and grid-stability support as more variable renewable capacity is
added.

• Electrification of transport: Traction inverters, on-board chargers, and DC–DC converters
manage power flow between batteries, motors, and charging systems in electric and
hybrid vehicles.

• Green industry and motor drives: Variable Frequency Drives (VFDs) reduce unnecessary

energy consumption in industrial motors, pumps, and compressors.

• Energy storage and microgrids: Bidirectional converters regulate battery charging and
discharging, supporting grid stability and enabling islanded microgrid operation during
disturbances.

Data:

This section presents recent quantitative data on the global power-electronics market, converter
efficiency, and the current operating condition of the Bangladesh national grid. Grid data were
obtained directly from the Power Grid Company of Bangladesh (PGCB) ERP portal; market and
technology figures are drawn from industry reports cited in IEEE format.

renewable-energy applications was valued at
The global power-electronics market
approximately USD 16–18 billion in 2025 and is projected to grow at 8–9 percent CAGR,
exceeding USD 40 billion by the mid-2030s [13]–[15]. Figure 1 illustrates this projected growth
trend.

for

Figure 1. Projected growth of the global power-electronics market for renewable-energy
applications(illustrativetrendat~8–9%CAGRfroma2025baseofUSD16–18billion).

Wide-bandgap converters based on SiC and GaN already reach 98.8–98.9 percent conversion
efficiency, compared with 95–96 percent for conventional silicon devices [9], [12], as shown in
Figure 2.

Figure2.Conversion-efficiencycomparisonofsilicon,silicon-carbide(SiC),and

gallium-nitride(GaN)powerconverters.

In Bangladesh, installed generation capacity exceeds 28,000 MW against peak demand of
15,000–17,000 MW, yet renewable energy supplies only about 3.6 percent of grid electricity
[17], [16]. Table 1 (Figure 3)showsthearea-wisepowersupplyrecordedbyPGCBduringthe
most recent evening peak, and Figure 4 showsthissamedistributiongraphically—theDhaka
region alone accounts for roughly 37 percent of total peak supply, followed by Rajshahi and
Cumilla.

Figure3.Area-wisepowersupplyatpeakgeneration,Bangladesh,08August2026(PGCB).

Figure4.Region-wisepowersupplyatpeakgeneration,Bangladesh(PGCB).

Table 2 (Figure 5) lists hourly generation, demand, load-shedding, and fuel-mix data published
by the PGCB National Load Dispatch Centre (NLDC). Figure 6 plots the fuel-mix breakdown
for 08 August 2026: natural gas and coal remain the dominant sources throughout the day, while
solar output follows a clear daylight curve, rising to a midday maximum of about 620 MW and
falling to zero after sunset. This pattern shows directly why inverters and MPPT controllers are
indispensable for absorbing the variability of solar and wind generation without destabilizing the
grid [3], [20].

Figure5.Hourlygenerationandfuel-mixdata,PGCB,06–08August2026(PGCB).

Figure6.Hourlyfuel-mixbreakdownofelectricitygeneration,Bangladesh,08August2026(PGCB).

Table 3 (Figure 7) shows the hourly demand, supply, and load-shedding figures reported by
PGCB, including the marked “Day Peak” and “Evening Peak” hours. Figure 8 plots generation
against demand for 08 August 2026: demand rises from about 14,000 MW overnight to a
daytime peak near 15,150–15,200 MW around noon, while available generation lags behind
demand throughout, producing load shedding of up to nearly 2,000 MW during the late afternoon

illustrating the continuing strain on Bangladesh's generation and transmission infrastructure even
at a supply level exceeding 13,000 MW [17], [20].

Figure7.Hourlydemand,supply,andload-sheddingdata,PGCB,07–09August2026(PGCB).

Figure8.Hourlygeneration,demand,andloadshedding,Bangladesh,08August2026(PGCB).

Bangladesh also imports power through cross-border interconnections with India (Bheramara
HVDC, Tripura, and Adani Power) and Nepal. Table 4 (Figure 9) lists the actual and forecast
import values reported by PGCB — the Adani Power link consistently supplies well below its
1,398 MW scheduled forecast, while the Bheramara HVDC and Nepal links operate close to
their scheduled values. HVDC back-to-back converter stations are themselves power-electronic
installations, underscoring the technology's direct role in regional grid interconnection [17], [20].

Figure9.Cross-borderpowerimportfromIndia actualvs.forecast(PGCB).

Finally, Figure 10 showsthesector-wisepresentinstalledgenerationcapacityofBangladeshas
reportedbyBPDB:thepublicsectorandindependentprivateproducerseachsupplyroughly40
percentoftotalcapacity,withtheremainderfromjointventuresandcross-borderpowerimports
[25].

Figure10.Bangladeshinstalledpower-generationcapacitybyownershipsector(BPDB,August2026).

FutureProspect:

The future of power electronics is closely linked to the global transition toward clean energy and
sustainable development. Several key developments are likely to shape the future of this field:

• Wider adoption of wide-bandgap devices: The use of SiC and GaN devices is expected to
increase significantly as manufacturing costs fall, improving efficiency in solar inverters,
electric vehicles, industrial drives, and data centers [9], [10].

• Next-generation

semiconductor

investigating
materials:
ultra-wide-bandgap materials such as gallium oxide (Ga₂O₃) and diamond-based
semiconductors for future high-voltage, high-temperature applications [11].

Researchers

are

• Expansion and digitalization of power grids:

Inverter-based resources, solid-state
transformers, artificial intelligence, and predictive maintenance are expected to improve
grid flexibility and reliability.

• Growth of electric-vehicle charging infrastructure: Advanced SiC- and GaN-based
converters are expected to improve charging speed, reduce energy losses, and enhance
the performance of fast-charging stations.

• Battery storage and vehicle-to-grid systems: Wider deployment of grid-scale storage
converters and vehicle-to-grid systems is expected to further support the integration of
variable renewable generation.

• Green hydrogen and Power-to-X technologies: High-efficiency electrolyzers that convert
renewable electricity into green hydrogen will rely on power-electronic converters to help
decarbonize sectors where direct electrification is difficult.

Bangladesh Perspective:

Bangladesh's power sector remains heavily dependent on imported natural gas, furnace oil, and
coal. Power electronics has nonetheless already enabled significant progress through the Solar
Home System (SHS) programme, one of the world's largest off-grid solar initiatives, which uses
inverters to electrify millions of rural
charge controllers, DC–DC converters, and small
households without access to the national grid [17], [21].

The draft Renewable Energy Policy 2025 targets 20 percent renewable electricity by 2030 and 30
percent by 2041 [16], [18], requiring an estimated investment of USD 35–42.6 billion between
2025 and 2040 [18]. Key challenges include limited grid infrastructure and land-acquisition
delays, heavy import-dependence for inverters and converters, outstanding payments exceeding
USD 2.2 billion to independent power producers, and a shortage of skilled power-electronics
engineers
systems,
grid-connected converters, and technical education will be critical to meeting these targets while
improving grid reliability and energy security.

[19]. Strengthening local manufacturing, MPPT-based solar

[18],

Conclusion:

Power electronics has evolved into a fundamental component of modern sustainable energy
systems, enabling renewable-energy integration, efficient industrial drives, electric vehicles,
HVDC transmission, and battery storage. Wide-bandgap devices such as SiC and GaN now
achieve conversion efficiencies exceeding 98 percent, and the global market for power electronics
in renewable energy continues to expand steadily, reflecting growing investment in clean-energy
technologies and electrification.

For Bangladesh, real-time PGCB data analyzed in this report confirm that despite generation

exceeding 13,000–16,000 MW, the grid still experiences substantial peak-hour load shedding

and remains heavily dependent on fossil fuels, with renewable sources contributing only a small,

variable share. Achieving the country's 2030 and 2041 renewable-energy targets will require

expanded generation capacity together with reliable power-electronic infrastructure efficient

inverters, converters, charge controllers, HVDC interconnections, and energy-storage systems

combined with strengthened technical expertise and local manufacturing capability. Continued

investment

in this field is therefore essential

for building a cleaner, more resilient, and

sustainable energy future for Bangladesh and the global community.

References:

[1] United Nations Environment Programme, “Sustainability,” UNEP. [Online]. Available:

https://www.unep.org/about-un-environment/sustainability

[2] B. K. Bose, “Global energy scenario and impact of power electronics in the 21st century,”

IEEE Transactions on Industrial Electronics, vol. 60, no. 7, pp. 2638–2651, Jul. 2013.

[3] International Energy Agency (IEA), “CO2 emissions – Global Energy Review 2026,” IEA,

Paris, 2026.

[4] Nature Reviews Earth & Environment, “Global carbon emissions and decarbonization in

2025,” Apr. 2026.

[5] IEA, “Electricity supply – Global Energy Review 2026,” IEA, Paris, 2026.

[6] IEA, “Executive summary – Electricity 2026,” IEA, Paris, 2026.

[7] “Power Electronics for Energy Transition and Renewable Energy Conversion Processes,”

Processes, vol. 13, no. 11, MDPI, 2025.

[8] “The Role of Power Electronics in Renewable Energy Integration into the Grid,” Coventry

Academy, Mar. 2025.

[9] “Conventional, Wide-Bandgap, and Hybrid Power Converters: A Comprehensive Review,”

Renewable and Sustainable Energy Reviews, Feb. 2025.

[10] “Wide-Bandgap Semiconductors: How SiC and GaN Are Transforming Power Electronics,”

Tessolve, Mar. 2026.

[11] “Wide Bandgap Semiconductors

for Power Electronics: Comparative Properties,
Applications, and Reliability of GaN and SiC Devices,” Micromachines, vol. 4, no. 1, p. 6,
Mar. 2026.

[12] “Estimation of Energy-Saving Potential Using Commercial SiC Power Converters,”

Energies, vol. 17, no. 18, p. 4570, Sep. 2024.

[13] “Power Electronics for Renewable Energy Market Size, Growth 2035,” Market Research

Future, 2026.

[14] “Power Electronics for Renewable Energy Global Market Report,” The Business Research

Company, 2025.

[15] “Power Electronics Market Insights: Renewable Integration, Efficiency Standards, and

Industry Forecast to 2034,” IMARC Group, Apr. 2026.

[16] B. Publicover, “Bangladesh's PV Capacity to Reach 8.5 GW by 2035, Says GlobalData,”

PV Magazine, May 1, 2026.

[17] “Bangladesh: Power and Energy,” International Trade Administration, U.S. Department of

Commerce, Jul. 2026.

[18] “Getting Bangladesh's Renewable Energy Transition on Track,” IEEFA, 2026.

[19] “Future of Renewable Energy in Bangladesh: A 2041 Roadmap for Solar, Wind, Hydro, and

Biomass,” WAZIPOINT Engineering Science & Technology, 2026.

[20] Power Grid Company of Bangladesh PLC (PGCB), “Daily Hourly Generation and
Load-Shedding Summary Reports,” National Load Dispatch Centre (NLDC), Dhaka, Tech.
Rep. PGCB-NLDC-2026, Aug. 2026.

[21] “Is Solar Right for Your Home in Bangladesh?” NIR International, Feb. 2, 2026.

[22] “Bangladesh Solar Energy Market Size, Share, and Industry Trends Forecast 2026–2036,”

MarkWide Research, May 2026.

[23] “Bangladesh Solar Energy Market Report 2031,” Mordor Intelligence, Jan. 2026.

[24] “Powering Bangladesh's Future with Renewable Energy,” The World Bank, Jul. 22, 2026.

[25] Bangladesh Power Development Board (BPDB), “Annual Report 2024–2025: Generation
Capacity & Fuel Diversification,” BPDB, Dhaka, Tech. Rep. BPDB-AR-2025, Oct. 2025.

[26] Mongabay, “Bangladesh's energy crunch highlights the promise and limits of solar,” May

2026.

