# Food Calendar Sync Apps Script

This is a standalone Apps Script web app for Safescape food sponsorship calendar sync.

## What it does

- `GET ?action=foodCalendarDates`
  - returns blocked dates from the calendar as JSON
  - supports `callback=` for JSONP so the website can read it without CORS issues
- `POST ?action=foodCalendarSync`
  - creates all-day blocked events for the selected dates

## Deployment

1. Create a new Apps Script project.
2. Paste `Code.gs` and `appsscript.json`.
3. Enable the Calendar scope if Apps Script prompts you.
4. Deploy as a web app:
   - Execute as: `Me`
   - Who has access: `Anyone`
5. Copy the `/exec` URL.
6. Put that URL into `js/site-config.js` under:
   - `foodSponsorship.blockedDatesUrl`

## Calendar ID

The script uses this calendar by default:

`d66e0b3e3cf10931b4693cec161cfb49a48066ace2352e76cd470e127ce7fe9a@group.calendar.google.com`

You can override it later with a script property:

- `FOOD_SAFESCAPE_CALENDAR_ID`
