const PASSIVE_ADOPTION_DEFAULT_SHEET_NAME = "Passive Adoption";

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "").trim();
  const callback = String((e && e.parameter && e.parameter.callback) || "").trim();

  if (action === "passiveAdoptionStories") {
    try {
      return outputResponse_({
        ok: true,
        stories: getPassiveAdoptionStories_()
      }, callback);
    } catch (error) {
      return outputResponse_({
        ok: false,
        error: String(error && error.message ? error.message : error),
        stories: []
      }, callback);
    }
  }

  return outputResponse_({ ok: true, status: "ready" }, callback);
}

function outputResponse_(payload, callback) {
  const json = JSON.stringify(payload);
  if (callback) {
    const safeCallback = String(callback || "").replace(/[^a-zA-Z0-9_.$]/g, "");
    return ContentService.createTextOutput(safeCallback + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getPassiveAdoptionStories_() {
  const sheet = getPassiveAdoptionSheet_();
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  const formulas = range.getFormulas();
  const richTextValues = range.getRichTextValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(function(header) {
    return normalizeHeaderKey_(header);
  });
  const stories = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const record = buildRowRecord_(
      headers,
      values[rowIndex],
      displayValues[rowIndex] || [],
      formulas[rowIndex] || [],
      richTextValues[rowIndex] || []
    );
    const story = normalizePassiveAdoptionStory_(
      record,
      rowIndex,
      values[rowIndex] || [],
      displayValues[rowIndex] || [],
      formulas[rowIndex] || [],
      richTextValues[rowIndex] || [],
      headers
    );
    if (story) {
      stories.push(story);
    }
  }

  stories.sort(function(a, b) {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : Number(a.sourceIndex || 0);
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : Number(b.sourceIndex || 0);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return Number(a.sourceIndex || 0) - Number(b.sourceIndex || 0);
  });

  return stories;
}

function getPassiveAdoptionSheet_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const spreadsheetId = String(scriptProperties.getProperty("PASSIVE_ADOPTION_SPREADSHEET_ID") || "").trim();
  const sheetName = String(scriptProperties.getProperty("PASSIVE_ADOPTION_SHEET_NAME") || "").trim() || PASSIVE_ADOPTION_DEFAULT_SHEET_NAME;

  let spreadsheet = null;
  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  }

  if (!spreadsheet) {
    throw new Error("Passive adoption spreadsheet not found. Set PASSIVE_ADOPTION_SPREADSHEET_ID or bind the script to the sheet.");
  }

  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.getSheets()[0];
  if (!sheet) {
    throw new Error(`Passive adoption sheet not found: ${sheetName}`);
  }

  return sheet;
}

function buildRowRecord_(headers, rowValues, rowDisplayValues, rowFormulas, rowRichTexts) {
  const record = {};
  headers.forEach(function(header, index) {
    if (header) {
      record[header] = normalizePassiveAdoptionCellValue_(
        rowValues[index],
        rowDisplayValues && rowDisplayValues[index] ? rowDisplayValues[index] : "",
        rowFormulas && rowFormulas[index] ? rowFormulas[index] : "",
        rowRichTexts && rowRichTexts[index] ? rowRichTexts[index] : null
      );
      record[header + "__display"] = String(rowDisplayValues && rowDisplayValues[index] ? rowDisplayValues[index] : "").trim();
      record[header + "__formula"] = rowFormulas && rowFormulas[index] ? rowFormulas[index] : "";
      const richText = rowRichTexts && rowRichTexts[index];
      if (richText && typeof richText.getLinkUrl === "function") {
        record[header + "__linkurl"] = richText.getLinkUrl() || "";
      }
    }
  });
  return record;
}

function normalizePassiveAdoptionCellValue_(rawValue, displayValue, formula, richText) {
  if (rawValue === null || rawValue === undefined) {
    return String(displayValue || "").trim();
  }

  if (richText && typeof richText.getText === "function") {
    try {
      const text = String(richText.getText() || "").trim();
      if (text) {
        return text;
      }
    } catch (error) {
      // ignore and continue
    }
  }

  const valueType = typeof rawValue;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return rawValue;
  }

  const objectUrl = extractPassiveAdoptionObjectUrl_(rawValue);
  if (objectUrl) {
    return objectUrl;
  }

  if (richText && typeof richText.getLinkUrl === "function") {
    const linkUrl = richText.getLinkUrl();
    if (linkUrl) {
      return linkUrl;
    }
  }

  if (formula) {
    const formulaUrl = extractImageUrlFromFormula_(formula);
    if (formulaUrl) {
      return formulaUrl;
    }
  }

  const displayText = String(displayValue || "").trim();
  if (/^\[object Object\]$/i.test(displayText)) {
    return "";
  }

  return displayText;
}

function normalizePassiveAdoptionStory_(record, index, rowValues, rowDisplayValues, rowFormulas, rowRichTexts, headers) {
  const name = String(
    (rowDisplayValues && rowDisplayValues[1]) ||
    lookupPassiveAdoptionDisplayValue_(record, ["nameofthedog", "dogname", "name", "title", "storyname"]) ||
    lookupPassiveAdoptionValue_(record, ["nameofthedog", "dogname", "name", "title", "storyname"]) ||
    ""
  ).trim();
  const safeName = name || `Dog ${index}`;
  const slugRaw = String(lookupPassiveAdoptionValue_(record, ["slug", "dogslug", "storyslug", "id"]) || "").trim();
  const slug = slugRaw || slugify_(safeName) || `dog-${index}`;
  const status = String(lookupPassiveAdoptionValue_(record, ["status", "passiveadoptionstatus"]) || "").trim();
  const adoptedValue = String(
    lookupPassiveAdoptionValue_(record, ["passivelyadopted", "passiveadopted", "adoptedpassively", "adopted"])
  ).trim().toLowerCase();
  const storyText = String(
    (rowDisplayValues && rowDisplayValues[2]) ||
    lookupPassiveAdoptionValue_(record, ["storyofthedog", "story", "storytext", "description", "bio", "content"]) ||
    lookupPassiveAdoptionDisplayValue_(record, ["storyofthedog", "story", "storytext", "description", "bio", "content"]) ||
    ""
  ).trim();
  const storyLines = splitStoryLines_(storyText);
  const preview = storyLines.slice(0, 3).join(" ") || storyText;
  const imageAlt = String(lookupPassiveAdoptionValue_(record, ["imagealt", "thumbnailalt", "alttext"]) || "").trim() || `${safeName} at Safescape`;
  const healthStatus = String(
    lookupPassiveAdoptionValue_(record, ["healthyorill", "healthstatus", "medicalstatus"]) ||
    lookupPassiveAdoptionDisplayValue_(record, ["healthyorill", "healthstatus", "medicalstatus"]) ||
    ""
  ).trim();
  const photos = collectStoryPhotos_(
    record,
    safeName,
    (rowDisplayValues && rowDisplayValues[4]) ||
    lookupPassiveAdoptionValue_(record, ["dogphoto", "image", "thumbnail", "coverimage"])
  );
  const firstPhoto = photos[0] || { src: "", alt: imageAlt };
  const storyUrl = String(lookupPassiveAdoptionValue_(record, ["storyurl", "pageurl", "storypageurl", "detailurl"]) || "").trim() || `adopt-passively.html?story=${encodeURIComponent(slug)}`;
  const formUrl = String(lookupPassiveAdoptionValue_(record, ["formurl", "adopturl", "passiveadoptionform", "passiveadoptionurl"]) || "").trim() || "passive-adoption-form.html";
  const donationUrl = String(lookupPassiveAdoptionValue_(record, ["donationurl", "donateurl", "monthlydonationurl"]) || "").trim() || "https://pages.razorpay.com/Safescape_Donation";
  const orderValue = Number(lookupPassiveAdoptionValue_(record, ["order", "sortorder", "priority"]));
  const passiveAdopted = isPassivelyAdopted_(adoptedValue, status);
  const needsMedicalAttention = isPassiveAdoptionIll_(healthStatus);

  if (!name || !photos.length) {
    return null;
  }

  return {
      slug: slug,
      name: safeName,
      passiveAdopted: passiveAdopted,
      passiveAdoptionStatus: status,
      healthStatus: healthStatus,
      needsMedicalAttention: needsMedicalAttention,
      image: firstPhoto.src || "",
      imageAlt: imageAlt,
      photos: photos.length ? photos : firstPhoto.src ? [firstPhoto] : [],
      storyText: storyText,
      preview: preview,
      storyLines: storyLines.length ? storyLines : preview ? [preview] : [],
      storyUrl: storyUrl,
      formUrl: formUrl,
      donationUrl: donationUrl,
      order: Number.isFinite(orderValue) ? orderValue : index,
      sourceIndex: index
    };
  }

function isPassiveAdoptionIll_(healthStatus) {
  const normalized = String(healthStatus || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (/^healthy\b/.test(normalized)) {
    return false;
  }

  return (
    normalized === "ill" ||
    normalized === "sick" ||
    normalized === "needs extra medical attention" ||
    normalized === "needs medical attention" ||
    normalized.includes("ill") ||
    normalized.includes("sick") ||
    normalized.includes("medical")
  );
}

function lookupPassiveAdoptionValue_(record, aliases) {
  const keys = Array.isArray(aliases) ? aliases : [aliases];
  for (let index = 0; index < keys.length; index += 1) {
    const key = normalizeHeaderKey_(keys[index]);
    if (key && Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return "";
}

function lookupPassiveAdoptionDisplayValue_(record, aliases) {
  const keys = Array.isArray(aliases) ? aliases : [aliases];
  for (let index = 0; index < keys.length; index += 1) {
    const key = normalizeHeaderKey_(keys[index]);
    const displayKey = key + "__display";
    if (displayKey && Object.prototype.hasOwnProperty.call(record, displayKey)) {
      return record[displayKey];
    }
  }
  return "";
}

function collectStoryPhotos_(record, name, fallbackImage) {
  const photoValues = [];
  const addValue = function(value) {
    splitMultiValue_(value).forEach(function(item) {
      if (item) {
        const converted = convertToLh3ImageUrl_(item);
        if (converted) {
          photoValues.push(converted);
        }
      }
    });
  };

  const addFormulaValue = function(value, formula) {
    const parsed = extractImageUrlFromFormula_(formula);
    if (parsed) {
      const converted = convertToLh3ImageUrl_(parsed);
      if (converted) {
        photoValues.push(converted);
      }
      return;
    }
    if (value) {
      addValue(value);
    }
  };

  addValue(lookupPassiveAdoptionValue_(record, ["photos", "photourls", "gallery", "galleryphotos", "imageurls"]));
  addValue(lookupPassiveAdoptionLinkUrl_(record, ["photos", "photourls", "gallery", "galleryphotos", "imageurls"]));
  addFormulaValue(
    lookupPassiveAdoptionValue_(record, ["dogphoto", "thumbnail", "coverimage", "mainphoto", "image"]) || lookupPassiveAdoptionLinkUrl_(record, ["dogphoto", "thumbnail", "coverimage", "mainphoto", "image"]),
    lookupPassiveAdoptionFormula_(record, ["dogphoto", "thumbnail", "coverimage", "mainphoto", "image"])
  );

  Object.keys(record).forEach(function(key) {
    if (/^(photo|image)\d+$/.test(key) || /^gallery\d+$/.test(key)) {
      addValue(record[key]);
    }
  });

  if (fallbackImage) {
    addValue(fallbackImage);
  }

  const seen = {};
  return photoValues
    .map(function(src) {
      return String(src || "").trim();
    })
    .filter(function(src) {
      if (!src || seen[src]) {
        return false;
      }
      seen[src] = true;
      return true;
    })
    .map(function(src) {
      return {
        src: src,
        alt: `${name} at Safescape`
      };
    });
}

function lookupPassiveAdoptionFormula_(record, aliases) {
  const keys = Array.isArray(aliases) ? aliases : [aliases];
  for (let index = 0; index < keys.length; index += 1) {
    const key = normalizeHeaderKey_(keys[index]);
    const formulaKey = key + "__formula";
    if (formulaKey && Object.prototype.hasOwnProperty.call(record, formulaKey)) {
      return record[formulaKey];
    }
  }
  return "";
}

function lookupPassiveAdoptionLinkUrl_(record, aliases) {
  const keys = Array.isArray(aliases) ? aliases : [aliases];
  for (let index = 0; index < keys.length; index += 1) {
    const key = normalizeHeaderKey_(keys[index]);
    const linkKey = key + "__linkurl";
    if (linkKey && Object.prototype.hasOwnProperty.call(record, linkKey)) {
      return record[linkKey];
    }
  }
  return "";
}

function extractImageUrlFromFormula_(formula) {
  const text = String(formula || "").trim();
  if (!text) {
    return "";
  }

  const match = text.match(/IMAGE\(\s*"([^"]+)"\s*(?:,\s*[^)]*)?\)/i) || text.match(/IMAGE\(\s*'([^']+)'\s*(?:,\s*[^)]*)?\)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  return "";
}

function extractPassiveAdoptionObjectUrl_(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const candidates = ["getContentUrl", "getSourceUrl", "getUrl"];
  for (let index = 0; index < candidates.length; index += 1) {
    const methodName = candidates[index];
    if (typeof value[methodName] === "function") {
      try {
        const result = value[methodName]();
        if (result) {
          return String(result).trim();
        }
      } catch (error) {
        // ignore and continue
      }
    }
  }

  const propertyCandidates = [value.url, value.src, value.href, value.contentUrl, value.sourceUrl];
  for (let index = 0; index < propertyCandidates.length; index += 1) {
    const candidate = propertyCandidates[index];
    if (candidate) {
      return String(candidate).trim();
    }
  }

  return "";
}

function convertToLh3ImageUrl_(value) {
  const raw = String(value || "").trim();
  if (!raw || /^\[object Object\]$/i.test(raw)) {
    return "";
  }

  if (/^https:\/\/lh3\.googleusercontent\.com\//i.test(raw)) {
    return raw.includes("=w") || raw.includes("=h") || raw.includes("=d")
      ? raw
      : raw.replace(/\/d\/([-\w]{10,})/i, "/d/$1=w1600");
  }

  const fileId = extractDriveFileId_(raw);
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w1600`;
  }

  return raw;
}

function extractDriveFileId_(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const patterns = [
    /(?:https?:\/\/drive\.google\.com\/file\/d\/)([-\w]{10,})/i,
    /(?:https?:\/\/drive\.google\.com\/open\?id=)([-\w]{10,})/i,
    /(?:https?:\/\/drive\.google\.com\/uc\?id=)([-\w]{10,})/i,
    /(?:https?:\/\/drive\.google\.com\/uc\?export=download&id=)([-\w]{10,})/i,
    /(?:https?:\/\/docs\.google\.com\/uc\?id=)([-\w]{10,})/i,
    /(?:https?:\/\/lh3\.googleusercontent\.com\/d\/)([-\w]{10,})/i
  ];

  for (let index = 0; index < patterns.length; index += 1) {
    const match = text.match(patterns[index]);
    if (match && match[1]) {
      return match[1];
    }
  }

  return "";
}

function splitMultiValue_(value) {
  return String(value || "")
    .split(/[\n,|;]+/)
    .map(function(item) {
      return item.trim();
    })
    .filter(Boolean);
}

function splitStoryLines_(value) {
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }

  const lines = text
    .split(/\r?\n+/)
    .map(function(line) {
      return line.trim();
    })
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  return (text.match(/[^.!?]+[.!?]?/g) || [text])
    .map(function(line) {
      return line.trim();
    })
    .filter(Boolean);
}

function isPassivelyAdopted_(adoptedValue, status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedAdopted = String(adoptedValue || "").trim().toLowerCase();
  return (
    normalizedAdopted === "true" ||
    normalizedAdopted === "yes" ||
    normalizedAdopted === "1" ||
    normalizedStatus === "passively adopted" ||
    normalizedStatus === "passive adopted"
  );
}

function normalizeHeaderKey_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function slugify_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
