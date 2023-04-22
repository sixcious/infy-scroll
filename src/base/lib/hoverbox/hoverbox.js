/**
 * HoverBox
 * @copyright (c) 2019 Kevin Li
 * @copyright (c) 2020 Roy Six
 * @preserve
 */

/**
 * HoverBox draws a box around elements as the user hovers over them with their cursor. It also changes the cursor's
 * style (for example, to a crosshair) and adds a click listener that can call a callback function.
 *
 * HoverBox was originally created by Kevin Li. However, it has been completely rewritten and improved upon.
 * Notably, HoverBox has been modified to support nested Shadow Roots and Same-Origin Iframes.
 *
 * The Element Picker can be thought of as four components: Picker, PickerUI, HoverBox, and DOMPath.
 * HoverBox is the component that draws the box around the hovered element and prevents normal clicks on the page.
 *
 * Note: var is used for declaration because this script can get executed multiple times on the page.
 */
var HoverBox = class HoverBox {

  /**
   * Fields
   *
   * @param {Element} hoverBox - the actual div that draws the box around a hovered element
   * @param {Element} container - the container to append the hover box to (e.g. document.body)
   * @param {string} selectors - the selector string that must match for the hovered element (via Element.matches() method)
   * @param {string} background - the hover box background color
   * @param {number} borderWidth - the hover box borderWidth
   * @param {string} cursor - the mouse cursor to use (e.g. "crosshair")
   * @param {string} transition - the css transition style to use when moving between elements (e.g. "all 150ms ease")
   * @param {Element[]} ignoreElements - the elements to ignore when hovered (e.g. document.body)
   * @param {Object} action - the action to trigger
   * @param {Set} shadows - the shadow roots on the page to add listeners and styles to
   * @param {Set} iframes - the iframes on the page to add listeners and styles to
   * @param {EventListener[]} listeners - the list of event listeners that were added that should be removed when the hover box is closed (not currently used due to controller)
   * @param {AbortController} controller - the controller we use to later remove the event listeners when the hover box is closed
   * @param {Element[]} styles - the list of style elements that were added that should be removed when the hover box is closed
   * @param {Event} #previousEvent - the previous event that triggered the mouse listener
   * @param {Element} #previousTarget - the previous element target that triggered the mouse listener
   * @param {boolean} #triggered - whether the action was triggered or not
   * @see https://stackoverflow.com/a/58496693/988713 For why we keep a reference to the listeners
   */
  hoverBox;
  container;
  selectors;
  background;
  borderWidth;
  cursor;
  transition;
  ignoreElements;
  action;
  shadows;
  iframes;
  styles;
  // listeners;
  controller;
  #previousEvent;
  #previousTarget;
  #triggered;

  /**
   * The HoverBox constructor.
   *
   * @param {Object} options - any custom options to merge with the default options
   */
  constructor(options = {}) {
    const name = chrome?.runtime?.getManifest()?.name;
    this.hoverBox = document.createElement("div"); // Must create the hover box first before applying options
    this.container = document.body;
    this.selectors = "*"; // Default to pick all elements
    this.background = name === "Infy Scroll" ? "rgba(97, 84, 146, 0.4)" : name === "URL Incrementer" ? "rgba(51, 51, 91, 0.4)" : name === "Downloadyze" ? "rgba(0, 0, 0, 0.4)" : "rgba(153, 235, 255, 0.5)";
    this.borderWidth = 0; // 0 is best default to avoid a jarring experience with horizontal scrollbars
    this.cursor = "crosshair";
    this.transition = "all 150ms ease"; // Set to "" (empty string) to disable
    this.ignoreElements = [document.body];
    this.action = {};
    this.shadows = new Set();
    this.iframes = new Set();
    this.styles = [];
    // this.listeners = [];
    this.controller = new AbortController();
    this.#setHoverBoxProperties();
    this.#findShadowsAndIframes(document, 0);
    // this.setAction(this.action); // Note: We don't need the HoverBox's action since we're implementing this using our own clickListener for the event, in which our event.target is more accurate
    for (const key of Object.keys(options)) { this[key] = options[key]; }
    this.container.appendChild(this.hoverBox);
  }

  /**
   * Opens the HoverBox.
   *
   * Important: The click listener needs the options: true to prevent clicks all the time; on some websites, if we leave
   * out the true, it will still click. This third parameter is "useCapture" a boolean that indicates how the listener
   * should be added in respect to bubbling/capturing.
   *
   * @see https://developer.mozilla.org/docs/Web/API/EventTarget/addEventListener for more information about useCapture
   * @public
   */
  open() {
    // Document
    // this.listeners.push({ target: document, event: "mouseover", callback: this.#mouseListener });
    // this.listeners.push({ target: window, event: "click", callback: this.#clickListener, options: true });
    document.addEventListener("mouseover", this.#mouseListener, { signal: this.controller.signal });
    window.addEventListener("click", this.#clickListener, { signal: this.controller.signal, capture: true });
    const style = this.#createStyle(":root");
    this.styles.push(style);
    (document.head || document.body || document.documentElement).appendChild(style);
    // Shadows
    this.shadows.forEach(host => {
      const shadowRoot = DOMNode.getShadowRoot(host);
      if (shadowRoot) {
        // this.listeners.push({ target: shadowRoot, event: "mouseover", callback: this.#mouseListener });
        // this.listeners.push({ target: shadowRoot, event: "click", callback: this.#clickListener, options: true });
        shadowRoot.addEventListener("mouseover", this.#mouseListener, { signal: this.controller.signal });
        shadowRoot.addEventListener("click", this.#clickListener, { signal: this.controller.signal, capture: true });
        const style = this.#createStyle(":host");
        this.styles.push(style);
        shadowRoot.appendChild(style);
      }
    });
    // Iframes
    this.iframes.forEach(iframe => {
      const iframeDocument = DOMNode.getIframeDocument(iframe);
      if (iframeDocument) {
        // this.listeners.push({ target: iframeDocument, event: "mouseover", callback: this.#mouseListener });
        // this.listeners.push({ target: iframeDocument, event: "click", callback: this.#clickListener, options: true });
        iframeDocument.addEventListener("mouseover", this.#mouseListener, { signal: this.controller.signal });
        iframeDocument.addEventListener("click", this.#clickListener, { signal: this.controller.signal, capture: true });
        const style = this.#createStyle(":root");
        this.styles.push(style);
        (iframeDocument.head || iframeDocument.body || iframeDocument.documentElement).appendChild(style);
      }
    });
    // // Listeners
    // for (const listener of this.listeners) {
    //   listener.target.addEventListener(listener.event, listener.callback, listener.options);
    // }
  }

  /**
   * Closes the HoverBox and removes all listeners and styles added to the page.
   *
   * @public
   */
  close() {
    // for (const listener of this.listeners) {
    //   listener.target.removeEventListener(listener.event, listener.callback, listener.options);
    // }
    this.controller.abort();
    for (const style of this.styles) {
      if (style && typeof style.remove === "function") {
        style.remove();
      }
    }
    // if (this.action) {
    //   document.removeEventListener(this.action.trigger, this._triggerListener);
    // }
    this.shadows = new Set();
    this.iframes = new Set();
    // this.listeners = [];
    this.styles = [];
    this.hoverBox.remove();
  }

  /**
   * Highlights a specific element on the page. This can be called manually to force a hover box around an element without
   * having to hover over it.
   *
   * @param {Element} element - the element to highlight
   * @param {boolean} close - if true, closes and removes the hover box after highlighting it
   * @param {number} timeout - the specified timeout (ms) to highlight the element for before removing it
   * @public
   */
  highlightElement(element, close = false, timeout = 3000) {
    try {
      console.log("HoverBox.highlightElement()");
      console.log(this.hoverBox);
      if (element) {
        this.#mouseListener( {target: element});
      }
      if (close) {
        // Note we use () => instead of function to avoid overriding this (class context)
        setTimeout(() => {
          // this.close();
          this.hoverBox.remove();
        }, timeout);
      }
    } catch (e) {
      console.log("HoverBox.highlightElement() - error=")
      console.log(e);
    }
  }

  /**
   * Sets the HoverBox's CSS properties.
   *
   * @private
   */
  #setHoverBoxProperties() {
    this.hoverBox.style.setProperty("background", this.background, "important");
    this.hoverBox.style.setProperty("display", "block", "important"); // Note: Need the display: block because some sites set divs to display: none! e.g. https://capcomprotour.com/standings/
    this.hoverBox.style.setProperty("pointer-events", "none", "important");
    this.hoverBox.style.setProperty("position", "absolute", "important");
    this.hoverBox.style.setProperty("transition", this.transition, "important");
    this.hoverBox.style.setProperty("z-index", "2147483647", "important"); // Add max z-index to the hover box to ensure it always is visible over DOM elements with a z-index > 0
  }

  /**
   * Finds all shadow roots and iframe documents on the page recursively.
   *
   * @param {Document|ShadowRoot} context - the current context to query against
   * @param {number} level - the current depth level in the traversal
   * @private
   */
  #findShadowsAndIframes(context, level) {
    if (context && level < 10) {
      const candidates = [...context.querySelectorAll("*")];
      for (const candidate of candidates) {
        const shadowRoot = DOMNode.getShadowRoot(candidate);
        if (shadowRoot) {
          this.shadows.add(candidate);
          this.#findShadowsAndIframes(shadowRoot, level + 1);
        } else {
          const iframeDocument = DOMNode.getIframeDocument(candidate);
          if (iframeDocument) {
            this.iframes.add(candidate);
            this.#findShadowsAndIframes(iframeDocument, level + 1);
          }
        }
      }
    }
  }

  /**
   * Creates the style necessary for the specified cursor for the given context (e.g. :root or :host).
   *
   * @param {string} contextName - the name of the context, e.g. ":root" for documents ":host" for shadow roots
   * @returns {HTMLStyleElement} the newly created style
   * @private
   */
  #createStyle(contextName = ":root") {
    console.log("HoverBox.createStyle() - contextName=" + contextName);
    const style = document.createElement("style");
    style.textContent =
      contextName + ",\n" +
      contextName + " *,\n" +
      contextName + " *:hover,\n" +
      contextName + " a,\n" +
      contextName + " a:hover,\n" +
      contextName + " button,\n" +
      contextName + " button:hover,\n" +
      contextName + " svg,\n" +
      contextName + " svg:hover {\n" +
      "  cursor: " + this.cursor + " !important;\n" +
      "}";
    return style;
  }

  /**
   * The mouse listener is called as the user moves the mouse on the page and a new element is hovered over.
   * It draws the hover box around the current element.
   *
   * @param {Event} e - the event with target (element)
   * @private
   */
  #mouseListener = (e) => {
    let target = e.target;
    this.#previousEvent = e;
    // console.log("HoverBox.mouseListener() - target=");
    // console.log(target);
    // console.log("HoverBox.mouseListener() - TCL: HoverBox -> this._moveHoverBox -> target", target);
    if (this.ignoreElements.includes(target)) {
      // if (this.ignoreElements.indexOf(target) === -1 && target.matches(this.selectors)
      // && (this.container.contains(target) || target === this.hoverBox)) { // is NOT ignored elements
      // console.log("HoverBox.mouseListener() - hiding hover box because this is an ignored element...");
      this.hoverBox.style.setProperty("width", "0", "important");
      return;
    }
    // console.log("HoverBox.mouseListener() - TCL: target", target);
    if (target === this.hoverBox) {
      // console.log("HoverBox.mouseListener() - target === this.hoverBox");
      // the truly hovered element behind the added hover box
      // Note: We wrap this in a try/catch due to some elements x and y coordinates being funky, e.g.:
      // TypeError: Failed to execute 'elementsFromPoint' on 'Document': The provided double value is non-finite.
      let hoveredElement;
      try {
        hoveredElement = document.elementsFromPoint(e.clientX, e.clientY)[1];
      } catch (e) {
        console.log("HoverBox.mouseListener() - error setting hoveredElement using document.elementsFromPoint. Error:");
        console.log(e);
        return;
      }
      console.log("HoverBox.mouseListener() - screenX: " + e.screenX + ", screenY: " + e.screenY + ", clientX: " + e.clientX + ", clientY: " + e.clientY);
      console.log("HoverBox.mouseListener() - TCL: hoveredElement", hoveredElement);
      if (this.#previousTarget === hoveredElement) {
        // Avoid repeated calculation and rendering
        return;
      } else {
        target = hoveredElement;
      }
    } else {
      this.#previousTarget = target;
    }
    // The context offset is only needed when we're dealing with iframe contexts as the target's offset is only
    // relative to the iframe, not the top-level document. We recursively search until we've reached the top-level doc
    const contextOffset = { top: 0, left: 0 };
    let contextRoot = target;
    for (let i = 0; i < 10; i++) {
      contextRoot = DOMNode.getParentIframe(contextRoot);
      if (!contextRoot || typeof contextRoot.getBoundingClientRect !== "function") {
        break;
      }
      const rect = contextRoot.getBoundingClientRect();
      contextOffset.top += rect.top;
      contextOffset.left += rect.left;
    }
    const targetOffset = target.getBoundingClientRect();
    // Need scrollX and scrollY to account for scrolling
    this.hoverBox.style.setProperty("top", contextOffset.top + targetOffset.top + window.scrollY - this.borderWidth + "px", "important");
    this.hoverBox.style.setProperty("left", contextOffset.left + targetOffset.left + window.scrollX - this.borderWidth + "px", "important");
    this.hoverBox.style.setProperty("width", targetOffset.width + this.borderWidth * 2 + "px", "important");
    this.hoverBox.style.setProperty("height", targetOffset.height + this.borderWidth * 2 + "px", "important");
    if (this.#triggered && this.action.callback) {
      this.action.callback(target);
      this.#triggered = false;
    }
  }

  /**
   * The click listener prevents click events on the page and calls the callback function for the action (Picker).
   *
   * @param {Event} e - the event with target (element)
   * @returns {boolean} false
   * @see https://stackoverflow.com/a/60345546 for why we add the listener to window and call stopImmediatePropagation()
   * @see https://stackoverflow.com/a/64913288 for why we return false
   * @private
   */
  #clickListener = (e) => {
    let target = e.target;
    console.log("HoverBox.clickListener() - target=");
    console.log(target);
    // This allows us to click into elements inside the shadowRoot or iframe
    if (this.shadows.has(target) || this.iframes.has(target)) {
      return false;
    }
    // Prevents the default click event from happening (sometimes doesn't work on some complex sites)
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    // We set the element as the event's target since it seems to be more accurate than HoverBox's own target
    Picker.updatePicker(target);
    return false;
  }

}