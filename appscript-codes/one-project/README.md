# One-Project Apps Script Bundle

Use this folder when recreating a single Apps Script project.

Files:

- `Code.gs`
  - Safescape form submission handler
  - writes to Sheets
  - sends the notification email
  - calls the Document Merge processor locally
- `DocumentMerge.gs`
  - Document Merge logic and sidebar helpers
  - the old webhook `doPost` has been renamed to `handleDocumentMergeWebhook_`
- `Index.html`
- `EmailEditor.html`
- `appsscript.json`

Paste all of these into one Apps Script project, then deploy once.
