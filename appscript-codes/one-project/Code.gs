const FORM_DESTINATIONS = {
  adoption: {
    spreadsheetId: "1Nt1wt_iYjuIBEgTsw_yOkC-nCTTYZXPxSsc_yNdJnCw",
    sheetName: "Adoption"
  },
  volunteer: {
    spreadsheetId: "PASTE_SPREADSHEET_ID_HERE",
    sheetName: "Volunteer"
  },
  foster: {
    spreadsheetId: "PASTE_SPREADSHEET_ID_HERE",
    sheetName: "Foster"
  },
  surrender: {
    spreadsheetId: "PASTE_SPREADSHEET_ID_HERE",
    sheetName: "Surrender"
  }
};

const DEFAULT_NOTIFICATION_RECIPIENT = "contact@safescapefoundation.com";

function doPost(e) {
  const payload = parsePayload(e);
  const formType = String((payload && payload.formType) || "").trim();
  const destination = FORM_DESTINATIONS[formType];

  if (!destination) {
    return outputJson({ ok: false, error: "Unknown form type" });
  }

  const sheetName = String(payload.sheetName || destination.sheetName || "").trim() || destination.sheetName;
  const sheet = getOrCreateSheet(destination.spreadsheetId, sheetName);
  const sheetId = sheet.getSheetId();

  // "responses" keys are the sheet headers, and must match the exact form question titles.
  const responses = payload.responses || {};
  const questionOrder = Array.isArray(payload.questionOrder) ? payload.questionOrder : Object.keys(responses);
  const headers = questionOrder.map(String).filter(Boolean);

  if (!headers.length) {
    return outputJson({ ok: false, error: "No questions were provided." });
  }

  const finalHeaders = ensureHeaders(sheet, headers);
  const row = finalHeaders.map((header) => formatCellValue(responses[header]));
  sheet.appendRow(row);

  const mergeNotification = notifyDocumentMerge_(destination.spreadsheetId, sheetId, sheet.getLastRow(), sheetName, formType, questionOrder, responses);
  const notification = sendSubmissionNotification_(formType, payload, responses, questionOrder);

  return outputJson({
    ok: true,
    formType: formType,
    notification: notification,
    documentMerge: mergeNotification
  });
}

function parsePayload(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (error) {
    // fall through to parameter parsing
  }

  // Fallback: allow classic form-encoded posts.
  const payload = Object.assign({}, (e && e.parameter) || {});
  if (payload.responses && typeof payload.responses === "string") {
    try {
      payload.responses = JSON.parse(payload.responses);
    } catch (error) {
      payload.responses = {};
    }
  }
  if (payload.questionOrder && typeof payload.questionOrder === "string") {
    try {
      payload.questionOrder = JSON.parse(payload.questionOrder);
    } catch (error) {
      payload.questionOrder = [];
    }
  }
  return payload;
}

function getOrCreateSheet(spreadsheetId, sheetName) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    const sheets = spreadsheet.getSheets();
    if (sheets.length) {
      return sheets[0];
    }

    sheet = spreadsheet.insertSheet(sheetName || "Sheet1");
  }

  return sheet;
}

function ensureHeaders(sheet, headers) {
  const lastCol = Math.max(sheet.getLastColumn(), headers.length);
  const firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const existing = firstRow.map((value) => String(value || "").trim()).filter(Boolean);

  // If the sheet is empty, write the provided headers as-is.
  if (!existing.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return headers;
  }

  // Extend the header row with any new questions, preserving existing columns.
  const existingSet = new Set(existing);
  const additions = headers.filter((header) => header && !existingSet.has(header));

  if (additions.length) {
    const newHeaders = existing.concat(additions);
    sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    sheet.setFrozenRows(1);
    return newHeaders;
  }

  return existing;
}

function formatCellValue(value) {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function notifyDocumentMerge_(spreadsheetId, sheetId, rowNumber, sheetName, formType, questionOrder, responses) {
  try {
    const result = enqueueSubmissionForProcessing_(
      spreadsheetId,
      sheetId,
      sheetName,
      rowNumber,
      formType,
      questionOrder,
      responses
    );

    return {
      ok: true,
      queued: true,
      result: result
    };
  } catch (error) {
    return {
      ok: false,
      sent: false,
      error: String((error && error.message) || error)
    };
  }
}

function sendSubmissionNotification_(formType, payload, responses, questionOrder) {
  try {
    const recipient = resolveNotificationRecipient_(formType);
    if (!recipient) {
      return { ok: false, skipped: true, reason: "No notification recipient configured." };
    }

    const submitterEmail = findResponseByKeys_(responses, ["Email", "Email address", "Email Address", "email"]);
    const options = {
      to: recipient,
      subject: "New Safescape " + capitalize_(formType || "form") + " submission",
      body: buildSubmissionEmailBody_(formType, payload, responses, questionOrder)
    };

    if (isPlausibleEmail_(submitterEmail)) {
      options.replyTo = submitterEmail;
    }

    MailApp.sendEmail(options);
    return { ok: true, sent: true, recipient: recipient };
  } catch (error) {
    return {
      ok: false,
      sent: false,
      error: String((error && error.message) || error)
    };
  }
}

function resolveNotificationRecipient_(formType) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const configuredRecipient = scriptProperties.getProperty("NOTIFICATION_RECIPIENT_" + String(formType || "").toUpperCase());
  return String(configuredRecipient || DEFAULT_NOTIFICATION_RECIPIENT).trim();
}

function findResponseByKeys_(responses, keys) {
  if (!responses || !keys || !keys.length) {
    return "";
  }

  const normalized = {};
  Object.keys(responses).forEach((key) => {
    normalized[String(key || "").trim().toLowerCase()] = responses[key];
  });

  for (let index = 0; index < keys.length; index += 1) {
    const candidate = normalized[String(keys[index] || "").trim().toLowerCase()];
    const value = formatCellValue(candidate).trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function isPlausibleEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()) && !String(value || "").trim().endsWith(".local");
}

function capitalize_(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildSubmissionEmailBody_(formType, payload, responses, questionOrder) {
  const lines = [];
  lines.push("Safescape Foundation received a new " + capitalize_(formType || "form") + " submission.");
  lines.push("");
  lines.push("Submitted at: " + new Date().toISOString());
  lines.push("Sheet name: " + String(payload && payload.sheetName || ""));
  lines.push("Spreadsheet ID: " + String(payload && payload.spreadsheetId || ""));
  lines.push("");
  lines.push("Questions and responses:");

  (Array.isArray(questionOrder) ? questionOrder : Object.keys(responses || {})).forEach((question) => {
    const key = String(question || "");
    lines.push("- " + key + ": " + formatCellValue(responses && responses[key]));
  });

  return lines.join("\n");
}

function outputJson(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
