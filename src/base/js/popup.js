/**
 * Infy Scroll
 * @copyright © 2020 Roy Six
 * @license https://github.com/roysix/infy-scroll/blob/main/LICENSE
 */

/**
 * Popup handles all the Popup Window-specific logic. This includes letting the user change the Action and Append Modes,
 * enabling Auto, and adjusting various instance properties (such as the next rule).
 *
 * Popup directly messages with the Content Script in order to obtain the instance on the page. So if the extension
 * failed to load on the page, the Popup will display a message asking the user to refresh the page.
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
   */
  const DOM = {};
  let _;
  let instance;
  let items;
  let tabs;
  let timeouts = {};

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
      document.getElementById("popup-error-reason").textContent = "chrome is undefined";
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
      element.setAttribute("aria-label", chrome.i18n.getMessage(element.getAttribute("aria-label").replace(/-/g, '_').replace(/\*.*/, '')));
    }
    // Add Event Listeners to the DOM elements
    DOM["#setup-button"].addEventListener("click", toggleView);
    DOM["#accept-button"].addEventListener("click", setup);
    DOM["#cancel-button"].addEventListener("click", toggleView);
    DOM["#multi-button"].addEventListener("click", clickMulti);
    DOM["#save-url-button-yes"].addEventListener("click", function() { DOM["#save-url-input"].checked = true; DOM["#save-url-button-icon"].children[0].setAttribute("xlink:href", "../lib/fontawesome.svg#solid-heart"); });
    DOM["#save-url-button-no"].addEventListener("click", function() { DOM["#save-url-input"].checked = false; DOM["#save-url-button-icon"].children[0].setAttribute("xlink:href", "../lib/fontawesome.svg#regular-heart"); });
    DOM["#scripts-and-styles-button"].addEventListener("click", function() { MDC.dialogs.get("scripts-and-styles-dialog").open(); });
    DOM["#options-button"].addEventListener("click", function() { chrome.runtime.openOptionsPage(); });
    DOM["#options-button-2"].addEventListener("click", function() { chrome.runtime.openOptionsPage(); });
    // TODO: DOM["#element-picker-next-button"].addEventListener("click", () => { window.close(); });
    // The Don't show this again button in snackbar sets the interface messages to false
    MDC.snackbars.get("popup-activated-snackbar").actionEl_.addEventListener("click", () => { chrome.storage.local.set({ "interfaceMessages": false }); });
    MDC.fabs.get("save-fab").listen("click", () => { MDC.dialogs.get("save-dialog").open(); MDC.layout(); });
    MDC.lists.get("action-list").listen("MDCList:action", changeAction);
    MDC.lists.get("append-list").listen("MDCList:action", changeAppend);
    MDC.lists.get("append-button-list").listen("MDCList:action", changeAppend);
    // MDC.cards.forEach(el => el.listen("click", changeAppend));
    MDC.chips.forEach(chip => chip.listen("click", function() {
      console.log("MDCChip:() - clicked " + this.id + ", action=" + this.dataset.action);
      MDC.chips.get(this.id).selected = true;
      _.scrollAction = this.dataset.action;
      changeAction();
    }));
    // Save
    DOM["#save-dialog-content"].addEventListener("input", function(event) { if (event.target.id !== "save-title-textarea") { checkSave(true); } });
    // // TODO: The input event listener isn't firing on radio changes in older versions of Chrome (60), so we need to call the callback on the radio changes as well
    // DOM["#save-url-type"].addEventListener("change", function() { checkSave(true); });
    // Next Prev
    DOM["#next-prev"].addEventListener("input", function(event) { checkNextPrev(event.target.dataset.action, true, false); });
    // TODO: The input event listener isn't firing on radio changes in older versions of Chrome (60), so we need to call the callback on the radio changes as well
    DOM["#next-type"].addEventListener("change", function() {
      DOM["#next-selector-text-field"].style.display = event.target.value === "selector" ? "" : "none";
      DOM["#next-xpath-text-field"].style.display = event.target.value === "xpath" ? "" : "none";
      checkNextPrev("next", true, false);
    });
    DOM["#prev-type"].addEventListener("change", function() {
      DOM["#prev-selector-text-field"].style.display = event.target.value === "selector" ? "" : "none";
      DOM["#prev-xpath-text-field"].style.display = event.target.value === "xpath" ? "" : "none";
      checkNextPrev("prev", true, false);
    });
    // Increment Decrement
    DOM["#url-textarea"].addEventListener("select", selectURL);
    MDC.selects.get("base-select").listen("MDCSelect:change", () => {
      const value = MDC.selects.get("base-select").value;
      DOM["#base-case"].className = +value > 10 ? "display-block fade-in" : "display-none";
      DOM["#base-date"].className = value === "date" ? "display-block fade-in" : "display-none";
      DOM["#base-roman"].className = value === "roman" ? "display-block fade-in" : "display-none";
      DOM["#base-custom"].className = value === "custom" ? "display-block fade-in" : "display-none";
      MDC.layout();
    });
    // Append Element
    DOM["#scroll-element"].addEventListener("input", function(event) { if (event.target.id !== "scroll-element-iframe-input" && event.target.id !== "scroll-height-wait-element-input") { checkScrollElement(true); } });
    DOM["#scroll-element-iframe-input"].addEventListener("change", function(event) { DOM["#scroll-height-wait-element"].className = this.checked ? "display-block fade-in" : "display-none"; MDC.layout(); });
    // // TODO: The input event listener isn't firing on radio changes in older versions of Chrome (60), so we need to call the callback on the radio changes as well
    // DOM["#scroll-element-type"].addEventListener("change", function() { checkScrollElement(true); });
    // Button
    DOM["#button-section"].addEventListener("input", function(event) { checkButton(true); });
    // // TODO: The input event listener isn't firing on radio changes in older versions of Chrome (60), so we need to call the callback on the radio changes as well
    // DOM["#button-type"].addEventListener("change", function() { checkButton(true); });
    // Scripts and Styles
    DOM["#scroll-append-custom-styles-input"].addEventListener("change", function() { DOM["#scroll-append-custom-styles"].className = this.checked ? "display-block fade-in" : "display-none"; MDC.layout(); });
    DOM["#scroll-lazy-load-input"].addEventListener("change", function() { DOM["#scroll-lazy-load"].className = this.checked ? "display-inline fade-in" : "display-none"; MDC.layout(); });
    // // TODO: The input event listener isn't firing on radio changes in older versions of Chrome (60), so we need to call the callback on the radio changes as well
    DOM["#scroll-lazy-load-mode"].addEventListener("change", function() { DOM["#scroll-lazy-load-attribute"].className = event.target.value === "manual" ? "display-block fade-in" : "display-none"; MDC.layout();  });
    // Auto
    DOM["#auto-switch-input"].addEventListener("change", function() { DOM["#auto"].className = this.checked ? "display-block fade-in" : "display-none"; MDC.layout(); chrome.storage.local.set({ "autoStart": this.checked }); });
    DOM["#auto-times-input"].addEventListener("change", updateAutoETA);
    DOM["#auto-seconds-input"].addEventListener("change", updateAutoETA);
    DOM["#auto-slideshow-input"].addEventListener("change", function() { DOM["#auto-behavior-form-field"].className = this.checked ? "mdc-form-field fade-in" : "visibility-hidden";});
    // Initialize popup content (1-time only)
    tabs = await Promisify.tabsQuery();
    items = await Promisify.storageGet();
    if (!items || Object.keys(items).length <= 0) {
      console.log("init() - no storage items!");
      DOM["#messages"].className = "display-flex";
      DOM["#popup-error-reason"].textContent = chrome.i18n.getMessage("popup_error_reason_items");
      return;
    }
    instance = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "getInstance"});
    if (!instance) {
      console.log("init() - no instance because there was no response received from the Content Script");
      // If the content script didn't load on this page, execute the script manually (requires activeTab permission)
      try {
        // TODO: Why are we using document_end here? Test document_idle or something else, this is important we get right
        // This will only work in Production, which will have infy-scroll.js defined
        await Promisify.tabsExecuteScript(tabs[0].id, {file: "/js/infy-scroll.js", runAt: "document_end"});
        instance = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "getInstance"});
        if (!instance) {
          throw chrome.i18n.getMessage("popup_error_reason_instance");
        }
      } catch (e) {
        console.log("init() - no response received from content script after tabsExecuteScript(), error=" + e);
        DOM["#messages"].className = "display-flex";
        DOM["#popup-error-reason"].textContent = e;
        return;
      }
    }
    console.log("init() - tabs=" + JSON.stringify(tabs));
    console.log("init() - instance=" + JSON.stringify(instance));
    _ = JSON.parse(JSON.stringify(instance));
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
    DOM["#version-theme"].className = items.interfaceTheme ? "display-block fade-in" : "display-none";
    DOM["#version"].className = items.interfaceTheme ? "display-block fade-in" : "display-none";
    DOM["#mdc-drawer"].classList.add(items.interfaceImage === "infy" ? "mdc-drawer-mascot" : "mdc-drawer-extension");
    // DOM["#drawer-mascot-container"].style.display = items.interfaceImage === "infy" ? "" : "none";
    // DOM["#drawer-extension-container"].style.display = items.interfaceImage === "infinity" ? "" : "none";
    // Initialization that requires the instance
    MDC.lists.get("action-list").selectedIndex = instance.scrollAction === "next" || instance.scrollAction === "prev" ? 0 : instance.scrollAction === "increment" || instance.scrollAction === "decrement" ? 1 : instance.scrollAction === "button" ? 2 : instance.scrollAction === "list" ? 3 : -1;
    MDC.lists.get("append-list").selectedIndex = instance.scrollAppend === "page" ? 0 : instance.scrollAppend === "iframe" ? 1 : instance.scrollAppend === "element" ? 2 : instance.scrollAppend === "media" ? 3 : 0;
    MDC.lists.get("append-button-list").selectedIndex = instance.scrollAppend === "button" ? 0 : 0;
    MDC.chips.get((instance.scrollAction === "prev" ? "prev" : "next") + "-chip").selected = true;
    updateSetup(false, false);
    changeAction();
    // instance.scrollAppend can be "none" so need to make sure before calling changeAppend to avoid NPE
    // changeAppend.call(MDC.cards.get((["page", "iframe", "element", "media", "none", "keep"].includes(instance.scrollAppend) ? instance.scrollAppend : "page") + "-card").root_);
    changeAppend();
    // If Auto is on, pause Auto when Popup is first opened for convenience
    if (instance.autoEnabled && !instance.autoPaused) {
      console.log("init() - pausing auto on popup startup");
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "performAction", action: "auto", caller: "popupClickActionButton"});
    }
    // Show interface message snackbars if enabled or if save/whitelist/database found. Type is used in both types of snackbars
    const type = instance.saveFound ? "Saved URL" : instance.whitelistFound ? "Whitelisted URL" : instance.databaseFound ? "Database URL" : undefined;
    if (instance.enabled) {
      if (items.interfaceMessages) {
        const snackbar = MDC.snackbars.get("popup-activated-snackbar");
        snackbar.timeoutMs = -1;
        snackbar.labelText = chrome.i18n.getMessage("popup_activated_snackbar_label");
        if (type) {
          snackbar.labelText += chrome.i18n.getMessage("popup_activated_also_snackbar_label").replace("?", type);
        }
        snackbar.open();
      }
    } else if (instance.saveFound || instance.whitelistFound || instance.databaseFound) {
      setTimeout(() => {
        const snackbar = MDC.snackbars.get("popup-found-snackbar");
        // Can't make snackbar timeoutMs lower than 4000... snackbar.timeoutMs = 4000;
        snackbar.labelText = chrome.i18n.getMessage("popup_found_snackbar_label").replace("?", type);
        snackbar.open();
      }, 0);
    }
  }

  /**
   * Toggles the popup between the controls and setup views.
   *
   * @private
   */
  function toggleView() {
    console.log("toggleView() - id=" + this.id);
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
        updateSetup(true, true);
        MDC.layout();
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
   * Called when the action (Next Link, Increment URL, Click Button, URL List) is changed.
   * Changes the Setup window so that the appropriate action controls are in view.
   *
   * @private
   */
  function changeAction() {
    console.log("changeAction() - list selectedIndex=" + MDC.lists.get("action-list").selectedIndex);
    // Get the selected list element and use its dataset attribute to determine the action
    const selected = MDC.lists.get("action-list").listElements.find(el => el.classList.contains("mdc-list-item--selected"));
    let action = selected && selected.dataset && selected.dataset.action ? selected.dataset.action : "next";
    // Handle Reverse Actions (Prev and Decrement?)
    if (action === "next" || action === "prev") {
      action = MDC.chips.get("prev-chip").selected ? "prev" : "next";
    }
    _.scrollAction = action;
    DOM["#next-prev"].className = action === "next" || action === "prev" ? "display-block fade-in" : "display-none";
    DOM["#increment-decrement"].className = action === "increment" || action === "decrement" ? "display-block fade-in" : "display-none";
    DOM["#button"].className = action === "button" ? "display-block fade-in" : "display-none";
    DOM["#list"].className = action === "list" ? "display-block fade-in" : "display-none";
    // DOM["#scroll-normal-card-row"].className = action !== "button" ? "display-block fade-in" : "display-none";
    // DOM["#scroll-button-card-row"].className = action === "button" ? "display-block fade-in" : "display-none";
    if (action === "next" || action === "prev") {
      DOM["#next"].className = action === "next" ? "display-block" : "display-none";
      DOM["#prev"].className = action === "prev" ? "display-block" : "display-none";
      DOM["#next-prev-url-label"].textContent = chrome.i18n.getMessage(action + "_url_label");
      checkNextPrev(action, false, true);
    } else if (action === "increment" || action === "decrement") {
      DOM["#url-textarea"].setSelectionRange(instance.selectionStart, instance.selectionStart + instance.selection.length);
      DOM["#url-textarea"].focus();
    }
    DOM["#append-list"].className = action !== "button" ? "mdc-list fade-in" : "mdc-list display-none";
    DOM["#append-button-list"].className = action === "button" ? "mdc-list fade-in" : "mdc-list display-none";
    changeAppend();
    // We don't need to do this anymore if we are switching the Append to List and not Cards:
    // If the action is changed to button, we need to adjust the append mode to none; and if vice-versa, back to page
    // if (action === "button") {
    //   if (!_.scrollAppend || _.scrollAppend !== "keep") {
    //     changeAppend.call(DOM["#none-card"]);
    //   }
    // } else {
    //   if (!_.scrollAppend || _.scrollAppend === "none" || _.scrollAppend === "keep") {
    //     changeAppend.call(DOM["#page-card"]);
    //   }
    // }
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
    const append =  _.scrollAction !== "button" ? appendA : appendB;
    _.scrollAppend = append;
    // Old Card Code:
    // const item = this.dataset.item;
    // console.log("changeAppend() - item=" + item);
    // _.scrollAppend = item;
    // for (const card of MDC.cards.values()) {
    //   card.root_.classList.remove("mdc-list-item--activated");
    // }
    // this.classList.add("mdc-list-item--activated");
    DOM["#scroll-page"].className = append === "page" ? "display-block fade-in" : "display-none";
    DOM["#scroll-iframe"].className = append === "iframe" ? "display-block fade-in" : "display-none";
    DOM["#scroll-element"].className = append === "element" || append === "keep" ? "display-block fade-in" : "display-none";
    DOM["#scroll-element-iframe"].style.display = append === "keep" ? "none" : "";
    DOM["#scroll-media"].className = append === "media" ? "display-block fade-in" : "display-none";
    DOM["#scroll-none"].className = append === "none" ? "display-block fade-in" : "display-none";
    MDC.layout();
  }

  /**
   * Called if the user modifies the Save URL inputs, like changing the save URL or save type.
   * The Popup will ask the content script to re-check the saved URL to make sure it matches the instance's URL.
   *
   * @param delay (boolean) whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @private
   */
  function checkSave(delay) {
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("save-test-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.saveTest);
    timeouts.saveTest = setTimeout(function () {
      clearTimeout(timeouts.saveTest2);
      DOM["#save-test-result-loading"].style.display = "block";
      DOM["#save-test-result-success"].style.display = "none";
      DOM["#save-test-result-error"].style.display = "none";
      timeouts.saveTest2 = setTimeout(async function () {
        console.log("saveTest() - delay=" + delay);
        // Instead of just passing in url and type, we need to clone and pass in the _ object to test that matchesExact works when the action is increment or decrement (e.g. to include properties like selectionStart, selectionEnd)
        const save = JSON.parse(JSON.stringify(_));
        save.url = DOM["#save-url-textarea"].value;
        save.type = DOM["#save-url-type-pattern"].checked ? DOM["#save-url-type-pattern"].value : DOM["#save-url-type-regex"].checked ? DOM["#save-url-type-regex"].value : DOM["#save-url-type-exact"].checked ? DOM["#save-url-type-exact"].value : "";
        console.log("saveTest() - sending message to check: url=" + instance.url + ", save=" + JSON.stringify(save));
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkSave", url: instance.url, save: save});
        console.log("saveTest() - response received from check:");
        console.log(JSON.stringify(response));
        // We need to make an exception for the Increment URL action + Exact Save type because of how complex the rules are. It will automatically always work anyway, since the Save URL isn't used in that scenario
        const success = (response && response.matches) || ((_.scrollAction === "increment" || _.scrollAction === "decrement") && save.type === "exact");
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
   * Called if the user modifies the next or prev inputs, like changing the selector rule for the next link.
   * The Popup will ask the content script to re-check the page to find the next or prev link using the new inputs.
   *
   * @param action the action (next or prev)
   * @param delay  (boolean) whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @param focus  the DOM element to focus on
   * @private
   */
  function checkNextPrev(action, delay, focus) {
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("next-prev-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.nextPrev);
    timeouts.nextPrev = setTimeout(function() {
      clearTimeout(timeouts.nextPrev2);
      DOM["#next-prev-result-loading"].style.display = "block";
      DOM["#next-prev-result-success"].style.display = "none";
      DOM["#next-prev-result-error"].style.display = "none";
      timeouts.nextPrev2 = setTimeout(async function() {
        console.log("nextPrev() - action=" + action + ", delay=" + delay + ", focus=" + focus);
        const type = DOM["#" + action + "-type-xpath"].checked ? DOM["#" + action + "-type-xpath"].value : DOM["#" + action + "-type-selector"].value;
        const selector = DOM["#" + action + "-selector-input"].value;
        const xpath = DOM["#" + action + "-xpath-input"].value;
        const property = DOM["#" + action + "-property-input"].value ? DOM["#" + action + "-property-input"].value.split(".").filter(Boolean) : [];
        const keywordsEnabled = DOM["#" + action + "-keywords-enabled-input"].checked;
        const keywords = _[action + "Keywords"];
        console.log("nextPrev() - sending message to check: type=" + type + ", selector=" + selector + ", xpath="+ xpath + ", property=" + property + ", keywordsEnabled=" + keywordsEnabled + ", keywords=" + keywords);
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkNextPrev", type: type, selector: selector, xpath: xpath, property: property, keywordsEnabled: keywordsEnabled, keywords: keywords});
        console.log("nextPrev() - response received from check:");
        console.log(JSON.stringify(response));
        const success = response && response.url;
        DOM["#next-prev-result-loading"].style.display = "none";
        DOM["#next-prev-result-success"].style.display = success ? "block" : "none";
        DOM["#next-prev-result-error"].style.display = success ? "none" : "block";
        const details = chrome.i18n.getMessage(action + "_rule_label");
        // + " (" + chrome.i18n.getMessage(type + "_label") + ")";
        if (success) {
          DOM["#next-prev-result-message-success"].textContent = chrome.i18n.getMessage("next_prev_result_message_success").replace("?", chrome.i18n.getMessage(action + "_label"));
          if (response.method === "selector" || response.method === "xpath") {
            DOM["#next-prev-result-details-success"].textContent = details;
            DOM["#next-prev-result-details-success"].setAttribute("aria-label", response.rule);
          } else if (response.method === "keyword") {
            DOM["#next-prev-result-details-success"].textContent = response.method + " " + response.keyword;
            DOM["#next-prev-result-details-success"].setAttribute("aria-label", response.element + "." + (response.relationship !== "self" ? response.relationship + "." : "") + (response.property ? response.property : response.type) + " " + response.subtype + " " + response.keyword);
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
        if (focus) {
          DOM["#next-prev-url-textarea"].focus();
        }
      }, delay ? 1000 : 0);
    }, delay ? 1000 : 0);
  }

  /**
   * Called if the user modifies the Append Element inputs, like changing the Page Element rule to find the elements.
   * The Popup will ask the content script to re-check the page to find the elements using the new inputs.
   *
   * @param delay (boolean) whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @private
   */
  function checkScrollElement(delay) {
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("scroll-element-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.scrollElement);
    timeouts.scrollElement = setTimeout(function() {
      clearTimeout(timeouts.scrollElement2);
      DOM["#scroll-element-result-loading"].style.display = "block";
      DOM["#scroll-element-result-success"].style.display = "none";
      DOM["#scroll-element-result-error"].style.display = "none";
      // DOM["#scroll-element-iframe-form-field"].style.display = "none";
      timeouts.scrollElement2 = setTimeout(async function() {
        console.log("scrollElement() - delay=" + delay);
        const scrollElementType = DOM["#scroll-element-type-xpath"].checked ? DOM["#scroll-element-type-xpath"].value : DOM["#scroll-element-type-selector"].value;
        const scrollElementRule = DOM["#scroll-element-rule-input"].value;
        const scrollElementInsertRule = DOM["#scroll-element-insert-rule-input"].value;
        console.log("scrollElement() - sending message to check: scrollElementType=" + scrollElementType + ", pageElementRule=" + scrollElementRule + ", insertBeforeRule="+ scrollElementInsertRule);
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkScrollElement", scrollElementType: scrollElementType, scrollElementRule: scrollElementRule, scrollElementInsertRule: scrollElementInsertRule});
        console.log("scrollElement() - response received from check:");
        console.log(JSON.stringify(response));
        const success = response && response.found;
        DOM["#scroll-element-result-loading"].style.display = "none";
        DOM["#scroll-element-result-success"].style.display = success ? "block" : "none";
        DOM["#scroll-element-result-error"].style.display = success ? "none" : "block";
        // DOM["#scroll-element-iframe-form-field"].style.display = _.scrollAppend === "keep" ? "none" : "";
        const details = chrome.i18n.getMessage("scroll_element_rule_label");
        // + " (" + chrome.i18n.getMessage(scrollElementType + "_label") + ")";
        if (success) {
          DOM["#scroll-element-result-message-success"].textContent = chrome.i18n.getMessage("scroll_element_result_message_success").replace("?", response.elementsLength);
          DOM["#scroll-element-result-details-success"].textContent = details;
          DOM["#scroll-element-result-details-success"].setAttribute("aria-label", chrome.i18n.getMessage("scroll_element_result_tooltip_success").replace("?1", response.parentNode).replace("?2", response.insertDetails));
        } else {
          DOM["#scroll-element-result-details-error"].textContent = details;
          DOM["#scroll-element-result-details-error"].setAttribute("aria-label", response && response.error ? response.error : chrome.i18n.getMessage("no_result_tooltip_error"));
        }
        MDC.linearProgresses.get("scroll-element-linear-progress").foundation_.setDeterminate(true);
        MDC.layout();
      }, delay ? 1000 : 0);
    }, delay ? 1000 : 0);
  }

  /**
   * Called if the user modifies the Button action inputs, like changing the Button rule to find the button.
   * The Popup will ask the content script to re-check the page to find the button using the new inputs.
   *
   * @param delay (boolean) whether to add a small timeout delay when re-checking; we enforce a delay if the user is typing, otherwise there is no delay when the extension call this explicitly
   * @private
   */
  function checkButton(delay) {
    // TODO: This "double timeout" is so we don't show the "Loading" as soon as the user starts typing, but this is confusing and should be refactored into a better event listener
    MDC.linearProgresses.get("button-linear-progress").foundation_.setDeterminate(false);
    clearTimeout(timeouts.button);
    timeouts.button = setTimeout(function() {
      clearTimeout(timeouts.button2);
      DOM["#button-result-loading"].style.display = "block";
      DOM["#button-result-success"].style.display = "none";
      DOM["#button-result-error"].style.display = "none";
      timeouts.button2 = setTimeout(async function() {
        console.log("button() - delay=" + delay);
        const buttonType = DOM["#button-type-xpath"].checked ? DOM["#button-type-xpath"].value : DOM["#button-type-selector"].value;
        const buttonRule = DOM["#button-rule-input"].value;
        const buttonMethod = MDC.selects.get("button-method-select").value;
        console.log("button() - sending message to check: buttonType=" + buttonType + ", buttonRule=" + buttonRule + ", buttonMethod="+ buttonMethod);
        const response = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "checkButton", buttonType: buttonType, buttonRule: buttonRule, buttonMethod: buttonMethod});
        console.log("button() - response received from check:");
        console.log(JSON.stringify(response));
        const success = response && response.found && response.clickable;
        DOM["#button-result-loading"].style.display = "none";
        DOM["#button-result-success"].style.display = success ? "block" : "none";
        DOM["#button-result-error"].style.display = success ? "none" : "block";
        const details = chrome.i18n.getMessage("button_rule_label");
        // + " (" + chrome.i18n.getMessage(buttonType + "_label") + ")";
        if (success) {
          DOM["#button-result-details-success"].textContent = details;
          DOM["#button-result-details-success"].setAttribute("aria-label", chrome.i18n.getMessage("button_result_tooltip_success").replace("?", response.buttonNode));
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
         (action === "off" && items.on)) {
      UI.clickHoverCss(this, "hvr-push-click");
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "performAction", action: action, caller: "popupClickActionButton"});
      // Update the Popup's local items cache on state to false while this window is still open. The storage items will be updated in performAction so we don't have to do it here
      if (action === "off") {
        items.on = false;
        // TODO: Should we set the instance.enabled to false here?
        // TODO: Should we close the snackbar saying it was activated in case the snackbar opened up?
        // MDC.snackbars.get("popup-snackbar").close();
      }
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
    DOM["#page-number"].textContent = "Page " + instance.currentPage + " / " + instance.totalPages;
    DOM["#save-url-icon-title"].textContent = instance.saveFound && instance.saveType ? chrome.i18n.getMessage("save_url_" + instance.saveType + "_icon_title") + " " + instance.saveURL : "";
    DOM["#save-url-icon"].style.display = instance.saveFound ? "" : "none";
    DOM["#whitelist-icon"].style.display = !instance.saveFound && instance.whitelistFound ? "" : "none";
    // Note: We still store the whitelist URL in saveURL
    DOM["#whitelist-icon-title"].textContent = instance.whitelistFound && instance.saveURL ? chrome.i18n.getMessage("whitelist_icon_title")  + " " + instance.saveURL : "";
    DOM["#database-icon"].style.display = !instance.saveFound && !instance.whitelistFound && instance.databaseFound ? "" : "none";
    DOM["#database-icon-title"].textContent = instance.databaseFound && instance.databaseURL ? chrome.i18n.getMessage("database_icon_title") + " " + instance.databaseURL : "";
    DOM["#auto-slideshow-icon"].style.display = instance.autoEnabled && instance.autoSlideshow ? "" : "none";
    DOM["#shuffle-urls-icon"].style.display = instance.enabled && instance.shuffleURLs ? "" : "none";
    DOM["#down-button"].style.display = "";
    DOM["#up-button"].style.display = "";
    DOM["#down-button"].style.opacity = DOM["#up-button"].style.opacity = instance.enabled ? 1 : 0.2;
    // DOM["#down-button"].style.display = DOM["#up-button"].style.display = instance.enabled ? "" : "none";
    DOM["#off-button"].style.opacity = items.on ? 1 : 0.2;
    // DOM["#power-button-title"].textContent = chrome.i18n.getMessage("power_" + (items.on ? "off" : "on") + "_button_title");
    DOM["#auto-button"].style.display = instance.autoEnabled ? "" : "none";
    DOM["#auto-button"].children[0].setAttribute("xlink:href", "../lib/fontawesome.svg#solid-" + (instance.autoPaused ? "play-circle" : "pause-circle"));
    DOM["#auto-button-title"].textContent = chrome.i18n.getMessage("auto_" + (instance.autoPaused ? "resume" : "pause") + "_button_title");
  }

  /**
   * Updates the setup input properties. This method is called when the popup loads or when the instance is updated.
   *
   * @param minimal if true, only update a minimal part of the setup, if false update everything
   * @param getInstance if true, gets the instance again from the extension
   * @private
   */
  async function updateSetup(minimal, getInstance) {
    console.log("updateSetup() - minimal=" + minimal + ", getInstance=" + getInstance);
    // We need to make we have the most up-to-date copy of the actual instance. It may have changed if the user scrolled while the Popup was open (e.g. currentPage, totalPages)
    if (getInstance) {
      instance = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "getInstance"});
    }
    // // Chrome
    // DOM["#manifest-version"].textContent = chrome.runtime.getManifest().version;
    // Saved URL Setup
    if (instance.saveFound) {
      DOM["#save-url-input"].checked = true;
      DOM["#save-url-button-icon"].children[0].setAttribute("xlink:href", "../lib/fontawesome.svg#solid-heart");
    }
    DOM["#save-title-textarea"].value = instance.saveTitle ? instance.saveTitle : tabs[0].title;
    DOM["#save-url-textarea"].value = instance.saveURL;
    DOM["#save-url-type-pattern"].checked = instance.saveType === "pattern";
    DOM["#save-url-type-regex"].checked = instance.saveType === "regex";
    DOM["#save-url-type-exact"].checked = instance.saveType === "exact";
    // Next Prev Setup
    DOM["#next-type-selector"].checked = instance.nextType === "selector";
    DOM["#next-type-xpath"].checked = instance.nextType === "xpath";
    DOM["#next-selector-input"].value = instance.nextSelector;
    DOM["#next-xpath-input"].value = instance.nextXpath;
    DOM["#next-selector-text-field"].style.display = instance.nextType === "selector" ? "" : "none";
    DOM["#next-xpath-text-field"].style.display = instance.nextType === "xpath" ? "" : "none";
    DOM["#next-property-input"].value = instance.nextProperty ? instance.nextProperty.join(".") : "";
    DOM["#next-keywords-enabled-input"].checked = instance.nextKeywordsEnabled;
    DOM["#prev-type-selector"].checked = instance.prevType === "selector";
    DOM["#prev-type-xpath"].checked = instance.prevType === "xpath";
    DOM["#prev-selector-input"].value = instance.prevSelector;
    DOM["#prev-xpath-input"].value = instance.prevXpath;
    DOM["#prev-selector-text-field"].style.display = instance.prevType === "selector" ? "" : "none";
    DOM["#prev-xpath-text-field"].style.display = instance.prevType === "xpath" ? "" : "none";
    DOM["#prev-property-input"].value = instance.prevProperty ? instance.prevProperty.join(".") : "";
    DOM["#prev-keywords-enabled-input"].checked = instance.prevKeywordsEnabled;
    // Increment Decrement Setup
    DOM["#url-textarea"].value = instance.url;
    // TODO: Investigate why we need to set focus for the url textarea here as we are doing it already in changeAction()
    DOM["#url-textarea"].setSelectionRange(instance.selectionStart, instance.selectionStart + instance.selection.length);
    DOM["#url-textarea"].focus();
    DOM["#selection-input"].value = instance.selection;
    DOM["#selection-start-input"].value = instance.selectionStart;
    DOM["#shuffle-urls-input"].checked = instance.shuffleURLs;
    // Button Setup
    MDC.selects.get("button-method-select").value = instance.buttonMethod;
    DOM["#button-rule-input"].value = instance.buttonRule;
    DOM["#button-type-selector"].checked = instance.buttonType === "selector";
    DOM["#button-type-xpath"].checked = instance.buttonType === "xpath";
    DOM["#button-scroll-pixels-input"].value = instance.buttonScrollPixels;
    // List Setup
    DOM["#list-domain"].textContent = instance.locationOrigin;
    DOM["#list-textarea"].value = instance.list;
    // Scroll Append Setup (Iframe, Element, Media handled below minimal in MDC.selects?)
    DOM["#scroll-wrap-first-page-input"].checked = instance.scrollWrapFirstPage;
    DOM["#scroll-height-wait-iframe-input"].value = instance.scrollHeightWait;
    DOM["#scroll-height-wait-element-input"].value = instance.scrollHeightWait;
    DOM["#scroll-height-wait-element"].className = instance.scrollElementIframe ? "display-block" : "display-none";
    DOM["#scroll-element-rule-input"].value = instance.scrollElementRule;
    DOM["#scroll-element-insert-rule-input"].value = instance.scrollElementInsertRule;
    DOM["#scroll-element-type-selector"].checked = instance.scrollElementType === "selector";
    DOM["#scroll-element-type-xpath"].checked = instance.scrollElementType === "xpath";
    DOM["#scroll-element-iframe-input"].checked = instance.scrollElementIframe;
    // Scripts and Styles Setup
    DOM["#scroll-append-scripts-input"].checked = instance.scrollAppendScripts;
    DOM["#scroll-append-styles-input"].checked = instance.scrollAppendStyles;
    DOM["#scroll-append-custom-styles-input"].checked = instance.scrollAppendCustomStyles;
    DOM["#scroll-append-custom-styles-textarea"].value = instance.scrollAppendCustomStylesValue;
    DOM["#scroll-append-custom-styles"].className = instance.scrollAppendCustomStyles ? "display-block" : "display-none";
    DOM["#scroll-lazy-load-input"].checked = instance.scrollLazyLoad;
    DOM["#scroll-lazy-load"].className = instance.scrollLazyLoad ? "display-inline" : "display-none";
    DOM["#scroll-lazy-load-mode-auto"].checked = instance.scrollLazyLoadMode !== "manual";
    DOM["#scroll-lazy-load-mode-manual"].checked = instance.scrollLazyLoadMode === "manual";
    DOM["#scroll-lazy-load-attribute"].className = instance.scrollLazyLoadMode === "manual" ? "display-block" : "display-none";
    DOM["#scroll-lazy-load-attribute-source-input"].value = instance.scrollLazyLoadAttributeSource;
    DOM["#scroll-lazy-load-attribute-destination-input"].value = instance.scrollLazyLoadAttributeDestination;
    // If minimal (e.g. just switching from controls to setup), no need to recalculate the below again, so just return
    if (minimal) {
      return;
    }
    // Perform on-demand listeners (nextPrev, scrollElement, and button). Perform them in this order (nextPrev last) due to nextPrev focus textarea
    checkSave(false);
    checkScrollElement(false);
    checkButton(false);
    if (_.scrollAction === "next" || _.scrollAction === "prev") {
      checkNextPrev(_.scrollAction, false, true);
    }
    // Convert number base to string just in case (can't set number as value, e.g. 10 instead of "10")
    MDC.selects.get("base-select").value = instance.base + "";
    MDC.selects.get("scroll-media-type-select").value = instance.scrollMediaType;
    DOM["#interval-input"].value = instance.interval;
    DOM["#error-skip-input"].value = instance.errorSkip;
    DOM["#base-case"].className = instance.base > 10 ? "display-block" : "display-none";
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
    // Multi Buttons are SVGs, so use className.baseVal instead of just className
    DOM["#multi-button-1"].className.baseVal = instance.multiEnabled && instance.multiCount >= 1 ? "" : "disabled";
    DOM["#multi-button-2"].className.baseVal = instance.multiEnabled && instance.multiCount >= 2 ? "" : "disabled";
    DOM["#multi-button-3"].className.baseVal = instance.multiEnabled && instance.multiCount >= 3 ? "" : "disabled";
    // Auto Setup:
    MDC.switches.get("auto-switch").checked = instance.autoEnabled || (items.autoStart && !instance.enabled);
    DOM["#auto"].className = instance.autoEnabled || (items.autoStart && !instance.enabled) ? "display-block" : "display-none";
    DOM["#auto-behavior-form-field"].className = instance.autoSlideshow ? "mdc-form-field" : "visibility-hidden";
    // TODO: Use instance.autoTimesOriginal instead? Sometimes getting undefined value here...
    DOM["#auto-times-input"].value = instance.autoTimes;
    DOM["#auto-seconds-input"].value = instance.autoSeconds;
    DOM["#auto-badge-input"].checked = instance.autoBadge === "times";
    DOM["#auto-slideshow-input"].checked = instance.autoSlideshow;
    DOM["#auto-behavior-input"].checked = instance.autoBehavior === "smooth";
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
    // Need this to reset the URLs array if changing the selection or adjusting other properties:
    _.urls = [];
    const precalculateProps = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "incrementDecrementPrecalculateURLs", instance: _});
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
      // chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", tabId: tabs[0].id, badge: "auto", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
    } else {
      // TODO: We need to cover the use case when Auto WAS toggled on, but no longer isn't. Therefore, for now, we always ask to stop the AutoTimer, but perhaps we should only do this when we know Auto was previously toggled on?
      chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "stopAutoTimer", caller: "popup"});
      chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", tabId: tabs[0].id, badge: "on", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
    }
    // Save Default Settings
    // Note: We only save action and append mode settings if items.dynamicSettings is enabled
    // Note: Next Link and Increment URL settings aren't currently saved because their defaults can be set in the Options
    // Note: Only save scrollAppend and scrollElement settings if this is NOT a database URL and the scroll append is element. We only want to save these settings if we're 100% sure the user has manually set this append mode
    const saveElement = items.dynamicSettings && !instance.databaseFound && instance.scrollAppend === "element";
    chrome.storage.local.set({
      // Scroll
      "scrollAction": items.dynamicSettings ? instance.scrollAction : items.scrollAction,
      // Note: We don't want to save the scrollAppend to be element if this is a database url
      "scrollAppend": items.dynamicSettings && !instance.databaseFound ? instance.scrollAppend : items.scrollAppend,
      "scrollWrapFirstPage": items.dynamicSettings ? instance.scrollWrapFirstPage : items.scrollWrapFirstPage,
      "scrollHeightWait": items.dynamicSettings ? instance.scrollHeightWait : items.scrollHeightWait,
      "scrollMediaType": items.dynamicSettings ? instance.scrollMediaType : items.scrollMediaType,
      "scrollElementRule": saveElement ? instance.scrollElementRule : items.scrollElementRule,
      "scrollElementInsertRule": saveElement ? instance.scrollElementInsertRule : items.scrollElementInsertRule,
      "scrollElementType": saveElement ? instance.scrollElementType : items.scrollElementType,
      "scrollElementIframe": saveElement ? instance.scrollElementIframe : items.scrollElementIframe,
      // Button
      "buttonType": items.dynamicSettings ? instance.buttonType : items.buttonType,
      "buttonRule": items.dynamicSettings ? instance.buttonRule : items.buttonRule,
      "buttonMethod": items.dynamicSettings ? instance.buttonMethod : items.buttonMethod,
      "buttonScrollPixels": items.dynamicSettings ? instance.buttonScrollPixels : items.buttonScrollPixels,
      // Auto
      "autoAction": instance.autoAction,
      "autoSeconds": instance.autoSeconds,
      "autoTimes": instance.autoTimesOriginal,
      "autoBadge": instance.autoBadge,
      "autoSlideshow": instance.autoSlideshow,
      "autoBehavior": instance.autoBehavior
    });
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
      _.saveFound = DOM["#save-url-input"].checked;
      _.saveTitle = DOM["#save-title-textarea"].value;
      _.saveURL = DOM["#save-url-textarea"].value;
      _.saveType = DOM["#save-url-type-pattern"].checked ? DOM["#save-url-type-pattern"].value : DOM["#save-url-type-regex"].checked ? DOM["#save-url-type-regex"].value : DOM["#save-url-type-exact"].checked ? DOM["#save-url-type-exact"].value : "";
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
      _.errorSkip = +DOM["#error-skip-input"].value;
      // Note: _.multi is set in clickMulti()
      _.multiCount = +DOM["#multi-count"].value;
      _.multiEnabled = _.multiCount >= 2 && _.multiCount <= 3;
      _.shuffleURLs = DOM["#shuffle-urls-input"].checked && (_.scrollAction === "increment" || _.scrollAction === "decrement" || _.scrollAction === "list");
      // Next Prev:
      _.nextSelector = DOM["#next-selector-input"].value;
      _.nextXpath = DOM["#next-xpath-input"].value;
      _.nextProperty = DOM["#next-property-input"].value ? DOM["#next-property-input"].value.split(".").filter(Boolean) : [];
      _.nextType = DOM["#next-type-xpath"].checked ? DOM["#next-type-xpath"].value : DOM["#next-type-selector"].value;
      _.nextKeywordsEnabled = DOM["#next-keywords-enabled-input"].checked;
      _.prevSelector = DOM["#prev-selector-input"].value;
      _.prevXpath = DOM["#prev-xpath-input"].value;
      _.prevProperty = DOM["#prev-property-input"].value ? DOM["#prev-property-input"].value.split(".").filter(Boolean) : [];
      _.prevType = DOM["#prev-type-xpath"].checked ? DOM["#prev-type-xpath"].value : DOM["#prev-type-selector"].value;
      _.prevKeywordsEnabled = DOM["#prev-keywords-enabled-input"].checked;
      // Button
      _.buttonType = DOM["#button-type-xpath"].checked ? DOM["#button-type-xpath"].value : DOM["#button-type-selector"].value;
      _.buttonRule = DOM["#button-rule-input"].value;
      _.buttonMethod = MDC.selects.get("button-method-select").value;
      _.buttonScrollPixels = +DOM["#button-scroll-pixels-input"].value;
      // List
      _.listEnabled = _.scrollAction === "list";
      _.list = DOM["#list-textarea"].value;
      _.listArray = _.list.match(/[^\r\n]+/g);
      // Append (scrollAppend is normally set on the change listener, but need to re-set in case action is button)
     // _.scrollAppend = _.scrollAction === "button" ? "none" : _.scrollAppend;
      _.scrollAppendThresholdPixels = _.scrollAction === "button" ?  _.buttonScrollPixels : _.scrollAppendThresholdPixels;
      _.scrollWrapFirstPage = DOM["#scroll-wrap-first-page-input"].checked;
      _.scrollHeightWait = _.scrollAppend === "iframe" ? +DOM["#scroll-height-wait-iframe-input"].value : +DOM["#scroll-height-wait-element-input"].value;
      _.scrollElementRule = DOM["#scroll-element-rule-input"].value;
      _.scrollElementInsertRule = DOM["#scroll-element-insert-rule-input"].value;
      _.scrollElementType = DOM["#scroll-element-type-xpath"].checked ? DOM["#scroll-element-type-xpath"].value : DOM["#scroll-element-type-selector"].value;
      _.scrollElementIframe = DOM["#scroll-element-iframe-input"].checked;
      _.scrollMediaType = MDC.selects.get("scroll-media-type-select").value;
      _.scrollAppendScripts = DOM["#scroll-append-scripts-input"].checked;
      _.scrollAppendStyles = DOM["#scroll-append-styles-input"].checked;
      _.scrollAppendCustomStyles = DOM["#scroll-append-custom-styles-input"].checked;
      _.scrollAppendCustomStylesValue = DOM["#scroll-append-custom-styles-textarea"].value;
      _.scrollLazyLoad = DOM["#scroll-lazy-load-input"].checked;
      _.scrollLazyLoadMode = DOM["#scroll-lazy-load-mode-manual"].checked ? DOM["#scroll-lazy-load-mode-manual"].value : DOM["#scroll-lazy-load-mode-auto"].value;
      _.scrollLazyLoadAttributeSource = DOM["#scroll-lazy-load-attribute-source-input"].value;
      _.scrollLazyLoadAttributeDestination = DOM["#scroll-lazy-load-attribute-destination-input"].value;
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
      _.autoAction = _.scrollAction;
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
    // Save Errors
    if (_.saveFound) {
      if (!_.saveURL) { errors.push(chrome.i18n.getMessage("save_url_error")); }
      if (!_.saveType) { errors.push(chrome.i18n.getMessage("save_type_error")); }
    }
    // Next Prev Errors
    // TODO: Commenting out this validation check for the time being in case the user wants to override saving a URL
    // if (_.scrollAction === "next" || _.scrollAction === "prev") {
    //   if (!DOM["#next-prev-url-textarea"].value) { errors.push(chrome.i18n.getMessage("next_prev_empty_error")) }
    // }
    // Increment Decrement Errors
    if (_.scrollAction === "increment" || _.scrollAction === "decrement") {
      const validateSelection = await Promisify.tabsSendMessage(tabs[0].id, {receiver: "contentscript", greeting: "incrementDecrementValidateSelection", instance: _});
      if (caller === "accept" && _.multiCount === 1) { errors.push(chrome.i18n.getMessage("multi_count_error")); }
      if (!_.selection) { errors.push(chrome.i18n.getMessage("selection_blank_error")); }
      if (!_.url.includes(_.selection)) { errors.push(chrome.i18n.getMessage("selection_notinurl_error")); }
      if (_.selectionStart < 0 || _.url.substr(_.selectionStart, _.selection.length) !== _.selection) { errors.push(chrome.i18n.getMessage("selectionstart_invalid_error")); }
      // Don't validate selection in accept if multi range enabled due to brackets
      if (!(caller !== "multi" && _.multiRangeEnabled) && validateSelection) { errors.push(validateSelection); }
      if (_.interval <= Number.MIN_SAFE_INTEGER || _.interval >= Number.MAX_SAFE_INTEGER) { errors.push(chrome.i18n.getMessage("interval_invalid_error")); }
      if (_.errorSkip < 0 || _.errorSkip > 100) { errors.push(chrome.i18n.getMessage("error_skip_invalid_error")); }
      if (_.multiEnabled && _.saveFound) { errors.push(chrome.i18n.getMessage("multi_save_error")); }
    }
    // Button Errors
    if (_.scrollAction === "button") {
      if (_.buttonScrollPixels < 0 || _.buttonScrollPixels > 10000) { errors.push(chrome.i18n.getMessage("button_scroll_pixels_error")); }
      if (_.autoEnabled && _.autoSlideshow) { errors.push(chrome.i18n.getMessage("button_auto_slideshow_error")); }
    }
    // List Errors
    // TODO: Validate that the list URLs all have the same origin as instance.locationOrigin?
    if (_.scrollAction === "list") {
      if (!_.list) { errors.push(chrome.i18n.getMessage("list_blank_error")); }
      if (!_.listArray || _.listArray.length <= 1) { errors.push(chrome.i18n.getMessage("list_newline_error")); }
    }
    // Scroll Errors
    if (caller === "accept") {
      if (_.scrollAppend === "media" && _.scrollAction !== "increment" && _.scrollAction !== "decrement" && _.scrollAction !== "list") { errors.push(chrome.i18n.getMessage("scroll_append_media_action_error")); }
      if (_.scrollAppend === "keep") { errors.push(chrome.i18n.getMessage("scroll_append_keep_error")); }
    }
    // Auto Errors
    if (_.autoEnabled) {
      if (_.autoTimes < 1 || _.autoTimes > 1000) { errors.push(chrome.i18n.getMessage("auto_times_invalid_error")); }
      if (_.autoSeconds < 1 || _.autoSeconds > 3600) { errors.push(chrome.i18n.getMessage("auto_seconds_invalid_error")); }
    }
    // TODO: Test this more before forcing this isLocal check
    // Local file:// URL Errors
    // if (_.isLocal) {
    //   if (_.scrollAppend === "page" || _.scrollAppend === "iframe" || _.scrollAppend === "element") { errors.push(chrome.i18n.getMessage("local_url_append_error")); }
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
      const validated = JSON.parse(JSON.stringify({ "title": _.saveTitle })).title;
      _.saveTitle = title === validated ? title : "";
    } catch(e) {
      console.log("setup() - error saving tab title, e=" + e);
      _.saveTitle = "";
    }
    if (saveAction === "add" || saveAction === "edit") {
      // Exact URL - Increment Decrement Action-Specific Adjustments for saveURL and selectionEnd
      // Just noticed that this means what they enter in the Save URL text field is ignored! (this is a good thing)
      if (_.saveType === "exact" && (_.scrollAction === "increment" || _.scrollAction === "decrement")) {
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
  function messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=" + JSON.stringify(request));
    // Default response
    let response = {};
    switch (request.greeting) {
      case "updatePopupInstance":
        instance = request.instance;
        if (request.action === "off") {
          items.on = false;
        }
        updateControls();
        // TODO: Test this more. Don't update the setup if it's just a simple Down or Up Button click
        if (request.caller !== "popupClickActionButton" && request.action !== "down" && request.action !== "up") {
          updateSetup(false, false);
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
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) { if (!request || request.receiver !== "popup" || !request.instance || !instance || request.instance.tabId !== instance.tabId) { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });

  // Initialize Popup
  init();

})();