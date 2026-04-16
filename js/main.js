(function () {
  const config = window.SAFESCAPE_CONFIG || {};
  const data = window.SAFESCAPE_SITE_DATA || { pets: [], forms: {} };
  document.body.classList.add("js-ready");

  const siteHeader = document.querySelector(".site-header");
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
  const instagramProfileLink = document.getElementById("instagram-profile-link");
  const defaultFormType = document.body.dataset.defaultForm || "adoption";
  const supportsCustomCursor =
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  let activeFormType = "adoption";
  let pendingStatusTimer = null;
  let cursorElement = null;
  let cursorImage = null;
  let cursorIsInverted = false;
  let cursorIsUpright = false;

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
          "This form is being connected on the new site. Please contact Safescape directly if you need immediate help.",
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
    setStatus("Sending your response to the Safescape team…", "success");

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

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Feed request failed");
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : payload.data;
  }

  async function renderInstagramFeed() {
    if (!instagramFeed) {
      return;
    }

    const instagram = config.instagram || {};
    if (instagramProfileLink && instagram.profileUrl) {
      instagramProfileLink.href = instagram.profileUrl;
    }

    if (instagram.mode === "widget" && instagram.widgetUrl) {
      instagramFeed.innerHTML = `<iframe class="instagram-widget" src="${escapeHtml(
        instagram.widgetUrl
      )}" title="Safescape Instagram feed" loading="lazy"></iframe>`;
      return;
    }

    if (instagram.mode === "json" && (instagram.postsUrl || instagram.feedUrl)) {
      instagramFeed.innerHTML = `<div class="instagram-empty"><p>Loading latest Instagram posts…</p></div>`;
      try {
        const posts = await loadJson(instagram.postsUrl || instagram.feedUrl);
        if (Array.isArray(posts) && posts.length) {
          renderFallbackInstagram(posts.slice(0, 6));
          return;
        }
        throw new Error("Feed payload was empty");
      } catch (error) {
        renderFallbackInstagram(instagram.fallbackPosts || []);
        return;
      }
    }

    if (Array.isArray(instagram.fallbackPosts) && instagram.fallbackPosts.length) {
      renderFallbackInstagram(instagram.fallbackPosts);
      return;
    }

    instagramFeed.innerHTML = `
      <div class="instagram-empty">
        <div>
          <p>Fresh rescue stories will appear here soon. Until then, you can follow Safescape directly on Instagram.</p>
          <a class="button button-primary" href="${escapeHtml(
            instagram.profileUrl || "https://www.instagram.com/safescapefoundation/"
          )}" target="_blank" rel="noreferrer">Open Instagram profile</a>
        </div>
      </div>
    `;
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

  function shouldInvertCursor(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    if (target.closest(".footer-donate-button")) {
      return false;
    }

    return Boolean(
      target.closest(
        ".button-primary, .site-footer, .involved-card-accent, .form-tab.is-active, .help-card-highlight"
      )
    );
  }

  function shouldUprightCursor(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    const clickable = target.closest(
      "a, button, .button, [role='button'], input, select, textarea, summary, label, [data-view-pet], [data-adopt-pet]"
    );

    if (!clickable) {
      return false;
    }

    if (clickable instanceof HTMLButtonElement && clickable.disabled) {
      return false;
    }

    if (clickable.getAttribute && clickable.getAttribute("aria-disabled") === "true") {
      return false;
    }

    return true;
  }

  function setupCustomCursor() {
    if (!supportsCustomCursor) {
      return;
    }

    const cursorDefaultSrc = "assets/cursor.svg";
    const cursorInvertedSrc = "assets/cursor-invert.svg";

    cursorElement = document.createElement("div");
    cursorElement.className = "site-cursor";
    cursorElement.setAttribute("aria-hidden", "true");

    cursorImage = document.createElement("img");
    cursorImage.src = cursorDefaultSrc;
    cursorImage.alt = "";

    cursorElement.appendChild(cursorImage);
    document.body.appendChild(cursorElement);

    const setCursorInverted = (nextIsInverted) => {
      if (cursorIsInverted === nextIsInverted) {
        return;
      }

      cursorIsInverted = nextIsInverted;
      cursorImage.src = cursorIsInverted ? cursorInvertedSrc : cursorDefaultSrc;
      cursorElement.classList.toggle("is-on-dark", cursorIsInverted);
    };

    const setCursorUpright = (nextIsUpright) => {
      if (cursorIsUpright === nextIsUpright) {
        return;
      }

      cursorIsUpright = nextIsUpright;
      cursorElement.classList.toggle("is-upright", cursorIsUpright);
    };

    const moveCursor = (event) => {
      const x = event.clientX;
      const y = event.clientY;
      cursorElement.classList.add("is-visible");
      setCursorInverted(shouldInvertCursor(event.target));
      setCursorUpright(shouldUprightCursor(event.target));
      // Keep cursor scaling anchored to this hotspot to avoid "jumping" when pressed.
      cursorElement.style.setProperty("--cursor-x", `${x - 10}px`);
      cursorElement.style.setProperty("--cursor-y", `${y - 7}px`);
    };

    document.addEventListener("mousemove", moveCursor, { passive: true });
    document.addEventListener(
      "mouseover",
      (event) => {
        setCursorInverted(shouldInvertCursor(event.target));
        setCursorUpright(shouldUprightCursor(event.target));
      },
      { passive: true }
    );
    document.addEventListener("mouseleave", () => {
      cursorElement.classList.remove("is-visible");
    });
    document.addEventListener("mousedown", () => {
      cursorElement.classList.add("is-clicking");
    });
    document.addEventListener("mouseup", () => {
      cursorElement.classList.remove("is-clicking");
    });
  }

  function createCursorStamp(x, y, target) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    // Keyboard-triggered clicks can report (0,0); skip those.
    if (x === 0 && y === 0) {
      return;
    }

    const stamp = document.createElement("div");
    stamp.className = "cursor-stamp";
    stamp.setAttribute("aria-hidden", "true");

    const stampImg = document.createElement("img");
    stampImg.alt = "";
    stampImg.src = shouldInvertCursor(target) ? "assets/cursor-invert.svg" : "assets/cursor.svg";
    stamp.appendChild(stampImg);

    if (shouldUprightCursor(target)) {
      stamp.classList.add("is-upright");
    }

    // Match the cursor hotspot (same as --cursor-origin-x/--cursor-origin-y).
    stamp.style.transform = `translate3d(${x - 10}px, ${y - 7}px, 0) scale(0.7)`;
    document.body.appendChild(stamp);

    window.setTimeout(() => {
      stamp.remove();
    }, 2100);
  }

  function setupCursorStamping() {
    // Use pointer events so stamps work on touch + mouse, and only stamp on a tap/click (not scroll).
    if (typeof window.PointerEvent !== "function") {
      document.addEventListener(
        "click",
        (event) => {
          createCursorStamp(event.clientX, event.clientY, event.target);
        },
        { passive: true }
      );
      return;
    }

    const candidates = new Map();
    const maxMovePx = 14;
    const maxDurationMs = 700;

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!event.isPrimary) {
          return;
        }
        if (event.pointerType === "mouse" && event.button !== 0) {
          return;
        }

        candidates.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          time: performance.now(),
          target: event.target
        });
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerup",
      (event) => {
        const candidate = candidates.get(event.pointerId);
        candidates.delete(event.pointerId);
        if (!candidate) {
          return;
        }

        const dx = event.clientX - candidate.x;
        const dy = event.clientY - candidate.y;
        const moved = Math.hypot(dx, dy);
        const elapsed = performance.now() - candidate.time;

        if (moved > maxMovePx || elapsed > maxDurationMs) {
          return;
        }

        createCursorStamp(event.clientX, event.clientY, candidate.target);
      },
      { passive: true }
    );

    document.addEventListener(
      "pointercancel",
      (event) => {
        candidates.delete(event.pointerId);
      },
      { passive: true }
    );
  }

  function syncHeaderState() {
    if (!siteHeader) {
      return;
    }

    siteHeader.classList.toggle("is-scrolled", window.scrollY > 12);
  }

  function setupRevealSections() {
    const revealTargets = Array.from(
      document.querySelectorAll(".hero-section, main .section, .site-footer, .form-page-hero, .form-page-panel")
    );

    if (!revealTargets.length) {
      return;
    }

    revealTargets.forEach((element) => element.classList.add("reveal-section"));

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof window.IntersectionObserver !== "function"
    ) {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -8% 0px"
      }
    );

    revealTargets.forEach((element) => observer.observe(element));
  }

  function setupGoogleFormScaleToFit() {
    const iframes = Array.from(
      document.querySelectorAll(".google-form-iframe[data-base-width][data-base-height]")
    );
    if (!iframes.length) {
      return;
    }

    // Without ResizeObserver we still apply once, but won't respond to resizes.
    const hasResizeObserver = typeof window.ResizeObserver === "function";

    iframes.forEach((iframe) => {
      const wrapper = iframe.closest(".google-form-embed") || iframe.parentElement;
      if (!wrapper) {
        return;
      }

      const baseWidth = Number(iframe.dataset.baseWidth) || 640;
      const baseHeight = Number(iframe.dataset.baseHeight) || 4076;

      // Set the iframe to its native dimensions, then scale the whole document.
      iframe.style.width = `${baseWidth}px`;
      iframe.style.height = `${baseHeight}px`;
      iframe.style.maxWidth = "none";
      iframe.style.transform = "scale(1)";

      function applyScale() {
        const containerWidth = wrapper.clientWidth;
        if (!containerWidth) {
          return;
        }

        const rawScale = containerWidth / baseWidth;
        // Clamp so text doesn't become unusably small/large.
        const scale = Math.max(0.82, Math.min(rawScale, 1.7));

        iframe.style.transform = `scale(${scale})`;
        wrapper.style.height = `${Math.ceil(baseHeight * scale)}px`;
      }

      applyScale();

      if (hasResizeObserver) {
        const ro = new window.ResizeObserver(() => applyScale());
        ro.observe(wrapper);
      }

      window.addEventListener("orientationchange", applyScale);
    });
  }

  renderPetCards();
  if (form && formFields) {
    activateForm(defaultFormType);
  }
  bindEvents();
  syncHeaderState();
  window.addEventListener("scroll", syncHeaderState, { passive: true });
  setupRevealSections();
  setupCustomCursor();
  setupCursorStamping();
  setupGoogleFormScaleToFit();
  renderInstagramFeed();
})();
