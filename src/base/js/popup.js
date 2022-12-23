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
 */
const Popup = (() => {

  /**
   * Variables
   *
   * @param DOM      the DOM elements cache
   * @param _        the temporary instance before being accepted (enabled) in setup
   * @param instance the actual instance object after being accepted (enabled) in setup and before being loaded
   * @param items    the storage items cache
   * @param tabs     the reusable tabs object
   * @param timeouts the reusable timeouts object that stores all named timeouts used on this page
   * @param checks   object that keeps track of whether an action/append check has been made (e.g. checkNextPrev)
   */
  const DOM = {};
  let _;
  let instance;
  let items;
  let tabs;
  let timeouts = {};
  let checks = {};

  /**
   * Initializes the Popup window. This script is set to defer so the DOM is guaranteed to be parsed by this point.
   *
   * @private
   */
  async function init() {
    // If we don't have chrome, display an error message. Note: Firefox allows Private Window Installation, which is primarily the reason why we need this check (though less so in the Popup)
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
      tabs = await Promisify.tabsQuery();
      if (!tabs || tabs.length < 0) {
        throw new Error(chrome.i18n.getMessage("popup_error_reason_tabs"));
      }
      items = await Promisify.storageGet();
      if (!items || Object.keys(items).length <= 0) {
        throw new Error(chrome.i18n.getMessage("popup_error_reason_items"));
      }
      instance = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "getInstance"});
      if (!instance || Object.keys(instance).length <= 0) {
        // Infy Scroll only: We try a second time to manually inject the content script via our activeTab permission
        // This will only work in Production, which will have infy-scroll.js defined
        await Promisify.tabsExecuteScript(tabs[0].id, {file: "/js/infy-scroll.js", runAt: "document_end"});
        instance = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "getInstance"});
        if (!instance || Object.keys(instance).length <= 0) {
          throw new Error(chrome.i18n.getMessage("popup_error_reason_instance"));
        }
      }
      // TabID - Need to set the tabId now in certain situations in order to receive runtime messages (e.g. blacklist/whitelist when it hasn't been on yet)
      if (!instance.tabId || instance.tabId === 0) {
        instance.tabId = tabs[0].id;
      }
    } catch (e) {
      console.log("init() - error initializing 1-time only objects (tabs, items, or instance). Error:");
      console.log(e);
      DOM["#messages"].className = "display-flex";
      // Need the || because: e.message if we are throwing the error, e if it's a chrome error
      DOM["#popup-error-reason"].textContent = e.message || e;
      // We need to add the options-button-2 event listener before we return
      DOM["#options-button-2"].addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
      return;
    }
    console.log("init() - tabs=");
    console.log(tabs);
    console.log("init() - items=");
    console.log(items);
    console.log("init() - instance=");
    console.log(instance);
    // _ = JSON.parse(JSON.stringify(instance));
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
        // element.removeAttribute("aria-describedby");
        // element.removeAttribute("data-balloon-pos");
        // element.removeAttribute("data-balloon-length");
        // element.classList.remove("tooltip", "tooltip-without-underline");
      }
    }
    DOM["#version-theme"].className = items.interfaceTheme ? "display-block" : "display-none";
    // Initialization that requires the instance
    MDC.lists.get("action-list").selectedIndex = instance.action === "next" || instance.action === "prev" ? 0 : instance.action === "increment" || instance.action === "decrement" ? 1 : instance.action === "button" ? 2 : instance.action === "list" ? 3 : -1;
    MDC.lists.get("append-list").selectedIndex = instance.append === "page" ? 0 : instance.append === "iframe" ? 1 : instance.append === "element" ? 2 : instance.append === "media" ? 3 : 0;
    MDC.lists.get("append-button-list").selectedIndex = instance.append === "none" ? 0 : instance.append === "ajax" ? 1 : 0;
    MDC.chips.get((instance.action === "prev" ? "prev" : "next") + "-chip").selected = true;
    MDC.chips.get("page-element-iframe-mode-" + (instance.pageElementIframe === "trim" ? "trim" : "import") + "-chip").selected = true;
    // If this is a database URL and there's a resource URL, make the icon clickable and point to it
    if (instance.databaseFound && instance.databaseResourceURL) {
      DOM["#database-icon"].style.cursor = "pointer";
      DOM["#database-icon"].addEventListener("click", () => { chrome.tabs.create({url: instance.databaseResourceURL }); });
    }
    updateSetup(true);
    changeAction("init()");
    // Note: changeAction already calls changeAppend, so the following line isn't necessary:
    // changeAppend();
    // If Auto is on, pause Auto when Popup is first opened for convenience
    if (instance.autoEnabled && !instance.autoPaused) {
      console.log("init() - pausing auto on popup startup");
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "performAction", action: "auto", caller: "popupClickActionButton"});
    }
    // Show "Found" snackbar only if it hasn't been viewed yet and instance isn't enabled and if save/database found
    // if (!instance.viewedFoundSnackbar && !instance.enabled && (instance.saveFound || instance.whitelistFound || instance.databaseCustomFound || instance.databaseFound)) {
    if (!instance.viewedFoundSnackbar && !instance.enabled && (instance.saveFound || instance.databaseFound)) {
      // TODO: We shouldn't need to set both of these to true. We need to decide whether to use instance or _ at this point
      instance.viewedFoundSnackbar = true;
      _.viewedFoundSnackbar = true;
      await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "setInstance", instance: instance});
      setTimeout(() => {
        const one = !instance.saveFound && instance.databaseFound ? items.databaseMode === "blacklist" && instance.databaseBlacklisted ? chrome.i18n.getMessage("blacklisted_label") : items.databaseMode === "whitelist" && !instance.databaseWhitelisted ? chrome.i18n.getMessage("unwhitelisted_label") : "" : "";
        const two = chrome.i18n.getMessage("popup_found_" + instance.via);
        MDC.openSnackbar(chrome.i18n.getMessage("popup_found_snackbar_label").replace("?1", one).replace("?2", two));
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
    DOM["#scripts-and-styles-button"].addEventListener("click", function () { MDC.dialogs.get("scripts-and-styles-dialog").open(); });
    DOM["#options-button"].addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
    DOM["#options-button-2"].addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
    // Element Picker
    DOM["#element-picker-next-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-prev-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-button-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-element-button"].addEventListener("click", clickElementPicker);
    DOM["#element-picker-remove-button"].addEventListener("click", clickElementPicker);
    // DOM["#element-picker-disables-button"].addEventListener("click", clickElementPicker);
    // DOM["#element-picker-disabler-button"].addEventListener("click", clickElementPicker);
    DOM["#auto-detect-element-button"].addEventListener("click", clickAutoDetectPageElement);
    // Toggle the drawer by first always closing it and then listening to see when it has finished closing to re-open it with the new collapsed state
    DOM["#drawer-button"].addEventListener("click", closeDrawer);
    MDC.drawers.get("app-drawer").listen("MDCDrawer:closed", openDrawer);
    MDC.fabs.get("save-fab").listen("click", () => { MDC.dialogs.get("save-dialog").open(); if (!checks.checkSave) { checkSave(false, "save-fab click listener"); } MDC.layout(); });
    // TODO: These MDC list listeners are being executed twice each call, need to update MDC beyond version 6. Until then, adding click listener manually
    // https://github.com/material-components/material-components-web/issues/5221
    // MDC.lists.get("action-list").listen("MDCList:action", changeAction);
    // MDC.lists.get("append-list").listen("MDCList:action", changeAppend);
    // MDC.lists.get("append-button-list").listen("MDCList:action", changeAppend);
    DOM["#action-list"].addEventListener("click", changeAction);
    DOM["#append-list"].addEventListener("click", changeAppend);
    DOM["#append-button-list"].addEventListener("click", changeAppend);
    // Save
    DOM["#save-dialog-content"].addEventListener("input", function (event) { if (event.target.id !== "save-title-textarea") { checkSave(true, "save-dialog-content input listener"); } });
    // Next Prev
    DOM["#next-prev"].addEventListener("input", function (event) { checkNextPrev(event.target.dataset.action, true, true, false, "next-prev input listener"); });
    MDC.chipsets.get("next-prev-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() next-prev-chip-set - clicked " + this.id + ", action=" + this.dataset.action);
      MDC.chips.get(this.id).selected = true;
      changeAction("next-prev-chip-set click listener");
      checkNextPrev(this.dataset.action, false, false, true, "next-prev-chip-set click listener");
    }));
    // MDC.selects.get("next-type-select").listen("MDCSelect:change", () => {
    //   const value = MDC.selects.get("next-type-select").value;
    //   _.nextLinkType = value;
    //   DOM["#next-selector-text-field"].style.display = value === "selector" ? "" : "none";
    //   DOM["#next-xpath-text-field"].style.display = value === "xpath" ? "" : "none";
    //   checkNextPrev("next", true, false, false, "MDCSelect:change listener (next)");
    // });
    // MDC.selects.get("prev-type-select").listen("MDCSelect:change", () => {
    //   const value = MDC.selects.get("prev-type-select").value;
    //   _.prevLinkType = value;
    //   DOM["#prev-selector-text-field"].style.display = value === "selector" ? "" : "none";
    //   DOM["#prev-xpath-text-field"].style.display = value === "xpath" ? "" : "none";
    //   checkNextPrev("prev", true, false, false, "MDCSelect:change listener (prev)");
    // });
    // Increment Decrement
    DOM["#url-textarea"].addEventListener("select", selectURL);
    MDC.selects.get("base-select").listen("MDCSelect:change", () => {
      const value = MDC.selects.get("base-select").value;
      // Note: We do not do fade-in due to a recent bug in Chromium that makes the radio dots appear outside the circles
      DOM["#base-case"].className = +value > 10 ? "display-block" : "display-none";
      DOM["#base-date"].className = value === "date" ? "display-block fade-in" : "display-none";
      DOM["#base-roman"].className = value === "roman" ? "display-block" : "display-none";
      DOM["#base-custom"].className = value === "custom" ? "display-block fade-in" : "display-none";
      MDC.layout();
    });
    DOM["#shuffle-button"].addEventListener("click", function () { MDC.dialogs.get("shuffle-dialog").open(); });
    // Shuffle Button is an SVG, so use className.baseVal instead of just className
    DOM["#shuffle-button-yes"].addEventListener("click", function () { DOM["#shuffle-enabled-input"].checked = true; DOM["#shuffle-button-icon"].className.baseVal = ""; });
    DOM["#shuffle-button-no"].addEventListener("click", function () { DOM["#shuffle-enabled-input"].checked = false; DOM["#shuffle-button-icon"].className.baseVal = "disabled"; });
    // Button
    DOM["#button-section"].addEventListener("input", function (event) { checkButton(true, true,"button-section input listener"); });
    // MDC.selects.get("button-type-select").listen("MDCSelect:change", () => {
    //   _.buttonType = MDC.selects.get("button-type-select").value;
    //   checkButton(true, false,"MDCSelect:change listener");
    // });
    MDC.selects.get("button-detection-select").listen("MDCSelect:change", () => {
      _.buttonDetection = MDC.selects.get("button-detection-select").value;
      DOM["#button-position"].className = _.buttonDetection === "manual" ? "display-block fade-in" : "display-none";
      // DOM["#button-position"].className = MDC.selects.get("button-detection-select").value === "manual" ? "display-block fade-in" : "display-none";
    });
    // List
    DOM["#find-links-button"].addEventListener("click", clickFindLinks);
    DOM["#list-sort-button"].addEventListener("click", clickListSort);
    DOM["#list-button"].addEventListener("click", function () { MDC.dialogs.get("list-dialog").open(); });
    // List Button is an SVG, so use className.baseVal instead of just className
    DOM["#list-button-yes"].addEventListener("click", function () { DOM["#list-options-input"].checked = true; DOM["#list-button-icon"].className.baseVal = ""; });
    DOM["#list-button-no"].addEventListener("click", function () { DOM["#list-options-input"].checked = false; DOM["#list-button-icon"].className.baseVal = "disabled"; });
    // Append Element
    DOM["#element"].addEventListener("input", function (event) { if (event.target.id !== "page-element-iframe-input") { checkPageElement(true, true, false, "element input listener"); } });
    // MDC.selects.get("page-element-type-select").listen("MDCSelect:change", () => {
    //   _.pageElementType = MDC.selects.get("page-element-type-select").value;
    //   checkPageElement(true, false, false, "MDCSelect:change listener");
    // });
    DOM["#page-element-iframe-input"].addEventListener("change", function () { DOM["#page-element-iframe-mode"].className = this.checked ? "display-inline fade-in" : "display-none"; });
    MDC.chipsets.get("page-element-iframe-mode-chip-set").chips.forEach(chip => chip.listen("click", function () {
      console.log("MDCChip:() page-element-iframe-mode-chip-set - clicked " + this.id + ", value=" + this.dataset.value);
      MDC.chips.get(this.id).selected = true;
    }));
    // Scripts
    DOM["#lazy-load-input"].addEventListener("change", function () { DOM["#lazy-load"].className = this.checked ? "display-inline fade-in" : "display-none"; MDC.layout(); });
    DOM["#lazy-load-mode"].addEventListener("change", function () { DOM["#lazy-load-attribute"].className = event.target.value === "manual" ? "display-block fade-in" : "display-none"; MDC.layout();  });
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
    drawer.foundation_.close();
    // TODO: This is different in Infy because we have two mdc-lists
    // We remove the fade-in class so that when we toggle the drawer from expanded to collapsed it doesn't keep fading it in
    DOM["#append-list"].classList.remove("fade-in");
    DOM["#append-button-list"].classList.remove("fade-in");
  }

  /**
   * Opens the drawer. This function is called every time we close the drawer to toggle it in a new state: expanded (regular) or collapsed.
   *
   * This is called each time the MDCDrawer:closed event is emitted.
   *
   * @param event                the click event (not being used)
   * @param itemsDrawerCollapsed the storage items drawer collapsed state (boolean)
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
   * @param caller who called this function
   * @private
   */
  function changeAction(caller) {
    console.log("changeAction() - list selectedIndex=" + MDC.lists.get("action-list").selectedIndex + ", caller=" + caller);
    // Get the selected list element and use its dataset attribute to determine the action
    const selected = MDC.lists.get("action-list").listElements.find(el => el.classList.contains("mdc-list-item--selected"));
    let action = selected && selected.dataset && selected.dataset.action ? selected.dataset.action : "next";
    // Handle Reverse Actions (Prev, Decrement is always just a negative interval Increment)
    if (action === "next" || action === "prev") {
      action = MDC.chips.get("prev-chip").selected ? "prev" : "next";
    }
    _.action = action;
    DOM["#next-prev"].className = action === "next" || action === "prev" ? "display-block fade-in" : "display-none";
    DOM["#increment-decrement"].className = action === "increment" || action === "decrement" ? "display-block fade-in" : "display-none";
    DOM["#button"].className = action === "button" ? "display-block fade-in" : "display-none";
    DOM["#list"].className = action === "list" ? "display-block fade-in" : "display-none";
    if (action === "next" || action === "prev") {
      DOM["#next"].className = action === "next" ? "display-block" : "display-none";
      DOM["#prev"].className = action === "prev" ? "display-block" : "display-none";
      DOM["#next-prev-url-label"].textContent = chrome.i18n.getMessage(action + "_url_label");
      if (!checks.checkNextPrev) {
        checkNextPrev(action, false, false, true, "changeAction()");
      }
    } else if (action === "increment" || action === "decrement") {
      DOM["#url-textarea"].setSelectionRange(instance.selectionStart, instance.selectionStart + instance.selection.length);
      DOM["#url-textarea"].focus();
    } else if (!checks.checkButton && action === "button") {
      checkButton(false, false,"changeAction()");
    }
    DOM["#append-list"].className = action !== "button" ? "mdc-list fade-in" : "mdc-list display-none";
    DOM["#append-button-list"].className = action === "button" ? "mdc-list fade-in" : "mdc-list display-none";
    changeAppend();
    MDC.layout();
  }

  /**
   * Called when the append mode (Page, Iframe, Element, Media, None) is changed.
   * Changes the Setup window so that the appropriate append mode controls are in view.
   *
   * @private
   */
  function changeAppend() {
    console.log("changeAppend() - list selectedIndex=" + MDC.lists.get("append-list").selectedIndex);
    // Get the selected list element and use its dataset attribute to determine the action
    const selectedA = MDC.lists.get("append-list").listElements.find(el => el.classList.contains("mdc-list-item--selected"));
    const selectedB = MDC.lists.get("append-button-list").listElements.find(el => el.classList.contains("mdc-list-item--selected"));
    const appendA = selectedA && selectedA.dataset && selectedA.dataset.append ? selectedA.dataset.append : "page";
    const appendB = selectedB && selectedB.dataset && selectedB.dataset.append ? selectedB.dataset.append : "none";
    const append =  _.action !== "button" ? appendA : appendB;
    _.append = append;
    DOM["#page"].className = append === "page" ? "display-block fade-in" : "display-none";
    DOM["#iframe"].className = append === "iframe" ? "display-block fade-in" : "display-none";
    DOM["#element"].className = append === "element" || append === "ajax" ? "display-block fade-in" : "display-none";
    DOM["#media"].className = append === "media" ? "display-block fade-in" : "display-none";
    DOM["#none"].className = append === "none" ? "display-block fade-in" : "display-none";
    DOM["#ajax"].className = append === "ajax" ? "display-block fade-in" : "display-none";
    // Element/AJAX Shared Styling:
    DOM["#ajax-header"].style.display = append === "ajax" ? "" : "none";
    DOM["#element"].dataset.type = append;
    DOM["#element-header"].style.display = append === "element" ? "" : "none";
    DOM["#insert-before-path-text-field"].style.display = append === "element" ? "" : "none"
    DOM["#element-iframe"].style.display = append === "element" ? "" : "none";
    if (!checks.checkPageElement && (_.append === "element" || _.append === "ajax")) {
      checkPageElement(false, false, false, "changeAppend()");
    }
    MDC.layout();
  }

  /**
   * Performs the action based on the button if the requirements are met (e.g. the instance is enabled).
   * Note: After performing the action, the content script sends a message back to popup with the updated instance, so
   * no callback function is needed in performAction().
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
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "performAction", action: action, caller: "popupClickActionButton"});
      // Note: We no longer need to do any of this anymore as we get a message back from Action.performAction telling us to update the instance and storage items
      // Update the Popup's local items cache on state to false while this window is still open. The storage items will be updated in performAction so we don't have to do it here
      // if (action === "off") {
      //   items.on = false;
      //   // Should we set the instance.enabled to false here?
      //   // Should we close the snackbar saying it was activated in case the snackbar opened up?
      //   // MDC.snackbars.get("mdc-snackbar").close();
      // }
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
    DOM["#page-number"].textContent = instance.currentPage + " / " + instance.totalPages;
    DOM["#save-icon"].style.display = instance.saveFound ? "" : "none";
    DOM["#save-icon-title"].textContent = instance.saveFound ? chrome.i18n.getMessage("save_icon_title") + " " + instance.saveURL : "";
    // DOM["#whitelist-icon"].style.display = !instance.saveFound && instance.whitelistFound ? "" : "none";
    // // Note: We still store the whitelist URL in saveURL
    // DOM["#whitelist-icon-title"].textContent = instance.whitelistFound && instance.saveURL ? chrome.i18n.getMessage("whitelist_icon_title")  + " " + instance.saveURL : "";
    // DOM["#database-blacklist-icon"].style.display = !instance.saveFound && !instance.whitelistFound && instance.databaseFound && instance.databaseBlacklisted ? "" : "none";
    DOM["#database-blacklist-icon"].style.display = !instance.saveFound && instance.databaseFound && instance.databaseBlacklisted ? "" : "none";
    DOM["#database-blacklist-icon-title"].textContent = instance.databaseBlacklisted ? chrome.i18n.getMessage("database_blacklist_icon_title") + " " + instance.databaseBlacklistWhitelistURL : "";
    // DOM["#database-whitelist-icon"].style.display = !instance.saveFound && !instance.whitelistFound && instance.databaseFound && instance.databaseWhitelisted ? "" : "none";
    DOM["#database-whitelist-icon"].style.display = !instance.saveFound && instance.databaseFound && instance.databaseWhitelisted ? "" : "none";
    DOM["#database-whitelist-icon-title"].textContent = instance.databaseWhitelisted ? chrome.i18n.getMessage("database_whitelist_icon_title") + " " + instance.databaseBlacklistWhitelistURL : "";
    // DOM["#database-custom-icon"].style.display = !instance.saveFound && !instance.whitelistFound && instance.databaseCustomFound ? "" : "none";
    // DOM["#database-custom-icon-title"].textContent = instance.databaseCustomFound ? chrome.i18n.getMessage("database_custom_icon_title") + " " + instance.databaseURL : "";
    // DOM["#database-icon"].style.display = !instance.saveFound && !instance.whitelistFound && !instance.databaseCustomFound && instance.databaseFound ? "" : "none";
    DOM["#database-icon"].style.display = !instance.saveFound && instance.databaseFound ? "" : "none";
    DOM["#database-icon-title"].textContent = instance.databaseFound ? chrome.i18n.getMessage("database_" + (instance.databaseISFound ? "is_" : "ap_") + "icon_title") + " " + (instance.databaseResourceURL ? chrome.i18n.getMessage("database_click_icon_title") + " " : "") + instance.databaseURL : "";
    // DOM["#database-icon"].setAttribute("fill", instance.databaseISFound ? "var(--mdc-theme-primary)" : "var(--mdc-theme-primary)");
    DOM["#auto-slideshow-icon"].style.display = instance.autoEnabled && instance.autoSlideshow ? "" : "none";
    DOM["#shuffle-icon"].style.display = instance.enabled && instance.shuffleEnabled ? "" : "none";
    DOM["#down-button"].style.display = "";
    DOM["#up-button"].style.display = "";
    DOM["#down-button"].style.opacity = DOM["#up-button"].style.opacity = instance.enabled ? 1 : 0.2;
    // Power Button
    // DOM["#power-button"].style.opacity = items.on ? 1 : 0.2;
    DOM["#power-button"].style.fill = window.getComputedStyle(document.documentElement).getPropertyValue(items.on ? "--error-color" : "--mdc-theme-primary");
    // DOM["#power-button"].dataset.action = items.on ? "off" : "on";
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
   * @param all {boolean} if true, updates all the setup inputs, and if false, updates only the necessary ones
   * @private
   */
  async function updateSetup(all = false) {
    console.log("updateSetup() - all=" + all);
    // Save URL Setup
    if (all) {
      DOM["#save-input"].checked = instance.saveFound;
      DOM["#save-button-icon"].children[0].setAttribute("href", "../lib/fontawesome/" + (instance.saveFound ? "solid" : "regular") + ".svg#heart");
      DOM["#save-title-textarea"].value = instance.saveTitle;
      DOM["#save-url-textarea"].value = instance.saveURL;
      DOM["#save-type-pattern"].checked = instance.saveType === "pattern";
      DOM["#save-type-regex"].checked = instance.saveType === "regex";
      DOM["#save-type-exact"].checked = instance.saveType === "exact";
    }
    // Next Prev Setup
    if (all || instance.action === "next") {
      // MDC.selects.get("next-type-select").value = instance.nextLinkType;
      // DOM["#next-selector-input"].value = instance.nextLinkSelector;
      // DOM["#next-xpath-input"].value = instance.nextXpath;
      // DOM["#next-selector-text-field"].style.display = instance.nextLinkType === "selector" ? "" : "none";
      // DOM["#next-xpath-text-field"].style.display = instance.nextLinkType === "xpath" ? "" : "none";
      DOM["#next-path-input"].value = instance.nextLinkPath;
      DOM["#next-property-input"].value = instance.nextLinkProperty ? instance.nextLinkProperty.join(".") : "";
      DOM["#next-keywords-enabled-input"].checked = instance.nextLinkKeywordsEnabled;
    }
    if (all || instance.action === "prev") {
      // MDC.selects.get("prev-type-select").value = instance.prevLinkType;
      // DOM["#prev-selector-input"].value = instance.prevSelector;
      // DOM["#prev-xpath-input"].value = instance.prevXpath;
      // DOM["#prev-selector-text-field"].style.display = instance.prevLinkType === "selector" ? "" : "none";
      // DOM["#prev-xpath-text-field"].style.display = instance.prevLinkType === "xpath" ? "" : "none";
      DOM["#prev-path-input"].value = instance.prevLinkPath;
      DOM["#prev-property-input"].value = instance.prevLinkProperty ? instance.prevLinkProperty.join(".") : "";
      DOM["#prev-keywords-enabled-input"].checked = instance.prevLinkKeywordsEnabled;
    }
    // Increment Decrement Setup
    if (all || instance.action === "increment" || instance.action === "decrement") {
      DOM["#url-textarea"].value = instance.url;
      // TODO: Investigate why we needed to set focus for the url textarea here as we are doing it already in changeAction()
      // DOM["#url-textarea"].setSelectionRange(instance.selectionStart, instance.selectionStart + instance.selection.length);
      // DOM["#url-textarea"].focus();
      DOM["#selection-input"].value = instance.selection;
      DOM["#selection-start-input"].value = instance.selectionStart;
    }
    // Button Setup
    if (all || instance.action === "button") {
      DOM["#button-path-input"].value = instance.buttonPath;
      // MDC.selects.get("button-type-select").value = instance.buttonType;
      MDC.selects.get("button-detection-select").value = typeof instance.buttonPosition !== "undefined" ? "manual" : "auto";
      DOM["#button-position"].className = instance.buttonDetection === "manual" ? "display-block" : "display-none";
      // DOM["#button-position"].className = MDC.selects.get("button-detection-select").value === "manual" ? "display-block" : "display-none";
      DOM["#button-position-input"].value = typeof instance.buttonPosition !== "undefined" ? instance.buttonPosition : items.buttonPosition;
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
      MDC.selects.get("media-type-select").value = instance.mediaType;
    }
    // Append Element
    if (all || instance.append === "element" || instance.append === "ajax") {
      DOM["#page-element-path-input"].value = instance.pageElementPath;
      DOM["#insert-before-path-input"].value = instance.insertBeforePath;
      // MDC.selects.get("page-element-type-select").value = instance.pageElementType;
      DOM["#page-element-iframe-input"].checked = !!instance.pageElementIframe;
      DOM["#page-element-iframe-mode"].className = !!instance.pageElementIframe ? "display-block" : "display-none";
    }
    // Append AJAX
    if (all || instance.append === "ajax") {
      DOM["#remove-element-input"].value = instance.removeElementPath;
      DOM["#remove-element-delay-input"].value = instance.removeElementDelay;
      DOM["#disable-scroll-element-input"].value = instance.disableScrollElementPath;
      DOM["#disable-remove-element-input"].value = instance.disableRemoveElementPath;
    }
    // Scripts Setup
    if (all) {
      DOM["#lazy-load-input"].checked = !!instance.lazyLoad;
      DOM["#lazy-load"].className = !!instance.lazyLoad ? "display-inline" : "display-none";
      DOM["#lazy-load-mode-auto"].checked = instance.lazyLoad !== "manual";
      DOM["#lazy-load-mode-manual"].checked = instance.lazyLoad === "manual";
      DOM["#lazy-load-attribute"].className = instance.lazyLoad === "manual" ? "display-block" : "display-none";
      DOM["#lazy-load-source-input"].value = instance.lazyLoadSource;
      DOM["#lazy-load-destination-input"].value = instance.lazyLoadDestination;
      DOM["#spa-input"].checked = !!instance.spa;
    }
    // Convert number base to string just in case (can't set number as value, e.g. 10 instead of "10")
    if (all) {
      MDC.selects.get("base-select").value = instance.base + "";
      DOM["#interval-input"].value = instance.interval;
      DOM["#error-skip-input"].value = instance.errorSkip;
      DOM["#base-case"].className = typeof instance.base === "number" && instance.base > 10 ? "display-block" : "display-none";
      DOM["#base-case-lowercase-input"].checked = instance.baseCase === "lowercase";
      DOM["#base-case-uppercase-input"].checked = instance.baseCase === "uppercase";
      DOM["#base-date"].className = instance.base === "date" ? "display-block" : "display-none";
      DOM["#base-date-format-input"].value = instance.baseDateFormat;
      DOM["#base-roman"].className = instance.base === "roman" ? "display-block" : "display-none";
      DOM["#base-roman-latin-input"].checked = instance.baseRoman === "latin";
      DOM["#base-roman-u216x-input"].checked = instance.baseRoman === "u216x";
      DOM["#base-roman-u217x-input"].checked = instance.baseRoman === "u217x";
      DOM["#base-custom"].className = instance.base === "custom" ? "display-block" : "display-none";
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
   * @param delay {boolean} whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @param caller {string} who called this function
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
        // const save = JSON.parse(JSON.stringify(_));
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
   * @param action {string}     the action (next or prev)
   * @param delay {boolean}     whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @param highlight {boolean} whether to highlight the element (true) or not (false)
   * @param focus {boolean}     whether to focus on the next/prev url textarea (true) or not (false)
   * @param caller who called this function
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
        // const type = MDC.selects.get("next-type-select").value;
        // const rule = DOM["#" + action + "-" + type + "-input"].value
        const rule = DOM["#" + action + "-path-input"].value
        const type = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "determinePathType", path: rule, type: _[action + "LinkType"] });
        const property = DOM["#" + action + "-property-input"].value ? DOM["#" + action + "-property-input"].value.split(".").filter(Boolean) : [];
        // If the keywordsEnabled hasn't been decided yet (it's undefined), we will not use the checkbox value and instead pass in undefined to NextPrev so it tries to use the keywords
        const keywordsEnabled = _[action + "LinkKeywordsEnabled"] === undefined ? undefined : DOM["#" + action + "-keywords-enabled-input"].checked;
        // const keywordsEnabled = DOM["#" + action + "-keywords-enabled-input"].checked;
        const keywords = _[action + "LinkKeywords"];
        const keywordObject = _[action + "LinkKeywordObject"];
        console.log("checkNextPrev() - sending message to check: type=" + type + ", rule=" + rule + ", property=" + property + ", keywordsEnabled=" + keywordsEnabled);
        await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkNextPrev", type: type, rule: rule, property: property, keywordsEnabled: keywordsEnabled, keywords: keywords, keywordObject: keywordObject, highlight: highlight});
        console.log("checkNextPrev() - response received from check:");
        console.log(response);
        const success = response && response.url;
        // This is the only opportunity to store the new type if the path changes
        _[action + "LinkType"] = type;
        // If the keywordsEnabled hasn't been decided yet (it's undefined), we will manually decide it after getting the response from NextPrev and set it for the temporary instance  _
        if (_[action + "LinkKeywordsEnabled"] === undefined) {
          _[action + "LinkKeywordsEnabled"] = DOM["#" + action + "-keywords-enabled-input"].checked = (response.method === "keyword" || response.method === "keyword-alternate");
        }
        DOM["#next-prev-result-loading"].style.display = "none";
        DOM["#next-prev-result-success"].style.display = success ? "block" : "none";
        DOM["#next-prev-result-error"].style.display = success ? "none" : "block";
        const details = chrome.i18n.getMessage(action + "_path_label");
        // + " (" + chrome.i18n.getMessage(type + "_label") + ")";
        if (success) {
          DOM["#next-prev-result-message-success"].textContent = chrome.i18n.getMessage("next_prev_result_message_success").replace("?", chrome.i18n.getMessage(action + "_label"));
          if (response.method === "selector" || response.method === "xpath") {
            DOM["#next-prev-result-details-success"].textContent = details;
            // Some paths can be very lengthy, and if they're too long the balloon tooltip will cause a vertical scrollbar to appear. An alternative is to set break-word: break-all in the CSS
            DOM["#next-prev-result-details-success"].setAttribute("aria-label", "(" + (chrome.i18n.getMessage(type + "_label") + ") " + response.rule).substring(0, 500));
          } else if (response.method === "keyword" || response.method === "keyword-alternate") {
            DOM["#next-prev-result-details-success"].textContent = chrome.i18n.getMessage(response.method.replace("-", "_") + "_label") + " " + response.keywordObject.keyword;
            DOM["#next-prev-result-details-success"].setAttribute("aria-label", response.element + " " + (response.keywordObject.relationship !== "self" ? response.keywordObject.relationship + " " : "") + (response.property ? response.property : response.keywordObject.type) + " " + response.keywordObject.subtype + " " + response.keywordObject.keyword);
            _[action + "LinkKeywordObject"] = response.keywordObject;
          }
          DOM["#next-prev-url-textarea"].value = response.url;
        } else {
          DOM["#next-prev-result-message-error"].textContent = chrome.i18n.getMessage("next_prev_result_message_error").replace("?", chrome.i18n.getMessage(action + "_label"));
          DOM["#next-prev-result-details-error"].textContent = details;
          DOM["#next-prev-result-details-error"].setAttribute("aria-label", response && response.error ? response.error : chrome.i18n.getMessage("no_result_tooltip_error"));
          DOM["#next-prev-url-textarea"].value = "";
        }
        MDC.linearProgresses.get("next-prev-linear-progress").foundation_.setDeterminate(true);
        MDC.layout();
        if (focus && success) {
          DOM["#next-prev-url-textarea"].focus();
        }
      }, delay ? 1000 : 0);
    }, delay ? 1000 : 0);
  }

  /**
   * Called if the user modifies the Button action inputs, like changing the selector or xpath to find the button.
   * The Popup will ask the content script to re-check the page to find the button using the new inputs.
   *
   * @param delay {boolean}     whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @param highlight {boolean} whether to highlight the element (true) or not (false)
   * @param caller {string}     who called this function
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
        // const buttonType = MDC.selects.get("button-type-select").value;
        const buttonPath = DOM["#button-path-input"].value;
        const buttonType = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "determinePathType", path: buttonPath, type: _.buttonType });
        console.log("checkButton() - sending message to check: buttonType=" + buttonType + ", buttonPath=" + buttonPath);
        await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
        const response = await Promisify.tabsSendMessage(tabs[0].id, {caller: "popup", receiver: "contentscript", greeting: "checkButton", buttonType: buttonType, buttonPath: buttonPath, highlight: highlight});
        console.log("checkButton() - response received from check:");
        console.log(response);
        const success = response && response.found && response.clickable;
        // This is the only opportunity to store the new type if the path changes
        _.buttonType = buttonType;
        DOM["#button-result-loading"].style.display = "none";
        DOM["#button-result-success"].style.display = success ? "block" : "none";
        DOM["#button-result-error"].style.display = success ? "none" : "block";
        const details = chrome.i18n.getMessage("button_path_label");
        // + " (" + chrome.i18n.getMessage(buttonType + "_label") + ")";
        if (success) {
          DOM["#button-result-details-success"].textContent = details;
          DOM["#button-result-details-success"].setAttribute("aria-label", "(" + (chrome.i18n.getMessage(buttonType + "_label") + ") " + chrome.i18n.getMessage("button_result_tooltip_success").replace("?", response.buttonNode)));
        } else {
          DOM["#button-result-details-error"].textContent = details;
          DOM["#button-result-details-error"].setAttribute("aria-label", response && response.error ? response.error : response && response.found && !response.clickable ? chrome.i18n.getMessage("button_result_tooltip_error_clickable") : chrome.i18n.getMessage("no_result_tooltip_error"));
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
   * @param {boolean} delay        whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @param {boolean} highlight    true if this element should be highlighted, false if not
   * @param {boolean} autoDetected true if this check was called by clickAutoDetectPageElement(), false otherwise
   * @param {string}  caller       who called this function
   * @private
   */
  function checkPageElement(delay = false, highlight = false, autoDetected = false, caller) {
    console.log("checkPageElement() - delay=" + delay + ", highlight=" + highlight + ", autoDetected=" + autoDetected + ", caller=" + caller);
    checks.checkPageElement = true;
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("page-element-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.pageElement);
    timeouts.pageElement = setTimeout(function () {
      clearTimeout(timeouts.pageElement2);
      DOM["#page-element-result-loading"].style.display = "block";
      DOM["#page-element-result-success-error"].style.display = "none";
      timeouts.pageElement2 = setTimeout(async function () {
        // const pageElementType = MDC.selects.get("page-element-type-select").value;
        const pageElementPath = DOM["#page-element-path-input"].value;
        const insertBeforePath = DOM["#insert-before-path-input"].value;
        const pageElementType = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "determinePathType", path: pageElementPath, type: _.pageElementType });
        console.log("checkPageElement() - sending message to check: pageElementType=" + pageElementType + ", pageElementPath=" + pageElementPath + ", insertBeforePath="+ insertBeforePath);
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkPageElement", pageElementType: pageElementType, pageElementPath: pageElementPath, insertBeforePath: insertBeforePath, highlight: highlight});
        console.log("checkPageElement() - response received from check:");
        console.log(response);
        const success = response && response.found;
        // This is the only opportunity to store the new type if the path changes
        _.pageElementType = pageElementType;
        DOM["#page-element-result-loading"].style.display = "none";
        DOM["#page-element-result-success-error"].style.display = "block";
        DOM["#page-element-result-success"].style.display = success ? "inline-block" : "none";
        DOM["#page-element-result-error"].style.display = success ? "none" : "inline-block";
        const details = chrome.i18n.getMessage("page_element_path_label");
        // + " (" + chrome.i18n.getMessage(pageElementType + "_label") + ")";
        if (success) {
          DOM["#page-element-result-message-success"].textContent = chrome.i18n.getMessage("page_element_result_message_success").replace("?", response.elementsLength);
          DOM["#page-element-result-details-success"].textContent = details;
          DOM["#page-element-result-details-success"].setAttribute("aria-label", "(" + (chrome.i18n.getMessage(pageElementType + "_label") + ") " + chrome.i18n.getMessage("page_element_result_tooltip_success").replace("?1", response.parentNode).replace("?2", response.insertDetails)));
        } else {
          DOM["#page-element-result-details-error"].textContent = details;
          DOM["#page-element-result-details-error"].setAttribute("aria-label", response && response.error ? response.error : chrome.i18n.getMessage("no_result_tooltip_error"));
        }
        DOM["#page-element-result-autodetect"].className = autoDetected ? "display-inline fade-in" : "display-none";
        MDC.linearProgresses.get("page-element-linear-progress").foundation_.setDeterminate(true);
        MDC.layout();
      }, delay ? 500 : 0);
    }, delay ? 500 : 0);
  }

  /**
   * This function executes when the user clicks the element picker button.
   *
   * @param event the click event
   * @returns {Promise<void>}
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
    // Before we send off the temporary instance, we need to make sure we set the keywordsEnabled. If we don't do this, when they return to the popup, the keywords wont be enabled anymore
    // Note: We have to always do this, not just when it's the action next or prev
    _.nextLinkKeywordsEnabled = DOM["#next-keywords-enabled-input"].checked;
    _.prevLinkKeywordsEnabled = DOM["#prev-keywords-enabled-input"].checked;
    // Execute scripts to get the Picker ready to be opened:
    // Already including dompath.js in the content script so we don't need this:
    // await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/dompath/dompath.js", runAt: "document_end"});
    await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
    await Promisify.tabsExecuteScript(tabs[0].id, {file: "/js/picker.js", runAt: "document_end"});
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "setInstance", instance: _ });
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "openPicker" });
    // We automatically close the Popup to enter the Picker mode
    window.close();
  }

  /**
   * This function executes when the user clicks the auto detect element button.
   *
   * @param event the click event
   * @returns {Promise<void>}
   * @private
   */
  async function clickAutoDetectPageElement(event) {
    await Promisify.tabsExecuteScript(tabs[0].id, {file: "/lib/hoverbox/hoverbox.js", runAt: "document_end"});
    // Note: The reason why we're passing the Popup's items path properties is because Scroll's items may be out of date
    DOM["#page-element-path-input"].value = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "autoDetectPageElement", instance: _, algorithm: items.pathAlgorithm, quote: items.pathQuote, optimized: items.pathOptimized });
    MDC.layout();
    // We don't highlight because we already highlight in autoDetect (scroll). pageElement uses document_ for highlighting, so we can't use it for highlighting autoDetect unfortunately
    checkPageElement(true, false, true, "clickAutoDetectPageElement()");
  }

  /**
   * This function executes when the user clicks the list action's find links button.
   *
   * @param event the click event
   * @returns {Promise<void>}
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
   * @param event the click event
   * @returns {Promise<void>}
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
   * @param time the total time (times * seconds, or quantity * seconds)
   * @param eta  the eta element to update the result with
   * @param enabled if true, when time is <= 0 shows done, else shows tbd (e.g. error)
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
    _.previouslyEnabled = true;
    // Need this to reset the URLs array if changing the selection or adjusting other properties:
    _.urls = [];
    const precalculateProps = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "incrementPrecalculateURLs", instance: _});
    _.urls = precalculateProps.urls;
    _.urlsCurrentIndex = _.startingURLsCurrentIndex = precalculateProps.currentIndex;
    // If Auto enabled and instance URLs array (e.g. multi range, shuffle on and hit 0 early in decrement, etc.) adjust times to be urls length
    if (_.autoEnabled && _.urls && _.urls.length > 0) {
      _.autoTimes = _.urls.length;
    }
    // Handle Save
    await setupSave();
    // Note: We will also update Scroll's items.on to be true when we send the message to start
    if (!items.on) {
      console.log("setup() - turning infy on: items.on=true ...");
      await Promisify.storageSet({"on": true});
      items.on = true;
    }
    // Give the content script the updated instance
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "setInstance", instance: _});
    // Ask the content script to start (or re-start again):
    await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "start"});
    // We need to get the instance back from the content script after it's been set to get the updated started property (after start() is called). Can't just set _ to the instance
    instance = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "getInstance"});
    _ = instance;
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
    const object = {};
    object.action = _.action;
    // Only save append if this is not a database URL
    if (!_.databaseFound) {
      object.append = _.append;
    }
    // // Note: Only save append and pageElement settings if this is NOT a database URL and the scroll append is element. We only want to save these settings if we're 100% sure the user has manually set this append mode
    // if (!_.databaseFound && _.append === "element") {
    //   // object.pageElementType = _.pageElementType;
    //   // Note: We do not save the pageElementPath as it is always different for each page
    //   // object.pageElementPath = _.pageElementPath;
    //   // object.insertBeforePath = _.insertBeforePath;
    //   // object.pageElementIframe = _.pageElementIframe;
    // }
    // if (_.append === "ajax") {
    //   object.pageElementType = _.pageElementType;
    // }
    if (_.action === "increment") {
      object.interval = _.interval;
      object.base = _.base;
      object.baseCase = _.baseCase;
      object.baseDateFormat = _.baseDateFormat;
      object.baseRoman = _.baseRoman;
      object.baseCustom = _.baseCustom;
      object.errorSkip = _.errorSkip;
      if (_.shuffleEnabled) {
        object.shuffleURLs = _.shuffleURLs;
      }
    }
    if (_.action === "button") {
      // object.buttonType = _.buttonType;
      object.buttonPosition = _.buttonDetection === "manual" ? _.buttonPosition : items.buttonPosition;
    }
    if (_.append === "media") {
      object.mediaType = items.mediaType;
    }
    if (_.autoEnabled) {
      object.autoSeconds = _.autoSeconds;
      object.autoTimes = _.autoTimes;
      object.autoBadge = _.autoBadge;
      object.autoSlideshow = _.autoSlideshow;
      object.autoBehavior = _.autoBehavior;
    }
    chrome.storage.local.set(object);
    // Switch to the controls view (buttons)
    toggleView.call(DOM["#accept-button"]);
  }

  /**
   * Sets up the temporary instance _ with all the form inputs in the Popup.
   *
   * @param caller the caller (e.g. accept or multi)
   * @private
   */
  function setupInputs(caller) {
    if (caller === "accept" || caller === "multi" || caller === "toolkit") {
      // Tab ID: This is the only time we can set this
      _.tabId = tabs[0] && tabs[0].id ? tabs[0].id : _.tabId;
      // Save:
      _.saveFound = DOM["#save-input"].checked;
      _.saveTitle = DOM["#save-title-textarea"].value;
      _.saveURL = DOM["#save-url-textarea"].value;
      _.saveType = DOM["#save-type-pattern"].checked ? DOM["#save-type-pattern"].value : DOM["#save-type-regex"].checked ? DOM["#save-type-regex"].value : DOM["#save-type-exact"].checked ? DOM["#save-type-exact"].value : "";
      // Next Prev:
      // _.nextLinkType = MDC.selects.get("next-type-select").value;
      // _.nextLinkSelector = DOM["#next-selector-input"].value;
      // _.nextXpath = DOM["#next-xpath-input"].value;
      // _.nextLinkPath = _.nextLinkType === "selector" ? _.nextLinkSelector : _.nextXpath;
      _.nextLinkPath = DOM["#next-path-input"].value;
      _.nextLinkProperty = DOM["#next-property-input"].value ? DOM["#next-property-input"].value.split(".").filter(Boolean) : [];
      _.nextLinkKeywordsEnabled = DOM["#next-keywords-enabled-input"].checked;
      // _.prevLinkType = MDC.selects.get("prev-type-select").value;
      // _.prevSelector = DOM["#prev-selector-input"].value;
      // _.prevXpath = DOM["#prev-xpath-input"].value;
      // _.prevLinkPath = _.prevLinkType === "selector" ? _.prevSelector : _.prevXpath;
      _.prevLinkPath = DOM["#prev-path-input"].value;
      _.prevLinkProperty = DOM["#prev-property-input"].value ? DOM["#prev-property-input"].value.split(".").filter(Boolean) : [];
      _.prevLinkKeywordsEnabled = DOM["#prev-keywords-enabled-input"].checked;
      // Increment Decrement:
      _.url = _.startingURL = DOM["#url-textarea"].value;
      _.selection = _.startingSelection = DOM["#selection-input"].value;
      _.selectionStart = _.startingSelectionStart = +DOM["#selection-start-input"].value;
      _.interval = +DOM["#interval-input"].value;
      _.base = isNaN(MDC.selects.get("base-select").value) ? MDC.selects.get("base-select").value : +MDC.selects.get("base-select").value;
      _.baseCase = DOM["#base-case-uppercase-input"].checked ? DOM["#base-case-uppercase-input"].value : DOM["#base-case-lowercase-input"].value;
      _.baseDateFormat = DOM["#base-date-format-input"].value;
      _.baseRoman = DOM["#base-roman-latin-input"].checked ? DOM["#base-roman-latin-input"].value : DOM["#base-roman-u216x-input"].checked ? DOM["#base-roman-u216x-input"].value : DOM["#base-roman-u217x-input"].value;
      _.baseCustom = DOM["#base-custom-input"].value;
      _.leadingZeros = DOM["#leading-zeros-input"].checked;
      // TODO:
      // _.errorSkip = _.action === "
      // ]'list" && DOM["#list-error-skip-checkbox-input"].checked ? +DOM["#list-error-skip-input"].value : +DOM["#error-skip-input"].value;
      _.errorSkip = +DOM["#error-skip-input"].value;
      // Note: _.multi is set in clickMulti()
      _.multiCount = +DOM["#multi-count"].value;
      _.multiEnabled = (_.action === "increment" || _.action === "decrement") && _.multiCount >= 2 && _.multiCount <= 3;
//      _.shuffleEnabled = (DOM["#shuffle-enabled-input"].checked && (_.action === "increment" || _.action === "decrement")) || (DOM["#list-shuffle-urls-input"].checked &&  _.action === "list");
      _.shuffleEnabled = (DOM["#shuffle-enabled-input"].checked && (_.action === "increment" || _.action === "decrement")); //|| (DOM["#list-shuffle-urls-input"].checked &&  _.action === "list");
      _.shuffleURLs = _.shuffleEnabled ? +DOM["#shuffle-urls-input"].value : undefined;
      // Button
      // _.buttonType = MDC.selects.get("button-type-select").value;
      _.buttonPath = DOM["#button-path-input"].value;
      // _.buttonDetection = MDC.selects.get("button-detection-select").value;
      _.buttonPosition = MDC.selects.get("button-detection-select").value === "manual" ? +DOM["#button-position-input"].value : undefined;
      // List
      _.listEnabled = _.action === "list";
      // This will be null if we don't do || []
      _.list = DOM["#list-textarea"].value.match(/[^\r\n]+/g) || [];
      _.listOptions = _.action === "list" && DOM["#list-options-input"].checked;
      // Append
      _.scrollAppendThresholdPixels = _.action === "button" ? 100 : items.scrollAppendThresholdPixels;
      _.iframePageOne = DOM["#iframe-page-one-input"].checked;
      _.pageElementPath = DOM["#page-element-path-input"].value;
      _.insertBeforePath = DOM["#insert-before-path-input"].value;
      // _.pageElementType = MDC.selects.get("page-element-type-select").value;
      _.pageElementIframe = _.append === "element" && DOM["#page-element-iframe-input"].checked ? MDC.chips.get("page-element-iframe-mode-trim-chip").selected ? MDC.chips.get("page-element-iframe-mode-trim-chip").root_.dataset.value : MDC.chips.get("page-element-iframe-mode-import-chip").root_.dataset.value : undefined;
      _.mediaType = MDC.selects.get("media-type-select").value;
      // AJAX
      _.removeElementPath = DOM["#remove-element-input"].value;
      // _.removeElementType = pageElementType = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "determinePathType", path: pageElementPath, type: _.pageElementType });
      _.removeElementDelay = +DOM["#remove-element-delay-input"].value;
      _.disableScrollElementPath = DOM["#disable-scroll-element-input"].value;
      _.disableRemoveElementPath = DOM["#disable-remove-element-input"].value;
      // Scripts
      _.lazyLoad = DOM["#lazy-load-input"].checked ? DOM["#lazy-load-mode-manual"].checked ? DOM["#lazy-load-mode-manual"].value : DOM["#lazy-load-mode-auto"].value : undefined;
      _.lazyLoadSource = DOM["#lazy-load-source-input"].value;
      _.lazyLoadDestination = DOM["#lazy-load-destination-input"].value;
      // Note the || here, this allows us to re-save a regex SPA for a save object instead of always defaulting to locationOrigin if a spa already exists for the instance
      _.spa = DOM["#spa-input"].checked ? _.spa || _.locationOrigin : undefined;
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
   * @param caller the caller (e.g. accept or multi)
   * @return {*} all errors found, if any
   * @private
   */
  async function setupErrors(caller) {
    const errors = [];
    // Next Prev Errors
    // TODO: Commenting out this validation check for the time being in case the user wants to override saving a URL
    // if (_.action === "next" || _.action === "prev") {
    //   if (!DOM["#next-prev-url-textarea"].value) { errors.push(chrome.i18n.getMessage("next_prev_empty_error")) }
    // }
    // Increment Decrement Errors
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
    // Button Errors
    if (_.action === "button") {
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
      if (_.append === "media" && _.action !== "increment" && _.action !== "decrement" && _.action !== "list") { errors.push(chrome.i18n.getMessage("append_media_action_error")); }
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
   *
   * @returns {Promise<void>}
   */
  async function setupSave() {
    // The save action will either be add, edit, delete, or undefined.
    // It depends on two variables: whether saveFound (heart is toggled) and whether we already have a saveID attached to _
    const saveAction = _.saveFound ? !_.saveID ? "add" : "edit" : _.saveID ? "delete" : "";
    console.log("setupSave() - saveAction=" + saveAction);
    // Tab Title: Verify it can be stringified in JSON (just in case)
    try {
      const title = _.saveTitle;
      // Note in this case we do want to use JSON.parse(JSON.stringify()) and not structuredClone as we are testing strictly for JSON errors
      const validated = JSON.parse(JSON.stringify({ "title": _.saveTitle })).title;
      _.saveTitle = title === validated ? title : "";
    } catch (e) {
      console.log("setup() - error saving tab title. Error:");
      console.log(e);
      _.saveTitle = "";
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
   * @param request      the request containing properties to parse (e.g. greeting message)
   * @param sender       the sender who sent this message, with an identifying tabId
   * @param sendResponse the optional callback function (e.g. for a reply back to the sender)
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
        instance = request.instance;
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

  // Initialize Popup
  init();

})();