/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * List handles all logic needed for the "URL List" action, mainly finding all the links on the page.
 *
 * TODO: Move array/list related features from increment.js to here.
 */
const List = (() => {

  /**
   * Finds all the links (URLs) on the page and returns them as an array.
   *
   * @returns {[]} the array of links (URLs)
   * @public
   */
  function findLinks() {
    console.log("findLinks()");
    // We use a set instead of an array to avoid duplicate links, note in JS that Sets maintain insertion order
    const links = new Set();
    // TODO: Just check [href] regardless of element tag names?
    const elements = document.querySelectorAll("link[href], a[href], area[href], form[action], button[formaction], img[src], video[src], audio[src]");
    for (const element of elements) {
      try {
        // Try to obtain the URL from the element by looking at what type of element it is and checking for properties that typically store URLs
        const elementName = element.nodeName.toLowerCase();
        let url = element.href ? element.href : elementName === "form" && element.action ? element.action : elementName === "button" && element.formAction ? element.formAction : ["img", "video", "audio"].includes(elementName) && element.src ? element.src : "";
        // Fix the Link before testing if it's valid
        url = Util.fixURL(url);
        // Make sure we check if this URL has a valid extension when we're checking for list URLs!
        if (Util.isValidURL(url, "list") && Util.isValidExtension(url, "list")) {
          links.add(url);
        }
      } catch (e) {
        console.log("findLinks() - Error:");
        console.log(e);
      }
    }
    return Array.from(links);
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    findLinks
  };

})();