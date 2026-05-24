import React, { useEffect, useMemo, useRef, useState } from "react";
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
  LogOut,
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

const lifecyclePhases = ["Proposal", "NEP", "GAA", "Implementation", "Monitoring and Evaluation"];

const accessProfiles = {
  Admin: {
    label: "Admin",
    rights: ["Full database access", "Master data management", "Validate and move PAPs across phases", "All dashboards and reports"],
    allowedNav: "all",
    canViewDashboard: true,
    canViewRecords: true,
    canEncode: true,
    canValidate: true,
    canAdvance: true,
    canReport: true,
    canManageMasterData: true,
  },
  "Planning Officer": {
    label: "Planning Officer",
    rights: ["Encode and edit PAP records", "Validate Proposal, NEP, and GAA records", "Generate reporting templates"],
    allowedNav: "all",
    canViewDashboard: true,
    canViewRecords: true,
    canEncode: true,
    canValidate: true,
    canAdvance: true,
    canReport: true,
    canManageMasterData: false,
  },
  "Program Officer": {
    label: "Program Officer",
    rights: ["Encode assigned office records", "Set Draft, Needs Correction, and Validated status", "Review supporting details"],
    allowedNav: ["dashboard", "intake", "review", "bulk", "validation", "consolidation", "repository", "help"],
    canViewDashboard: true,
    canViewRecords: true,
    canEncode: true,
    canValidate: true,
    canAdvance: false,
    canReport: false,
    canManageMasterData: false,
  },
  Management: {
    label: "Management",
    rights: ["Dashboard access", "Read-only record view", "Management summaries"],
    allowedNav: ["dashboard", "review", "consolidation", "reports", "help"],
    canViewDashboard: true,
    canViewRecords: true,
    canEncode: false,
    canValidate: false,
    canAdvance: false,
    canReport: false,
    canManageMasterData: false,
  },
  "Read-only Viewer": {
    label: "Read-only Viewer",
    rights: ["Read-only dashboards", "Read-only record lists"],
    allowedNav: ["dashboard", "review", "help"],
    canViewDashboard: true,
    canViewRecords: true,
    canEncode: false,
    canValidate: false,
    canAdvance: false,
    canReport: false,
    canManageMasterData: false,
  },
};

function normalizeAccessRole(role) {
  const value = String(role || "").toLowerCase();
  if (value.includes("admin") || value.includes("system")) return "Admin";
  if (value.includes("planning") || value.includes("pmed") || value.includes("pips") || value.includes("budget") || value.includes("reviewer")) return "Planning Officer";
  if (value.includes("program") || value.includes("encoder")) return "Program Officer";
  if (value.includes("management") || value.includes("viewer")) return "Management";
  return "Read-only Viewer";
}

function activeAccess(data) {
  return accessProfiles[normalizeAccessRole(data.session?.role)] || accessProfiles["Read-only Viewer"];
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3, permission: "canViewDashboard" },
  { id: "intake", label: "Proposal Intake", icon: PenLine, permission: "canEncode" },
  { id: "review", label: "Record Review", icon: ShieldCheck, permission: "canViewRecords" },
  { id: "bulk", label: "Bulk Excel Submission", icon: UploadCloud, permission: "canEncode" },
  { id: "master", label: "Master Data", icon: Database, permission: "canManageMasterData" },
  { id: "validation", label: "Validation", icon: ListChecks, permission: "canViewRecords" },
  { id: "consolidation", label: "Consolidation", icon: TableProperties, permission: "canViewDashboard" },
  { id: "phases", label: "Phase Tracking", icon: History, permission: "canAdvance" },
  { id: "reports", label: "Reports", icon: FileSpreadsheet, permission: "canReport" },
  { id: "repository", label: "MOV Repository", icon: FolderKanban, permission: "canViewRecords" },
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

function canAccessNav(item, access) {
  if (!item.permission) return true;
  if (access.allowedNav === "all") return Boolean(access[item.permission]);
  if (Array.isArray(access.allowedNav) && !access.allowedNav.includes(item.id)) return false;
  return Boolean(access[item.permission]);
}

function readSavedUser() {
  try {
    const saved = window.localStorage.getItem("planBudgetUser");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function readSavedSessionToken() {
  try {
    return window.localStorage.getItem("planBudgetSession") || "";
  } catch {
    return "";
  }
}

function App() {
  const [active, setActiveState] = useState(() => window.location.hash.replace("#", "") || "dashboard");
  const [data, setData] = useState(() => repo.loadAll());
  const [loadState, setLoadState] = useState({ status: ["google", "convex"].includes(dataMode) ? "loading" : "ready", error: "" });
  const [currentUser, setCurrentUser] = useState(() => readSavedUser());
  const [sessionToken, setSessionToken] = useState(() => readSavedSessionToken());
  const [filters, setFilters] = useState({
    fiscalYear: "2027",
    program: "All",
    province: "All",
    status: "All",
  });
  const [selectedProposalId, setSelectedProposalId] = useState(data.proposals[0]?.id);
  const [saveNotice, setSaveNotice] = useState("");
  const [passwordResetRequests, setPasswordResetRequests] = useState([]);
  const isAuthenticated = Boolean(currentUser && (dataMode !== "convex" || sessionToken));
  const baseAccess = currentUser ? (accessProfiles[normalizeAccessRole(currentUser.role)] || accessProfiles["Read-only Viewer"]) : activeAccess(data);
  const access = currentUser && baseAccess.label === "Planning Officer" && !canSessionApprove(currentUser) ? { ...baseAccess, canAdvance: false } : baseAccess;
  const visibleNavItems = useMemo(() => navItems.filter((item) => canAccessNav(item, access)), [access]);
  const setActive = (id) => {
    const target = visibleNavItems.some((item) => item.id === id) ? id : visibleNavItems[0]?.id || "dashboard";
    setActiveState(target);
    window.location.hash = target;
  };
  const applySessionUser = (nextData) => {
    if (!currentUser) return nextData;
    return {
      ...nextData,
      session: {
        user: currentUser.name,
        role: normalizeAccessRole(currentUser.role),
        office: currentUser.office || "",
      },
    };
  };
  const signIn = ({ user, sessionToken: nextSessionToken }) => {
    const normalized = { ...user, role: normalizeAccessRole(user.role) };
    window.localStorage.setItem("planBudgetUser", JSON.stringify(normalized));
    if (nextSessionToken) window.localStorage.setItem("planBudgetSession", nextSessionToken);
    setCurrentUser(normalized);
    setSessionToken(nextSessionToken || "");
    setData((current) => ({ ...current, session: { user: normalized.name, role: normalized.role, office: normalized.office || "" } }));
    const nextAccess = accessProfiles[normalized.role] || accessProfiles["Read-only Viewer"];
    const firstNav = navItems.find((item) => canAccessNav(item, nextAccess))?.id || "dashboard";
    setActiveState(firstNav);
    window.location.hash = firstNav;
  };
  const signOut = () => {
    if (dataMode === "convex" && sessionToken) repo.logoutAsync?.(sessionToken).catch(() => undefined);
    window.localStorage.removeItem("planBudgetUser");
    window.localStorage.removeItem("planBudgetSession");
    setCurrentUser(null);
    setSessionToken("");
    setData((current) => ({ ...current, session: { user: "", role: "" } }));
    window.location.hash = "";
  };

  const loadPasswordResetRequests = () => {
    if (dataMode !== "convex" || !sessionToken || normalizeAccessRole(currentUser?.role) !== "Admin") return Promise.resolve([]);
    return repo.listPasswordResetRequestsAsync(sessionToken)
      .then((rows) => {
        setPasswordResetRequests(rows || []);
        return rows || [];
      })
      .catch((error) => {
        setLoadState({ status: "error", error: error.message });
        return [];
      });
  };

  const reloadProductionData = () => {
    if (!["google", "convex"].includes(dataMode)) return undefined;
    if (dataMode === "convex" && !sessionToken) return undefined;
    setLoadState({ status: "loading", error: "" });
    return repo.loadAllAsync({ fiscalYear: filters.fiscalYear, sessionToken })
      .then((nextData) => {
        setData(applySessionUser(nextData));
        setSelectedProposalId(nextData.proposals[0]?.id);
        setLoadState({ status: "ready", error: "" });
        loadPasswordResetRequests();
      })
      .catch((error) => {
        setLoadState({ status: "error", error: error.message });
      });
  };

  useEffect(() => {
    let cancelled = false;
    if (!["google", "convex"].includes(dataMode)) return undefined;
    if (dataMode === "convex" && !sessionToken) {
      repo.loadLoginUsersAsync?.()
        .then((users) => {
          if (!cancelled) setData((current) => ({ ...current, users: users || [] }));
        })
        .catch((error) => {
          if (!cancelled) setLoadState({ status: "error", error: error.message });
        });
      setLoadState({ status: "ready", error: "" });
      return () => {
        cancelled = true;
      };
    }
    setLoadState({ status: "loading", error: "" });
    repo.loadAllAsync({ fiscalYear: filters.fiscalYear, sessionToken })
      .then((nextData) => {
        if (cancelled) return;
        setData(applySessionUser(nextData));
        setSelectedProposalId(nextData.proposals[0]?.id);
        setLoadState({ status: "ready", error: "" });
        loadPasswordResetRequests();
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState({ status: "error", error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [filters.fiscalYear, currentUser?.name, sessionToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadPasswordResetRequests();
  }, [isAuthenticated, sessionToken, currentUser?.role]);

  useEffect(() => {
    if (!currentUser) return;
    setData((current) => ({
      ...current,
      session: {
        user: currentUser.name,
        role: normalizeAccessRole(currentUser.role),
        office: currentUser.office || "",
      },
    }));
  }, [currentUser?.name]);

  useEffect(() => {
    if (!visibleNavItems.length) return;
    if (!visibleNavItems.some((item) => item.id === active)) setActive(visibleNavItems[0].id);
  }, [active, visibleNavItems]);

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

  if (!isAuthenticated) {
    return <LoginScreen data={data} loadState={loadState} onLogin={signIn} repo={repo} dataMode={dataMode} />;
  }

  const upsertProposal = (proposal) => {
    if (!access.canEncode && !access.canValidate) return;
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
    next.validationStatus = resolveClientValidationStatus(next.validationStatus, result.issues, access, data.session);
    if (["google", "convex"].includes(dataMode)) {
      repo.saveProposalAsync(next, data.session.user, sessionToken)
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

  const advanceProposalPhase = ({ proposal, toPhase, remarks }) => {
    if (!access.canAdvance) return;
    const next = {
      ...proposal,
      phase: toPhase,
      updated_at: new Date().toISOString(),
      updated_by: data.session.user,
      validationStatus: toPhase === "Monitoring and Evaluation" ? "Approved" : proposal.validationStatus,
    };
    if (dataMode === "convex") {
      repo.advancePhaseAsync({ proposalId: proposal.id, toPhase, remarks, actor: data.session.user, sessionToken })
        .then(() => reloadProductionData())
        .then(() => flashSaveNotice(setSaveNotice, `${proposal.id} moved to ${toPhase}.`))
        .catch((error) => setLoadState({ status: "error", error: error.message }));
      return;
    }
    setData((current) => ({
      ...repo.saveProposal(current, next),
      phaseHistory: [
        ...(current.phaseHistory || []),
        {
          id: `PH-${Date.now()}`,
          proposalId: proposal.id,
          phase: toPhase,
          date: new Date().toISOString().slice(0, 10),
          budgetAmount: phaseAmount(next, toPhase),
          physicalTarget: String((next.physicalTargets || []).reduce((sum, target) => sum + Number(target.target || 0), 0)),
          editor: data.session.user,
          remarks: remarks || `Advanced to ${toPhase}.`,
        },
      ],
    }));
    flashSaveNotice(setSaveNotice, `${proposal.id} moved to ${toPhase}.`);
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
    if (dataMode === "google" || dataMode === "convex") {
      repo.registerBulkSubmissionAsync(next, sessionToken)
        .then((saved) => setData((current) => ({
          ...current,
          bulkSubmissions: [saved || next, ...(current.bulkSubmissions || [])],
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
          {visibleNavItems.map((item) => {
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
            <span>{dataMode === "convex" ? "Production Convex" : dataMode === "google" ? "Production Google Sheets" : dataMode === "demo" ? "Demo training data" : "Empty local setup"}</span>
          </div>
        </div>
        <button className="nav-item sign-out" onClick={signOut}>
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </aside>

      <main className="workspace">
        <ProductionBanner dataMode={dataMode} loadState={loadState} />
        {saveNotice && <div className="toast good">{saveNotice}</div>}
        <Header data={data} filters={filters} setFilters={setFilters} onRefresh={reloadProductionData} loadState={loadState} />
        <AccessBanner data={data} access={access} onSignOut={signOut} />
        <AccountSecurity
          dataMode={dataMode}
          repo={repo}
          sessionToken={sessionToken}
          onChanged={(message) => flashSaveNotice(setSaveNotice, message)}
          onError={(error) => setLoadState({ status: "error", error: error.message })}
        />
        {active === "dashboard" && (
          <Dashboard data={data} proposals={filteredProposals} validationResults={validationResults} />
        )}
        {active === "intake" && (
          <ProposalIntake
            data={data}
            access={access}
            proposal={selectedProposal}
            proposals={filteredProposals}
            onSelect={setSelectedProposalId}
            onNew={() => setSelectedProposalId("__new__")}
            onSave={upsertProposal}
          />
        )}
        {active === "review" && <RecordReview data={data} access={access} initialSelectedId={selectedProposalId} onSave={upsertProposal} />}
        {active === "bulk" && access.canEncode && <BulkSubmission data={data} access={access} onSubmit={registerBulkSubmission} />}
        {active === "master" && access.canManageMasterData && (
          <MasterData
            data={data}
            access={access}
            dataMode={dataMode}
            repo={repo}
            sessionToken={sessionToken}
            passwordResetRequests={passwordResetRequests}
            onPasswordReset={(message = "User account updated.") => {
              flashSaveNotice(setSaveNotice, message);
              return loadPasswordResetRequests().then(() => reloadProductionData());
            }}
            onError={(error) => setLoadState({ status: "error", error: error.message })}
          />
        )}
        {active === "validation" && (
          <Validation
            data={data}
            validationResults={validationResults}
            onEdit={(proposalId) => {
              setSelectedProposalId(proposalId);
              setActive("review");
            }}
          />
        )}
        {active === "consolidation" && <Consolidation proposals={filteredProposals} />}
        {active === "phases" && <PhaseTracking data={data} access={access} proposal={selectedProposal} onAdvance={advanceProposalPhase} />}
        {active === "reports" && access.canReport && <Reports data={data} access={access} proposals={filteredProposals} />}
        {active === "repository" && <Repository data={data} proposal={selectedProposal} />}
        {active === "help" && <Help />}
      </main>
    </div>
  );
}

function LoginScreen({ data, loadState, onLogin, repo, dataMode }) {
  const users = useMemo(() => {
    const source = data.users?.length ? data.users : [
      { name: "System Admin", role: "Admin", office: "RICT" },
      { name: "PMED Reviewer", role: "Planning Officer", office: "PMED" },
      { name: "Rice Planning Officer", role: "Planning Officer", office: "Rice Program" },
      { name: "Program Officer", role: "Program Officer", office: "Banner Program" },
      { name: "Management Viewer", role: "Management", office: "ORD" },
    ];
    return source.map((user) => ({ ...user, role: normalizeAccessRole(user.role) }));
  }, [data.users]);
  const [selectedName, setSelectedName] = useState(users[0]?.name || "");
  const [password, setPassword] = useState("");
  const [loginState, setLoginState] = useState({ status: "idle", error: "" });
  const [resetNote, setResetNote] = useState("");
  const [resetState, setResetState] = useState({ status: "idle", message: "" });
  useEffect(() => {
    if (!selectedName && users[0]?.name) setSelectedName(users[0].name);
  }, [users, selectedName]);
  const selectedUser = users.find((user) => user.name === selectedName) || users[0];
  const selectedAccess = accessProfiles[selectedUser?.role] || accessProfiles["Read-only Viewer"];
  const submitLogin = () => {
    if (!selectedUser) return;
    if (dataMode !== "convex") {
      onLogin({ user: selectedUser, sessionToken: "" });
      return;
    }
    setLoginState({ status: "loading", error: "" });
    repo.loginAsync({ name: selectedUser.name, password })
      .then((result) => {
        setLoginState({ status: "idle", error: "" });
        onLogin(result);
      })
      .catch((error) => {
        setLoginState({ status: "error", error: error.message });
      });
  };
  const requestReset = () => {
    if (dataMode !== "convex" || !selectedUser) return;
    setResetState({ status: "loading", message: "" });
    repo.requestPasswordResetAsync({ name: selectedUser.name, note: resetNote })
      .then(() => setResetState({ status: "ready", message: "Password reset request sent to Admin." }))
      .catch((error) => setResetState({ status: "error", message: error.message }));
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-block login-brand">
          <div className="seal">DA</div>
          <div>
            <h1>PLAN-BUDGET Hub</h1>
            <p>Secure planning and budget database access</p>
          </div>
        </div>
        <div className="login-copy">
          <h2>Sign in to continue</h2>
          <p>Use your authorized account password. Privileges are verified by Convex before database access is allowed.</p>
        </div>
        {loadState.status === "loading" && <div className="mode-banner">Loading authorized user accounts from Convex...</div>}
        {loadState.status === "error" && <div className="mode-banner error">{loadState.error}</div>}
        {loginState.status === "error" && <div className="mode-banner error">{loginState.error}</div>}
        {resetState.message && <div className={`mode-banner ${resetState.status === "error" ? "error" : "good"}`}>{resetState.message}</div>}
        <label className="field">
          <span>User account</span>
          <select value={selectedName} onChange={(event) => setSelectedName(event.target.value)}>
            {users.map((user) => (
              <option key={user.name} value={user.name}>{user.name} - {user.office || "No office"} - {user.role}</option>
            ))}
          </select>
        </label>
        {dataMode === "convex" && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitLogin();
              }}
              placeholder="Enter account password"
              autoComplete="current-password"
            />
          </label>
        )}
        <div className="login-access-card">
          <strong>{selectedAccess.label}</strong>
          <span>{selectedUser?.office || "No office assigned"}</span>
          <ul>
            {selectedAccess.rights.map((right) => <li key={right}>{right}</li>)}
          </ul>
        </div>
        <button className="primary login-button" disabled={!selectedUser || loginState.status === "loading" || (dataMode === "convex" && !password)} onClick={submitLogin}>
          <ShieldCheck size={18} /> {loginState.status === "loading" ? "Signing in..." : "Login"}
        </button>
        {dataMode === "convex" && (
          <details className="forgot-password">
            <summary>Forgot password?</summary>
            <label className="field">
              <span>Reset note</span>
              <input value={resetNote} onChange={(event) => setResetNote(event.target.value)} placeholder="Optional note for Admin" />
            </label>
            <button className="ghost" disabled={!selectedUser || resetState.status === "loading"} onClick={requestReset}>
              {resetState.status === "loading" ? "Sending request..." : "Send reset request"}
            </button>
          </details>
        )}
      </section>
    </main>
  );
}

function AccountSecurity({ dataMode, repo, sessionToken, onChanged, onError }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [status, setStatus] = useState("idle");
  if (dataMode !== "convex") return null;
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = () => {
    if (form.newPassword !== form.confirmPassword) {
      onError(new Error("New password and confirmation do not match."));
      return;
    }
    setStatus("loading");
    repo.changePasswordAsync({ sessionToken, currentPassword: form.currentPassword, newPassword: form.newPassword })
      .then(() => {
        setStatus("idle");
        setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setOpen(false);
        onChanged("Password changed.");
      })
      .catch((error) => {
        setStatus("idle");
        onError(error);
      });
  };
  return (
    <section className="account-security">
      <button className="ghost" onClick={() => setOpen((value) => !value)}><ShieldCheck size={15} /> Change password</button>
      {open && (
        <div className="password-form">
          <label className="field compact">
            <span>Current password</span>
            <input type="password" value={form.currentPassword} onChange={(event) => update("currentPassword", event.target.value)} autoComplete="current-password" />
          </label>
          <label className="field compact">
            <span>New password</span>
            <input type="password" value={form.newPassword} onChange={(event) => update("newPassword", event.target.value)} autoComplete="new-password" />
          </label>
          <label className="field compact">
            <span>Confirm password</span>
            <input type="password" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} autoComplete="new-password" />
          </label>
          <button className="primary" disabled={status === "loading" || !form.currentPassword || !form.newPassword || !form.confirmPassword} onClick={submit}>
            {status === "loading" ? "Saving..." : "Save password"}
          </button>
        </div>
      )}
    </section>
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
    return <div className="mode-banner warn">Demo mode is using sample training records. Set <code>VITE_DATA_MODE=convex</code> for production.</div>;
  }
  if (dataMode === "empty") {
    return <div className="mode-banner">Empty local mode. Set <code>VITE_DATA_MODE=convex</code> and <code>VITE_CONVEX_URL</code> to use the production database.</div>;
  }
  if (loadState.status === "loading") {
    return <div className="mode-banner">Loading production records from {dataMode === "convex" ? "Convex" : "Google Sheets"}...</div>;
  }
  if (loadState.status === "error") {
    return <div className="mode-banner error">{dataMode === "convex" ? "Convex" : "Google Sheets"} connection error: {loadState.error}</div>;
  }
  if (dataMode === "convex") return <div className="mode-banner good">Production mode connected to Convex.</div>;
  return <div className="mode-banner good">Production mode connected to Google Sheets.</div>;
}

function AccessBanner({ data, access, onSignOut }) {
  return (
    <div className="access-banner">
      <div>
        <strong>{access.label}</strong>
        <span>{data.session?.user || "Current user"}{data.session?.office ? ` - ${data.session.office}` : ""}</span>
      </div>
      <ul>
        {access.rights.map((right) => <li key={right}>{right}</li>)}
      </ul>
      <button className="ghost" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
    </div>
  );
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
        {["google", "convex"].includes(dataMode) && (
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

function ProposalIntake({ data, access, proposal, proposals, onSelect, onNew, onSave }) {
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
      <Panel title="Proposal Register" icon={Search} action={access.canEncode && <button className="primary" onClick={onNew}><Plus size={16} /> New Proposal</button>}>
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
      <Panel title={proposal ? "Encode / Edit Proposal" : "Create New Proposal"} icon={PenLine} action={access.canEncode && <button className="primary" onClick={() => onSave(draft)}><CheckCircle2 size={16} /> Validate and Save</button>}>
        <ProposalEditorFields data={data} access={access} draft={draft} setDraft={setDraft} readOnly={!access.canEncode} />
        <IssueList issues={issues} />
      </Panel>
    </section>
  );
}

function RecordReview({ data, access, initialSelectedId, onSave }) {
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialSelectedId || data.proposals[0]?.id || "");
  const [reviewMode, setReviewMode] = useState(Boolean(initialSelectedId));
  const editorRef = useRef(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.proposals.map((proposal, index) => ({ proposal, index })).filter(({ proposal }) => {
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
    }).sort((a, b) => {
      const editedDelta = Number(isEdited(a.proposal)) - Number(isEdited(b.proposal));
      return editedDelta || a.index - b.index;
    }).map(({ proposal }) => proposal);
  }, [data.proposals, query, statusFilter]);
  useEffect(() => {
    if (!initialSelectedId) return;
    setSelectedId(initialSelectedId);
    setReviewMode(true);
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [initialSelectedId]);
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
  }, [selected?.id, selected?.updated_at, selected?.validationStatus]);
  const issues = draft ? validateProposal(draft, data).issues : [];
  const openRecord = (row) => {
    setSelectedId(row.id);
    setReviewMode(true);
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

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
          onRowClick={openRecord}
          onRowDoubleClick={openRecord}
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
            ["edited", "Edited"],
          ]}
          formatters={{
            id: (value, row) => <button type="button" className="link-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openRecord(row); }}>{value}</button>,
            budgetAmount: formatPeso,
            validationStatus: (value) => <StatusBadge value={value} />,
            edited: (_value, row) => <EditedBadge row={row} />,
          }}
        />
      </Panel>

      <div ref={editorRef}>
        <Panel
          title={draft ? `Edit and Validate ${draft.id}` : "Edit and Validate Record"}
          icon={PenLine}
          action={draft && reviewMode && access.canValidate && <button className="primary" onClick={() => onSave(draft)}><CheckCircle2 size={16} /> Validate and Save</button>}
        >
          {draft && reviewMode ? (
            <>
              <div className="record-meta">
                <StatusBadge value={draft.validationStatus || "Draft"} />
                <EditedBadge row={draft} />
                <span>Updated by {draft.updated_by || draft.created_by || "unrecorded user"}</span>
                <span>{formatDateTime(draft.updated_at || draft.created_at)}</span>
              </div>
              <ProposalEditorFields data={data} access={access} draft={draft} setDraft={setDraft} readOnly={!access.canValidate} />
              <IssueList issues={issues} />
            </>
          ) : draft ? (
            <div className="empty-state">
              <strong>{draft.id}</strong>
              <p className="body-copy">Double-click this record in the list, or click its ID, to enter edit and review mode.</p>
              <button className="primary" onClick={() => setReviewMode(true)}><PenLine size={16} /> Edit / Review</button>
            </div>
          ) : (
            <p className="body-copy">No submitted records match the current review filters.</p>
          )}
        </Panel>
      </div>
    </section>
  );
}

function EditedBadge({ row }) {
  const edited = isEdited(row);
  return <span className={`edited-badge ${edited ? "yes" : ""}`}>{edited ? "Edited" : "Not edited"}</span>;
}

function isEdited(row) {
  const created = row?.created_at || row?.createdAt;
  const updated = row?.updated_at || row?.updatedAt;
  const createdBy = row?.created_by || row?.createdBy;
  const updatedBy = row?.updated_by || row?.updatedBy;
  if (createdBy && updatedBy && normalizeLookup(createdBy) !== normalizeLookup(updatedBy)) return true;
  if (!created && updated) return true;
  if (!created || !updated) return false;
  const createdTime = new Date(created).getTime();
  const updatedTime = new Date(updated).getTime();
  if (!Number.isNaN(createdTime) && !Number.isNaN(updatedTime)) return updatedTime > createdTime;
  return String(updated) !== String(created);
}

function formatDateTime(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function ProposalEditorFields({ data, access, draft, setDraft, readOnly = false }) {
  const update = (field, value) => setDraft((current) => {
    if (readOnly) return current;
    if (field === "interventionType") return applyInterventionSelection(current, value, data);
    if (field === "municipality") return applyMunicipalitySelection(current, value, data);
    if (field === "mfo") return { ...current, mfo: value, pap: value };
    return { ...current, [field]: value };
  });
  const updateBudget = (index, field, value) => {
    if (readOnly) return;
    setDraft((current) => ({
      ...current,
      budgetLines: (current.budgetLines || []).map((line, i) => (i === index ? { ...line, [field]: field === "amount" ? Number(value) : value } : line)),
    }));
  };
  const updateTarget = (index, field, value) => {
    if (readOnly) return;
    setDraft((current) => ({
      ...current,
      physicalTargets: (current.physicalTargets || []).map((line, i) => (i === index ? { ...line, [field]: field === "target" ? Number(value) : value } : line)),
    }));
  };

  return (
    <>
      <fieldset className="form-grid" disabled={readOnly}>
        <Input label="Fiscal year" value={draft.fiscalYear} onChange={(v) => update("fiscalYear", v)} />
        <Input label="Intervention type" value={draft.interventionType} onChange={(v) => update("interventionType", v)} options={interventionOptions(data)} wide />
        <Input label="Implementing office" value={draft.office} onChange={(v) => update("office", v)} options={data.masterData.offices} />
        <Input label="Program" value={draft.program} onChange={(v) => update("program", v)} options={data.masterData.programs.map((p) => p.name)} />
        <Input label="Subprogram" value={draft.subprogram} onChange={(v) => update("subprogram", v)} />
        <Input label="PAP" value={draft.mfo} onChange={(v) => update("mfo", v)} options={data.masterData.mfos.map((mfo) => mfo.name)} />
        <Input label="UACS" value={draft.uacs} onChange={(v) => update("uacs", v)} />
        <Input label="Municipality" value={draft.municipality} onChange={(v) => update("municipality", v)} options={data.masterData.municipalities.map((m) => municipalityName(m)).filter(Boolean)} />
        <Input label="Congressional district" value={draft.district} onChange={(v) => update("district", v)} options={data.masterData.districts} />
        <Input label="Province" value={draft.province} onChange={(v) => update("province", v)} options={data.masterData.provinces} />
        <Input label="Commodity" value={draft.commodity} onChange={(v) => update("commodity", v)} options={data.masterData.commodities} />
        <Input label="Beneficiary group" value={draft.beneficiaryGroup} onChange={(v) => update("beneficiaryGroup", v)} />
        <Input label="Beneficiaries" type="number" value={draft.beneficiaries} onChange={(v) => update("beneficiaries", Number(v))} />
        <Input label="Budget amount" type="number" value={draft.budgetAmount} onChange={(v) => update("budgetAmount", Number(v))} />
        <Input label="NEP amount" type="number" value={draft.nepAmount} onChange={(v) => update("nepAmount", Number(v))} />
        <Input label="GAA amount" type="number" value={draft.gaaAmount} onChange={(v) => update("gaaAmount", Number(v))} />
        <Input label="Current phase" value={draft.phase} onChange={(v) => update("phase", v)} options={lifecyclePhases} />
        <Input label="Tier" value={draft.tier} onChange={(v) => update("tier", v)} options={["Tier 1", "Tier 2"]} />
        <Input label="Readiness status" value={draft.readinessStatus} onChange={(v) => update("readinessStatus", v)} options={["Concept", "With DED/POW", "Shovel-ready", "For validation"]} />
        <Input label="Climate tag" value={draft.climateTag} onChange={(v) => update("climateTag", v)} options={data.masterData.climateTags} />
        <Input label="GEDSI tag" value={draft.gedsiTag} onChange={(v) => update("gedsiTag", v)} options={data.masterData.gedsiTags} />
        <Input label="Implementation schedule" value={draft.schedule} onChange={(v) => update("schedule", v)} />
        <Input label="Validation status" value={draft.validationStatus || "Draft"} onChange={(v) => update("validationStatus", v)} options={validationStatusOptions(access, data.session)} />
        <Input label="Source of proposal" value={draft.source} onChange={(v) => update("source", v)} options={["RFO consultation", "Congressional request", "RDC", "PIP/TRIP", "Program workshop", "Bulk Excel submission"]} />
        <TextArea label="Justification" value={draft.justification} onChange={(v) => update("justification", v)} />
        <TextArea label="Expected outcome" value={draft.expectedOutcome} onChange={(v) => update("expectedOutcome", v)} options={expectedOutcomeOptions} />
        <TextArea label="Expected output" value={draft.expectedOutput} onChange={(v) => update("expectedOutput", v)} options={expectedOutputOptions} />
        <TextArea label="Climate rationale" value={draft.climateRationale} onChange={(v) => update("climateRationale", v)} options={climateRationaleOptions} />
        <TextArea label="Remarks" value={draft.remarks} onChange={(v) => update("remarks", v)} />
      </fieldset>
      <div className="line-editor">
        <h3>Budget Lines</h3>
        {(draft.budgetLines || []).length ? (draft.budgetLines || []).map((line, index) => (
          <div className="line-row" key={line.id || index}>
            <Input label="Object code" value={line.objectCode} onChange={(v) => updateBudget(index, "objectCode", v)} options={data.masterData.objectCodes} disabled={readOnly} />
            <Input label="Expense class" value={line.expenseClass} onChange={(v) => updateBudget(index, "expenseClass", v)} options={data.masterData.expenseClasses} disabled={readOnly} />
            <Input label="Amount" type="number" value={line.amount} onChange={(v) => updateBudget(index, "amount", v)} disabled={readOnly} />
          </div>
        )) : <p className="body-copy">No budget line rows yet. Use the main Budget amount field for imported records until detailed object codes are added.</p>}
      </div>
      <div className="line-editor">
        <h3>Physical Targets</h3>
        {(draft.physicalTargets || []).length ? (draft.physicalTargets || []).map((line, index) => (
          <div className="line-row" key={line.id || index}>
            <Input label="Indicator" value={line.indicator} onChange={(v) => updateTarget(index, "indicator", v)} options={data.masterData.indicators.map((i) => i.name)} disabled={readOnly} />
            <Input label="Target" type="number" value={line.target} onChange={(v) => updateTarget(index, "target", v)} disabled={readOnly} />
            <Input label="Unit" value={line.unit} onChange={(v) => updateTarget(index, "unit", v)} options={data.masterData.unitsOfMeasure} disabled={readOnly} />
          </div>
        )) : <p className="body-copy">No physical target rows yet. Add indicator and unit details when the reviewing office supplies the final target breakdown.</p>}
      </div>
    </>
  );
}

function validationStatusOptions(access, session) {
  if (access?.label === "Admin") return ["Needs Correction", "Validated", "Approved"];
  if (access?.label === "Planning Officer") {
    return canSessionApprove(session) ? ["Needs Correction", "Validated", "Approved"] : ["Needs Correction", "Validated"];
  }
  if (access?.label === "Program Officer") return ["Draft", "Needs Correction", "Validated"];
  return [];
}

function resolveClientValidationStatus(requestedStatus, issues, access, session) {
  const allowed = validationStatusOptions(access, session);
  const computed = issues.length ? "Needs Correction" : (access?.label === "Program Officer" ? "Draft" : "Validated");
  if (allowed.includes(requestedStatus)) return requestedStatus;
  if (allowed.includes(computed)) return computed;
  return issues.length ? "Needs Correction" : "Validated";
}

function canSessionApprove(session) {
  const office = String(session?.office || "").toLowerCase();
  return office.includes("pmed") || office.includes("pips");
}

function Input({ label, value, onChange, type = "text", options, wide, disabled = false }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {options ? (
        <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="">Select...</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
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

function flashSaveNotice(setSaveNotice, message = "Data entry successfully uploaded and saved in the database.") {
  setSaveNotice(message);
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
  const municipality = data.masterData.municipalities.find((item) => normalizeLookup(municipalityName(item)) === normalizeLookup(value));
  return {
    ...current,
    municipality: value,
    province: municipalityProvince(municipality),
    district: municipalityDistrict(municipality),
  };
}

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase();
}

function municipalityName(row) {
  if (!row) return "";
  return row.name || row.municipality || row.municipality_name || row.city_municipality || row.lgu || "";
}

function municipalityProvince(row) {
  if (!row) return "";
  return row.province || row.province_name || row.province_id || "";
}

function municipalityDistrict(row) {
  if (!row) return "";
  return row.district || row.congressional_district || row.district_name || row.district_id || "";
}

function inferDistrictProvince(district) {
  const value = String(district || "");
  if (value.includes("Batanes")) return "Batanes";
  if (value.includes("Cagayan")) return "Cagayan";
  if (value.includes("Isabela")) return "Isabela";
  if (value.includes("Nueva Vizcaya")) return "Nueva Vizcaya";
  if (value.includes("Quirino")) return "Quirino";
  return "";
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

function MasterData({ data, access, dataMode, repo, sessionToken, passwordResetRequests = [], onPasswordReset, onError }) {
  const masterSections = [
    {
      title: "Municipality and District Map",
      icon: MapPinned,
      rows: data.masterData.municipalities.map((row) => ({
        id: row._id || row.psgc || row.name,
        name: municipalityName(row),
        province: municipalityProvince(row),
        district: municipalityDistrict(row),
        psgc: row.psgc || "",
      })),
      columns: [["name", "Municipality"], ["province", "Province"], ["district", "Congressional District"], ["psgc", "PSGC"]],
    },
    {
      title: "Congressional Districts",
      icon: MapPinned,
      rows: data.masterData.districts.map((district) => ({
        id: district,
        district,
        province: inferDistrictProvince(district),
      })),
      columns: [["district", "Congressional District"], ["province", "Province"]],
    },
    {
      title: "Major Final Outputs / PAP Services",
      icon: Layers3,
      rows: data.masterData.mfos.map((row) => ({
        id: row.code || row.name,
        code: row.code || "",
        name: row.name,
        parent: row.parent_mfo || row.parent || "",
      })),
      columns: [["code", "Code"], ["name", "MFO / PAP Service"], ["parent", "Parent MFO"]],
    },
    {
      title: "Programs and PAPs",
      icon: ClipboardList,
      rows: data.masterData.programs.map((program) => ({
        id: program.name,
        name: program.name,
        uacs: program.uacs || "",
        paps: Array.isArray(program.paps) ? program.paps.join("; ") : "",
      })),
      columns: [["name", "Program"], ["uacs", "UACS"], ["paps", "Linked PAPs"]],
    },
    {
      title: "Intervention Types",
      icon: Settings,
      rows: data.masterData.interventionTypes.map((row) => ({
        id: row.code || row.name,
        name: row.name,
        program: row.program || "",
        mfo: row.mfo || "",
        defaultIndicator: row.defaultIndicator || row.source_indicator || "",
        defaultUnit: row.defaultUnit || "",
      })),
      columns: [["name", "Intervention"], ["program", "Program"], ["mfo", "MFO"], ["defaultIndicator", "Default Indicator"], ["defaultUnit", "Unit"]],
    },
    {
      title: "Indicators",
      icon: ListChecks,
      rows: data.masterData.indicators.map((row) => ({
        id: row.name,
        name: row.name,
        unit: row.unit || "",
        mfo: row.mfo || "",
        pi_level: row.pi_level || "",
      })),
      columns: [["name", "Indicator"], ["unit", "Unit"], ["mfo", "MFO"], ["pi_level", "Level"]],
    },
    {
      title: "Reference Tags and Expense Classes",
      icon: Database,
      rows: [
        ...data.masterData.unitsOfMeasure.map((name) => ({ id: `unit-${name}`, type: "Unit of Measure", name })),
        ...data.masterData.objectCodes.map((name) => ({ id: `object-${name}`, type: "Object Code", name })),
        ...data.masterData.expenseClasses.map((name) => ({ id: `expense-${name}`, type: "Expense Class", name })),
        ...data.masterData.climateTags.map((name) => ({ id: `climate-${name}`, type: "Climate Tag", name })),
        ...data.masterData.gedsiTags.map((name) => ({ id: `gedsi-${name}`, type: "GEDSI Tag", name })),
        ...data.masterData.commodities.map((name) => ({ id: `commodity-${name}`, type: "Commodity", name })),
      ],
      columns: [["type", "Reference Type"], ["name", "Value"]],
    },
    {
      title: "Report Templates",
      icon: FileSpreadsheet,
      rows: data.templates.map((row) => ({ id: row.code || row.name, ...row })),
      columns: [["code", "Code"], ["name", "Template"], ["phase", "Phase"], ["outputFormat", "Output"]],
    },
    {
      title: "Bulk Import Templates",
      icon: UploadCloud,
      rows: data.bulkTemplates.map((row) => ({
        id: row.code || row.name,
        code: row.code || "",
        name: row.name || "",
        sourceBasis: row.sourceBasis || "",
        expectedSheets: Array.isArray(row.expectedSheets) ? row.expectedSheets.join(", ") : "",
        importMode: row.importMode || "",
      })),
      columns: [["code", "Code"], ["name", "Template"], ["sourceBasis", "Source Basis"], ["expectedSheets", "Expected Sheets"], ["importMode", "Import Mode"]],
    },
  ];
  return (
    <section className="content-stack">
      <div className="master-summary-grid">
        <Kpi label="Users" value={data.users.length} icon={Users} />
        <Kpi label="Municipalities" value={data.masterData.municipalities.length} icon={MapPinned} />
        <Kpi label="Districts" value={data.masterData.districts.length} icon={MapPinned} />
        <Kpi label="Programs" value={data.masterData.programs.length} icon={ClipboardList} />
      </div>
      <UserPasswordAdmin
        users={data.users}
        offices={data.masterData.offices}
        resetRequests={passwordResetRequests}
        dataMode={dataMode}
        repo={repo}
        sessionToken={sessionToken}
        onPasswordReset={onPasswordReset}
        onError={onError}
      />
      {masterSections.map((section) => (
        <MasterDataTable key={section.title} {...section} />
      ))}
    </section>
  );
}

function MasterDataTable({ title, icon, rows, columns }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [needle, rows]);
  return (
    <Panel title={title} icon={icon}>
      <div className="master-table-toolbar">
        <label className="field compact master-search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Find ${title.toLowerCase()}`} />
        </label>
      </div>
      <DataTable rows={filteredRows} columns={columns} />
    </Panel>
  );
}

function UserPasswordAdmin({ users = [], offices = [], resetRequests = [], dataMode, repo, sessionToken, onPasswordReset, onError }) {
  const blankUser = useMemo(() => ({
    _id: "",
    name: "",
    email: "",
    role: "Program Officer",
    office: "",
    status: "Active",
    password: "PlanBudget2027!",
  }), []);
  const [selectedUserId, setSelectedUserId] = useState(users[0]?._id || "");
  const [userForm, setUserForm] = useState(blankUser);
  const [newPassword, setNewPassword] = useState("");
  const [officePassword, setOfficePassword] = useState("PlanBudget2027!");
  const [requestId, setRequestId] = useState("");
  const [status, setStatus] = useState("idle");
  const [batchStatus, setBatchStatus] = useState("idle");
  useEffect(() => {
    if (!selectedUserId && users[0]?._id) setSelectedUserId(users[0]._id);
  }, [users, selectedUserId]);
  const selectedUser = users.find((user) => user._id === selectedUserId) || users[0];
  useEffect(() => {
    if (selectedUser) setUserForm({ ...blankUser, ...selectedUser, password: "" });
  }, [selectedUser?._id]);
  const openRequests = resetRequests.filter((request) => request.status === "Open");
  const updateUserForm = (field, value) => setUserForm((current) => ({ ...current, [field]: value }));
  const startNewUser = () => {
    setSelectedUserId("");
    setUserForm(blankUser);
    setNewPassword("");
    setRequestId("");
  };
  const saveUser = () => {
    if (dataMode !== "convex") return;
    setStatus("loading");
    const action = userForm._id
      ? repo.adminUpdateUserAsync({ sessionToken, user: userForm })
      : repo.adminCreateUserAsync({ sessionToken, user: userForm });
    action
      .then(() => {
        setStatus("idle");
        onPasswordReset?.();
      })
      .catch((error) => {
        setStatus("idle");
        onError?.(error);
      });
  };
  const setUserStatus = (user, nextStatus) => {
    if (dataMode !== "convex" || !user?._id) return;
    setStatus("loading");
    repo.adminSetUserStatusAsync({ sessionToken, userId: user._id, status: nextStatus })
      .then(() => {
        setStatus("idle");
        onPasswordReset?.();
      })
      .catch((error) => {
        setStatus("idle");
        onError?.(error);
      });
  };
  const resetPassword = () => {
    if (dataMode !== "convex" || !selectedUser?._id) return;
    setStatus("loading");
    repo.adminResetPasswordAsync({ sessionToken, userId: selectedUser._id, newPassword, requestId: requestId || undefined })
      .then(() => {
        setStatus("idle");
        setNewPassword("");
        setRequestId("");
        onPasswordReset?.();
      })
      .catch((error) => {
        setStatus("idle");
        onError?.(error);
      });
  };
  const createMissingOfficeUsers = () => {
    if (dataMode !== "convex") return;
    setBatchStatus("loading");
    repo.adminCreateOfficeUsersAsync({ sessionToken, password: officePassword })
      .then((result) => {
        setBatchStatus("idle");
        onPasswordReset?.(`${result.created?.length || 0} office account(s) created.`);
      })
      .catch((error) => {
        setBatchStatus("idle");
        onError?.(error);
      });
  };
  const officeOptions = [...new Set([...offices, ...users.map((user) => user.office)].filter(Boolean))];
  const roleOptions = ["Admin", "Planning Officer", "Program Officer", "Management", "Read-only Viewer"];
  const statusOptions = ["Active", "Inactive"];
  return (
    <Panel title="User Account Management" icon={Users} action={<button className="ghost" onClick={startNewUser}><Plus size={16} /> Add user</button>}>
      <div className="user-admin-grid">
        <div className="user-editor-card">
          <h4>{userForm._id ? "Edit user account" : "Add user account"}</h4>
          <label className="field">
            <span>Full name / account name</span>
            <input value={userForm.name} onChange={(event) => updateUserForm("name", event.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={userForm.email || ""} onChange={(event) => updateUserForm("email", event.target.value)} />
          </label>
          <label className="field">
            <span>Office</span>
            <input list="office-options" value={userForm.office || ""} onChange={(event) => updateUserForm("office", event.target.value)} />
            <datalist id="office-options">
              {[...new Set([...officeOptions, "Corn Program", "Livestock Program", "HVCDP", "FMRDP", "Organic Agriculture Program", "Rice Program", "PMED", "Budget Division", "ORD"])].map((office) => <option key={office} value={office} />)}
            </datalist>
          </label>
          <label className="field">
            <span>Role</span>
            <select value={userForm.role} onChange={(event) => updateUserForm("role", event.target.value)}>
              {roleOptions.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={userForm.status || "Active"} onChange={(event) => updateUserForm("status", event.target.value)}>
              {statusOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          {!userForm._id && (
            <label className="field">
              <span>Initial password</span>
              <input type="password" value={userForm.password || ""} onChange={(event) => updateUserForm("password", event.target.value)} />
            </label>
          )}
          <button className="primary" disabled={dataMode !== "convex" || status === "loading" || !userForm.name || !userForm.role || (!userForm._id && String(userForm.password || "").length < 8)} onClick={saveUser}>
            {status === "loading" ? "Saving..." : userForm._id ? "Save user changes" : "Create user"}
          </button>
          <div className="office-batch-card">
            <h4>Create missing office accounts</h4>
            <p className="body-copy">Creates one account for each office without an account. Program offices become Program Officer accounts.</p>
            <label className="field">
              <span>Initial password for new office accounts</span>
              <input type="password" value={officePassword} onChange={(event) => setOfficePassword(event.target.value)} />
            </label>
            <button className="ghost" disabled={dataMode !== "convex" || batchStatus === "loading" || officePassword.length < 8} onClick={createMissingOfficeUsers}>
              {batchStatus === "loading" ? "Creating..." : "Create missing office accounts"}
            </button>
          </div>
        </div>
        <DataTable
          rows={users.map((u) => ({ id: u._id || u.name, ...u, status: u.status || "Active" }))}
          onRowClick={(row) => setSelectedUserId(row._id)}
          selectedId={selectedUserId}
          columns={[["name", "Name"], ["role", "Role"], ["office", "Office"], ["status", "Status"], ["actions", "Actions"]]}
          formatters={{
            status: (value) => <StatusBadge value={value} />,
            actions: (_value, row) => (
              <div className="table-actions">
                <button className="ghost" onClick={(event) => { event.stopPropagation(); setSelectedUserId(row._id); }}>Edit</button>
                {row.status === "Active" ? (
                  <button className="ghost danger" onClick={(event) => { event.stopPropagation(); setUserStatus(row, "Inactive"); }}>Deactivate</button>
                ) : (
                  <button className="ghost" onClick={(event) => { event.stopPropagation(); setUserStatus(row, "Active"); }}>Reactivate</button>
                )}
              </div>
            ),
          }}
        />
      </div>

      <div className="admin-password-grid">
        <div className="password-form admin-reset-form">
          <h4>Reset password</h4>
          <label className="field">
            <span>User account</span>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
              {users.map((user) => (
                <option key={user._id || user.name} value={user._id}>{user.name} - {user.office || "No office"} - {user.role}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>New temporary password</span>
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Minimum 8 characters" autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Related forgot-password request</span>
            <select value={requestId} onChange={(event) => setRequestId(event.target.value)}>
              <option value="">No request selected</option>
              {openRequests.map((request) => (
                <option key={request._id} value={request._id}>{request.name} - {formatDateTime(request.requestedAt)}</option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={dataMode !== "convex" || status === "loading" || !selectedUser?._id || newPassword.length < 8} onClick={resetPassword}>
            {status === "loading" ? "Resetting..." : "Reset selected password"}
          </button>
        </div>
        <div className="reset-request-block">
          <h4>Forgot-password requests</h4>
          <DataTable
            rows={resetRequests.map((request) => ({
              id: request._id,
              name: request.name,
              office: request.office,
              status: request.status,
              requestedAt: formatDateTime(request.requestedAt),
              resolvedBy: request.resolvedBy || "",
              note: request.note || "",
            }))}
            columns={[["name", "User"], ["office", "Office"], ["status", "Status"], ["requestedAt", "Requested"], ["resolvedBy", "Resolved by"], ["note", "Note"]]}
            formatters={{ status: (value) => <StatusBadge value={value} /> }}
          />
        </div>
      </div>
    </Panel>
  );
}

function Validation({ data, validationResults, onEdit }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [issueFilter, setIssueFilter] = useState("All");
  const rows = useMemo(() => validationResults.map((result) => {
    const proposal = data.proposals.find((row) => row.id === result.proposalId) || {};
    const computedStatus = result.issues.length ? "Needs Correction" : "Validated";
    return {
      ...result,
      proposal,
      status: proposal.validationStatus || computedStatus,
      computedStatus,
      interventionType: proposal.interventionType || "",
      office: proposal.office || "",
      municipality: proposal.municipality || "",
      province: proposal.province || "",
      program: proposal.program || "",
      tier: proposal.tier || "",
      issueCount: result.issues.length,
      issueCodes: result.issues.map((issue) => issue.code),
      issueGroups: [...new Set(result.issues.map((issue) => issueGroup(issue.code)))],
    };
  }), [data.proposals, validationResults]);
  const issueOptions = useMemo(() => {
    const groups = [...new Set(rows.flatMap((row) => row.issueGroups))].sort();
    return ["All", "No issues", ...groups];
  }, [rows]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const statusMatches = statusFilter === "All" || row.status === statusFilter || row.computedStatus === statusFilter;
      const issueMatches = issueFilter === "All" || (issueFilter === "No issues" ? row.issueCount === 0 : row.issueGroups.includes(issueFilter));
      const textMatches = !needle || [
        row.proposalId,
        row.title,
        row.interventionType,
        row.office,
        row.program,
        row.municipality,
        row.province,
        row.tier,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
      return statusMatches && issueMatches && textMatches;
    }).sort((a, b) => b.issueCount - a.issueCount || a.proposalId.localeCompare(b.proposalId));
  }, [issueFilter, query, rows, statusFilter]);
  const summary = useMemo(() => ({
    all: rows.length,
    needsCorrection: rows.filter((row) => row.computedStatus === "Needs Correction").length,
    validated: rows.filter((row) => row.computedStatus === "Validated").length,
    issues: rows.reduce((sum, row) => sum + row.issueCount, 0),
  }), [rows]);

  return (
    <section className="content-stack">
      <Panel title="Validation Engine" icon={ShieldCheck}>
        <div className="validation-summary">
          <button type="button" className="validation-count" onClick={() => { setStatusFilter("All"); setIssueFilter("All"); }}>
            <span>Total records</span>
            <strong>{summary.all}</strong>
          </button>
          <button type="button" className="validation-count warn" onClick={() => setStatusFilter("Needs Correction")}>
            <span>Needs correction</span>
            <strong>{summary.needsCorrection}</strong>
          </button>
          <button type="button" className="validation-count good" onClick={() => setStatusFilter("Validated")}>
            <span>Validated</span>
            <strong>{summary.validated}</strong>
          </button>
          <button type="button" className="validation-count warn" onClick={() => setIssueFilter("All")}>
            <span>Total issues</span>
            <strong>{summary.issues}</strong>
          </button>
        </div>
        <div className="validation-toolbar">
          <label className="field compact validation-search">
            <span>Search records</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, intervention, program, office, municipality" />
          </label>
          <SelectFilter label="Status" value={statusFilter} options={["All", "Draft", "Needs Correction", "Validated", "Approved"]} onChange={setStatusFilter} />
          <SelectFilter label="Issue type" value={issueFilter} options={issueOptions} onChange={setIssueFilter} />
        </div>
        <div className="validation-list">
          {filteredRows.map((row) => (
            <button key={row.proposalId} type="button" className="validation-row validation-link" onClick={() => onEdit?.(row.proposalId)}>
              <div className="validation-row-header">
                <div>
                  <strong>{row.title}</strong>
                  <span>{row.proposalId} · {row.interventionType || "No intervention"} · {row.municipality || "No municipality"}</span>
                </div>
                <div className="validation-tags">
                  <StatusBadge value={row.status} />
                  <span className={`issue-count ${row.issueCount ? "warn" : "good"}`}>{row.issueCount ? `${row.issueCount} issue${row.issueCount === 1 ? "" : "s"}` : "No issues"}</span>
                </div>
              </div>
              <IssueList issues={row.issues} />
            </button>
          ))}
          {!filteredRows.length && <p className="body-copy">No validation records match the current search and filters.</p>}
        </div>
      </Panel>
    </section>
  );
}

function issueGroup(code) {
  if (code.startsWith("missing_")) return "Missing required fields";
  if (code.startsWith("target_unit_")) return "Target unit";
  if (code.startsWith("indicator_unit_")) return "Indicator-unit mismatch";
  if (code.startsWith("budget_expense_")) return "Budget expense class";
  if (code === "duplicate_activity") return "Duplicate activity";
  if (code === "invalid_municipality_district") return "Municipality-district mapping";
  if (code === "tier2_readiness") return "Tier 2 readiness";
  if (code === "climate_rationale") return "Climate rationale";
  return "Other validation issue";
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

function PhaseTracking({ data, access, proposal, onAdvance }) {
  const history = data.phaseHistory.filter((row) => row.proposalId === proposal?.id);
  const nextPhase = nextLifecyclePhase(proposal?.phase || "Proposal");
  const issues = proposal ? validateProposal(proposal, data).issues : [];
  const qualifies = proposal && !issues.length && ["Validated", "Approved"].includes(proposal.validationStatus || "");
  return (
    <section className="content-stack">
      <Panel title="Phase Qualification" icon={ShieldCheck}>
        {proposal ? (
          <div className="phase-action">
            <div>
              <strong>{proposal.id} is in {proposal.phase || "Proposal"}</strong>
              <p className="body-copy">
                {qualifies ? "This PAP has no blocking validation issues and can qualify for the next lifecycle phase." : "This PAP still needs validation before it can qualify for the next lifecycle phase."}
              </p>
            </div>
            <div className="phase-action-buttons">
              <StatusBadge value={proposal.validationStatus || "Draft"} />
              {nextPhase && access.canAdvance && (
                <button className="primary" disabled={!qualifies} onClick={() => onAdvance({ proposal, toPhase: nextPhase, remarks: `Qualified for ${nextPhase}.` })}>
                  <CheckCircle2 size={16} /> Move to {nextPhase}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="body-copy">Select a PAP record to review its lifecycle qualification.</p>
        )}
      </Panel>
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
          {["Proposal vs NEP", "NEP vs GAA", "GAA vs Implementation", "Implementation vs Monitoring and Evaluation"].map((label) => (
            <ComparisonCard key={label} label={label} history={history} />
          ))}
        </div>
      </Panel>
    </section>
  );
}

function nextLifecyclePhase(phase) {
  const index = lifecyclePhases.indexOf(phase);
  if (index < 0) return lifecyclePhases[0];
  return lifecyclePhases[index + 1] || "";
}

function phaseAmount(proposal, phase) {
  if (phase === "NEP") return Number(proposal.nepAmount || proposal.budgetAmount || 0);
  if (["GAA", "Implementation", "Monitoring and Evaluation"].includes(phase)) return Number(proposal.gaaAmount || proposal.nepAmount || proposal.budgetAmount || 0);
  return Number(proposal.budgetAmount || 0);
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

function DataTable({ rows, columns, formatters = {}, onRowClick, onRowDoubleClick, selectedId }) {
  const [sort, setSort] = useState({ key: columns[0]?.[0] || "", direction: "asc" });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [rows, pageSize, sort.key, sort.direction]);
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((a, b) => compareValues(a?.[sort.key], b?.[sort.key], sort.direction));
  }, [rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const toggleSort = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <>
      <div className="table-toolbar">
        <span>{sortedRows.length.toLocaleString()} records</span>
        <label>
          Rows
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {[5, 10, 15, 20].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="pager">
          <button className="ghost" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
          <span>Page {safePage + 1} of {pageCount}</span>
          <button className="ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map(([key, label]) => (
              <th key={label}>
                <button className="sort-button" onClick={() => toggleSort(key)}>
                  {label}
                  <span>{sort.key === key ? (sort.direction === "asc" ? "A-Z" : "Z-A") : "Sort"}</span>
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr
                key={row.id || row.label || `${safePage}-${index}`}
                onClick={() => onRowClick?.(row)}
                onDoubleClick={() => onRowDoubleClick?.(row)}
                className={selectedId === row.id ? "selected" : ""}
              >
                {columns.map(([key]) => <td key={key}>{formatters[key] ? formatters[key](row[key], row) : row[key]}</td>)}
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td colSpan={columns.length}>No records to show.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function compareValues(a, b, direction) {
  const multiplier = direction === "asc" ? 1 : -1;
  const left = normalizeSortValue(a);
  const right = normalizeSortValue(b);
  if (typeof left === "number" && typeof right === "number") return (left - right) * multiplier;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
}

function normalizeSortValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return value.label || value.name || value.id || JSON.stringify(value);
  const numeric = Number(String(value).replace(/[,\s]/g, ""));
  return Number.isFinite(numeric) && String(value).match(/\d/) ? numeric : String(value);
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
