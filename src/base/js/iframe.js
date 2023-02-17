/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Iframe handles all iframe related tasks like loading iframes.
 *
 * TODO: Continue moving iframe related code in here.
 */
const Iframe = (() => {

  /**
   * Loads an iframe.
   *
   * @param {Element} iframe - the iframe
   * @returns {Promise<{}>}
   * @public
   */
  function loadIframe(iframe) {
    console.log("loadIframe() - iframe=");
    console.log(iframe);
    return new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = function () {
        console.log("loadIframe() onerror()");
        reject("loadIframe() onerror() - promise rejected");
      };
    });
  }

  /**
   * Gets the next link from an iframe. Technically, only Element Iframe (Trim) mode needs this as the Import mode will
   * have the iframe remain on the page.
   *
   * @param {Document} iframeDoc - the iframe document
   * @param {number} attempt - the current attempt number
   * @returns {*} the next url (if found) along with extra details used to find it (or an error message)
   * @public
   */
  async function getNextLinkFromIframe(iframeDoc, attempt = 0) {
    const instance = Scroll.get("instance");
    const items = Scroll.get("items");
    const pages = Scroll.get("pages");
    const result = Next.findLinkWithInstance(instance, items, instance.action, [iframeDoc], pages);
    // Recursively call this function and try again if no next link was found.
    // TODO: This will always take the full amount of attempts on the last page! Is there a way to detect this is the last page at this point and increase the max attempts?
    if (attempt < 15 && !result?.url && !result.duplicate) {
      await Promisify.sleep(200);
      return await getNextLinkFromIframe(iframeDoc, attempt + 1);
    }
    console.log("getNextLinkFromIframe() - took " + (attempt * 200) + "ms, result.url=" + result?.url);
    return result;
  }

  /**
   * Gets the button from an iframe. This is only used by the AJAX Iframe append mode.
   *
   * @param {Document} iframeDoc - the iframe document
   * @param {number} attempt - the current attempt number
   * @returns {Element} the button
   * @public
   */
  async function getButtonFromIframe(iframeDoc, attempt = 0) {
    const instance = Scroll.get("instance");
    const result = Click.findButton(instance.buttonPath, instance.buttonType, iframeDoc, false);
    // Recursively call this function and try again if no next link was found.
    // TODO: This will always take the full amount of attempts on the last page! Is there a way to detect this is the last page at this point and increase the max attempts?
    if (attempt < 25 && !result?.button) {
      await Promisify.sleep(200);
      return await getButtonFromIframe(iframeDoc, attempt + 1);
    }
    console.log("getButtonFromIframe() - took " + (attempt * 200) + "ms, result.button=" + result?.button);
    return result;
  }

  /**
   * Gets the page elements from an iframe. This is used by the Element Iframe Trim/Import and AJAX Iframe append modes.
   *
   * @param {Document} iframeDoc - the iframe document
   * @param {number} attempt - the current attempt number
   * @returns {Element[]} the page elements
   * @public
   */
  async function getPageElementsFromIframe(iframeDoc, attempt = 0) {
    const instance = Scroll.get("instance");
    const pageElements_ = Elementify.getPageElements(iframeDoc);
    // Determine if the page elements are placeholder ghost nodes by comparing the innerHTML of each of the page elements to see if they are the same
    const innerHTMLs = [];
    // If the pageElements is just one element (e.g. a container element), look at its children (risky)
    for (const pageElement of (pageElements_?.length === 1 && pageElements_[0] && pageElements_[0].children ? pageElements_[0].children : pageElements_)) {
      innerHTMLs.push(pageElement.innerHTML);
    }
    let isLikelyGhostNodes = false;
    for (let i = 0; i < innerHTMLs.length - 1; i++) {
      if (innerHTMLs[i] === innerHTMLs[i +1]) {
        isLikelyGhostNodes = true;
        console.log("getPageElementsFromIframe() - ghost nodes encountered");
        break;
      }
    }
    let hasLoadElements = false;
    if (instance.loadElementPath) {
      const loadElements = DOMNode.getElements(instance.loadElementPath, instance.pageElementType, iframeDoc).elements;
      if (loadElements.length > 0) {
        hasLoadElements = true;
        console.log("getPageElementsFromIframe() - loadElements encountered, loadElements=");
        console.log(loadElements);
      }
    }
    // Recursively call this function and try again if no page elements were found or if they appear to be ghost nodes
    if ((pageElements_.length <= 0 && attempt < 25) || (hasLoadElements && attempt < 25) || (isLikelyGhostNodes && attempt < 15)) {
      await Promisify.sleep(200);
      return await getPageElementsFromIframe(iframeDoc, attempt + 1);
    }
    console.log("getPageElementsFromIframe() - took " + (attempt * 200) + "ms, pageElements.length=" + pageElements_?.length + ", isLikelyGhostNodes=" + isLikelyGhostNodes);
    return pageElements_;
  }


  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    loadIframe,
    getNextLinkFromIframe,
    getButtonFromIframe,
    getPageElementsFromIframe
  };

})();