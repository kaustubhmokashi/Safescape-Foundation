/**
 * Safescape Foundation - Food Sponsorship payment tracker
 *
 * Endpoints (Web App /exec):
 * - GET  ?action=health
 * - GET  ?action=getStatus&request_id=...
 * - POST ?action=createPending            (frontend)
 * - POST ?action=razorpayWebhook&token=... (razorpay)
 */

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function authorizeUrlFetchNow() {
  var response = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  return response.getResponseCode();
}

function getRequiredProperty_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error('Missing script property: ' + key);
  }
  return String(value).trim();
}

function getOptionalProperty_(key, fallbackValue) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    return fallbackValue;
  }
  return String(value).trim();
}

function getSheet_() {
  var sheetId = getRequiredProperty_('PAYMENTS_SHEET_ID');
  var sheetName = getOptionalProperty_('PAYMENTS_SHEET_NAME', 'Payments');
  var spreadsheet = SpreadsheetApp.openById(sheetId);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

function nowIso_() {
  return new Date().toISOString();
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  var raw = String(e.postData.contents || '').trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function parseFormEncodedBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  var raw = String(e.postData.contents || '').trim();
  if (!raw) {
    return {};
  }
  var out = {};
  var parts = raw.split('&');
  for (var i = 0; i < parts.length; i += 1) {
    var part = parts[i];
    if (!part) {
      continue;
    }
    var eqIndex = part.indexOf('=');
    var key = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
    var value = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
    var decodedKey = decodeURIComponent(String(key || '').replace(/\+/g, ' '));
    var decodedValue = decodeURIComponent(String(value || '').replace(/\+/g, ' '));
    if (decodedKey) {
      out[decodedKey] = decodedValue;
    }
  }
  return out;
}

function parseBody_(e) {
  var body = {};
  try {
    body = parseJsonBody_(e);
    if (body && typeof body === 'object') {
      return body;
    }
  } catch (jsonError) {
    // Try form body below.
  }
  return parseFormEncodedBody_(e);
}

function toJsonString_(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback || '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function headersIndexMap_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('Payments sheet has no headers.');
  }
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i += 1) {
    map[String(headers[i] || '').trim()] = i + 1;
  }
  return map;
}

function normalizeHeaderKey_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findHeaderColumn_(map, key) {
  if (!map) {
    return 0;
  }
  var direct = map[key];
  if (direct) {
    return direct;
  }

  var normalizedTarget = normalizeHeaderKey_(key);
  var aliases = [normalizedTarget];
  if (normalizedTarget === 'selected_dates') {
    aliases = aliases.concat(['selecteddates', 'selected_date', 'date_selection', 'dates_selected']);
  } else if (normalizedTarget === 'request_id') {
    aliases = aliases.concat(['requestid']);
  } else if (normalizedTarget === 'payment_status') {
    aliases = aliases.concat(['status_payment', 'status']);
  } else if (normalizedTarget === 'calendar_status') {
    aliases = aliases.concat(['status_calendar']);
  }

  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i += 1) {
    var existingKey = keys[i];
    var normalizedExisting = normalizeHeaderKey_(existingKey);
    for (var j = 0; j < aliases.length; j += 1) {
      if (normalizedExisting === aliases[j]) {
        return map[existingKey];
      }
    }
  }

  return 0;
}

function findRowByRequestId_(sheet, map, requestId) {
  var col = findHeaderColumn_(map, 'request_id');
  if (!col || !requestId) {
    return 0;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  var values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === requestId) {
      return i + 2;
    }
  }
  return 0;
}

function findRowByPaymentLinkId_(sheet, map, paymentLinkId) {
  var col = findHeaderColumn_(map, 'razorpay_payment_link_id');
  if (!col || !paymentLinkId) {
    return 0;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  var values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === paymentLinkId) {
      return i + 2;
    }
  }
  return 0;
}

function findRowByPaymentId_(sheet, map, paymentId) {
  var col = findHeaderColumn_(map, 'razorpay_payment_id');
  if (!col || !paymentId) {
    return 0;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  var values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === paymentId) {
      return i + 2;
    }
  }
  return 0;
}

function findRowByOrderId_(sheet, map, orderId) {
  var col = findHeaderColumn_(map, 'razorpay_order_id');
  if (!col || !orderId) {
    return 0;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  var values = sheet.getRange(2, col, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === orderId) {
      return i + 2;
    }
  }
  return 0;
}

function findLatestPendingRowByEmail_(sheet, map, email) {
  var colEmail = findHeaderColumn_(map, 'email');
  var colStatus = findHeaderColumn_(map, 'payment_status');
  if (!colEmail || !colStatus || !email) {
    return 0;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  var rowCount = lastRow - 1;
  var emailValues = sheet.getRange(2, colEmail, rowCount, 1).getDisplayValues();
  var statusValues = sheet.getRange(2, colStatus, rowCount, 1).getDisplayValues();
  var targetEmail = String(email || '').trim().toLowerCase();

  for (var i = rowCount - 1; i >= 0; i -= 1) {
    var rowEmail = String(emailValues[i][0] || '').trim().toLowerCase();
    var rowStatus = String(statusValues[i][0] || '').trim().toLowerCase();
    if (rowEmail === targetEmail && (rowStatus === '' || rowStatus === 'pending')) {
      return i + 2;
    }
  }

  return 0;
}

function findBestPendingRowFallback_(sheet, map) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  var colFlow = findHeaderColumn_(map, 'flow_type');
  var colStatus = findHeaderColumn_(map, 'payment_status');
  var colSelectedDates = findHeaderColumn_(map, 'selected_dates');
  var colPaymentId = findHeaderColumn_(map, 'razorpay_payment_id');
  var colOrderId = findHeaderColumn_(map, 'razorpay_order_id');
  var colRequestId = findHeaderColumn_(map, 'request_id');
  var colCreatedAt = findHeaderColumn_(map, 'created_at');

  if (!colFlow || !colStatus || !colSelectedDates) {
    return 0;
  }

  var rowCount = lastRow - 1;
  var flowValues = sheet.getRange(2, colFlow, rowCount, 1).getDisplayValues();
  var statusValues = sheet.getRange(2, colStatus, rowCount, 1).getDisplayValues();
  var datesValues = sheet.getRange(2, colSelectedDates, rowCount, 1).getDisplayValues();
  var paymentValues = colPaymentId ? sheet.getRange(2, colPaymentId, rowCount, 1).getDisplayValues() : [];
  var orderValues = colOrderId ? sheet.getRange(2, colOrderId, rowCount, 1).getDisplayValues() : [];
  var requestValues = colRequestId ? sheet.getRange(2, colRequestId, rowCount, 1).getDisplayValues() : [];
  var createdValues = colCreatedAt ? sheet.getRange(2, colCreatedAt, rowCount, 1).getDisplayValues() : [];

  var now = new Date().getTime();
  var maxAgeMs = 20 * 60 * 1000; // 20 minutes

  for (var i = rowCount - 1; i >= 0; i -= 1) {
    var flow = String(flowValues[i][0] || '').trim().toLowerCase();
    var status = String(statusValues[i][0] || '').trim().toLowerCase();
    var selectedRaw = String(datesValues[i][0] || '').trim();
    var paymentId = colPaymentId ? String(paymentValues[i][0] || '').trim() : '';
    var orderId = colOrderId ? String(orderValues[i][0] || '').trim() : '';
    var requestId = colRequestId ? String(requestValues[i][0] || '').trim() : '';
    var createdAt = colCreatedAt ? String(createdValues[i][0] || '').trim() : '';

    if (flow !== 'food_sponsorship') {
      continue;
    }
    if (status && status !== 'pending') {
      continue;
    }
    if (!requestId || requestId.indexOf('req_food_') !== 0) {
      continue;
    }
    if (paymentId || orderId) {
      continue;
    }
    if (!parseSelectedDates_(selectedRaw).length) {
      continue;
    }
    if (createdAt) {
      var createdTs = new Date(createdAt).getTime();
      if (!isNaN(createdTs) && now - createdTs > maxAgeMs) {
        continue;
      }
    }
    return i + 2;
  }

  return 0;
}

function updateCellIfPresent_(sheet, map, row, key, value) {
  var col = findHeaderColumn_(map, key);
  if (!col || !row) {
    return;
  }
  sheet.getRange(row, col).setValue(value);
}

function getCellByHeader_(sheet, map, row, key) {
  var col = findHeaderColumn_(map, key);
  if (!col || !row) {
    return '';
  }
  return String(sheet.getRange(row, col).getDisplayValue() || '').trim();
}

function parseSelectedDates_(rawValue) {
  var text = String(rawValue || '').trim();
  if (!text) {
    return [];
  }
  try {
    var parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(function(item) { return String(item || '').trim(); }).filter(Boolean);
    }
  } catch (error) {
    // fallback to CSV-like parsing
  }
  return text.split(',').map(function(item) { return String(item || '').trim(); }).filter(Boolean);
}

function blockCalendarForPaidRow_(sheet, map, row) {
  var syncUrl = getOptionalProperty_(
    'FOOD_CALENDAR_SYNC_URL',
    'https://script.google.com/macros/s/AKfycby4GeBE20UNjrquVn2NlhrKtN3cNUIliUPU8LO4XYp0RTV_BSvLFR4w8rD_9B5IH87O9A/exec'
  );
  if (!syncUrl) {
    updateCellIfPresent_(sheet, map, row, 'calendar_status', 'error');
    updateCellIfPresent_(sheet, map, row, 'calendar_error', 'Missing FOOD_CALENDAR_SYNC_URL');
    return;
  }

  var status = getCellByHeader_(sheet, map, row, 'calendar_status').toLowerCase();
  if (status === 'blocked' || status === 'processing') {
    return;
  }

  var selectedDates = parseSelectedDates_(getCellByHeader_(sheet, map, row, 'selected_dates'));
  if (!selectedDates.length) {
    updateCellIfPresent_(sheet, map, row, 'calendar_status', 'error');
    updateCellIfPresent_(sheet, map, row, 'calendar_error', 'No selected_dates found for paid row');
    return;
  }

  var payload = {
    action: 'foodCalendarSync',
    formType: 'foodSponsorship',
    selectedDates: selectedDates,
    occasion: getCellByHeader_(sheet, map, row, 'occasion'),
    email: getCellByHeader_(sheet, map, row, 'email'),
    sourcePage: 'food-sponsorship-webhook'
  };

  try {
    updateCellIfPresent_(sheet, map, row, 'calendar_status', 'processing');
    updateCellIfPresent_(sheet, map, row, 'calendar_error', '');

    var response = UrlFetchApp.fetch(syncUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = String(response.getContentText() || '').trim();
    if (code < 200 || code >= 300) {
      updateCellIfPresent_(sheet, map, row, 'calendar_status', 'error');
      updateCellIfPresent_(sheet, map, row, 'calendar_error', 'Calendar sync HTTP ' + code + ': ' + body);
      return;
    }

    var eventIds = '';
    try {
      var parsed = body ? JSON.parse(body) : {};
      if (parsed && Array.isArray(parsed.eventIds)) {
        eventIds = JSON.stringify(parsed.eventIds);
      }
    } catch (parseError) {
      // ignore parsing failure; status can still be blocked
    }

    updateCellIfPresent_(sheet, map, row, 'calendar_status', 'blocked');
    updateCellIfPresent_(sheet, map, row, 'calendar_event_ids', eventIds);
    updateCellIfPresent_(sheet, map, row, 'calendar_error', '');
  } catch (error) {
    updateCellIfPresent_(sheet, map, row, 'calendar_status', 'error');
    updateCellIfPresent_(sheet, map, row, 'calendar_error', String(error && error.message || error));
  }
}

function appendPendingRow_(payload) {
  var sheet = getSheet_();
  var map = headersIndexMap_(sheet);

  var requestId = String(payload.request_id || '').trim();
  if (!requestId) {
    throw new Error('request_id is required');
  }

  var existingRow = findRowByRequestId_(sheet, map, requestId);
  if (existingRow) {
    updateCellIfPresent_(sheet, map, existingRow, 'updated_at', nowIso_());
    return {
      request_id: requestId,
      row: existingRow,
      duplicate: true
    };
  }

  var rowValues = [];
  var totalColumns = sheet.getLastColumn();
  for (var i = 1; i <= totalColumns; i += 1) {
    rowValues.push('');
  }

  function put_(key, value) {
    var col = findHeaderColumn_(map, key);
    if (!col) {
      return;
    }
    rowValues[col - 1] = value;
  }

  var now = nowIso_();
  put_('created_at', now);
  put_('updated_at', now);
  put_('request_id', requestId);
  put_('flow_type', String(payload.flow_type || 'food_sponsorship'));
  put_('email', String(payload.email || ''));
  put_('occasion', String(payload.occasion || ''));
  var selectedDates = payload.selected_dates;
  if (typeof selectedDates === 'string') {
    try {
      var parsedDates = JSON.parse(selectedDates);
      selectedDates = Array.isArray(parsedDates) ? parsedDates : selectedDates;
    } catch (error) {
      // keep raw string fallback
    }
  }
  put_('selected_dates', toJsonString_(selectedDates, '[]'));
  put_('razorpay_payment_link_id', String(payload.razorpay_payment_link_id || ''));
  put_('razorpay_payment_link_url', String(payload.razorpay_payment_link_url || ''));
  put_('payment_status', String(payload.payment_status || 'pending'));
  put_('calendar_status', String(payload.calendar_status || 'not_started'));
  put_('notes', String(payload.notes || ''));

  sheet.appendRow(rowValues);
  var row = sheet.getLastRow();

  return {
    request_id: requestId,
    row: row,
    duplicate: false
  };
}

function getStatusByRequestId_(requestId) {
  var sheet = getSheet_();
  var map = headersIndexMap_(sheet);
  var row = findRowByRequestId_(sheet, map, requestId);

  if (!row) {
    return {
      ok: false,
      found: false,
      request_id: requestId
    };
  }

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var values = sheet.getRange(row, 1, 1, lastCol).getDisplayValues()[0];
  var item = {};
  for (var i = 0; i < headers.length; i += 1) {
    item[String(headers[i] || '').trim()] = values[i];
  }

  return {
    ok: true,
    found: true,
    request_id: requestId,
    item: item
  };
}

function upsertWebhookEvent_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
  var sheet = getSheet_();
  var map = headersIndexMap_(sheet);

  var eventName = String(payload.event || '');
  var paymentEntity = payload.payload && payload.payload.payment && payload.payload.payment.entity;
  var orderEntity = payload.payload && payload.payload.order && payload.payload.order.entity;
  var paymentLinkEntity = payload.payload && payload.payload.payment_link && payload.payload.payment_link.entity;

  var paymentId = paymentEntity && paymentEntity.id ? String(paymentEntity.id) : '';
  var orderId = orderEntity && orderEntity.id ? String(orderEntity.id) : '';
  var method = paymentEntity && paymentEntity.method ? String(paymentEntity.method) : '';
  var payerEmail = paymentEntity && paymentEntity.email ? String(paymentEntity.email) : '';
  var paymentLinkId = '';

  if (paymentLinkEntity && paymentLinkEntity.id) {
    paymentLinkId = String(paymentLinkEntity.id);
  }
  if (!paymentLinkId && paymentEntity && paymentEntity.notes && paymentEntity.notes.payment_link_id) {
    paymentLinkId = String(paymentEntity.notes.payment_link_id);
  }

  var row = 0;
  if (paymentId) {
    row = findRowByPaymentId_(sheet, map, paymentId);
  }
  if (!row && orderId) {
    row = findRowByOrderId_(sheet, map, orderId);
  }
  if (!row) {
    row = findRowByPaymentLinkId_(sheet, map, paymentLinkId);
  }
  if (!row && payerEmail) {
    row = findLatestPendingRowByEmail_(sheet, map, payerEmail);
  }
  if (!row) {
    row = findBestPendingRowFallback_(sheet, map);
  }

  if (!row) {
    var requestId = 'webhook_' + new Date().getTime();
    var appendResult = appendPendingRow_({
      request_id: requestId,
      flow_type: 'food_sponsorship',
      payment_status: 'pending',
      calendar_status: 'not_started',
      razorpay_payment_link_id: paymentLinkId,
      notes: 'Auto-created from webhook because request row was not found.'
    });
    row = appendResult.row;
  }

  var now = nowIso_();
  var previousPaymentStatus = String(getCellByHeader_(sheet, map, row, 'payment_status') || '').trim().toLowerCase();
  var currentCalendarStatus = String(getCellByHeader_(sheet, map, row, 'calendar_status') || '').trim().toLowerCase();
  updateCellIfPresent_(sheet, map, row, 'updated_at', now);
  updateCellIfPresent_(sheet, map, row, 'last_webhook_at', now);
  updateCellIfPresent_(sheet, map, row, 'razorpay_event', eventName);
  updateCellIfPresent_(sheet, map, row, 'razorpay_payment_link_id', paymentLinkId);
  updateCellIfPresent_(sheet, map, row, 'razorpay_payment_id', paymentId);
  updateCellIfPresent_(sheet, map, row, 'razorpay_order_id', orderId);
  updateCellIfPresent_(sheet, map, row, 'payment_method', method);

  if (eventName === 'payment.captured' || eventName === 'order.paid') {
    updateCellIfPresent_(sheet, map, row, 'payment_status', 'paid');
    updateCellIfPresent_(sheet, map, row, 'paid_at', now);
    // Retry-friendly idempotency:
    // - avoid duplicate event creation when already blocked/processing
    // - still allow retry on later success webhook if a previous block attempt failed
    if (currentCalendarStatus !== 'blocked' && currentCalendarStatus !== 'processing') {
      blockCalendarForPaidRow_(sheet, map, row);
    }
  } else if (eventName === 'payment.failed') {
    updateCellIfPresent_(sheet, map, row, 'payment_status', 'failed');
  }

  return {
    row: row,
    payment_link_id: paymentLinkId,
    event: eventName,
    payment_id: paymentId,
    order_id: orderId
  };
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var action = String((e && e.parameter && e.parameter.action) || 'health').trim();

    if (action === 'createPending') {
      var pendingResult = appendPendingRow_(e && e.parameter ? e.parameter : {});
      return jsonResponse({
        ok: true,
        action: action,
        request_id: pendingResult.request_id,
        row: pendingResult.row,
        duplicate: pendingResult.duplicate
      });
    }

    if (action === 'getStatus') {
      var requestId = String((e && e.parameter && e.parameter.request_id) || '').trim();
      if (!requestId) {
        return jsonResponse({ ok: false, error: 'request_id is required' });
      }
      return jsonResponse(getStatusByRequestId_(requestId));
    }

    return jsonResponse({
      ok: true,
      action: action,
      message: 'Safescape food sponsorship webhook is live',
      timestamp: nowIso_()
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message || error) });
  }
}

function doPost(e) {
  try {
    var payload = parseBody_(e);
    var action = String((e && e.parameter && e.parameter.action) || (payload && payload.action) || '').trim();
    var looksLikeWebhook = Boolean(payload && payload.event && payload.payload);

    if (action === 'createPending') {
      var result = appendPendingRow_(payload);
      return jsonResponse({
        ok: true,
        action: action,
        request_id: result.request_id,
        row: result.row,
        duplicate: result.duplicate
      });
    }

    if (action === 'razorpayWebhook' || (!action && looksLikeWebhook)) {
      var expectedToken = getOptionalProperty_('RAZORPAY_WEBHOOK_TOKEN', '');
      var providedToken = String((e && e.parameter && e.parameter.token) || '').trim();

      // Only enforce token when action route is explicitly used.
      if (action === 'razorpayWebhook' && expectedToken && providedToken !== expectedToken) {
        return jsonResponse({ ok: false, error: 'Unauthorized webhook token' });
      }

      var webhookResult = upsertWebhookEvent_(payload);

      return jsonResponse({
        ok: true,
        action: action || 'razorpayWebhook:auto',
        event: webhookResult.event,
        row: webhookResult.row,
        payment_link_id: webhookResult.payment_link_id,
        payment_id: webhookResult.payment_id,
        order_id: webhookResult.order_id
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown action' });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message || error) });
  }
}
