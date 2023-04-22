/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * X stores the fields for the class as a shorter way to access them (e.g. X.foo).
 */
class X {

  /**
   * Fields
   *
   * @param {Object} DOM - the DOM elements cache
   * @param {Object} items - the storage items cache
   * @param {Object} timeouts - the reusable timeouts object that stores all named timeouts used on this page
   * @param {string} name - the name of the extension running this script
   */
  static DOM = {};
  static items;
  static timeouts = {};
  static name;

}

/**
 * PickerUI manages the Picker UI Iframe window.
 *
 * The Element Picker can be thought of as four components: Picker, PickerUI, HoverBox, and DOMPath.
 * PickerUI is the GUI that gives the user feedback on the element they picked and allows them to traverse the DOM.
 */
class PickerUI {

  /**
   * PickerUI initialization (IIFE).
   *
   * Initializes the Picker UI window. This script is set to defer so the DOM is guaranteed to be parsed by this point.
   *
   * Note: This function only runs one time.
   *
   * @see https://stackoverflow.com/a/61203517
   * @private
   */
  static #init = (async () => {
    // If we don't have chrome, display an error message. Note: Firefox allows Private Window Installation, which is primarily the reason why we need this check (though less so outside the Options screen)
    if (typeof chrome === "undefined") {
      console.log("init() - error: chrome is undefined");
      document.getElementById("text").textContent = "The chrome object is undefined! This indicates a severe error as chrome is the base object in the Browser API. Please report this issue on GitHub for assistance.";
      return;
    }
    const ids = document.querySelectorAll("[id]");
    const i18ns = document.querySelectorAll("[data-i18n]");
    const tooltips = document.querySelectorAll("[aria-label][aria-describedby='tooltip']");
    // Cache DOM elements
    for (const element of ids) {
      X.DOM["#" + element.id] = element;
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
    X.DOM["#save-fab"].addEventListener("click", () => {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "savePicker" });
      MDC.openSnackbar(chrome.i18n.getMessage("saved_" + (document.body.id === "minimize" ? "minimized_label" : "label")));
    });
    X.DOM["#copy-fab"].addEventListener("click", () => {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "copyPicker" });
      MDC.openSnackbar(chrome.i18n.getMessage("copied_" + (document.body.id === "minimize" ? "minimized_label" : "label")), 4000);
    });
    X.DOM["#data-copy"].addEventListener("click", () => {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "copyPicker" });
      MDC.openSnackbar(chrome.i18n.getMessage("copied_" + (document.body.id === "minimize" ? "minimized_label" : "label")), 4000);
    });
    MDC.chipsets.get("type-chip-set").chips.forEach(chip => chip.listen("click", function () {
      // Type chipset can either be selector, xpath, or property
      console.log("MDCChip:() type-chip-set - clicked " + this.id + ", action=" + this.dataset.action);
      MDC.chips.get(this.id).selected = true;
      const value = this.dataset.action;
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "type", value: value });
      X.DOM["#data-label"].textContent = value === "property" && X.DOM["#property-input"].value && X.DOM["#property-input"].value.trim() ? X.DOM["#property-input"].value : chrome.i18n.getMessage(value + "_label");
      // We only save the one pickerType if it's Element Picky; it doesn't make sense to save it in any of the others as they have different types already saved e.g. nextLinkType, clickElementType
      if (X.name === "Element Picky") {
        Promisify.storageSet({"pickerType": value });
      }
    }));
    X.DOM["#resize-button"].addEventListener("click", () => {
      // We toggle the size between minimize and maximize as there is only one button between the two
      const size = document.body.id === "minimize" ? "maximize" : "minimize";
      Promisify.runtimeSendMessage({receiver: "background", greeting: "resizePicker", size: size });
      X.DOM["#resize-svg"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#" + (size === "minimize" ? "expand" : "window-minimize"));
      X.DOM["#resize-button"].setAttribute("aria-label", chrome.i18n.getMessage(document.body.id + "_button"));
      document.body.id = size;
      Promisify.storageSet({"pickerSize": size });
    });
    X.DOM["#move-button"].addEventListener("click", () => {
      // We toggle the corner based on what the current body dataset corner is: br > tr > tl > bl
      let corner = document.body.dataset.corner;
      corner = corner === "bottom-right" ? "top-right" : corner === "top-right" ? "top-left" : corner === "top-left" ? "bottom-left" : "bottom-right";
      Promisify.runtimeSendMessage({receiver: "background", greeting: "movePicker", corner: corner });
      document.body.dataset.corner = corner;
      Promisify.storageSet({"pickerCorner": corner });
    });
    X.DOM["#close-button"].addEventListener("click", () => {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "closePicker" });
    });
    X.DOM["#options-button"].addEventListener("click", function () {
      const options = MDC.chipsets.get("type-chip-set").selectedChipIds[0].startsWith("property") ? "property" : "path";
      MDC.dialogs.get(options + "-dialog").open();
    });
    // Path Option Listeners
    X.DOM["#path-algorithm"].addEventListener("change", function (event) {
      const value = event.target.value;
      console.log("path-algorithm change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "algorithm", value: value});
      Promisify.storageSet({"pathAlgorithm": value});
    });
    X.DOM["#path-quote"].addEventListener("change", function (event) {
      const value = event.target.value;
      console.log("path-quote change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "quote", value: value});
      Promisify.storageSet({"pathQuote": value});
    });
    X.DOM["#path-optimized-input"].addEventListener("change", function () {
      const value = this.checked;
      console.log("path-optimized change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "optimized", value: value});
      Promisify.storageSet({"pathOptimized": value});
    });
    X.DOM["#path-js-input"].addEventListener("change", function () {
      const value = this.checked;
      console.log("path-js change() - value=" + value);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "js", value: value});
      Promisify.storageSet({"pathJs": value});
    });
    // Property Option Listeners
    X.DOM["#property-input"].addEventListener("input", function() {
      clearTimeout(X.timeouts["property-input"]);
      X.timeouts["property-input"] = setTimeout(function () {
        const value = X.DOM["#property-input"].value;
        console.log("property update() - value=" + value);
        Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "property", value: value});
        Promisify.storageSet({"elementProperty": value});
        X.DOM["#data-label"].textContent = value && value.trim() ? value : chrome.i18n.getMessage("property_label");
      }, 1000);
    });
    // Element List Buttons
    X.DOM["#element-parent-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "parent" }); });
    X.DOM["#element-child-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "child" }); });
    X.DOM["#element-next-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "next" }); });
    X.DOM["#element-previous-button"].addEventListener("click", () => { Promisify.runtimeSendMessage({receiver: "background", greeting: "changePicker", change: "previous" }); });
    // DOM initialization classes
    X.DOM["#tips"].className = "display-block";
    X.DOM["#content"].className = "display-none";
    X.DOM["#footer"].className = "display-none";
    // Items
    X.items = await Promisify.storageGet(undefined, undefined, ["databaseAP", "databaseIS", "saves"]);
    console.log("init() - items=");
    console.log(X.items);
    // Set the theme as soon as possible after getting the items
    document.documentElement.dataset.theme = X.items.theme;
    // If tooltips not enabled, disable them by removing their attribute
    if (X.items && !X.items.tooltipsEnabled) {
      for (const element of tooltips) {
        element.removeAttribute("aria-label");
        element.removeAttribute("aria-describedby");
        element.removeAttribute("data-balloon-pos");
        element.removeAttribute("data-balloon-length");
        element.classList.remove("tooltip", "tooltip-without-underline");
      }
    }
    // Picker Size
    document.body.id = X.items.pickerSize;
    X.DOM["#resize-svg"].children[0].setAttribute("href", "../lib/fontawesome/solid.svg#" + (X.items.pickerSize === "minimize" ? "expand" : "window-minimize"));
    X.DOM["#resize-button"].setAttribute("aria-label", chrome.i18n.getMessage((X.items.pickerSize === "minimize" ? "maximize" : "minimize") + "_button"));
    // Picker Corner
    document.body.dataset.corner = X.items.pickerCorner;
    // Options
    X.DOM["#path-algorithm-internal"].checked = X.items.pathAlgorithm === "internal";
    X.DOM["#path-algorithm-chromium"].checked = X.items.pathAlgorithm === "chromium";
    X.DOM["#path-quote-single"].checked = X.items.pathQuote === "single";
    X.DOM["#path-quote-double"].checked = X.items.pathQuote === "double";
    X.DOM["#path-optimized-input"].checked = X.items.pathOptimized;
    X.DOM["#path-js-input"].checked = X.items.pathJs;
    X.DOM["#property-input"].value = X.items.elementProperty;
    // App specific layout
    X.name = chrome.runtime.getManifest().name;
    if (X.name === "ElementPicky") {
      X.DOM["#save-fab-div"].style.display = "none";
      X.DOM["#picker-header"].style.display = "none";
      X.DOM["#header-svg"].style.width = "24px";
      X.DOM["#header-svg"].style.height = "24px";
      X.DOM["#header-svg"].style.marginTop = "6px";
      X.DOM["#type-chip-set"].style.left = "62px";
      X.DOM["#xpath-chip"].style.left = "100px";
      X.DOM["#options-button"].style.left = "342px";
    } else {
      X.DOM["#copy-fab-div"].style.display = "none";
      X.DOM["#property-chip"].style.display = "none";
      X.DOM["#path-js-form-field"].style.display = "none";
    }
    // PickerUI Listeners
    // Message Listener: We need to return immediately if the function will be performing asynchronous work
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "picker-ui") { return; } PickerUI.#messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });
    // // Note: If we wanted to pass in the correct border color for the iframe to Picker, we could do so like this:
    // const border = getComputedStyle(document.documentElement)?.getPropertyValue("--mdc-theme-on-surface");
    // Need to initialize the picker ui with the picker (e.g. next or element) and the starting path type (Selector or XPath)
    Promisify.runtimeSendMessage({receiver: "background", greeting: "initPicker", algorithm: X.items.pathAlgorithm, quote: X.items.pathQuote, optimized: X.items.pathOptimized, js: X.items.pathJs, property: X.items.elementProperty, size: X.items.pickerSize, corner: X.items.pickerCorner });
  })();

  /**
   * Listen for requests from chrome.runtime.sendMessage (e.g. Background).
   *
   * @param {Object} request - the request containing properties to parse (e.g. greeting message)
   * @param {Object} sender - the sender who sent this message, with an identifying tab
   * @param {function} sendResponse - the optional callback function (e.g. for a reply back to the sender)
   * @private
   */
  static #messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=");
    console.log(request);
    // Default response
    let response = {};
    switch (request.greeting) {
      // There are two different times we get this call: when the picker is first initialized (for just the picker and type) and all other times to get all the element properties
      case "updatePickerUI":
        if (request.picker && request.type) {
          // We only do this the very first time the UI is opened and sends the initPicker message
          X.DOM["#picker-type"].textContent = chrome.i18n.getMessage("picker_" + request.picker);
          X.DOM["#data-label"].textContent = request.type === "property" && X.items.elementProperty && X.items.elementProperty.trim() ? X.items.elementProperty : chrome.i18n.getMessage(request.type + "_label");
          MDC.chips.get((request.type === "property" ? "property" : request.type === "xpath" ? "xpath" : "selector") + "-chip").selected = true;
        } else {
          // We do this for all successive calls (TODO: Can request.element be null here? saw an error show up once)
          X.DOM["#tips"].className = "display-none";
          X.DOM["#content"].className = "display-block";
          X.DOM["#footer"].className = "display-block";
          X.DOM["#element-current"].textContent = request.element.current;
          for (const x of ["parent", "child", "next", "previous"]) {
            X.DOM["#element-" + x].textContent = request.element[x];
            X.DOM["#element-" + x + "-button"].dataset.type = (request.element[x] ? "" : "empty");
          }
          X.DOM["#data-value"].textContent = request.data;
          X.DOM["#data-value"].style.color = request.meta === "error" ? "var(--mdc-theme-error)" : request.meta === "fallback" ? "var(--mdc-theme-warning)": "";
          if (request.element.context === "shadow" || request.element.context === "iframe") {
            X.DOM["#data-label"].textContent = chrome.i18n.getMessage("js_path_label") + " (" + chrome.i18n.getMessage("context_" + request.element.context + "_label") + ")";
            X.DOM["#data-label"].style.color = "var(--mdc-theme-warning)";
          } else {
            X.DOM["#data-label"].textContent = chrome.i18n.getMessage(MDC.chipsets.get("type-chip-set").chips.filter(chip => chip.selected)[0].root_.dataset.action + "_label");
            X.DOM["#data-label"].style.color = "";
          }
        }
        break;
      default:
        break;
    }
    sendResponse(response);
  }

}