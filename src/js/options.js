/**
 * Infy Scroll
 * @copyright © 2020 Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Options handles all the option-specific logic needed on the Options Page. This includes letting the user change
 * various options and setting them into the storage. The Options Page will also display a Welcome dialog on install
 * and an Error dialog if it doesn't detect the chrome.* object (e.g. if the extension was installed in a Private
 * or Incognito window).
 *
 * Note: When the extension is first installed, Background will send a message to Options to repopulate the Database
 * Options after the Database has been downloaded.
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
  let items;
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
      element[element.dataset.i18n] = chrome.i18n.getMessage(element.id.replace(/-/g, '_').replace(/\*.*/, ''));
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
    DOM["#on-switch-input"].addEventListener("change", async function() {
      await Promisify.storageSet({"on": this.checked});
      // TODO: Should we do this and send a message to all tabs to turn off from here?
      if (!this.checked) { chrome.runtime.sendMessage({receiver: "background", greeting: "turnOff"}); }
      DOM["#on-switch-label"].textContent = chrome.i18n.getMessage((this.checked ? "on" : "off") + "_switch_label");
    });
    DOM["#toolbar-icon-radios"].addEventListener("change", function(event) { changeToolbarIcon.call(event.target); });
    DOM["#button-size-input"].addEventListener("change", function () { if (+this.value >= 16 && +this.value <= 128) { saveInput(this, "buttonSize", "number");
      DOM["#button-size-icon"].style = "width:" + (+this.value) + "px; height:" + (+this.value) + "px;"; } });
    DOM["#button-size-icon"].addEventListener("click", function () { UI.clickHoverCss(this, "hvr-push-click"); });
    DOM["#interface-theme-input"].addEventListener("change", function () { chrome.storage.local.set({"interfaceTheme": this.checked}); });
    DOM["#interface-messages-input"].addEventListener("change", function () { chrome.storage.local.set({"interfaceMessages": this.checked}); });
    DOM["#dynamic-settings-input"].addEventListener("change", function () { chrome.storage.local.set({"dynamicSettings": this.checked}); });
    // Saves
    DOM["#saved-urls-tbody"].addEventListener("click", viewSave);
    DOM["#saved-urls-delete-button"].addEventListener("click", function() { deleteSaveById(); });
    DOM["#saved-urls-dialog-json-input"].addEventListener("change", function() { DOM["#saved-urls-dialog-json"].style.display = this.checked ? "block" : "none"; });
    DOM["#whitelist-enable-input"].addEventListener("change", function () {
      chrome.storage.local.set({"whitelistEnabled": this.checked});
      DOM["#whitelist-settings"].className = this.checked ? "display-block fade-in" : "display-none";
    });
    DOM["#whitelist-textarea"].addEventListener("input", function() { saveInput(this, "whitelist", "array-split-newline"); });
    // Database
    DOM["#database-download-button"].addEventListener("click", downloadDatabase);
    DOM["#database-delete-button"].addEventListener("click", deleteDatabase);
    DOM["#database-auto-update-input"].addEventListener("change", function () { if (+this.value >= 0 && +this.value <= 7) { saveInput(this, "databaseAutoUpdate", "number");} });
    DOM["#database-auto-activate-input"].addEventListener("change", function () {
      chrome.storage.local.set({"databaseAutoActivate": this.checked});
      DOM["#database-blacklist-text-field-container"].className = this.checked ? "display-block fade-in" : "display-none";
      DOM["#database-whitelist-text-field-container"].className = !this.checked ? "display-block fade-in" : "display-none";
    });
    DOM["#database-blacklist-textarea"].addEventListener("input", function () { saveInput(this, "databaseBlacklist", "array-split-newline"); });
    DOM["#database-whitelist-textarea"].addEventListener("input", function () { saveInput(this, "databaseWhitelist", "array-split-newline"); });
    // Shortcuts
    // Firefox: There is no programmatic way to go to the extension shortcuts screen, so display message telling the user where to go instead
    // Edge: Note that while Edge will redirect chrome://extensions/shortcuts to the proper URL, it has its own URI/namespace so we should probably use that
    DOM["#shortcuts-button"].addEventListener("click", function() {
      if (items && items.browserName === "firefox") {
        MDC.dialogs.get("shortcuts-dialog").open();
      } else if (items && items.browserName === "edge") {
        chrome.tabs.update({url: "edge://extensions/shortcuts"});
      } else {
        chrome.tabs.update({url: "chrome://extensions/shortcuts"});
      }
    });
    // Scroll
    MDC.selects.get("scroll-divider-select").listen("MDCSelect:change", (el) => { chrome.storage.local.set({"scrollDivider": el.detail.value}); });
    // Scroll Detection changes the scroll append threshold view between pixels (sl) or pages (io)
    DOM["#scroll-detection-radios"].addEventListener("change", function(event) {
      saveInput(event.target, "scrollDetection", "value");
      DOM["#scroll-append-threshold-pixels"].className = event.target.value === "sl" ? "display-block fade-in" : "display-none";
      DOM["#scroll-append-threshold-pages"].className = event.target.value === "io" ? "display-block fade-in" : "display-none";
    });
    DOM["#scroll-behavior-radios"].addEventListener("change", function(event) { saveInput(event.target, "scrollBehavior", "value"); });
    DOM["#scroll-detection-throttle-input"].addEventListener("change", function () { if (+this.value >= 100 && +this.value <= 1000) { saveInput(this, "scrollDetectionThrottle", "number");} });
    DOM["#scroll-append-threshold-pages-input"].addEventListener("change", function () { if (+this.value >= 0 && +this.value <= 3) { saveInput(this, "scrollAppendThresholdPages", "number");} });
    DOM["#scroll-append-threshold-pixels-input"].addEventListener("change", function () { if (+this.value >= 0 && +this.value <= 3000) { saveInput(this, "scrollAppendThresholdPixels", "number");} });
    DOM["#scroll-append-delay-input"].addEventListener("change", function () { if (+this.value >= 1000 && +this.value <= 10000) { saveInput(this, "scrollAppendDelay", "number");} });
    DOM["#scroll-update-address-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollUpdateAddress": this.checked}); });
    DOM["#scroll-update-title-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollUpdateTitle": this.checked}); });
    DOM["#scroll-divider-align-radios"].addEventListener("change", function(event) { saveInput(event.target, "scrollDividerAlign", "value"); });
    DOM["#scroll-icon-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollIcon": this.checked}); });
    DOM["#scroll-loading-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollLoading": this.checked}); });
    DOM["#scroll-overlay-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollOverlay": this.checked}); });
    // Next Prev
    DOM["#next-type"].addEventListener("change", function() {
      chrome.storage.local.set({"nextType": event.target.value});
      DOM["#next-selector-text-field"].style.display = event.target.value === "selector" ? "" : "none";
      DOM["#next-xpath-text-field"].style.display = event.target.value === "xpath" ? "" : "none";
      MDC.layout();
    });
    DOM["#prev-type"].addEventListener("change", function() {
      chrome.storage.local.set({"prevType": event.target.value});
      DOM["#prev-selector-text-field"].style.display = event.target.value === "selector" ? "" : "none";
      DOM["#prev-xpath-text-field"].style.display = event.target.value === "xpath" ? "" : "none";
      MDC.layout();
    });
    DOM["#next-selector-input"].addEventListener("input", function() { saveInput(this, "nextSelector", "value"); });
    DOM["#next-xpath-input"].addEventListener("input", function() { saveInput(this, "nextXpath", "value"); });
    DOM["#next-property-input"].addEventListener("input", function() { saveInput(this, "nextProperty", "array-split-period"); });
    DOM["#next-keywords-textarea"].addEventListener("input", function() { saveInput(this, "nextKeywords", "array-split-nospace-lowercase"); });
    DOM["#prev-selector-input"].addEventListener("input", function() { saveInput(this, "prevSelector", "value"); });
    DOM["#prev-xpath-input"].addEventListener("input", function() { saveInput(this, "prevXpath", "value"); });
    DOM["#prev-property-input"].addEventListener("input", function() { saveInput(this, "prevProperty", "array-split-period"); });
    DOM["#prev-keywords-textarea"].addEventListener("input", function() { saveInput(this, "prevKeywords", "array-split-nospace-lowercase"); });
    // Increment Decrement
    MDC.selects.get("selection-select").listen("MDCSelect:change", (el) => { DOM["#selection-custom"].className = el.detail.value === "custom" ? "display-block fade-in" : "display-none"; chrome.storage.local.set({"selectionPriority": el.detail.value}); });
    MDC.selects.get("base-select").listen("MDCSelect:change", (el) => {
      const value = el.detail.value;
      chrome.storage.local.set({"base": isNaN(value) ? value : +value});
      DOM["#base-case"].className = +value > 10 ? "display-block fade-in" : "display-none";
      DOM["#base-date"].className = value === "date" ? "display-block fade-in" : "display-none";
      DOM["#base-roman"].className = value === "roman" ? "display-block fade-in" : "display-none";
      DOM["#base-custom"].className = value === "custom" ? "display-block fade-in" : "display-none";
      MDC.layout();
    });
    DOM["#selection-custom-save-button"].addEventListener("click", function () { customSelection("save"); });
    DOM["#selection-custom-test-button"].addEventListener("click", function() { customSelection("test"); });
    DOM["#interval-input"].addEventListener("change", function () { if (+this.value > 0) { saveInput(this, "interval", "number");} });
    DOM["#leading-zeros-pad-by-detection-input"].addEventListener("change", function() { chrome.storage.local.set({ "leadingZerosPadByDetection": this.checked }); });
    DOM["#base-case"].addEventListener("change", function() { chrome.storage.local.set({"baseCase": event.target.value}); });
    DOM["#base-date-format-input"].addEventListener("input", function() { saveInput(this, "baseDateFormat", "value"); });
    DOM["#base-roman"].addEventListener("change", function() { chrome.storage.local.set({"baseRoman": event.target.value}); });
    DOM["#base-custom-input"].addEventListener("input", function() { saveInput(this, "baseCustom", "value"); });
    DOM["#shuffle-limit-input"].addEventListener("change", function () { if (+this.value >= 1 && +this.value <= 5000) { saveInput(this, "shuffleLimit", "number"); } });
    DOM["#error-skip-input"].addEventListener("change", function() { if (+this.value >= 0 && +this.value <= 100) { saveInput(this, "errorSkip", "number"); } });
    DOM["#error-skip-checkboxes"].addEventListener("change", function() { updateErrorCodes(); });
    DOM["#error-codes-custom-input"].addEventListener("input", function() { saveInput(this, "errorCodesCustom", "array-split-all"); });
    // Extra
    DOM["#custom-scripts-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"customScriptsEnabled": this.checked}); });
    DOM["#scroll-lazy-load-input"].addEventListener("change", function () { chrome.storage.local.set({"scrollLazyLoad": this.checked}); });
    DOM["#resize-media-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"resizeMediaEnabled": this.checked}); });
    DOM["#links-new-tab-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"linksNewTabEnabled": this.checked}); });
    DOM["#custom-events-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"customEventsEnabled": this.checked}); });
    DOM["#decode-uri-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"decodeURIEnabled": this.checked}); });
    DOM["#debug-enable-input"].addEventListener("change", function () { chrome.storage.local.set({"debugEnabled": this.checked}); });
    // About
    DOM["#reset-options-button"].addEventListener("click", () => { MDC.dialogs.get("reset-options-dialog").open(); });
    DOM["#reset-options-button-yes"].addEventListener("click", resetOptions);
    DOM["#manifest-name"].textContent = chrome.runtime.getManifest().name;
    // TODO: Uncomment this out and include it for 0.7
    // DOM["#manifest-version"].textContent = chrome.runtime.getManifest().version;
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
    items = await Promisify.storageGet();
    if (values === "all" || values === "saves") {
      buildSavedURLsTable(items.saves);
    }
    if (values === "all" || values === "database") {
      updateDatabaseStats(items.database, items.databaseDate);
    }
    if (values === "all") {
      // UI
      MDC.switches.get("on-switch").checked = items.on;
      DOM["#on-switch-label"].textContent = chrome.i18n.getMessage((items.on ? "on" : "off") + "_switch_label");
      DOM["#toolbar-icon-radio-dark"].checked = items.toolbarIcon === "dark";
      DOM["#toolbar-icon-radio-light"].checked = items.toolbarIcon === "light";
      DOM["#button-size-input"].value = items.buttonSize;
      DOM["#button-size-icon"].style = (isNaN(items.buttonSize) || items.buttonSize < 16 || items.buttonSize > 128) ? "" : "width:" + items.buttonSize + "px; height:" + items.buttonSize + "px;";
      DOM["#interface-theme-input"].checked = items.interfaceTheme;
      DOM["#interface-messages-input"].checked = items.interfaceMessages;
      DOM["#dynamic-settings-input"].checked = items.dynamicSettings;
      // Note: Do NOT use element.ariaLabel instead of setAttribute in the below line. It is not supported in Firefox and only in Chrome 81+ See https://developer.mozilla.org/en-US/docs/Web/API/Element/ariaLabel
      DOM["#dynamic-settings-label"].setAttribute("aria-label", chrome.i18n.getMessage("dynamic_settings_tooltip") + " " + chrome.i18n.getMessage("dynamic_settings_current") + items.scrollAction + " " + items.scrollAppend + "." + chrome.i18n.getMessage("dynamic_settings_change"));
      // Saves
      DOM["#whitelist-enable-input"].checked = items.whitelistEnabled;
      DOM["#whitelist-settings"].className = items.whitelistEnabled ? "display-block" : "display-none";
      DOM["#whitelist-dynamic-settings-note"].textContent = chrome.i18n.getMessage("dynamic_settings_current") + items.scrollAction + " " + items.scrollAppend + ".";
      DOM["#whitelist-textarea"].value = items.whitelist ? items.whitelist.join("\n") : "";
      // Database
      DOM["#database-auto-update-input"].value = items.databaseAutoUpdate;
      DOM["#database-auto-activate-input"].checked = items.databaseAutoActivate;
      DOM["#database-blacklist-text-field-container"].className = items.databaseAutoActivate ? "display-block" : "display-none";
      DOM["#database-blacklist-textarea"].value = items.databaseBlacklist ? items.databaseBlacklist.join("\n") : "";
      DOM["#database-whitelist-text-field-container"].className = !items.databaseAutoActivate ? "display-block" : "display-none";
      DOM["#database-whitelist-textarea"].value = items.databaseWhitelist ? items.databaseWhitelist.join("\n") : "";
      // Shortcuts
      DOM["#shortcuts-dynamic-settings-note"].textContent = chrome.i18n.getMessage("dynamic_settings_current") + items.scrollAction + " " + items.scrollAppend;
      // Scroll
      DOM["#scroll-detection-io-input"].checked = items.scrollDetection === "io";
      DOM["#scroll-detection-sl-input"].checked = items.scrollDetection === "sl";
      DOM["#scroll-behavior-auto-input"].checked = items.scrollBehavior === "auto";
      DOM["#scroll-behavior-smooth-input"].checked = items.scrollBehavior === "smooth";
      DOM["#scroll-update-address-input"].checked = items.scrollUpdateAddress;
      DOM["#scroll-update-title-input"].checked = items.scrollUpdateTitle;
      DOM["#scroll-detection-throttle-input"].value = items.scrollDetectionThrottle;
      DOM["#scroll-append-threshold-pixels"].className = items.scrollDetection === "sl" ? "display-block" : "display-none";
      DOM["#scroll-append-threshold-pages"].className = items.scrollDetection === "io" ? "display-block" : "display-none";
      DOM["#scroll-append-threshold-pages-input"].value = items.scrollAppendThresholdPages;
      DOM["#scroll-append-threshold-pixels-input"].value = items.scrollAppendThresholdPixels;
      DOM["#scroll-append-delay-input"].value = items.scrollAppendDelay;
      MDC.selects.get("scroll-divider-select").value = items.scrollDivider;
      DOM["#scroll-divider-align-left-input"].checked = items.scrollDividerAlign === "left";
      DOM["#scroll-divider-align-center-input"].checked = items.scrollDividerAlign === "center";
      DOM["#scroll-divider-align-right-input"].checked = items.scrollDividerAlign === "right";
      DOM["#scroll-icon-input"].checked = items.scrollIcon;
      DOM["#scroll-loading-input"].checked = items.scrollLoading;
      DOM["#scroll-overlay-input"].checked = items.scrollOverlay;
      // Increment Decrement
      MDC.selects.get("selection-select").value = items.selectionPriority;
      DOM["#selection-custom"].className = items.selectionPriority === "custom" ? "display-block" : "display-none";
      DOM["#selection-custom-url-textarea"].value = items.selectionCustom.url;
      DOM["#selection-custom-regex-input"].value = items.selectionCustom.regex;
      DOM["#selection-custom-flags-input"].value = items.selectionCustom.flags;
      DOM["#selection-custom-group-input"].value = items.selectionCustom.group;
      DOM["#selection-custom-index-input"].value = items.selectionCustom.index;
      DOM["#interval-input"].value = items.interval;
      DOM["#leading-zeros-pad-by-detection-input"].checked = items.leadingZerosPadByDetection;
      // Convert number base to string just in case (can't set number as value, e.g. 10 instead of "10")
      MDC.selects.get("base-select").value = items.base + "";
      DOM["#base-case"].className = items.base > 10 ? "display-block" : "display-none";
      DOM["#base-case-lowercase-input"].checked = items.baseCase === "lowercase";
      DOM["#base-case-uppercase-input"].checked = items.baseCase === "uppercase";
      DOM["#base-date"].className = items.base === "date" ? "display-block" : "display-none";
      DOM["#base-date-format-input"].value = items.baseDateFormat;
      DOM["#base-roman"].className = items.base === "roman" ? "display-block" : "display-none";
      DOM["#base-roman-latin-input"].checked = items.baseRoman === "latin";
      DOM["#base-roman-u216x-input"].checked = items.baseRoman === "u216x";
      DOM["#base-roman-u217x-input"].checked = items.baseRoman === "u217x";
      DOM["#base-custom"].className = items.base === "custom" ? "display-block" : "display-none";
      DOM["#base-custom-input"].value = items.baseCustom;
      DOM["#shuffle-limit-input"].value = items.shuffleLimit;
      DOM["#error-skip-input"].value = items.errorSkip;
      DOM["#error-codes-404-input"].checked = items.errorCodes.includes("404");
      DOM["#error-codes-3XX-input"].checked = items.errorCodes.includes("3XX");
      DOM["#error-codes-4XX-input"].checked = items.errorCodes.includes("4XX");
      DOM["#error-codes-5XX-input"].checked = items.errorCodes.includes("5XX");
      DOM["#error-codes-CUS-input"].checked = items.errorCodes.includes("CUS");
      DOM["#error-codes-EXC-input"].checked = items.errorCodes.includes("EXC");
      DOM["#error-codes-custom"].className = items.errorCodes.includes("CUS") ? "display-block" : "display-none";
      DOM["#error-codes-custom-input"].value = items.errorCodesCustom;
      // Next Prev
      DOM["#next-selector-text-field"].style.display = items.nextType === "selector" ? "" : "none";
      DOM["#next-selector-input"].value = items.nextSelector;
      DOM["#next-type-selector"].checked = items.nextType === "selector";
      DOM["#next-xpath-text-field"].style.display = items.nextType === "xpath" ? "" : "none";
      DOM["#next-xpath-input"].value = items.nextXpath;
      DOM["#next-type-xpath"].checked = items.nextType === "xpath";
      DOM["#next-property-input"].value = items.nextProperty.join(".");
      DOM["#next-keywords-textarea"].value = items.nextKeywords;
      DOM["#prev-selector-text-field"].style.display = items.prevType === "selector" ? "" : "none";
      DOM["#prev-selector-input"].value = items.prevSelector;
      DOM["#prev-type-selector"].checked = items.prevType === "selector";
      DOM["#prev-xpath-text-field"].style.display = items.prevType === "xpath" ? "" : "none";
      DOM["#prev-xpath-input"].value = items.prevXpath;
      DOM["#prev-type-xpath"].checked = items.prevType === "xpath";
      DOM["#prev-property-input"].value = items.prevProperty.join(".");
      DOM["#prev-keywords-textarea"].value = items.prevKeywords;
      // Extra
      DOM["#custom-scripts-enable-input"].checked = items.customScriptsEnabled;
      DOM["#scroll-lazy-load-input"].checked = items.scrollLazyLoad;
      DOM["#resize-media-enable-input"].checked = items.resizeMediaEnabled;
      DOM["#links-new-tab-enable-input"].checked = items.linksNewTabEnabled;
      DOM["#custom-events-enable-input"].checked = items.customEventsEnabled;
      DOM["#decode-uri-enable-input"].checked = items.decodeURIEnabled;
      DOM["#debug-enable-input"].checked = items.debugEnabled;
      // Dialogs
      DOM["#install-dialog-toolbar-browser"].textContent = chrome.i18n.getMessage("install_dialog_toolbar_" + (items.browserName ? items.browserName : "chrome"));
      // Re-layout MDC (Needs timeout for some reason...)
      setTimeout(() => { MDC.layout(); }, 500);
      // If first run (extension has just been installed), open the install-dialog
      if (items.firstRun) {
        await Promisify.storageSet({"firstRun": false});
        MDC.dialogs.get("install-dialog").open();
      }
    }
  }

  /**
   * Changes the extension's icon in the browser's toolbar (browserAction).
   *
   * @private
   */
  function changeToolbarIcon() {
    // Firefox Android: chrome.browserAction.setIcon() not supported
    if (!chrome.browserAction.setIcon) {
      return;
    }
    // Possible values may be: dark, light
    chrome.browserAction.setIcon({
      path : {
        "16": "/img/icon-" + this.value + ".png",
        "24": "/img/icon-" + this.value + ".png",
        "32": "/img/icon-" + this.value + ".png"
      }
    });
    chrome.storage.local.set({"toolbarIcon": this.value});
  }

  /**
   * Builds out the saved URLs table HTML using a template.
   *
   * @param saves the saved URLs to build from
   * @private
   */
  function buildSavedURLsTable(saves) {
    // Remove all existing saves in case the user resets the options to re-populate them (Inefficient)
    const tbody = DOM["#saved-urls-tbody"];
    const template = DOM["#saved-urls-tr-template"];
    while (tbody.rows.length > 0) {
      tbody.deleteRow(0);
    }
    if (saves && saves.length > 0) {
      // Sort the saves by ID for presentation in the table
      saves.sort((a, b) => (a.id > b.id) ? 1 : -1);
      for (const save of saves) {
        const tr = template.content.children[0].cloneNode(true);
        tr.children[0].children[0].children[0].value = save.id;
        tr.children[1].textContent = save.id;
        tr.children[2].children[0].dataset.id = save.id;
        tr.children[2].children[0].textContent = save.url;
        tr.children[2].children[0].title = chrome.i18n.getMessage("saved_urls_click_details");
        tr.children[3].textContent = new Date(save.date).toLocaleDateString();
        tbody.appendChild(tr);
      }
      MDC.tables.get("saved-urls-data-table").layout();
    } else {
      DOM["#saved-urls-buttons"].style.display = "none";
    }
    DOM["#saved-urls-stats"].style.display = saves && saves.length > 0 ? "block" : "none";
    DOM["#saved-urls-quantity"].textContent = saves && saves.length > 0 ? chrome.i18n.getMessage("saved_urls_quantity") + " " + saves.length : "";
    DOM["#saved-urls-none"].style.display = saves && saves.length > 0 ? "none" : "block";
  }

  /**
   * Views a Saved URL.
   * The user must click on a Saved URL in the table and a dialog will open containing its properties.
   *
   * @param event the click event
   */
  function viewSave(event) {
    const element = event.target;
    if (element && element.dataset.id && element.classList.contains("saved-urls-details")) {
      MDC.dialogs.get("saved-urls-dialog").open();
      // Must convert the element's dataset id (now a string) back to a number for proper comparison
      const id = Number(element.dataset.id);
      const save = items.saves.find(e => e.id === id);
      const date = new Date(save.date);
      DOM["#saved-urls-dialog-title"].textContent = save.title ? save.title : chrome.i18n.getMessage("saved_urls_dialog_title");
      DOM["#saved-urls-dialog-id-value"].textContent = save.id;
      DOM["#saved-urls-dialog-url-value"].textContent = save.url;
      DOM["#saved-urls-dialog-type-value"].textContent = save.type;
      DOM["#saved-urls-dialog-action-value"].textContent = save.scrollAction;
      DOM["#saved-urls-dialog-append-value"].textContent = save.scrollAppend;
      DOM["#saved-urls-dialog-json"].style.display = DOM["#saved-urls-dialog-json-input"].checked ? "block" : "none";
      DOM["#saved-urls-dialog-json-data"].textContent = JSON.stringify(save, null, ' ');
      DOM["#saved-urls-dialog-date-value"].textContent = date.toLocaleDateString() + " " + date.toLocaleTimeString();
    }
  }

  /**
   * Deletes Saved URL(s) (all types) by their unique ID.
   *
   * @private
   */
  async function deleteSaveById() {
    // We must get the checkbox ID values dynamically via a query (can't use the DOM Cache)
    const checkboxes = [...document.querySelectorAll("#saved-urls-tbody input[type=checkbox]:checked")].map(o => +o.value);
    const saves = await Promisify.storageGet("saves");
    console.log("deleteSaveById() - checkboxes=" + checkboxes + ", saves=" + saves);
    if (saves && saves.length > 0 && checkboxes && checkboxes.length > 0) {
      const newsaves = saves.filter(o => !checkboxes.includes(o.id));
      // Re-generate IDs in case there is now a gap after filtering, e.g. if deleting ID 3 in this array: [1, 2, 4, 5, ...]
      newsaves.sort((a, b) => (a.id > b.id) ? 1 : -1);
      for (let i = 0; i < newsaves.length; i++) {
        if (newsaves[i]) {
          newsaves[i].id = i + 1;
        }
      }
      // Resort back to default sort order
      newsaves.sort((a, b) => (a.order > b.order) ? 1 : (a.order === b.order) ? ((a.url && b.url && a.url.length < b.url.length) ? 1 : -1) : -1);
      await Promisify.storageSet({saves: newsaves});
      populateValuesFromStorage("saves");
    }
  }

  /**
   * Downloads the database.
   *
   * @private
   */
  async function downloadDatabase() {
    const url = chrome.i18n.getMessage("database_url");
    const snackbar = MDC.snackbars.get("database-snackbar");
    snackbar.open();
    snackbar.labelText = chrome.i18n.getMessage("database_snackbar_download_downloading_label") + url + " ...";
    const response = await Promisify.runtimeSendMessage({receiver: "background", greeting: "downloadDatabase", options: {useBackup: true}});
    console.log("downloadDatabase() - download response=" + JSON.stringify(response));
    if (response && response.downloaded) {
      snackbar.labelText = chrome.i18n.getMessage("database_snackbar_download_success_label");
      populateValuesFromStorage("database");
    } else {
      snackbar.labelText = chrome.i18n.getMessage("database_snackbar_download_error_label") + url + " " + (response ? response.error: "");
    }
  }

  /**
   * Deletes the database.
   *
   * @private
   */
  async function deleteDatabase() {
    await Promisify.storageSet({
      "database": [],
      "databaseDate": null
    });
    populateValuesFromStorage("database");
    MDC.snackbars.get("database-delete-snackbar").open();
  }

  /**
   * Updates the database's stats (the URL count and last updated date). Also updates the button label to be either
   * "Download Database" or "Update Database" depending on whether the user has downloaded it or not.
   *
   * @param database the database array
   * @param jdate    the database date in JSON format
   * @private
   */
  function updateDatabaseStats(database, jdate) {
    const date = new Date(jdate);
    const databaseDownloaded = database && database.length > 0;
    DOM["#database-length"].textContent = databaseDownloaded ? database.length : 0;
    DOM["#database-date"].textContent = databaseDownloaded ? date.toLocaleDateString() + " " + date.toLocaleTimeString() : "N/A";
    DOM["#database-download-label"].textContent = chrome.i18n.getMessage("database_" + (databaseDownloaded ? "update" : "download") + "_label");
    DOM["#database-extras"].style.display = databaseDownloaded ? "block" : "none";
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
    console.log("saveInput() - about to clearTimeout and setTimeout... input.id=" + input.id + ", storageKey=" + storageKey +", type=" + type);
    clearTimeout(timeouts[input.id]);
    timeouts[input.id] = setTimeout(function() {
      // Note: We use Math.ceil in case the user tries to enter a decimal input for items where we expect a whole number. e.g. an input of "0.1" becomes "1"
      chrome.storage.local.set({[storageKey]:
        type === "value" ? input.value :
        type === "number" ? Math.ceil(+input.value) :
        type === "percentage" ? Math.ceil(+input.value) / 100 :
        type === "array-split-all" ? input.value ? input.value.split(/[, \n]+/).filter(Boolean) : [] :
        type === "array-split-newline" ? input.value ? input.value.split(/[\n]+/).filter(Boolean) : [] :
        type === "array-split-period" ? input.value ? input.value.split(".").filter(Boolean) : [] :
        type === "array-split-nospace-lowercase" ? input.value ? input.value.toLowerCase().split(/[,\n]/).filter(Boolean) : [] : undefined
      });
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
        throw chrome.i18n.getMessage("selection_custom_match_error");
      }
      if (group < 0) {
        throw chrome.i18n.getMessage("selection_custom_group_error");
      }
      if (index < 0) {
        throw chrome.i18n.getMessage("selection_custom_index_error");
      }
      if (!matches[group]) {
        throw chrome.i18n.getMessage("selection_custom_matchgroup_error");
      }
      selection = matches[group].substring(index);
      if (!selection || selection === "") {
        throw chrome.i18n.getMessage("selection_custom_matchindex_error");
      }
      selectionStart = matches.index + index;
      if (selectionStart > url.length || selectionStart + selection.length > url.length) {
        throw chrome.i18n.getMessage("selection_custom_matchindex_error");
      }
      // TODO: Can't validate selection because we can't call IncrementDecrement.validateSelection() from Options Page
      // const base = isNaN(DOM["#base-select"].value) ? DOM["#base-select"].value : +DOM["#base-select"].value;
      // const baseCase = DOM["#base-case-uppercase-input"].checked ? DOM["#base-case-uppercase-input"].value : DOM["#base-case-lowercase-input"].checked;
      // const baseDateFormat = DOM["#base-date-format-input"].value;
      // const baseRoman = DOM["#base-roman-latin-input"].checked ? DOM["#base-roman-latin-input"].value : DOM["#base-roman-u216x-input"].checked ? DOM["#base-roman-u216x-input"].value : DOM["#base-roman-u217x-input"].value;
      // const baseCustom = DOM["#base-custom-input"].value;
      // const leadingZeros = selection.startsWith("0") && selection.length > 1;
      // if (IncrementDecrement.validateSelection(selection, base, baseCase, baseDateFormat, baseRoman, baseCustom, leadingZeros)) {
      //   throw url.substring(selectionStart, selectionStart + selection.length) + " " + chrome.i18n.getMessage("selection_custom_matchnotvalid_error");
      // }
    } catch (e) {
      DOM["#selection-custom-message-span"].textContent = e;
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
   * Resets the options by clearing the storage and setting it with the default storage values, removing any extra
   * permissions, and lastly re-populating the options input values from storage again.
   *
   * Note: This function does not reset Saved URLs and other one-time only storage items like install version.
   *
   * @private
   */
  function resetOptions() {
    console.log("resetOptions() - resetting options...");
    // Timeout in case the user tries double-clicking the button very fast
    clearTimeout(timeouts.resetOptions);
    timeouts.resetOptions = setTimeout(async function() {
      // First, get the User's current options (items) and the SDV (storage default values) to use as our baseline options
      items = await Promisify.storageGet();
      const options = await Promisify.runtimeSendMessage({receiver: "background", greeting: "getSDV"});
      // Second, replace some of the specific default values with existing user options (if they exist!)
      if (items) {
        options.installVersion = items.installVersion ? items.installVersion : options.installVersion;
        options.installDate = items.installDate ? items.installDate : options.installDate;
        options.firstRun = false;
        options.toolbarIcon = items.toolbarIcon ? items.toolbarIcon : options.toolbarIcon;
        // It's annoying to reset this interfaceMessages option every time we reset:
        options.interfaceMessages = !!items.interfaceMessages;
        options.saves = items.saves ? items.saves : options.saves;
        options.whitelist = items.whitelist ? items.whitelist : options.whitelist;
        options.whitelistEnabled = !!items.whitelistEnabled;
        options.database = items.database ? items.database : options.database;
        options.databaseDate = items.databaseDate ? items.databaseDate : options.databaseDate;
        // Note: When validating databaseAutoUpdate, we use typeof instead of existence because it can sometimes be 0, which is a truthy value (false)
        options.databaseAutoUpdate = typeof items.databaseAutoUpdate === "number" ? items.databaseAutoUpdate : options.databaseAutoUpdate;
        options.databaseAutoActivate = !!items.databaseAutoActivate;
        options.databaseBlacklist = items.databaseBlacklist ? items.databaseBlacklist : options.databaseBlacklist;
        options.databaseWhitelist = items.databaseWhitelist ? items.databaseWhitelist : options.databaseWhitelist;
      }
      // Third, clear the storage for a clean slate, set the new options as the storage, and populate the Options screen with the new options
      await Promisify.storageClear();
      await Promisify.storageSet(options);
      // Note: We don't have to set items = options here because populate already gets the items from storage
      await populateValuesFromStorage("all");
      MDC.snackbars.get("reset-options-snackbar").open();
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
  function messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=" + JSON.stringify(request));
    // Default response
    let response = {};
    switch (request.greeting) {
      case "databaseDownloaded":
        // This message is sent from the Background after the extension is first installed and when the database has been downloaded
        populateValuesFromStorage("database");
        break;
      default:
        break;
    }
    sendResponse(response);
  }

  // Options Listeners
  // Message Listener: We need to return immediately if the function will be performing asynchronous work
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) { if (!request || request.receiver !== "options") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });

  // Initialize Options
  init();

})();