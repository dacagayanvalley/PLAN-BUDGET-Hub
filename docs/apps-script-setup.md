# Google Apps Script / Google Sheets Setup Guide

## Spreadsheet tabs

Create a Google Spreadsheet named `PLAN-BUDGET Hub Database` with tabs matching `docs/data-dictionary.md`.

Recommended tabs:

`proposals`, `budget_lines`, `physical_targets`, `phase_history`, `attachments`, `bulk_submissions`, `bulk_submission_rows`, `validation_issues`, `audit_logs`, `users`, `offices`, `municipalities`, `districts`, `programs`, `paps`, `commodities`, `intervention_types`, `indicators`, `object_codes`, `expense_classes`, `climate_tags`, `gedsi_tags`, `form_templates`, `bulk_import_templates`.

## Drive repository

Create a root Drive folder named `PLAN-BUDGET Hub Repository`.

Folder convention:

`FY {fiscal_year} / {program} / {proposal_id}`

Document categories:

Readiness documents, consultation minutes, endorsements, photos, geotagged evidence, procurement documents, accomplishment MOVs, DED, POW, and generated reports.

## Apps Script web app contract

Deploy Apps Script as a web app and allow access to office users. The React app expects JSON actions through `POST`.

```javascript
const SPREADSHEET_ID = 'PUT_SPREADSHEET_ID_HERE';
const DRIVE_ROOT_FOLDER_ID = 'PUT_DRIVE_FOLDER_ID_HERE';

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const data = dispatch_(request.action, request.payload || {});
    return json_({ ok: true, data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
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
    action: 'upsertProposal',
    entity_type: 'proposal',
    entity_id: proposal.id,
    after_json: JSON.stringify(proposal),
    timestamp: new Date().toISOString()
  });
  return proposal;
}

function createProposalFolder_(payload) {
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const fy = getOrCreateFolder_(root, 'FY ' + payload.fiscal_year);
  const program = getOrCreateFolder_(fy, payload.program);
  const proposal = getOrCreateFolder_(program, payload.proposal_id);
  return { folderId: proposal.getId(), url: proposal.getUrl() };
}

function registerBulkSubmission_(payload) {
  const folderInfo = createBulkFolder_(payload);
  const row = Object.assign({}, payload, {
    id: payload.id || Utilities.getUuid(),
    drive_folder_url: folderInfo.url,
    status: 'Preflight Review',
    submitted_at: new Date().toISOString()
  });
  appendRow_('bulk_submissions', row);
  appendRow_('audit_logs', {
    id: Utilities.getUuid(),
    actor: payload.submitted_by,
    action: 'registerBulkSubmission',
    entity_type: 'bulk_submission',
    entity_id: row.id,
    after_json: JSON.stringify(row),
    timestamp: new Date().toISOString()
  });
  return row;
}

function processBulkSubmission_(payload) {
  const submission = findById_('bulk_submissions', payload.id);
  if (!submission) throw new Error('Bulk submission not found: ' + payload.id);
  if (!submission.converted_sheet_id) {
    throw new Error('converted_sheet_id is required. Upload Excel to Drive and convert it to Google Sheets before extraction.');
  }
  const template = findByCode_('bulk_import_templates', submission.template_code);
  if (!template) throw new Error('Bulk import template not found: ' + submission.template_code);

  const expectedSheets = splitList_(template.expectedSheets || template.expected_sheets);
  const requiredColumns = splitList_(template.requiredColumns || template.required_columns);
  const source = SpreadsheetApp.openById(submission.converted_sheet_id);
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
    const headers = values[headerRowIndex].map(String);
    values.slice(headerRowIndex + 1).forEach(function(row, offset) {
      if (!row.some(Boolean)) return;
      const raw = {};
      headers.forEach(function(header, index) { raw[header] = row[index]; });
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

function createBulkFolder_(payload) {
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const fy = getOrCreateFolder_(root, 'FY ' + payload.fiscal_year);
  const bulk = getOrCreateFolder_(fy, 'Bulk Submissions');
  const program = getOrCreateFolder_(bulk, payload.program);
  return { folderId: program.getId(), url: program.getUrl() };
}

function readObjects_(sheetName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.filter(row => row.some(Boolean)).map(row => {
    const item = {};
    headers.forEach((header, index) => item[header] = row[index]);
    return item;
  });
}

function findById_(sheetName, id) {
  return readObjects_(sheetName).find(function(row) { return row.id === id; });
}

function findByCode_(sheetName, code) {
  return readObjects_(sheetName).find(function(row) { return row.code === code; });
}

function splitList_(value) {
  return String(value || '').split(';').map(function(item) { return item.trim(); }).filter(Boolean);
}

function findHeaderRow_(values, requiredColumns) {
  for (var i = 0; i < Math.min(values.length, 40); i++) {
    var headers = values[i].map(String);
    var matches = requiredColumns.filter(function(required) { return headers.indexOf(required) >= 0; });
    if (matches.length >= Math.min(2, requiredColumns.length)) return i;
  }
  return -1;
}

function validateBulkRawRow_(raw) {
  var issues = [];
  if (!Object.values(raw).some(Boolean)) issues.push('Blank row');
  return issues;
}

function appendBulkIssue_(submissionId, rowId, sourceSheet, ruleCode, message) {
  appendRow_('validation_issues', {
    id: Utilities.getUuid(),
    bulk_submission_id: submissionId,
    bulk_submission_row_id: rowId,
    rule_code: ruleCode,
    severity: 'Error',
    message: sourceSheet ? sourceSheet + ': ' + message : message,
    status: 'Open',
    created_at: new Date().toISOString()
  });
}

function updateStatus_(sheetName, id, status) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  var statusCol = headers.indexOf('status');
  var updatedCol = headers.indexOf('updated_at');
  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      if (statusCol >= 0) sheet.getRange(i + 1, statusCol + 1).setValue(status);
      if (updatedCol >= 0) sheet.getRange(i + 1, updatedCol + 1).setValue(new Date().toISOString());
      return;
    }
  }
}

function appendRow_(sheetName, object) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(header => object[header] || ''));
  return object;
}

function upsertById_(sheetName, object) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  const rowIndex = values.findIndex((row, index) => index > 0 && row[idCol] === object.id);
  const row = headers.map(header => object[header] || '');
  if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([row]);
  else sheet.appendRow(row);
}

function getOrCreateFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
```

## Security notes

- Use Google Workspace permissions on the Sheet and Drive root folder.
- Require Apps Script execution as the accessing user when possible.
- Log every write operation in `audit_logs`.
- Keep report templates in Drive and register them in `form_templates` rather than hard-coding annual formats.
