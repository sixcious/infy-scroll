/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Button handles all logic needed for the "Click Button" action, mainly finding the button on the page or clicking it.
 *
 * The algorithm is similar to Next in that it finds the button element via a Selector/XPath expression.
 */
const Button = (() => {

  /**
   * Finds a button on the page.
   *
   * TODO: Parse iframes (and older frames and framesets?) nested inside the document
   *
   * @param type the path type to use ("selector" or "xpath")
   * @param path the css selector or xpath expression to use
   * @param highlight true if this element should be highlighted, false otherwise
   * @param doc the current document on the page to query
   * @returns {*} the button element (if found) and the details object
   * @public
   */
  function findButton(type, path, highlight, doc) {
    let button;
    // Stores the exception or error message in order to return it back to the user for feedback (e.g. invalid selector)
    const details = {};
    try {
      // TODO: We always get the "last" button on the page, not the "first"?
      if (type === "xpath") {
        // button = doc.evaluate(path, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        const result = doc.evaluate(path, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        button = result && result.snapshotLength > 0 ? result.snapshotItem(result.snapshotLength - 1) : undefined;
      } else {
        // button = doc.querySelector(path);
        const result = doc.querySelectorAll(path);
        button = result && result.length > 0 ? result[result.length - 1] : undefined;
      }
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
   * @param type the path type to use ("selector" or "xpath")
   * @param path the css selector or xpath expression to use
   * @param doc the current document on the page to query
   * @returns {boolean} true if the button action was performed, false otherwise
   * @public
   */
  function clickButton(type, path, doc) {
    console.log("clickButton() - type=" + type + ", path="  + path);
    let actionPerformed = false;
    const button = findButton(type, path, false, doc).button;
    try {
      if (button && typeof button.click === "function") {
        button.click();
        actionPerformed = true;
      }
    } catch (e) {
      console.log("clickButton() - Error:");
      console.log(e);
    }
    return actionPerformed;
  }

  /**
   * Highlights the element on the document page.
   *
   * @param element   the DOM element to highlight
   * @param highlight true if highlighting is enabled, false otherwise
   * @private
   */
  function highlightElement(element, highlight) {
    try {
      if (highlight && typeof HoverBox !== "undefined") {
        new HoverBox().highlightElement(element, true);
      }
    } catch(e) {
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