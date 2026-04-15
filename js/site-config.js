window.SAFESCAPE_CONFIG = {
  forms: {
    webAppUrl: "",
    successMessage: "Thanks. Your form was sent successfully.",
    missingConfigMessage:
      "Forms are not configured yet. Add your Google Apps Script web app URL in js/site-config.js to send entries to Google Sheets."
  },
  instagram: {
    mode: "json",
    profileUrl: "https://www.instagram.com/safescapefoundation/",
    widgetUrl: "",
    postsUrl: "./data/instagram-posts.json",
    storiesUrl: "./data/instagram-stories.json",
    fallbackPosts: [
      {
        caption: "Connect a widget URL or JSON feed to show live Instagram updates here.",
        permalink: "https://www.instagram.com/safescapefoundation/",
        media_url: "https://framerusercontent.com/images/ujzOTIWaL0TRAyoMYrRjCCtwrVs.jpg"
      }
    ],
    fallbackStories: [
      {
        caption: "When active stories are present, they will appear here automatically.",
        permalink: "https://www.instagram.com/safescapefoundation/",
        media_url: "https://framerusercontent.com/images/ujzOTIWaL0TRAyoMYrRjCCtwrVs.jpg"
      }
    ]
  }
};
