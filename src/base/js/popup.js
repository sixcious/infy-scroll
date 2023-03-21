/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Popup handles all the Popup Window-specific logic. This includes letting the user change the Action and Append Modes,
 * enabling Auto, and adjusting various instance properties.
 *
 * Popup directly messages with the Content Script in order to obtain the instance on the page. So if the extension
 * failed to load on the page, the Popup will display a message asking the user to refresh the page.
 *
 * Note: When injecting scripts, we can use document_end. Even for content script based extensions that are injected at
 * document_idle, it would force injecting the script in case it's taking a really long time at idle opposed to end.
 *
 * TODO: Consolidate all the check* functions into one single function.
 * TODO: Remove "decrement" action references.
 */
const Popup = (() => {

  /**
   * Variables
   *
   * @param {Object} DOM - the DOM elements cache
   * @param {Object} _ - the temporary instance before being accepted (enabled) in setup
   * @param {Object} instance - the actual instance object after being accepted (enabled) in setup and before being loaded
   * @param {Object} items - the storage items cache
   * @param {Object[]} tabs - the array of tab objects
   * @param {Object} timeouts - the reusable timeouts object that stores all named timeouts used on this page
   * @param {Object} checks - object that keeps track of whether an action/append check has been made (e.g. checkNextPrev)
   */
  const DOM = {};
  let _;
  let instance;
  let items;
  let tabs;
  let timeouts = {};
  let checks = {};

  /**
   * Gets all the declared variables for debugging purposes.
   *
   * @returns {*} the variables
   * @public
   * @debug
   */
  function debug() {
    return {
      DOM, _, instance, items, tabs, timeouts, checks
    };
  }

  /**
   * Initializes the Popup window. This script is set to defer so the DOM is guaranteed to be parsed by this point.
   *
   * @private
   */
  async function init() {
    // If we don't have chrome, display an error message. Note: Firefox allows Private Window Installation, which is primarily the reason why we need this check (though less so outside the Options screen)
    if (typeof chrome === "undefined") {
      console.log("init() - error: chrome is undefined");
      document.getElementById("messages").className = "display-flex";
      document.getElementById("popup-error-reason").textContent = "The chrome object is undefined! This indicates a severe error as chrome is the base object in the Extension API.";
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
      element.setAttribute("aria-label", chrome.i18n.getMessage(element.getAttribute("aria-label").replace(/-/g, '_').replace(/\*.*/, '')));
    }
    // Initialize popup content (1-time only)
    try {
      items = await Promisify.storageGet();
      if (!items || Object.keys(items).length <= 0) {
        throw new Error(chrome.i18n.getMessage("popup_error_reason_items"));
      }
      // Set the theme as soon as possible after getting the items
      document.documentElement.dataset.theme = items.theme;
      if (items.extraInputs) {
        document.documentElement.dataset.extraDocument = "true";
      }
      tabs = await Promisify.tabsQuery();
      if (!tabs || tabs.length < 0) {
        throw new Error(chrome.i18n.getMessage("popup_error_reason_tabs"));
      }
      instance = await Promisify.tabsSendMessage(tabs[0].id, {sender: "popup", receiver: "contentscript", greeting: "getInstance"});
      if (!instance || Object.keys(instance).length <= 0) {
        // Infy Scroll only: We try a second time to manually inject the content script via our activeTab permission
        // This will only work in Production, which will have infy-scroll.js defined
        await Promisify.tabsExecuteScript(tabs[0].id, {file: "/js/infy-scroll.js", runAt: "document_end"});
        instance = await Promisify.tabsSendMessage(tabs[0].id, {sender: "popup", receiver: "contentscript", greeting: "getInstance"});
        if (!instance || Object.keys(instance).length <= 0) {
          throw new Error(chrome.i18n.getMessage("popup_error_reason_instance"));
        }
      }
      // TabID - Need to set the tabId now in certain situations in order to receive runtime messages (e.g. blacklist/whitelist when it hasn't been on yet)
      if (!instance.tabId || instance.tabId === 0) {
        instance.tabId = tabs[0].id;
      }
      // Can technically omit this sendMessage in favor of when we sendMessage for getInstance above, but just for neatness/separation:
      chrome.tabs.sendMessage(tabs[0].id, {sender: "popup", receiver: "contentscript", greeting: "popupOpened", popupOpened: true});
    } catch (e) {
      console.log("init() - error initializing 1-time only objects (tabs, items, or instance). Error:");
      console.log(e);
      DOM["#messages"].className = "display-flex";
      // Need the || because: e.message if we are throwing the error, e if it's a chrome error
      DOM["#popup-error-reason"].textContent = e.message || e;
      // We need to add the options-button-2 event listener before we return
      DOM["#options-button-2"].addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
      DOM["#manage-button"].addEventListener("click", function () {
        MDC.openSnackbar("To manage your settings, right click on the toolbar icon and select Manage Extension", -1);
        chrome.tabs.create({url: "chrome://extensions/?id=" + chrome.runtime.id});
      });
      return;
    }
    console.log("init() - tabs=");
    console.log(tabs);
    console.log("init() - items=");
    console.log(items);
    console.log("init() - instance=");
    console.log(instance);
    _ = Util.clone(instance);
    // 2 Popup Views: If enabled, show Controls. If not enabled, show Setup
    if (instance.enabled) {
      toggleView.call(DOM["#accept-button"]);
    } else {
      // toggleView.call(DOM["#setup-button"]);
      toggleView.call(DOM["#popup"]);
    }
    // Initialization that requires storage items
    const buttons = document.querySelectorAll("#controls-buttons svg");
    for (const button of buttons) {
      button.style.width = button.style.height = items.buttonSize + "px";
      button.addEventListener("click", clickActionButton);
    }
    // If tooltips not enabled, disable them by removing their attribute
    if (items && !items.tooltipsEnabled) {
      for (const element of tooltips) {
        element.removeAttribute("aria-label");
        // The following removes every single tooltip attribute, but we just need to remove aria-label
        // element.removeAttribute("aria-describedby");
        // element.removeAttribute("data-balloon-pos");
        // element.removeAttribute("data-balloon-length");
        // element.classList.remove("tooltip", "tooltip-without-underline");
      }
    }
    DOM["#theme-version"].className = items.themeVersion ? "display-block" : "display-none";
    // Initialization that requires the instance
    MDC.lists.get("action-list").selectedIndex = instance.action === "next" || instance.action === "prev" ? 0 : instance.action === "click" ? 1 : instance.action === "increment" || instance.action === "decrement" ? 2 : instance.action === "list" ? 3 : -1;
    MDC.lists.get("append-list").selectedIndex = instance.append === "page" ? 0 : instance.append === "iframe" ? 1 : instance.append === "element" ? 2 : instance.append === "media" ? 3 : instance.append === "none" ? 4 : instance.append === "ajax" ? 5 : -1;
    MDC.chips.get((instance.action === "prev" ? "prev" : "next") + "-chip").selected = true;
    MDC.chips.get("button-detection-" + (instance.buttonDetection === "manual" ? "manual": "auto") + "-chip").selected = true;
    MDC.chips.get("page-element-iframe-mode-" + (instance.pageElementIframe === "trim" ? "trim" : "import") + "-chip").selected = true;
    MDC.chips.get("media-type-" + (instance.mediaType === "video" ? "video" : instance.mediaType === "audio" ? "audio" : "image") + "-chip").selected = true;
    MDC.chips.get("ajax-mode-" + (instance.ajaxMode === "native" ? "native": "iframe") + "-chip").selected = true;
    MDC.chips.get("base-case-" + (instance.baseCase === "uppercase" ? "uppercase" : "lowercase") + "-chip").selected = true;
    MDC.chips.get("base-roman-" + (instance.baseRoman === "u217x" ? "u217x" : instance.baseRoman === "u216x" ? "u216x" : "latin") + "-chip").selected = true;
    // If this is a database URL and there's a resource URL, make the icon clickable and point to it
    if (instance.databaseFound && instance.databaseResourceURL) {
      DOM["#database-icon"].style.cursor = "pointer";
      DOM["#database-icon"].addEventListener("click", () => { chrome.tabs.create({url: instance.databaseResourceURL }); });
    }
    updateSetup(true);
    // Note: changeAction already calls changeAppend(), so we don't need to call changeAppend() here
    changeAction("init()");
    // If Auto is on, pause Auto when Popup is first opened for convenience
    if (instance.autoEnabled && !instance.autoPaused) {
      console.log("init() - pausing auto on popup startup");
      chrome.tabs.sendMessage(tabs[0].id, {sender: "popup", receiver: "contentscript", greeting: "executeWorkflow", action: "auto", caller: "popupClickActionButton"});
    }
    // Show "Found" snackbar only if it hasn't been viewed yet and instance isn't enabled and if save/database found
    if (!instance.viewedFoundSnackbar && !instance.enabled && (instance.saveFound || instance.databaseFound)) {
      // Note: We need to set both of these to true. If the user exits the Popup, then the instance will have this set.
      // If the user clicks the ACCEPT Button, then _ will have this set
      instance.viewedFoundSnackbar = true;
      _.viewedFoundSnackbar = true;
      await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "setInstance", instance: instance});
      setTimeout(() => {
        const one = !instance.saveFound && instance.databaseFound ? items.databaseMode === "blacklist" && instance.databaseBlacklisted ? chrome.i18n.getMessage("blacklisted_label") : items.databaseMode === "whitelist" && !instance.databaseWhitelisted ? chrome.i18n.getMessage("unwhitelisted_label") : "" : "";
        const two = chrome.i18n.getMessage("popup_found_" + instance.via);
        MDC.openSnackbar(chrome.i18n.getMessage("popup_found_snackbar_label").replace("?1", one).replace("?2", two), 8000);
      }, 100);
    }
    // The drawer can be expanded or collapsed; we always save the last choice the user made and initialize the drawer with that choice
    openDrawer(undefined, items.drawerCollapsed);
    // Add event listeners after we initialize the inputs with the instance. For example, MDC select next/prev type listeners would have fired if we set their value after listening to them
    addEventListeners();
  }

  /**
   * Adds all the event listeners needed for the DOM elements. Only called one time by init().
   *
   * @private
   */
  function addEventListeners() {
    DOM["#setup-button"].addEventListener("click", toggleView);
    DOM["#accept-button"].addEventListener("click", setup);
    DOM["#cancel-button"].addEventListener("click", toggleView);
    DOM["#multi-button"].addEventListener("click", clickMulti);
    DOM["#save-button-yes"].addEventListener("click", function () { DOM["#save-input"].checked = true; DOM["#save-button-icon"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#heart"); });
    DOM["#save-button-no"].addEventListener("click", function () { DOM["#save-input"].checked = false; DOM["#save-button-icon"].children[0].setAttribute("href", "../lib/fontawesome/regular.svg#heart"); });
    DOM["#scripts-button"].addEventListener("click", function () { MDC.dialogs.get("scripts-dialog").open(); });
    DOM["#help-button"].addEventListener("click", function () { MDC.dialogs.get("help-dialog").open(); });
    // This keeps the dialog from auto-focusing on an element we don't want it to
    MDC.dialogs.get("help-dialog").listen("MDCDialog:opened", () => { document.activeElement.blur(); });
    DOM["#options-button"].addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
    DOM["#options-button-2"].addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
    // Element Picker
    DOM["#element-picker-next-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-prev-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-button-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-element-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-load-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-remove-button"].addEventListener("click", clickElementPicker);
    DOM["#auto-detect-page-element-button"].addEventListener("click", clickAutoDetectPageElement);
    // Change Type Label
    DOM["#next-link-type-label"].addEventListener("click", changeType);
    DOM["#prev-link-type-label"].addEventListener("click", changeType);
    DOM["#button-type-label"].addEventListener("click", changeType);
    DOM["#page-element-type-label"].addEventListener("click", changeType);
    // Toggle the drawer by first always closing it and then listening to see when it has finished closing to re-open it with the new collapsed state
    DOM["#drawer-button"].addEventListener("click", closeDrawer);
    MDC.drawers.get("app-drawer").listen("MDCDrawer:closed", openDrawer);
    MDC.fabs.get("save-fab").listen("click", () => { MDC.dialogs.get("save-dialog").open(); if (!checks.checkSave) { checkSave(false, "save-fab click listener"); } MDC.layout(); });
    // TODO: These MDC list listeners are being executed twice each call due to the following issue/bug, need to update MDC beyond version 6. Until then, adding click listener manually
    // https://github.com/material-components/material-components-web/issues/5221
    // MDC.lists.get("action-list").listen("MDCList:action", changeAction);
    // MDC.lists.get("append-list").listen("MDCList:action", changeAppend);
    DOM["#action-list"].addEventListener("click", changeAction);
    DOM["#append-list"].addEventListener("click", changeAppend);
    // Save
    DOM["#save-dialog-content"].addEventListener("input", function (event) { if (event.target.id !== "save-name-textarea") { checkSave(true, "save-dialog-content input listener"); } });
    // Next Prev
    DOM["#next-prev"].addEventListener("input", function (event) { checkNextPrev(event.target.dataset.action, true, true, false, "next-prev input listener"); });
    MDC.chipsets.get("next-prev-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() next-prev-chip-set - clicked " + this.id + ", action=" + this.dataset.action);
      MDC.chips.get(this.id).selected = true;
      changeAction("next-prev-chip-set click listener");
      checkNextPrev(this.dataset.action, false, false, true, "next-prev-chip-set click listener");
    }));
    // Increment
    DOM["#url-textarea"].addEventListener("select", selectURL);
    MDC.selects.get("base-select").listen("MDCSelect:change", () => {
      const value = MDC.selects.get("base-select").value;
      // Note: There is a recent bug in Chromium that makes the radio dots appear outside the circles when fade-in, so we changed them to chip-sets
      DOM["#base-case"].className = +value > 10 ? "display-block fade-in" : "display-none";
      DOM["#base-date"].className = value === "date" ? "display-block fade-in" : "display-none";
      DOM["#base-roman"].className = value === "roman" ? "display-block fade-in" : "display-none";
      DOM["#base-custom"].className = value === "custom" ? "display-block fade-in" : "display-none";
      MDC.layout();
    });
    MDC.chipsets.get("base-case-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() base-case-chip-set - clicked " + this.id + ", value=" + this.dataset.value);
      MDC.chips.get(this.id).selected = true;
      _.baseCase = this.dataset.value;
    }));
    MDC.chipsets.get("base-roman-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() base-roman-chip-set - clicked " + this.id + ", value=" + this.dataset.value);
      MDC.chips.get(this.id).selected = true;
      _.baseRoman = this.dataset.value;
    }));
    DOM["#shuffle-button"].addEventListener("click", function () { MDC.dialogs.get("shuffle-dialog").open(); });
    // Shuffle Button is an SVG, so use className.baseVal instead of just className
    DOM["#shuffle-button-yes"].addEventListener("click", function () { DOM["#shuffle-enabled-input"].checked = true; DOM["#shuffle-button-icon"].className.baseVal = ""; });
    DOM["#shuffle-button-no"].addEventListener("click", function () { DOM["#shuffle-enabled-input"].checked = false; DOM["#shuffle-button-icon"].className.baseVal = "disabled"; });
    // Button
    DOM["#button-path"].addEventListener("input", function (event) { checkButton(true, true,"button-section input listener"); });
    MDC.chipsets.get("button-detection-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() button-detection-chip-set - clicked " + this.id + ", value=" + this.dataset.value);
      MDC.chips.get(this.id).selected = true;
      _.buttonDetection = this.dataset.value;
      DOM["#button-position"].className = this.dataset.value === "manual" ? "display-block fade-in" : "visibility-hidden";
    }));
    // List
    DOM["#find-links-button"].addEventListener("click", clickFindLinks);
    DOM["#list-sort-button"].addEventListener("click", clickListSort);
    DOM["#list-button"].addEventListener("click", function () { MDC.dialogs.get("list-dialog").open(); });
    // List Button is an SVG, so use className.baseVal instead of just className
    DOM["#list-button-yes"].addEventListener("click", function () { DOM["#list-options-input"].checked = true; DOM["#list-button-icon"].className.baseVal = ""; });
    DOM["#list-button-no"].addEventListener("click", function () { DOM["#list-options-input"].checked = false; DOM["#list-button-icon"].className.baseVal = "disabled"; });
    // Element
    DOM["#element"].addEventListener("input", function (event) { if (event.target.id !== "page-element-iframe-input") { checkPageElement(true, true, "", "element input listener"); } });
    DOM["#page-element-iframe-input"].addEventListener("change", function () { DOM["#page-element-iframe-mode"].className = this.checked ? "chip-set chip-set-absolute fade-in" : "display-none"; });
    MDC.chipsets.get("page-element-iframe-mode-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() page-element-iframe-mode-chip-set - clicked " + this.id + ", value=" + this.dataset.value);
      MDC.chips.get(this.id).selected = true;
      _.pageElementIframe = this.dataset.value;
    }));
    // Media
    MDC.chipsets.get("media-type-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() media-type-chip-set - clicked " + this.id + ", value=" + this.dataset.value);
      MDC.chips.get(this.id).selected = true;
      _.mediaType = this.dataset.value;
    }));
    // AJAX
    MDC.chipsets.get("ajax-mode-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() ajax-mode-chip-set - clicked " + this.id + ", value=" + this.dataset.value);
      MDC.chips.get(this.id).selected = true;
      _.ajaxMode = this.dataset.value;
      DOM["#ajax-iframe"].className = this.dataset.value === "iframe" ? "display-inline-block fade-in" : "display-none";
      DOM["#ajax-native"].className = this.dataset.value === "native" ? "display-inline-block fade-in" : "display-none";
    }));
    // Scripts
    DOM["#lazy-load-input"].addEventListener("change", function () { DOM["#lazy-load-settings"].className = this.checked ? "display-inline fade-in" : "display-none"; MDC.layout(); });
    DOM["#lazy-load-mode"].addEventListener("change", function () { DOM["#lazy-load-attribute"].className = event.target.value === "manual" ? "display-block fade-in" : "display-none"; MDC.layout();  });
    DOM["#mirror-page-input"].addEventListener("change", function () { DOM["#mirror-page-settings"].className = this.checked ? "display-inline fade-in" : "display-none"; MDC.layout(); });
    DOM["#mirror-page-mode"].addEventListener("change", function () { DOM["#puppet"].className = event.target.value === "puppet" ? "display-block fade-in" : "display-none"; MDC.layout();  });
    // Help
    DOM["#debug-copy-button"].addEventListener("click", async () => {
      // Decided not to include the storage items as they contain too many sensitive things; if they're really needed to help debug, the user can copy them from the Options Manual Backup/Restore
      // // Cloning the items because we need to delete non-needed keys
      // const items_ = Util.clone(items);
      // for (const key of ["installDate", "installVersion", "databaseBlacklist", "databaseWhitelist", "statsEnabled", "statsActions", "statsAppends", "statsElements"]) { delete items_[key]; }
      // const data = JSON.stringify({ "instance": _, "items": items_ }, null, "  ");
      const data = JSON.stringify(_, null, "  ");
      await navigator.clipboard.writeText(data);
      MDC.openSnackbar(chrome.i18n.getMessage("copied_label"));
    });
    // Auto
    DOM["#auto-switch-input"].addEventListener("change", function () { DOM["#auto"].className = this.checked ? "display-block fade-in" : "display-none"; MDC.layout(); chrome.storage.local.set({ "autoStart": this.checked }); });
    DOM["#auto-times-input"].addEventListener("change", updateAutoETA);
    DOM["#auto-seconds-input"].addEventListener("change", updateAutoETA);
    DOM["#auto-slideshow-input"].addEventListener("change", function () { DOM["#auto-behavior-form-field"].style.visibility = this.checked ? "" : "hidden";});
  }

  /**
   * Toggles the popup between the controls and setup views.
   *
   * @private
   */
  function toggleView() {
    console.log("toggleView() - id=" + this.id);
    // If this is the first time the user is seeing the Setup screen, show them the first version run dialog
    if (items && items.firstVersionRun && (this.id === "popup" || this.id === "setup-button")) {
      items.firstVersionRun = false;
      Promisify.storageSet({"firstVersionRun": false});
      MDC.dialogs.get("version-dialog").open();
    }
    switch (this.id) {
      // First Time via init() (called via body popup id): Hide controls, show setup, don't update Setup because we are already doing it in init()
      case "popup":
        DOM["#controls"].className = "display-none";
        DOM["#setup"].className = "display-block fade-in";
        break;
      // Hide controls, show setup
      case "setup-button":
        DOM["#controls"].className = "display-none";
        DOM["#setup"].className = "display-block fade-in";
        // We need to update the setup again to make sure we have the most current instance values set in the fields. The instance may have changed
        // TODO: We are now no longer updating the setup when toggling the view, test to make sure this is OK before removing this commented out code...
        // await updateSetup(true);
        // Bug: When we start in controls and switch to setup, the drawer won't "close" (toggle) anymore because it's in a "stuck" opening state with these two classes. Removing them helps
        // TODO: setTimeout just to be safe to account for repaint from controls to setup?
        setTimeout(() => {
          const drawer = MDC.drawers.get("app-drawer");
          if (drawer.foundation_.isOpening()) {
            drawer.root_.classList.remove("mdc-drawer--opening", "mdc-drawer--animate");
          }
          MDC.layout();
        }, 1000);
        break;
      // Hide setup, show controls
      case "accept-button":
      case "cancel-button":
        // Needed to reset hover.css click effect
        updateControls();
        DOM["#setup"].className = "display-none";
        DOM["#controls"].className = "display-block fade-in";
        break;
      default:
        break;
    }
  }

  /**
   * Closes the drawer. This function is called every time the drawer menu button is pressed.
   *
   * This will then emit the MDCDrawer:closed event, allowing us to listen for the event and then reopen the drawer in
   * openDrawer().
   *
   * @private
   */
  function closeDrawer() {
    console.log("closeDrawer() - drawer.root.classList=" + MDC.drawers.get("app-drawer").root_.classList);
    const drawer = MDC.drawers.get("app-drawer");
    // Don't do this, it doesn't work well if you try clicking the drawer button very fast multiple times
    // Random Bug: Sometimes the drawer won't "close" (toggle) because it's in a stuck state with these two classes. Removing them helps
    // drawer.root_.classList.remove("mdc-drawer--closing", "mdc-drawer--opening", "mdc-drawer--animate");
    drawer.foundation_.close();
  }

  /**
   * Opens the drawer. This function is called every time we close the drawer to toggle it in a new state: expanded (regular) or collapsed.
   *
   * This is called each time the MDCDrawer:closed event is emitted.
   *
   * @param {Event} event - the click event that triggered this callback function
   * @param {boolean} itemsDrawerCollapsed - the storage items drawer collapsed state
   * @private
   */
  async function openDrawer(event, itemsDrawerCollapsed) {
    console.log("openDrawer() - event=" + event  + ", itemsDrawerCollapsed=" + itemsDrawerCollapsed + ", drawer.foundation_.isOpen()=" + MDC.drawers.get("app-drawer").foundation_.isOpen());
    // In order to reuse this function when we are initializing the drawer state, we need this initializing variable
    // We only save the toggled state in storage if we're not initializing
    // Toggle the drawer carefully:
    const drawer = MDC.drawers.get("app-drawer");
    const initializing = typeof itemsDrawerCollapsed === "boolean";
    for (let ms = 0; ms <= 1000; ms+= 100) {
      await Promisify.sleep(ms);
      if (!drawer.foundation_.isOpen()) {
        console.log("openDrawer() - isClosed! ms=" + ms);
        if (drawer.root_.classList.contains("drawer-collapsed") || (initializing && !itemsDrawerCollapsed)) {
          // Make drawer expanded (regular)
          drawer.root_.classList.remove("drawer-collapsed");
          DOM["#app-content"].classList.remove("drawer-collapsed");
          DOM["#app-content"].style.marginLeft = "200px";
          DOM["#drawer-collapsed-app-icon-div"].className = "display-none";
          if (!initializing) { Promisify.storageSet({"drawerCollapsed": false}); }
        } else {
          // Make drawer collapsed
          drawer.root_.classList.add("drawer-collapsed");
          DOM["#app-content"].classList.add("drawer-collapsed");
          DOM["#app-content"].style.marginLeft = "52px";
          DOM["#drawer-collapsed-app-icon-div"].className = "display-block fade-in";
          if (!initializing) { Promisify.storageSet({"drawerCollapsed": true}); }
        }
        drawer.foundation_.open();
        setTimeout(() => { MDC.layout(); }, 100);
        break;
      }
    }
  }

  /**
   * Called when the action (Next Link, Increment URL, Click Button, URL List) is changed.
   * Changes the Setup window so that the appropriate action controls are in view.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  function changeAction(caller) {
    console.log("changeAction() - list selectedIndex=" + MDC.lists.get("action-list").selectedIndex + ", caller=" + caller);
    // Get the selected list element and use its dataset attribute to determine the action
    const selected = MDC.lists.get("action-list").listElements.find(el => el.classList.contains("mdc-list-item--selected"));
    let action = selected?.dataset?.action || "next";
    // Handle Reverse Actions (Prev, Decrement is always just a negative interval Increment)
    if (action === "next" || action === "prev") {
      action = MDC.chips.get("prev-chip").selected ? "prev" : "next";
    }
    _.action = action;
    DOM["#next-prev"].className = action === "next" || action === "prev" ? "display-block" : "display-none";
    DOM["#increment"].className = action === "increment" || action === "decrement" ? "display-block" : "display-none";
    DOM["#click"].className = action === "click" ? "display-block" : "display-none";
    DOM["#list"].className = action === "list" ? "display-block" : "display-none";
    if (action === "next" || action === "prev") {
      DOM["#next"].className = action === "next" ? "display-block" : "display-none";
      DOM["#prev"].className = action === "prev" ? "display-block" : "display-none";
      DOM["#next-prev-link-label"].textContent = chrome.i18n.getMessage(action + "_link_label");
      if (!checks.checkNextPrev) {
        checkNextPrev(action, false, false, true, "changeAction()");
      }
    } else if (action === "increment" || action === "decrement") {
      DOM["#url-textarea"].setSelectionRange(instance.selectionStart, instance.selectionStart + instance.selection.length);
      DOM["#url-textarea"].focus();
    } else if (!checks.checkButton && action === "click") {
      checkButton(false, false,"changeAction()");
    }
    changeAppend();
    MDC.layout();
  }

  /**
   * Called when the append mode (Page, Iframe, Element, Media, None) is changed.
   * Changes the Setup window so that the appropriate append mode controls are in view.
   *
   * @private
   */
  async function changeAppend() {
    console.log("changeAppend() - list selectedIndex=" + MDC.lists.get("append-list").selectedIndex);
    // Get the selected list element and use its dataset attribute to determine the append
    const selected = MDC.lists.get("append-list").listElements.find(el => el.classList.contains("mdc-list-item--selected"));
    const append = selected?.dataset?.append || "page";
    _.append = append;
    DOM["#page"].className = append === "page" ? "display-block" : "display-none";
    DOM["#iframe"].className = append === "iframe" ? "display-block" : "display-none";
    DOM["#element"].className = append === "element" || append === "ajax" ? "display-block" : "display-none";
    DOM["#media"].className = append === "media" ? "display-block" : "display-none";
    DOM["#none"].className = append === "none" ? "display-block" : "display-none";
    DOM["#ajax"].className = append === "ajax" ? "display-block" : "display-none";
    // Element/AJAX Shared Styling:
    DOM["#ajax-header"].style.display = append === "ajax" ? "" : "none";
    DOM["#element"].dataset.type = append;
    DOM["#element-header"].style.display = append === "element" ? "" : "none";
    DOM["#insert-before-path-text-field"].style.display = append === "element" ? "" : "none"
    DOM["#page-element-iframe"].style.display = append === "element" ? "" : "none";
    if (!checks.checkPageElement && (_.append === "element" || _.append === "ajax")) {
      // If there is no page element path already, auto detect it for the user
      let autoDetectDetails = "";
      if (!DOM["#page-element-path-textarea"].value) {
        const result = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "autoDetectPageElement", instance: _, algorithm: items.pathAlgorithm, quote: items.pathQuote, optimized: items.pathOptimized, highlight: false });
        DOM["#page-element-path-textarea"].value = result.path;
        autoDetectDetails = result.details;
        MDC.layout();
      }
      checkPageElement(false, false, autoDetectDetails, "changeAppend()");
    }
    MDC.layout();
  }

  /**
   * Performs the action based on the button if the requirements are met (e.g. the instance is enabled).
   * Note: After performing the action, the content script sends a message back to popup with the updated instance
   * because it knows that the popup is the caller.
   *
   * @private
   */
  function clickActionButton() {
    const action = this.dataset.action;
    if (((action === "down" || action === "up") && (instance.enabled)) ||
         (action === "auto" && instance.autoEnabled) ||
         (action === "blacklist" && instance.databaseFound && !instance.autoEnabled) ||
         (action === "whitelist" && instance.databaseFound && !instance.autoEnabled) ||
         (action === "power")) {
      UI.clickHoverCss(this, "hvr-push-click");
      // Extra justification: Ensure we always go down or up one page from the current page, regardless of location and where the pages are (e.g. think of higher numbered pages that may for some reason be located at the top)
      // One drawback to this though is that if the user is scrolling the page with the Popup open, the page being moved to won't be the one below or above in terms of location, but rather the Popup's currentPage number
      const extra = action === "down" ? { page: instance.currentPage + 1 } : action === "up" ? { page: instance.currentPage - 1 } : {};
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "executeWorkflow", action: action, caller: "popupClickActionButton", extra: extra});
      // Note: We no longer need to manually adjust the storage items (e.g. items.on = false) or instance anymore as we get a message back from Workflow.execute() telling us to update the instance and storage items
    }
  }

  /**
   * Updates the control icons and buttons based on whether the instance is enabled.
   * Note: update display via styles, not classNames, to avoid issues with hvr-push-click being cleared too fast after a
   * click.
   *
   * @private
   */
  function updateControls() {
    // Sometimes the totalPages will be 0 if the instance is a save/database but hasn't yet been enabled and the first page hasn't been added to the pages array (i.e. length 0)
    DOM["#page-number"].textContent = instance.currentPage + " / " + (instance.totalPages || 1);
    DOM["#save-icon"].style.display = instance.saveFound ? "" : "none";
    DOM["#save-icon-title"].textContent = instance.saveFound ? chrome.i18n.getMessage("save_icon_title") + " [" + instance.saveID + "] " + instance.saveURL : "";
    DOM["#database-blacklist-icon"].style.display = !instance.saveFound && instance.databaseFound && instance.databaseBlacklisted ? "" : "none";
    DOM["#database-blacklist-icon-title"].textContent = instance.databaseBlacklisted ? chrome.i18n.getMessage("database_blacklist_icon_title") + " " + instance.databaseBlacklistWhitelistURL : "";
    DOM["#database-whitelist-icon"].style.display = !instance.saveFound && instance.databaseFound && instance.databaseWhitelisted ? "" : "none";
    DOM["#database-whitelist-icon-title"].textContent = instance.databaseWhitelisted ? chrome.i18n.getMessage("database_whitelist_icon_title") + " " + instance.databaseBlacklistWhitelistURL : "";
    DOM["#database-icon"].style.display = !instance.saveFound && instance.databaseFound ? "" : "none";
    DOM["#database-icon-title"].textContent = instance.databaseFound ?
      chrome.i18n.getMessage("database_" + (instance.databaseISFound ? "is_" : "ap_") + "icon_title") +
      " " + instance.databaseURL +
      " " + (instance.databaseUpdatedAt ? chrome.i18n.getMessage("database_updated_icon_title").replace("?", instance.databaseUpdatedAt) : "") : "";
    DOM["#auto-slideshow-icon"].style.display = instance.autoEnabled && instance.autoSlideshow ? "" : "none";
    DOM["#shuffle-icon"].style.display = instance.enabled && instance.shuffleEnabled ? "" : "none";
    DOM["#down-button"].style.display = "";
    DOM["#up-button"].style.display = "";
    DOM["#down-button"].style.opacity = DOM["#up-button"].style.opacity = instance.enabled ? 1 : 0.2;
    // Power Button
    DOM["#power-button"].style.fill = window.getComputedStyle(document.documentElement).getPropertyValue(items.on ? "--error-color" : "--mdc-theme-primary");
    DOM["#power-button-title"].textContent = chrome.i18n.getMessage("power_" + (items.on ? "off" : "on") + "_button_title");
    // Blacklist/Whitelist Buttons: Note that we don't show these buttons when Auto is enabled
    DOM["#blacklist-button"].style.display = !instance.saveFound && instance.databaseFound && items.databaseMode === "blacklist" && !instance.autoEnabled ? "" : "none";
    DOM["#blacklist-button"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#" + (instance.databaseBlacklisted ? "circle-check" : "ban"));
    DOM["#blacklist-button-title"].textContent = chrome.i18n.getMessage((instance.databaseBlacklisted ? "un_" : "") + "blacklist_button_title") + " " + instance.databaseBlacklistWhitelistURL;
    DOM["#whitelist-button"].style.display = !instance.saveFound && instance.databaseFound && items.databaseMode === "whitelist" && !instance.autoEnabled ? "" : "none";
    DOM["#whitelist-button"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#" + (instance.databaseWhitelisted ? "ban" : "circle-check"));
    DOM["#whitelist-button-title"].textContent = chrome.i18n.getMessage((instance.databaseWhitelisted ? "un_" : "") + "whitelist_button_title") + " " + instance.databaseBlacklistWhitelistURL;
    // Auto Button toggles between play and pause icons
    DOM["#auto-button"].style.display = instance.autoEnabled ? "" : "none";
    DOM["#auto-button"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#" + (instance.autoPaused ? "circle-play" : "circle-pause"));
    DOM["#auto-button-title"].textContent = chrome.i18n.getMessage("auto_" + (instance.autoPaused ? "resume" : "pause") + "_button_title");
  }

  /**
   * Updates the setup input values. This function is called when the popup is first loaded or when the instance is
   * updated.
   *
   * @param {boolean} all - if true, updates all the setup inputs, and if false, updates only the necessary ones
   * @private
   */
  async function updateSetup(all = false) {
    console.log("updateSetup() - all=" + all);
    // Save Setup
    if (all) {
      DOM["#save-input"].checked = instance.saveFound;
      DOM["#save-button-icon"].children[0].setAttribute("href", "../lib/fontawesome/" + (instance.saveFound ? "solid" : "regular") + ".svg#heart");
      DOM["#save-name-textarea"].value = instance.saveName;
      DOM["#save-url-textarea"].value = instance.saveURL;
      DOM["#save-type-pattern"].checked = instance.saveType === "pattern";
      DOM["#save-type-regex"].checked = instance.saveType === "regex";
      DOM["#save-type-exact"].checked = instance.saveType === "exact";
    }
    // Type Setup
    if (all) {
      // for (let type of ["nextLinkType", "prevLinkType", "buttonType", "pageElementType"]) {
      for (const type of ["next-link", "prev-link", "button", "page-element"]) {
        DOM["#" + type + "-type-label"].dataset.mode = instance[(type === "next-link" ? "nextLink" : type === "prev-link" ? "prevLink" : type === "page-element" ? "pageElement" : type) + "TypeMode"];
        changeType(undefined, DOM["#" + type + "-type-label"]);
      }
    }
    // Next Prev Setup
    if (all || instance.action === "next") {
      DOM["#next-link-path-textarea"].value = instance.nextLinkPath;
      DOM["#next-link-property-textarea"].value = instance.nextLinkProperty ? instance.nextLinkProperty.join(".") : "";
      DOM["#next-link-keywords-enabled-input"].checked = instance.nextLinkKeywordsEnabled;
    }
    if (all || instance.action === "prev") {
      DOM["#prev-link-path-textarea"].value = instance.prevLinkPath;
      DOM["#prev-link-property-textarea"].value = instance.prevLinkProperty ? instance.prevLinkProperty.join(".") : "";
      DOM["#prev-link-keywords-enabled-input"].checked = instance.prevLinkKeywordsEnabled;
    }
    // Increment Setup
    if (all || instance.action === "increment" || instance.action === "decrement") {
      DOM["#url-textarea"].value = instance.url;
      // TODO: Investigate why we needed to set focus for the url textarea here as we are doing it already in changeAction()
      // DOM["#url-textarea"].setSelectionRange(instance.selectionStart, instance.selectionStart + instance.selection.length);
      // DOM["#url-textarea"].focus();
      DOM["#selection-input"].value = instance.selection;
      DOM["#selection-start-input"].value = instance.selectionStart;
    }
    // Button Setup
    if (all || instance.action === "click") {
      DOM["#button-path-textarea"].value = instance.buttonPath;
      DOM["#button-position"].className = instance.buttonDetection === "manual" ? "display-block" : "visibility-hidden";
      DOM["#button-position-input"].value = typeof instance.buttonPosition !== "undefined" ? instance.buttonPosition : items.buttonPosition;
      DOM["#mirror-page-input"].checked = instance.mirrorPage;
    }
    // List Setup
    if (all || instance.action === "list") {
      DOM["#list-domain"].textContent = instance.locationOrigin;
      DOM["#list-textarea"].value = instance.list && Array.isArray(instance.list) ? instance.list.join("\n") : "";
      DOM["#list-options-input"].checked = instance.action === "list" && instance.listOptions;
      DOM["#list-error-skip-input"].value = instance.errorSkip;
      DOM["#list-shuffle-enabled-input"].checked = instance.action === "list" && instance.shuffleURLs;
    }
    // Append Setup (Page, Iframe, Media)
    if (all) {
      DOM["#iframe-page-one-input"].checked = instance.iframePageOne;
      DOM["#iframe-resize-input"].checked = instance.iframeResize;
    }
    // Append Element
    if (all || instance.append === "element" || instance.append === "ajax") {
      DOM["#page-element-path-textarea"].value = instance.pageElementPath;
      DOM["#insert-before-path-textarea"].value = instance.insertBeforePath;
      DOM["#page-element-iframe-input"].checked = !!instance.pageElementIframe;
      DOM["#page-element-iframe-mode"].className = !!instance.pageElementIframe ? "chip-set chip-set-absolute" : "display-none";
    }
    // Append AJAX
    if (all || instance.append === "ajax") {
      DOM["#ajax-iframe"].className = instance.ajaxMode === "iframe" ? "display-inline-block" : "display-none";
      DOM["#load-element-path-textarea"].value = instance.loadElementPath;
      DOM["#ajax-native"].className = instance.ajaxMode === "native" ? "display-inline-block" : "display-none";
      DOM["#remove-element-path-textarea"].value = instance.removeElementPath;
    }
    // Scripts Setup
    if (all) {
      DOM["#lazy-load-input"].checked = !!instance.lazyLoad;
      DOM["#lazy-load-settings"].className = !!instance.lazyLoad ? "display-inline" : "display-none";
      DOM["#lazy-load-mode-auto"].checked = instance.lazyLoad !== "manual";
      DOM["#lazy-load-mode-manual"].checked = instance.lazyLoad === "manual";
      DOM["#lazy-load-attribute"].className = instance.lazyLoad === "manual" ? "display-block" : "display-none";
      DOM["#lazy-load-source-input"].value = instance.lazyLoadSource;
      DOM["#lazy-load-destination-input"].value = instance.lazyLoadDestination;
      DOM["#mirror-page-input"].checked = !!instance.mirrorPage;
      DOM["#mirror-page-settings"].className = !!instance.mirrorPage ? "display-inline" : "display-none";
      DOM["#mirror-page-mode-import"].checked = instance.mirrorPage !== "adopt";
      DOM["#mirror-page-mode-puppet"].checked = instance.mirrorPage === "puppet";
      DOM["#puppet"].className = instance.mirrorPage === "puppet" ? "display-block" : "display-none";
      DOM["#puppet-textarea"].value = instance.puppet ? instance.puppet.split(";\n").join(";\n") : "";
      DOM["#spa-input"].checked = !!instance.spa;
    }
    // Convert number base to string just in case (can't set number as value, e.g. 10 instead of "10")
    if (all) {
      MDC.selects.get("base-select").value = instance.base + "";
      DOM["#interval-input"].value = instance.interval;
      DOM["#error-skip-input"].value = instance.errorSkip;
      DOM["#base-case"].className = typeof instance.base === "number" && instance.base > 10 ? "display-block fade-in" : "display-none";
      DOM["#base-date"].className = instance.base === "date" ? "display-block fade-in" : "display-none";
      DOM["#base-date-format-input"].value = instance.baseDateFormat;
      DOM["#base-roman"].className = instance.base === "roman" ? "display-block fade-in" : "display-none";
      DOM["#base-custom"].className = instance.base === "custom" ? "display-block fade-in" : "display-none";
      DOM["#base-custom-input"].value = instance.baseCustom;
      DOM["#leading-zeros-input"].checked = instance.leadingZeros;
      DOM["#multi-count"].value = instance.multiEnabled ? instance.multiCount : 0;
      DOM["#multi-button-1"].className.baseVal = instance.multiEnabled && instance.multiCount >= 1 ? "" : "disabled";
      DOM["#multi-button-2"].className.baseVal = instance.multiEnabled && instance.multiCount >= 2 ? "" : "disabled";
      DOM["#multi-button-3"].className.baseVal = instance.multiEnabled && instance.multiCount >= 3 ? "" : "disabled";
      DOM["#shuffle-enabled-input"].checked = instance.shuffleEnabled;
      DOM["#shuffle-button-icon"].className.baseVal = instance.shuffleEnabled ? "" : "disabled";
      DOM["#shuffle-urls-input"].value = instance.shuffleURLs;
    }
    // Auto Setup:
    MDC.switches.get("auto-switch").checked = instance.autoEnabled || (items.autoStart && !instance.enabled);
    DOM["#auto"].className = instance.autoEnabled || (items.autoStart && !instance.enabled) ? "display-block" : "display-none";
    DOM["#auto-behavior-form-field"].style.visibility = instance.autoSlideshow ? "" : "hidden";
    // TODO: Use instance.autoTimesOriginal instead? Sometimes getting undefined value here...
    DOM["#auto-badge-input"].checked = instance.autoBadge === "times";
    DOM["#auto-slideshow-input"].checked = instance.autoSlideshow;
    DOM["#auto-behavior-input"].checked = instance.autoBehavior === "smooth";
    DOM["#auto-times-input"].value = instance.autoTimes;
    DOM["#auto-seconds-input"].value = instance.autoSeconds;
    updateAutoETA();
  }

  /**
   * Handle the URL selection on select events. Stores the selectionStart
   * in a hidden input and updates the selection input to the selected text and
   * checks the leading zeros checkbox based on leading zeros present.
   *
   * @private
   */
  function selectURL() {
    // Firefox: window.getSelection().toString(); does not work in FF
    DOM["#selection-input"].value = DOM["#url-textarea"].value.substring(DOM["#url-textarea"].selectionStart, DOM["#url-textarea"].selectionEnd);
    DOM["#selection-start-input"].value = DOM["#url-textarea"].selectionStart;
    if (items.leadingZerosPadByDetection) {
      DOM["#leading-zeros-input"].checked = DOM["#selection-input"].value.charAt(0) === '0' && DOM["#selection-input"].value.length > 1;
    }
    MDC.layout();
  }

  /**
   * Handles the click multi button event, performing validation on the selection and then saving the multi instance.
   *
   * @private
   */
  async function clickMulti() {
    setupInputs("multi");
    const errors = await setupErrors("multi");
    if (_.multiCount >= 3) {
      DOM["#multi-count"].value = 0;
      // Note use className.baseVal instead of className when toggling svg classes
      DOM["#multi-button-1"].className.baseVal = DOM["#multi-button-2"].className.baseVal = DOM["#multi-button-3"].className.baseVal = "disabled";
    } else if (errors && errors.length > 0) {
      UI.generateAlert(errors, true);
    } else {
      const multiCountNew = _.multiCount + 1;
      DOM["#multi-count"].value = multiCountNew;
      DOM["#multi-button-" + multiCountNew].className.baseVal = "";
      DOM["#multi-button-" + multiCountNew].classList.remove("disabled");
      _.multi[multiCountNew].selection = _.selection;
      _.multi[multiCountNew].startingSelection = _.selection;
      // If multiRange, selectionStart is -1 from starting [
      _.multi[multiCountNew].selectionStart = _.multiRange ? _.selectionStart - 1 : _.selectionStart;
      _.multi[multiCountNew].startingSelectionStart = _.multi[multiCountNew].selectionStart;
      _.multi[multiCountNew].interval = _.interval;
      _.multi[multiCountNew].base = _.base;
      _.multi[multiCountNew].baseCase = _.baseCase;
      _.multi[multiCountNew].baseDateFormat = _.baseDateFormat;
      _.multi[multiCountNew].baseRoman = _.baseRoman;
      _.multi[multiCountNew].baseCustom = _.baseCustom;
      _.multi[multiCountNew].leadingZeros = _.leadingZeros;
      _.multi[multiCountNew].times = _.multiTimes;
      _.multi[multiCountNew].range = _.multiRange;
    }
  }

  /**
   * Called if the user modifies the Save URL inputs, like changing the save URL or save type.
   * The Popup will ask the content script to re-check the saved URL to make sure it matches the instance's URL.
   *
   * @param {boolean} delay - whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension calls this explicitly
   * @param {string} caller - the caller who called this function
   * @private
   */
  function checkSave(delay, caller) {
    console.log("checkSave() - delay=" + delay + ", caller=" + caller);
    checks.checkSave = true;
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("save-test-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.checkSave);
    timeouts.checkSave = setTimeout(function () {
      clearTimeout(timeouts.checkSave2);
      DOM["#save-test-result-loading"].style.display = "block";
      DOM["#save-test-result-success"].style.display = "none";
      DOM["#save-test-result-error"].style.display = "none";
      timeouts.checkSave2 = setTimeout(async function () {
        // Instead of just passing in url and type, we need to clone and pass in the _ object to test that matchesExact works when the action is increment or decrement (e.g. to include properties like selectionStart, selectionEnd)
        const save = Util.clone(_);
        save.url = DOM["#save-url-textarea"].value;
        save.type = DOM["#save-type-pattern"].checked ? DOM["#save-type-pattern"].value : DOM["#save-type-regex"].checked ? DOM["#save-type-regex"].value : DOM["#save-type-exact"].checked ? DOM["#save-type-exact"].value : "";
        console.log("checkSave() - sending message to check: url=" + instance.url + ", save=" + JSON.stringify(save));
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkSave", url: instance.url, save: save});
        console.log("checkSave() - response received from check:");
        console.log(response);
        // We need to make an exception for the Increment URL action + Exact Save type because of how complex the rules are. It will automatically always work anyway, since the Save URL isn't used in that scenario
        const success = (response && response.matches) || ((_.action === "increment" || _.action === "decrement") && save.type === "exact");
        DOM["#save-test-result-loading"].style.display = "none";
        DOM["#save-test-result-success"].style.display = success ? "block" : "none";
        DOM["#save-test-result-error"].style.display = success ? "none" : "block";
        if (success) {
           DOM["#save-test-result-message-success"].setAttribute("aria-label", instance.url);
        } else {
          DOM["#save-test-result-message-error"].setAttribute("aria-label", instance.url);
        }
        MDC.linearProgresses.get("save-test-linear-progress").foundation_.setDeterminate(true);
        // MDC.layout();
      }, delay ? 500 : 0);
    }, delay ? 1000 : 0);
  }

  /**
   * Called if the user modifies the next or prev inputs, like changing the selector/xpath to find the next link.
   * The Popup will ask the content script to re-check the page to find the next or prev link using the new inputs.
   *
   * @param {string} action - the specific action ("next" or "prev")
   * @param {boolean} delay - whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension calls this explicitly
   * @param {boolean} highlight - whether to highlight the element (true) or not (false)
   * @param {boolean} focus - whether to focus on the next/prev url textarea (true) or not (false)
   * @param {string} caller - the caller who called this function
   * @private
   */
  function checkNextPrev(action, delay, highlight, focus, caller) {
    console.log("checkNextPrev() - action=" + action + ", delay=" + delay + ", highlight=" + highlight + ", focus=" + focus + ", caller=" + caller);
    checks.checkNextPrev = true;
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("next-prev-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.checkNextPrev);
    timeouts.checkNextPrev = setTimeout(function () {
      clearTimeout(timeouts.checkNextPrev2);
      DOM["#next-prev-result-loading"].style.display = "block";
      DOM["#next-prev-result-success"].style.display = "none";
      DOM["#next-prev-result-error"].style.display = "none";
      timeouts.checkNextPrev2 = setTimeout(async function () {
        const path = DOM["#" + action + "-link-path-textarea"].value;
        const typeMode = DOM ["#" + action + "-link-type-label"].dataset.mode;
        const type = ["selector", "xpath", "js"].includes(typeMode) ? typeMode :  await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "determinePathType", path: path, type: _[action + "LinkType"] });
        const property = DOM["#" + action + "-link-property-textarea"].value ? DOM["#" + action + "-link-property-textarea"].value.split(".").filter(Boolean) : [];
        // If the keywordsEnabled hasn't been decided yet (it's undefined), we will not use the checkbox value and instead pass in undefined to NextPrev so it tries to use the keywords
        const keywordsEnabled = _[action + "LinkKeywordsEnabled"] === undefined ? undefined : DOM["#" + action + "-link-keywords-enabled-input"].checked;
        const keywords = items[action + "LinkKeywords"];
        const keywordObject = _[action + "LinkKeyword"];
        console.log("checkNextPrev() - sending message to check: type=" + type + ", path=" + path + ", property=" + property + ", keywordsEnabled=" + keywordsEnabled);
        await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkNextPrev", path: path, type: type, property: property, keywordsEnabled: keywordsEnabled, keywords: keywords, keywordObject: keywordObject, highlight: highlight});
        console.log("checkNextPrev() - response received from check:");
        console.log(response);
        const success = response && response.url && !response.duplicate;
        // This is the only opportunity to store the new type if the path changes
        _[action + "LinkType"] = type;
        _[action + "LinkTypeMode"] = typeMode;
        DOM["#" + action + "-link-type-label"].textContent = chrome.i18n.getMessage(type + "_abbreviated_label");
        // If the keywordsEnabled hasn't been decided yet (it's undefined), we will manually decide it after getting the response from NextPrev and set it for the temporary instance  _
        if (_[action + "LinkKeywordsEnabled"] === undefined) {
          _[action + "LinkKeywordsEnabled"] = DOM["#" + action + "-link-keywords-enabled-input"].checked = (response.method === "keyword" || response.method === "keyword-alternate");
        }
        DOM["#next-prev-result-loading"].style.display = "none";
        DOM["#next-prev-result-success"].style.display = success ? "block" : "none";
        DOM["#next-prev-result-error"].style.display = success ? "none" : "block";
        const details = chrome.i18n.getMessage(action + "_link_path_label");
        if (success) {
          DOM["#next-prev-result-message-success"].textContent = chrome.i18n.getMessage("next_prev_result_message_success").replace("?", chrome.i18n.getMessage(action + "_link_label"));
          if (["selector", "xpath", "js", "shadow", "iframe"].includes(response.method)) {
            DOM["#next-prev-result-details-success"].textContent = details;
            // Some paths can be very lengthy, and if they're too long the balloon tooltip will cause a vertical scrollbar to appear. An alternative is to set break-word: break-all in the CSS
            // DOM["#next-prev-result-details-success"].setAttribute("aria-label", ("(" + chrome.i18n.getMessage(type + "_label") + ") " + response.path).substring(0, 500));
            DOM["#next-prev-result-details-success"].setAttribute("aria-label", response.path.substring(0, 500));
          } else if (["keyword", "keyword-alternate"].includes(response.method)) {
            // keywordObject Array: 0=relationship, 1=type, 2=subtype, 3=keyword
            const ko = response.keywordObject.split(" ");
            DOM["#next-prev-result-details-success"].textContent = chrome.i18n.getMessage(response.method.replace("-", "_") + "_label") + " " + ko[3];
            DOM["#next-prev-result-details-success"].setAttribute("aria-label", response.element + " " + (ko[0] !== "self" ? ko[0] + " " : "") + (response.property || ko[1]) + " " + ko[2] + " " + ko[3]);
            _[action + "LinkKeyword"] = response.keywordObject;
          }
          DOM["#next-prev-link-textarea"].value = response.url;
        } else {
          DOM["#next-prev-result-message-error"].textContent = chrome.i18n.getMessage("next_prev_result_message_" + (response.duplicate ? "duplicate" : "error")).replace("?", chrome.i18n.getMessage(action + "_link_label"));
          DOM["#next-prev-result-details-error"].textContent = details;
          // DOM["#next-prev-result-details-error"].setAttribute("aria-label", response && response.error ? response.error : "(" + chrome.i18n.getMessage(type + "_label") + ") " + chrome.i18n.getMessage("no_result_tooltip_error"));
          DOM["#next-prev-result-details-error"].setAttribute("aria-label", response?.error ? ((typeMode === "js" ? chrome.i18n.getMessage("jspath_result_tooltip_error") : "") + response.error).substring(0, 500) : response?.duplicate ? chrome.i18n.getMessage("duplicate_result_tooltip_error") : chrome.i18n.getMessage("no_result_tooltip_error"));
          DOM["#next-prev-link-textarea"].value = response.url || "";
        }
        MDC.linearProgresses.get("next-prev-linear-progress").foundation_.setDeterminate(true);
        MDC.layout();
        if (focus && success) {
          DOM["#next-prev-link-textarea"].focus();
        }
      }, delay ? 1000 : 0);
    }, delay ? 1000 : 0);
  }

  /**
   * Called if the user modifies the Click Button action inputs, like changing the selector or xpath to find the button.
   * The Popup will ask the content script to re-check the page to find the button using the new inputs.
   *
   * @param {boolean} delay - whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension calls this explicitly
   * @param {boolean} highlight - whether to highlight the element (true) or not (false)
   * @param {string} caller - the caller who called this function
   * @private
   */
  function checkButton(delay, highlight, caller) {
    console.log("checkButton() - delay=" + delay + ", highlight=" + highlight + ", caller=" + caller);
    checks.checkButton = true;
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("button-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.checkButton);
    timeouts.checkButton = setTimeout(function () {
      clearTimeout(timeouts.checkButton2);
      DOM["#button-result-loading"].style.display = "block";
      DOM["#button-result-success"].style.display = "none";
      DOM["#button-result-error"].style.display = "none";
      timeouts.checkButton2 = setTimeout(async function () {
        const buttonPath = DOM["#button-path-textarea"].value;
        const typeMode = DOM ["#button-type-label"].dataset.mode;
        const buttonType = ["selector", "xpath", "js"].includes(typeMode) ? typeMode : await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "determinePathType", path: buttonPath, type: _.buttonType });
        console.log("checkButton() - sending message to check: buttonType=" + buttonType + ", buttonPath=" + buttonPath);
        await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
        const response = await Promisify.tabsSendMessage(tabs[0].id, {caller: "popup", receiver: "contentscript", greeting: "checkButton", buttonType: buttonType, buttonPath: buttonPath, highlight: highlight});
        console.log("checkButton() - response received from check:");
        console.log(response);
        const success = response && response.found && response.clickable;
        // This is the only opportunity to store the new type if the path changes
        _.buttonType = buttonType;
        _.buttonTypeMode = typeMode;
        DOM["#button-type-label"].textContent = chrome.i18n.getMessage(buttonType + "_abbreviated_label");
        DOM["#button-result-loading"].style.display = "none";
        DOM["#button-result-success"].style.display = success ? "block" : "none";
        DOM["#button-result-error"].style.display = success ? "none" : "block";
        const details = chrome.i18n.getMessage("button_path_label");
        // + " (" + chrome.i18n.getMessage(buttonType + "_label") + ")";
        if (success) {
          DOM["#button-result-details-success"].textContent = details;
          DOM["#button-result-details-success"].setAttribute("aria-label", chrome.i18n.getMessage("button_result_tooltip_success").replace("?", response.buttonNode));
        } else {
          DOM["#button-result-details-error"].textContent = details;
          DOM["#button-result-details-error"].setAttribute("aria-label", response?.error ? (typeMode === "js" ? chrome.i18n.getMessage("jspath_result_tooltip_error") : "") + response.error : response?.found && !response?.clickable ? chrome.i18n.getMessage("button_result_tooltip_error_clickable") : chrome.i18n.getMessage("no_result_tooltip_error"));
        }
        MDC.linearProgresses.get("button-linear-progress").foundation_.setDeterminate(true);
        MDC.layout();
      }, delay ? 1000 : 0);
    }, delay ? 1000 : 0);
  }

  /**
   * Called if the user modifies the Append Element inputs, like changing the selector/xpath to find the page element.
   * The Popup will ask the content script to re-check the page to find the elements using the new inputs.
   *
   * @param {boolean} delay - whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension calls this explicitly
   * @param {boolean} highlight - whether to highlight the element (true) or not (false)
   * @param {string} autoDetect - the auto detect result details if called by Auto Detect Page Element (an empty string otherwise)
   * @param {string} caller - the caller who called this function
   * @private
   */
  function checkPageElement(delay = false, highlight = false, autoDetect = false, caller) {
    console.log("checkPageElement() - delay=" + delay + ", highlight=" + highlight + ", autoDetect=" + autoDetect + ", caller=" + caller);
    checks.checkPageElement = true;
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("page-element-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.pageElement);
    timeouts.pageElement = setTimeout(function () {
      clearTimeout(timeouts.pageElement2);
      DOM["#page-element-result-loading"].style.display = "block";
      DOM["#page-element-result-success-error"].style.display = "none";
      timeouts.pageElement2 = setTimeout(async function () {
        const pageElementPath = DOM["#page-element-path-textarea"].value;
        const insertBeforePath = DOM["#insert-before-path-textarea"].value;
        const typeMode = DOM ["#page-element-type-label"].dataset.mode;
        const pageElementType = ["selector", "xpath", "js"].includes(typeMode) ? typeMode : await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "determinePathType", path: pageElementPath, type: _.pageElementType });
        console.log("checkPageElement() - sending message to check: pageElementType=" + pageElementType + ", pageElementPath=" + pageElementPath + ", insertBeforePath="+ insertBeforePath);
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkPageElement", pageElementType: pageElementType, pageElementPath: pageElementPath, insertBeforePath: insertBeforePath, highlight: highlight, autoDetected: autoDetect});
        console.log("checkPageElement() - response received from check:");
        console.log(response);
        const success = response && response.found;
        // This is the only opportunity to store the new type if the path changes
        _.pageElementType = pageElementType;
        _.pageElementTypeMode = typeMode;
        DOM["#page-element-type-label"].textContent = chrome.i18n.getMessage(pageElementType + "_abbreviated_label");
        // We are currently using the same type as the page element type for these inputs
        DOM["#load-element-type-label"].textContent = chrome.i18n.getMessage(pageElementType + "_abbreviated_label");
        DOM["#remove-element-type-label"].textContent = chrome.i18n.getMessage(pageElementType + "_abbreviated_label");
        DOM["#page-element-result-loading"].style.display = "none";
        DOM["#page-element-result-success-error"].style.display = "block";
        DOM["#page-element-result-success"].style.display = success ? "inline-block" : "none";
        DOM["#page-element-result-error"].style.display = success ? "none" : "inline-block";
        const details = chrome.i18n.getMessage("page_element_path_label");
        if (success) {
          DOM["#page-element-result-message-success"].textContent = chrome.i18n.getMessage("page_element_result_message_" + (autoDetect ? "autodetect" : "success")).replace("?", response.elementsLength);
          DOM["#page-element-result-details-success"].textContent = details;
          DOM["#page-element-result-details-success"].setAttribute("aria-label", chrome.i18n.getMessage("page_element_result_tooltip_success").replace("?1", response.parentNode).replace("?2", response.insertDetails) + (autoDetect || ""));
        } else {
          DOM["#page-element-result-details-error"].textContent = details;
          DOM["#page-element-result-details-error"].setAttribute("aria-label", response?.error ? (typeMode === "js" ? chrome.i18n.getMessage("jspath_result_tooltip_error") : "") + response.error : chrome.i18n.getMessage("no_result_tooltip_error"));
        }
        MDC.linearProgresses.get("page-element-linear-progress").foundation_.setDeterminate(true);
        MDC.layout();
      }, delay ? 500 : 0);
    }, delay ? 500 : 0);
  }

  /**
   * This function executes when the user clicks the element picker button.
   *
   * @param {Event} event - the click event that triggered this callback function
   * @private
   */
  async function clickElementPicker(event) {
    // Note: We need to cache the event.currentTarget now before we start awaiting the code below. We will lose it if we don't
    // Why we use event.currentTarget over event.target
    // https://stackoverflow.com/questions/10086427/what-is-the-exact-difference-between-currenttarget-property-and-target-property
    const id = event.currentTarget.id;
    // Example format of the id is "element-picker-next-button" and we want to extract the "next":
    const picker = id.replaceAll("element-picker-", "").replaceAll("-button", "");
    console.log("clickElementPicker() - tabs[0].id=" + tabs[0].id + ", event.currentTarget.id=" + id + ", picker=" + picker);
    _.picker = picker;
    // Calling setupInputs is somewhat risky, but it lets us be sure that all inputs are saved when they return back to the Popup...
    setupInputs("accept");
    // Before we send off the temporary instance, we need to make sure we store the current keywordsEnabled state.
    // If we don't do this, when they return to the popup, the keywords wont be enabled anymore
    // Note: We have to always do this, not just when it's the action next or prev
    _.nextLinkKeywordsEnabled = DOM["#next-link-keywords-enabled-input"].checked;
    _.prevLinkKeywordsEnabled = DOM["#prev-link-keywords-enabled-input"].checked;
    // Execute scripts to get the Picker ready to be opened:
    // Already including dompath.js in the content script so we don't need this in Infy Scroll:
    // await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/dompath/dompath.js", runAt: "document_end"});
    await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
    await Promisify.tabsExecuteScript(tabs[0].id, {file: "/js/picker.js", runAt: "document_end"});
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "setInstance", instance: _ });
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "openPicker" });
    // We automatically close the Popup to enter the Picker mode
    window.close();
  }

  /**
   * This function executes when the user clicks the path type labels, or is called manually in setupInput().
   *
   * @param {Event} event - the click event that triggered this callback function
   * @param {Element} el - the type label element if calling this function manually
   * @private
   */
  function changeType(event, el) {
    const element = el || event.currentTarget;
    const types = ["auto", "selector", "xpath", "js"];
    const index = types.indexOf(element.dataset.mode);
    // If calling this manually, we don't want to toggle the mode
    const mode = el ? element.dataset.mode : (index + 1 < types.length) ? types[index + 1] : types[0];
    element.dataset.mode = mode;
    element.style.color = mode === "auto" ? "var(--mdc-theme-primary)" : "var(--mdc-theme-alert)";
    element.setAttribute("aria-label", chrome.i18n.getMessage("change_type_" + (mode === "auto" ? "auto" : "fixed") + "_label").replace("?", mode === "auto" ? "" : chrome.i18n.getMessage(mode + "_label")));
    if (["selector", "xpath", "js"].includes(mode)) {
      element.textContent = chrome.i18n.getMessage(mode + "_abbreviated_label");
    }
    // If not calling this manually, need to check the path again based on the new mode type
    if (!el) {
      switch (element.id) {
        case "next-link-type-label": case "prev-link-type-label": checkNextPrev(element.dataset.action, false, false, false, "changeType"); break;
        case "button-type-label": checkButton(false, false, "changeType"); break;
        case "page-element-type-label": checkPageElement(false, false, "", "changeType"); break;
      }
    }
  }

    /**
   * This function executes when the user clicks the auto detect page element button.
   *
   * @param {Event} event - the click event that triggered this callback function
   * @private
   */
  async function clickAutoDetectPageElement(event) {
    await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
    // Note: The reason why we're passing the Popup's items path properties is because Scroll's items may be out of date
    const result = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "autoDetectPageElement", instance: _, algorithm: items.pathAlgorithm, quote: items.pathQuote, optimized: items.pathOptimized, highlight: true });
    DOM["#page-element-path-textarea"].value = result.path;
    MDC.layout();
    // We don't highlight because we already highlight in autoDetect (scroll). pageElement uses currentDocument for highlighting, so we can't use it for highlighting autoDetect unfortunately
    checkPageElement(true, false, result.details, "clickAutoDetectPageElement()");
  }

  /**
   * This function executes when the user clicks the list action's find links button.
   *
   * @param {Event} event - the click event that triggered this callback function
   * @private
   */
  async function clickFindLinks(event) {
    const links = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "findLinks"});
    DOM["#list-textarea"].value = links.join("\n") ;
    MDC.layout();
  }

  /**
   * This function executes when the user clicks the list action's sort links button. It sorts the links
   * in alphabetical order.
   *
   * @param {Event} event - the click event that triggered this callback function
   * @private
   */
  function clickListSort(event) {
    const list = DOM["#list-textarea"].value.match(/[^\r\n]+/g) || [];
    list.sort();
    DOM["#list-textarea"].value = list.join("\n");
  }

  /**
   * Updates the ETA for Auto based on the times and seconds. This is called multiple times, thus this helper function.
   *
   * @private
   */
  function updateAutoETA() {
    updateETA(+DOM["#auto-times-input"].value * +DOM["#auto-seconds-input"].value, DOM["#auto-eta-value"], instance.autoEnabled);
  }

  /**
   * Updates the ETA times every time the seconds or times is updated by the user or when the instance is updated.
   *
   * Calculating the hours/minutes/seconds is derived from code written by Vishal @ stackoverflow.com
   *
   * @param {number} time - the total time (times * seconds, or quantity * seconds)
   * @param {Element} eta - the eta element to update the result with
   * @param {boolean} enabled - if true, when time is <= 0 shows done, else shows tbd (e.g. error)
   * @see https://stackoverflow.com/a/11486026/988713
   * @private
   */
  function updateETA(time, eta, enabled) {
    const hours = ~~ (time / 3600);
    const minutes = ~~ ((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    const fhours = hours ? hours + (hours === 1 ? chrome.i18n.getMessage("eta_hour") : chrome.i18n.getMessage("eta_hours")) : "";
    const fminutes = minutes ? minutes + (minutes === 1 ? chrome.i18n.getMessage("eta_minute") : chrome.i18n.getMessage("eta_minutes")) : "";
    const fseconds = seconds ? seconds + (seconds === 1 ? chrome.i18n.getMessage("eta_second") : chrome.i18n.getMessage("eta_seconds")) : "";
    eta.textContent =
      time <= 0 || (!hours && !minutes && !seconds) ?
      enabled ? chrome.i18n.getMessage("eta_done") : chrome.i18n.getMessage("eta_tbd") :
      time > 86400 ? chrome.i18n.getMessage("eta_day") : fhours + fminutes + fseconds;
  }

  /**
   * Sets up the instance with the input parameters. First validates user input for any errors, then saves and enables
   * the instance, then toggles the view back to the controls.
   *
   * @private
   */
  async function setup() {
    setupInputs("accept");
    // If errors, show alert and don't continue
    const errors = await setupErrors("accept");
    if (errors && errors.length > 0) {
      UI.generateAlert(errors, true);
      return;
    }
    // No errors: good to go and finish setting up _ to re-set the new instance (clicking Accept enables this instance)
    _.enabled = true;
    // Need this to reset the URLs array if changing the selection or adjusting other properties:
    _.urls = [];
    const precalculateProps = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "incrementPrecalculateURLs", instance: _});
    _.urls = precalculateProps.urls;
    _.urlsCurrentIndex = _.startingURLsCurrentIndex = precalculateProps.currentIndex;
    // If Auto enabled and instance URLs array (e.g. multi range, shuffle on and hit 0 early in decrement, etc.) adjust times to be urls length
    if (_.autoEnabled && _.urls && _.urls.length > 0) {
      _.autoTimes = _.urls.length;
    }
    // Note: We will also update Scroll's items.on to be true when we send the message to start
    if (!items.on) {
      console.log("setup() - turning infy on: items.on=true ...");
      Promisify.storageSet({"on": true});
      items.on = true;
    }
    // Switch to the controls view (buttons) early? If the append mode uses iframes, it may take a few seconds to prepare the first page otherwise
    // Set the instance early to _. Then we will call updateControls afterwards to update after we get the instance back
    instance = _;
    toggleView.call(DOM["#accept-button"]);
    // Handle Save
    await setupSave();
    // Give the content script the updated instance
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "setInstance", instance: _});
    // Ask the content script to start (or re-start again):
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "start", caller: "popup"});
    // We need to get the instance back from the content script after it's been set to get the updated started property (after start() is called). Can't just set _ to the instance
    instance = await Promisify.tabsSendMessage(tabs[0].id, {sender: "popup", receiver: "contentscript", greeting: "getInstance"});
    _ = instance;
    // Update the controls after we get the instance back
    updateControls();
    // If auto is enabled, ask Auto to start auto timer (must do this after setting instance in the Content Script)
    // TODO: Investigate this in the case of wrapFirstPage() and when Auto is enabled... wouldn't it take time for the first page to be wrapped in the iframe first?
    if (instance.autoEnabled) {
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "startAutoTimer", caller: "popup"});
      // chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", tabId: tabs[0].id, badge: "auto", temporary: false}, function (response) { if (chrome.runtime.lastError) {} });
    } else {
      // TODO: We need to cover the use case when Auto WAS toggled on, but no longer isn't. Therefore, for now, we always ask to stop the AutoTimer, but perhaps we should only do this when we know Auto was previously toggled on?
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "stopAutoTimer", caller: "popup"});
      // chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", tabId: tabs[0].id, badge: "on", temporary: false}, function (response) { if (chrome.runtime.lastError) {} });
    }
    // Save Default Settings
    // Note: Next/Prev settings aren't currently saved because their defaults can be set in the Options
    const defaults = {};
    defaults.action = _.action;
    // Only save append if this is not a database URL
    if (!_.databaseFound) {
      defaults.append = _.append;
    }
    if (_.action === "increment") {
      defaults.interval = _.interval;
      defaults.base = _.base;
      defaults.baseCase = _.baseCase;
      defaults.baseDateFormat = _.baseDateFormat;
      defaults.baseRoman = _.baseRoman;
      defaults.baseCustom = _.baseCustom;
      defaults.errorSkip = _.errorSkip;
      if (_.shuffleEnabled) {
        defaults.shuffleURLs = _.shuffleURLs;
      }
    }
    if (_.action === "click") {
      defaults.buttonPosition = _.buttonDetection === "manual" ? _.buttonPosition : items.buttonPosition;
    }
    if (_.append === "media") {
      defaults.mediaType = _.mediaType;
    }
    if (_.autoEnabled) {
      defaults.autoSeconds = _.autoSeconds;
      defaults.autoTimes = _.autoTimes;
      defaults.autoBadge = _.autoBadge;
      defaults.autoSlideshow = _.autoSlideshow;
      defaults.autoBehavior = _.autoBehavior;
    }
    chrome.storage.local.set(defaults);
    // // Switch to the controls view (buttons)
    // toggleView.call(DOM["#accept-button"]);
  }

  /**
   * Sets up the temporary instance _ with all the form inputs in the Popup.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  function setupInputs(caller) {
    if (caller === "accept" || caller === "multi" || caller === "toolkit") {
      // PopupOpened and Tab ID: This is the only time we can set these
      _.popupOpened = true;
      _.tabId = tabs[0] && tabs[0].id ? tabs[0].id : _.tabId;
      // Save:
      _.saveFound = DOM["#save-input"].checked;
      _.saveName = DOM["#save-name-textarea"].value;
      _.saveURL = DOM["#save-url-textarea"].value;
      _.saveType = DOM["#save-type-pattern"].checked ? DOM["#save-type-pattern"].value : DOM["#save-type-regex"].checked ? DOM["#save-type-regex"].value : DOM["#save-type-exact"].checked ? DOM["#save-type-exact"].value : "";
      // Next:
      _.nextLinkPath = DOM["#next-link-path-textarea"].value;
      _.nextLinkProperty = DOM["#next-link-property-textarea"].value ? DOM["#next-link-property-textarea"].value.split(".").filter(Boolean) : [];
      _.nextLinkKeywordsEnabled = DOM["#next-link-keywords-enabled-input"].checked;
      _.prevLinkPath = DOM["#prev-link-path-textarea"].value;
      _.prevLinkProperty = DOM["#prev-link-property-textarea"].value ? DOM["#prev-link-property-textarea"].value.split(".").filter(Boolean) : [];
      _.prevLinkKeywordsEnabled = DOM["#prev-link-keywords-enabled-input"].checked;
      // Increment:
      _.url = _.startingURL = DOM["#url-textarea"].value;
      _.selection = _.startingSelection = DOM["#selection-input"].value;
      _.selectionStart = _.startingSelectionStart = +DOM["#selection-start-input"].value;
      _.interval = +DOM["#interval-input"].value;
      _.base = isNaN(MDC.selects.get("base-select").value) ? MDC.selects.get("base-select").value : +MDC.selects.get("base-select").value;
      _.baseDateFormat = DOM["#base-date-format-input"].value;
      _.baseCustom = DOM["#base-custom-input"].value;
      _.leadingZeros = DOM["#leading-zeros-input"].checked;
      // TODO:
      // _.errorSkip = _.action === "list" && DOM["#list-error-skip-checkbox-input"].checked ? +DOM["#list-error-skip-input"].value : +DOM["#error-skip-input"].value;
      _.errorSkip = +DOM["#error-skip-input"].value;
      // Note: _.multi is set in clickMulti()
      _.multiCount = +DOM["#multi-count"].value;
      _.multiEnabled = (_.action === "increment" || _.action === "decrement") && _.multiCount >= 2 && _.multiCount <= 3;
//      _.shuffleEnabled = (DOM["#shuffle-enabled-input"].checked && (_.action === "increment" || _.action === "decrement")) || (DOM["#list-shuffle-urls-input"].checked &&  _.action === "list");
      _.shuffleEnabled = (DOM["#shuffle-enabled-input"].checked && (_.action === "increment" || _.action === "decrement")); //|| (DOM["#list-shuffle-urls-input"].checked &&  _.action === "list");
      _.shuffleURLs = _.shuffleEnabled ? +DOM["#shuffle-urls-input"].value : undefined;
      // Button
      _.buttonPath = DOM["#button-path-textarea"].value;
      _.buttonPosition = _.buttonDetection === "manual" ? +DOM["#button-position-input"].value : undefined;
      // List
      _.listEnabled = _.action === "list";
      // This will be null if we don't do || []
      _.list = DOM["#list-textarea"].value.match(/[^\r\n]+/g) || [];
      _.listOptions = _.action === "list" && DOM["#list-options-input"].checked;
      // Append
      // Make the threshold be 100 for click button, including both ajax modes; in the case of iframe, this also buys us extra time to scroll
      // the iframe, and in the case of native, if some of the bottom content hasn't loaded before the button has been clicked, this is necessary
      _.appendThreshold = _.action === "click" ? 100 : instance.appendThreshold;
      _.iframePageOne = DOM["#iframe-page-one-input"].checked;
      _.iframeResize = DOM["#iframe-resize-input"].checked;
      _.pageElementPath = DOM["#page-element-path-textarea"].value;
      _.insertBeforePath = DOM["#insert-before-path-textarea"].value;
      _.pageElementIframe = _.append === "element" && DOM["#page-element-iframe-input"].checked ? MDC.chips.get("page-element-iframe-mode-trim-chip").selected ? MDC.chips.get("page-element-iframe-mode-trim-chip").root_.dataset.value : MDC.chips.get("page-element-iframe-mode-import-chip").root_.dataset.value : undefined;
      // AJAX
      _.loadElementPath = DOM["#load-element-path-textarea"].value;
      _.removeElementPath = DOM["#remove-element-path-textarea"].value;
      // Scripts
      _.lazyLoad = DOM["#lazy-load-input"].checked ? DOM["#lazy-load-mode-manual"].checked ? DOM["#lazy-load-mode-manual"].value : DOM["#lazy-load-mode-auto"].value : undefined;
      _.lazyLoadSource = DOM["#lazy-load-source-input"].value;
      _.lazyLoadDestination = DOM["#lazy-load-destination-input"].value;
      _.mirrorPage = _.action === "click" && _.append === "ajax" && _.ajaxMode !== "native" && DOM["#mirror-page-input"].checked ? DOM["#mirror-page-mode-puppet"].checked ? DOM["#mirror-page-mode-puppet"].value : DOM["#mirror-page-mode-import"].value : undefined;
      // Note the || here, this allows us to re-save a regex SPA for a save object instead of always defaulting to locationOrigin if a spa already exists for the instance
      // _.spa = DOM["#spa-input"].checked ? _.spa || _.locationOrigin : undefined;
      _.spa = DOM["#spa-input"].checked ? _.spa || ("^" + Util.escapeRegularExpression(_.locationOrigin)) : undefined;
      _.puppet = DOM["#puppet-textarea"].value;
      // Miscellaneous
      _.transferNodeMode = _.transferNode || (_.append === "ajax" ? "import" : "adopt");
      // Document Type depends on append mode and action combination.
      _.documentType =
        (_.append === "element" && _.action === "click") || (_.append === "none") || (_.append === "ajax" && _.ajaxMode === "native") ? "top" :
        (_.append === "iframe") || (_.append === "ajax" && _.ajaxMode !== "native") || (_.append === "element" && _.pageElementIframe) ? "iframe" :
        "current";
      // Workflow
      _.workflowReverse = (_.append === "ajax" && _.ajaxMode !== "native") || (_.append === "element" && _.pageElementIframe);
      _.workflowPrepend = (_.action === "click" && ((_.append === "element") || (_.append === "ajax" && _.ajaxMode === "native")))  ? "divider" : "";
      if (_.workflowPrepend) { _.scrollLoading = false }
    }
    if (caller === "multi") {
      const range = /\[(.*)-(\d+)]/.exec(_.selection);
      if (range && range [1] && range[2]) {
        _.selection = range[1];
        _.selectionStart++;
        _.multiTimes = +range[2];
        _.multiRange = range;
        _.multiRangeEnabled = true;
      } else {
        _.multiTimes = _.multiRange = _.multiRangeEnabled = undefined;
      }
    }
    if (caller === "accept") {
      // Auto:
      _.autoEnabled = MDC.switches.get("auto-switch").checked;
      _.autoTimes = +DOM["#auto-times-input"].value;
      // Store the original autoTimes for reference later as we are going to decrement autoTimes
      _.autoTimesOriginal = +DOM["#auto-times-input"].value;
      _.autoSeconds = +DOM["#auto-seconds-input"].value;
      _.autoSlideshow = DOM["#auto-slideshow-input"].checked;
      _.autoBadge = DOM["#auto-badge-input"].checked ? "times" : "";
      _.autoBehavior = DOM["#auto-behavior-input"].checked ? "smooth" : "auto";
      _.autoRepeatCount = 0;
      _.autoRepeating = false;
      _.autoPaused = false;
      // Scroll Behavior will be modified to reflect Auto Behavior if this is slideshow. We use items.scrollBehavior to reset to the "original" scrollBehavior in case Slideshow was enabled and disabled
      _.scrollBehavior = _.autoEnabled && DOM["#auto-slideshow-input"].checked ? _.autoBehavior : items.scrollBehavior;
    }
  }

  /**
   * Sets up all the errors found using the temporary instance _.
   *
   * @param {string} caller - the caller who called this function
   * @return {string[]} all errors found, if any
   * @private
   */
  async function setupErrors(caller) {
    const errors = [];
    // Next Errors
    // TODO: Commenting out this validation check for the time being in case the user wants to override saving a URL
    // if (_.action === "next" || _.action === "prev") {
    //   if (!DOM["#next-prev-link-textarea"].value) { errors.push(chrome.i18n.getMessage("next_prev_empty_error")) }
    // }
    // Increment Errors
    if (_.action === "increment" || _.action === "decrement") {
      const validateSelectionError = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "incrementValidateSelection", instance: _});
      if (caller === "accept" && _.multiCount === 1) { errors.push(chrome.i18n.getMessage("multi_count_error")); }
      if (!_.selection) { errors.push(chrome.i18n.getMessage("selection_blank_error")); }
      if (!_.url.includes(_.selection)) { errors.push(chrome.i18n.getMessage("selection_notinurl_error")); }
      if (_.selectionStart < 0 || _.url.substring(_.selectionStart, _.selectionStart + _.selection.length) !== _.selection) { errors.push(chrome.i18n.getMessage("selectionstart_invalid_error")); }
      // Don't validate selection in accept if multi range enabled due to brackets
      if (!(caller !== "multi" && _.multiRangeEnabled) && validateSelectionError) { errors.push(chrome.i18n.getMessage(validateSelectionError)); }
      if (_.interval <= Number.MIN_SAFE_INTEGER || _.interval >= Number.MAX_SAFE_INTEGER) { errors.push(chrome.i18n.getMessage("interval_invalid_error")); }
      if (_.errorSkip < 0 || _.errorSkip > 100) { errors.push(chrome.i18n.getMessage("error_skip_invalid_error")); }
      if (_.shuffleEnabled && _.shuffleURLs < 1 || _.shuffleURLs > 10000) { errors.push(chrome.i18n.getMessage("shuffle_amount_error")); }
    }
    // Click Errors
    if (_.action === "click") {
      if (_.buttonPosition < 0 || _.buttonPosition > 10000) { errors.push(chrome.i18n.getMessage("button_position_error")); }
      if (_.autoEnabled && _.autoSlideshow && _.append === "none") { errors.push(chrome.i18n.getMessage("button_auto_slideshow_error")); }
    }
    // List Errors
    // TODO: (Infy only) Validate that the list URLs all have the same origin as instance.locationOrigin?
    if (_.action === "list") {
      if (!_.list || _.list.length < 1) { errors.push(chrome.i18n.getMessage("list_empty_error")); }
      if (_.errorSkip < 0 || _.errorSkip > 100) { errors.push(chrome.i18n.getMessage("error_skip_invalid_error")); }
    }
    // Append Errors
    if (caller === "accept") {
      if (_.append === "media" && _.action !== "increment" && _.action !== "list") { errors.push(chrome.i18n.getMessage("append_media_action_error")); }
      if (_.append === "none" && _.action !== "click") { errors.push(chrome.i18n.getMessage("append_none_action_error")); }
      if (_.append === "ajax" && _.action !== "click") { errors.push(chrome.i18n.getMessage("append_ajax_action_error")); }
      if (_.action === "click" && ["page", "iframe"].includes(_.append)) { errors.push(chrome.i18n.getMessage("append_click_action_error")); }
      if (_.action === "click" && _.append === "element" && _.pageElementIframe) { errors.push(chrome.i18n.getMessage("append_click_element_iframe_error")); }
    }
    // Auto Errors
    if (_.autoEnabled && caller === "accept") {
      if (_.autoTimes < 1 || _.autoTimes > 10000) { errors.push(chrome.i18n.getMessage("auto_times_invalid_error")); }
      if (_.autoSeconds < 1 || _.autoSeconds > 3600) { errors.push(chrome.i18n.getMessage("auto_seconds_invalid_error")); }
    }
    // Save Errors
    if (_.saveFound && caller === "accept") {
      if (!_.saveURL) { errors.push(chrome.i18n.getMessage("save_url_error")); }
      if (!_.saveType) { errors.push(chrome.i18n.getMessage("save_type_error")); }
      if (_.multiEnabled) { errors.push(chrome.i18n.getMessage("save_multi_error")); }
    }
    // TODO: Test this more before forcing this isLocal check
    // Local file:// URL Errors
    // if (_.isLocal) {
    //   if (_.append === "page" || _.append === "iframe" || _.append === "element") { errors.push(chrome.i18n.getMessage("local_url_append_error")); }
    // }
    return errors;
  }

  /**
   * Sets up the save if necessary (adds, edits, or deletes a save).
   */
  async function setupSave() {
    // The save action will either be add, edit, delete, or undefined.
    // It depends on two variables: whether saveFound (heart is toggled) and whether we already have a saveID attached to _
    const saveAction = _.saveFound ? !_.saveID ? "add" : "edit" : _.saveID ? "delete" : "";
    console.log("setupSave() - saveAction=" + saveAction);
    // Save Name (Tab Title): Verify it can be stringified in JSON (just in case)
    try {
      // Note in this case we do want to use JSON.parse(JSON.stringify()) and not structuredClone as we are testing strictly for JSON errors
      const jsonName = JSON.parse(JSON.stringify({ "name": _.saveName })).name;
      if (jsonName !== _.saveName) {
        throw new Error("The JSON name does not equal the original save name, saveName=" + _.saveName + ", jsonName=" + jsonName);
      }
    } catch (e) {
      console.log("setup() - error saving name. Error:");
      console.log(e);
      _.saveName = "";
    }
    if (saveAction === "add" || saveAction === "edit") {
      // Exact URL - Increment Decrement Action-Specific Adjustments for saveURL and selectionEnd
      // Just noticed that this means what they enter in the Save URL text field is ignored! (this is a good thing)
      if (_.saveType === "exact" && (_.action === "increment" || _.action === "decrement")) {
        const url1 = _.url.substring(0, _.selectionStart);
        const url2 = _.url.substring(_.selectionStart + _.selection.length);
        _.saveURL = url1 + url2;
        _.selectionEnd = url2.length;
      }
      // Add the save, get the newly generated ID and set it in the instance so the user can now edit or delete it by ID
      const save = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "addSave", instance: _});
      _.saveID = save.id;
      console.log("setupSave() - added save, id=" + _.saveID);
    } else if (saveAction === "delete") {
      // Delete the save, note that we do not have to set saveFound to false as it is already set by untoggling the heart
      await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "deleteSave", id: _.saveID, url: _.saveURL, writeToStorage: true});
      _.saveID = undefined;
    }
  }

  /**
   * Listen for requests from chrome.runtime.sendMessage (e.g. Background).
   *
   * @param {Object} request - the request containing properties to parse (e.g. greeting message)
   * @param {Object} sender - the sender who sent this message, with an identifying tab
   * @param {function} sendResponse - the optional callback function (e.g. for a reply back to the sender)
   * @private
   */
  async function messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=");
    console.log(request);
    if (!request.instance || !instance || (request.instance.tabId !== instance.tabId && request.action !== "power")) {
      console.log("messageListener() - unable to process this request, either because the instance is undefined or because request.instance.tabId doesn't equal instance.tabId. instance=");
      console.log(instance);
      return;
    }
    // Default response
    let response = {};
    switch (request.greeting) {
      case "updatePopupInstance":
        // instance = request.instance;
        instance = Util.clone(request.instance);
        // If this will change the on/off state and the popup is still open, we need to update the popup's storage items too!
        if (request.action === "power" || request.action === "blacklist" || request.action === "whitelist") {
          items = await Promisify.storageGet();
        }
        // Introduce a small delay before updating the controls after they click the button
        // setTimeout(() => { updateControls(); }, request.action === "blacklist" || request.action === "whitelist" ? 0 : 0);
        updateControls();
        // TODO: Test this more. Don't update the setup if it's just a simple Down or Up Button click
        if (request.caller !== "popupClickActionButton" && request.caller !== "command" && request.action !== "down" && request.action !== "up") {
          updateSetup(false);
        }
        break;
      // case "themeChanged":
      //   // Only need to change the icon, the page's css will auto-adjust dynamically
      //   document.querySelector("link[rel='icon']").href = request.theme === "dark" ? "../img/icon-light.png" : "../img/icon-dark.png";
      //   break;
      default:
        break;
    }
    sendResponse(response);
  }

  // Popup Listeners
  // Message Listener: We need to return immediately if the function will be performing asynchronous work
  // Message Listener Careful 1: We only listen to messages if it's for this specific Popup's instance!
  // Message Listener Careful 2: The tabId for the instance is set in only two possible ways: When the background sets the badge ("ON") or when the Popup is opened
  // Gotcha Note: See Tab ID note in init() when getting the instance
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "popup") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });

  // Note: This is the only way to detect when the popup has closed aside from keeping a port connection open
  // Also note that window.addEventListener "beforeunload" and "unload" won't fire
  // @see https://bugs.chromium.org/p/chromium/issues/detail?id=225917#c16
  document.addEventListener("visibilitychange", (e) => {
    chrome.tabs.sendMessage(tabs[0].id, {sender: "popup", receiver: "contentscript", greeting: "popupOpened", popupOpened: false});
  }, false);

  // Initialize Popup
  init();

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    debug
  };

})();