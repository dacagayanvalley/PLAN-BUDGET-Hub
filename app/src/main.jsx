import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  FolderKanban,
  History,
  Layers3,
  ListChecks,
  MapPinned,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TableProperties,
  UploadCloud,
  Users,
} from "lucide-react";
import "./styles.css";
import { createRepository, getDataMode } from "./services/repository.js";
import { formatPeso, toCsv, downloadText } from "./utils/format.js";
import { createBlankProposal, findDuplicateBulkSubmission, validateProposal, validateAll } from "./utils/validation.js";

const dataMode = getDataMode();
const repo = createRepository(dataMode);

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "intake", label: "Proposal Intake", icon: PenLine },
  { id: "review", label: "Record Review", icon: ShieldCheck },
  { id: "bulk", label: "Bulk Excel Submission", icon: UploadCloud },
  { id: "master", label: "Master Data", icon: Database },
  { id: "validation", label: "Validation", icon: ListChecks },
  { id: "consolidation", label: "Consolidation", icon: TableProperties },
  { id: "phases", label: "Phase Tracking", icon: History },
  { id: "reports", label: "Reports", icon: FileSpreadsheet },
  { id: "repository", label: "MOV Repository", icon: FolderKanban },
  { id: "help", label: "Help", icon: BookOpen },
];

const expectedOutcomeOptions = [
  "Improved productivity and resilience of targeted farmers and fisherfolk.",
  "Increased market access and reduced postharvest losses for beneficiary groups.",
  "Improved delivery of agriculture and fishery support services.",
  "Enhanced climate resilience of priority production areas.",
  "Increased adoption of recommended technologies and good practices.",
];

const expectedOutputOptions = [
  "Production support inputs distributed to targeted beneficiaries.",
  "Training or extension activity completed with documented participants.",
  "Infrastructure or facility completed, validated, and ready for turnover/use.",
  "Machinery, equipment, or postharvest support delivered to qualified beneficiaries.",
  "Market linkage, consultation, or coordination activity completed with MOVs.",
];

const climateRationaleOptions = [
  "Supports climate adaptation through climate-resilient production inputs and timing.",
  "Supports mitigation through reduced losses, efficient logistics, or lower-emission practices.",
  "Improves adaptive capacity of vulnerable farmers, fisherfolk, and communities.",
  "Not climate tagged.",
];

function App() {
  const [active, setActiveState] = useState(() => window.location.hash.replace("#", "") || "dashboard");
  const [data, setData] = useState(() => repo.loadAll());
  const [loadState, setLoadState] = useState({ status: dataMode === "google" ? "loading" : "ready", error: "" });
  const [filters, setFilters] = useState({
    fiscalYear: "2027",
    program: "All",
    province: "All",
    status: "All",
  });
  const [selectedProposalId, setSelectedProposalId] = useState(data.proposals[0]?.id);
  const [saveNotice, setSaveNotice] = useState("");
  const setActive = (id) => {
    setActiveState(id);
    window.location.hash = id;
  };

  const reloadProductionData = () => {
    if (dataMode !== "google") return undefined;
    setLoadState({ status: "loading", error: "" });
    return repo.loadAllAsync()
      .then((nextData) => {
        setData(nextData);
        setSelectedProposalId(nextData.proposals[0]?.id);
        setLoadState({ status: "ready", error: "" });
      })
      .catch((error) => {
        setLoadState({ status: "error", error: error.message });
      });
  };

  useEffect(() => {
    let cancelled = false;
    if (dataMode !== "google") return undefined;
    setLoadState({ status: "loading", error: "" });
    repo.loadAllAsync()
      .then((nextData) => {
        if (cancelled) return;
        setData(nextData);
        setSelectedProposalId(nextData.proposals[0]?.id);
        setLoadState({ status: "ready", error: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState({ status: "error", error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProposal = selectedProposalId === "__new__" ? null : (data.proposals.find((proposal) => proposal.id === selectedProposalId) ?? data.proposals[0]);
  const validationResults = useMemo(() => validateAll(data), [data]);
  const filteredProposals = useMemo(() => {
    return data.proposals.filter((proposal) => {
      return (
        String(proposal.fiscalYear) === filters.fiscalYear &&
        (filters.program === "All" || proposal.program === filters.program) &&
        (filters.province === "All" || proposal.province === filters.province) &&
        (filters.status === "All" || proposal.validationStatus === filters.status)
      );
    });
  }, [data.proposals, filters]);

  const upsertProposal = (proposal) => {
    const now = new Date().toISOString();
    const normalized = normalizeDraftProposal(proposal);
    const next = {
      ...normalized,
      updated_at: now,
      updated_by: data.session.user,
      created_at: normalized.created_at || now,
      created_by: normalized.created_by || data.session.user,
    };
    const result = validateProposal(next, data);
    next.validationStatus = result.issues.length ? "Needs Correction" : "Validated";
    if (dataMode === "google") {
      repo.saveProposalAsync(next)
        .then(() => {
          setData((current) => repo.saveProposal(current, next));
          setSelectedProposalId("__new__");
          flashSaveNotice(setSaveNotice);
        })
        .catch((error) => setLoadState({ status: "error", error: error.message }));
    } else {
      setData((current) => repo.saveProposal(current, next));
      setSelectedProposalId("__new__");
      flashSaveNotice(setSaveNotice);
    }
  };

  const registerBulkSubmission = (submission) => {
    const now = new Date().toISOString();
    const next = {
      ...submission,
      id: `BULK-${String((data.bulkSubmissions?.length || 0) + 1).padStart(4, "0")}`,
      status: "Preflight Review",
      submitted_at: now,
      submitted_by: data.session.user,
      created_at: now,
      updated_at: now,
      created_by: data.session.user,
      updated_by: data.session.user,
    };
    const duplicate = findDuplicateBulkSubmission(next, data);
    if (duplicate) {
      const duplicateRow = {
        ...next,
        id: `DUP-${String((data.bulkSubmissions?.length || 0) + 1).padStart(4, "0")}`,
        status: "Duplicate",
        remarks: `Duplicate of ${duplicate.id || duplicate.sourceFile || duplicate.source_file}. ${next.remarks || ""}`.trim(),
      };
      setData((current) => ({
        ...current,
        bulkSubmissions: [duplicateRow, ...(current.bulkSubmissions || [])],
      }));
      return;
    }
    if (dataMode === "google") {
      repo.registerBulkSubmissionAsync(next)
        .then((saved) => setData((current) => ({
          ...current,
          bulkSubmissions: [saved, ...(current.bulkSubmissions || [])],
        })))
        .catch((error) => setLoadState({ status: "error", error: error.message }));
      return;
    }
    setData((current) => ({
      ...current,
      bulkSubmissions: [next, ...(current.bulkSubmissions || [])],
    }));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="seal">DA</div>
          <div>
            <h1>PLAN-BUDGET Hub</h1>
            <p>DA RFO 02 planning and budget consolidation</p>
          </div>
        </div>
        <nav aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={active === item.id ? "nav-item active" : "nav-item"}
                onClick={() => setActive(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="storage-card">
          <ShieldCheck size={18} />
          <div>
            <strong>Storage mode</strong>
            <span>{dataMode === "google" ? "Production Google Sheets" : dataMode === "demo" ? "Demo training data" : "Empty local setup"}</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <ProductionBanner dataMode={dataMode} loadState={loadState} />
        {saveNotice && <div className="toast good">{saveNotice}</div>}
        <Header data={data} filters={filters} setFilters={setFilters} onRefresh={reloadProductionData} loadState={loadState} />
        {active === "dashboard" && (
          <Dashboard data={data} proposals={filteredProposals} validationResults={validationResults} />
        )}
        {active === "intake" && (
          <ProposalIntake
            data={data}
            proposal={selectedProposal}
            proposals={filteredProposals}
            onSelect={setSelectedProposalId}
            onNew={() => setSelectedProposalId("__new__")}
            onSave={upsertProposal}
          />
        )}
        {active === "review" && <RecordReview data={data} onSave={upsertProposal} />}
        {active === "bulk" && <BulkSubmission data={data} onSubmit={registerBulkSubmission} />}
        {active === "master" && <MasterData data={data} />}
        {active === "validation" && <Validation data={data} validationResults={validationResults} />}
        {active === "consolidation" && <Consolidation proposals={filteredProposals} />}
        {active === "phases" && <PhaseTracking data={data} proposal={selectedProposal} />}
        {active === "reports" && <Reports data={data} proposals={filteredProposals} />}
        {active === "repository" && <Repository data={data} proposal={selectedProposal} />}
        {active === "help" && <Help />}
      </main>
    </div>
  );
}

function BulkSubmission({ data, onSubmit }) {
  const [form, setForm] = useState({
    fiscalYear: "2027",
    program: "Auto-detect from workbook",
    office: "Auto-detect from workbook",
    templateCode: data.bulkTemplates[0]?.code || "",
    phase: "Proposal",
    fileName: "",
    driveFileUrl: "",
    convertedSheetId: "",
    remarks: "",
  });
  useEffect(() => {
    setForm((current) => ({
      ...current,
      program: current.program || "Auto-detect from workbook",
      office: current.office || "Auto-detect from workbook",
      templateCode: current.templateCode || data.bulkTemplates[0]?.code || "",
    }));
  }, [data.masterData.programs, data.masterData.offices, data.bulkTemplates]);
  const template = data.bulkTemplates.find((row) => row.code === form.templateCode) || data.bulkTemplates[0] || {
    name: "No bulk template configured",
    description: "Load bulk_import_templates in Google Sheets before processing uploads.",
    sourceBasis: "Production setup required",
    expectedSheets: [],
    requiredColumns: [],
    importMode: "Not configured",
  };
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const duplicate = findDuplicateBulkSubmission({ ...form, sourceFile: form.fileName || form.driveFileUrl, converted_sheet_id: form.convertedSheetId }, data);
  const preflightRows = buildPreflightRows(template, form, data);

  return (
    <section className="content-stack">
      <Panel title="Bulk Excel File Submission" icon={UploadCloud} action={<button className="primary" onClick={() => onSubmit({ ...form, sourceFile: form.fileName || form.driveFileUrl || "No file selected", drive_file_id: form.driveFileUrl, converted_sheet_id: form.convertedSheetId })}><UploadCloud size={16} /> Register Submission</button>}>
        <div className="bulk-layout">
          <div className="bulk-form">
            <Input label="Fiscal year" value={form.fiscalYear} onChange={(v) => update("fiscalYear", v)} />
            <Input label="Banner program" value={form.program} onChange={(v) => update("program", v)} options={["Auto-detect from workbook", ...data.masterData.programs.map((program) => program.name)]} />
            <Input label="Submitting office" value={form.office} onChange={(v) => update("office", v)} options={["Auto-detect from workbook", ...data.masterData.offices]} />
            <Input label="Template profile" value={form.templateCode} onChange={(v) => update("templateCode", v)} options={data.bulkTemplates.map((row) => row.code)} />
            <Input label="Phase" value={form.phase} onChange={(v) => update("phase", v)} options={["Proposal", "DA Internal Review", "DBM Submission", "NEP", "GAA", "BED", "Implementation", "Monitoring"]} />
            <label className="field">
              <span>Excel workbook</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => update("fileName", event.target.files?.[0]?.name || "")} />
            </label>
            <Input label="Original Drive file URL or ID" value={form.driveFileUrl} onChange={(v) => update("driveFileUrl", v)} wide />
            <Input label="Converted Google Sheet URL or ID" value={form.convertedSheetId} onChange={(v) => update("convertedSheetId", v)} wide />
            <TextArea label="Submission remarks" value={form.remarks} onChange={(v) => update("remarks", v)} />
          </div>
          <div className="template-card">
            <h4>{template.name}</h4>
            <p>{template.description}</p>
            <dl>
              <dt>Source basis</dt>
              <dd>{template.sourceBasis}</dd>
              <dt>Expected sheets</dt>
              <dd>{template.expectedSheets.join(", ")}</dd>
              <dt>Import mode</dt>
              <dd>{template.importMode}</dd>
            </dl>
          </div>
        </div>
      </Panel>
      {duplicate && (
        <Panel title="Possible Duplicate Submission" icon={AlertTriangle}>
          <p className="body-copy">This file/template/year appears to match existing batch <strong>{duplicate.id}</strong>. Registering it again will be marked as a duplicate for reviewer action.</p>
        </Panel>
      )}

      <Panel title="Preflight Validation Checklist" icon={ListChecks}>
        <DataTable
          rows={preflightRows}
          columns={[["check", "Check"], ["result", "Result"], ["notes", "Notes"]]}
          formatters={{ result: (value) => <StatusBadge value={value} /> }}
        />
      </Panel>

      <Panel title="Submission Queue">
        <DataTable
          rows={data.bulkSubmissions || []}
          columns={[
            ["id", "Batch ID"],
            ["sourceFile", "File"],
            ["program", "Program"],
            ["templateCode", "Template"],
            ["phase", "Phase"],
            ["status", "Status"],
            ["submitted_by", "Submitted by"],
          ]}
          formatters={{ status: (value) => <StatusBadge value={value} /> }}
        />
      </Panel>
    </section>
  );
}

function ProductionBanner({ dataMode, loadState }) {
  if (dataMode === "demo") {
    return <div className="mode-banner warn">Demo mode is using sample training records. Set <code>VITE_DATA_MODE=google</code> for production.</div>;
  }
  if (dataMode === "empty") {
    return <div className="mode-banner">Empty local mode. Configure Google Apps Script and set <code>VITE_DATA_MODE=google</code> to use production data.</div>;
  }
  if (loadState.status === "loading") {
    return <div className="mode-banner">Loading production records from Google Sheets...</div>;
  }
  if (loadState.status === "error") {
    return <div className="mode-banner error">Google Sheets connection error: {loadState.error}</div>;
  }
  return <div className="mode-banner good">Production mode connected to Google Sheets.</div>;
}

function Header({ data, filters, setFilters, onRefresh, loadState }) {
  return (
    <header className="topbar">
      <div>
        <h2>FY {filters.fiscalYear} Planning Workspace</h2>
        <p>Encode once, validate once, reuse across Proposal, NEP, GAA, BED, Implementation, Monitoring, and Reporting.</p>
      </div>
      <div className="filter-strip">
        <SelectFilter label="Year" value={filters.fiscalYear} options={["2027", "2026", "2025"]} onChange={(fiscalYear) => setFilters((f) => ({ ...f, fiscalYear }))} />
        <SelectFilter label="Program" value={filters.program} options={["All", ...data.masterData.programs.map((p) => p.name)]} onChange={(program) => setFilters((f) => ({ ...f, program }))} />
        <SelectFilter label="Province" value={filters.province} options={["All", ...data.masterData.provinces]} onChange={(province) => setFilters((f) => ({ ...f, province }))} />
        <SelectFilter label="Status" value={filters.status} options={["All", "Draft", "Needs Correction", "Validated", "Approved"]} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
        {dataMode === "google" && (
          <button className="ghost refresh-button" onClick={onRefresh} disabled={loadState.status === "loading"}>
            <RefreshCw size={16} />
            {loadState.status === "loading" ? "Refreshing" : "Refresh data"}
          </button>
        )}
      </div>
    </header>
  );
}

function SelectFilter({ label, value, options, onChange }) {
  return (
    <label className="field compact">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Dashboard({ data, proposals, validationResults }) {
  const totals = useMemo(() => summarize(proposals), [proposals]);
  const issueCount = validationResults.reduce((sum, result) => sum + result.issues.length, 0);
  const charts = [
    ["Budget by Program", groupBudget(proposals, "program")],
    ["Budget by Province", groupBudget(proposals, "province")],
    ["Expense Class", groupBudget(proposals.flatMap((p) => p.budgetLines), "expenseClass")],
    ["Climate Tag", groupBudget(proposals, "climateTag")],
  ];
  const mapRows = groupBudget(proposals, "municipality").map((row) => ({
    ...row,
    district: data.masterData.municipalities.find((m) => m.name === row.label)?.district ?? "Unmapped",
  }));

  return (
    <section className="page-grid">
      <div className="kpi-grid">
        <Kpi label="Total proposals" value={totals.count} icon={ClipboardList} />
        <Kpi label="Proposed budget" value={formatPeso(totals.proposed)} icon={Database} />
        <Kpi label="NEP amount" value={formatPeso(totals.nep)} icon={Layers3} />
        <Kpi label="GAA amount" value={formatPeso(totals.gaa)} icon={Archive} />
        <Kpi label="BED physical targets" value={totals.targets.toLocaleString()} icon={CheckCircle2} />
        <Kpi label="Validation issues" value={issueCount} tone={issueCount ? "warn" : "good"} icon={AlertTriangle} />
      </div>
      <div className="split">
        <Panel title="Budget Analytics" action={<DownloadButton rows={proposals} filename="dashboard-proposals.csv" />}>
          <div className="chart-grid">
            {charts.map(([title, rows]) => (
              <BarList key={title} title={title} rows={rows} />
            ))}
          </div>
        </Panel>
        <Panel title="Map-ready Municipality Output" icon={MapPinned}>
          <DataTable
            rows={mapRows}
            columns={[
              ["label", "Municipality"],
              ["district", "District"],
              ["count", "Proposals"],
              ["budget", "Budget"],
            ]}
            formatters={{ budget: formatPeso }}
          />
        </Panel>
      </div>
    </section>
  );
}

function Kpi({ label, value, icon: Icon, tone }) {
  return (
    <article className={`kpi ${tone || ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Icon size={22} />
    </article>
  );
}

function ProposalIntake({ data, proposal, proposals, onSelect, onNew, onSave }) {
  const blankProposal = useMemo(() => createBlankProposal(data), [data]);
  const activeProposal = proposal || blankProposal;
  const [draft, setDraft] = useState(activeProposal);
  React.useEffect(() => setDraft(activeProposal), [activeProposal?.id]);
  if (!draft) {
    return (
      <Panel title="No Proposal Selected" icon={PenLine}>
        <p className="body-copy">Production mode has no proposal records yet. Use Bulk Excel Submission to register a banner-program workbook, or load accepted proposal records from Google Sheets.</p>
      </Panel>
    );
  }
  const issues = validateProposal(draft, data).issues;

  return (
    <section className="content-stack">
      <Panel title="Proposal Register" icon={Search} action={<button className="primary" onClick={onNew}><Plus size={16} /> New Proposal</button>}>
        <DataTable
          rows={proposals}
          onRowClick={(row) => onSelect(row.id)}
          selectedId={draft.id}
          columns={[
            ["id", "ID"],
            ["interventionType", "Intervention"],
            ["program", "Program"],
            ["mfo", "PAP"],
            ["municipality", "Municipality"],
            ["budgetAmount", "Budget"],
            ["validationStatus", "Status"],
          ]}
          formatters={{ budgetAmount: formatPeso, validationStatus: (value) => <StatusBadge value={value} /> }}
        />
      </Panel>
      <Panel title={proposal ? "Encode / Edit Proposal" : "Create New Proposal"} icon={PenLine} action={<button className="primary" onClick={() => onSave(draft)}><CheckCircle2 size={16} /> Validate and Save</button>}>
        <ProposalEditorFields data={data} draft={draft} setDraft={setDraft} />
        <IssueList issues={issues} />
      </Panel>
    </section>
  );
}

function RecordReview({ data, onSave }) {
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(data.proposals[0]?.id || "");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.proposals.filter((proposal) => {
      const statusMatches = statusFilter === "All" || proposal.validationStatus === statusFilter;
      const textMatches = !needle || [
        proposal.id,
        proposal.interventionType,
        proposal.municipality,
        proposal.province,
        proposal.office,
        proposal.program,
        proposal.commodity,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
      return statusMatches && textMatches;
    });
  }, [data.proposals, query, statusFilter]);
  useEffect(() => {
    if (!rows.length) {
      setSelectedId("");
      return;
    }
    if (!rows.some((row) => row.id === selectedId)) setSelectedId(rows[0].id);
  }, [rows, selectedId]);
  const selected = rows.find((proposal) => proposal.id === selectedId) || rows[0] || null;
  const [draft, setDraft] = useState(selected);
  useEffect(() => {
    setDraft(selected);
  }, [selected?.id]);
  const issues = draft ? validateProposal(draft, data).issues : [];

  return (
    <section className="content-stack">
      <Panel title="Submitted Record Review Queue" icon={ShieldCheck}>
        <div className="review-filters">
          <SelectFilter label="Validation status" value={statusFilter} options={["All", "Draft", "Needs Correction", "Validated", "Approved"]} onChange={setStatusFilter} />
          <label className="field compact review-search">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, intervention, office, municipality" />
          </label>
        </div>
        <DataTable
          rows={rows}
          onRowClick={(row) => setSelectedId(row.id)}
          selectedId={selectedId}
          columns={[
            ["id", "ID"],
            ["interventionType", "Intervention"],
            ["office", "Office"],
            ["municipality", "Municipality"],
            ["province", "Province"],
            ["tier", "Tier"],
            ["budgetAmount", "Amount"],
            ["validationStatus", "Status"],
          ]}
          formatters={{ budgetAmount: formatPeso, validationStatus: (value) => <StatusBadge value={value} /> }}
        />
      </Panel>

      <Panel
        title={draft ? `Edit and Validate ${draft.id}` : "Edit and Validate Record"}
        icon={PenLine}
        action={draft && <button className="primary" onClick={() => onSave(draft)}><CheckCircle2 size={16} /> Validate and Save</button>}
      >
        {draft ? (
          <>
            <ProposalEditorFields data={data} draft={draft} setDraft={setDraft} />
            <IssueList issues={issues} />
          </>
        ) : (
          <p className="body-copy">No submitted records match the current review filters.</p>
        )}
      </Panel>
    </section>
  );
}

function ProposalEditorFields({ data, draft, setDraft }) {
  const update = (field, value) => setDraft((current) => {
    if (field === "interventionType") return applyInterventionSelection(current, value, data);
    if (field === "municipality") return applyMunicipalitySelection(current, value, data);
    if (field === "mfo") return { ...current, mfo: value, pap: value };
    return { ...current, [field]: value };
  });
  const updateBudget = (index, field, value) => {
    setDraft((current) => ({
      ...current,
      budgetLines: (current.budgetLines || []).map((line, i) => (i === index ? { ...line, [field]: field === "amount" ? Number(value) : value } : line)),
    }));
  };
  const updateTarget = (index, field, value) => {
    setDraft((current) => ({
      ...current,
      physicalTargets: (current.physicalTargets || []).map((line, i) => (i === index ? { ...line, [field]: field === "target" ? Number(value) : value } : line)),
    }));
  };

  return (
    <>
      <div className="form-grid">
        <Input label="Fiscal year" value={draft.fiscalYear} onChange={(v) => update("fiscalYear", v)} />
        <Input label="Intervention type" value={draft.interventionType} onChange={(v) => update("interventionType", v)} options={interventionOptions(data)} wide />
        <Input label="Implementing office" value={draft.office} onChange={(v) => update("office", v)} options={data.masterData.offices} />
        <Input label="Program" value={draft.program} onChange={(v) => update("program", v)} options={data.masterData.programs.map((p) => p.name)} />
        <Input label="Subprogram" value={draft.subprogram} onChange={(v) => update("subprogram", v)} />
        <Input label="PAP" value={draft.mfo} onChange={(v) => update("mfo", v)} options={data.masterData.mfos.map((mfo) => mfo.name)} />
        <Input label="UACS" value={draft.uacs} onChange={(v) => update("uacs", v)} />
        <Input label="Municipality" value={draft.municipality} onChange={(v) => update("municipality", v)} options={data.masterData.municipalities.map((m) => m.name)} />
        <Input label="Congressional district" value={draft.district} onChange={(v) => update("district", v)} options={data.masterData.districts} />
        <Input label="Province" value={draft.province} onChange={(v) => update("province", v)} options={data.masterData.provinces} />
        <Input label="Commodity" value={draft.commodity} onChange={(v) => update("commodity", v)} options={data.masterData.commodities} />
        <Input label="Beneficiary group" value={draft.beneficiaryGroup} onChange={(v) => update("beneficiaryGroup", v)} />
        <Input label="Beneficiaries" type="number" value={draft.beneficiaries} onChange={(v) => update("beneficiaries", Number(v))} />
        <Input label="Budget amount" type="number" value={draft.budgetAmount} onChange={(v) => update("budgetAmount", Number(v))} />
        <Input label="Tier" value={draft.tier} onChange={(v) => update("tier", v)} options={["Tier 1", "Tier 2"]} />
        <Input label="Readiness status" value={draft.readinessStatus} onChange={(v) => update("readinessStatus", v)} options={["Concept", "With DED/POW", "Shovel-ready", "For validation"]} />
        <Input label="Climate tag" value={draft.climateTag} onChange={(v) => update("climateTag", v)} options={data.masterData.climateTags} />
        <Input label="GEDSI tag" value={draft.gedsiTag} onChange={(v) => update("gedsiTag", v)} options={data.masterData.gedsiTags} />
        <Input label="Implementation schedule" value={draft.schedule} onChange={(v) => update("schedule", v)} />
        <Input label="Source of proposal" value={draft.source} onChange={(v) => update("source", v)} options={["RFO consultation", "Congressional request", "RDC", "PIP/TRIP", "Program workshop", "Bulk Excel submission"]} />
        <TextArea label="Justification" value={draft.justification} onChange={(v) => update("justification", v)} />
        <TextArea label="Expected outcome" value={draft.expectedOutcome} onChange={(v) => update("expectedOutcome", v)} options={expectedOutcomeOptions} />
        <TextArea label="Expected output" value={draft.expectedOutput} onChange={(v) => update("expectedOutput", v)} options={expectedOutputOptions} />
        <TextArea label="Climate rationale" value={draft.climateRationale} onChange={(v) => update("climateRationale", v)} options={climateRationaleOptions} />
        <TextArea label="Remarks" value={draft.remarks} onChange={(v) => update("remarks", v)} />
      </div>
      <div className="line-editor">
        <h3>Budget Lines</h3>
        {(draft.budgetLines || []).length ? (draft.budgetLines || []).map((line, index) => (
          <div className="line-row" key={line.id || index}>
            <Input label="Object code" value={line.objectCode} onChange={(v) => updateBudget(index, "objectCode", v)} options={data.masterData.objectCodes} />
            <Input label="Expense class" value={line.expenseClass} onChange={(v) => updateBudget(index, "expenseClass", v)} options={data.masterData.expenseClasses} />
            <Input label="Amount" type="number" value={line.amount} onChange={(v) => updateBudget(index, "amount", v)} />
          </div>
        )) : <p className="body-copy">No budget line rows yet. Use the main Budget amount field for imported records until detailed object codes are added.</p>}
      </div>
      <div className="line-editor">
        <h3>Physical Targets</h3>
        {(draft.physicalTargets || []).length ? (draft.physicalTargets || []).map((line, index) => (
          <div className="line-row" key={line.id || index}>
            <Input label="Indicator" value={line.indicator} onChange={(v) => updateTarget(index, "indicator", v)} options={data.masterData.indicators.map((i) => i.name)} />
            <Input label="Target" type="number" value={line.target} onChange={(v) => updateTarget(index, "target", v)} />
            <Input label="Unit" value={line.unit} onChange={(v) => updateTarget(index, "unit", v)} options={data.masterData.unitsOfMeasure} />
          </div>
        )) : <p className="body-copy">No physical target rows yet. Add indicator and unit details when the reviewing office supplies the final target breakdown.</p>}
      </div>
    </>
  );
}

function Input({ label, value, onChange, type = "text", options, wide }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {options ? (
        <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select...</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function TextArea({ label, value, onChange, options }) {
  return (
    <label className="field wide">
      <span>{label}</span>
      {options?.length ? (
        <select value="" onChange={(event) => event.target.value && onChange(event.target.value)}>
          <option value="">Select a standard option...</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : null}
      <textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} rows={3} />
    </label>
  );
}

function flashSaveNotice(setSaveNotice) {
  setSaveNotice("Data entry successfully uploaded and saved in the database.");
  window.setTimeout(() => setSaveNotice(""), 4500);
}

function interventionOptions(data) {
  return data.masterData.interventionTypes.map((item) => (typeof item === "string" ? item : item.name)).filter(Boolean);
}

function findIntervention(data, name) {
  return data.masterData.interventionTypes.find((item) => (typeof item === "string" ? item : item.name) === name);
}

function applyInterventionSelection(current, value, data) {
  const intervention = findIntervention(data, value);
  const mfo = typeof intervention === "string" ? "" : intervention?.mfo || "";
  return {
    ...current,
    interventionType: value,
    mfo: mfo || current.mfo,
    pap: mfo || current.pap,
  };
}

function applyMunicipalitySelection(current, value, data) {
  const municipality = data.masterData.municipalities.find((item) => normalizeLookup(item.name) === normalizeLookup(value));
  return {
    ...current,
    municipality: value,
    province: municipality?.province || municipality?.province_id || current.province,
    district: municipality?.district || municipality?.district_id || current.district,
  };
}

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDraftProposal(proposal) {
  const title = [proposal.interventionType, proposal.commodity, proposal.municipality]
    .filter(Boolean)
    .join(" - ");
  return {
    ...proposal,
    title: title || proposal.title || "Untitled intervention",
    pap: proposal.mfo || proposal.pap || "",
    budgetLines: proposal.budgetLines || [],
    physicalTargets: proposal.physicalTargets || [],
  };
}

function MasterData({ data }) {
  const sets = [
    ["Users and roles", data.users.map((u) => ({ name: u.name, role: u.role, office: u.office }))],
    ["Municipality-district map", data.masterData.municipalities],
    ["Major Final Outputs / OPIF services", data.masterData.mfos],
    ["Programs and PAPs", data.masterData.programs],
    ["Indicators", data.masterData.indicators],
    ["Units of measure", data.masterData.unitsOfMeasure.map((name) => ({ name }))],
    ["Template registry", data.templates],
    ["Bulk import templates", data.bulkTemplates],
  ];
  return (
    <section className="content-stack">
      {sets.map(([title, rows]) => (
        <Panel key={title} title={title} icon={Settings} action={<button className="ghost"><Plus size={16} /> Add</button>}>
          <pre className="json-card">{JSON.stringify(rows, null, 2)}</pre>
        </Panel>
      ))}
    </section>
  );
}

function Validation({ validationResults }) {
  return (
    <section className="content-stack">
      <Panel title="Validation Engine" icon={ShieldCheck}>
        {validationResults.map((result) => (
          <div key={result.proposalId} className="validation-row">
            <div>
              <strong>{result.title}</strong>
              <span>{result.proposalId}</span>
            </div>
            <IssueList issues={result.issues} />
          </div>
        ))}
      </Panel>
    </section>
  );
}

function IssueList({ issues }) {
  if (!issues.length) return <div className="issue-list good"><CheckCircle2 size={16} /> No validation issues.</div>;
  return (
    <ul className="issue-list">
      {issues.map((issue) => (
        <li key={issue.code}><AlertTriangle size={15} /> {issue.message}</li>
      ))}
    </ul>
  );
}

function Consolidation({ proposals }) {
  const groups = [
    ["Program", groupBudget(proposals, "program")],
    ["PAP", groupBudget(proposals, "pap")],
    ["Office", groupBudget(proposals, "office")],
    ["Province", groupBudget(proposals, "province")],
    ["District", groupBudget(proposals, "district")],
    ["Commodity", groupBudget(proposals, "commodity")],
    ["Intervention", groupBudget(proposals, "interventionType")],
    ["Tier", groupBudget(proposals, "tier")],
    ["Phase", groupBudget(proposals, "phase")],
    ["GEDSI", groupBudget(proposals, "gedsiTag")],
  ];
  return (
    <section className="panel-grid">
      {groups.map(([title, rows]) => (
        <Panel key={title} title={`Summary by ${title}`} action={<DownloadButton rows={rows} filename={`summary-by-${title.toLowerCase()}.csv`} />}>
          <DataTable rows={rows} columns={[["label", title], ["count", "Count"], ["budget", "Budget"]]} formatters={{ budget: formatPeso }} />
        </Panel>
      ))}
    </section>
  );
}

function PhaseTracking({ data, proposal }) {
  const history = data.phaseHistory.filter((row) => row.proposalId === proposal?.id);
  return (
    <section className="content-stack">
      <Panel title="Phase Snapshots" icon={History}>
        <DataTable
          rows={history}
          columns={[
            ["phase", "Phase"],
            ["date", "Date"],
            ["budgetAmount", "Amount"],
            ["physicalTarget", "Physical target"],
            ["editor", "Editor"],
            ["remarks", "Remarks"],
          ]}
          formatters={{ budgetAmount: formatPeso }}
        />
      </Panel>
      <Panel title="Comparison View">
        <div className="comparison-grid">
          {["Proposal vs NEP", "NEP vs GAA", "GAA vs BED", "Funded vs Unfunded"].map((label) => (
            <ComparisonCard key={label} label={label} history={history} />
          ))}
        </div>
      </Panel>
    </section>
  );
}

function ComparisonCard({ label, history }) {
  const [left, right] = label.split(" vs ");
  const leftValue = history.find((h) => h.phase === left)?.budgetAmount ?? 0;
  const rightValue = history.find((h) => h.phase === right)?.budgetAmount ?? 0;
  const delta = rightValue - leftValue;
  return (
    <div className="comparison-card">
      <span>{label}</span>
      <strong>{formatPeso(delta)}</strong>
      <p>{delta >= 0 ? "Increase or funded continuity" : "Reduction or unfunded gap"}</p>
    </div>
  );
}

function Reports({ data, proposals }) {
  const reports = [
    "BP Form A-like program budget matrix",
    "BP Form B-like performance measures",
    "BP Form C-like RDC inputs",
    "BP Form D-like CSO inputs",
    "BP Form 202-like Tier 2 profile",
    "BP Form 206-like convergence matrix",
    "BP Form 207-like climate expenditure report",
    "BED No. 2 physical plan",
    "By-congressional-district proposal list",
    "By-municipality intervention list",
    "Commodity-based investment matrix",
    "Unfunded proposals list",
    "Management briefing summary",
    "Bulk submission validation exception report",
    "Banner program upload status report",
    "Template compliance report",
  ];
  return (
    <section className="content-stack">
      <Panel title="Template-driven Report Generator" icon={Download}>
        <div className="report-grid">
          {reports.map((report) => (
            <button
              key={report}
              className="report-button"
              onClick={() => downloadText(`${report}.csv`, toCsv(proposals))}
            >
              <FileSpreadsheet size={18} />
              <span>{report}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Template Registry">
        <DataTable rows={data.templates} columns={[["code", "Code"], ["name", "Template"], ["sourceFile", "Source file"], ["phase", "Phase"], ["outputFormat", "Output"]]} />
      </Panel>
      <Panel title="Bulk Submission Templates">
        <DataTable rows={data.bulkTemplates} columns={[["code", "Code"], ["name", "Template"], ["sourceBasis", "Source basis"], ["importMode", "Import mode"]]} />
      </Panel>
    </section>
  );
}

function Repository({ data, proposal }) {
  const attachments = data.attachments.filter((row) => row.proposalId === proposal?.id);
  return (
    <section className="content-stack">
      <Panel title="Google Drive Folder Convention" icon={UploadCloud}>
        <div className="folder-path">{`FY ${proposal?.fiscalYear || "2027"} / ${proposal?.program || "Program"} / ${proposal?.id || "proposal_id"}`}</div>
        <DataTable rows={attachments} columns={[["type", "Document type"], ["name", "File"], ["driveUrl", "Drive URL"], ["uploaded_by", "Uploaded by"]]} />
      </Panel>
    </section>
  );
}

function Help() {
  return (
    <section className="content-stack">
      <Panel title="Sample Workflow" icon={BookOpen}>
        <ol className="workflow">
          <li>Maintain master lists before encoding, especially intervention type, PAP/OPIF service, municipality-district, UACS, indicators, object codes, climate, GEDSI, and template records.</li>
          <li>Choose the intervention type first; the PAP/OPIF service is filled from the intervention master data and province/district are filled from the selected municipality.</li>
          <li>For banner-program workbooks, upload the Excel file through Bulk Excel Submission, run template preflight, then extract accepted rows into proposals, budget lines, physical targets, and phase snapshots.</li>
          <li>Run validation and correct missing required fields, duplicate interventions, invalid mapping, Tier 2 readiness gaps, indicator-unit mismatches, and climate rationale gaps.</li>
          <li>Freeze phase snapshots for Proposal, DA Internal Review, DBM Submission, NEP, GAA, BED, Implementation, and Monitoring.</li>
          <li>Generate configured reports from the same validated records rather than re-encoding in annual templates.</li>
        </ol>
      </Panel>
      <Panel title="Source-driven Notes">
        <p className="body-copy">
          Source extraction is documented in <code>docs/source-analysis/source-requirements.md</code>. District proposal workbooks inform the proposal and target fields; BED capture sheets inform obligation, disbursement, physical target, PREXC, and tag fields; BP Form 202 and budget-call files inform Tier 2 justification, readiness, and report requirements.
        </p>
      </Panel>
    </section>
  );
}

function buildPreflightRows(template, form, data) {
  const autoProgram = form.program === "Auto-detect from workbook";
  const autoOffice = form.office === "Auto-detect from workbook";
  const hasKnownProgram = autoProgram || data.masterData.programs.some((program) => program.name === form.program);
  const allowsMultiProgram = template.allowsMultiplePrograms || template.allow_multiple_programs === true || template.allow_multiple_programs === "TRUE";
  const allowsMultiOffice = template.allowsMultipleOffices || template.allow_multiple_offices === true || template.allow_multiple_offices === "TRUE";
  return [
    { check: "File selected", result: form.fileName ? "Validated" : "Needs Correction", notes: form.fileName || "Select an Excel workbook from the banner program." },
    { check: "Converted Google Sheet", result: form.convertedSheetId ? "Validated" : "Needs Correction", notes: form.convertedSheetId ? "Apps Script can use this converted_sheet_id for row extraction." : "Upload the Excel file to Drive, open/convert it as Google Sheets, then paste the converted Sheet URL or ID." },
    { check: "Program scope", result: hasKnownProgram && (!autoProgram || allowsMultiProgram) ? "Validated" : "Needs Correction", notes: autoProgram ? "Program will be detected from DA operating unit/agency and commodity columns per row." : `${form.program} must match the program master list.` },
    { check: "Office scope", result: !autoOffice || allowsMultiOffice ? "Validated" : "Needs Correction", notes: autoOffice ? "Submitting office will be detected from the DA Operating Unit / Agency column per row." : `${form.office} is the submitting office for this upload.` },
    { check: "Required sheets", result: "Preflight Review", notes: template.expectedSheets.join(", ") },
    { check: "Required columns", result: "Preflight Review", notes: template.requiredColumns.join(", ") },
    { check: "Master-list matching", result: "Preflight Review", notes: "Intervention, PAP/OPIF service, municipality, district, UACS, indicator, unit, object code, expense class, climate, and GEDSI values will be matched before import." },
  ];
}

function Panel({ title, children, icon: Icon, action }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{Icon && <Icon size={18} />} {title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function BarList({ title, rows }) {
  const max = Math.max(...rows.map((row) => row.budget), 1);
  return (
    <div className="bar-list">
      <h4>{title}</h4>
      {rows.slice(0, 6).map((row) => (
        <div className="bar-row" key={row.label}>
          <span>{row.label}</span>
          <div className="bar-track"><div style={{ width: `${(row.budget / max) * 100}%` }} /></div>
          <strong>{formatPeso(row.budget)}</strong>
        </div>
      ))}
    </div>
  );
}

function DataTable({ rows, columns, formatters = {}, onRowClick, selectedId }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.label || index} onClick={() => onRowClick?.(row)} className={selectedId === row.id ? "selected" : ""}>
              {columns.map(([key]) => <td key={key}>{formatters[key] ? formatters[key](row[key], row) : row[key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ value }) {
  return <span className={`status ${String(value).toLowerCase().replace(/\s+/g, "-")}`}>{value}</span>;
}

function DownloadButton({ rows, filename }) {
  return (
    <button className="ghost" onClick={() => downloadText(filename, toCsv(rows))}>
      <Download size={16} /> CSV
    </button>
  );
}

function summarize(proposals) {
  return proposals.reduce(
    (acc, proposal) => {
      acc.count += 1;
      acc.proposed += proposal.budgetAmount;
      acc.nep += proposal.nepAmount;
      acc.gaa += proposal.gaaAmount;
      acc.targets += proposal.physicalTargets.reduce((sum, target) => sum + Number(target.target || 0), 0);
      return acc;
    },
    { count: 0, proposed: 0, nep: 0, gaa: 0, targets: 0 },
  );
}

function groupBudget(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const label = row[key] || "Unspecified";
    const budget = Number(row.budgetAmount ?? row.amount ?? 0);
    const current = map.get(label) || { label, count: 0, budget: 0 };
    current.count += 1;
    current.budget += budget;
    map.set(label, current);
  });
  return [...map.values()].sort((a, b) => b.budget - a.budget);
}

createRoot(document.getElementById("root")).render(<App />);
