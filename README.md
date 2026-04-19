# Safescape Foundation Static Website

A static HTML/CSS/JS rebuild of the current `safescapefoundation.com` experience, designed for GitHub hosting.

## What is included

- A GitHub Pages-friendly static site
- Safescape home page content based on the live site
- Dedicated landing pages for adoption, volunteer, foster, and surrender applications
- Google Sheets integration via Google Apps Script
- Privacy, terms, and disclaimer pages

## Project structure

- `index.html`: main site
- `apply-for-adoption.html`, `application-to-surrender.html`, `sign-up-as-foster.html`, `become-a-volunteer.html`: dedicated form landing pages
- `styles.css`: shared styling for the whole site and the policy pages
- `js/site-config.js`: integration settings you will edit
- `js/site-data.js`: adoptable pet data and form schema definitions
- `js/main.js`: rendering, form switching, and Instagram display logic
- `Privacy-Policy.html`, `Terms-and-Conditions.html`, `Disclaimers.html`: policy pages
- `google-apps-script/Code.gs`: Google Apps Script example for writing form data to Sheets

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

The site can render Instagram posts from a static JSON file in `data/instagram-posts.json`.
If you want to refresh Instagram content later, update that JSON file directly and redeploy the site.

`js/site-config.js` is already set up to read from:

```js
instagram: {
  mode: "json",
  profileUrl: "https://www.instagram.com/YOUR_TARGET_USERNAME/",
  postsUrl: "./data/instagram-posts.json"
}
```

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
