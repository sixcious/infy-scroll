/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * PickerUI manages the Picker UI Iframe window.
 */
const PickerUI = (() => {

  /**
   * Variables
   *
   * @param DOM      the DOM elements cache
   * @param items    the storage items cache
   * @param timeouts the reusable timeouts object that stores all named timeouts used on this page
   * @param name     the name of the extension running this script
   */
  const DOM = {};
  let items;
  let timeouts = {};
  let name;

  /**
   * Initializes the Popup window. This script is set to defer so the DOM is guaranteed to be parsed by this point.
   *
   * @private
   */
  async function init() {
    // If we don't have chrome, display an error message. Note: Firefox allows Private Window Installation, which is primarily the reason why we need this check (though less so in the Popup)
    if (typeof chrome === "undefined") {
      console.log("init() - error: chrome is undefined");
      document.getElementById("text").textContent = "The chrome object is undefined! This indicates a severe error as chrome is the base object in the Extension API.";
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
    // Add Event Listeners to the DOM elements
    DOM["#save-fab"].addEventListener("click", () => {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "savePicker" });
      MDC.openSnackbar(chrome.i18n.getMessage("saved_" + (document.body.id === "minimize" ? "minimized_label" : "label")));
    });
    DOM["#copy-fab"].addEventListener("click", () => {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "copyPicker" });
      MDC.openSnackbar(chrome.i18n.getMessage("copied_" + (document.body.id === "minimize" ? "minimized_label" : "label")), 4000);
    });
    MDC.chipsets.get("type-chip-set").chips.forEach(chip => chip.listen("click", function () {
      // Type chipset can either be selector, xpath, or property
      console.log("MDCChip:() type-chip-set - clicked " + this.id + ", action=" + this.dataset.action);
      MDC.chips.get(this.id).selected = true;
      const value = this.dataset.action;
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "type", value: value });
      DOM["#data-label"].textContent = value === "property" && DOM["#property-input"].value && DOM["#property-input"].value.trim() ? DOM["#property-input"].value : chrome.i18n.getMessage(value + "_label");
      // We only save the one pickerType if it's Element Picky; it doesn't make sense to save it in any of the others as they have different types already saved e.g. nextLinkType, buttonType
      if (name === "Element Picky") {
        Promisify.storageSet({"pickerType": value });
      }
    }));
    DOM["#minimize-button"].addEventListener("click", () => {
      // We toggle between minimize and maximize as there is only one button between the two
      const toggle = document.body.id === "minimize" ? "maximize" : "minimize";
      Promisify.runtimeSendMessage({receiver: "background", greeting: "minimizePicker", toggle: toggle });
      DOM["#minimize-svg"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#" + (toggle === "minimize" ? "expand" : "window-minimize"));
      DOM["#minimize-button"].setAttribute("aria-label", chrome.i18n.getMessage(document.body.id + "_button"));
      document.body.id = toggle;
      Promisify.storageSet({"pickerMinimize": toggle });
    });
    DOM["#move-button"].addEventListener("click", () => {
      // We toggle the corner based on what the current body dataset corner is: br > tr > tl > bl
      const corner = document.body.dataset.corner;
      const toggle = corner === "bottom-right" ? "top-right" : corner === "top-right" ? "top-left" : corner === "top-left" ? "bottom-left" : "bottom-right";
      Promisify.runtimeSendMessage({receiver: "background", greeting: "movePicker", corner: toggle });
      document.body.dataset.corner = toggle;
      Promisify.storageSet({"pickerCorner": toggle });
    });
    DOM["#close-button"].addEventListener("click", () => {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "closePicker" });
    });
    DOM["#options-button"].addEventListener("click", function () {
      const options = MDC.chipsets.get("type-chip-set").selectedChipIds[0].startsWith("property") ? "property" : "path";
      MDC.dialogs.get(options + "-dialog").open();
    });
    // Path Option Listeners
    DOM["#path-algorithm"].addEventListener("change", function (event) {
      const value = event.target.value;
      console.log("path-algorithm change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "algorithm", value: value});
      Promisify.storageSet({"pathAlgorithm": value});
    });
    DOM["#path-quote"].addEventListener("change", function (event) {
      const value = event.target.value;
      console.log("path-quote change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "quote", value: value});
      Promisify.storageSet({"pathQuote": value});
    });
    DOM["#path-optimized-input"].addEventListener("change", function () {
      const value = this.checked;
      console.log("path-optimized change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "optimized", value: value});
      Promisify.storageSet({"pathOptimized": value});
    });
    DOM["#path-js-input"].addEventListener("change", function () {
      const value = this.checked;
      console.log("path-js change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "js", value: value});
      Promisify.storageSet({"pathJs": value});
    });
    // Property Option Listeners
    DOM["#property-input"].addEventListener("input", function() {
      clearTimeout(timeouts["property-input"]);
      timeouts["property-input"] = setTimeout(function () {
        const value = DOM["#property-input"].value;
        console.log("property update() - value=" + value);
        Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "property", value: value});
        Promisify.storageSet({"elementProperty": value});
        DOM["#data-label"].textContent = value && value.trim() ? value : chrome.i18n.getMessage("property_label");
      }, 1000);
    });
    // Element List Buttons
    DOM["#element-parent-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "parent" }); });
    DOM["#element-child-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "child" }); });
    DOM["#element-next-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "next" }); });
    DOM["#element-previous-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "previous" }); });
    // DOM initialization classes
    DOM["#tips"].className = "display-block";
    DOM["#content"].className = "display-none";
    DOM["#footer"].className = "display-none";
    // Items
    items = await Promisify.storageGet();
    console.log("init() - items=");
    console.log(items);
    // If tooltips not enabled, disable them by removing their attribute
    if (items && !items.tooltipsEnabled) {
      for (const element of tooltips) {
        element.removeAttribute("aria-label");
        element.removeAttribute("aria-describedby");
        element.removeAttribute("data-balloon-pos");
        element.removeAttribute("data-balloon-length");
        element.classList.remove("tooltip", "tooltip-without-underline");
      }
    }
    // Picker Minimize
    document.body.id = items.pickerMinimize;
    DOM["#minimize-svg"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#" + (items.pickerMinimize === "minimize" ? "expand" : "window-minimize"));
    DOM["#minimize-button"].setAttribute("aria-label", chrome.i18n.getMessage((items.pickerMinimize === "minimize" ? "maximize" : "minimize") + "_button"));
    // Picker Corner
    document.body.dataset.corner = items.pickerCorner;
    // Options
    DOM["#path-algorithm-internal"].checked = items.pathAlgorithm === "internal";
    DOM["#path-algorithm-chromium"].checked = items.pathAlgorithm === "chromium";
    DOM["#path-quote-single"].checked = items.pathQuote === "single";
    DOM["#path-quote-double"].checked = items.pathQuote === "double";
    DOM["#path-optimized-input"].checked = items.pathOptimized;
    DOM["#path-js-input"].checked = items.pathJs;
    DOM["#property-input"].value = items.elementProperty;
    // App specific layout
    name = chrome.runtime.getManifest().name;
    if (name === "ElementPicky") {
      DOM["#save-fab-div"].style.display = "none";
      DOM["#picker-header"].style.display = "none";
      DOM["#header-svg"].style.width = "24px";
      DOM["#header-svg"].style.height = "24px";
      DOM["#header-svg"].style.marginTop = "6px";
      DOM["#type-chip-set"].style.left = "62px";
      DOM["#xpath-chip"].style.left = "100px";
      DOM["#options-button"].style.left = "342px";
    } else {
      DOM["#copy-fab-div"].style.display = "none";
      DOM["#property-chip"].style.display = "none";
      DOM["#path-js-form-field"].style.display = "none";
    }
    // Need to initialize the picker ui with the picker (e.g. next or element) and the starting rule type (Selector or XPath)
    Promisify.runtimeSendMessage({receiver: "background", greeting: "initPicker", algorithm: items.pathAlgorithm, quote: items.pathQuote, optimized: items.pathOptimized, js: items.pathJs, property: items.elementProperty, minimize: items.pickerMinimize, corner: items.pickerCorner });
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
    console.log("messageListener() - request=");
    console.log(request);
    // Default response
    let response = {};
    switch (request.greeting) {
      // There are two different times we get this call: when the picker is first initialized (for just the picker and type) and all other times to get all the element properties
      case "updatePickerUI":
        if (request.picker && request.type) {
          // We only do this the very first time the UI is opened and sends the initPicker message
          DOM["#picker-type"].textContent = chrome.i18n.getMessage("picker_" + request.picker);
          DOM["#data-label"].textContent = request.type === "property" && items.elementProperty && items.elementProperty.trim() ? items.elementProperty : chrome.i18n.getMessage(request.type + "_label");
          MDC.chips.get((request.type === "property" ? "property" : request.type === "xpath" ? "xpath" : "selector") + "-chip").selected = true;
        } else {
          // We do this for all successive calls (TODO: Can request.element be null here? saw an error show up once)
          DOM["#tips"].className = "display-none";
          DOM["#content"].className = "display-block";
          DOM["#footer"].className = "display-block";
          DOM["#element-current"].textContent = request.element.current;
          DOM["#element-parent"].textContent = request.element.parent;
          DOM["#element-child"].textContent = request.element.child;
          DOM["#element-next"].textContent = request.element.next;
          DOM["#element-previous"].textContent = request.element.previous;
          DOM["#data-value"].textContent = request.data;
        }
        break;
      default:
        break;
    }
    sendResponse(response);
  }

  // PickerUI Listeners
  // Message Listener: We need to return immediately if the function will be performing asynchronous work
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "picker-ui") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });

  // Initialize PickerUI
  init();

})();