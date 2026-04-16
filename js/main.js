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
  const adoptionTestFillTrigger = "0000";

  let activeFormType = "adoption";
  let pendingStatusTimer = null;
  let cursorElement = null;
  let cursorImage = null;
  let cursorIsInverted = false;
  let cursorIsUpright = false;
  let cursorHomeHost = null;

  function moveCursorToHost(host) {
    if (!cursorElement || !host || cursorElement.parentElement === host) {
      return;
    }
    host.appendChild(cursorElement);
  }

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

    moveCursorToHost(petDialog);
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
    } else if (field.type === "file") {
      input = document.createElement("input");
      input.type = "file";
      if (field.accept) {
        input.accept = field.accept;
      }
      if (field.multiple) {
        input.multiple = true;
      }
    } else {
      input = document.createElement("input");
      input.type = field.type;
    }

    input.id = field.name;
    input.name = field.name;
    input.required = Boolean(field.required);
    input.autocomplete = "off";
    input.dataset.q = field.label;

    if (field.type !== "select") {
      input.placeholder = field.label;
    }

    if (field.type === "file") {
      input.placeholder = "";
      input.removeAttribute("placeholder");
      input.dataset.maxMb = String(field.maxMb || 10);
    }

    if (prefill && prefill[field.name]) {
      input.value = prefill[field.name];
    }

    wrapper.append(label, input);
    if (field.help) {
      const hint = document.createElement("div");
      hint.className = "form-field-hint";
      hint.textContent = field.help;
      wrapper.appendChild(hint);
    }
    return wrapper;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the selected file."));
      reader.readAsDataURL(file);
    });
  }

  async function collectSheetSubmissionData(formEl) {
    const questionNodes = Array.from(formEl.querySelectorAll("[data-q]"));
    const questionOrder = [];
    const responses = {};
    const uploads = [];

    for (const node of questionNodes) {
      const title = node.dataset.q;
      if (!title) {
        continue;
      }

      questionOrder.push(title);

      if (node.classList.contains("choice-grid")) {
        const { value } = collectChoiceGridValue(node);
        responses[title] = value;
        continue;
      }

      if (node instanceof HTMLInputElement && node.type === "file") {
        const file = node.files && node.files[0];
        responses[title] = file ? file.name : "";
        if (file) {
          uploads.push({
            question: title,
            fieldName: node.name || node.id || "",
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size || 0,
            dataUrl: await readFileAsDataUrl(file),
          });
        }
        continue;
      }

      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
        responses[title] = normalizeValue(node.value);
      }
    }

    return { questionOrder, responses, uploads };
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

  function normalizeValue(value) {
    if (value == null) {
      return "";
    }
    return String(value).trim();
  }

  function getSheetFormType(formEl) {
    if (!formEl) {
      return "";
    }

    const datasetFormType = String(formEl.dataset.sheetForm || "").trim();
    if (datasetFormType) {
      return datasetFormType;
    }

    const hiddenFormType = formEl.querySelector("#form-type, input[name='formType']");
    if (hiddenFormType && "value" in hiddenFormType) {
      return String(hiddenFormType.value || "").trim();
    }

    return "";
  }

  function collectChoiceGridValue(grid) {
    const type = grid.dataset.type || "radio";
    const required = grid.dataset.required === "true";

    if (type === "checkbox") {
      const checked = Array.from(grid.querySelectorAll("input[type='checkbox']:checked"));
      const values = checked.map((input) => {
        if (input.value === "Other" && input.dataset.other) {
          const other = document.getElementById(input.dataset.other);
          const otherValue = normalizeValue(other && other.value);
          return otherValue ? `Other: ${otherValue}` : "Other";
        }
        return input.value;
      });
      const hasOtherSelected = checked.some((input) => input.value === "Other" && input.dataset.other);
      let otherOk = true;
      if (hasOtherSelected) {
        const otherInput = checked.find((input) => input.value === "Other" && input.dataset.other);
        const other = otherInput ? document.getElementById(otherInput.dataset.other) : null;
        otherOk = Boolean(other && normalizeValue(other.value));
      }
      const requiredOk = (!required || values.length > 0) && otherOk;
      const errorMessage = !requiredOk
        ? hasOtherSelected && !otherOk
          ? "Please specify the other option."
          : "This is a required question."
        : "";
      return { value: values.join(", "), requiredOk, errorMessage };
    }

    const selected = grid.querySelector("input[type='radio']:checked");
    if (!selected) {
      const requiredOk = !required;
      return { value: "", requiredOk, errorMessage: requiredOk ? "" : "This is a required question." };
    }

    if (selected.value === "Other" && selected.dataset.other) {
      const other = document.getElementById(selected.dataset.other);
      const otherValue = normalizeValue(other && other.value);
      const otherOk = Boolean(otherValue);
      return {
        value: otherValue ? `Other: ${otherValue}` : "Other",
        requiredOk: otherOk,
        errorMessage: otherOk ? "" : "Please specify the other option."
      };
    }

    return { value: selected.value, requiredOk: true, errorMessage: "" };
  }

  function getFieldContainer(node) {
    if (!node || !(node instanceof Element)) {
      return null;
    }
    return node.closest(".form-field");
  }

  function setFieldError(container, message) {
    if (!container) {
      return;
    }
    container.classList.toggle("is-invalid", Boolean(message));
    let error = container.querySelector(".field-error");
    if (!message) {
      if (error) {
        error.remove();
      }
      return;
    }
    if (!error) {
      error = document.createElement("div");
      error.className = "field-error";
      container.appendChild(error);
    }
    error.textContent = message;
  }

  function validateTextLikeControl(control) {
    const container = getFieldContainer(control);
    const value = normalizeValue(control.value);

    if (control instanceof HTMLInputElement && control.type === "file") {
      const file = control.files && control.files[0];
      const maxMb = Number(control.dataset.maxMb || 10);
      if (control.required && !file) {
        setFieldError(container, "Please attach a file.");
        return false;
      }
      if (file && maxMb > 0 && file.size > maxMb * 1024 * 1024) {
        setFieldError(container, `Please choose a file smaller than ${maxMb} MB.`);
        return false;
      }
      setFieldError(container, "");
      return true;
    }

    if (control.required && !value) {
      setFieldError(container, "This is a required question.");
      return false;
    }

    if (value && control instanceof HTMLInputElement) {
      if (control.type === "email" && !control.checkValidity()) {
        setFieldError(container, "Please enter a valid email address.");
        return false;
      }
      if (control.type === "tel") {
        const digits = value.replace(/\\D/g, "");
        if (digits.length > 0 && digits.length < 8) {
          setFieldError(container, "Please enter a valid phone number.");
          return false;
        }
      }
      if (control.type === "number" && !control.checkValidity()) {
        setFieldError(container, "Please enter a valid number.");
        return false;
      }
    }

    setFieldError(container, "");
    return true;
  }

  function validateChoiceGrid(grid) {
    const container = getFieldContainer(grid);
    const { requiredOk, errorMessage } = collectChoiceGridValue(grid);
    setFieldError(container, requiredOk ? "" : errorMessage || "This is a required question.");
    return requiredOk;
  }

  function validateSheetForm(formEl) {
    const nodes = Array.from(formEl.querySelectorAll("[data-q]"));
    let ok = true;
    let firstInvalid = null;

    nodes.forEach((node) => {
      if (!ok && firstInvalid) {
        // still validate to show all errors, but keep first invalid for focusing
      }

      if (node.classList.contains("choice-grid")) {
        const valid = validateChoiceGrid(node);
        if (!valid) {
          ok = false;
          firstInvalid = firstInvalid || node;
        }
        return;
      }

      if (
        node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement
      ) {
        const valid = validateTextLikeControl(node);
        if (!valid) {
          ok = false;
          firstInvalid = firstInvalid || node;
        }
      }
    });

    return { ok, firstInvalid };
  }

  function syncOtherFieldsWithinGrid(grid) {
    if (!grid || !(grid instanceof Element)) {
      return;
    }

    const otherOptions = Array.from(grid.querySelectorAll("input[data-other]"));
    if (!otherOptions.length) {
      return;
    }

    otherOptions.forEach((option) => {
      const otherId = option.dataset.other;
      if (!otherId) {
        return;
      }

      const otherInput = document.getElementById(otherId);
      if (!otherInput) {
        return;
      }

      const otherWrapper = otherInput.closest(".choice-other");
      if (!otherWrapper) {
        return;
      }

      const isActive = Boolean(option.checked);
      otherWrapper.classList.toggle("is-visible", isActive);

      if (!isActive) {
        // Avoid stale values being submitted when "Other" isn't selected.
        otherInput.value = "";
      }
    });
  }

  function syncAllOtherFields(formEl) {
    if (!formEl) {
      return;
    }
    formEl.querySelectorAll(".choice-grid").forEach((grid) => syncOtherFieldsWithinGrid(grid));
  }

  function setNativeFieldValue(field, value) {
    if (!field) {
      return;
    }

    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setRadioValue(formEl, name, value) {
    if (!formEl) {
      return;
    }

    const input = formEl.querySelector(`input[type="radio"][name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function setCheckboxValues(formEl, name, values) {
    if (!formEl) {
      return;
    }

    const selectedValues = Array.isArray(values) ? values : [values];
    const checkboxes = Array.from(formEl.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`));

    checkboxes.forEach((checkbox) => {
      checkbox.checked = selectedValues.includes(checkbox.value);
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function fillAdoptionTestData(formEl) {
    if (!formEl || formEl.dataset.sheetForm !== "adoption") {
      return;
    }

    setNativeFieldValue(formEl.querySelector("#pet_applying_name"), "Buddy");
    setNativeFieldValue(formEl.querySelector("#pet_applying_breed"), "Mixed Breed");
    setNativeFieldValue(formEl.querySelector("#your_name"), "Test Adopter");
    setNativeFieldValue(formEl.querySelector("#age"), "32");
    setNativeFieldValue(formEl.querySelector("#address"), "12, Green Grove, Bengaluru, Karnataka");
    setNativeFieldValue(formEl.querySelector("#phone_number"), "9988002758");
    setNativeFieldValue(formEl.querySelector("#email"), "test.adopter@safescape.local");
    setNativeFieldValue(formEl.querySelector("#co_applicant_name"), "Test Co-Applicant");
    setNativeFieldValue(formEl.querySelector("#co_applicant_phone"), "9876501234");
    setNativeFieldValue(formEl.querySelector("#co_applicant_email"), "co.applicant@safescape.local");

    setRadioValue(formEl, "home_type", "Independant House");
    setRadioValue(formEl, "residence_type", "Owned Property");
    setRadioValue(formEl, "roommates", "No");
    setNativeFieldValue(formEl.querySelector("#current_address_duration"), "6 years");
    setNativeFieldValue(formEl.querySelector("#moves_past_5_years"), "1");
    setNativeFieldValue(formEl.querySelector("#future_move_pet"), "I will keep the pet with me or a trusted family member.");
    setNativeFieldValue(formEl.querySelector("#landlord_contact"), "Not applicable");
    setNativeFieldValue(formEl.querySelector("#children_count_age"), "2 children, ages 6 and 9");

    setRadioValue(formEl, "household_desc", "Calm");
    setRadioValue(formEl, "pet_allergies", "No");
    setNativeFieldValue(
      formEl.querySelector("#relationship_changes_pet"),
      "The pet will remain with me and my co-applicant."
    );
    setRadioValue(formEl, "backup_caregiver", "Yes");
    setRadioValue(formEl, "outside_pet", "Loose");
    setNativeFieldValue(formEl.querySelector("#responsible_person"), "Me and my co-applicant");
    setNativeFieldValue(formEl.querySelector("#travel_arrangements"), "Trusted family care or boarding.");
    setRadioValue(formEl, "exercise_time", "1 - 2 hours");
    setCheckboxValues(formEl, "exercise_plan", ["Leash Walks", "Pet Park", "Other"]);
    setNativeFieldValue(formEl.querySelector("#exercise_plan_other"), "Nature walks");
    setNativeFieldValue(formEl.querySelector("#hours_left_alone"), "2");
    setRadioValue(formEl, "kept_when_alone", "Loose Indoors");

    setNativeFieldValue(formEl.querySelector("#vet_budget"), "15000");
    setRadioValue(formEl, "med_admin", "Yes");
    setRadioValue(formEl, "spay_neuter", "Yes");

    setNativeFieldValue(
      formEl.querySelector("#references"),
      "Reference 1: Priya Sharma - 9988012345\nReference 2: Arun Rao - 9988076543"
    );

    setNativeFieldValue(formEl.querySelector("#pet_care_experience"), "Yes, I have cared for dogs before.");
    setNativeFieldValue(
      formEl.querySelector("#current_pets"),
      "Species: Dog, Name: Milo, Sex: Male, Vaccinated: Yes, Age: 4"
    );
    setNativeFieldValue(
      formEl.querySelector("#previous_pets"),
      "Species: Dog, Name: Bella, Sex: Female, Vaccinated: Yes, Age: 8"
    );

    setRadioValue(formEl, "adopting_for", "I am adopting for myself");
    setCheckboxValues(formEl, "why_adopt", ["Companion", "Companion for existing pet(s)"]);
    setCheckboxValues(formEl, "why_return", ["Moving", "Large veterinary bill", "Other"]);
    setNativeFieldValue(formEl.querySelector("#why_return_other"), "Emergency relocation needs");
    setNativeFieldValue(formEl.querySelector("#monthly_feed_cost"), "4000");
    setNativeFieldValue(
      formEl.querySelector("#not_tolerate_behaviours"),
      "Aggression without support, destructive behaviour without training."
    );
    setCheckboxValues(formEl, "training_plans", ["Basic obedience classes", "Private consultations with a trainer"]);
    setNativeFieldValue(formEl.querySelector("#applied_before"), "No");
    setNativeFieldValue(
      formEl.querySelector("#important_responsibilities"),
      "Food, clean water, exercise, medical care, patience, and consistency."
    );

    syncAllOtherFields(formEl);
  }

  function maybeApplyAdoptionTestFill(sheetForm, target) {
    if (
      sheetForm.dataset.sheetForm === "adoption" &&
      target instanceof HTMLInputElement &&
      target.id === "your_name" &&
      target.value.trim() === adoptionTestFillTrigger
    ) {
      fillAdoptionTestData(sheetForm);
    }
  }

  async function handleSheetFormSubmit(event) {
    event.preventDefault();

    const webAppUrl = config.forms && config.forms.webAppUrl;
    const formEl = event.currentTarget;
    const statusEl = formEl.querySelector("[data-form-status]");

    if (getSheetFormType(formEl) === "adoption") {
      const confirmButton = formEl.querySelector("#confirm-button");
      if (confirmButton && typeof confirmButton.click === "function") {
        confirmButton.click();
      }
      return;
    }

    function setSheetStatus(message, type) {
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message;
      statusEl.classList.remove("is-error", "is-success");
      if (type) {
        statusEl.classList.add(type === "error" ? "is-error" : "is-success");
      }
    }

    if (!webAppUrl) {
      setSheetStatus(
        (config.forms && config.forms.missingConfigMessage) ||
          "This form is being connected on the new site. Please contact Safescape directly if you need immediate help.",
        "error"
      );
      return;
    }

    const { ok: isValid, firstInvalid } = validateSheetForm(formEl);
    if (!isValid) {
      if (firstInvalid && typeof firstInvalid.scrollIntoView === "function") {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (firstInvalid && typeof firstInvalid.reportValidity === "function") {
        firstInvalid.reportValidity();
      }
      setSheetStatus("Please fill in the required fields before submitting.", "error");
      return;
    }

    const { questionOrder, responses, uploads } = await collectSheetSubmissionData(formEl);
    setSheetStatus(
      uploads.length ? "Uploading your file and sending your response…" : "Sending your response to the Safescape team…",
      "success"
    );

    try {
      const payload = new URLSearchParams({
        formType: getSheetFormType(formEl),
        sheetName: formEl.dataset.sheetName || "",
        questionOrder: JSON.stringify(questionOrder),
        responses: JSON.stringify(responses),
        uploads: JSON.stringify(uploads)
      });

      await fetch(webAppUrl, {
        method: "POST",
        mode: "no-cors",
        body: payload
      });

      formEl.reset();
      setSheetStatus((config.forms && config.forms.successMessage) || "Thanks. Your form was sent successfully.", "success");
    } catch (error) {
      setSheetStatus("Something went wrong while sending this form. Please try again in a moment.", "error");
    }
  }

  function setDialogError(message) {
    const stateEl = document.getElementById("terms-state");
    const textEl = document.getElementById("terms-state-text");
    const feedbackEl = document.getElementById("terms-state-feedback");
    if (!stateEl || !textEl || !feedbackEl) {
      return;
    }
    if (message) {
      stateEl.classList.add("is-error");
      feedbackEl.hidden = false;
      textEl.textContent = message;
      return;
    }

    if (!stateEl.classList.contains("is-loading") && !stateEl.classList.contains("is-success")) {
      stateEl.classList.remove("is-error");
      feedbackEl.hidden = true;
      textEl.textContent = "";
    }
  }

  function setTermsDialogState(type, message) {
    const stateEl = document.getElementById("terms-state");
    const stateTextEl = document.getElementById("terms-state-text");
    const feedbackEl = document.getElementById("terms-state-feedback");
    const agreeWrap = document.getElementById("terms-agree-wrap");
    if (!stateEl || !stateTextEl || !feedbackEl || !agreeWrap) {
      return;
    }

    stateEl.className = "terms-state";
    if (type) {
      stateEl.classList.add(`is-${type}`);
      stateTextEl.textContent = message || "";
      agreeWrap.hidden = type !== "error";
      feedbackEl.hidden = false;
    } else {
      stateTextEl.textContent = "";
      feedbackEl.hidden = true;
      agreeWrap.hidden = false;
    }
  }

  function setTermsSubmitLoading(isLoading) {
    const submitBtn = document.getElementById("terms-submit");
    if (!submitBtn) {
      return;
    }

    submitBtn.classList.toggle("terms-submit-loading", Boolean(isLoading));
    submitBtn.disabled = Boolean(isLoading);

    const textEl = submitBtn.querySelector(".terms-submit-text");
    if (textEl) {
      textEl.textContent = isLoading ? "Submitting..." : "Submit";
    }
  }

  async function loadTermsIntoDialog() {
    const container = document.getElementById("terms-scroll");
    if (!container) {
      return;
    }

    if (container.dataset.loaded === "true") {
      return;
    }

    container.dataset.termsHtml = container.innerHTML;
    container.dataset.loaded = "true";
  }

  async function submitSheetForm(formEl, statusEl) {
    const webAppUrl = config.forms && config.forms.webAppUrl;

    function setStatus(message, type) {
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message;
      statusEl.classList.remove("is-error", "is-success");
      if (type) {
        statusEl.classList.add(type === "error" ? "is-error" : "is-success");
      }
    }

    if (!webAppUrl) {
      setStatus(
        (config.forms && config.forms.missingConfigMessage) ||
          "This form is being connected on the new site. Please contact Safescape directly if you need immediate help.",
        "error"
      );
      return { ok: false, error: "missing_config" };
    }

    const { questionOrder, responses, uploads } = await collectSheetSubmissionData(formEl);
    setStatus(
      uploads.length ? "Uploading your file and sending your response…" : "Sending your response to the Safescape team…",
      "success"
    );

    try {
      const payload = new URLSearchParams({
        formType: getSheetFormType(formEl),
        sheetName: formEl.dataset.sheetName || "",
        questionOrder: JSON.stringify(questionOrder),
        responses: JSON.stringify(responses),
        uploads: JSON.stringify(uploads)
      });

      await fetch(webAppUrl, {
        method: "POST",
        mode: "no-cors",
        body: payload
      });

      formEl.reset();
      setStatus((config.forms && config.forms.successMessage) || "Thanks. Your form was sent successfully.", "success");
      return { ok: true };
    } catch (error) {
      setStatus("Something went wrong while sending this form. Please try again in a moment.", "error");
      return { ok: false, error: "submit_failed" };
    }
  }

  function showTermsSuccess(dialogEl) {
    const scrollEl = document.getElementById("terms-scroll");
    const actionsEl = document.getElementById("terms-actions");
    const agreeWrap = dialogEl.querySelector(".terms-agree");
    const agreeInput = document.getElementById("terms-agree");

    if (scrollEl) {
      scrollEl.innerHTML =
        "<p><strong>Thank you for your application!</strong> You will shortly recieve a mail from Safescape Foundation Team</p>";
      scrollEl.dataset.showingSuccess = "true";
    }
    setTermsDialogState("success", "Application submitted successfully.");
    setTermsSubmitLoading(false);
    if (agreeWrap) {
      agreeWrap.style.display = "none";
    }
    if (agreeInput) {
      agreeInput.checked = false;
      agreeInput.disabled = true;
    }
    setDialogError("");

    if (actionsEl) {
      actionsEl.innerHTML = '<button class="button button-primary" type="button" id="terms-ok">Okay</button>';
      const okBtn = document.getElementById("terms-ok");
      if (okBtn) {
        okBtn.addEventListener("click", () => {
          dialogEl.close();
          window.location.href = "index.html#top";
        });
      }
    }
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

    document.querySelectorAll("form[data-sheet-form], form.lead-form").forEach((sheetForm) => {
      sheetForm.addEventListener("submit", handleSheetFormSubmit);
      syncAllOtherFields(sheetForm);

      // Validate on blur/out for individual controls.
      sheetForm.addEventListener(
        "focusout",
        (event) => {
          const target = event.target;
          if (!target || !(target instanceof Element)) {
            return;
          }

          const grid = target.closest(".choice-grid");
          if (grid && grid.classList.contains("choice-grid") && grid.dataset.q) {
            syncOtherFieldsWithinGrid(grid);
            validateChoiceGrid(grid);
            return;
          }

          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement
          ) {
            if (target.dataset && target.dataset.q) {
              validateTextLikeControl(target);
            }
          }
        },
        true
      );

      // Validate choice grids on change (radios/checkboxes + "Other" text).
      sheetForm.addEventListener("change", (event) => {
        const target = event.target;
        if (!target || !(target instanceof Element)) {
          return;
        }
        const grid = target.closest(".choice-grid");
        if (grid && grid.classList.contains("choice-grid") && grid.dataset.q) {
          syncOtherFieldsWithinGrid(grid);
          validateChoiceGrid(grid);
        }
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement
        ) {
          if (target.dataset && target.dataset.q) {
            validateTextLikeControl(target);
          }
        }
        maybeApplyAdoptionTestFill(sheetForm, target);
      });

      sheetForm.addEventListener("input", (event) => {
        const target = event.target;
        if (!target || !(target instanceof Element)) {
          return;
        }
        maybeApplyAdoptionTestFill(sheetForm, target);
      });

      const confirmButton = sheetForm.querySelector("#confirm-button");
      const dialogEl = document.getElementById("terms-dialog");
      const agreeInput = document.getElementById("terms-agree");
      const statusEl = sheetForm.querySelector("[data-form-status]");

      if (confirmButton && dialogEl && agreeInput) {
        confirmButton.addEventListener("click", async () => {
          const { ok: isValid, firstInvalid } = validateSheetForm(sheetForm);
          if (!isValid) {
            if (firstInvalid && typeof firstInvalid.scrollIntoView === "function") {
              firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            if (statusEl) {
              statusEl.textContent = "Please fix the highlighted fields before continuing.";
              statusEl.classList.add("is-error");
            }
            return;
          }

          if (statusEl) {
            statusEl.textContent = "";
            statusEl.classList.remove("is-error", "is-success");
          }

          await loadTermsIntoDialog();
          // Restore terms content if it was replaced by a success message.
          const scrollEl = document.getElementById("terms-scroll");
          if (scrollEl && scrollEl.dataset.termsHtml && scrollEl.dataset.showingSuccess === "true") {
            scrollEl.innerHTML = scrollEl.dataset.termsHtml;
            scrollEl.dataset.showingSuccess = "false";
          }

          agreeInput.checked = false;
          agreeInput.disabled = false;
          const agreeWrap = dialogEl.querySelector(".terms-agree");
          if (agreeWrap) {
            agreeWrap.style.display = "";
          }

          const actionsEl = document.getElementById("terms-actions");
          if (actionsEl) {
            actionsEl.innerHTML =
              '<button class="button button-primary" type="button" id="terms-submit"><span class="terms-submit-text">Submit</span></button>';
          }
          setTermsDialogState(null, "");
          setTermsSubmitLoading(false);
          setDialogError("");

          moveCursorToHost(dialogEl);
          dialogEl.showModal();

          const newSubmitButton = document.getElementById("terms-submit");
          if (newSubmitButton) {
            newSubmitButton.addEventListener("click", async () => {
              setDialogError("");
              setTermsDialogState("loading", "Submitting your application...");
              setTermsSubmitLoading(true);
              if (!agreeInput.checked) {
                setTermsSubmitLoading(false);
                setTermsDialogState(null, "");
                setDialogError("Please confirm that you agree with the terms before submitting.");
                return;
              }

              const result = await submitSheetForm(sheetForm, statusEl);
              if (result.ok) {
                showTermsSuccess(dialogEl);
              } else {
                setTermsSubmitLoading(false);
                setTermsDialogState("error", "Something went wrong while sending this form.");
                setDialogError("Submission failed. Please try again in a moment.");
              }
            });
          }
        });

        // Close dialog on escape without submitting.
        dialogEl.addEventListener("close", () => {
          setDialogError("");
          moveCursorToHost(cursorHomeHost || document.body);
        });
      }
    });

    if (dialogCloseButton && petDialog) {
      dialogCloseButton.addEventListener("click", () => petDialog.close());
      petDialog.addEventListener("close", () => {
        moveCursorToHost(cursorHomeHost || document.body);
      });
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
    cursorHomeHost = document.body;

    function getCursorHost(target) {
      const dialog = target && target instanceof Element ? target.closest("dialog[open]") : null;
      return dialog || document.body;
    }

    const syncCursorHost = (target) => {
      const host = getCursorHost(target);
      moveCursorToHost(host);
    };

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
      syncCursorHost(event.target);
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

    const restoreCursorHost = () => {
      if (cursorHomeHost && cursorElement && cursorElement.parentElement !== cursorHomeHost) {
        cursorHomeHost.appendChild(cursorElement);
      }
    };

    document.addEventListener("focusin", (event) => {
      syncCursorHost(event.target);
    });

    document.addEventListener("click", (event) => {
      syncCursorHost(event.target);
    });

    document.addEventListener("close", restoreCursorHost, true);
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
    const host = target && target instanceof Element ? target.closest("dialog[open]") || document.body : document.body;
    host.appendChild(stamp);

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
      document.querySelectorAll(
        ".hero-section, main .section, .site-footer, .form-page-hero, .form-page-panel:not(.form-page-panel-embed)"
      )
    );

    if (!revealTargets.length) {
      return;
    }

    revealTargets.forEach((element) => element.classList.add("reveal-section"));

    // The Google Form embed is extremely tall; IntersectionObserver thresholds can
    // keep it "invisible" forever. Keep embeds visible from the start.
    document.querySelectorAll(".form-page-panel-embed").forEach((element) => {
      element.classList.add("reveal-section", "is-visible");
    });

    // Long form pages can also fail the IntersectionObserver threshold, causing a
    // section to fade out and never return. On form pages, keep sections visible.
    if (document.body.classList.contains("form-page-body")) {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
      return;
    }

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
        // Reduce the fit-scale by ~30% for a more natural visual size.
        const adjustedScale = rawScale * 0.7;
        // Clamp so text doesn't become unusably small/large.
        const scale = Math.max(0.7, Math.min(adjustedScale, 1.35));

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
