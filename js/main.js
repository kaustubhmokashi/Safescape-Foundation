(function () {
  const config = window.SAFESCAPE_CONFIG || {};
  const data = window.SAFESCAPE_SITE_DATA || { pets: [], forms: {} };

  const petGrid = document.getElementById("pet-grid");
  const petDialog = document.getElementById("pet-dialog");
  const petDialogContent = document.getElementById("pet-dialog-content");
  const dialogCloseButton = document.querySelector(".dialog-close");

  const form = document.getElementById("lead-form");
  const formFields = document.getElementById("form-fields");
  const formTitle = document.getElementById("form-title");
  const formDescription = document.getElementById("form-description");
  const formTypeInput = document.getElementById("form-type");
  const submittedAtInput = document.getElementById("submitted-at");
  const formStatus = document.getElementById("form-status");
  const submitButton = document.getElementById("submit-button");
  const formTabs = Array.from(document.querySelectorAll(".form-tab"));
  const openFormButtons = Array.from(document.querySelectorAll("[data-open-form]"));

  const instagramFeed = document.getElementById("instagram-feed");
  const instagramStoriesFeed = document.getElementById("instagram-stories");

  let activeFormType = "adoption";
  let pendingStatusTimer = null;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function truncate(value, limit) {
    if (!value || value.length <= limit) {
      return value;
    }
    return value.slice(0, limit).trimEnd() + "…";
  }

  function renderPetCards() {
    if (!petGrid) {
      return;
    }

    petGrid.innerHTML = data.pets
      .map((pet) => {
        const initials = pet.name
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();

        return `
          <article class="pet-card">
            <div class="pet-card-head">
              <div class="pet-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
              <span class="pet-status">${escapeHtml(pet.status)}</span>
            </div>
            <h3>${escapeHtml(pet.name)}</h3>
            <p class="pet-subtitle">${escapeHtml(pet.breed)}</p>
            <ul class="pet-meta">
              <li><span>Gender</span><strong>${escapeHtml(pet.gender)}</strong></li>
              <li><span>Age</span><strong>${escapeHtml(pet.age)}</strong></li>
            </ul>
            <p>${escapeHtml(truncate(pet.description, 220))}</p>
            <div class="pet-actions">
              <button class="button button-secondary" type="button" data-view-pet="${escapeHtml(pet.slug)}">View details</button>
              <button class="button button-primary" type="button" data-adopt-pet="${escapeHtml(pet.name)}">Apply for adoption</button>
            </div>
          </article>
        `;
      })
      .join("");

    petGrid.querySelectorAll("[data-view-pet]").forEach((button) => {
      button.addEventListener("click", () => openPetDialog(button.getAttribute("data-view-pet")));
    });

    petGrid.querySelectorAll("[data-adopt-pet]").forEach((button) => {
      button.addEventListener("click", () => {
        activateForm("adoption", { petName: button.getAttribute("data-adopt-pet") });
        document.getElementById("forms").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function openPetDialog(slug) {
    const pet = data.pets.find((entry) => entry.slug === slug);
    if (!pet || !petDialog || !petDialogContent) {
      return;
    }

    const initials = pet.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    petDialogContent.innerHTML = `
      <div class="pet-dialog-grid">
        <div class="pet-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="pet-copy">
          <p class="eyebrow">${escapeHtml(pet.status)}</p>
          <h3>${escapeHtml(pet.name)}</h3>
          <ul class="pet-meta">
            <li><span>Breed</span><strong>${escapeHtml(pet.breed)}</strong></li>
            <li><span>Gender</span><strong>${escapeHtml(pet.gender)}</strong></li>
            <li><span>Age</span><strong>${escapeHtml(pet.age)}</strong></li>
          </ul>
          <p>${escapeHtml(pet.description)}</p>
          <div class="pet-actions">
            <button class="button button-primary" type="button" data-dialog-adopt="${escapeHtml(pet.name)}">Apply for adoption</button>
            <a class="button button-secondary" href="https://www.instagram.com/safescapefoundation/" target="_blank" rel="noreferrer">Check Instagram post</a>
          </div>
        </div>
      </div>
    `;

    petDialog.showModal();

    const dialogAdopt = petDialogContent.querySelector("[data-dialog-adopt]");
    if (dialogAdopt) {
      dialogAdopt.addEventListener("click", () => {
        petDialog.close();
        activateForm("adoption", { petName: dialogAdopt.getAttribute("data-dialog-adopt") });
        document.getElementById("forms").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function buildField(field, prefill) {
    const wrapper = document.createElement("div");
    wrapper.className = "form-field" + (field.fullWidth ? " is-full" : "");

    const label = document.createElement("label");
    label.htmlFor = field.name;
    label.textContent = field.label + (field.required ? " *" : "");

    let input;
    if (field.type === "textarea") {
      input = document.createElement("textarea");
    } else if (field.type === "select") {
      input = document.createElement("select");
      const placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = "Select an option";
      input.appendChild(placeholderOption);
      field.options.forEach((optionValue) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        input.appendChild(option);
      });
    } else {
      input = document.createElement("input");
      input.type = field.type;
    }

    input.id = field.name;
    input.name = field.name;
    input.required = Boolean(field.required);
    input.autocomplete = "off";

    if (field.type !== "select") {
      input.placeholder = field.label;
    }

    if (prefill && prefill[field.name]) {
      input.value = prefill[field.name];
    }

    wrapper.append(label, input);
    return wrapper;
  }

  function activateForm(formType, options) {
    const definition = data.forms[formType];
    if (!definition || !formFields || !formTitle || !formDescription || !formTypeInput) {
      return;
    }

    activeFormType = formType;
    formTypeInput.value = formType;
    formTitle.textContent = definition.title;
    formDescription.textContent = definition.description;
    submitButton.textContent = definition.submitLabel;

    formTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.getAttribute("data-form-target") === formType);
    });

    formFields.innerHTML = "";
    const prefill = options && options.petName ? { petInterested: options.petName } : null;
    definition.fields.forEach((field) => {
      formFields.appendChild(buildField(field, prefill));
    });

    clearStatus();
  }

  function setStatus(message, type) {
    if (!formStatus) {
      return;
    }

    formStatus.textContent = message;
    formStatus.classList.remove("is-error", "is-success");
    if (type) {
      formStatus.classList.add(type === "error" ? "is-error" : "is-success");
    }
  }

  function clearStatus() {
    if (pendingStatusTimer) {
      window.clearTimeout(pendingStatusTimer);
      pendingStatusTimer = null;
    }
    setStatus("", "");
  }

  function validateForm() {
    const invalidField = Array.from(form.elements).find(
      (element) => element.willValidate && !element.checkValidity()
    );

    if (!invalidField) {
      return true;
    }

    invalidField.reportValidity();
    setStatus("Please fill in the required fields before submitting.", "error");
    return false;
  }

  function handleFormSubmit(event) {
    const webAppUrl = config.forms && config.forms.webAppUrl;
    if (!webAppUrl) {
      event.preventDefault();
      setStatus(
        (config.forms && config.forms.missingConfigMessage) ||
          "Forms are not configured yet. Add your Google Apps Script URL first.",
        "error"
      );
      return;
    }

    if (!validateForm()) {
      event.preventDefault();
      return;
    }

    submittedAtInput.value = new Date().toISOString();
    form.action = webAppUrl;
    setStatus("Sending your response to Safescape's Google Sheet…", "success");

    pendingStatusTimer = window.setTimeout(() => {
      form.reset();
      activateForm(activeFormType);
      setStatus(
        (config.forms && config.forms.successMessage) || "Thanks. Your form was sent successfully.",
        "success"
      );
    }, 1200);
  }

  function renderFallbackInstagram(posts) {
    instagramFeed.innerHTML = `
      <div class="instagram-grid">
        ${posts
          .map(
            (post) => `
              <article class="instagram-card">
                <img src="${escapeHtml(post.media_url)}" alt="Safescape Instagram preview" />
                <div class="instagram-card-body">
                  <p>${escapeHtml(truncate(post.caption || "Safescape Instagram update", 160))}</p>
                  <a href="${escapeHtml(post.permalink)}" target="_blank" rel="noreferrer">View on Instagram</a>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderStories(stories) {
    if (!instagramStoriesFeed) {
      return;
    }

    if (!Array.isArray(stories) || !stories.length) {
      instagramStoriesFeed.innerHTML = `
        <div class="instagram-empty">
          <div>
            <p>No active stories right now. The next live story will appear here automatically after the next sync.</p>
          </div>
        </div>
      `;
      return;
    }

    instagramStoriesFeed.innerHTML = `
      <div class="stories-row">
        ${stories
          .map(
            (story) => `
              <a class="instagram-story-card" href="${escapeHtml(story.permalink)}" target="_blank" rel="noreferrer">
                <div class="instagram-story-ring">
                  <img src="${escapeHtml(story.media_url)}" alt="Safescape Instagram story" />
                </div>
                <div class="instagram-story-card-body">
                  <p>${escapeHtml(truncate(story.caption || "Active story", 70))}</p>
                </div>
              </a>
            `
          )
          .join("")}
      </div>
    `;
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Feed request failed");
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : payload.data;
  }

  async function renderInstagramFeed() {
    if (!instagramFeed || !instagramStoriesFeed) {
      return;
    }

    const instagram = config.instagram || {};

    if (instagram.mode === "widget" && instagram.widgetUrl) {
      instagramFeed.innerHTML = `<iframe class="instagram-widget" src="${escapeHtml(
        instagram.widgetUrl
      )}" title="Safescape Instagram feed" loading="lazy"></iframe>`;
      renderStories(instagram.fallbackStories || []);
      return;
    }

    if (instagram.mode === "json" && (instagram.postsUrl || instagram.feedUrl)) {
      instagramFeed.innerHTML = `<div class="instagram-empty"><p>Loading latest Instagram posts…</p></div>`;
      instagramStoriesFeed.innerHTML = `<div class="instagram-empty"><p>Loading active Instagram stories…</p></div>`;
      try {
        const posts = await loadJson(instagram.postsUrl || instagram.feedUrl);
        const stories = instagram.storiesUrl ? await loadJson(instagram.storiesUrl) : [];

        renderStories(stories);
        if (Array.isArray(posts) && posts.length) {
          renderFallbackInstagram(posts.slice(0, 6));
          return;
        }
        throw new Error("Feed payload was empty");
      } catch (error) {
        renderFallbackInstagram(instagram.fallbackPosts || []);
        renderStories(instagram.fallbackStories || []);
        return;
      }
    }

    if (Array.isArray(instagram.fallbackPosts) && instagram.fallbackPosts.length) {
      renderFallbackInstagram(instagram.fallbackPosts);
      renderStories(instagram.fallbackStories || []);
      return;
    }

    instagramFeed.innerHTML = `
      <div class="instagram-empty">
        <div>
          <p>A live Instagram feed needs a widget URL or a JSON feed endpoint configured in <code>js/site-config.js</code>.</p>
          <a class="button button-primary" href="${escapeHtml(
            instagram.profileUrl || "https://www.instagram.com/safescapefoundation/"
          )}" target="_blank" rel="noreferrer">Open Instagram profile</a>
        </div>
      </div>
    `;
    renderStories(instagram.fallbackStories || []);
  }

  function bindEvents() {
    formTabs.forEach((tab) => {
      tab.addEventListener("click", () => activateForm(tab.getAttribute("data-form-target")));
    });

    openFormButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activateForm(button.getAttribute("data-open-form"));
        document.getElementById("forms").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (form) {
      form.addEventListener("submit", handleFormSubmit);
    }

    if (dialogCloseButton && petDialog) {
      dialogCloseButton.addEventListener("click", () => petDialog.close());
      petDialog.addEventListener("click", (event) => {
        const rect = petDialog.getBoundingClientRect();
        const isInside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (!isInside) {
          petDialog.close();
        }
      });
    }
  }

  renderPetCards();
  activateForm("adoption");
  bindEvents();
  renderInstagramFeed();
})();
