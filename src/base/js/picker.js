/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Picker is a content script that interacts with the PickerUI Iframe. It gets executed by the Popup whenever the user
 * wants to open the Element Picker. Picker messages with PickerUI (and vice versa), with the Background/Content Script
 * being the intermediary.
 *
 * Note: The Element Picker may not work on Complex Websites, Iframes, and Shadow Roots.
 *
 * Sites where the Element Picker doesn't work:
 * https://groups.google.com/a/chromium.org/g/chromium-extensions
 */
var Picker = Picker || (() => {

  /**
   * Variables
   *
   * @param CONTAINER the document container node we use to apply the picker to (either document's html or body nodes)
   * @param UI_STYLE  the ui iframe's CSS style
   * @param id        the ui iframe's ID
   * @param clazz     the class to apply to the container while in Element Picker mode (used by our style)
   * @param hoverBox  the {@link HoverBox} object
   * @param style     the style to add for the document body while in Element Picker mode
   * @param ui        the ui iframe
   * @param element   the current element to generate a DOM Path or DOM Property value from
   * @param picker    the picker type ("next", "prev", "button", "element", "remove", or "")
   * @param data      the CSS selector, XPath expression, or DOM Property value for the current element
   * @param type      the path type ("selector" or "xpath")
   * @param algorithm the DOM Path algorithm ("internal" or "chromium")
   * @param quote     the DOM Path quote ("double" or "single")
   * @param optimized the DOM Path optimized state for generating optimized or unoptimized paths (true or false)
   * @param js        the DOM Path js state for generating JS Paths (true or false)
   * @param property  the DOM Property value to get from the element (e.g. "outerHTML or "dataset.src")
   */
  const CONTAINER = document.documentElement || document.body;
  const UI_STYLE = "background: initial; border: 1px solid black; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: 200px; max-width: none; max-height: none; min-height: 0; min-width: 0; margin: 0; opacity: 1; outline: 0; overflow: hidden; padding: 0; pointer-events: auto; position: fixed; visibility: visible;  width: 500px; z-index: 2147483647;";
  let id = "x-ep-ui-id";
  let clazz = "x-ep-ui-class";
  let hoverBox;
  let style;
  let ui;
  let element;
  let picker;
  let data;
  let type;
  let algorithm;
  let quote;
  let optimized;
  let js;
  let property;

  /**
   * Opens the Picker.
   *
   * @public
   */
  async function openPicker() {
    await closePicker();
    console.log("openPicker() - opening the Picker");
    // Set pickerEnabled to true
    const instance = await getInstance();
    instance.pickerEnabled = true;
    await setInstance(instance);
    // Set id and class to the randomly generated strings
    // id = instance.randomString || id;
    // clazz = instance.randomString || clazz;
    // Instantiate and open the HoverBox so we get the hover effects on elements on mousemove
    // Note: We don't need the HoverBox's action since we're implementing this using our own clickListener for the event, in which our event.target is more accurate
    hoverBox = new HoverBox();
    hoverBox.open();
    // Add all picker-related listeners and objects
    addClickListener();
    addClass();
    addStyle();
    addUI();
  }

  /**
   * Closes the Picker.
   *
   * @public
   */
  async function closePicker() {
    console.log("closePicker() - closing the Picker");
    // Set pickerEnabled to false
    const instance = await getInstance();
    instance.pickerEnabled = false;
    await setInstance(instance);
    // Close the HoverBox
    if (hoverBox) {
      hoverBox.close();
      hoverBox = undefined;
    }
    // Remove all picker-related listeners and objects
    removeClickListener();
    removeClass();
    removeStyle();
    removeUI();
  }

  /**
   * Initializes the Picker with the picker type (next, prev, button, element), path type (selector or xpath), and
   * minimize and corner properties.
   *
   * @param algorithm_ the algorithm to initiate with (e.g. "internal")
   * @param quote_     the quote to initiate with (e.g. "double")
   * @param optimized_ the optimized state to initiate with (e.g. true or false)
   * @param js_        the js path state to initiate with (e.g. true or false)
   * @param property_  the property to initiate with (e.g. "innerHTML" or "dataset.src")
   * @param minimize   the minimize to initiate with ("minimize" or "maximize")
   * @param corner     the corner to initiate with (e.g. "bottom-right")
   * @public
   */
  async function initPicker(algorithm_, quote_, optimized_, js_, property_, minimize, corner) {
    // Send out only the type to the UI so it knows this is just for the opening and to know what to start with (Selector or XPath)
    const instance = await getInstance();
    // Element Picky's picker is always just "picky"
    picker = instance.picker;
    // Note that element and remove both use pageElementType. Element Picky just uses type, as it could be selector, xpath, or property
    type = picker === "next" ? instance.nextLinkType : picker === "prev" ? instance.prevLinkType : picker === "button" ? instance.buttonType : picker === "element" || picker === "remove" ? instance.pageElementType : picker === "picky" ? instance.pickerType : "";
    algorithm = algorithm_;
    quote = quote_;
    optimized = optimized_;
    js = js_;
    property = property_ && typeof property_ === "string" ? property_.split(".").filter(Boolean) : [];
    Promisify.runtimeSendMessage({receiver: "background", greeting: "updatePickerUI", type: type, picker: picker});
    minimizePicker(minimize);
    movePicker(corner);
  }

  /**
   * Changes the Picker's properties:
   * - element (e.g. going up one level in the DOM and changing to the parent element).
   * - type
   * - algorithm
   * - quote
   * - optimized
   * - js
   * - property
   *
   * @param change {string} the change to make, e.g. the element relationship to change to (e.g. "parent")
   * @param value  {*}      the value to change to (if applicable)
   * @public
   */
  function changePicker(change, value) {
    console.log("changePicker() - change=" + change + ", value=" + value);
    // TODO: Is instanceof Element safe here? If the Element isn't part of the current document, this may return false
    switch(change) {
      case "parent":
        element = element.parentElement && element.parentElement instanceof Element ? element.parentElement : element;
        break;
      case "child":
        element = element.children[0] && element.children[0] instanceof Element ? element.children[0] : element;
        break;
      case "next":
        element = element.nextElementSibling && element.nextElementSibling instanceof Element ? element.nextElementSibling : element;
        break;
      case "previous":
        element = element.previousElementSibling && element.previousElementSibling instanceof Element ? element.previousElementSibling : element;
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
    updateUI();
    hoverBox.highlightElement(element);
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
      case "remove":
        instance.pageElementType = type || instance.pageElementType;
        instance.removeElementPath = data || instance.removeElementPath;
        break;
      default:
        break;
    }
    // We need to set pickerEnabled to false here, even though we also do it in closePicker() in case the user tries opening the Popup before the timeout closes it in 2000 ms
    instance.pickerEnabled = false;
    await setInstance(instance);
    setTimeout(() => { closePicker(); }, 2000);
  }

  /**
   * Copies the Picker's data to the user's clipboard.
   * (Only used in Element Picky.)
   *
   * @public
   */
  async function copyPicker() {
    console.log("copyPicker() - copying data to clipboard... data=" + data);
    try {
      await navigator.clipboard.writeText(data);
    } catch(e) {
      console.log("copyPicker() - Error");
      console.log(e);
    }
    // TODO: Should we also close the picker after copying?
    // setTimeout(() => { closePicker(); }, 2000);
  }

  /**
   * Minimizes (or maximizes) the Picker after receiving a message from the UI to do so.
   *
   * @param toggle {string} a toggle that can either "minimize" or "maximize"
   * @public
   */
  function minimizePicker(toggle) {
    console.log("minimizePicker() - toggle=" + toggle);
    switch(toggle) {
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
   * @param corner {string} the corner to move to
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
   * Adds the click listener to prevent click events.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener for more information about useCapture
   * @private
   */
  function addClickListener() {
    // removeClickListener();
    console.log("addClickListener()");
    // Important: We need the true to prevent clicks all the time; on some websites, if we leave out the true, it will still click.
    // The third parameter is "useCapture" a boolean that indicates how the listener should be added in respect to bubbling/capturing
    window.addEventListener("click", clickListener, true);
  }

  /**
   * Removes the click listener that prevents click events.
   *
   * @private
   */
  function removeClickListener() {
    console.log("removeClickListener()");
    // Make sure we keep the true here as we added it in the event listener
    window.removeEventListener("click", clickListener, true);
  }

  /**
   * The click listener that prevents click events.
   *
   * @param event the event with target (element)
   * @returns {boolean} false
   * @see https://stackoverflow.com/a/60345546 Why we use window and stopImmediatePropagation()
   * @see https://stackoverflow.com/a/64913288 Why we return false
   * @private
   */
  const clickListener = function (event) {
    console.log("clickListener()");
    // Prevent the default click event from happening (sometimes doesn't work on some complex sites)
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
    // We set the element from the event.target since it seems to be more accurate than HoverBox's target
    element = event.target;
    updateUI();
    return false;
  }

  /**
   * Adds the UI.
   *
   * @private
   */
  function addUI() {
    // removeUI();
    console.log("addUI()");
    ui = document.createElement("iframe");
    ui.style = UI_STYLE.replaceAll(";", " !important;");
    ui.id = id;
    ui.scrolling = "no";
    ui.frameBorder = "0";
    ui.allowTransparency = "true";
    // We want to append directly to documentElement (html) instead of body so we don't interfere with the DOM's body for path finding
    document.documentElement.append(ui);
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
    // if (ui && document.documentElement.contains(ui)) {
    //   document.documentElement.removeChild(ui);
    // }
    if (ui && typeof ui.remove === "function") {
      ui.remove();
    }
    ui = undefined;
  }

  /**
   * Updates the UI.
   *
   * @private
   */
  function updateUI() {
    console.log("updateUI()");
    if (!element) {
      return;
    }
    if (type === "property") {
      // Property
      data = getElementPropertyValue(element);
    } else {
      // Selector or XPath
      data = DOMPath.generatePath(element, type, algorithm, quote, optimized, js);
    }
    // Build out the element object we will send to the UI to update
    const elementObject = {};
    elementObject.current = getElementDetails(element, true);
    elementObject.parent = getElementDetails(element.parentElement);
    elementObject.child = getElementDetails(element.children ? element.children[0] : undefined);
    elementObject.next = getElementDetails(element.nextElementSibling);
    elementObject.previous = getElementDetails(element.previousElementSibling);
    // Note do not send out the type as that is how we differentiate between first-time updates (type only) and successive updates
    Promisify.runtimeSendMessage({receiver: "background", greeting: "updatePickerUI", data: data, element: elementObject});
    // console.log("parents:");
    // let parent = element.parentNode;
    // while (parent) {
    //   console.log(parent.tagName);
    //   parent = parent.parentNode;
    // }
    // console.log("children:");
    // let child = element.children[0];
    // while (child) {
    //   console.log(child.tagName);
    //   child = child.children[0];
    // }
  }

  /**
   * Gets the value of the element's property (like textContent). Nested properties are supported (like dataset.src).
   *
   * @param el the element
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
    } catch(e) {
      console.log("updateUI() - error getting property");
      console.log(e);
      value = e.message;
    }
    return value;
  }

  /**
   * Gets details about an element. Specifically, the format is like CSS Selectors: NODE_NAME#ID or NODE_NAME.CLASSNAME.
   *
   * Note: We use nodeName instead of tagName because nodeName applies to all nodes (e.g. text,comments) whereas tagName
   * only applies to elements. Even though we're only looking at elements, we use nodeName just to be safe.
   *
   * @param el               the element
   * @param withoutSubstring true if the details can be returned without substringing them, false otherwise
   * @returns {string|*} the element details
   * @private
   */
  function getElementDetails(el, withoutSubstring) {
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
    return withoutSubstring ? details : details.substring(0, 30);
  }

  /**
   * Adds the class that makes the cursor a cross hair.
   *
   * @private
   */
  function addClass() {
    // removeClass();
    console.log("addClass()");
    if (CONTAINER) {
      CONTAINER.classList.add(clazz)
    }
  }

  /**
   * Removes the class that makes the cursor a cross hair.
   *
   * @private
   */
  function removeClass() {
    console.log("removeClass()");
    if (CONTAINER) {
      CONTAINER.classList.remove(clazz)
    }
  }

  /**
   * Adds the style that makes the cursor a cross hair.
   *
   * @see https://stackoverflow.com/a/17529309 changing-the-mouse-cursor-on-each-and-every-part-of-the-web-page
   * @private
   */
  function addStyle() {
    // removeStyle();
    console.log("addStyle()");
    const nodeName = CONTAINER && CONTAINER.nodeName && typeof CONTAINER.nodeName.toLowerCase === "function" ? CONTAINER.nodeName.toLowerCase() : "";
    style = document.createElement("style");
    // Can't seem to use *:not(#UI_ID):hover in one rule declaration, so we need to override the * in a separate style for #UI_ID:
    style.textContent =
      nodeName + "." + clazz + ",\n" +
      nodeName + "." + clazz + " *:hover,\n" +
      nodeName + "." + clazz + " a:hover {\n" +
      "  cursor: crosshair !important;\n" +
      "}\n" +
      "#" + id + ":hover {\n" +
      "  cursor: initial !important;\n" +
      "}";
    (document.head || document.body || document.documentElement).appendChild(style);
  }

  /**
   * Removes the style that makes the cursor a cross hair.
   *
   * @private
   */
  function removeStyle() {
    console.log("removeStyle()");
    if (style && typeof style.remove === "function") {
      style.remove();
    }
    style = undefined;
  }

  /**
   * Gets the instance.
   *
   * @returns {Promise<{}|*>} the instance
   * @private
   */
  async function getInstance() {
    if (typeof Scroll !== "undefined" && typeof Scroll.getInstance === "function") {
      return Scroll.getInstance();
    } else {
      return await Promisify.runtimeSendMessage({receiver: "background", greeting: "getInstance"});
    }
  }

  /**
   * Sets the instance.
   *
   * @param instance the instance
   * @private
   */
  async function setInstance(instance) {
    if (typeof Scroll !== "undefined" && typeof Scroll.getInstance === "function") {
      Scroll.setInstance(instance);
    } else {
      await Promisify.runtimeSendMessage({receiver: "background", greeting: "setInstance", instance: instance});
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    openPicker,
    closePicker,
    initPicker,
    changePicker,
    savePicker,
    copyPicker,
    minimizePicker,
    movePicker
  };

})();