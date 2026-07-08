# M&E, OPIF, and Indicator Design Notes

These notes summarize how the shared M&E and OPIF references should guide the PLAN-BUDGET Hub data model, user interface, validation rules, and reports.

## Source Files Studied

- `OPIF Definitions Guidebook.pdf`
- `2_Policy Frameworks.pdf`
- `List of Relevant Indicators.xlsx`
- `Enhanced_DA_M_E_KRA_Outputs_Outcomes_Indicators_Training.pptx`
- `DA_Monitoring_Evaluation_KRA_Outputs_Outcomes_Indicators_Presentation.pptx`
- `Enhanced-Compendium-of-Planning-Standards--Indicators.pdf`

## Core Design Principle

The PAP record should not be treated as only a budget row. It should be treated as a results-chain record:

`Input -> Activity -> Output -> Outcome -> Impact`

For PLAN-BUDGET Hub, the most important working levels are:

- `Activity`: the actual intervention or work item proposed by the office.
- `Output`: the direct deliverable such as seeds distributed, training conducted, facility built, machinery delivered, FMR constructed, or farmers assisted.
- `Outcome`: the expected change such as increased productivity, improved income, improved market access, reduced losses, or improved climate resilience.
- `Indicator`: the measurable variable that proves whether the output or outcome happened.

## Recommended PAP Structure

Each PAP/proposal should carry these structured fields:

| Field group | Recommended fields |
|---|---|
| Identity | fiscal year, proposal ID, office, program, PREXC program, PREXC sub-program, MFO/service group, PAP/activity title |
| Geography | province, congressional district, municipality, barangay or site, scope level |
| Results chain | KRA, activity, output statement, outcome statement, impact contribution |
| Indicator link | indicator ID, PI level 1, PI level 2, PI level 3, indicator type, unit of measure |
| Targeting | baseline, annual target, quarterly/monthly target, beneficiary count, beneficiary group |
| Budget | expense class, object code, proposal amount, NEP amount, GAA amount, BED amount, obligation, disbursement |
| Tags | commodity, intervention type, climate tag, GEDSI tag, convergence tag, readiness tag |
| Evidence | data source, means of verification, MOV attachment, reporting frequency, responsible office |

## Indicator Master Data

The indicator workbook has a useful normalization pattern:

- `Indicator ID`
- `PREXC Program`
- `PREXC Sub-Program`
- `PI_Level 1`
- `PI_Level 2`
- `PI_Level 3`
- `Unit of Measure`
- `Checkbox`
- `Specify Type`

These should become master-data driven fields. The encoder should guide the user in this order:

1. Select office/program.
2. Show only relevant indicators for that office/program.
3. Select `PI_Level 1`.
4. Narrow available `PI_Level 2`.
5. Narrow available `PI_Level 3`.
6. Auto-fill unit of measure.
7. Allow `Specify Type` only when the indicator needs local detail.

The workbook shows common units such as number, kilogram, hectare, piece, head, and liter. These should be controlled values, not free text.

## User Interface Improvements

### Proposal Intake

Use a step-based form:

1. `Classification`: office, program, PREXC program, PREXC sub-program, MFO/PAP group.
2. `Location`: province, district, municipality, barangay/site. Municipality should auto-fill province and congressional district.
3. `Activity`: intervention type, commodity, activity title, activity description.
4. `Results`: KRA, output, outcome, indicator, unit, target, baseline.
5. `Budget`: expense class, object code, amount by phase.
6. `Readiness and Tags`: climate, GEDSI, beneficiaries, readiness, MOVs.

### Indicator Picker

Replace coding-heavy inputs with a searchable picker:

- left side: indicator category/group
- middle: detailed indicator
- right side: unit, definition, example target, and selected program applicability

### M&E View

Add a dedicated `M&E Matrix` view with columns:

- KRA
- output
- outcome
- indicator
- baseline
- target
- accomplishment
- variance
- data source
- MOV
- reporting frequency
- responsible office

### Dashboard

Add results-oriented charts:

- budget by KRA
- targets by unit of measure
- activities by output category
- validated versus needs-correction by office
- target versus accomplishment by indicator
- implementation progress by phase

## Validation Rules to Add

- A PAP cannot be `Validated` or `Approved` without at least one output indicator.
- Indicator unit must match the selected indicator master record.
- Outcome fields should be required for activity types expected to produce measurable results.
- Baseline should be required for outcome indicators.
- Target should be numeric and positive when unit is quantitative.
- Means of verification should be required before Monitoring and Evaluation phase.
- PREXC program and sub-program should be consistent with the selected indicator.
- Office/program users should only see or select indicators relevant to their assigned office/program unless Admin overrides.

## Convex Schema Extension Ideas

The current `proposals.physicalTargets` array can support simple targets, but M&E reporting will be stronger with normalized related tables:

- `indicatorDefinitions`: canonical indicator list from the indicator workbook.
- `proposalIndicators`: selected indicators per PAP, with baseline, target, unit, and type.
- `accomplishments`: periodic accomplishments by proposal indicator, month/quarter, value, variance, remarks, and MOV.
- `kraDefinitions`: master KRA records aligned to DA priorities.
- `resultChains`: optional reusable templates linking intervention types to expected output/outcome/indicator options.

## Import Implications

The Excel/Google Drive fetcher should preserve activity-level granularity. Each imported activity row should map to:

- one proposal record
- one or more budget lines
- one or more physical targets or proposal indicators
- source workbook, sheet, and row number
- validation status and import notes

Rows should not be collapsed only by program or municipality, because the M&E framework needs activity-level outputs, units, and indicators.

