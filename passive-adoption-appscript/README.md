# Passive Adoption Sheet Feed

This Apps Script bundle serves the passive adoption listing data as JSON for the website.

## Endpoint

- `GET ?action=passiveAdoptionStories`
- Optional `callback` parameter is supported for JSONP loading

## Sheet setup

The script reads from a sheet named `Passive Adoption` by default.

Recommended columns:

- `Timestamp`
- `Name of the dog`
- `Story of the dog`
- `Passively Adopted?`
- `Dog Photo`

For `Dog Photo`, use either:

- a direct image URL
- a Google Drive share link
- a Google Sheets `IMAGE(...)` formula

The feed converts Drive links into direct `lh3.googleusercontent.com` image URLs before the website renders them.

The feed also keeps a `storyText` field in each response so the website can render the full story body directly from the sheet.

Optional columns supported if you add them later:

- `Order`
- `Slug`
- `Status`
- `Photos`
- `Thumbnail`
- `Image alt`
- `Story URL`
- `Form URL`
- `Donation URL`

## Deployment

1. Create a new Apps Script project.
2. Paste `Code.gs` and `appsscript.json`.
3. Either bind it to the sheet or set `PASSIVE_ADOPTION_SPREADSHEET_ID` in Script Properties.
4. Deploy as a web app.
5. Copy the `/exec` URL into `window.SAFESCAPE_CONFIG.passiveAdoption.dataUrl`.

## Response shape

The website expects:

```json
{
  "ok": true,
  "stories": [
    {
      "slug": "example-dog",
      "name": "Example Dog",
      "storyLines": ["Line 1", "Line 2", "Line 3"],
      "preview": "Line 1 Line 2 Line 3",
      "photos": [
        { "src": "https://...", "alt": "Example Dog at Safescape" }
      ],
      "passiveAdopted": true,
      "formUrl": "passive-adoption-form.html",
      "donationUrl": "https://pages.razorpay.com/Safescape_Donation"
    }
  ]
}
```
