const FOOD_CALENDAR_ID = "d66e0b3e3cf10931b4693cec161cfb49a48066ace2352e76cd470e127ce7fe9a@group.calendar.google.com";

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "").trim();
  const callback = String((e && e.parameter && e.parameter.callback) || "").trim();

  if (action === "foodCalendarDates") {
    try {
      return outputResponse_(
        {
        ok: true,
        blockedDates: getBlockedFoodCalendarDates_()
        },
        callback
      );
    } catch (error) {
      return outputResponse_(
        {
          ok: false,
          error: String(error && error.message ? error.message : error),
          blockedDates: []
        },
        callback
      );
    }
  }

  return outputResponse_({ ok: true, status: "ready" }, callback);
}

function doPost(e) {
  const payload = parsePayload_(e);
  const action = String((payload && payload.action) || "").trim();

  if (action !== "foodCalendarSync") {
    return outputJson({ ok: false, error: "Unknown action" });
  }

  try {
    return outputJson({
      ok: true,
      synced: syncBlockedFoodCalendarDates_(payload)
    });
  } catch (error) {
    return outputJson({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function parsePayload_(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (error) {
    // Fall through to parameter parsing.
  }

  return Object.assign({}, (e && e.parameter) || {});
}

function outputJson(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function outputResponse_(payload, callback) {
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${json});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return outputJson(payload);
}

function getFoodCalendarId_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const propertyKeys = ["FOOD_SAFESCAPE_CALENDAR_ID", "FOOD_SPONSOR_CALENDAR_ID", "FOOD_CALENDAR_ID"];

  for (let index = 0; index < propertyKeys.length; index += 1) {
    const value = String(scriptProperties.getProperty(propertyKeys[index]) || "").trim();
    if (value) {
      return value;
    }
  }

  return FOOD_CALENDAR_ID;
}

function getFoodCalendar_() {
  const calendarId = getFoodCalendarId_();
  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    throw new Error(`Food sponsorship calendar not found: ${calendarId}`);
  }

  return calendar;
}

function getBlockedFoodCalendarDates_() {
  const calendar = getFoodCalendar_();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + 18);

  const events = calendar.getEvents(today, horizon);
  const blockedDates = {};

  events.forEach((event) => {
    collectBlockedDatesFromEvent_(event, blockedDates);
  });

  return Object.keys(blockedDates).sort();
}

function collectBlockedDatesFromEvent_(event, blockedDates) {
  const start = event.getStartTime();
  const end = event.getEndTime();
  const current = new Date(start);
  const last = new Date(end.getTime() - 1);

  current.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);

  while (current.getTime() <= last.getTime()) {
    blockedDates[formatDateKey_(current)] = true;
    current.setDate(current.getDate() + 1);
  }
}

function syncBlockedFoodCalendarDates_(payload) {
  const calendar = getFoodCalendar_();
  const selectedDates = normalizeDateKeys_(payload && payload.selectedDates);
  const selectedDays = Number(payload && payload.selectedDays ? payload.selectedDays : 0);
  const sourcePage = String((payload && payload.sourcePage) || "").trim();
  const occasion = String((payload && payload.occasion) || "").trim();
  const email = String((payload && payload.email) || "").trim();
  const created = [];
  const description = [
    `Source: ${sourcePage || "food-sponsorship"}`,
    occasion ? `Occasion: ${occasion}` : "Occasion: (not provided)",
    email ? `Email: ${email}` : "Email: (not provided)",
    `Selected days: ${selectedDays || selectedDates.length || 0}`,
    `Created on: ${new Date().toISOString()}`
  ].join("\n");
  const title = occasion
    ? `${occasion} | Food Sponsorship | Safescape Foundation`
    : "Food Sponsorship | Safescape Foundation";

  selectedDates.forEach((dateKey) => {
    const date = parseDateKey_(dateKey);
    if (!date) {
      return;
    }
    const event = calendar.createAllDayEvent(title, date, {
      description: description
    });
    if (event && email) {
      event.addGuest(email);
    }
    created.push(dateKey);
  });

  return created;
}

function normalizeDateKeys_(dates) {
  const list = Array.isArray(dates) ? dates : [];
  const seen = {};
  const result = [];

  list.forEach((value) => {
    const dateKey = formatDateKey_(value);
    if (dateKey && !seen[dateKey]) {
      seen[dateKey] = true;
      result.push(dateKey);
    }
  });

  return result;
}

function parseDateKey_(value) {
  if (!value) {
    return null;
  }

  const parts = String(value).split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateKey_(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? new Date(value.getTime()) : parseDateKey_(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
