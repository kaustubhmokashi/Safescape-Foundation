# Safescape Foundation Static Website

A static HTML/CSS/JS rebuild of the current `safescapefoundation.com` experience, designed for GitHub hosting.

## What is included

- A GitHub Pages-friendly static site
- Safescape home page content based on the live site
- Dedicated landing pages for adoption, volunteer, foster, and surrender applications
- Google Sheets integration via Google Apps Script
- Instagram post sync for a target professional account using Business Discovery
- Privacy, terms, and disclaimer pages

## Project structure

- `index.html`: main site
- `apply-for-adoption.html`, `application-to-surrender.html`, `sign-up-as-foster.html`, `become-a-volunteer.html`: dedicated form landing pages
- `styles.css`: shared styling for the whole site and the policy pages
- `js/site-config.js`: integration settings you will edit
- `js/site-data.js`: adoptable pet data and form schema definitions
- `js/main.js`: rendering, form switching, and Instagram logic
- `Privacy-Policy.html`, `Terms-and-Conditions.html`, `Disclaimers.html`: policy pages
- `google-apps-script/Code.gs`: Google Apps Script example for writing form data to Sheets
- `scripts/fetch-instagram.mjs`: server-side Instagram Business Discovery sync script for posts
- `.github/workflows/instagram-sync.yml`: hourly GitHub Action that refreshes the Instagram post JSON

## GitHub Pages deployment

1. Create a new GitHub repository and upload these files.
2. In GitHub, open `Settings` → `Pages`.
3. Set the source to deploy from the main branch root.
4. If you want to keep using `safescapefoundation.com`, add a `CNAME` file later and point the domain DNS to GitHub Pages.

## Google Sheets form setup

The website uses standard HTML form posts to a Google Apps Script web app. This avoids CORS problems on static hosting.

### Step 1: Prepare the Sheets

Create either:
- one spreadsheet with separate tabs named `Adoption`, `Volunteer`, `Foster`, and `Surrender`
- or separate spreadsheets if you prefer, then update the IDs in `Code.gs`

### Step 2: Deploy the Apps Script

1. Go to [script.google.com](https://script.google.com).
2. Create a new Apps Script project.
3. Paste in the contents of `google-apps-script/Code.gs`.
4. Replace each `PASTE_SPREADSHEET_ID_HERE` with the actual spreadsheet ID.
5. Click `Deploy` → `New deployment`.
6. Choose `Web app`.
7. Set access to `Anyone`.
8. Deploy and copy the web app URL.

### Step 3: Connect the site

Open `js/site-config.js` and set:

```js
window.SAFESCAPE_CONFIG = {
  forms: {
    webAppUrl: "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL"
  }
};
```

After that, the live website form pages will submit directly into the configured Google Sheets.

## Instagram feed setup

This repo now uses a GitHub Pages-safe Business Discovery pattern:

- fetch Instagram data server-side in GitHub Actions
- store the result in a static JSON file inside the repo
- render posts from that JSON file in the frontend

This keeps the site static while keeping Instagram access tokens out of browser code.

### What gets synced

- `data/instagram-posts.json`: latest posts in sequence, newest first

### How this flow works

- `IG_AUTH_USER_ID`: the Instagram professional account ID that belongs to the account you authenticate with
- `IG_ACCESS_TOKEN`: the server-side token tied to that authenticated account
- `TARGET_IG_USERNAME`: the professional Instagram username you actually want to display on the website

The sync script uses Meta's Business Discovery flow to fetch media from the target professional account by username.

### Step 1: Add GitHub secrets

In your GitHub repository, open `Settings` → `Secrets and variables` → `Actions` and add:

- `IG_AUTH_USER_ID`
- `IG_ACCESS_TOKEN`
- `TARGET_IG_USERNAME`

`IG_ACCESS_TOKEN` should be a server-side token suitable for the Instagram Graph API flow you are using. Do not place it in frontend JavaScript.

### Step 2: Enable the workflow

The workflow file is already included at `.github/workflows/instagram-sync.yml`.

It runs every hour and can also be triggered manually via `workflow_dispatch`.

### Step 3: Keep frontend JSON mode enabled

`js/site-config.js` is already set up to read from:

```js
instagram: {
  mode: "json",
  profileUrl: "https://www.instagram.com/YOUR_TARGET_USERNAME/",
  postsUrl: "./data/instagram-posts.json"
}
```

### JSON shape used by the frontend

```json
{
  "data": [
    {
      "id": "123",
      "caption": "Post caption",
      "permalink": "https://www.instagram.com/p/.../",
      "media_url": "https://...",
      "media_type": "IMAGE",
      "timestamp": "2026-04-15T00:00:00+0000"
    }
  ]
}
```

### Notes

- This implementation is intentionally posts-only.
- Stories are not included because Meta does not expose another account's stories through this Business Discovery flow.
- Highlights are intentionally not included.
- If you prefer a third-party widget later, `widget` mode is still available in `js/site-config.js`.

## Updating content

### Update adoptable pets

Edit the `pets` array in `js/site-data.js`.

### Update form fields

Edit the `forms` object in `js/site-data.js`.

### Update contact details or donation links

Edit the relevant links in `index.html`.

## Notes

- The live Safescape site is a Framer build, but this version is plain static code for easier hosting and maintenance.
- The current live site exposes adoption details clearly through text, but not clean per-pet image mapping in an easy reusable format. This rebuild uses polished profile cards with the real pet details and keeps the main Safescape visual from the current site.
- If you want, this repo can be extended next with per-pet image assets, richer Instagram post layouts, or a custom domain `CNAME` setup.
