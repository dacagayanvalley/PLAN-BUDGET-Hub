# PLAN-BUDGET Hub Codex Prompt

Build a web application named “PLAN-BUDGET Hub” for the Department of Agriculture - Regional Field Office No. 02. The system must automate planning, budget proposal consolidation, phase tracking, form extraction, and performance monitoring. Use a Google Drive / Google Sheets database storage approach first because the office has budget constraints, but design the code and data model so it can later migrate to a Convex backend with minimal refactoring.

Core principle: encode once, validate once, reuse many times.

Technology requirements:
1. Frontend: React or Next.js with clean government-style dashboard UI.
2. Initial backend/storage: Google Sheets as database tables and Google Drive as file repository.
3. Use Google Apps Script or Google API service layer for CRUD operations, Drive folder creation, file uploads, export generation, and audit logging.
4. Abstract all data access through a repository/service layer so Google Sheets can later be replaced by Convex.
5. Include mock data and seed scripts for local development.
6. Include role-based access: System Admin, PMED/PIPS Reviewer, Program Encoder, Program Reviewer, Management Viewer, Budget Reviewer, Read-only Viewer.
7. Include future-ready /convex-migration folder or documentation explaining how each Google Sheet table maps to Convex tables.

Main modules:
A. Dashboard
- Summary cards: total proposals, proposed budget, NEP amount, GAA amount, BED targets, funded/unfunded count, Tier 1/Tier 2 totals, validation issues, pending reviews.
- Charts: budget by program, province, municipality, congressional district, commodity, expense class, climate tag, GEDSI tag, phase and readiness status.
- Map-ready data output by municipality and district.

B. Proposal Intake
- Form for creating/editing proposals.
- Required fields: fiscal year, proposal title, description, implementing office, program, subprogram, PAP, UACS, province, municipality, congressional district, commodity, intervention type, beneficiary group, number of beneficiaries, physical target, unit of measure, budget amount, expense class, Tier classification, source of proposal, justification, expected output, expected outcome, readiness status, climate tag, GEDSI tag, implementation schedule, remarks.
- Allow multiple budget lines and multiple physical target lines per proposal.
- Allow attachments linked to Google Drive URLs.

C. Master Data Management
- CRUD screens for users, offices, municipalities, districts, programs/PAPs, commodities, intervention types, indicators, object codes, expense classes, climate tags, GEDSI tags and form templates.
- Prevent free-text entry where master lists should be used.

D. Validation Engine
- Flag missing required fields.
- Flag duplicate activity titles in same municipality/program/year.
- Flag invalid municipality-district mapping.
- Flag Tier 2 proposals without justification or readiness documents.
- Flag target without unit, budget without expense class, indicator-unit mismatch, and climate-tagged activities without climate rationale.
- Provide validation status: Draft, Needs Correction, Validated, Approved.

E. Consolidation Engine
- Generate summary tables by program, PAP, office, province, municipality, district, commodity, intervention type, expense class, Tier, phase, climate tag and GEDSI tag.
- Allow filters by fiscal year, program, office, province, district, phase and status.

F. Phase Tracking
- Store phase snapshots for Proposal, DA Internal Review, DBM Submission, NEP, GAA, BED, Implementation and Monitoring.
- Never overwrite previous phase values. Store phase history with date, editor and remarks.
- Provide comparison views: Proposal vs NEP, NEP vs GAA, GAA vs BED, funded vs unfunded, reduced/increased/removed proposals.

G. Form and Report Generator
- Export Excel/CSV reports for: BP Form A-like program budget matrix, BP Form B-like performance measures, BP Form C-like RDC inputs, BP Form D-like CSO inputs, BP Form 202-like Tier 2 profile, BP Form 206-like convergence matrix, BP Form 207-like climate expenditure report, BED No. 2 physical plan, by-congressional-district proposal list, by-municipality intervention list, commodity-based investment matrix, unfunded proposals list and management briefing summary.
- Use template-driven export so templates can be replaced each budget year.

H. Attachments and MOV Repository
- Create folder structure by fiscal year / program / proposal_id.
- Upload or link readiness documents, consultation minutes, endorsements, photos, geotagged evidence, procurement documents and accomplishment MOVs.

I. User Manual, Training and Help
- Include in-app help text, data dictionary, validation guide and sample workflow.
- Include sample training data for practice.

Deliverables:
1. Working prototype with Google Sheets/Drive storage.
2. README with setup instructions.
3. Data dictionary.
4. Apps Script or API setup guide.
5. User role matrix.
6. Sample master data and seed records.
7. Export templates and sample generated reports.
8. Migration notes for Convex backend.

Design rules:
- Clean and simple government dashboard, not cluttered.
- Use forms, tables, filters, review status badges and export buttons.
- All numeric budget fields must support Philippine peso formatting.
- All records must have created_at, updated_at, created_by, updated_by.
- Avoid hard-coding annual templates; make templates configurable.
- Prioritize data integrity, audit trail, and easy consolidation over decorative UI.
