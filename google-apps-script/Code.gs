const SPREADSHEET_ID = 'PUT_PRODUCTION_SPREADSHEET_ID_HERE';
const DRIVE_ROOT_FOLDER_ID = 'PUT_PLAN_BUDGET_HUB_ROOT_FOLDER_ID_HERE';

function spreadsheet_() {
  return SpreadsheetApp.openById(extractId_(SPREADSHEET_ID));
}

function driveRootFolder_() {
  return DriveApp.getFolderById(extractId_(DRIVE_ROOT_FOLDER_ID));
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    const data = dispatch_(request.action, request.payload || {});
    return json_({ ok: true, data });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function dispatch_(action, payload) {
  if (action === 'loadAll') return loadAll_();
  if (action === 'upsertProposal') return upsertProposal_(payload);
  if (action === 'registerBulkSubmission') return registerBulkSubmission_(payload);
  if (action === 'processBulkSubmission') return processBulkSubmission_(payload);
  if (action === 'createProposalFolder') return createProposalFolder_(payload);
  if (action === 'appendAuditLog') return appendRow_('audit_logs', payload);
  throw new Error('Unknown action: ' + action);
}

function loadAll_() {
  return {
    proposals: readObjects_('proposals'),
    budgetLines: readObjects_('budget_lines'),
    physicalTargets: readObjects_('physical_targets'),
    phaseHistory: readObjects_('phase_history'),
    attachments: readObjects_('attachments'),
    bulkSubmissions: readObjects_('bulk_submissions'),
    bulkSubmissionRows: readObjects_('bulk_submission_rows'),
    users: readObjects_('users'),
    masterData: {
      offices: readObjects_('offices'),
      municipalities: readObjects_('municipalities'),
      districts: readObjects_('districts'),
      programs: readObjects_('programs'),
      paps: readObjects_('paps'),
      commodities: readObjects_('commodities'),
      interventionTypes: readObjects_('intervention_types'),
      indicators: readObjects_('indicators'),
      objectCodes: readObjects_('object_codes'),
      expenseClasses: readObjects_('expense_classes'),
      climateTags: readObjects_('climate_tags'),
      gedsiTags: readObjects_('gedsi_tags')
    },
    templates: readObjects_('form_templates'),
    bulkTemplates: readObjects_('bulk_import_templates')
  };
}

function upsertProposal_(proposal) {
  upsertById_('proposals', proposal);
  appendRow_('audit_logs', {
    id: Utilities.getUuid(),
    actor: proposal.updated_by,
    role: proposal.updated_by_role || '',
    action: 'upsertProposal',
    entity_type: 'proposal',
    entity_id: proposal.id,
    before_json: '',
    after_json: JSON.stringify(proposal),
    timestamp: new Date().toISOString()
  });
  return proposal;
}

function registerBulkSubmission_(payload) {
  const folderInfo = createBulkFolder_(payload);
  const row = Object.assign({}, payload, {
    id: payload.id || Utilities.getUuid(),
    drive_folder_url: folderInfo.url,
    status: 'Preflight Review',
    submitted_at: payload.submitted_at || new Date().toISOString()
  });
  appendRow_('bulk_submissions', row);
  appendRow_('audit_logs', {
    id: Utilities.getUuid(),
    actor: row.submitted_by,
    role: '',
    action: 'registerBulkSubmission',
    entity_type: 'bulk_submission',
    entity_id: row.id,
    before_json: '',
    after_json: JSON.stringify(row),
    timestamp: new Date().toISOString()
  });
  return row;
}

function processBulkSubmission_(payload) {
  const submission = findById_('bulk_submissions', payload.id);
  if (!submission) throw new Error('Bulk submission not found: ' + payload.id);
  const convertedSheetId = extractId_(submission.converted_sheet_id);
  if (!convertedSheetId) {
    throw new Error('converted_sheet_id is required. Upload Excel to Drive and convert it to Google Sheets before extraction.');
  }

  const template = findByCode_('bulk_import_templates', submission.template_code);
  if (!template) throw new Error('Bulk import template not found: ' + submission.template_code);

  const expectedSheets = splitList_(template.expectedSheets || template.expected_sheets);
  const requiredColumns = splitList_(template.requiredColumns || template.required_columns);
  const source = SpreadsheetApp.openById(convertedSheetId);
  let stagedCount = 0;

  expectedSheets.forEach(function(sheetName) {
    const sheet = source.getSheetByName(sheetName);
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRow_(values, requiredColumns);
    if (headerRowIndex < 0) {
      appendBulkIssue_(submission.id, '', sheetName, 'missing_required_columns', 'Missing required columns: ' + requiredColumns.join(', '));
      return;
    }

    const headers = buildHeaders_(values, headerRowIndex);
    values.slice(headerRowIndex + 1).forEach(function(row, offset) {
      if (!row.some(Boolean)) return;
      const raw = {};
      headers.forEach(function(header, index) {
        raw[header] = row[index];
      });
      appendRow_('bulk_submission_rows', {
        id: Utilities.getUuid(),
        bulk_submission_id: submission.id,
        source_sheet: sheetName,
        source_row_number: headerRowIndex + offset + 2,
        raw_json: JSON.stringify(raw),
        mapped_proposal_id: '',
        validation_status: 'Preflight Review',
        validation_notes: validateBulkRawRow_(raw).join('; '),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: submission.submitted_by,
        updated_by: submission.submitted_by
      });
      stagedCount++;
    });
  });

  updateStatus_('bulk_submissions', submission.id, stagedCount ? 'Staged for Review' : 'Needs Correction');
  return { stagedCount: stagedCount };
}

function createProposalFolder_(payload) {
  const root = driveRootFolder_();
  const fy = getOrCreateFolder_(root, 'FY ' + payload.fiscal_year);
  const program = getOrCreateFolder_(fy, payload.program);
  const proposal = getOrCreateFolder_(program, payload.proposal_id);
  return { folderId: proposal.getId(), url: proposal.getUrl() };
}

function createBulkFolder_(payload) {
  const root = driveRootFolder_();
  const bulkRoot = getOrCreateFolder_(root, '01 Bulk Submissions');
  const year = payload.fiscalYear || payload.fiscal_year || 'Unspecified FY';
  const fy = getOrCreateFolder_(bulkRoot, 'FY ' + year);
  const program = getOrCreateFolder_(fy, payload.program || 'Unspecified Program');
  return { folderId: program.getId(), url: program.getUrl() };
}

function readObjects_(sheetName) {
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (!sheet) return [];
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return [];
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values.shift().map(String).map(function(header) {
    return header.trim();
  });
  if (!headers.some(Boolean)) return [];
  return values.filter(function(row) {
    return row.some(Boolean);
  }).map(function(row) {
    const item = {};
    headers.forEach(function(header, index) {
      item[header] = row[index];
    });
    return item;
  });
}

function appendRow_(sheetName, object) {
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet tab: ' + sheetName);
  const headers = ensureHeaders_(sheet, object);
  sheet.appendRow(headers.map(function(header) {
    return object[header] || '';
  }));
  return object;
}

function upsertById_(sheetName, object) {
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet tab: ' + sheetName);
  const headers = ensureHeaders_(sheet, object);
  const values = sheet.getDataRange().getValues();
  const idCol = headers.indexOf('id');
  if (idCol < 0) throw new Error('Missing id header in sheet tab: ' + sheetName);
  const rowIndex = values.findIndex(function(row, index) {
    return index > 0 && row[idCol] === object.id;
  });
  const row = headers.map(function(header) {
    return object[header] || object[toCamel_(header)] || '';
  });
  if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([row]);
  else sheet.appendRow(row);
}

function findById_(sheetName, id) {
  return readObjects_(sheetName).find(function(row) {
    return row.id === id;
  });
}

function findByCode_(sheetName, code) {
  return readObjects_(sheetName).find(function(row) {
    return row.code === code;
  });
}

function splitList_(value) {
  return String(value || '').split(';').map(function(item) {
    return item.trim();
  }).filter(Boolean);
}

function findHeaderRow_(values, requiredColumns) {
  for (let i = 0; i < Math.min(values.length, 40); i++) {
    const headers = values[i].map(String);
    const matches = requiredColumns.filter(function(required) {
      return headers.indexOf(required) >= 0;
    });
    if (matches.length >= Math.min(2, requiredColumns.length)) return i;
  }
  return -1;
}

function buildHeaders_(values, headerRowIndex) {
  const primary = values[headerRowIndex].map(function(value) {
    return String(value || '').trim();
  });
  const secondary = values[headerRowIndex + 1] ? values[headerRowIndex + 1].map(function(value) {
    return String(value || '').trim();
  }) : [];
  let currentGroup = '';
  return primary.map(function(header, index) {
    const sub = secondary[index] || '';
    if (header) currentGroup = header;
    const base = header || currentGroup || ('Column ' + (index + 1));
    if (sub && sub !== base && sub.indexOf('(') !== 0) return base + ' - ' + sub;
    return base;
  });
}

function validateBulkRawRow_(raw) {
  const issues = [];
  if (!Object.values(raw).some(Boolean)) issues.push('Blank row');
  return issues;
}

function appendBulkIssue_(submissionId, rowId, sourceSheet, ruleCode, message) {
  appendRow_('validation_issues', {
    id: Utilities.getUuid(),
    proposal_id: '',
    bulk_submission_id: submissionId,
    bulk_submission_row_id: rowId,
    rule_code: ruleCode,
    severity: 'Error',
    message: sourceSheet ? sourceSheet + ': ' + message : message,
    status: 'Open',
    resolved_at: '',
    resolved_by: '',
    created_at: new Date().toISOString()
  });
}

function updateStatus_(sheetName, id, status) {
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const updatedCol = headers.indexOf('updated_at');
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      if (statusCol >= 0) sheet.getRange(i + 1, statusCol + 1).setValue(status);
      if (updatedCol >= 0) sheet.getRange(i + 1, updatedCol + 1).setValue(new Date().toISOString());
      return;
    }
  }
}

function ensureHeaders_(sheet, object) {
  const lastColumn = sheet.getLastColumn();
  let headers = [];
  if (lastColumn > 0) {
    headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
      return String(header || '').trim();
    }).filter(Boolean);
  }
  if (!headers.length) {
    headers = defaultHeaders_(sheet.getName(), object);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return headers;
}

function defaultHeaders_(sheetName, object) {
  const defaults = {
    proposals: ['id', 'fiscal_year', 'title', 'description', 'office', 'program', 'subprogram', 'pap', 'uacs', 'province', 'municipality', 'district', 'commodity', 'intervention_type', 'beneficiary_group', 'beneficiaries', 'budget_amount', 'nep_amount', 'gaa_amount', 'tier', 'source', 'justification', 'expected_output', 'expected_outcome', 'readiness_status', 'climate_tag', 'climate_rationale', 'gedsi_tag', 'schedule', 'remarks', 'validation_status', 'current_phase', 'created_at', 'updated_at', 'created_by', 'updated_by'],
    bulk_submissions: ['id', 'fiscal_year', 'program', 'office', 'template_code', 'phase', 'source_file', 'drive_file_id', 'converted_sheet_id', 'drive_folder_url', 'status', 'submitted_at', 'submitted_by', 'remarks', 'created_at', 'updated_at', 'created_by', 'updated_by'],
    bulk_submission_rows: ['id', 'bulk_submission_id', 'source_sheet', 'source_row_number', 'raw_json', 'mapped_proposal_id', 'validation_status', 'validation_notes', 'created_at', 'updated_at', 'created_by', 'updated_by'],
    validation_issues: ['id', 'proposal_id', 'bulk_submission_id', 'bulk_submission_row_id', 'rule_code', 'severity', 'message', 'status', 'resolved_at', 'resolved_by', 'created_at', 'updated_at', 'created_by', 'updated_by'],
    audit_logs: ['id', 'actor', 'role', 'action', 'entity_type', 'entity_id', 'before_json', 'after_json', 'timestamp']
  };
  return defaults[sheetName] || Object.keys(object);
}

function getOrCreateFolder_(parent, name) {
  const existing = parent.getFoldersByName(String(name));
  return existing.hasNext() ? existing.next() : parent.createFolder(String(name));
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function extractId_(value) {
  const text = String(value || '').trim();
  const match = text.match(/[-\w]{25,}/);
  return match ? match[0] : text;
}

function toCamel_(value) {
  return String(value).replace(/_([a-z])/g, function(match, letter) {
    return letter.toUpperCase();
  });
}
