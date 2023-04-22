/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Iframe handles all iframe related tasks like creating iframes and resizing them. It also handles AJAX Iframe and
 * Element Iframe tasks, like scrolling the hidden iframe and mirroring the page to the iframe. Finally, methods for
 * getting elements from the iframe like the next link are provided due to the dynamic nature of when these elements may
 * load/appear in the iframe.
 */
class Iframe {

  /**
   * Awaits loading an iframe.
   *
   * @param {Element} iframe - the iframe
   * @returns {Promise<{}>}
   * @public
   */
  static loadIframe(iframe) {
    console.log("Iframe.loadIframe() - iframe=");
    console.log(iframe);
    return new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = function () {
        console.log("Iframe.loadIframe() - onerror()");
        reject("Iframe.loadIframe() - onerror() - promise rejected");
      };
    });
  }

  /**
   * Creates and appends an iframe. (Waits for the iframe to load.)
   *
   * @param {string} src - the iframe's url
   * @param {string} style - the iframe's style
   * @param {string} mode - the iframe append mode type ("full", "import", "trim")
   * @param {string} caller - the caller who called this function
   * @public
   */
  static async createIframe(src, style, mode, caller) {
    console.log("Iframe.createIframe() - mode=" + mode + ", caller=" + caller);
    // Step 1 Create
    V.iframe = document.createElement("iframe");
    V.iframe.id = V.instance.append === "ajax" ? V.AJAX_IFRAME_ID : V.PAGE_ID + (V.pages.length + 1);
    V.iframe.src = src;
    V.iframe.style = Util.processStyle(style);
    V.iframe.scrolling = "no";
    V.iframe.frameBorder = "0";
    // iframe.sandbox = "allow-same-origin allow-scripts allow-forms";
    // Step 2 Append
    // if (V.instance.append === "element" && (mode === "trim" || mode === "import")) {
    //   appendDivider();
    //   appendLoading();
    // }
    if (mode === "trim") {
      // The insertion point may have been "moved" by the website and no longer have a parentNode, so we re-calculate it to be the last element
      if (!V.insertionPoint || !V.insertionPoint.parentNode || V.insertionPoint.ownerDocument !== document) {
        console.log("Iframe.createIframe() - the insertion point's hierarchy in the DOM was altered. " + (V.insertionPoint ? ("parentNode=" + V.insertionPoint.parentNode + ", ownerDocument === document=" + (V.insertionPoint.ownerDocument === document)) : "insertionPoint is undefined!"));
        V.insertionPoint = Elementify.getInsertionPoint(Elementify.getPageElements(document), false);
      }
      DOMNode.insertBefore(V.iframe, V.insertionPoint);
    } else if (mode === "import") {
      (document.documentElement || document.body).appendChild(V.iframe);
    } else {
      // "full"
      document.body.appendChild(V.iframe);
    }
    try {
      await Iframe.loadIframe(V.iframe);
    } catch (e) {
      // If error (promise rejected), there won't be an iframe.contentDocument, so we don't need to handle it here
      console.log("Iframe.createIframe() - error loading iframe, Error:");
      console.log(e);
    }
    console.log("Iframe.createIframe() - iframe loaded");
    // Step 3 contentDocument
    // If the iframe's document doesn't exist, we can't continue
    if (!V.iframe.contentDocument) {
      console.log("Iframe.createIframe() - error, no iframe.contentDocument!");
      // TODO: We need to reset the instance's URL back to the previous URL so Next.findLink() doesn't return a duplicate URL when we try again. We should refactor the code so that the instance URL is only set after the page has been successfully appended...
      if (V.pages && V.pages.length > 0 && V.pages[V.pages.length - 1]) {
        V.instance.url = V.pages[V.pages.length - 1].url;
      }
      const anchor = document.createElement("a");
      anchor.href = "https://github.com/sixcious/xframey";
      anchor.target = "_blank";
      anchor.innerText = "Xframey";
      Append.appendMessage(chrome.i18n.getMessage("oops_error") + " " + chrome.i18n.getMessage("iframes_not_supported_error"), anchor);
      // Return undefined so the divider gets removed (the iframe technically exists)
      // appendFinally("iframe", undefined, caller);
      // TODO: Should we reset isLoading and keep trying? Valid use case is list and some URLs being from another origin
      // instance.isLoading = false;
      return;
    }
    console.log("Iframe.createIframe() -` iframe.contentDocument.readyState=" + V.iframe.contentDocument.readyState);
    // Note that in the Element Iframe modes, we will again later clone the iframe.contentDocument and set it to currentDocument after we're sure the page elements/next link have been loaded
    V.currentDocument = V.iframe.contentDocument.cloneNode(true);
    // Step 4 Debug
    if (V.instance.debugEnabled) {
      V.iframe.style.setProperty("visibility", "visible", "important");
    }
    // Step 5 Mirror Iframe (Last Step)
    if (caller === "prepareFirstPage" && V.instance.mirrorPage && V.instance.action === "click" && V.instance.append === "ajax") {
      await Iframe.#mirrorPage();
    }
  }

  /**
   * Prepares the hidden iframe for instances that use the reverse workflow. This function is called by both
   * Scroll.prepareFirstPage() ("start") and Workflow.
   *
   * @param {boolean} actionPerformed - true if the previous action in the workflow was performed, false otherwise
   * @param {string} caller - the caller who called this function
   * @public
   */
  static async prepareIframe(actionPerformed, caller) {
    console.log("Iframe.prepareIframe() - actionPerformed=" + actionPerformed + ", caller=" + caller);
    // // Prepend the divider early?
    // if (actionPerformed) {
    //   Scroll.prepend(caller);
    // }
    // This part is only called when starting
    if (caller === "start" || caller === "mirrorPageAdopt" || caller === "setInstance") {
      // Element Iframe
      if (V.instance.append === "element" && V.instance.pageElementIframe) {
        await Action.execute(V.instance.action, "prepareFirstPage");
        await Iframe.createIframe(V.instance.url, V.IFRAME_STYLE + V.IFRAME_FIXED_STYLE, V.instance.pageElementIframe, "prepareFirstPage");
        if (!V.iframe?.contentDocument) {
          return;
        }
        Iframe.scrollIframe();
      }
      // AJAX Iframe
      if (V.instance.append === "ajax" && V.instance.ajaxMode !== "native") {
        // AJAX Iframe needs to create its iframe now to minimize delay
        // If the caller is mirrorPageAdopt, we are calling this function a second time and don't need to create the Iframe again
        if (caller !== "mirrorPageAdopt") {
          await Iframe.createIframe(V.instance.url, V.IFRAME_STYLE + V.IFRAME_FIXED_STYLE, "import", "prepareFirstPage");
          if (!V.iframe?.contentDocument) {
            return;
          }
          // if (instance.mirrorPage && instance.action === "click" && instance.append === "ajax") {
          if (V.instance.mirrorPage && caller !== "setInstance") {
            // return await prepareFirstPage("mirrorPageAdopt");
            return "mirrorPageAdopt";
          }
          Iframe.scrollIframe();
        }
        // Technically just need the click element, but some websites (bb) need extra time before we can click the button
        // So let's wait a minimum of 1 second and wait for the page elements as well to be safe
        // await Iframe.getClickElementFromIframe(V.iframe?.contentDocument);
        await Promise.all([Promisify.sleep(typeof V.instance.iframeDelay === "number" ? V.instance.iframeDelay : 1000), Iframe.getClickElementFromIframe(V.iframe?.contentDocument), Iframe.getPageElementsFromIframe(V.iframe?.contentDocument)]);
        await Action.execute(V.instance.action, "prepareFirstPage");
      }
      return;
    }
    // This part is only called for all successive pages (Page 2+)
    // We check for actionPerformed to make sure the button still exists or the next link was found (e.g. this could be the last page)
    if (actionPerformed) {
      V.instance.workflowSkipAppend = false;
      // We only need to create another iframe if this is the Element append mode as AJAX just uses the same iframe
      if (V.instance.append === "element" && V.instance.pageElementIframe) {
        await Iframe.createIframe(V.instance.url, V.IFRAME_STYLE + V.IFRAME_FIXED_STYLE, V.instance.pageElementIframe, "appendFinally");
      }
      Iframe.scrollIframe();
    } else {
      // If the action wasn't performed, the workflow goes to delay() and will eventually set instance.isLoading to false after a few seconds, allowing us to retry again
      // TODO: Implement logic for when the button isn't found, need to end this, if we can re-call appendFinally after a couple seconds but not add another page, that might be the ideal
      V.instance.workflowSkipAppend = true;
      // Can't do this, if it returns a duplicate URL and action is next, then actionPerformed is false and it will keep removing the pages one by one, causing it to append page 2 again after it is removed (no longer a duplicate)
      // pages.pop();
      // divider.remove();
    }
  }

  /**
   * Resizes an iframe using the iFrameResizer library. This library uses a {@link MutationObserver} to observe the
   * iframe's content as it changes and adjusts the height accordingly.
   *
   * Note: There may be a bug in certain situations where iframe-resizer incorrectly calculates the height and the page
   * becomes too short or too tall. For the latter, consider tracking:
   * https://github.com/davidjbradshaw/iframe-resizer/issues/1062
   * https://github.com/sixcious/infy-scroll/issues/46
   * Example: https://engine.presearch.org
   *
   * For this reason, an option is present to not resize the iframe in the UI Window.
   *
   * @param {HTMLIFrameElement} iframe - the iframe
   * @public
   */
  static resizeIframe(iframe) {
    console.log("Iframe.resizeIframe()");
    try {
      if ((V.instance.append === "iframe" || (V.instance.append === "element" && V.instance.pageElementIframe === "trim")) && iframe && iframe.contentDocument) {
        if (V.instance.iframeResize) {
          // Inject the iFrameResize.contentWindow script into the iframe to allow message passing between the two objects
          const iframeDoc = iframe.contentDocument;
          const script = iframeDoc.createElement("script");
          // We have two ways to do this: 1) Make the script's textContent = to the text of our script or 2) set the src to the chrome location
          // const response = await fetch(chrome.runtime.getURL("/lib/iframe-resizer/iframeResizer.contentWindow.js"));
          // script.textContent = await response.text();
          script.src = chrome.runtime.getURL("/lib/iframe-resizer/iframeResizer.contentWindow.js");
          (iframeDoc.head || iframeDoc.body || iframeDoc.documentElement).appendChild(script);
          // Note that iframeResizer will set the iframe's id with the default pattern "iframeResizer#" (starting at 0)
          // Remember: we do the resize right before we add the next page, so add 1 to the id (like we do with the divider id)
          iFrameResize({id: V.PAGE_ID + (V.pages.length + 1)}, iframe);
        } else {
          // Try and resize the iframe manually after waiting a couple seconds; this helps on some websites, e.g. (p)
          for (let i = 1; i <= 2; i++) {
            setTimeout(() => { iframe.style.setProperty("height", Util.getTotalHeight(iframe.contentDocument) + "px", "important"); }, i * 1000);
          }
        }
      }
    } catch (e) {
      console.log("Iframe.resizeIframe() - Error:");
      console.log(e);
    }
  }

  /**
   * Scrolls the current hidden iframe indefinitely, or for a set number of seconds.
   *
   * @param {number} ms - the length of time to scroll, in milliseconds
   * @public
   */
  static async scrollIframe(ms = 10000) {
    console.log("Iframe.scrollIframe()");
    if (!V.instance.scrollIframeEnabled) {
      return;
    }
    // This property and the timeout is needed to make this run for a set number of seconds
    V.instance.scrollIframe = true;
    // Important: The height matters on some websites. If we only make this 0px or even 1px, it won't be enough to get the images to lazy load (e.g. "p" mobile)
    if (V.instance.debugEnabled) {
      // If we're debugging, we want to make the iframe take up a small space on the screen and have a scrollbar (which will show up after the iframe has been scrolled), also need z-index in case site has an element or popup with higher z-index
      V.iframe.style.setProperty("height", "250px", "important");
      V.iframe.style.setProperty("z-index", "2147483647", "important");
      V.iframe.removeAttribute("scrolling");
    } else {
      V.iframe.style.setProperty("height", ((Math.min(document.documentElement?.clientHeight, window.innerHeight) + "") || "500") + "px", "important");
    }
    clearTimeout(V.timeouts.scrollIframe);
    V.timeouts.scrollIframe = setTimeout(() => {
      V.instance.scrollIframe = false;
    }, ms);
    let attempt = 0;
    while (V.instance.enabled && V.instance.scrollIframe) {
      // TODO: Always just scroll the full iframe? Worried Util.getTotalHeight() may not return the full height on some sites, so using a hybrid approach for now
      // await scrollIframe(iframe, "full");
      console.log("Iframe.scrollIframe() - attempt=" + attempt + ", mode=" + ((((attempt) % 2) === 0) ? "full" : "element"));
      // Firefox Dead Object Error: Need to wrap this in a try-catch because the iframe document may have changed after we slept, and the pageElements may be dead
      try {
        await Iframe.#scrollIframe2(V.iframe, ((attempt++) % 2) === 0 ? "full" : "element");
      } catch (e) {
        console.log("Iframe.scrollIframe() - Error (most likely Firefox Dead Object Error):");
        console.log(e);
        break;
      }
    }
    if (!V.instance.debugEnabled) {
      V.iframe.style.setProperty("height", "0", "important");
      V.iframe.style.setProperty("z-index", "auto", "important");
    }
  }

  /**
   * Scrolls the hidden iframe. This is done to force the site to lazy load the page elements' (e.g. images) before they
   * are transferred from the iframe to the top-level document. This is also done to ensure other important elements
   * such as the button or next link are lazily loaded, if applicable.
   *
   * @param {HTMLIFrameElement} iframe - the iframe to scroll
   * @param {string} mode - the scroll mode ("full" to scroll the full page or "element" for just the page elements)
   * @private
   */
  static async #scrollIframe2(iframe, mode) {
    await Promisify.sleep(1);
    if (!iframe || !iframe.contentDocument) {
      return;
    }
    if (mode === "full") {
      const height = Util.getTotalHeight(iframe.contentDocument);
      for (let i = 0; i < height; i+= 25) {
        if (!V.instance.scrollIframe) {
          break;
        }
        iframe.contentWindow.scrollTo({top: i, left: 0, behavior: "auto"});
        await Promisify.sleep(1);
      }
    } else {
      let pageElements = Elementify.getPageElements(iframe.contentDocument);
      // If no page elements exist, default to body's first-level children (i.e. mirrorPage puppet)
      if (!pageElements || pageElements.length === 0) {
        pageElements = DOMNode.getElements("body > *", "selector", iframe.contentDocument).elements;
      }
      // Scroll by pageElements (scrollIntoView)
      // Note: If the pageElements is just one element (e.g. a container element), look at its children (risky)
      for (const pageElement of (pageElements.length === 1 && pageElements[0] && pageElements[0].children ? pageElements[0].children : pageElements)) {
        // If scrollIframe was set to false, we need to exit this loop immediately (only really needed for Element Iframe Trim)
        if (!V.instance.scrollIframe) {
          break;
        }
        // We only want to scroll if the pageElement hasn't been imported to the top-level document
        if (pageElement.ownerDocument === iframe.contentDocument) {
          // "start" seems to perform the best; options are start, end, center, nearest
          pageElement.scrollIntoView({behavior: "auto", block: "start", inline: "start"});
        }
        // We must sleep for at least 0ms or else this strategy won't work (using 1ms to be safe)
        await Promisify.sleep(1);
      }
      // TODO: This doesn't seem to work after the first page or two; it may be a positioning issue
      // // Scroll by pageElements top and bottom (scrollTo)
      // const filteredElements = pageElements.filter(e => e.nodeType === Node.ELEMENT_NODE);
      // const top = Math.min(...(filteredElements.map(e => DOMNode.getElementPosition(e).top)));
      // const bottom = Math.max(...(filteredElements.map(e => DOMNode.getElementPosition(e).bottom)));
      // for (let i = top; i < bottom; i += 25) {
      //   iframe.contentWindow.scrollTo({top: i, left: 0, behavior: "auto"});
      //   await Promisify.sleep(1);
      // }
    }
  }

  /**
   * Mirrors the page (the top-level document) to the AJAX Iframe.
   *
   * Note: This function is only called by createIframe().
   *
   * @private
   */
  static async #mirrorPage() {
    console.log("Iframe.mirrorPage() - mirroring the top-level document to the iframe");
    const iframeDocument = V.iframe?.contentDocument;
    switch (V.instance.mirrorPage) {
      case "puppet":
        const puppetScript = V.instance.puppet.split(";\n").filter(Boolean);
        console.log("Iframe.mirrorPage() - puppet=");
        console.log(puppetScript);
        if (Array.isArray(puppetScript) && puppetScript.length > 0) {
          // await scrollIframe(2000);
          Iframe.scrollIframe();
          // Currently only supports clicks, e.g. await page.click("#button");
          for (const line of puppetScript) {
            const regex = new RegExp("click\\([\"|\'](.*)[\"|\']\\)").exec(line);
            if (regex && regex[1]) {
              console.log("Iframe.mirrorPage() - puppet click(), path=" + regex[1]);
              const path = regex[1];
              await Iframe.getClickElementFromIframe(iframeDocument, "selector", path);
              Click.clickElement(path, "selector", iframeDocument);
            }
          }
          V.instance.scrollIframe = false;
        }
        break;
      case "adopt":
        // Adopting is rather complicated. First, we adopt the nodes into the iframe from the page
        iframeDocument.documentElement.replaceChild(iframeDocument.adoptNode(document.head), iframeDocument.head);
        iframeDocument.documentElement.replaceChild(iframeDocument.adoptNode(document.body), iframeDocument.body);
        // Second, we recreate the page's two compartments
        DOMNode.insertBefore(document.createElement("head"), V.iframe);
        DOMNode.insertBefore(document.createElement("body"), V.iframe);
        // Finally, we clone the iframe's transferred nodes and import them back to the page
        document.documentElement.replaceChild(document.importNode(iframeDocument.head, true), document.head);
        document.documentElement.replaceChild(document.importNode(iframeDocument.body, true), document.body);
        break;
      // case "import":
      default:
        // @see https://stackoverflow.com/a/11627589/988713
        // We need to mirror the current page the user is viewing
        iframeDocument.replaceChild(iframeDocument.importNode(document.documentElement, true), iframeDocument.documentElement);
        break;
    }
    if (["import", "adopt"].includes(V.instance.mirrorPage)) {
      // Remove the AJAX Iframe from the mirror
      iframeDocument.querySelector(V.AJAX_IFRAME_ID)?.remove();
      // // Add scripts to add event listeners?
      // const scripts = Array.from(iframeDocument.querySelectorAll("script"));
      // const script = iframeDocument.createElement("script");
      // script.textContent = "console.log('Iframe Script Test 1!'); (() => { console.log('Iframe Script Test 2!'); })();";
      // scripts.push(script);
      // const fragment = document.createDocumentFragment();
      // scripts.forEach(script => fragment.appendChild(script));
      // iframeDocument.body.appendChild(fragment);
    }
    // Some breathing space after all the mirroring (not necessary?)
    await Promisify.sleep(500);
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
  static async getNextLinkFromIframe(iframeDoc, attempt = 0) {
    const result = Next.findLinkWithInstance(V.instance, V.items, V.instance.action, [iframeDoc], V.pages);
    // Recursively call this function and try again if no next link was found.
    // TODO: This will always take the full amount of attempts on the last page! Is there a way to detect this is the last page at this point and increase the max attempts?
    if (attempt < 15 && !result?.url && !result.duplicate) {
      await Promisify.sleep(200);
      return await Iframe.getNextLinkFromIframe(iframeDoc, attempt + 1);
    }
    console.log("Iframe.getNextLinkFromIframe() - took " + (attempt * 200) + "ms, result.url=" + result?.url);
    return result;
  }

  /**
   * Gets the click element from an iframe. This is only used by the AJAX Iframe append mode to verify that the click element
   * is in the iframe when preparing the first page or mirroring it.
   *
   * @param {Document} iframeDoc - the iframe document
   * @param {string} type - (optional) the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {string} path - (optional) the selector, xpath, or js path
   * @param {number} attempt - the current attempt number
   * @returns {Element} the button
   * @public
   */
  static async getClickElementFromIframe(iframeDoc, type = undefined, path = undefined, attempt = 0) {
    path = typeof path === "string" ? path : V.instance.clickElementPath;
    type = typeof type === "string" ? type : V.instance.clickElementType;
    const result = Click.findElement(path, type, iframeDoc, false);
    // Recursively call this function and try again if no element was found.
    // TODO: This will always take the full amount of attempts on the last page! Is there a way to detect this is the last page at this point and increase the max attempts?
    if (attempt < 25 && !result?.element) {
      await Promisify.sleep(200);
      return await Iframe.getClickElementFromIframe(iframeDoc, type, path, attempt + 1);
    }
    console.log("Iframe.getClickElementFromIframe() - took " + (attempt * 200) + "ms, result.button=" + result?.element);
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
  static async getPageElementsFromIframe(iframeDoc, attempt = 0) {
    const pageElements = Elementify.getPageElements(iframeDoc);
    // Determine if the page elements are placeholder ghost nodes by comparing the innerHTML of each of the page elements to see if they are the same
    const innerHTMLs = [];
    // If the pageElements is just one element (e.g. a container element), look at its children (risky)
    for (const pageElement of (pageElements?.length === 1 && pageElements[0] && pageElements[0].children ? pageElements[0].children : pageElements)) {
      innerHTMLs.push(pageElement.innerHTML);
    }
    let isLikelyGhostNodes = false;
    for (let i = 0; i < innerHTMLs.length - 1; i++) {
      if (innerHTMLs[i] === innerHTMLs[i + 1]) {
        isLikelyGhostNodes = true;
        console.log("Iframe.getPageElementsFromIframe() - ghost nodes encountered");
        break;
      }
    }
    let hasLoadElements = false;
    if (V.instance.loadElementPath) {
      const loadElements = DOMNode.getElements(V.instance.loadElementPath, V.instance.pageElementType, iframeDoc).elements;
      if (loadElements.length > 0) {
        hasLoadElements = true;
        console.log("Iframe.getPageElementsFromIframe() - loadElements encountered, loadElements=");
        console.log(loadElements);
      }
    }
    // Recursively call this function and try again if no page elements were found or if they appear to be ghost nodes
    if ((pageElements.length <= 0 && attempt < 25) || (hasLoadElements && attempt < 25) || (isLikelyGhostNodes && attempt < 15)) {
      await Promisify.sleep(200);
      return await Iframe.getPageElementsFromIframe(iframeDoc, attempt + 1);
    }
    console.log("Iframe.getPageElementsFromIframe() - took " + (attempt * 200) + "ms, pageElements.length=" + pageElements?.length + ", isLikelyGhostNodes=" + isLikelyGhostNodes);
    return pageElements;
  }

}