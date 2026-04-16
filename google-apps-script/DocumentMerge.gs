var CONFIG_PREFIX = 'dm:config:';
var REGISTRY_KEY = 'dm:registry';
var TRIGGER_MAP_KEY = 'dm:trigger-map';
var LOG_SHEET_NAME = '_DocumentMergeLog';
var QUEUE_SHEET_NAME = '_DocumentMergeQueue';
var EMAIL_DRAFT_SHEET_NAME = '_DocumentMergeDraft';
var EMAIL_DRAFT_CHUNK_SIZE = 40000;

function onOpen() {
  var ui = getSpreadsheetUiOrNull_();

  if (!ui) {
    return;
  }

  ui.createMenu('Document Merge')
    .addItem('Open sidebar', 'showSidebar')
    .addSeparator()
    .addItem('Run for selected row', 'runForSelectedRowFromMenu')
    .addItem('Run latest unprocessed row', 'runLatestRowFromMenu')
    .addItem('Run all rows', 'runAllRowsFromMenu')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Document Merge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleDocumentMergeWebhook_(e) {
  var payload = parseWebhookPayload_(e);
  var action = String(payload && payload.action || '').trim();
  var spreadsheetId = String(payload && payload.spreadsheetId || '').trim();
  var rowNumber = Number(payload && payload.rowNumber);
  var result;

  Logger.log('Webhook doPost payload: %s', JSON.stringify({
    action: action,
    spreadsheetId: spreadsheetId,
    rowNumber: rowNumber,
    sheetName: payload && payload.sheetName,
    formType: payload && payload.formType,
    questionCount: Array.isArray(payload && payload.questionOrder) ? payload.questionOrder.length : 0
  }));

  if (action && action !== 'processSubmission') {
    return outputJson({
      ok: false,
      error: 'Unsupported webhook action.'
    });
  }

  if (!spreadsheetId) {
    return outputJson({
      ok: false,
      error: 'Missing spreadsheetId.'
    });
  }

  if (rowNumber && rowNumber >= 2) {
    try {
      result = processRowByNumber_(spreadsheetId, rowNumber, {
        triggerType: 'WEBHOOK',
        force: false,
      });

      Logger.log('Webhook row-number processing succeeded: %s', JSON.stringify({
        mode: 'row',
        rowNumber: rowNumber,
        result: result
      }));

      return outputJson({
        ok: true,
        mode: 'row',
        result: result,
      });
    } catch (error) {
      // Fall back to the direct payload route below.
    }
  }

  try {
    result = processWebhookSubmission_(spreadsheetId, payload);
    Logger.log('Webhook payload processing succeeded: %s', JSON.stringify({
      mode: 'payload',
      result: result
    }));
    return outputJson({
      ok: true,
      mode: 'payload',
      result: result,
    });
  } catch (error) {
    Logger.log('Webhook processing failed: %s', String((error && error.message) || error));
    return outputJson({
      ok: false,
      error: String((error && error.message) || error),
    });
  }
}

function parseWebhookPayload_(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (error) {
    // fall through to parameter parsing
  }

  return Object.assign({}, (e && e.parameter) || {});
}

function processWebhookSubmission_(spreadsheetId, payload) {
  var config = getWebhookConfig_(spreadsheetId);
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var rowNumber = Number(payload && payload.rowNumber) || 2;
  var row = buildWebhookRow_(payload, rowNumber);
  var processedSet = getProcessedRowSet_(spreadsheet);
  var logKey = getRowLogKey_(config.sheetId, row.rowNumber);
  var result;

  Logger.log('processWebhookSubmission_ using config: %s', JSON.stringify({
    spreadsheetId: config.spreadsheetId,
    sheetId: config.sheetId,
    sheetName: config.sheetName,
    rowNumber: row.rowNumber
  }));

  if (!row.rowNumber || row.rowNumber < 2) {
    row.rowNumber = 2;
  }

  if (processedSet[logKey]) {
    return {
      skipped: true,
      rowNumber: row.rowNumber,
      message: 'This row has already been processed successfully.',
    };
  }

  result = generateAndSendForRow_(config, row, 'WEBHOOK');
  Logger.log('processWebhookSubmission_ generated result: %s', JSON.stringify(result));
  appendLogEntry_(spreadsheet, {
    rowKey: logKey,
    rowNumber: row.rowNumber,
    sheetName: config.sheetName,
    status: 'SUCCESS',
    triggerType: 'WEBHOOK',
    recipient: result.emailTo,
    pdfUrl: result.pdfUrl,
    message: result.pdfName,
  });

  return result;
}

function buildWebhookRow_(payload, rowNumber) {
  var responses = Object.assign({}, payload && payload.responses || {});
  var values = {};
  var normalizedRowNumber = Number(rowNumber) || 2;

  Object.keys(responses).forEach(function(header) {
    values[header] = String(responses[header] || '');
  });

  return {
    rowNumber: normalizedRowNumber,
    identity: String((payload && payload.rowIdentity) || (payload && payload.sheetName) || ('Row ' + normalizedRowNumber)),
    record: String((payload && payload.record) || (payload && payload.sheetName) || ('ROW-' + normalizedRowNumber)),
    values: values,
  };
}

function showSidebar() {
  var ui = getSpreadsheetUiOrNull_();
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Document Merge');

  if (!ui) {
    throw new Error('Open this from a spreadsheet-bound Apps Script project and launch it inside Google Sheets.');
  }

  ui.showSidebar(html);
}

function getSpreadsheetUiOrNull_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (error) {
    return null;
  }
}

function getRequiredSpreadsheetUi_() {
  var ui = getSpreadsheetUiOrNull_();

  if (!ui) {
    throw new Error('This action must be run from inside Google Sheets, not from the Apps Script editor.');
  }

  return ui;
}

function getSidebarState() {
  var spreadsheet = SpreadsheetApp.getActive();
  var sheet = spreadsheet.getActiveSheet();
  var sheetMeta = getSheetSnapshot_(sheet);
  var config = getSavedConfig_(spreadsheet.getId());
  var templateMeta = null;
  var queuedRows = getPendingQueueEntries_(spreadsheet.getId());

  if (config && config.templateUrl) {
    templateMeta = getTemplateMetadata(config.templateUrl);
  }

  return {
    spreadsheet: {
      id: spreadsheet.getId(),
      name: spreadsheet.getName(),
      url: spreadsheet.getUrl(),
      formUrl: spreadsheet.getFormUrl() || '',
      timezone: spreadsheet.getSpreadsheetTimeZone(),
    },
    sheet: sheetMeta,
    template: templateMeta,
    suggestedMappings: templateMeta ? suggestMappings(templateMeta.tags, sheetMeta.headers) : {},
    config: config || getDefaultConfig_(spreadsheet, sheetMeta),
    queuedRows: queuedRows,
  };
}

function inspectTemplate(templateUrl) {
  var spreadsheet = SpreadsheetApp.getActive();
  var sheetMeta = getSheetSnapshot_(spreadsheet.getActiveSheet());
  var templateMeta = getTemplateMetadata(templateUrl);

  return {
    template: templateMeta,
    suggestedMappings: suggestMappings(templateMeta.tags, sheetMeta.headers),
  };
}

function saveConfiguration(payload) {
  var spreadsheet = SpreadsheetApp.getActive();
  var sheet = spreadsheet.getActiveSheet();
  var sheetMeta = getSheetSnapshot_(sheet);
  var templateMeta = getTemplateMetadata(payload.templateUrl);
  var folderMeta = resolveFolderSelection_(payload);
  var existingConfig = getSavedConfig_(spreadsheet.getId()) || {};
  var config = buildConfig_(payload, spreadsheet, sheetMeta, templateMeta, folderMeta);

  if (existingConfig.trigger) {
    config.trigger.lastRunAt = existingConfig.trigger.lastRunAt || config.trigger.lastRunAt || '';
    config.trigger.lastTriggerType = existingConfig.trigger.lastTriggerType || config.trigger.lastTriggerType || '';
  }

  validateConfig_(config, templateMeta.tags, sheetMeta.headers);
  saveConfig_(spreadsheet.getId(), config);
  syncTriggersForConfig_(config);

  return {
    ok: true,
    config: config,
    template: templateMeta,
    message: 'Configuration saved and triggers updated.',
  };
}

function getFolderPickerState(parentId) {
  var currentFolder = getFolderForPicker_(parentId);
  return {
    currentFolder: {
      id: currentFolder.getId(),
      name: currentFolder.getName(),
      url: currentFolder.getUrl(),
    },
    breadcrumbs: buildFolderBreadcrumbs_(currentFolder),
    folders: listChildFolders_(currentFolder),
  };
}

function openEmailEditorDialog(payload) {
  var spreadsheet = SpreadsheetApp.getActive();
  var ui = getRequiredSpreadsheetUi_();
  var draft = {
    spreadsheetId: spreadsheet.getId(),
    html: String(payload && payload.html || ''),
    plain: String(payload && payload.plain || ''),
    updatedAt: new Date().toISOString(),
  };
  var template = HtmlService.createTemplateFromFile('EmailEditor');

  saveEmailDraft_(spreadsheet.getId(), draft);
  template.initialDraftJson = JSON.stringify(draft);

  ui.showModalDialog(
    template.evaluate().setWidth(900).setHeight(720),
    'Email Editor'
  );
}

function saveEmailEditorDraft(payload) {
  var spreadsheetId = SpreadsheetApp.getActive().getId();
  var draft = {
    spreadsheetId: spreadsheetId,
    html: String(payload && payload.html || ''),
    plain: String(payload && payload.plain || ''),
    updatedAt: new Date().toISOString(),
  };

  saveEmailDraft_(spreadsheetId, draft);
  return draft;
}

function getEmailEditorDraft() {
  var spreadsheetId = SpreadsheetApp.getActive().getId();
  return getEmailDraft_(spreadsheetId);
}

function runForActiveRowFromMenu() {
  var ui = getRequiredSpreadsheetUi_();
  var result = runForActiveRow();
  ui.alert('Document Merge', 'PDF created for row ' + result.rowNumber + '.', ui.ButtonSet.OK);
}

function runForSelectedRowFromMenu() {
  var ui = getRequiredSpreadsheetUi_();
  var result = runForSelectedRow();
  ui.alert('Document Merge', 'PDF created for row ' + result.rowNumber + '.', ui.ButtonSet.OK);
}

function runLatestRowFromMenu() {
  var ui = getRequiredSpreadsheetUi_();
  var result = runLatestUnprocessedRow();
  ui.alert('Document Merge', 'PDF created for row ' + result.rowNumber + '.', ui.ButtonSet.OK);
}

function runAllRowsFromMenu() {
  var ui = getRequiredSpreadsheetUi_();
  var results = runAllRows();
  ui.alert('Document Merge', 'Processed ' + results.processedCount + ' row(s).', ui.ButtonSet.OK);
}

function runForActiveRow() {
  var spreadsheet = SpreadsheetApp.getActive();
  var activeRange = spreadsheet.getActiveSheet().getActiveRange();

  if (!activeRange) {
    throw new Error('Select a data row before running the extension.');
  }

  return processRowByNumber_(spreadsheet.getId(), activeRange.getRow(), {
    triggerType: 'MANUAL',
    force: true,
  });
}

function runForSelectedRow() {
  return runForActiveRow();
}

function runLatestUnprocessedRow() {
  var spreadsheet = SpreadsheetApp.getActive();
  var openedSpreadsheet = SpreadsheetApp.openById(spreadsheet.getId());
  var config = getRequiredConfig_(spreadsheet.getId());
  var rows = getSheetRows_(openedSpreadsheet, config.sheetId);
  var processedSet = getProcessedRowSet_(openedSpreadsheet);
  var latest = null;
  var index;

  for (index = rows.length - 1; index >= 0; index -= 1) {
    if (!processedSet[getRowLogKey_(config.sheetId, rows[index].rowNumber)]) {
      latest = rows[index];
      break;
    }
  }

  if (!latest) {
    throw new Error('No unprocessed rows were found.');
  }

  return processRowByNumber_(spreadsheet.getId(), latest.rowNumber, {
    triggerType: 'MANUAL',
    force: true,
  });
}

function runAllRows() {
  var spreadsheet = SpreadsheetApp.getActive();
  var openedSpreadsheet = SpreadsheetApp.openById(spreadsheet.getId());
  var config = getRequiredConfig_(spreadsheet.getId());
  var rows = getSheetRows_(openedSpreadsheet, config.sheetId);
  var results = [];

  rows.forEach(function(row) {
    results.push(processRowByNumber_(spreadsheet.getId(), row.rowNumber, {
      triggerType: 'MANUAL_ALL',
      force: true,
    }));
  });

  return {
    processedCount: results.length,
    results: results,
  };
}

function handleConfiguredFormSubmit_(e) {
  routeTriggeredExecution_(e, 'FORM_SUBMIT');
}

function handleConfiguredTimeTrigger_(e) {
  routeTriggeredExecution_(e, 'TIME');
}

function routeTriggeredExecution_(e, expectedType) {
  var route = getTriggerRoute_(e && e.triggerUid);
  var spreadsheetId = route && route.spreadsheetId;
  var config;
  var rowNumber;
  var spreadsheet;
  var rows;
  var processedSet;
  var index;
  var queueResults;

  if (!spreadsheetId && e && e.source) {
    spreadsheetId = e.source.getId();
  }

  if (!spreadsheetId) {
    throw new Error('The trigger is not linked to a saved spreadsheet configuration.');
  }

  config = getRequiredConfig_(spreadsheetId);
  if (config.trigger.mode !== expectedType) {
    return;
  }

  if (expectedType === 'TIME') {
    touchTriggerRuntime_(spreadsheetId, 'TIME');
    queueResults = processQueuedSubmissionRows_(spreadsheetId);
  }

  if (expectedType === 'FORM_SUBMIT') {
    rowNumber = e && e.range ? e.range.getRow() : null;
    if (!rowNumber) {
      throw new Error('Form submit trigger did not include a row number.');
    }
    processRowByNumber_(spreadsheetId, rowNumber, {
      triggerType: 'FORM_SUBMIT',
      force: false,
    });
    return;
  }

  spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  rows = getSheetRows_(spreadsheet, config.sheetId);
  processedSet = getProcessedRowSet_(spreadsheet);

  for (index = 0; index < rows.length; index += 1) {
    if (!processedSet[getRowLogKey_(config.sheetId, rows[index].rowNumber)]) {
      processRowByNumber_(spreadsheetId, rows[index].rowNumber, {
        triggerType: 'TIME',
        force: false,
      });
    }
  }
}

function processQueuedSubmissionRows_(spreadsheetId) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var queueSheet = spreadsheet.getSheetByName(QUEUE_SHEET_NAME);
  var rows;
  var processedCount = 0;
  var index;

  if (!queueSheet) {
    return {
      processedCount: 0,
      results: [],
    };
  }

  rows = getQueueSheetEntries_(queueSheet, spreadsheetId);

  for (index = 0; index < rows.length; index += 1) {
    try {
      if (rows[index].status !== 'PENDING') {
        continue;
      }

      processRowByNumber_(spreadsheetId, rows[index].rowNumber, {
        triggerType: 'TIME',
        force: false,
      });

      markQueueEntryStatus_(queueSheet, rows[index].rowKey, 'DONE', '');
      processedCount += 1;
    } catch (error) {
      markQueueEntryStatus_(queueSheet, rows[index].rowKey, 'ERROR', String((error && error.message) || error));
    }
  }

  return {
    processedCount: processedCount,
    results: rows,
  };
}

function processRowByNumber_(spreadsheetId, rowNumber, options) {
  var config = getRequiredConfig_(spreadsheetId);
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheetRows = getSheetRows_(spreadsheet, config.sheetId);
  var row = findRowByNumber_(sheetRows, rowNumber);
  var processedSet = getProcessedRowSet_(spreadsheet);
  var logKey = getRowLogKey_(config.sheetId, rowNumber);
  var result;

  options = options || {};

  if (!row) {
    throw new Error('The selected row could not be found in the configured sheet.');
  }

  if (Number(rowNumber) === 1) {
    throw new Error('Select a response row, not the header row.');
  }

  if (!options.force && processedSet[logKey]) {
    return {
      skipped: true,
      rowNumber: rowNumber,
      message: 'This row has already been processed successfully.',
    };
  }

  try {
    result = generateAndSendForRow_(config, row, options.triggerType || 'MANUAL');
    appendLogEntry_(spreadsheet, {
      rowKey: logKey,
      rowNumber: row.rowNumber,
      sheetName: config.sheetName,
      status: 'SUCCESS',
      triggerType: options.triggerType || 'MANUAL',
      recipient: result.emailTo,
      pdfUrl: result.pdfUrl,
      message: result.pdfName,
    });
    return result;
  } catch (error) {
    appendLogEntry_(spreadsheet, {
      rowKey: logKey,
      rowNumber: row.rowNumber,
      sheetName: config.sheetName,
      status: 'ERROR',
      triggerType: options.triggerType || 'MANUAL',
      recipient: '',
      pdfUrl: '',
      message: error.message,
    });
    throw error;
  }
}

function generateAndSendForRow_(config, row, triggerType) {
  var templateFile = DriveApp.getFileById(config.templateId);
  var folder = DriveApp.getFolderById(config.folderId);
  var tempName = buildFileName_(config, row, true);
  var pdfName = buildFileName_(config, row, false) + '.pdf';
  var replacementContext = buildReplacementContext_(config, row);
  var emailTo = renderTemplateString_(config.email.to, replacementContext);
  var emailCc = renderTemplateString_(config.email.cc, replacementContext);
  var emailBcc = renderTemplateString_(config.email.bcc, replacementContext);
  var emailSubject = renderTemplateString_(config.email.subject, replacementContext);
  var emailBody = renderTemplateString_(config.email.body, replacementContext);
  var emailBodyHtml = renderTemplateString_(config.email.bodyHtml || '', replacementContext);
  var plainBody = emailBody || stripHtmlToText_(emailBodyHtml) || 'Please find your generated PDF attached.';
  var preparedEmailBody = prepareEmailHtml_(emailBodyHtml, plainBody);
  var mailPayload;
  var pdfBlob;
  var pdfFile;

  pdfBlob = generatePdfFromTemplate_(config, templateFile, folder, tempName, pdfName, row);
  pdfFile = folder.createFile(pdfBlob);

  if (!String(emailTo || '').trim()) {
    throw new Error('The email recipient resolved to an empty value for row ' + row.rowNumber + '.');
  }

  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('The email quota for this account is exhausted today.');
  }

  emailTo = normalizeEmailList_(emailTo);
  emailCc = normalizeEmailList_(emailCc);
  emailBcc = normalizeEmailList_(emailBcc);

  mailPayload = {
    to: emailTo,
    subject: emailSubject || ('Generated PDF - Row ' + row.rowNumber),
    body: plainBody,
    htmlBody: preparedEmailBody.html,
    attachments: [pdfBlob],
    name: String(config.email.senderName || 'Document Merge'),
  };

  if (Object.keys(preparedEmailBody.inlineImages).length) {
    mailPayload.inlineImages = preparedEmailBody.inlineImages;
  }

  if (emailCc) {
    mailPayload.cc = emailCc;
  }

  if (emailBcc) {
    mailPayload.bcc = emailBcc;
  }

  MailApp.sendEmail(mailPayload);

  return {
    rowNumber: row.rowNumber,
    rowIdentity: row.identity,
    triggerType: triggerType,
    pdfName: pdfFile.getName(),
    pdfId: pdfFile.getId(),
    pdfUrl: pdfFile.getUrl(),
    emailTo: emailTo,
  };
}

function generatePdfFromTemplate_(config, templateFile, folder, tempName, pdfName, row) {
  if (config.templateType === 'SLIDES') {
    return generatePdfFromSlidesTemplate_(config, templateFile, folder, tempName, pdfName, row);
  }

  return generatePdfFromDocTemplate_(config, templateFile, folder, tempName, pdfName, row);
}

function generatePdfFromDocTemplate_(config, templateFile, folder, tempName, pdfName, row) {
  var tempDocFile = templateFile.makeCopy(tempName, folder);
  var tempDoc = DocumentApp.openById(tempDocFile.getId());
  var body = tempDoc.getBody();
  var pdfBlob;

  config.templateTags.forEach(function(tag) {
    var mappedHeader = config.mappings[tag];
    var replacement = mappedHeader ? String(row.values[mappedHeader] || '') : '';
    replaceTagWithContent_(body, tag, replacement);
  });

  tempDoc.saveAndClose();
  pdfBlob = tempDocFile.getAs(MimeType.PDF).setName(pdfName);
  tempDocFile.setTrashed(true);
  return pdfBlob;
}

function generatePdfFromSlidesTemplate_(config, templateFile, folder, tempName, pdfName, row) {
  var tempPresentationFile = templateFile.makeCopy(tempName, folder);
  var presentation = SlidesApp.openById(tempPresentationFile.getId());
  var pdfBlob;

  config.templateTags.forEach(function(tag) {
    var mappedHeader = config.mappings[tag];
    var replacement = mappedHeader ? String(row.values[mappedHeader] || '') : '';
    var imageBlobs = extractImageBlobsFromValue_(replacement);

    if (imageBlobs.length) {
      replaceTagWithSlidesImages_(presentation, tag, imageBlobs);
      replaceSlidesTextTag_(presentation, tag, '');
      return;
    }

    replaceSlidesTextTag_(presentation, tag, replacement);
  });

  presentation.saveAndClose();
  pdfBlob = tempPresentationFile.getAs(MimeType.PDF).setName(pdfName);
  tempPresentationFile.setTrashed(true);
  return pdfBlob;
}

function buildConfig_(payload, spreadsheet, sheetMeta, templateMeta, folderMeta) {
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheetId: sheetMeta.id,
    sheetName: sheetMeta.name,
    sheetHeaders: sheetMeta.headers,
    templateUrl: payload.templateUrl,
    templateId: templateMeta.templateId,
    templateType: templateMeta.templateType,
    templateName: templateMeta.documentName,
    templateTags: templateMeta.tags,
    mappings: payload.mappings || {},
    trigger: {
      mode: payload.triggerMode || 'FORM_SUBMIT',
      scheduleType: payload.scheduleType || 'DAILY',
      hourlyInterval: Number(payload.hourlyInterval || 1),
      dailyHour: Number(payload.dailyHour || 9),
      weeklyDay: payload.weeklyDay || 'MONDAY',
      weeklyHour: Number(payload.weeklyHour || 9),
    },
    email: {
      to: String(payload.emailTo || '').trim(),
      cc: String(payload.emailCc || '').trim(),
      bcc: String(payload.emailBcc || '').trim(),
      senderName: String(payload.senderName || '').trim(),
      subject: String(payload.emailSubject || '').trim(),
      body: String(payload.emailBody || '').trim(),
      bodyHtml: String(payload.emailBodyHtml || '').trim(),
    },
    folderUrl: folderMeta.url,
    folderId: folderMeta.id,
    folderName: folderMeta.name,
    fileNamePattern: String(payload.fileNamePattern || '').trim(),
    updatedAt: new Date().toISOString(),
  };
}

function validateConfig_(config, tags, headers) {
  var missingTags = [];

  if (!config.templateId) {
    throw new Error('Connect a valid Google Docs or Google Slides template.');
  }

  if (!config.folderId) {
    throw new Error('Choose a Google Drive folder for the generated PDFs.');
  }

  if (!config.email.to) {
    throw new Error('Add at least one email recipient.');
  }

  tags.forEach(function(tag) {
    if (!config.mappings[tag]) {
      missingTags.push(tag);
      return;
    }
    if (headers.indexOf(config.mappings[tag]) === -1) {
      throw new Error('The mapped header "' + config.mappings[tag] + '" was not found in the active sheet.');
    }
  });

  if (missingTags.length) {
    throw new Error('Map every template tag before saving. Missing: ' + missingTags.join(', '));
  }
}

function syncTriggersForConfig_(config) {
  var userProps = PropertiesService.getUserProperties();
  var triggerMap = getJsonProperty_(userProps, TRIGGER_MAP_KEY, {});
  var existingIds = [];
  var nextTriggerMap = {};
  var projectTriggers = ScriptApp.getProjectTriggers();
  var index;
  var trigger;

  Object.keys(triggerMap).forEach(function(triggerId) {
    if (triggerMap[triggerId].spreadsheetId === config.spreadsheetId) {
      existingIds.push(triggerId);
    } else {
      nextTriggerMap[triggerId] = triggerMap[triggerId];
    }
  });

  for (index = 0; index < projectTriggers.length; index += 1) {
    trigger = projectTriggers[index];
    if (existingIds.indexOf(trigger.getUniqueId()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  trigger = createTriggerForConfig_(config);
  nextTriggerMap[trigger.getUniqueId()] = {
    spreadsheetId: config.spreadsheetId,
    type: config.trigger.mode,
  };

  userProps.setProperty(TRIGGER_MAP_KEY, JSON.stringify(nextTriggerMap));
}

function createTriggerForConfig_(config) {
  var builder;

  if (config.trigger.mode === 'FORM_SUBMIT') {
    return ScriptApp.newTrigger('handleConfiguredFormSubmit_')
      .forSpreadsheet(config.spreadsheetId)
      .onFormSubmit()
      .create();
  }

  builder = ScriptApp.newTrigger('handleConfiguredTimeTrigger_').timeBased();

  if (config.trigger.scheduleType === 'HOURLY') {
    return builder.everyHours(Math.max(1, Math.min(23, config.trigger.hourlyInterval))).create();
  }

  if (config.trigger.scheduleType === 'MINUTE') {
    return builder.everyMinutes(1).create();
  }

  if (config.trigger.scheduleType === 'WEEKLY') {
    return builder
      .onWeekDay(ScriptApp.WeekDay[config.trigger.weeklyDay] || ScriptApp.WeekDay.MONDAY)
      .atHour(normalizeHour_(config.trigger.weeklyHour))
      .create();
  }

  return builder
    .everyDays(1)
    .atHour(normalizeHour_(config.trigger.dailyHour))
    .create();
}

function getTriggerRoute_(triggerUid) {
  var map = getJsonProperty_(PropertiesService.getUserProperties(), TRIGGER_MAP_KEY, {});
  return triggerUid ? map[triggerUid] || null : null;
}

function getSheetSnapshot_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  var headers;

  if (!values.length) {
    return {
      id: sheet.getSheetId(),
      name: sheet.getName(),
      headers: [],
      rowCount: 0,
    };
  }

  headers = values[0].map(function(header, index) {
    var clean = String(header || '').trim();
    return clean || ('Column ' + (index + 1));
  });

  return {
    id: sheet.getSheetId(),
    name: sheet.getName(),
    headers: headers,
    rowCount: Math.max(values.length - 1, 0),
  };
}

function getSheetRows_(spreadsheet, sheetId) {
  var sheet = getSheetById_(spreadsheet, sheetId);
  var values = sheet.getDataRange().getDisplayValues();
  var headers;

  if (!values.length) {
    return [];
  }

  headers = values[0].map(function(header, index) {
    var clean = String(header || '').trim();
    return clean || ('Column ' + (index + 1));
  });

  return values.slice(1).map(function(rowValues, index) {
    var valuesByHeader = {};
    var identityIndex;
    var recordIndex;
    var identity;
    var record;

    if (!rowValues.some(function(value) { return String(value || '').trim() !== ''; })) {
      return null;
    }

    headers.forEach(function(header, headerIndex) {
      valuesByHeader[header] = String(rowValues[headerIndex] || '');
    });

    identityIndex = headers.length >= 2 ? 1 : 0;
    recordIndex = findRecordIndex_(headers, 0);
    identity = String(rowValues[identityIndex] || rowValues[0] || ('Row ' + (index + 2))).trim();
    record = String(rowValues[recordIndex] || identity || ('ROW-' + (index + 2))).trim();

    return {
      rowNumber: index + 2,
      identity: identity,
      record: record,
      values: valuesByHeader,
    };
  }).filter(function(row) {
    return row !== null;
  });
}

function getTemplateMetadata(templateUrl) {
  var parsed = parseTemplateUrl_(templateUrl);
  var tags;
  var name;

  if (parsed.templateType === 'SLIDES') {
    var presentation = SlidesApp.openById(parsed.templateId);
    tags = extractTemplateTags_(getPresentationText_(presentation));
    name = presentation.getName();
  } else {
    var document = DocumentApp.openById(parsed.templateId);
    tags = extractTemplateTags_(document.getBody().getText());
    name = document.getName();
  }

  if (!tags.length) {
    throw new Error('No {{tags}} were found in that template.');
  }

  return {
    templateId: parsed.templateId,
    templateType: parsed.templateType,
    documentName: name,
    tags: tags,
  };
}

function getFolderMetadata_(folderUrl) {
  var parsed = parseFolderUrl_(folderUrl);
  var folder = DriveApp.getFolderById(parsed.folderId);
  return {
    id: folder.getId(),
    name: folder.getName(),
    url: folder.getUrl(),
  };
}

function resolveFolderSelection_(payload) {
  var folderId = String(payload.folderId || '').trim();

  if (folderId) {
    return getFolderMetadataById_(folderId);
  }

  return getFolderMetadata_(payload.folderUrl);
}

function getFolderMetadataById_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  return {
    id: folder.getId(),
    name: folder.getName(),
    url: folder.getUrl(),
  };
}

function getSavedConfig_(spreadsheetId) {
  var raw = PropertiesService.getUserProperties().getProperty(CONFIG_PREFIX + spreadsheetId);
  var config = raw ? JSON.parse(raw) : null;

  if (!config) {
    return null;
  }

  return hydrateSavedConfig_(config);
}

function getEmailDraft_(spreadsheetId) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = getOrCreateEmailDraftSheet_(spreadsheet);
  var values = sheet.getDataRange().getDisplayValues();
  var parts = [];
  var raw;
  var index;

  if (!values.length || !values[0].length) {
    return null;
  }

  for (index = 0; index < values[0].length; index += 1) {
    if (!values[0][index]) {
      break;
    }
    parts.push(values[0][index]);
  }

  raw = parts.join('').trim();

  return raw ? JSON.parse(raw) : null;
}

function saveEmailDraft_(spreadsheetId, draft) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = getOrCreateEmailDraftSheet_(spreadsheet);
  var serialized = JSON.stringify(draft);
  var chunks = chunkString_(serialized, EMAIL_DRAFT_CHUNK_SIZE);
  var columnCount = Math.max(chunks.length, sheet.getMaxColumns());
  var rowValues;

  if (sheet.getMaxColumns() < chunks.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), chunks.length - sheet.getMaxColumns());
    columnCount = sheet.getMaxColumns();
  }

  rowValues = new Array(columnCount);
  rowValues.fill('');

  chunks.forEach(function(chunk, index) {
    rowValues[index] = chunk;
  });

  sheet.getRange(1, 1, 1, columnCount).setValues([rowValues]);
}

function getOrCreateEmailDraftSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(EMAIL_DRAFT_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(EMAIL_DRAFT_SHEET_NAME);
    sheet.hideSheet();
    sheet.getRange(1, 1).setValue('');
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

function chunkString_(value, size) {
  var text = String(value || '');
  var chunks = [];
  var index;

  if (!text) {
    return [''];
  }

  for (index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }

  return chunks;
}

function extractInlineImagesFromHtml_(html) {
  var source = String(html || '');
  var inlineImages = {};
  var imageIndex = 0;
  var transformedHtml;

  transformedHtml = source.replace(/<img\b([^>]*?)src=(["'])(data:image\/[^"']+)\2([^>]*)>/gi, function(match, before, quote, dataUrl, after) {
    var parsed = parseDataImageUrl_(dataUrl);
    var cid;

    if (!parsed) {
      return match;
    }

    cid = 'dm-inline-' + imageIndex;
    imageIndex += 1;
    inlineImages[cid] = parsed.blob.setName(parsed.fileName);

    return '<img' + before + 'src="cid:' + cid + '"' + after + '>';
  });

  return {
    html: transformedHtml,
    inlineImages: inlineImages,
  };
}

function prepareEmailHtml_(html, plainBody) {
  var sourceHtml = String(html || '').trim();
  var fallbackHtml = convertNewlinesToHtml_(String(plainBody || '').trim());
  var prepared = extractInlineImagesFromHtml_(sourceHtml);
  var textFromHtml = stripHtmlToText_(prepared.html);
  var finalInnerHtml = prepared.html || fallbackHtml;

  if (!String(textFromHtml || '').trim() && String(plainBody || '').trim()) {
    finalInnerHtml = fallbackHtml + (prepared.html || '');
  }

  return {
    html: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#262624;">' + finalInnerHtml + '</div>',
    inlineImages: prepared.inlineImages,
  };
}

function parseDataImageUrl_(dataUrl) {
  var match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  var mimeType;
  var extension;
  var bytes;

  if (!match) {
    return null;
  }

  mimeType = match[1];
  extension = mimeType.split('/')[1] || 'png';

  try {
    bytes = Utilities.base64Decode(match[2]);
  } catch (error) {
    return null;
  }

  return {
    fileName: 'inline-image-' + new Date().getTime() + '.' + extension.replace(/[^a-zA-Z0-9]/g, ''),
    blob: Utilities.newBlob(bytes, mimeType),
  };
}

function getRequiredConfig_(spreadsheetId) {
  var config = getSavedConfig_(spreadsheetId);
  if (!config) {
    throw new Error('No configuration has been saved for this spreadsheet yet.');
  }
  return config;
}

function getWebhookConfig_(spreadsheetId) {
  try {
    return getRequiredConfig_(spreadsheetId);
  } catch (error) {
    return getAnySavedConfig_();
  }
}

function getAnySavedConfig_() {
  var userProps = PropertiesService.getUserProperties();
  var registry = getJsonProperty_(userProps, REGISTRY_KEY, []);
  var index;
  var config;

  for (index = 0; index < registry.length; index += 1) {
    config = getSavedConfig_(registry[index]);
    if (config) {
      return config;
    }
  }

  throw new Error('No configuration has been saved for this spreadsheet yet.');
}

function hydrateSavedConfig_(config) {
  var templateMeta;
  var hydrated;

  if (!config || !config.templateUrl) {
    return config;
  }

  try {
    templateMeta = getTemplateMetadata(config.templateUrl);
  } catch (error) {
    return config;
  }

  hydrated = {
    spreadsheetId: config.spreadsheetId,
    spreadsheetName: config.spreadsheetName,
    sheetId: config.sheetId,
    sheetName: config.sheetName,
    sheetHeaders: config.sheetHeaders,
    templateUrl: config.templateUrl,
    templateId: templateMeta.templateId,
    templateType: templateMeta.templateType,
    templateName: templateMeta.documentName,
    templateTags: templateMeta.tags,
    mappings: reconcileMappings_(config.mappings || {}, templateMeta.tags),
    trigger: config.trigger,
    email: config.email,
    folderUrl: config.folderUrl,
    folderId: config.folderId,
    folderName: config.folderName,
    fileNamePattern: config.fileNamePattern,
    updatedAt: config.updatedAt,
  };

  return hydrated;
}

function reconcileMappings_(savedMappings, latestTags) {
  var reconciled = {};
  var savedKeys = Object.keys(savedMappings || {});

  latestTags.forEach(function(tag) {
    var exactValue = savedMappings[tag];
    var normalizedTag = normalizeHeader_(tag);
    var fallbackKey;

    if (exactValue) {
      reconciled[tag] = exactValue;
      return;
    }

    fallbackKey = savedKeys.filter(function(savedKey) {
      return normalizeHeader_(savedKey) === normalizedTag;
    })[0];

    if (fallbackKey) {
      reconciled[tag] = savedMappings[fallbackKey];
    }
  });

  return reconciled;
}

function saveConfig_(spreadsheetId, config) {
  var userProps = PropertiesService.getUserProperties();
  var registry = getJsonProperty_(userProps, REGISTRY_KEY, []);
  var filtered = registry.filter(function(id) {
    return id !== spreadsheetId;
  });

  filtered.push(spreadsheetId);
  userProps.setProperty(CONFIG_PREFIX + spreadsheetId, JSON.stringify(config));
  userProps.setProperty(REGISTRY_KEY, JSON.stringify(filtered));
}

function getDefaultConfig_(spreadsheet, sheetMeta) {
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheetId: sheetMeta.id,
    sheetName: sheetMeta.name,
    sheetHeaders: sheetMeta.headers,
    templateUrl: '',
    templateId: '',
    templateType: 'DOCS',
    templateName: '',
    templateTags: [],
    mappings: {},
    trigger: {
      mode: 'FORM_SUBMIT',
      scheduleType: 'DAILY',
      hourlyInterval: 1,
      dailyHour: 9,
      weeklyDay: 'MONDAY',
      weeklyHour: 9,
    },
    email: {
      to: '',
      cc: '',
      bcc: '',
      senderName: 'Document Merge',
      subject: 'Your generated PDF for {{Name}}',
      body: 'Hi,\n\nPlease find the generated PDF attached.\n\nThanks,',
      bodyHtml: '<p>Hi {{Name}},</p><p>Please find the generated PDF attached.</p><p>Thanks,</p>',
    },
    folderUrl: '',
    folderId: '',
    folderName: '',
    fileNamePattern: '{{Name}}_{{rowNumber}}',
  };
}

function buildReplacementContext_(config, row) {
  var context = {
    rowNumber: String(row.rowNumber),
    sheetName: config.sheetName,
    spreadsheetName: config.spreadsheetName,
    pdfTemplateName: config.templateName,
  };

  Object.keys(row.values).forEach(function(header) {
    context[header] = row.values[header];
    context[normalizeHeader_(header)] = row.values[header];
  });

  config.templateTags.forEach(function(tag) {
    var mappedHeader = config.mappings[tag];
    var value = mappedHeader ? String(row.values[mappedHeader] || '') : '';
    context[tag] = value;
    context[normalizeHeader_(tag)] = value;
  });

  return context;
}

function replaceTagWithContent_(body, tag, replacement) {
  var pattern = '\\{\\{\\s*' + escapeForRegex_(tag) + '\\s*\\}\\}';
  var imageBlobs = extractImageBlobsFromValue_(replacement);

  if (!imageBlobs.length) {
    body.replaceText(pattern, String(replacement || ''));
    return;
  }

  replaceTagWithImages_(body, pattern, imageBlobs);
}

function replaceSlidesTextTag_(presentation, tag, replacement) {
  getTagVariants_(tag).forEach(function(variant) {
    presentation.replaceAllText(variant, String(replacement || ''));
  });
}

function replaceTagWithSlidesImages_(presentation, tag, imageBlobs) {
  presentation.getSlides().forEach(function(slide) {
    slide.getPageElements().slice().forEach(function(element) {
      var shape;
      var text;
      var left;
      var top;
      var width;
      var height;

      if (element.getPageElementType() !== SlidesApp.PageElementType.SHAPE) {
        return;
      }

      shape = element.asShape();
      text = shape.getText().asString();
      if (!isFullTagMatch_(text, tag)) {
        return;
      }

      left = element.getLeft();
      top = element.getTop();
      width = element.getWidth();
      height = element.getHeight();

      element.remove();
      insertImagesOnSlide_(slide, imageBlobs, left, top, width, height);
    });
  });
}

function insertImagesOnSlide_(slide, imageBlobs, left, top, width, height) {
  var gap = 8;
  var totalGap = Math.max(0, imageBlobs.length - 1) * gap;
  var boxWidth = Math.max(24, (width - totalGap) / Math.max(1, imageBlobs.length));

  imageBlobs.forEach(function(blob, index) {
    var boxLeft = left + (index * (boxWidth + gap));
    var image = slide.insertImage(blob);
    fitSlidesImageIntoBox_(image, boxLeft, top, boxWidth, height);
  });
}

function fitSlidesImageIntoBox_(image, left, top, boxWidth, boxHeight) {
  var width = image.getWidth();
  var height = image.getHeight();
  var ratio = Math.min(boxWidth / width, boxHeight / height);
  var scaledWidth = Math.max(1, width * ratio);
  var scaledHeight = Math.max(1, height * ratio);

  image.setWidth(scaledWidth);
  image.setHeight(scaledHeight);
  image.setLeft(left + ((boxWidth - scaledWidth) / 2));
  image.setTop(top + ((boxHeight - scaledHeight) / 2));
}

function replaceTagWithImages_(body, pattern, imageBlobs) {
  var found = body.findText(pattern);

  while (found) {
    var text = found.getElement().asText();
    var parent = text.getParent();
    var parentType = parent.getType();
    var paragraphText = getContainerText_(parent);
    var fullMatch = paragraphText && new RegExp('^\\s*' + pattern + '\\s*$').test(paragraphText);
    var editTarget;
    var startOffset;
    var childIndex;

    if (fullMatch && (parentType === DocumentApp.ElementType.PARAGRAPH || parentType === DocumentApp.ElementType.LIST_ITEM)) {
      editTarget = parent.editAsText();
      editTarget.setText('');
      appendImagesToContainer_(parent, imageBlobs);
    } else {
      startOffset = found.getStartOffset();
      childIndex = parent.getChildIndex(text);
      text.deleteText(startOffset, found.getEndOffsetInclusive());
      insertImagesIntoContainer_(parent, childIndex + 1, imageBlobs);
    }

    found = body.findText(pattern);
  }
}

function extractImageBlobsFromValue_(value) {
  var fileIds = parseDriveFileIdsFromValue_(value);
  var blobs = [];
  var seen = {};

  fileIds.forEach(function(fileId) {
    var file;
    var mimeType;

    if (seen[fileId]) {
      return;
    }

    seen[fileId] = true;

    try {
      file = DriveApp.getFileById(fileId);
      mimeType = file.getMimeType();
      if (mimeType && mimeType.indexOf('image/') === 0) {
        blobs.push(file.getBlob());
      }
    } catch (error) {
      // Ignore invalid or inaccessible files and continue with remaining ids.
    }
  });

  return blobs;
}

function parseDriveFileIdsFromValue_(value) {
  var text = String(value || '');
  var matches = text.match(/[-\w]{25,}/g) || [];
  return matches;
}

function appendImagesToContainer_(container, imageBlobs) {
  imageBlobs.forEach(function(blob, index) {
    var image = container.appendInlineImage(blob);
    resizeInlineImage_(image);
    if (index < imageBlobs.length - 1) {
      container.appendText(' ');
    }
  });
}

function insertImagesIntoContainer_(container, startIndex, imageBlobs) {
  var offset = 0;

  imageBlobs.forEach(function(blob, index) {
    var image = container.insertInlineImage(startIndex + offset, blob);
    resizeInlineImage_(image);
    offset += 1;
    if (index < imageBlobs.length - 1) {
      container.insertText(startIndex + offset, ' ');
      offset += 1;
    }
  });
}

function resizeInlineImage_(image) {
  var maxWidth = 320;
  var width = image.getWidth();
  var height = image.getHeight();
  var ratio;

  if (width <= maxWidth) {
    return;
  }

  ratio = maxWidth / width;
  image.setWidth(maxWidth);
  image.setHeight(Math.round(height * ratio));
}

function getContainerText_(container) {
  if (!container || typeof container.getText !== 'function') {
    return '';
  }

  return container.getText();
}

function renderTemplateString_(template, context) {
  return String(template || '').replace(/{{\s*([^{}]+?)\s*}}/g, function(match, key) {
    var cleanKey = sanitizeTagName_(key);
    var normalizedKey = normalizeHeader_(cleanKey);

    if (Object.prototype.hasOwnProperty.call(context, cleanKey)) {
      return String(context[cleanKey] || '');
    }

    if (Object.prototype.hasOwnProperty.call(context, normalizedKey)) {
      return String(context[normalizedKey] || '');
    }

    return '';
  });
}

function buildFileName_(config, row, temporary) {
  var context = buildReplacementContext_(config, row);
  var rawName = renderTemplateString_(config.fileNamePattern || '', context);
  var baseName = rawName || (config.templateName + '_' + row.rowNumber);

  baseName = sanitizeFileName_(baseName);
  return temporary ? (baseName + '_source') : baseName;
}

function getProcessedRowSet_(spreadsheet) {
  var logSheet = getOrCreateLogSheet_(spreadsheet);
  var lastRow = logSheet.getLastRow();
  var rows;
  var processed = {};
  var index;

  if (lastRow < 2) {
    return processed;
  }

  rows = logSheet.getRange(2, 1, lastRow - 1, 9).getDisplayValues();
  for (index = 0; index < rows.length; index += 1) {
    if (rows[index][4] === 'SUCCESS') {
      processed[rows[index][1]] = true;
    }
  }

  return processed;
}

function enqueueSubmissionForProcessing_(spreadsheetId, sheetId, sheetName, rowNumber, formType, questionOrder, responses) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var queueSheet = getOrCreateQueueSheet_(spreadsheet);
  var rowKey = getQueueRowKey_(spreadsheetId, sheetId, rowNumber);
  var payload = {
    formType: formType,
    questionOrder: Array.isArray(questionOrder) ? questionOrder : [],
    responses: responses || {},
  };

  upsertQueueEntry_(queueSheet, {
    rowKey: rowKey,
    spreadsheetId: spreadsheetId,
    sheetId: String(sheetId || ''),
    sheetName: String(sheetName || ''),
    rowNumber: Number(rowNumber) || 2,
    formType: String(formType || ''),
    status: 'PENDING',
    processedAt: '',
    message: '',
    payloadJson: JSON.stringify(payload),
  });

  return {
    ok: true,
    queued: true,
    rowKey: rowKey,
    status: 'PENDING',
  };
}

function getQueueSheetEntries_(queueSheet, spreadsheetId) {
  var lastRow = queueSheet.getLastRow();
  var rows;
  var entries = [];
  var index;

  if (lastRow < 2) {
    return entries;
  }

  rows = queueSheet.getRange(2, 1, lastRow - 1, 11).getDisplayValues();

  for (index = 0; index < rows.length; index += 1) {
    if (spreadsheetId && String(rows[index][2] || '') !== String(spreadsheetId)) {
      continue;
    }

    entries.push({
      rowKey: String(rows[index][1] || ''),
      spreadsheetId: String(rows[index][2] || ''),
      sheetId: String(rows[index][3] || ''),
      sheetName: String(rows[index][4] || ''),
      rowNumber: Number(rows[index][5] || 0),
      formType: String(rows[index][6] || ''),
      status: String(rows[index][7] || 'PENDING'),
      processedAt: String(rows[index][8] || ''),
      message: String(rows[index][9] || ''),
      payloadJson: String(rows[index][10] || ''),
      rowIndex: index + 2,
    });
  }

  return entries;
}

function getOrCreateQueueSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(QUEUE_SHEET_NAME);

  if (sheet) {
    return sheet;
  }

  sheet = spreadsheet.insertSheet(QUEUE_SHEET_NAME);
  sheet.hideSheet();
  sheet.appendRow([
    'Timestamp',
    'Row Key',
    'Spreadsheet ID',
    'Sheet ID',
    'Sheet Name',
    'Row Number',
    'Form Type',
    'Status',
    'Processed At',
    'Message',
    'Payload JSON',
  ]);
  return sheet;
}

function getQueueRowKey_(spreadsheetId, sheetId, rowNumber) {
  return [String(spreadsheetId || ''), String(sheetId || ''), String(rowNumber || '')].join(':');
}

function upsertQueueEntry_(queueSheet, entry) {
  var lastRow = queueSheet.getLastRow();
  var rows;
  var index;
  var rowValues;
  var foundRow = null;

  if (lastRow >= 2) {
    rows = queueSheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    for (index = 0; index < rows.length; index += 1) {
      if (String(rows[index][0] || '') === String(entry.rowKey || '')) {
        foundRow = index + 2;
        break;
      }
    }
  }

  rowValues = [
    new Date(),
    entry.rowKey,
    entry.spreadsheetId,
    entry.sheetId,
    entry.sheetName,
    entry.rowNumber,
    entry.formType,
    entry.status,
    entry.processedAt || '',
    entry.message || '',
    entry.payloadJson || '',
  ];

  if (foundRow) {
    queueSheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
    return foundRow;
  }

  queueSheet.appendRow(rowValues);
  return queueSheet.getLastRow();
}

function markQueueEntryStatus_(queueSheet, rowKey, status, message) {
  var lastRow = queueSheet.getLastRow();
  var rows;
  var index;
  var rowIndex;

  if (lastRow < 2) {
    return false;
  }

  rows = queueSheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  for (index = 0; index < rows.length; index += 1) {
    if (String(rows[index][0] || '') === String(rowKey || '')) {
      rowIndex = index + 2;
      queueSheet.getRange(rowIndex, 8, 1, 3).setValues([[
        status || 'PENDING',
        status === 'DONE' ? new Date() : '',
        message || '',
      ]]);
      return true;
    }
  }

  return false;
}

function getPendingQueueEntries_(spreadsheetId) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var queueSheet = spreadsheet.getSheetByName(QUEUE_SHEET_NAME);
  var entries;

  if (!queueSheet) {
    return [];
  }

  entries = getQueueSheetEntries_(queueSheet, spreadsheetId)
    .filter(function(entry) {
      return String(entry.status || '').toUpperCase() === 'PENDING';
    })
    .sort(function(left, right) {
      return Number(left.rowNumber || 0) - Number(right.rowNumber || 0);
    });

  return entries;
}

function appendLogEntry_(spreadsheet, entry) {
  var logSheet = getOrCreateLogSheet_(spreadsheet);
  logSheet.appendRow([
    new Date(),
    entry.rowKey,
    entry.sheetName,
    entry.rowNumber,
    entry.status,
    entry.triggerType,
    entry.recipient,
    entry.pdfUrl,
    entry.message,
  ]);
}

function getOrCreateLogSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);

  if (sheet) {
    return sheet;
  }

  sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
  sheet.hideSheet();
  sheet.appendRow([
    'Timestamp',
    'Row Key',
    'Sheet Name',
    'Row Number',
    'Status',
    'Trigger Type',
    'Recipient',
    'PDF URL',
    'Message',
  ]);
  return sheet;
}

function parseTemplateUrl_(templateUrl) {
  var value = String(templateUrl || '');
  var docMatch = value.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  var slidesMatch = value.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);

  if (docMatch) {
    return {
      templateId: docMatch[1],
      templateType: 'DOCS',
    };
  }

  if (slidesMatch) {
    return {
      templateId: slidesMatch[1],
      templateType: 'SLIDES',
    };
  }

  throw new Error('Use a valid Google Docs or Google Slides template URL.');
}

function parseFolderUrl_(folderUrl) {
  var value = String(folderUrl || '');
  var match = value.match(/\/folders\/([a-zA-Z0-9-_]+)/) || value.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Use a valid Google Drive folder URL.');
  }
  return { folderId: match[1] };
}

function getFolderForPicker_(folderId) {
  if (!folderId) {
    return DriveApp.getRootFolder();
  }

  return DriveApp.getFolderById(folderId);
}

function listChildFolders_(folder) {
  var folders = folder.getFolders();
  var list = [];

  while (folders.hasNext()) {
    var child = folders.next();
    list.push({
      id: child.getId(),
      name: child.getName(),
      url: child.getUrl(),
    });
  }

  list.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  return list;
}

function buildFolderBreadcrumbs_(folder) {
  var trail = [{
    id: folder.getId(),
    name: folder.getName(),
    url: folder.getUrl(),
  }];
  var parents = folder.getParents();

  while (parents.hasNext()) {
    folder = parents.next();
    trail.push({
      id: folder.getId(),
      name: folder.getName(),
      url: folder.getUrl(),
    });
    parents = folder.getParents();
  }

  return trail.reverse();
}

function getSheetById_(spreadsheet, sheetId) {
  var numericSheetId = Number(sheetId);
  var matching = spreadsheet.getSheets().filter(function(sheet) {
    return sheet.getSheetId() === numericSheetId;
  })[0];

  if (!matching) {
    throw new Error('The configured sheet tab could not be found.');
  }

  return matching;
}

function getPresentationText_(presentation) {
  var parts = [];

  presentation.getSlides().forEach(function(slide) {
    slide.getPageElements().forEach(function(element) {
      if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        parts.push(element.asShape().getText().asString());
      }
    });
  });

  return parts.join('\n');
}

function extractTemplateTags_(text) {
  var regex = /{{\s*([^{}]+?)\s*}}/g;
  var tags = [];
  var seen = {};
  var match;
  var tag;

  while ((match = regex.exec(String(text || ''))) !== null) {
    tag = sanitizeTagName_(match[1]);
    if (tag && !seen[tag]) {
      seen[tag] = true;
      tags.push(tag);
    }
  }

  return tags;
}

function getTagVariants_(tag) {
  var cleanTag = sanitizeTagName_(tag);
  return [
    '{{' + cleanTag + '}}',
    '{{ ' + cleanTag + '}}',
    '{{' + cleanTag + ' }}',
    '{{ ' + cleanTag + ' }}',
  ];
}

function isFullTagMatch_(text, tag) {
  var pattern = new RegExp('^\\s*\\{\\{\\s*' + escapeForRegex_(sanitizeTagName_(tag)) + '\\s*\\}\\}\\s*$');
  return pattern.test(String(text || ''));
}

function suggestMappings(tags, headers) {
  var usedHeaders = {};
  var suggestions = {};

  tags.forEach(function(tag) {
    var bestHeader = '';
    var bestScore = 0;

    headers.forEach(function(header) {
      var score;

      if (usedHeaders[header]) {
        return;
      }

      score = scoreHeaderMatch_(tag, header);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    });

    if (bestHeader && bestScore >= 80) {
      suggestions[tag] = bestHeader;
      usedHeaders[bestHeader] = true;
    }
  });

  return suggestions;
}

function scoreHeaderMatch_(tag, header) {
  var normalizedTag = normalizeHeader_(tag);
  var normalizedHeader = normalizeHeader_(header);
  var compactTag;
  var compactHeader;
  var tagTokens;
  var headerTokens;
  var headerTokenSet = {};
  var tagTokenSet = {};

  if (!normalizedTag || !normalizedHeader) {
    return 0;
  }

  if (normalizedTag === normalizedHeader) {
    return 100;
  }

  compactTag = normalizedTag.replace(/\s+/g, '');
  compactHeader = normalizedHeader.replace(/\s+/g, '');
  if (compactTag === compactHeader) {
    return 95;
  }

  tagTokens = normalizedTag.split(' ').filter(Boolean);
  headerTokens = normalizedHeader.split(' ').filter(Boolean);

  if (tagTokens.length === 1 || headerTokens.length === 1) {
    return 0;
  }

  headerTokens.forEach(function(token) {
    headerTokenSet[token] = true;
  });
  tagTokens.forEach(function(token) {
    tagTokenSet[token] = true;
  });

  if (tagTokens.every(function(token) { return headerTokenSet[token]; }) &&
      headerTokens.every(function(token) { return tagTokenSet[token]; })) {
    return 90;
  }

  if (tagTokens.every(function(token) { return headerTokenSet[token]; })) {
    return 80;
  }

  if (headerTokens.every(function(token) { return tagTokenSet[token]; })) {
    return 70;
  }

  return 0;
}

function findRecordIndex_(headers, fallbackIndex) {
  var index;
  for (index = 0; index < headers.length; index += 1) {
    if (/record|certificate|invoice|serial|id/i.test(headers[index])) {
      return index;
    }
  }
  return fallbackIndex;
}

function findRowByNumber_(rows, rowNumber) {
  return rows.filter(function(row) {
    return Number(row.rowNumber) === Number(rowNumber);
  })[0] || null;
}

function getRowLogKey_(sheetId, rowNumber) {
  return String(sheetId) + ':' + String(rowNumber);
}

function getJsonProperty_(props, key, fallback) {
  var raw = props.getProperty(key);
  return raw ? JSON.parse(raw) : fallback;
}

function normalizeHour_(hour) {
  return Math.max(0, Math.min(23, Number(hour || 0)));
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sanitizeTagName_(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, ' ');
}

function sanitizeFileName_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|#%]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || ('generated_' + Date.now());
}

function escapeForRegex_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function convertNewlinesToHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function normalizeEmailList_(value) {
  return String(value || '')
    .split(/[;,]/)
    .map(function(part) { return part.trim(); })
    .filter(Boolean)
    .join(',');
}

function stripHtmlToText_(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
