const FORM_DESTINATIONS = {
  adoption: {
    spreadsheetId: "PASTE_SPREADSHEET_ID_HERE",
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

const BASE_COLUMNS = [
  "submittedAt",
  "formType",
  "sourcePage",
  "fullName",
  "email",
  "phone",
  "city",
  "petInterested",
  "homeType",
  "otherPets",
  "experience",
  "skills",
  "availability",
  "existingPets",
  "duration",
  "petName",
  "petBreed",
  "petAge",
  "reason",
  "medicalNotes",
  "message"
];

function doPost(e) {
  const formType = (e.parameter.formType || "").trim();
  const destination = FORM_DESTINATIONS[formType];

  if (!destination) {
    return outputJson({ ok: false, error: "Unknown form type" });
  }

  const sheet = getOrCreateSheet(destination.spreadsheetId, destination.sheetName);
  ensureHeaders(sheet, BASE_COLUMNS);

  const row = BASE_COLUMNS.map((column) => e.parameter[column] || "");
  sheet.appendRow(row);

  return outputJson({ ok: true, formType: formType });
}

function getOrCreateSheet(spreadsheetId, sheetName) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  return sheet;
}

function ensureHeaders(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = firstRow.some(Boolean);

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function outputJson(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
