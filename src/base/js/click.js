/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Click handles all logic needed for the "Click Button" action. This includes finding the button on the page and
 * clicking it.
 */
const Click = (() => {

  /**
   * Finds a button on the page.
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {Document} doc - the document to evaluate against
   * @param {boolean} highlight - true if this element should be highlighted, false otherwise
   * @returns {{button: Element, details: Object}} the button element (if found) and the details object
   * @public
   */
  function findButton(path, type, doc, highlight) {
    let button;
    // Stores the exception or error message in order to return it back to the user for feedback (e.g. invalid selector)
    const details = {};
    try {
      // TODO: We always get the "last" button on the page, not the "first"?
      const result = DOMNode.getElement(path, type, "last", doc);
      button = result.element;
      // TODO: Should we ensure the button is visible on the page?
      //   Some sites only hide the button after the last page, but it is still clickable and can repeat the last page (e.g. sr.com)
      details.error = result.error;
      details.found = !!button;
      details.clickable = !!(button && typeof button.click === "function");
      details.buttonNode = button ? button.nodeName : "";
      highlightElement(button, highlight);
    } catch (e) {
      console.log("findButton() - Error:");
      console.log(e);
      details.error = e.message;
    }
    console.log("findButton() - type=" + type + ", path=" + path + ", button=");
    console.log(button);
    return { button: button, details: details };
  }

  /**
   * Clicks a button on the page.
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {Document} doc - the document to evaluate against
   * @returns {{clicked: boolean, url: string}} true if the button was clicked, false otherwise and the url of the button if it exists
   * @public
   */
  function clickButton(path, type, doc) {
    let clicked = false;
    let url = "";
    const button = findButton(path, type, doc, false).button;
    try {
      if (button && typeof button.click === "function") {
        url = button.href || button.action || button.formAction || "";
        // If this isn't the top-level document (i.e. this is an iframe). Some sites will open the next page in a new tab and have target="_blank" (e.g. Amazon Search)
        if (doc !== document && button.target && button.target !== "_self") {
          console.log("clickButton() - changing target because button.target=" + button.target);
          button.setAttribute("target", "_self");
        }
        button.click();
        clicked = true;
      }
    } catch (e) {
      console.log("clickButton() - Error:");
      console.log(e);
    }
    console.log("clickButton() - clicked=" + clicked + ", url=" + url);
    return { clicked: clicked, url: url };
  }

  /**
   * Highlights the element on the page.
   * Important: If the element isn't in the top-level document, it can't be highlighted.
   *
   * @param {Element} element - the element
   * @param {boolean} highlight - true if this element should be highlighted, false otherwise
   * @private
   */
  function highlightElement(element, highlight) {
    try {
      if (highlight && typeof HoverBox !== "undefined") {
        new HoverBox().highlightElement(element, true);
      }
    } catch (e) {
      console.log("highlightElement() - Error:");
      console.log(e);
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    findButton,
    clickButton
  };

})();