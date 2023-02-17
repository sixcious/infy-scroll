/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Picker is a content script that interacts with both HoverBox and the PickerUI Iframe. It gets executed by the Popup
 * whenever the user wants to open the Element Picker. Picker messages with PickerUI, with the Background/Content Script
 * being the intermediary. It opens and closes the HoverBox when needed.
 *
 * The Element Picker can be thought of as four components: Picker, PickerUI, HoverBox, and DOMPath.
 * Picker is the "manager" that ties all the components together.
 *
 * Note: var is used for declaration because this script can get executed multiple times on the page.
 */
var Picker = Picker || (() => {

  /**
   * Variables
   *
   * @param {HoverBox} hoverBox - the HoverBox object
   * @param {HTMLElement} ui - the Picker UI iframe
   * @param {Element} element - the current element to generate a DOM Path or derive a DOM Property value from
   * @param {string} picker - the picker type ("next", "prev", "click", "element", "load", "remove", or "")
   * @param {string} data - the CSS selector, XPath expression, or DOM Property value for the current element
   * @param {string} meta - the metadata from DOMPath, e.g. "error" or "fallback"
   * @param {string} type - the path type ("selector" or "xpath")
   * @param {string} algorithm - the path algorithm ("internal" or "chromium")
   * @param {string} quote - the path quote ("double" or "single")
   * @param {boolean} optimized - the path optimized state for generating optimized or unoptimized paths (true or false)
   * @param {boolean} js - the path js state for generating JS Paths (true or false)
   * @param {string} property - the property value to get from the element (e.g. "outerHTML or "dataset.src")
   */
  let hoverBox;
  let ui;
  let element;
  let picker;
  let data;
  let meta;
  let type;
  let algorithm;
  let quote;
  let optimized;
  let js;
  let property;

  /**
   * Gets the declared variables. This can be used by other parts of the app or for debugging purposes.
   *
   * @returns {*} the variables
   * @public
   */
  function get() {
    return {
      hoverBox, ui, element, picker, data, meta, type, algorithm, quote, optimized, js, property
    };
  }

  /**
   * Opens the Picker.
   *
   * @public
   */
  async function openPicker() {
    await closePicker();
    console.log("openPicker() - opening the Picker");
    const instance = await getInstance();
    instance.pickerEnabled = true;
    await setInstance(instance);
    hoverBox = new HoverBox();
    hoverBox.open();
    addUI();
  }

  /**
   * Closes the Picker.
   *
   * @public
   */
  async function closePicker() {
    console.log("closePicker() - closing the Picker");
    const instance = await getInstance();
    instance.pickerEnabled = false;
    await setInstance(instance);
    if (hoverBox) {
      hoverBox.close();
      hoverBox = undefined;
    }
    removeUI();
  }

  /**
   * Initializes the Picker with the picker type (next, prev, button, element), path type (selector or xpath), and
   * size and corner properties.
   *
   * @param {string} algorithm_ - the path algorithm ("internal" or "chromium")
   * @param {string} quote_ - the path quote ("double" or "single")
   * @param {boolean} optimized_ - the path optimized state for generating optimized or unoptimized paths (true or false)
   * @param {boolean} js_ - the path js state for generating JS Paths (true or false)
   * @param {string} property_ - the property value to get from the element (e.g. "outerHTML or "dataset.src")
   * @param {string} size - the size to initiate with ("minimize" or "maximize")
   * @param {string} corner - the corner to initiate with (e.g. "bottom-right")
   * @public
   */
  async function initPicker(algorithm_, quote_, optimized_, js_, property_, size, corner) {
    // Send out only the type to the UI so it knows this is just for the opening and to know what to start with (Selector or XPath)
    const instance = await getInstance();
    // ElementPicky's picker is always just "picky"
    picker = instance.picker;
    // Note that element and remove both use pageElementType. Element Picky just uses type, as it could be selector, xpath, or property
    type = picker === "next" ? instance.nextLinkType : picker === "prev" ? instance.prevLinkType : picker === "button" ? instance.buttonType : picker === "element" || picker === "load" || picker === "remove" ? instance.pageElementType : picker === "picky" ? instance.pickerType : "";
    algorithm = algorithm_;
    quote = quote_;
    optimized = optimized_;
    js = js_;
    property = property_ && typeof property_ === "string" ? property_.split(".").filter(Boolean) : [];
    Promisify.runtimeSendMessage({receiver: "background", greeting: "updatePickerUI", type: type, picker: picker});
    resizePicker(size);
    movePicker(corner);
  }

  /**
   * Changes any of the Picker's properties (element, type, algorithm, quote, optimized, js, and property).
   *
   * For example, this function is called if the user uses the DOM Traversal Buttons to go up, down, left, or right,
   * changing the current element to one of its siblings, parents, or children. It's also called if the user changes
   * the path type, for example going from Selector to XPath.
   *
   * @param {string} change - the type of change to make, e.g. the element relationship to change to (e.g. "parent")
   * @param {*} value - the value to change to (if applicable)
   * @public
   */
  function changePicker(change, value) {
    console.log("changePicker() - change=" + change + ", value=" + value);
    // In case we're dealing with elements inside iframes, we can't just use instanceof Element; must use the element's defaultView
    const DFElement = element.ownerDocument?.defaultView?.Element || Element;
    let newElement = element;
    switch(change) {
      case "parent":
        newElement = DOMNode.getParentElement(element) || element;
        break;
      case "child":
        newElement = DOMNode.getChildElement(element) || element;
        break;
      case "next":
        newElement = element.nextElementSibling instanceof DFElement ? element.nextElementSibling : element;
        break;
      case "previous":
        newElement = element.previousElementSibling instanceof DFElement ? element.previousElementSibling : element;
        break;
      case "type":
        type = value;
        break;
      case "algorithm":
        algorithm = value;
        break;
      case "quote":
        quote = value;
        break;
      case "optimized":
        optimized = value;
        break;
      case "js":
        js = value;
        break;
      case "property":
        property = value && typeof value === "string" ? value.split(".").filter(Boolean) : [];
        break;
      default:
        break;
    }
    // if (newElement !== hoverBox?.hoverBox) {
    //   updatePicker(newElement);
    //   hoverBox.highlightElement(newElement);
    // }
    updatePicker(newElement);
    hoverBox.highlightElement(newElement);
  }

  /**
   * Updates the Picker UI. This is called by two functions: Picker.changePicker and HoverBox.clickListener.
   *
   * @param {Element} newElement - the new element to update the picker with
   * @public
   */
  function updatePicker(newElement) {
    console.log("updatePicker()");
    if (newElement) {
      element = newElement;
    }
    if (!element) {
      return;
    }
    if (type === "property") {
      // Property
      data = getElementPropertyValue(element);
    } else {
      // Selector XPath or JS Path
      const target = picker === "next" || picker === "prev" ? "link" : picker === "button" ? "button" : "generic";
      // Note: This is the only time we ever call DOMPath.generateContextPath; in all other parts of the app, we have
      // the current context (e.g. iframe document), but here we're unsure what element the user is trying to pick
      const domPath = DOMPath.generateContextPath(element, type, algorithm, quote, optimized, target, js);
      data = domPath.path;
      meta = domPath.meta;
    }
    // Build out the element object we will send to the UI to update
    const elementObject = {};
    elementObject.context = DOMNode.getParentShadowRoot(element) ? "shadow" : DOMNode.getParentIframe(element) ? "iframe" : "";
    elementObject.current = getElementDetails(element);
    elementObject.parent = getElementDetails(DOMNode.getParentElement(element));
    elementObject.child = getElementDetails(DOMNode.getChildElement(element));
    elementObject.next = getElementDetails(element.nextElementSibling);
    elementObject.previous = getElementDetails(element.previousElementSibling);
    // Note do not send out the type as that is how we differentiate between first-time updates (type only) and successive updates
    Promisify.runtimeSendMessage({receiver: "background", greeting: "updatePickerUI", data: data, meta: meta, element: elementObject});
    // console.log("parents:");
    // let parent = element.parentNode;
    // while (parent) {
    //   console.log(parent.tagName);
    //   parent = parent.parentNode;
    // }
    // console.log("children:");
    // let child = element.firstElementChild;
    // while (child) {
    //   console.log(child.tagName);
    //   child = child.firstElementChild;
    // }
  }

  /**
   * Saves the Picker's properties into the instance.
   *
   * Once the user clicks the Save button, we will store the generated selector and xpath in the instance and stop the
   * element picker.
   *
   * @public
   */
  async function savePicker() {
    const instance = await getInstance();
    console.log("savePicker() - saving picker... picker=" + picker);
    switch (picker) {
      case "next":
        instance.nextLinkType = type || instance.nextLinkType;
        instance.nextLinkPath =  data || instance.nextLinkPath;
        instance.nextLinkKeywordsEnabled = false;
        break;
      case "prev":
        instance.prevLinkType = type || instance.prevLinkType;
        instance.prevLinkPath =  data || instance.prevLinkPath;
        instance.prevLinkKeywordsEnabled = false;
        break;
      case "button":
        instance.buttonType = type || instance.buttonType;
        instance.buttonPath = data || instance.buttonPath;
        break;
      case "element":
        instance.pageElementType = type || instance.pageElementType;
        instance.pageElementPath = data || instance.pageElementPath;
        break;
        // Note: For AJAX types, they share the same type with the pageElementType, so we have to override it if they change the type
      case "load":
        instance.pageElementType = type || instance.pageElementType;
        instance.loadElementPath = data || instance.loadElementPath;
        break;
      case "remove":
        instance.pageElementType = type || instance.pageElementType;
        instance.removeElementPath = data || instance.removeElementPath;
        break;
      default:
        break;
    }
    // We need to set pickerEnabled to false here, even though we also do it in closePicker() in case the user tries opening the Popup before the timeout closes it in 2000 ms
    instance.pickerEnabled = false;
    // We need pickerSet for the rare race condition in which init() has finished all its checks after the user has quickly finished using the EP
    instance.pickerSet = true;
    // TODO: Sometimes the instance.isLoading is true, which is why sometimes we have to click ACCEPT again; should we reset it to false always?
    // instance.isLoading = false;
    await setInstance(instance);
    setTimeout(() => { closePicker(); }, 2000);
  }

  /**
   * Copies the Picker's data to the user's clipboard.
   *
   * @public
   */
  async function copyPicker() {
    console.log("copyPicker() - copying data to clipboard... data=" + data);
    try {
      await navigator.clipboard.writeText(data);
    } catch (e) {
      console.log("copyPicker() - Error");
      console.log(e);
    }
    // TODO: Should we also close the picker after copying?
    // setTimeout(() => { closePicker(); }, 2000);
  }

  /**
   * Resizes the Picker to the specified size after receiving a message from the UI to do so.
   *
   * @param {string} size - the size to make the picker ("minimize" or "maximize")
   * @public
   */
  function resizePicker(size) {
    console.log("resizePicker() - size=" + size);
    switch(size) {
      case "minimize":
        ui.style.setProperty("width", "256px", "important");
        ui.style.setProperty("height", "100px", "important");
        break;
      default:
      case "maximize":
        ui.style.setProperty("width", "500px", "important");
        ui.style.setProperty("height", "200px", "important");
        break;
    }
  }

  /**
   * Moves the Picker to one of four corners on the screen. This is toggled by the UI between four corners.
   *
   * @param {string} corner - the corner to move to
   * @public
   */
  function movePicker(corner) {
    console.log("movePicker() - corner=" + corner);
    const margin = "8px";
    switch(corner) {
      default:
      case "bottom-right":
        ui.style.setProperty("top", "", "important");
        ui.style.setProperty("bottom", margin, "important");
        ui.style.setProperty("right", margin, "important");
        ui.style.setProperty("left", "", "important");
        break;
      case "top-right":
        ui.style.setProperty("top", margin, "important");
        ui.style.setProperty("bottom", "", "important");
        ui.style.setProperty("right", margin, "important");
        ui.style.setProperty("left", "", "important");
        break;
      case "top-left":
        ui.style.setProperty("top", margin, "important");
        ui.style.setProperty("bottom", "", "important");
        ui.style.setProperty("right", "", "important");
        ui.style.setProperty("left", margin, "important");
        break;
      case "bottom-left":
        ui.style.setProperty("top", "", "important");
        ui.style.setProperty("bottom", margin, "important");
        ui.style.setProperty("right", "", "important");
        ui.style.setProperty("left", margin, "important");
        break;
    }
  }

  /**
   * Adds the UI.
   *
   * @private
   */
  function addUI() {
    // removeUI();
    console.log("addUI()");
    // Note: For the border, we use black no matter the theme. However, if desired, we can have PickerUI send a message back to us to initPicker(), and we can get the theme's border color and override it then
    const UI_STYLE = "background: initial; border: 1px solid black; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: 200px; max-width: none; max-height: none; min-height: 0; min-width: 0; margin: 0; opacity: 1; outline: 0; overflow: hidden; padding: 0; pointer-events: auto; position: fixed; visibility: visible;  width: 500px; z-index: 2147483647;";
    ui = document.createElement("iframe");
    ui.style = UI_STYLE.replaceAll(";", " !important;");
    ui.scrolling = "no";
    ui.frameBorder = "0";
    ui.allowTransparency = "true";
    // We want to append directly to documentElement (html) instead of body so we don't interfere with the DOM's body for path finding
    (document.documentElement || document.body).append(ui);
    // Important: If we set the onload listener before appending the iframe to the document, the onload will execute twice, so we do it after appending
    // @see https://stackoverflow.com/questions/10781880/dynamically-created-iframe-triggers-onload-event-twice
    ui.onload = function () {
      console.log("addUI() - ui iframe loaded");
    }
    // Note: This must be a web_accessible_resource in manifest.json
    ui.contentWindow.location = chrome.runtime.getURL("/html/picker-ui.html");
    // Note: We sometimes get the following extension error after we append the ui, but this only happens on certain websites and does not affect functionality:
    // The source list for the Content Security Policy directive 'script-src' contains an invalid source: ''*''. It will be ignored.
  }

  /**
   * Removes the UI.
   *
   * @private
   */
  function removeUI() {
    console.log("removeUI()");
    if (ui && typeof ui.remove === "function") {
      ui.remove();
    }
    // ui = undefined;
  }

  /**
   * Gets details about an element. Specifically, the format is like CSS Selectors: NODE_NAME#ID or NODE_NAME.CLASSNAME.
   *
   * Note: We use nodeName instead of tagName because nodeName applies to all nodes (e.g. text,comments) whereas tagName
   * only applies to elements. Even though we're only looking at elements, we use nodeName just to be safe.
   *
   * @param {Element} el - the element
   * @returns {string|*} the element details
   * @private
   */
  function getElementDetails(el) {
    let details = "";
    if (el) {
      details += el.nodeName && typeof el.nodeName.toUpperCase === "function" ? el.nodeName.toUpperCase() : "";
      // We purposely don't need the ID or class if it's HTML, HEAD, or BODY. Also, we only show the class if it doesn't have an ID
      if (details !== "HTML" && details !== "BODY" && details !== "HEAD") {
        if (el.id) {
          details += "#" + el.id;
        } else if (el.className && typeof el.className.trim === "function" && el.className.trim() !== "" && el.classList) {
          details += "." + [...el.classList].join(".");
        }
      }
    }
    return details;
  }

  /**
   * Gets the value of the element's property (like textContent). Nested properties are supported (like dataset.src).
   *
   * @param {Element} el - the element
   * @returns {*} the value of the element's property
   * @private
   */
  function getElementPropertyValue(el) {
    let value;
    try {
      value = el[property[0]];
      for (let i = 1; i < property.length; i++) {
        value = data[property[i]];
      }
      // // In case of something ridiculous, like being an element (e.g. via parentNode)
      // value = JSON.stringify(value);
    } catch (e) {
      console.log("updatePicker() - error getting property");
      console.log(e);
      value = e.message;
    }
    return value;
  }

  /**
   * Gets the instance.
   *
   * @returns {Promise<{}|*>} the instance
   * @private
   */
  async function getInstance() {
    if (typeof Scroll !== "undefined" && typeof Scroll.get === "function") {
      return Scroll.get("instance");
    } else {
      return await Promisify.runtimeSendMessage({receiver: "background", greeting: "getInstance"});
    }
  }

  /**
   * Sets the instance.
   *
   * @param {Object} instance - the instance
   * @private
   */
  async function setInstance(instance) {
    if (typeof Scroll !== "undefined" && typeof Scroll.set === "function") {
      Scroll.set("instance", instance);
    } else {
      await Promisify.runtimeSendMessage({receiver: "background", greeting: "setInstance", instance: instance});
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    get,
    openPicker,
    closePicker,
    initPicker,
    changePicker,
    savePicker,
    copyPicker,
    resizePicker,
    movePicker,
    updatePicker
  };

})();