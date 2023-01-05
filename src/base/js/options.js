/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Options handles all the option-specific logic needed on the Options Page. This includes letting the user change
 * various options and setting them into the storage. The Options Page will also display a Welcome dialog on install
 * and an Error dialog if it doesn't detect the chrome.* object (e.g. if the extension was installed in a Private
 * or Incognito window).
 */
const Options = (() => {

  /**
   * Variables
   *
   * @param DOM      the DOM elements cache
   * @param items    the storage items cache
   * @param timeouts the reusable timeouts object that stores all named timeouts used on this page
   */
  const DOM = {};
  let items = {};
  let timeouts = {};

  /**
   * Initializes the Options window. This script is set to defer so the DOM is guaranteed to be parsed by this point.
   *
   * @private
   */
  async function init() {
    // If we don't have chrome, display an error message. Note: Firefox allows Private Window Installation, which is primarily the reason why we need this check
    if (typeof chrome === "undefined") {
      console.log("init() - error: chrome is undefined");
      MDC.dialogs.get("error-dialog").open();
      return;
    }
    const ids = document.querySelectorAll("[id]");
    const i18ns = document.querySelectorAll("[data-i18n]");
    const tooltips = document.querySelectorAll("[aria-label][aria-describedby='tooltip']");
    // Cache DOM elements
    for (const element of ids) {
      DOM["#" + element.id] = element;
    }
    // Set i18n (internationalization) text from messages.json
    for (const element of i18ns) {
      element[element.dataset.i18n] = chrome.i18n.getMessage((element.dataset.id ? element.dataset.id : element.id).replace(/-/g, '_').replace(/\*.*/, ''));
    }
    // Set Tooltip text from messages.json
    for (const element of tooltips) {
      element.setAttribute("aria-label", chrome.i18n.getMessage(element.getAttribute("aria-label").replace(/-/g, '_')));
    }
    // Add Event Listeners to the DOM elements
    // MDC Tab Bar
    MDC.tabBars.get("options-tab-bar").listen("MDCTabBar:activated", (event) => {
      document.querySelector(".mdc-tab-content--active").classList.remove("mdc-tab-content--active");
      document.querySelectorAll(".mdc-tab-content")[event.detail.index].classList.add("mdc-tab-content--active");
    });
    // UI
    DOM["#theme-icon-div"].addEventListener("click", async function (event) {
      await changeTheme(items.theme === "default" ? "light" : items.theme === "light" ? "dark" : "default");
      populateValuesFromStorage("theme");
    });
    DOM["#on-switch-input"].addEventListener("change", async function () {
      await Promisify.storageSet({"on": this.checked});
      if (!this.checked) { chrome.runtime.sendMessage({receiver: "background", greeting: "turnOff"}); }
      DOM["#on-switch-label"].textContent = chrome.i18n.getMessage((this.checked ? "on" : "off") + "_switch_label");
    });
    DOM["#icon-radios"].addEventListener("change", function (event) { changeIcon(event.target.value); });
    DOM["#button-size-input"].addEventListener("change", function () { if (+this.value >= 16 && +this.value <= 128) { saveInput(this, "buttonSize", "number");
      DOM["#button-size-icon"].style = "width:" + (+this.value) + "px; height:" + (+this.value) + "px;"; } });
    DOM["#button-size-icon"].addEventListener("click", function () { UI.clickHoverCss(this, "hvr-push-click"); });
    DOM["#tooltips-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"tooltipsEnabled": this.checked}); });
    DOM["#extra-inputs-input"].addEventListener("change", function () { chrome.storage.local.set({"extraInputs": this.checked}); });
    DOM["#version-theme-input"].addEventListener("change", function () { chrome.storage.local.set({"versionTheme": this.checked}); });
    DOM["#preferred-path-type-radios"].addEventListener("change", async function (event) {
      console.log(event.target.value + " event.target.value");
      await Promisify.storageSet({
        "preferredPathType": event.target.value,
        "nextLinkPath": event.target.value === "xpath" ? items.nextLinkXpath : items.nextLinkSelector,
        "prevLinkPath": event.target.value === "xpath" ? items.prevLinkXpath : items.prevLinkSelector
      });
      populateValuesFromStorage("all");
    });
    // Saves
    DOM["#saves-switch-input"].addEventListener("change", async function () {
      await Promisify.storageSet({"savesEnabled": this.checked});
    });
    DOM["#saves-tbody"].addEventListener("click", viewSave);
    DOM["#save-dialog-save-button"].addEventListener("click", editSave);
    DOM["#saves-add-button"].addEventListener("click", addSave);
    DOM["#saves-delete-button"].addEventListener("click", deleteSave);
    // This listener is needed because of the tooltip we added to the saves-add-button; the tooltip will reappear after the dialog is closed because the button gets focused again. Blurring it unfocuses the button
    MDC.dialogs.get("save-dialog").listen("MDCDialog:closed", function () {
      MDC.buttons.get("saves-add-button").root_.blur();
    });
    // Database
    DOM["#database-tbody"].addEventListener("click", viewDatabase);
    DOM["#database-dialog-stats-button"].addEventListener("click", () => {
      DOM["#database-dialog-json"].style.display = DOM["#database-dialog-json"].style.display === "block" ? "none" : "block";
      DOM["#database-dialog-stats"].style.display = DOM["#database-dialog-stats"].style.display === "block" ? "none" : "block";
    });
    DOM["#database-download-button"].addEventListener("click", downloadDatabase);
    DOM["#database-delete-button"].addEventListener("click", deleteDatabase);
    MDC.selects.get("database-location-select").listen("MDCSelect:change", (el) => { chrome.storage.local.set({"databaseLocation": el.detail.value}); });
    DOM["#database-update-input"].addEventListener("change", function () { if (+this.value >= 0 && +this.value <= 7) { saveInput(this, "databaseUpdate", "number");} });
    DOM["#database-mode-radios"].addEventListener("change", function (event) {
      saveInput(event.target, "databaseMode", "value");
      DOM["#database-blacklist-text-field-container"].className = event.target.value === "blacklist" ? "display-block fade-in" : "display-none";
      DOM["#database-whitelist-text-field-container"].className = event.target.value === "whitelist" ? "display-block fade-in" : "display-none";
    });
    DOM["#database-blacklist-textarea"].addEventListener("input", function () { saveInput(this, "databaseBlacklist", "array-split-newline"); });
    DOM["#database-whitelist-textarea"].addEventListener("input", function () { saveInput(this, "databaseWhitelist", "array-split-newline"); });
    // Shortcuts
    // Firefox: There is no programmatic way to go to the extension shortcuts screen, so display message telling the user where to go instead @see https://bugzilla.mozilla.org/show_bug.cgi?id=1538451
    // Edge: Note that while Edge will redirect chrome://extensions/shortcuts to the proper URL, it has its own URI/namespace so we should probably use that
    DOM["#shortcuts-button"].addEventListener("click", function () {
      if (items?.browserName === "firefox") {
        MDC.dialogs.get("shortcuts-dialog").open();
      } else if (items?.browserName === "edge") {
        chrome.tabs.create({url: "edge://extensions/shortcuts"});
      } else {
        chrome.tabs.create({url: "chrome://extensions/shortcuts"});
      }
    });
    // Scroll
    MDC.selects.get("scroll-divider-select").listen("MDCSelect:change", (el) => { chrome.storage.local.set({"scrollDivider": el.detail.value}); });
    // Scroll Detection changes the scroll append threshold view between pixels (sl) or pages (io)
    DOM["#scroll-detection-radios"].addEventListener("change", function (event) {
      saveInput(event.target, "scrollDetection", "value");
      DOM["#scroll-append-threshold-pixels"].className = event.target.value === "sl" ? "display-block fade-in" : "display-none";
      DOM["#scroll-append-threshold-pages"].className = event.target.value === "io" ? "display-block fade-in" : "display-none";
    });
    DOM["#scroll-behavior-radios"].addEventListener("change", function (event) { saveInput(event.target, "scrollBehavior", "value"); });
    DOM["#scroll-update-address-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollUpdateAddress": this.checked}); });
    DOM["#scroll-update-title-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollUpdateTitle": this.checked}); });
    DOM["#scroll-append-threshold-pages-input"].addEventListener("change", function () { if (+this.value >= 0 && +this.value <= 3) { saveInput(this, "scrollAppendThresholdPages", "number");} });
    DOM["#scroll-append-threshold-pixels-input"].addEventListener("change", function () { if (+this.value >= 0 && +this.value <= 3000) { saveInput(this, "scrollAppendThresholdPixels", "number");} });
    DOM["#scroll-append-delay-input"].addEventListener("change", function () { if (+this.value >= 1000 && +this.value <= 10000) { saveInput(this, "scrollAppendDelay", "number");} });
    DOM["#scroll-divider-align-radios"].addEventListener("change", function (event) { saveInput(event.target, "scrollDividerAlign", "value"); });
    DOM["#scroll-divider-buttons-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollDividerButtons": this.checked}); });
    DOM["#scroll-overlay-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollOverlay": this.checked}); });
    DOM["#scroll-icon-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollIcon": this.checked}); });
    DOM["#scroll-loading-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollLoading": this.checked}); });
    // Next
    DOM["#next-path-textarea"].addEventListener("input", function () { saveInput(this, "nextLinkPath", "value"); });
    DOM["#next-keywords-textarea"].addEventListener("input", function () { saveInput(this, "nextLinkKeywords", "array-split-nospace-lowercase"); });
    DOM["#prev-path-textarea"].addEventListener("input", function () { saveInput(this, "prevLinkPath", "value"); });
    DOM["#prev-keywords-textarea"].addEventListener("input", function () { saveInput(this, "prevLinkKeywords", "array-split-nospace-lowercase"); });
    // Increment
    MDC.selects.get("selection-select").listen("MDCSelect:change", (el) => { DOM["#selection-custom"].className = el.detail.value === "custom" ? "display-block fade-in" : "display-none"; chrome.storage.local.set({"selectionStrategy": el.detail.value}); });
    DOM["#selection-custom-save-button"].addEventListener("click", function () { customSelection("save"); });
    DOM["#selection-custom-test-button"].addEventListener("click", function () { customSelection("test"); });
    DOM["#leading-zeros-pad-by-detection-input"].addEventListener("change", function () { chrome.storage.local.set({ "leadingZerosPadByDetection": this.checked }); });
    DOM["#error-skip-checkboxes"].addEventListener("change", function () { updateErrorCodes(); });
    DOM["#error-codes-custom-input"].addEventListener("input", function () { saveInput(this, "errorCodesCustom", "array-split-all"); });
    // Extra
    DOM["#custom-scripts-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"customScriptsEnabled": this.checked}); });
    DOM["#lazy-load-input"].addEventListener("change", function () { chrome.storage.local.set({"lazyLoad": this.checked ? "auto" : undefined}); });
    DOM["#resize-media-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"resizeMediaEnabled": this.checked}); });
    DOM["#links-new-tab-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"linksNewTabEnabled": this.checked}); });
    DOM["#custom-events-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"customEventsEnabled": this.checked}); });
    DOM["#debug-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"debugEnabled": this.checked}); });
    // Backup
    DOM["#backup-button"].addEventListener("click", async function () {
      MDC.dialogs.get("backup-dialog").open();
      // Don't backup the databases due to size
      const backup = await Promisify.storageGet(undefined, undefined, ["databaseAP", "databaseIS"]);
      DOM["#backup-textarea"].value = JSON.stringify(backup, null, "  ");
    });
    DOM["#restore-button"].addEventListener("click", () => { MDC.dialogs.get("restore-dialog").open(); });
    DOM["#backup-download-button"].addEventListener("click", downloadBackup);
    DOM["#restore-file-button"].addEventListener("click", uploadFile);
    DOM["#restore-text-button"].addEventListener("click", uploadText);
    // About
    DOM["#reset-options-button"].addEventListener("click", () => { MDC.dialogs.get("reset-options-dialog").open(); });
    DOM["#reset-options-button-yes"].addEventListener("click", resetOptions);
    DOM["#manifest-name"].textContent = chrome.runtime.getManifest().name;
    DOM["#manifest-version"].textContent = chrome.runtime.getManifest().version;
    // Populate all values from storage
    populateValuesFromStorage("all");
  }

  /**
   * Populates the options form values from the extension storage.
   *
   * @param values which values to populate, e.g. "all" for all or "xyz" for only xyz values (with fade-in effect)
   * @private
   */
  async function populateValuesFromStorage(values) {
    items = await Promisify.storageGet(undefined, undefined, []);
    if (values === "all" || values === "theme") {
      // If this is the firstRun, don't override the theme based on the user's system default using the @media css query
      if (!items.firstRun) {
        document.documentElement.dataset.theme = items.theme;
      }
      // Note: If the user is using the default theme and they change the system default while the Options page is still open, the icon will not update. It's not really worth adding extra icons and doing display none
      DOM["#theme-icon"].children[0].setAttribute("href", "../lib/feather/feather.svg#" + (items.theme === "light" ? "sun" : items.theme === "dark" ? "moon" : getPreferredColor() === "light" ? "sun" : "moon"));
      DOM["#theme-icon"].style.display = "initial";
      // Firefox doesn't officially support ariaLabel, so we have to use setAttribute to change it
      DOM["#theme-icon-div"].setAttribute("aria-label", chrome.i18n.getMessage("theme_icon_tooltip").replaceAll("?", chrome.i18n.getMessage("theme_" + items.theme + "_label")));
    }
    if (values === "all" || values === "icon") {
      DOM["#icon-radio-dark"].checked = items.icon === "dark";
      DOM["#icon-radio-light"].checked = items.icon === "light";
    }
    if (values === "all" || values === "saves") {
      buildSavesTable(items.saves);
    }
    if (values === "all" || values === "database") {
      buildDatabasesTable(items);
      DOM["#database-options"].style.display = items.databaseAPEnabled || items.databaseISEnabled ? "block" : "none";
    }
    if (values === "all") {
      // Firefox Remove "Beta"
      if (items.browserName === "firefox") {
        DOM["#superscript-beta"].textContent = "";
        DOM["#version-beta"].textContent = "";
      }
      // Firefox: Use "experimental", not "in beta"
      DOM["#install-dialog-list-1"].textContent = chrome.i18n.getMessage("install_dialog_list_1").replace("?", chrome.i18n.getMessage(items.browserName === "firefox" ? "experimental_label" : "in_beta_label"));
      // UI
      MDC.switches.get("on-switch").checked = items.on;
      DOM["#on-switch-label"].textContent = chrome.i18n.getMessage((items.on ? "on" : "off") + "_switch_label");
      DOM["#button-size-input"].value = items.buttonSize;
      DOM["#button-size-icon"].style = (isNaN(items.buttonSize) || items.buttonSize < 16 || items.buttonSize > 128) ? "" : "width:" + items.buttonSize + "px; height:" + items.buttonSize + "px;";
      DOM["#tooltips-enable-input"].checked = items.tooltipsEnabled;
      DOM["#extra-inputs-input"].checked = items.extraInputs;
      DOM["#version-theme-input"].checked = items.versionTheme;
      DOM["#preferred-path-type-radio-selector"].checked = items.preferredPathType === "selector";
      DOM["#preferred-path-type-radio-xpath"].checked = items.preferredPathType === "xpath";
      // Saves
      MDC.switches.get("saves-switch").checked = items.savesEnabled;
      // Database
      MDC.selects.get("database-location-select").value = items.databaseLocation;
      DOM["#database-update-input"].value = items.databaseUpdate;
      DOM["#database-mode-blacklist-input"].checked = items.databaseMode === "blacklist";
      DOM["#database-mode-whitelist-input"].checked = items.databaseMode === "whitelist";
      DOM["#database-blacklist-text-field-container"].className =  items.databaseMode === "blacklist" ? "display-block" : "display-none";
      DOM["#database-blacklist-textarea"].value = items.databaseBlacklist?.join("\n") || "";
      DOM["#database-whitelist-text-field-container"].className = items.databaseMode === "whitelist" ? "display-block" : "display-none";
      DOM["#database-whitelist-textarea"].value = items.databaseWhitelist?.join("\n") || "";
      // Scroll
      DOM["#scroll-detection-io-input"].checked = items.scrollDetection === "io";
      DOM["#scroll-detection-sl-input"].checked = items.scrollDetection === "sl";
      DOM["#scroll-behavior-auto-input"].checked = items.scrollBehavior === "auto";
      DOM["#scroll-behavior-smooth-input"].checked = items.scrollBehavior === "smooth";
      DOM["#scroll-update-address-input"].checked = items.scrollUpdateAddress;
      DOM["#scroll-update-title-input"].checked = items.scrollUpdateTitle;
      DOM["#scroll-append-threshold-pixels"].className = items.scrollDetection === "sl" ? "display-block" : "display-none";
      DOM["#scroll-append-threshold-pages"].className = items.scrollDetection === "io" ? "display-block" : "display-none";
      DOM["#scroll-append-threshold-pages-input"].value = items.scrollAppendThresholdPages;
      DOM["#scroll-append-threshold-pixels-input"].value = items.scrollAppendThresholdPixels;
      DOM["#scroll-append-delay-input"].value = items.scrollAppendDelay;
      MDC.selects.get("scroll-divider-select").value = items.scrollDivider;
      DOM["#scroll-divider-align-left-input"].checked = items.scrollDividerAlign === "left";
      DOM["#scroll-divider-align-center-input"].checked = items.scrollDividerAlign === "center";
      DOM["#scroll-divider-align-right-input"].checked = items.scrollDividerAlign === "right";
      DOM["#scroll-divider-buttons-input"].checked = items.scrollDividerButtons;
      DOM["#scroll-overlay-input"].checked = items.scrollOverlay;
      DOM["#scroll-icon-input"].checked = items.scrollIcon;
      DOM["#scroll-loading-input"].checked = items.scrollLoading;
      // Next
      DOM["#next-path-textarea"].value = items.nextLinkPath;
      DOM["#next-keywords-textarea"].value = items.nextLinkKeywords;
      DOM["#prev-path-textarea"].value = items.prevLinkPath;
      DOM["#prev-keywords-textarea"].value = items.prevLinkKeywords;
      // Increment
      MDC.selects.get("selection-select").value = items.selectionStrategy;
      DOM["#selection-custom"].className = items.selectionStrategy === "custom" ? "display-block" : "display-none";
      DOM["#selection-custom-url-textarea"].value = items.selectionCustom.url;
      DOM["#selection-custom-regex-input"].value = items.selectionCustom.regex;
      DOM["#selection-custom-flags-input"].value = items.selectionCustom.flags;
      DOM["#selection-custom-group-input"].value = items.selectionCustom.group;
      DOM["#selection-custom-index-input"].value = items.selectionCustom.index;
      DOM["#leading-zeros-pad-by-detection-input"].checked = items.leadingZerosPadByDetection;
      DOM["#error-codes-404-input"].checked = items.errorCodes.includes("404");
      DOM["#error-codes-3XX-input"].checked = items.errorCodes.includes("3XX");
      DOM["#error-codes-4XX-input"].checked = items.errorCodes.includes("4XX");
      DOM["#error-codes-5XX-input"].checked = items.errorCodes.includes("5XX");
      DOM["#error-codes-CUS-input"].checked = items.errorCodes.includes("CUS");
      DOM["#error-codes-EXC-input"].checked = items.errorCodes.includes("EXC");
      DOM["#error-codes-custom"].className = items.errorCodes.includes("CUS") ? "display-block" : "display-none";
      DOM["#error-codes-custom-input"].value = items.errorCodesCustom;
      // Extra
      DOM["#custom-scripts-enable-input"].checked = items.customScriptsEnabled;
      DOM["#lazy-load-input"].checked = !!items.lazyLoad;
      DOM["#resize-media-enable-input"].checked = items.resizeMediaEnabled;
      DOM["#links-new-tab-enable-input"].checked = items.linksNewTabEnabled;
      DOM["#custom-events-enable-input"].checked = items.customEventsEnabled;
      DOM["#debug-enable-input"].checked = items.debugEnabled;
      // Dialogs
      DOM["#install-dialog-toolbar-browser"].textContent = chrome.i18n.getMessage("install_dialog_toolbar_" + (items.browserName ? items.browserName : "chrome"));
      // Re-layout MDC (Needs timeout for some reason...)
      setTimeout(() => { MDC.layout(); }, 500);
      // If first run (e.g. just been installed), open the install-dialog and set the default icon (default theme is system default, so no changes needed)
      if (items.firstRun) {
        MDC.dialogs.get("install-dialog").open();
        await Promisify.storageSet({"firstRun": false});
        const color = getPreferredColor();
        const icon = color === "dark" ? "light" : "dark";
        await changeIcon(icon);
        await populateValuesFromStorage("icon");
      }
    }
  }

  /**
   * Gets the user's preferred color scheme.
   *
   * Note: MV3 Service Worker does not have access to window and window.matchMedia, so setting the preferred icon color
   * is now delegated to the Options. Offscreen Document may be a potential solution? Requires offscreen permission and
   * flag + Chrome 109 @see https://bugs.chromium.org/p/chromium/issues/detail?id=1339382
   *
   * @returns {string} the preferred icon color, either "dark" or "light"
   * @private
   */
  function getPreferredColor() {
    let color = "light";
    if (typeof window !== "undefined" && window.matchMedia) {
      color = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    console.log("getPreferredColor() - color=" +  color);
    return color;
  }

  /**
   * Changes the extension's icon in the browser's toolbar.
   *
   * @param icon the icon color to change to
   * @private
   */
  async function changeIcon(icon) {
    await Promisify.storageSet({"icon": icon});
    Promisify.runtimeSendMessage({receiver: "background", greeting: "setIcon", icon: icon });
  }

  /**
   * Changes the theme from light mode to dark mode or vice-versa.
   *
   * @param theme the theme to change to ("dark" or "light")
   * @private
   */
  async function changeTheme(theme) {
    await Promisify.storageSet({"theme": theme});
  }

  /**
   * Builds out the saved URLs table HTML using a template.
   *
   * @param saves the saved URLs to build from
   * @private
   */
  function buildSavesTable(saves) {
    const savesExist = saves && saves.length > 0;
    const tbody = DOM["#saves-tbody"];
    const template = DOM["#saves-tr-template"];
    const trs = [];
    if (savesExist) {
      // Sort the saves by ID for presentation in the table
      saves.sort((a, b) => (a.id > b.id) ? 1 : -1);
      for (const save of saves) {
        const date = new Date(save.date);
        const tr = template.content.children[0].cloneNode(true);
        tr.children[0].children[0].children[0].value = save.id;
        tr.children[1].textContent = save.id;
        tr.children[2].children[0].textContent = save.title;
        tr.children[2].children[1].textContent = save.url;
        tr.children[2].children[1].dataset.id = save.id;
        tr.children[2].children[1].title = chrome.i18n.getMessage("saves_dialog_opener_title") + (save.title || save.url);
        // We test for save.date instead of date to allow users to save saves without dates and because Invalid Dates will still return a String "Invalid Date" which may be annoying to see
        tr.children[3].textContent = save.date ? date.toLocaleDateString() : " ";
        tr.children[3].title = save.date ? date.toLocaleDateString() + " " + date.toLocaleTimeString() : " ";
        trs.push(tr);
      }
      // Remove all existing rows in case the user resets the options to re-populate them
      // Note: Node.replaceChildren() is only supported since Chrome 86+, otherwise need to do tbody.deleteRow() and tbody.appendChild(tr) @see https://stackoverflow.com/a/65413839
      tbody.replaceChildren(...trs);
      MDC.tables.get("saves-data-table").layout();
    } else {
      // Else all saves have been deleted, so replace all the rows with nothing
      tbody.replaceChildren();
    }
    DOM["#saves-quantity"].textContent = chrome.i18n.getMessage("saves_quantity") + " " + saves?.length;
    DOM["#saves-details"].style.display = savesExist ? "block" : "none";
    DOM["#saves-manage"].style.display = savesExist ? "block" : "none";
    DOM["#saves-none"].style.display = savesExist ? "none" : "block";
  }

  /**
   * Views a Saved URL.
   * The user must click on a Saved URL in the table and a dialog will open containing its properties.
   *
   * @param event the click event
   * @private
   */
  function viewSave(event) {
    const element = event.target;
    if (element?.classList.contains("saves-dialog-opener")) {
      try {
        MDC.dialogs.get("save-dialog").open();
        // Must convert the element's dataset id (now a string) back to a number for proper comparison
        const id = Number(element.dataset.id);
        const save = items.saves.find(e => e.id === id);
        DOM["#save-dialog-type"].value = "edit";
        DOM["#save-dialog-id"].value = id;
        DOM["#save-dialog-title"].textContent = save.title || chrome.i18n.getMessage("save_dialog_default_title");
        DOM["#save-dialog-json"].textContent = JSON.stringify(save, null, "  ");
      } catch (e) {
        MDC.openSnackbar(chrome.i18n.getMessage("saves_snackbar_error_view_label") + e);
      }
    }
  }

  /**
   * Allows users to add a new Save using a default template or an existing save's template if one is selected/checked.
   *
   * @private
   */
  async function addSave() {
    // We must get the checkbox ID values dynamically via a query (can't use the DOM Cache)
    const checkboxes = [...document.querySelectorAll("#saves-tbody input[type=checkbox]:checked")].map(o => +o.value);
    console.log("addSave() - checkboxes=");
    console.log(checkboxes);
    const saves = await Promisify.storageGet("saves");
    // Users can add saves either using the default template or by using an existing save as a template
    let template = {
      action: "next",
      append: "page",
      nextLink: "[rel='next']",
      keyword: true,
      title: "",
      url: "https://www.example.com",
      type: "pattern"
    };
    if (checkboxes && checkboxes[0]) {
      for (const save of saves) {
        if (save.id === checkboxes[0]) {
          template = save;
          break;
        }
      }
    }
    // Generate a new ID and date for the template (override the existing values if present)
    template.id = saves.length > 0 ? Math.max.apply(Math, saves.map(s => s.id)) + 1 : 1;
    template.date = new Date().toJSON();
    // Save Dialog placeholder items
    MDC.dialogs.get("save-dialog").open();
    DOM["#save-dialog-type"].value = "add";
    DOM["#save-dialog-id"].value = template.id;
    DOM["#save-dialog-title"].textContent = template.title || chrome.i18n.getMessage("save_dialog_default_title");
    DOM["#save-dialog-json"].textContent = JSON.stringify(template, null, "  ");
  }

  /**
   * Edits a Save.
   * This function is available from the Saved URL dialog prompt when the user clicks the SAVE button.
   *
   * @private
   */
  async function editSave() {
    try {
      const json = JSON.parse(DOM["#save-dialog-json"].textContent);
      const type = DOM["#save-dialog-type"].value;
      const saves = await Promisify.storageGet("saves");
      console.log("editSave - editing save id=" + json.id + ", json=");
      console.log(json);
      // The URL is the only required piece so they can at least click on it to edit it; throw an error if the user removed it
      if (!json.url) {
        throw new Error(chrome.i18n.getMessage("saves_snackbar_error_url_label"));
      }
      // Users can't edit the ID (normally) but are allowed to change the date, hence the slight difference in logic between these two assignments:
      json.id = Number(DOM["#save-dialog-id"].value) || (saves.length > 0 ? Math.max.apply(Math, saves.map(s => s.id)) + 1 : 1);
      // Don't force adding in a date if they don't want one?
      // if (!json.date) {
      //   json.date = new Date().toJSON();
      // }
      if (type === "add") {
        console.log("editSave - adding new save");
        saves.push(json);
      } else if (type === "edit") {
        for (let i = 0; i < saves.length; i++) {
          if (saves[i].id === json.id) {
            console.log("editSave - editing a save");
            const old = saves[i];
            saves[i] = json;
            saves[i].url = saves[i].url || old.url;
            break;
          }
        }
      }
      // Resort back to default sort order
      saves.sort((a, b) => (a.url && b.url && a.url.length < b.url.length) ? 1 : -1);
      await Promisify.storageSet({saves: saves});
      populateValuesFromStorage("saves");
      MDC.dialogs.get("save-dialog").close();
      MDC.openSnackbar(chrome.i18n.getMessage("saves_snackbar_success_" + type + "_label"));
    } catch (e) {
      MDC.openSnackbar(chrome.i18n.getMessage("saves_snackbar_error_edit_label") + e);
    }
  }

  /**
   * Deletes Saved URL(s) (all types) by their unique ID.
   *
   * @private
   */
  async function deleteSave() {
    // We must get the checkbox ID values dynamically via a query (can't use the DOM Cache)
    const checkboxes = [...document.querySelectorAll("#saves-tbody input[type=checkbox]:checked")].map(o => +o.value);
    console.log("deleteSaves() - checkboxes=");
    console.log(checkboxes);
    if (!checkboxes || checkboxes.length <= 0) {
      MDC.openSnackbar(chrome.i18n.getMessage("saves_snackbar_select_delete_error_label"));
      return;
    }
    const saves = await Promisify.storageGet("saves");
    console.log("deleteSave() - checkboxes=" + checkboxes + ", saves=" + saves);
    if (saves && saves.length > 0) {
      const newSaves = saves.filter(o => !checkboxes.includes(o.id));
      // Re-generate IDs in case there is now a gap after filtering, e.g. if deleting ID 3 in this array: [1, 2, 4, 5, ...]
      newSaves.sort((a, b) => (a.id > b.id) ? 1 : -1);
      for (let i = 0; i < newSaves.length; i++) {
        if (newSaves[i]) {
          newSaves[i].id = i + 1;
        }
      }
      // Resort back to default sort order
      newSaves.sort((a, b) => (a.url && b.url && a.url.length < b.url.length) ? 1 : -1);
      await Promisify.storageSet({saves: newSaves});
      populateValuesFromStorage("saves");
      MDC.openSnackbar(chrome.i18n.getMessage("saves_snackbar_delete_label"));
    }
  }

  /**
   * Views a Database's items and its stats.
   *
   * The user must click on a Database in the table and a dialog will open containing its items.
   *
   * @param event the click event
   * @private
   */
  function viewDatabase(event) {
    const element = event.target;
    if (element && element.dataset.id && element.classList.contains("database-dialog-opener")) {
      MDC.dialogs.get("database-dialog").open();
      // Must convert the element's dataset id (now a string) back to a number for proper comparison
      const id = element.dataset.id;
      if (id === "AP" || id === "IS") {
        const database = Util.clone(items["database" + id]);
        if (id === "AP") {
          // Remove the microformat from the array before calculating the stats (it should always be the last item since we manually push it to the end)
          database.pop();
        }
        database.sort((a, b) => (!a.updated_at || a.updated_at < b.updated_at) ? 1 : -1);
        const property = getDatabases().filter(x => x.key === id)[0];
        DOM["#database-dialog-title"].textContent = property.name + chrome.i18n.getMessage("database_label");
        DOM["#database-dialog-json"].textContent = JSON.stringify(database, null, "  ");
        let creators = new Map();
        database.forEach(d => { creators.set(d.created_by, (creators.get(d.created_by) || 0) + 1); });
        creators = new Map([...creators].sort((a, b) => b[1] - a[1]));
        const usersArray = [];
        creators.forEach((key, value) => { usersArray.push(value + " - " + key); });
        let keys = new Map();
        // database.forEach(d => { const iterations = Object.keys(d).filter(k => !["created_by", "resource_url", "updated_at"].includes(k)); for (const key of iterations) { keys.set(key, (keys.get(key) || 0) + 1); } });
        database.forEach(d => { for (const key of Object.keys(d.data)) { keys.set(key, (keys.get(key) || 0) + 1); } });
        keys = new Map([...keys].sort((a, b) => b[1] - a[1]));
        const keysArray = [];
        keys.forEach((key, value) => { keysArray.push(value + " - " + key); });
        DOM["#database-dialog-stats"].textContent = (
          chrome.i18n.getMessage("database_creators_label") + JSON.stringify(usersArray, null, 2) + "\r\n" +
          chrome.i18n.getMessage("database_keys_label") + JSON.stringify(keysArray, null, 2)
        ).replaceAll(/[,\[\]"]/g, "");
        // Reset display in case the STATS button was clicked previously
        DOM["#database-dialog-json"].style.display = "block";
        DOM["#database-dialog-stats"].style.display = "none";
      }
    }
  }

  /**
   * Downloads the database(s).
   *
   * @private
   */
  async function downloadDatabase() {
    // We must get the checkbox ID values dynamically via a query (can't use the DOM Cache)
    const checkboxes = [...document.querySelectorAll("#database-tbody input[type=checkbox]:checked")].map(o => +o.value);
    console.log("downloadDatabase() - checkboxes=");
    console.log(checkboxes);
    if (!checkboxes || checkboxes.length <= 0) {
      MDC.openSnackbar(chrome.i18n.getMessage("database_snackbar_select_error"));
      return;
    }
    MDC.openSnackbar(chrome.i18n.getMessage("database_snackbar_download_downloading_label"));
    const response = await Promisify.runtimeSendMessage({receiver: "background", greeting: "downloadDatabase", downloadAP: checkboxes.includes(1), downloadIS: checkboxes.includes(2), downloadLocation: MDC.selects.get("database-location-select").value });
    console.log("downloadDatabase() - download response=" + JSON.stringify(response));
    if (response && response.downloaded) {
      MDC.openSnackbar(chrome.i18n.getMessage("database_snackbar_download_success_label"));
      populateValuesFromStorage("database");
    } else {
      MDC.openSnackbar(chrome.i18n.getMessage("database_snackbar_download_error_label") + (response ? response.error : ""), -1);
    }
  }

  /**
   * Deletes the database(s).
   *
   * @private
   */
  async function deleteDatabase() {
    // We must get the checkbox ID values dynamically via a query (can't use the DOM Cache)
    const checkboxes = [...document.querySelectorAll("#database-tbody input[type=checkbox]:checked")].map(o => +o.value);
    console.log("downloadDatabase() - checkboxes=");
    console.log(checkboxes);
    if (!checkboxes || checkboxes.length <= 0) {
      MDC.openSnackbar(chrome.i18n.getMessage("database_snackbar_select_error"));
      return;
    }
    for (const checkbox of checkboxes) {
      const databaseName = checkbox === 1 ? "AP" : checkbox === 2 ? "IS" : "??";
      await Promisify.storageSet({
        ["database" + databaseName]: [],
        ["database" + databaseName + "Date"]: null,
        ["database" + databaseName + "Location"]: "",
        ["database" + databaseName + "Enabled"]: false
      });
    }
    if (checkboxes.includes(1) && checkboxes.includes(2)) {
      await Promisify.storageSet({
        "databaseDate": null
      });
    }
    populateValuesFromStorage("database");
    MDC.openSnackbar(chrome.i18n.getMessage("database_snackbar_delete_label"));
  }

  /**
   * Builds out the databases table HTML using a template.
   *
   * @param items the storage items that contain database data to build from
   * @private
   */
  function buildDatabasesTable(items) {
    const tbody = DOM["#database-tbody"];
    const template = DOM["#database-tr-template"];
    const trs = [];
    const databases = getDatabases();
    if (databases && databases.length > 0) {
      for (const database of databases) {
        const tr = template.content.children[0].cloneNode(true);
        tr.children[0].children[0].children[0].value = database.id;
        tr.children[1].children[0].href = tr.children[1].children[0].href.replace("database.name", database.name);
        tr.children[1].children[0].textContent = database.name;
        tr.children[2].children[0].textContent = database.size;
        tr.children[2].children[0].dataset.id = database.key;
        tr.children[3].textContent = database.location;
        tr.children[4].textContent = database.date ? new Date(database.date).toLocaleString() : "";
        trs.push(tr);
      }
      // Remove all existing rows in case the user resets the options to re-populate them
      // Note: Node.replaceChildren() is only supported since Chrome 86+, otherwise need to do tbody.deleteRow() and tbody.appendChild(tr) @see https://stackoverflow.com/a/65413839
      tbody.replaceChildren(...trs);
      MDC.tables.get("database-data-table").layout();
    }
  }

  /**
   * Gets an array containing database properties and stats. Used for the various database functions.
   *
   * @returns {*} the databases in an array
   * @private
   */
  function getDatabases() {
    return [
      {
        id: 1,
        key: "AP",
        name: "AutoPagerize",
        size: items.databaseAP ? items.databaseAP.length : "",
        location: items.databaseAPLocation,
        date: items.databaseAPDate
      },
      {
        id: 2,
        key: "IS",
        name: "InfyScroll",
        size: items.databaseIS ? items.databaseIS.length : "",
        location: items.databaseISLocation,
        date: items.databaseISDate
      }
    ];
  }

  /**
   * Updates the error codes for error skip by examining if each checkbox is checked (on change event).
   *
   * @private
   */
  function updateErrorCodes() {
    chrome.storage.local.set({"errorCodes":
      [DOM["#error-codes-404-input"].checked ? DOM["#error-codes-404-input"].value : "",
       DOM["#error-codes-3XX-input"].checked ? DOM["#error-codes-3XX-input"].value : "",
       DOM["#error-codes-4XX-input"].checked ? DOM["#error-codes-4XX-input"].value : "",
       DOM["#error-codes-5XX-input"].checked ? DOM["#error-codes-5XX-input"].value : "",
       DOM["#error-codes-CUS-input"].checked ? DOM["#error-codes-CUS-input"].value : "",
       DOM["#error-codes-EXC-input"].checked ? DOM["#error-codes-EXC-input"].value : ""].filter(Boolean)
    });
    DOM["#error-codes-custom"].className = DOM["#error-codes-CUS-input"].checked ? "display-block fade-in" : "display-none";
  }

  /**
   * This function is called as the user is typing in a text input or textarea that is updated dynamically.
   * We don't want to call chrome.storage after each key press, as it's an expensive procedure, so we set a timeout delay.
   *
   * @param input      the text input or textarea
   * @param storageKey the storage key to set
   * @param type       the type (number, value, or array)
   * @private
   */
  function saveInput(input, storageKey, type) {
    console.log("saveInput() - about to clearTimeout and setTimeout... input.id=" + input.id + ", input.value=" + input.value + ", storageKey=" + storageKey +", type=" + type);
    clearTimeout(timeouts[input.id]);
    timeouts[input.id] = setTimeout(function () {
      // Note: We use Math.ceil in case the user tries to enter a decimal input for items where we expect a whole number. e.g. an input of "0.1" becomes "1"
      const storageValue =
        type === "value" ? input.value :
        type === "number" ? Math.ceil(+input.value) :
        type === "percentage" ? Math.ceil(+input.value) / 100 :
        type === "array-split-all" ? input.value ? [...new Set(input.value.split(/[, \n]+/).filter(Boolean))] : [] :
        type === "array-split-newline" ? input.value ? [...new Set(input.value.split(/[\n]+/).filter(Boolean))] : [] :
        type === "array-split-period" ? input.value ? [...new Set(input.value.split(".").filter(Boolean))] : [] :
        type === "array-split-nospace-lowercase" ? input.value ? [...new Set(input.value.replace(/\s|-|_/g, "").toLowerCase().split(/[,\n]/).filter(Boolean))] : [] :
        undefined;
      chrome.storage.local.set({[storageKey]: storageValue});
    }, 1000);
  }

  /**
   * Validates the custom selection regular expression fields and then performs the desired action.
   *
   * @param action the action to perform (test or save)
   * @private
   */
  async function customSelection(action) {
    const url = DOM["#selection-custom-url-textarea"].value;
    const regex = DOM["#selection-custom-regex-input"].value;
    const flags = DOM["#selection-custom-flags-input"].value;
    const group = +DOM["#selection-custom-group-input"].value;
    const index = +DOM["#selection-custom-index-input"].value;
    let regexp;
    let matches;
    let selection;
    let selectionStart;
    try {
      regexp = new RegExp(regex, flags);
      matches = regexp.exec(url);
      if (!regex || !matches) {
        throw new Error(chrome.i18n.getMessage("selection_custom_match_error"));
      }
      if (group < 0) {
        throw new Error(chrome.i18n.getMessage("selection_custom_group_error"));
      }
      if (index < 0) {
        throw new Error(chrome.i18n.getMessage("selection_custom_index_error"));
      }
      if (!matches[group]) {
        throw new Error(chrome.i18n.getMessage("selection_custom_matchgroup_error"));
      }
      selection = matches[group].substring(index);
      if (!selection || selection === "") {
        throw new Error(chrome.i18n.getMessage("selection_custom_matchindex_error"));
      }
      selectionStart = matches.index + index;
      if (selectionStart > url.length || selectionStart + selection.length > url.length) {
        throw new Error(chrome.i18n.getMessage("selection_custom_matchindex_error"));
      }
      // TODO: Can't validate selection because we can't call Increment.validateSelection() from Options Page
      // const base = isNaN(DOM["#base-select"].value) ? DOM["#base-select"].value : +DOM["#base-select"].value;
      // const baseCase = DOM["#base-case-uppercase-input"].checked ? DOM["#base-case-uppercase-input"].value : DOM["#base-case-lowercase-input"].checked;
      // const baseDateFormat = DOM["#base-date-format-input"].value;
      // const baseRoman = DOM["#base-roman-latin-input"].checked ? DOM["#base-roman-latin-input"].value : DOM["#base-roman-u216x-input"].checked ? DOM["#base-roman-u216x-input"].value : DOM["#base-roman-u217x-input"].value;
      // const baseCustom = DOM["#base-custom-input"].value;
      // const leadingZeros = selection.startsWith("0") && selection.length > 1;
      // if (Increment.validateSelection(selection, base, baseCase, baseDateFormat, baseRoman, baseCustom, leadingZeros)) {
      //   throw new Error(url.substring(selectionStart, selectionStart + selection.length) + " " + chrome.i18n.getMessage("selection_custom_matchnotvalid_error"));
      // }
    } catch (e) {
      console.log("customSelection() - Error:");
      console.log(e);
      DOM["#selection-custom-message-span"].textContent = e.message;
      return;
    }
    if (action === "test") {
      DOM["#selection-custom-message-span"].textContent = chrome.i18n.getMessage("selection_custom_test_success");
      DOM["#selection-custom-url-textarea"].setSelectionRange(selectionStart, selectionStart + selection.length);
      DOM["#selection-custom-url-textarea"].focus();
    } else if (action === "save") {
      DOM["#selection-custom-message-span"].textContent = chrome.i18n.getMessage("selection_custom_save_success");
      chrome.storage.local.set({"selectionCustom": { "url": url, "regex": regex, "flags": flags, "group": group, "index": index }});
    }
  }

  /**
   * Downloads the user's data in a backup file. Called when the Download Backup Button is clicked.
   *
   * Creates a hidden anchor and blob of the table HTML. It then simulates a mouse click event to download the blob,
   * and then revokes it to release it from memory. Note that we need the anchor because the actual element that calls
   * this is a button (anchors are the only elements that can have the download attribute).
   *
   * @private
   */
  async function downloadBackup() {
    console.log("downloadBackup() - downloading backup...");
    // Don't backup the databases due to size
    const storageBackup = await Promisify.storageGet(undefined, undefined, ["databaseAP", "databaseIS"]);
    const backup = JSON.stringify(storageBackup, null, "  ");
    const date = new Date().toJSON();
    const a = document.createElement("a");
    const blob = URL.createObjectURL(new Blob([backup], {"type": "text/plain"}));
    a.href = blob;
    // For the filename, we should replace the periods and colons in JSON Dates time with an underscore. Technically we don't have to do this, as the colon gets converted to _ automatically and the period is fine for the OS
    a.download = (chrome.runtime.getManifest().name + " Backup " + (date ? date : "")).replaceAll(/[\s.:]/g, "_") + ".json";
    a.dispatchEvent(new MouseEvent("click"));
    setTimeout(function () { URL.revokeObjectURL(blob); }, 5000);
  }

  /**
   * Uploads a file that the user selects and restores the data from it.
   *
   * @private
   */
  function uploadFile() {
    console.log("uploadFile() - uploading file...");
    clearTimeout(timeouts.uploadFile);
    timeouts.uploadFile = setTimeout(function () {
      const input = document.createElement("input");
      input.type = "file";
      // For historical reasons, always accept both .txt and .json
      input.accept = ".txt,.json";
      input.addEventListener("change", function(event) {
        console.log("uploadFile() - addEventListener() - change");
        const files = event.target.files;
        const reader = new FileReader();
        reader.onload = function() {
          console.log("uploadFile() - reader.onload()");
          restoreData(this.result);
          input.remove();
        };
        reader.readAsText(files[0]);
      }, false);
      input.dispatchEvent(new MouseEvent("click"));
    }, 100);
  }

  /**
   * Uploads data from a text input and restores the data from the value.
   *
   * @private
   */
  function uploadText() {
    clearTimeout(timeouts.uploadText);
    timeouts.uploadText = setTimeout(function () {
      restoreData(DOM["#restore-textarea"].value);
    }, 100);
  }

  /**
   * Restores the user's data from either a file or text input. Called when either of the two Upload Buttons is clicked.
   *
   * @param value the value of the data to restore, either from a file or text input
   * @returns {Promise<void>}
   * @see https://stackoverflow.com/questions/38833178/using-google-chrome-extensions-to-import-export-json-files
   * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file
   * @private
   */
  async function restoreData(value) {
    console.log("restoreData() - restoring data..., value=");
    console.log(value);
    try {
      // const value = DOM["#restore-textarea"].value;
      if (!value || typeof value !== "string" || value.trim() === "") {
        throw new Error(chrome.i18n.getMessage("restore_snackbar_error_empty"));
      }
      // parse() will throw any errors if it isn't valid JSON
      const data = JSON.parse(value);
      if (!data || typeof data !== "object") {
        throw new Error(chrome.i18n.getMessage("restore_snackbar_error_json"));
      }
      // We always require the currentVersion to do any type of restoration, we started adding currentVersion in the storage items when we added this feature
      if (!data.currentVersion) {
        throw new Error(chrome.i18n.getMessage("restore_snackbar_error_version"));
      }
      // Leverage storage.js to restore the data by passing it to the Background to give to it
      const response = await Promisify.runtimeSendMessage({receiver: "background", greeting: "restoreData", data: data, previousVersion: data.currentVersion});
      console.log("restoreData() - restore response=" + JSON.stringify(response));
      MDC.openSnackbar(chrome.i18n.getMessage("restore_snackbar_success_label"));
      // Now populate the Options with the restored data. Note: populateValuesFromStorage always get a new copy of the storage when called
      await populateValuesFromStorage("all");
    } catch (e) {
      console.log("restoreData() - Error:");
      console.log(e);
      MDC.openSnackbar(e.message);
    }
  }

  /**
   * Resets the options by clearing the storage and setting it with the default storage values, removing any extra
   * permissions, and lastly re-populating the options input values from storage again.
   *
   * Note: This function does not reset Saves and other one-time only storage items like install version.
   *
   * @private
   */
  function resetOptions() {
    console.log("resetOptions() - resetting options...");
    // Timeout in case the user tries double-clicking the button very fast
    clearTimeout(timeouts.resetOptions);
    timeouts.resetOptions = setTimeout(async function () {
      // First, get the User's current options (items) and the SDV (storage default values) to use as our baseline options
      items = await Promisify.storageGet(undefined, undefined, []);
      const options = await Promisify.runtimeSendMessage({receiver: "background", greeting: "getSDV"});
      // Second, replace some of the specific default values with existing user options (if they exist!)
      if (items) {
        options.installVersion = items.installVersion || options.installVersion;
        options.installDate = items.installDate || options.installDate;
        options.icon = items.icon || options.icon;
        options.theme = items.theme || options.theme;
        options.saves = items.saves || options.saves;
        options.savesEnabled = typeof items.savesEnabled === "boolean" ? items.savesEnabled : options.savesEnabled;
        options.databaseAP = items.databaseAP || options.databaseAP;
        options.databaseAPDate = items.databaseAPDate || options.databaseAPDate;
        options.databaseAPLocation = items.databaseAPLocation || options.databaseAPLocation;
        options.databaseAPEnabled = typeof items.databaseAPEnabled === "boolean" ? items.databaseAPEnabled : options.databaseAPEnabled;
        options.databaseIS = items.databaseIS || options.databaseIS;
        options.databaseISDate = items.databaseISDate || options.databaseISDate;
        options.databaseISLocation = items.databaseISLocation || options.databaseISLocation;
        options.databaseISEnabled = typeof items.databaseISEnabled === "boolean" ? items.databaseISEnabled : options.databaseISEnabled;
        options.databaseDate = items.databaseDate || options.databaseDate;
        options.databaseLocation = items.databaseLocation || options.databaseLocation;
        // Note: When validating databaseUpdate, we use typeof instead of existence because it can sometimes be 0, which is a truthy value (false)
        options.databaseUpdate = typeof items.databaseUpdate === "number" ? items.databaseUpdate : options.databaseUpdate;
        options.databaseMode = typeof items.databaseMode === "string" && ["blacklist", "whitelist"].includes(items.databaseMode) ? items.databaseMode : options.databaseMode;
        options.databaseBlacklist = items.databaseBlacklist || options.databaseBlacklist;
        options.databaseWhitelist = items.databaseWhitelist || options.databaseWhitelist;
      }
      // Third, clear the storage for a clean slate, set the new options as the storage, and populate the Options screen with the new options
      await Promisify.storageClear();
      await Promisify.storageSet(options);
      // Note: We don't have to set items = options here because populate already gets the items from storage
      await populateValuesFromStorage("all");
      MDC.openSnackbar(chrome.i18n.getMessage("reset_options_snackbar_label"));
    }, 200);
  }

  /**
   * Listen for requests from chrome.runtime.sendMessage (e.g. Background).
   *
   * @param request      the request containing properties to parse (e.g. greeting message)
   * @param sender       the sender who sent this message, with an identifying tabId
   * @param sendResponse the optional callback function (e.g. for a reply back to the sender)
   * @private
   */
  async function messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=");
    console.log(request);
    // Default response
    let response = {};
    switch (request.greeting) {
      case "databaseDownloaded":
        // This message is sent from the Background after the extension is first installed and when the database has been downloaded
        await populateValuesFromStorage("database");
        break;
      default:
        break;
    }
    sendResponse(response);
  }

  // Options Listeners
  // Message Listener: We need to return immediately if the function will be performing asynchronous work
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "options") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });

  // Initialize Options
  init();

})();