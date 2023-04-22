/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Click handles all logic needed for the "Click Button" action. This includes finding the element on the page and
 * clicking it.
 */
class Click {

  /**
   * Finds the element to click on the page.
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {Document} doc - the document to evaluate against
   * @param {boolean} highlight - true if this element should be highlighted, false otherwise
   * @returns {{element: Element, details: Object}} the click element (if found) and the details object
   * @public
   */
  static findElement(path, type, doc, highlight = false) {
    let element;
    // Stores the exception or error message in order to return it back to the user for feedback (e.g. invalid selector)
    const details = {};
    try {
      // TODO: Should we always get the "last" button on the page, not the "first"?
      const result = DOMNode.getElement(path, type, "last", doc);
      element = result.element;
      // TODO: Should we ensure the button is visible on the page?
      //   Some sites only hide the button after the last page, but it is still clickable and can repeat the last page (e.g. sr.com)
      details.error = result.error;
      details.found = !!element;
      details.clickable = !!(element && typeof element.click === "function");
      details.nodeName = element?.nodeName || "";
      Click.#highlightElement(element, highlight);
    } catch (e) {
      console.log("Click.findElement() - Error:");
      console.log(e);
      details.error = e.message;
    }
    console.log("Click.findElement() - type=" + type + ", path=" + path + ", element=");
    console.log(element);
    return { element: element, details: details };
  }

  /**
   * Clicks an element on the page.
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {Document} doc - the document to evaluate against
   * @returns {{clicked: boolean, url: string, element: Element}} true if the element was clicked, false otherwise and the url of the click element if it exists and the click element itself
   * @public
   */
  static clickElement(path, type, doc) {
    let clicked = false;
    let url = "";
    const element = Click.findElement(path, type, doc, false).element;
    try {
      if (element && typeof element.click === "function") {
        url = element.href || element.action || element.formAction || "";
        // If this isn't the top-level document (i.e. this is an iframe). Some sites will open the next page in a new tab and have target="_blank" (e.g. Amazon Search)
        if (doc !== document && element.target && element.target !== "_self") {
          console.log("Click.clickElement() - changing target because element.target=" + element.target);
          element.setAttribute("target", "_self");
        }
        element.click();
        clicked = true;
      }
    } catch (e) {
      console.log("Click.clickElement() - Error:");
      console.log(e);
    }
    console.log("Click.clickElement() - clicked=" + clicked + ", url=" + url);
    return { clicked: clicked, url: url, element: element };
  }

  /**
   * Highlights the element on the page.
   * Important: If the element isn't in the top-level document, it can't be highlighted.
   *
   * @param {Element} element - the element
   * @param {boolean} highlight - true if this element should be highlighted, false otherwise
   * @private
   */
  static #highlightElement(element, highlight) {
    try {
      if (highlight && typeof HoverBox !== "undefined") {
        new HoverBox().highlightElement(element, true);
      }
    } catch (e) {
      console.log("Click.highlightElement() - Error:");
      console.log(e);
    }
  }

}