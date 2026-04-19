const FORM_DESTINATIONS = {
  adoption: {
    spreadsheetId: "1Nt1wt_iYjuIBEgTsw_yOkC-nCTTYZXPxSsc_yNdJnCw",
    sheetName: "Adoption"
  },
  passiveAdoption: {
    spreadsheetId: "1Nt1wt_iYjuIBEgTsw_yOkC-nCTTYZXPxSsc_yNdJnCw",
    sheetName: "Passive Adoption"
  },
  volunteer: {
    spreadsheetId: "13COsNJ7wLW9B3J7PD-dLOsgAG67KM0cvuRB0oYeQvYo",
    sheetName: "Volunteer"
  },
  foster: {
    spreadsheetId: "1Nl3CJi3f2Wf40oEko-yEkN51VM9NrWziSADzDFIC9Lc",
    sheetId: 1012606437,
    sheetName: "Foster"
  },
  foodSponsorship: {
    spreadsheetId: "1Nt1wt_iYjuIBEgTsw_yOkC-nCTTYZXPxSsc_yNdJnCw",
    sheetName: "Food Sponsorship"
  },
  surrender: {
    spreadsheetId: "1negRmgGk09WvyTLnZZAyXpBJOLfbny8J5zblGnIaY5k",
    sheetName: "Surrender"
  }
};

const DEFAULT_NOTIFICATION_RECIPIENT = "contact@safescapefoundation.com";
const FOOD_SAFESCAPE_CALENDAR_ID = "d66e0b3e3cf10931b4693cec161cfb49a48066ace2352e76cd470e127ce7fe9a@group.calendar.google.com";
const DEFAULT_FOSTER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_FOSTER_UPLOAD_FOLDER_ID = "17i73Sf8FOGjLh9sZO349--_hZJaBF0_m";
const DEFAULT_SURRENDER_UPLOAD_FOLDER_ID = "1boee-dqJGLPeeXkwfdJNAZkGasImvNM0";
const FOSTER_UPLOAD_FOLDER_PROPERTY_KEYS = [
  "FOSTER_UPLOAD_FOLDER_ID",
  "UPLOAD_FOLDER_FOSTER",
  "UPLOAD_FOLDER_ID_FOSTER"
];
const SURRENDER_UPLOAD_FOLDER_PROPERTY_KEYS = [
  "SURRENDER_UPLOAD_FOLDER_ID",
  "UPLOAD_FOLDER_SURRENDER",
  "UPLOAD_FOLDER_ID_SURRENDER"
];

function doGet(e) {
  const payload = parsePayloadFromEvent_(e);
  const action = String((payload && payload.action) || (e && e.parameter && e.parameter.action) || "").trim();

  if (action === "foodCalendarDates") {
    try {
      return outputJson({
        ok: true,
        blockedDates: getFoodCalendarBlockedDates_()
      });
    } catch (error) {
      return outputJson({
        ok: false,
        error: String(error && error.message ? error.message : error),
        blockedDates: []
      });
    }
  }

  return outputJson({ ok: true, status: "ready" });
}

function doPost(e) {
  const payload = parsePayload(e);
  const action = String((payload && payload.action) || "").trim();

  if (action === "foodCalendarSync") {
    try {
      return outputJson({
        ok: true,
        synced: syncFoodCalendarBlockedDates_(payload)
      });
    } catch (error) {
      return outputJson({
        ok: false,
        error: String(error && error.message ? error.message : error)
      });
    }
  }

  const formType = String((payload && payload.formType) || "").trim();
  const destination = FORM_DESTINATIONS[formType];

  if (!destination) {
    return outputJson({ ok: false, error: "Unknown form type" });
  }

  try {
    const sheetName = String(payload.sheetName || destination.sheetName || "").trim() || destination.sheetName;
    const sheet = getOrCreateSheet(destination.spreadsheetId, sheetName, destination.sheetId);
    const sheetId = sheet.getSheetId();

    // "responses" keys are the sheet headers, and must match the exact form question titles.
    const responses = payload.responses || {};
    const questionOrder = Array.isArray(payload.questionOrder) ? payload.questionOrder : Object.keys(responses);
    const uploads = Array.isArray(payload.uploads) ? payload.uploads : [];
    const headers = questionOrder.map(String).filter(Boolean);

    if (!headers.length) {
      return outputJson({ ok: false, error: "No questions were provided." });
    }

    const warnings = [];

    try {
      processUploadsForSubmission_(formType, destination.spreadsheetId, responses, uploads);
    } catch (uploadError) {
      warnings.push("Upload processing skipped: " + String(uploadError && uploadError.message ? uploadError.message : uploadError));
    }

    const finalHeaders = ensureHeaders(sheet, headers);
    const row = finalHeaders.map((header) => formatCellValue(responses[header]));
    sheet.appendRow(row);

    let mergeNotification = null;
    try {
      mergeNotification = notifyDocumentMerge_(
        destination.spreadsheetId,
        sheetId,
        sheet.getLastRow(),
        sheetName,
        formType,
        questionOrder,
        responses
      );
    } catch (mergeError) {
      warnings.push("Document Merge notification skipped: " + String(mergeError && mergeError.message ? mergeError.message : mergeError));
    }

    let notification = null;
    try {
      notification = sendSubmissionNotification_(formType, payload, responses, questionOrder);
    } catch (mailError) {
      warnings.push("Email notification skipped: " + String(mailError && mailError.message ? mailError.message : mailError));
    }

    return outputJson({
      ok: true,
      formType: formType,
      notification: notification,
      documentMerge: mergeNotification,
      warnings: warnings
    });
  } catch (error) {
    return outputJson({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
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
  if (payload.uploads && typeof payload.uploads === "string") {
    try {
      payload.uploads = JSON.parse(payload.uploads);
    } catch (error) {
      payload.uploads = [];
    }
  }
  return payload;
}

function parsePayloadFromEvent_(e) {
  return parsePayload(e);
}

function getFoodCalendarId_() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var propertyKeys = [
    "FOOD_SAFESCAPE_CALENDAR_ID",
    "FOOD_SPONSOR_CALENDAR_ID",
    "FOOD_CALENDAR_ID"
  ];
  var index;
  var calendarId = "";

  for (index = 0; index < propertyKeys.length; index += 1) {
    calendarId = String(scriptProperties.getProperty(propertyKeys[index]) || "").trim();
    if (calendarId) {
      return calendarId;
    }
  }

  return FOOD_SAFESCAPE_CALENDAR_ID;
}

function getFoodCalendarBlockedDates_() {
  var calendar = getFoodCalendar_();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var end = new Date(today);
  end.setMonth(end.getMonth() + 18);
  var events = calendar.getEvents(today, end);
  var blockedDates = {};

  events.forEach(function(event) {
    collectBlockedDatesFromEvent_(event, blockedDates);
  });

  return Object.keys(blockedDates).sort();
}

function getFoodCalendar_() {
  var calendarId = getFoodCalendarId_();
  var calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    throw new Error("Food sponsorship calendar not found: " + calendarId);
  }

  return calendar;
}

function collectBlockedDatesFromEvent_(event, blockedDates) {
  var start = event.getStartTime();
  var end = event.getEndTime();
  var current = new Date(start);
  var last = new Date(end.getTime() - 1);
  current.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);

  while (current.getTime() <= last.getTime()) {
    blockedDates[formatDateKey_(current)] = true;
    current.setDate(current.getDate() + 1);
  }
}

function syncFoodCalendarBlockedDates_(payload) {
  var calendar = getFoodCalendar_();
  var selectedDates = normalizeFoodCalendarDates_(payload && payload.selectedDates);
  var selectedDays = Number(payload && payload.selectedDays ? payload.selectedDays : 0);
  var sourcePage = String((payload && payload.sourcePage) || "").trim();
  var occasion = String((payload && payload.occasion) || "").trim();
  var email = String((payload && payload.email) || "").trim();
  var location = "Safescape Foundation, V.E Store, No.165/1, near GV school A, S.Bingipura, Karnataka 560105, India";
  var created = [];
  var title = occasion ? (occasion + " | Food Sponsorship | Safescape Foundation") : "Food Sponsorship | Safescape Foundation";
  var description = [
    "Source: " + (sourcePage || "food-sponsorship"),
    "Occasion: " + (occasion || "(not provided)"),
    "Email: " + (email || "(not provided)"),
    "Selected days: " + (selectedDays || selectedDates.length || 0),
    "Created on: " + new Date().toISOString()
  ].join("\n");

  if (!selectedDates.length) {
    return created;
  }

  selectedDates.forEach(function(dateKey) {
    var date = parseDateKey_(dateKey);
    if (!date) {
      return;
    }
    var event = calendar.createAllDayEvent(title, date, {
      description: description
    });
    if (event && email) {
      event.addGuest(email);
    }
    if (event) {
      event.setLocation(location);
    }
    created.push(dateKey);
  });

  return created;
}

function normalizeFoodCalendarDates_(dates) {
  var list = Array.isArray(dates) ? dates : [];
  var seen = {};
  var result = [];

  list.forEach(function(value) {
    var dateKey = formatDateKey_(value);
    if (dateKey && !seen[dateKey]) {
      seen[dateKey] = true;
      result.push(dateKey);
    }
  });

  return result;
}

function parseDateKey_(value) {
  var dateKey = formatDateKey_(value);
  if (!dateKey) {
    return null;
  }
  var parts = dateKey.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDateKey_(value) {
  if (!value) {
    return "";
  }

  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function processUploadsForSubmission_(formType, spreadsheetId, responses, uploads) {
  var uploadList = normalizeUploads_(uploads);
  var folder;
  var createdFiles = [];
  var index;

  if (!uploadList.length) {
    return createdFiles;
  }

  folder = resolveUploadFolder_(spreadsheetId, formType);
  var uploadCounts = {};

  for (index = 0; index < uploadList.length; index += 1) {
    var questionKey = String(uploadList[index].question || "");
    uploadCounts[questionKey] = (uploadCounts[questionKey] || 0) + 1;
    if (uploadCounts[questionKey] > 5) {
      throw new Error("Please choose no more than 5 files for a single upload question.");
    }
    createdFiles.push(createUploadFile_(folder, uploadList[index]));
  }

  var uploadsByQuestion = {};
  createdFiles.forEach(function(fileMeta) {
    if (!fileMeta || !fileMeta.question) {
      return;
    }

    if (!uploadsByQuestion[fileMeta.question]) {
      uploadsByQuestion[fileMeta.question] = [];
    }

    uploadsByQuestion[fileMeta.question].push(fileMeta.url);
    responses[fileMeta.question] = uploadsByQuestion[fileMeta.question].join("\n");
  });

  return createdFiles;
}

function normalizeUploads_(uploads) {
  if (!Array.isArray(uploads)) {
    return [];
  }

  return uploads
    .map(function(upload) {
      return upload && typeof upload === "object" ? upload : null;
    })
    .filter(Boolean);
}

function resolveUploadFolder_(spreadsheetId, formType) {
  var scriptProperties = PropertiesService.getScriptProperties();
  var folderId = "";
  var index;

  if (String(formType || "").trim().toLowerCase() === "foster") {
    for (index = 0; index < FOSTER_UPLOAD_FOLDER_PROPERTY_KEYS.length; index += 1) {
      folderId = String(scriptProperties.getProperty(FOSTER_UPLOAD_FOLDER_PROPERTY_KEYS[index]) || "").trim();
      if (folderId) {
        return DriveApp.getFolderById(folderId);
      }
    }

    if (DEFAULT_FOSTER_UPLOAD_FOLDER_ID) {
      try {
        return DriveApp.getFolderById(DEFAULT_FOSTER_UPLOAD_FOLDER_ID);
      } catch (error) {
        // fall through to the spreadsheet parent folder
      }
    }
  } else if (String(formType || "").trim().toLowerCase() === "surrender") {
    for (index = 0; index < SURRENDER_UPLOAD_FOLDER_PROPERTY_KEYS.length; index += 1) {
      folderId = String(scriptProperties.getProperty(SURRENDER_UPLOAD_FOLDER_PROPERTY_KEYS[index]) || "").trim();
      if (folderId) {
        return DriveApp.getFolderById(folderId);
      }
    }

    if (DEFAULT_SURRENDER_UPLOAD_FOLDER_ID) {
      try {
        return DriveApp.getFolderById(DEFAULT_SURRENDER_UPLOAD_FOLDER_ID);
      } catch (error) {
        // fall through to the spreadsheet parent folder
      }
    }
  }

  try {
    var spreadsheetFile = DriveApp.getFileById(spreadsheetId);
    var parents = spreadsheetFile.getParents();
    if (parents.hasNext()) {
      return parents.next();
    }
  } catch (error) {
    // fall back to the root folder below
  }

  return DriveApp.getRootFolder();
}

function createUploadFile_(folder, upload) {
  var fileName = sanitizeFileName_(String(upload.fileName || upload.fieldName || upload.question || "upload"));
  var parsed = parseDataUrl_(String(upload.dataUrl || ""));
  var mimeType = String(upload.mimeType || parsed.mimeType || "application/octet-stream").trim() || "application/octet-stream";
  var size = Number(upload.size || 0);

  if (size && size > DEFAULT_FOSTER_UPLOAD_MAX_BYTES) {
    throw new Error("Please choose a file smaller than 10 MB.");
  }

  if (parsed.bytes.length > DEFAULT_FOSTER_UPLOAD_MAX_BYTES) {
    throw new Error("Please choose a file smaller than 10 MB.");
  }

  var blob = Utilities.newBlob(parsed.bytes, mimeType, fileName);
  var file = folder.createFile(blob);

  return {
    question: String(upload.question || ""),
    fieldName: String(upload.fieldName || ""),
    fileName: fileName,
    fileId: file.getId(),
    url: file.getUrl(),
    mimeType: mimeType,
  };
}

function parseDataUrl_(dataUrl) {
  var match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("The uploaded file could not be read.");
  }

  return {
    mimeType: match[1],
    bytes: Utilities.base64Decode(match[2]),
  };
}

function sanitizeFileName_(value) {
  return String(value || "upload")
    .replace(/[\\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "upload";
}

function getOrCreateSheet(spreadsheetId, sheetName, sheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet && sheetId !== undefined && sheetId !== null && String(sheetId).trim() !== "") {
    const desiredSheetId = Number(sheetId);
    if (!Number.isNaN(desiredSheetId)) {
      const sheets = spreadsheet.getSheets();
      for (let index = 0; index < sheets.length; index += 1) {
        if (sheets[index].getSheetId() === desiredSheetId) {
          return sheets[index];
        }
      }
    }
  }

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
