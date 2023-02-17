/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Scroll is the main content script and handles all infinite scrolling logic.
 *
 * This includes the following two purposes:
 * 1. Scroll Detection - This can either be implemented via a Scroll Listener or Intersection Observer
 * 2. Appending of Pages* - Supports 6 modes: Page, Iframe, Element, Media, None, AJAX
 *
 * Scroll delegates business logic involving the workflow to Workflow and actions to Action.
 *
 * *Append business logic is currently in Scroll, but should be refactored into a separate file (Append).
 *
 * To understand the workflow of how actions and appends are executed, see Workflow.
 *
 * Note that the instance is primarily stored in this object. Therefore, if the Action or other area of the extension
 * needs access to it, a getter is provided.
 *
 * TODO: Move the Append code into its own file (Append - append.js)
 * TODO: For better accuracy with IntersectionObserver, observe more than just one element for each page
 * TODO: Move scrollbarExists and scrollbarAppends outside of the instance and into variable here called scrollbar (we only use them here)
 * TODO: Make PAGE_STYLE, IFRAME_STYLE, and such non constants so we can call processStyle on them in init once?
 * TODO: Should we replace: 1) document.body calls with (document.body || document.documentElement) 2) removeChild with remove 3) :scope with body in selectors?
 * TODO: Change Node.ownerDocument !== document to !document.contains(Node)?
 */
const Scroll = (() => {

  /**
   * Variables
   *
   * @param {string} EVENT_ON - the custom event name for when Infy Scroll turns itself on
   * @param {string} EVENT_PAGE_APPENDED - the custom event name for when a page is appended
   * @param {string} EVENT_NODE_APPENDED - the custom event name for when a node is appended
   * @param {string} EVENT_AJAX - the custom event name for when interacting with the injected ajax script in AJAX Native mode
   * @param {string} DIVIDER_CLASS - the class name to set the divider with
   * @param {string} PAGE_STYLE - the css that is used for the Page append mode
   * @param {string} IFRAME_STYLE - the css that is used for the Iframe append mode
   * @param {string} MEDIA_STYLE - the css that is used for the Media append mode
   * @param {string} IFRAME_FIXED_STYLE - the css that is used for iframes that need to remain fixed on the screen (Element Iframe Import and AJAX)
   * @param {Object} instance - the instance object that contains all the properties for this page (such as the URL, action, and append mode)
   * @param {Object} items - the storage items cache containing the user's settings
   * @param {Object[]} pages - the pages array that contains a reference to each appended page in the DOM
   * @param {Document} currentDocument - the cloned full document for the current (latest) page that is being observed
   * @param {Document} iframeDocument - the live iframe document for the current (latest) page that is being observed
   * @param {Node} insertionPoint - the insertion point is only used in append element mode and is the point at the bottom of the content to start inserting more elements
   * @param {Element[]} pageElements - the current page's array of page elements (in append element mode)
   * @param {Element} button - the current button used for the Click Button action
   * @param {HTMLIFrameElement} iframe - the current iframe that was appended for the current page
   * @param {Map<String, Element>} lazys - the lazy image/media elements that we obtain in fixLazyLoadingPre() and that we then need to later handle in fixLazyLoadingPost() after they are appended
   * @param {Element} bottom - the bottom element to track in Intersection Observer mode
   * @param {number} offset - the offset is the pixels from the bottom of the content (e.g. elements or buttonPosition) to the very bottom of the HTML document
   * @param {Element} loading - the loading element that is appended while a new page is being loaded
   * @param {Element} divider - the last page divider element that was appended; we store this in order to not have to re-calculate the colSpan again for future dividers in Append Element mode (tables)
   * @param {Element} overlay - (optional) the overlay element that is fixed onto the page, showing the current page number and total pages
   * @param {Object} timeouts - the reusable timeouts object that stores all named timeouts used on this page
   * @param {Object} checks - the object that keeps track of whether a specific task was completed (e.g. injecting the ajax script)
   * @param {function} scrollListener - the scroll listener callback function that fires every time the user scrolls. It calls the reusable scrollDetection function. Note this is written as a variable instead of a function due to the tricky way event listeners work
   * @param {IntersectionObserver} intersectionObserver - the observer that observes elements in Intersection Observer mode (not the callback function)
   * @param {IntersectionObserver} bottomObserver - the observer that observes the bottom element and determines if another page should be appended in Intersection Observer mode
   * @param {MutationObserver} ajaxObserver - the observer that observes the mutations in the AJAX Native append mode
   * @param {MutationObserver} spaObserver - the observer that observes the mutations if this is an SPA that changes its page content dynamically
   */
  // Note that the *only* reason why we use the same event names as AP is strictly for backwards compatibility with older scripts
  const EVENT_ON = "GM_AutoPagerizeLoaded";
  const EVENT_PAGE_APPENDED = "GM_AutoPagerizeNextPageLoaded";
  const EVENT_NODE_APPENDED = "AutoPagerize_DOMNodeInserted";
  const EVENT_AJAX = "InfyScrollAJAX";
  // Fixes #22 https://github.com/sixcious/infy-scroll/issues/22 - Some external extensions (e.g. Ublacklist) require us to add this specific AP className in order to recognize DOM mutations whenever Infy appends another page on Google Search
  const DIVIDER_CLASS = "autopagerize_page_info";
  // Note: Do not set min-height: 0, this causes issues, always initial (auto) or leave it out TODO: Decide on how to set z-index for these three styles. They are position: static (initial) and have z-index: auto. We need the overlay, 2 loading, and message to have the z-index be higher than these so we can't use z-index: 2147483647. Is it better to NOT have a z-index applied to them?
  const PAGE_STYLE =   "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: auto; margin: 0 0 2rem 0; max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0;                   padding: 0; position: static; visibility: visible; width: auto; z-index: auto;";
  const IFRAME_STYLE = "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: 0;    margin: 0 0 2rem 0; max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0; overflow: hidden; padding: 0; position: static; visibility: visible; width: 100%; z-index: auto;";
  const MEDIA_STYLE =  "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: flex;  float: none; height: auto; margin: 2rem auto;  max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0;                   padding: 0; position: static; visibility: visible; width: auto; z-index: auto;";
  const IFRAME_FIXED_STYLE = " position: fixed; bottom: 0; left: 0; visibility: hidden; height: 500px;"
  // We should initialize the instance to an empty object to avoid potential NPEs because we sometimes use it as a default value for some method arguments e.g. (x = instance.x, ...)
  let instance = {};
  let items = {};
  let pages = [];
  let currentDocument = document;
  let iframeDocument;
  let insertionPoint;
  let pageElements;
  let button;
  let iframe;
  let lazys;
  let bottom;
  let offset = 0;
  let loading;
  let divider;
  let overlay;
  let timeouts = {};
  let checks = {};
  let scrollListener;
  let intersectionObserver;
  let bottomObserver;
  let ajaxObserver;
  let spaObserver;

  /**
   * Gets a variable.
   *
   * @param {string} name - the variable's name
   * @returns {*} the variable
   * @public
   */
  function get(name) {
    switch(name) {
      case "instance": return instance;
      case "items": return items;
      case "pages": return pages;
      case "currentDocument": return currentDocument;
      case "iframeDocument": return iframeDocument;
      case "insertionPoint": return insertionPoint;
      case "pageElements": return pageElements;
      case "button": return button;
      case "iframe": return iframe;
      case "lazys": return lazys;
      case "offset": return offset;
      case "bottom": return bottom;
      case "loading": return loading;
      case "divider": return divider;
      case "overlay": return overlay;
    }
  }

  /**
   * Sets a variable.
   *
   * @param {string} name - the variable's name
   * @param {*} value - the value to set the variable with
   * @public
   */
  function set(name, value) {
    switch (name) {
      case "instance": instance = value; break;
      case "items": items = value; break;
      case "pages": pages = value; break;
      case "currentDocument": currentDocument = value; break;
      case "iframeDocument": iframeDocument = value; break;
      case "insertionPoint": insertionPoint = value; break;
      case "pageElements": pageElements = value; break;
      case "button": button = value; break;
      case "iframe": iframe = value; break;
      case "lazys": lazys = value; break;
      case "offset": offset = value; break;
      case "bottom": bottom = value; break;
      case "loading": loading = value; break;
      case "divider": divider = value; break;
      case "overlay": overlay = value; break;
    }
  }

  /**
   * Gets all the declared variables for debugging purposes.
   *
   * @returns {*} the variables
   * @public
   * @debug
   */
  function debug() {
    return {
      instance, items, pages, currentDocument, iframeDocument, insertionPoint, pageElements, button, iframe, lazys,
      bottom, offset, loading, divider, overlay
      // TODO: Is it safe to return the below? (Don't really need them)
      , timeouts, scrollListener, intersectionObserver, bottomObserver, ajaxObserver, spaObserver
    };
  }

  /**
   * Adds the scroll detection (either Scroll Listener or Intersection Observer).
   *
   * @see https://developer.mozilla.org/docs/Web/API/Document/scroll_event
   * @see https://developer.mozilla.org/docs/Web/API/Intersection_Observer_API
   * @private
   */
  function addScrollDetection() {
    removeScrollDetection();
    console.log("addScrollDetection() - adding " + instance.scrollDetection);
    // Can't use Intersection Observer when the append mode is none because we are not observing the button/page elements
    // TODO: Add IO support for none by observing the button element?
    if (instance.scrollDetection === "io" && instance.append !== "none") {
      // root: null means document. rootMargin: "0px 0px 1% 0px" is what we were previously using (basically 0px with extra bottom of 1%). Alternatively, "0px 0px -99% 0px" will only trigger when the top of the next page has been intersected. Use 0% or 1% to intersect the earliest (when any part of the next page is on the screen)
      intersectionObserver = new IntersectionObserver(intersectionObserverCallback, { root: null, rootMargin: "0px", threshold: 0 });
      // Need this for loop to 1) observe the first page due to prepareFirstPage() being called before the intersectionObserver is made, and 2) when re-enabling an instance after a stop
      for (const page of pages) {
        // try-catch because observe will throw an exception if the element is undefined or not a Node.ELEMENT_NODE
        try {
          intersectionObserver.observe(page.element);
        } catch (e) {
          console.log(e);
        }
        // for (const bottomElement of page.bottomElements) {
        //   intersectionObserver.observe(bottomElement);
        // }
      }
      bottomObserver = new IntersectionObserver(bottomObserverCallback, { root: null, rootMargin: "0px 0px " + (typeof items.scrollAppendThresholdPixels === "number" ? items.scrollAppendThresholdPixels : 500) + "px 0px", threshold: 0 });
      try {
        bottomObserver.observe(bottom);
      } catch (e) {
        console.log(e);
      }
    } else {
      // Scroll Listener passive should already be the default on scroll events
      window.addEventListener("scroll", scrollListener, { passive: true });
    }
  }

  /**
   * Removes the scroll detection (either Scroll Listener or Intersection Observer).
   *
   * @see https://developer.mozilla.org/docs/Web/API/Document/scroll_event
   * @see https://developer.mozilla.org/docs/Web/API/Intersection_Observer_API
   * @private
   */
  function removeScrollDetection() {
    console.log("removeScrollDetection() - removing " + instance.scrollDetection);
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      // We set this to undefined because we check if the intersectionObserver exists to determine which scroll detection mode we are in shouldAppend()
      intersectionObserver = undefined;
      bottomObserver?.disconnect();
      bottomObserver = undefined;
    } else {
      window.removeEventListener("scroll", scrollListener);
    }
  }

  /**
   * The callback function for the Intersection Observer. Observes all page entries when they intersect (are visible) in
   * the root (document). We call the reusable scrollDetection function afterwards to set the current page and bottom page.
   *
   * @param {IntersectionObserverEntry[]} entries - the array of entries being observed (the pages' observed elements)
   * @private
   */
  function intersectionObserverCallback(entries) {
    console.log("intersectionObserverCallback() - entries=");
    console.log(entries);
    // Gotcha Note: entries will only consist of entries whose isIntersecting boolean state has CHANGED (not all observed entries!).
    // If an observed entry is still intersecting (or still not intersecting), it won't be part of the entries
    // @see https://www.smashingmagazine.com/2018/01/deferring-lazy-loading-intersection-observer-api/#comment-1571093900989424964
    // We update the pages isIntersecting boolean property with the updated changes
    for (const entry of entries) {
      // isIntersecting sets instance.currentPage
      const index = pages.findIndex(page => page.element === entry.target);
      if (index >= 0) {
        pages[index].isIntersecting = entry.isIntersecting;
      }
      // reachedBottom sets instance.bottomPage
      // const bottomIndex = pages.findIndex(page => page.bottomElements.includes(entry.target));
      // if (bottomIndex >= 0) {
      //   pages[bottomIndex].reachedBottom = entry.isIntersecting;
      // }
      // console.log("index=" + index + ", bottomIndex=" + bottomIndex + ", entry=");
      console.log(entry);
    }
    // We then always call scrollDetection to update the current page
    scrollDetection();
  }

  /**
   * The callback function for the Bottom Observer (Intersection Observer mode). Observes only the single bottom element and
   * detects when we've reached the bottom. We call the reusable scrollDetection function afterwards to detect if another
   * page should be appended.
   *
   * Note: The reason this is a separate observer is due to the rootMargin being different compared to the regular Intersection
   * Observer. We use a rootMargin of 0px for the former and a rootMargin of scrollAppendThresholdPixels (500 pixels) for this.
   *
   * @param {IntersectionObserverEntry[]} entries - the array of entries being observed (the pages' observed elements)
   * @private
   */
  function bottomObserverCallback(entries) {
    // There should only be one entry (bottom) being observed, but to be safe, we look at the last one's isIntersecting state
    instance.bottomIntersected = entries[entries.length - 1].isIntersecting;
    console.log("bottomObserverCallback() - instance.bottomIntersected=" + instance.bottomIntersected + ", entries=");
    console.log(entries);
    // We then always call scrollDetection, but this is only so we can call shouldAppend(). We don't really need detectCurrentPage()
    scrollDetection();
  }

  /**
   * The callback function for the AJAX Mutation Observer. Observes when a mutation occurs to the sub tree and reacts by
   * removing the specified elements.
   *
   * Note: This observer is only for the AJAX Native mode.
   *
   * @param {MutationRecord[]} mutations - the array of mutation records
   * @private
   */
  function ajaxObserverCallback(mutations) {
    console.log("ajaxObserverCallback() - mutations.length=" + mutations.length);
    for (const mutation of mutations) {
      console.log("mutation, type=" + mutation.type + " mutation.addedNodes=" + mutation.addedNodes.length);
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        const removeElements = DOMNode.getElements(instance.removeElementPath, instance.pageElementType).elements;
        for (const element of removeElements) {
          element.remove();
        }
        const hideElements = DOMNode.getElements(instance.hideElementPath, instance.pageElementType).elements;
        for (const element of hideElements) {
          element.style.display = "none";
          // TODO: Test this more:
          // element.setProperty("display", "none", "important");
        }
        break;
      }
    }
  }

  /**
   * The callback function for both the SPA Mutation Observer and Navigate Event Listener. Observes when a
   * navigation or mutation occurs to the sub tree and reacts by checking if the instance should be enabled or disabled.
   *
   * @param {MutationRecord[]} mutations - the array of mutation records
   * @param {MutationObserver} observer - the mutation observer who invoked this callback
   * @param {string} caller - the caller who called this function (e.g. "navigation")
   * @private
   */
  function spaObserverCallback(mutations, observer, caller) {
    console.log("spaObserverCallback() - mutations.length=" + mutations.length + ", caller=" + caller);
    clearTimeout(timeouts.spaCheck);
    timeouts.spaCheck = setTimeout(async () => {
      let check = true;
      // Why pickerEnabled?
      if (instance.enabled || instance.pickerEnabled) {
        check = false;
        for (const page of pages) {
          if (!document.contains(page.element)) {
            console.log("spaObserverCallback() - stopping!");
            check = true;
            await stop("spaObserverCallback");
            break;
          }
        }
      }
      if (check) {
        const tab = { id: 0, url: window.location.href };
        // Note that the potential SPA database items and saves are still in our storage items cache and we don't have to get the full storage items again
        // Unless: this is a navigate event!
        if (caller === "navigate") {
          items = await Promisify.storageGet(undefined, undefined, []);
        }
        instance = await Instance.buildInstance(tab, items);
        delete instance.items;
        // Note that we are now always removing all the pages and resetting currentDocument and iframeDocument if it's going to stop so that when it starts again,
        // the currentDocument is able to find the next link on the top-level document, not the old cloned document
        // Clean up existing pages before resetting
        for (const page of pages) {
          // Remove all the iframes
          if (page.iframe && typeof page.iframe.remove === "function") {
            console.log("spaObserver() - removing iframe");
            page.iframe.remove();
          }
          // Need to manually remove the dividers in case the website only handles its specific elements like (p when sorting from old to new or vice versa)
          if (page.divider && typeof page.divider.remove === "function") {
            console.log("spaObserver() - removing divider");
            page.divider.remove();
          }
          // TODO: This seems risky
          // if (page.pageElements && page.pageElements.length > 0) {
          //   for (const pageElement of page.pageElements) {
          //     console.log("spaObserver() - removing pageElements");
          //     pageElement.remove();
          //   }
          // }
        }
        // We always need to reset the documents so we can still find the new next link on the new page
        pages = [];
        currentDocument = document;
        iframeDocument = undefined;
        if (instance.enabled) {
          console.log("spaObserverCallback() - starting!");
          start(caller);
        }
        // if (instance.enabled) {
        //   console.log("spaObserverCallback() - starting!");
        //   // Clean up existing pages before resetting
        //   for (const page of pages) {
        //     // Remove all the iframes
        //     if (page.iframe && typeof page.iframe.remove === "function") {
        //       console.log("spaObserver() - removing iframe");
        //       page.iframe.remove();
        //     }
        //     // Need to manually remove the dividers in case the website only handles its specific elements like (p when sorting from old to new or vice versa)
        //     if (page.divider && typeof page.divider.remove === "function") {
        //       console.log("spaObserver() - removing divider");
        //       page.divider.remove();
        //     }
        //     // TODO: This seems risky
        //     // if (page.pageElements && page.pageElements.length > 0) {
        //     //   for (const pageElement of page.pageElements) {
        //     //     console.log("spaObserver() - removing pageElements");
        //     //     pageElement.remove();
        //     //   }
        //     // }
        //   }
        //   pages = [];
        //   currentDocument = document;
        //   iframeDocument = undefined;
        //   start(caller);
        // }
      }
    }, 1000);
  }

  /**
   * The detection function that does all the work when scrolling. This is called by both the Scroll Listener and
   * Intersection Observer.
   *
   * It calls the following functions and determines the following logic:
   * 1. detectCurrentPage() - What the current page is as the user scrolls
   * 2. shouldAppend() - When a new page should be added
   *
   * @private
   */
  function scrollDetection() {
    detectCurrentPage();
    if (shouldAppend()) {
      instance.isLoading = true;
      Workflow.execute(instance.action, "scrollDetection");
    }
  }

  /**
   * Determines if a vertical scrollbar is present on the screen. We will only check a maximum of 10 times.
   *
   * Note: This check is only performed when in Intersection Observer mode. This is due to the Scroll Listener's pixels
   * check implicitly already checking this.
   *
   * TODO: Improve this by checking for overflow:hidden on the document/body.
   *
   * @returns {boolean} true if a vertical scrollbar exists, false otherwise
   * @private
   */
  function scrollbarExists() {
    let exists = true;
    let documentHeight = -1;
    if (!instance.scrollbarExists && instance.scrollbarAppends < 10) {
      documentHeight = getTotalHeight(document);
      // A scrollbar exists if the document's height is bigger than the window's height. TODO: Test this more e.g. > vs >=
      // Also, if the documentHeight still hasn't changed since the last time we appended, then assume there's an overflow:hidden property applied and the scrollbar exists
      exists = (documentHeight > window.innerHeight) || ((documentHeight > 0) && (documentHeight === instance.scrollbarHeight));
      // If a scrollbar exists, we will stop checking. Otherwise, we increment the appends value so we only append a max of 10 pages due to lack of scrollbar
      if (exists) {
        instance.scrollbarExists = true;
      } else {
        instance.scrollbarAppends++;
        // Cache the documentHeight for the next scrollbar check
        instance.scrollbarHeight = documentHeight;
      }
    }
    console.log("scrollbarExists() - scrollbarExists=" + instance.scrollbarExists + ", scrollbarAppends=" + instance.scrollbarAppends + ", window.innerHeight=" + window.innerHeight + ", documentHeight=" + documentHeight);
    return exists;
  }

  /**
   * Determines if the user has scrolled near the bottom of the content by a certain number of pages.
   *
   * Note: This function is only called when the scroll detection mode is Intersection Observer.
   *
   * Examples (based on the instance.scrollAppendThresholdPages):
   * 1. If the threshold pages value is 1, this checks if the user scrolled within 1 page of the last page of the content (i.e. the next-to-last page).
   * 2. If the threshold pages value is 0, this essentially checks if the user has scrolled to the last page of the content.
   *
   * @returns {boolean} true if scrolled near the bottom of the content by the pages metric, false otherwise
   * @private
   */
  function scrolledNearBottomPages() {
    // Note that we use instance.bottomPage instead of instance.currentPage. The bottomPage is only used to determined if it should append or not, not the currentPage
    console.log("scrolledNearBottomPages() - bottomPage=" + instance.bottomPage + ", totalPages=" + instance.totalPages + ", thresholdPages=" + instance.scrollAppendThresholdPages + ", scrolled=" + ((instance.totalPages - instance.bottomPage) <= instance.scrollAppendThresholdPages));
    // return ((instance.totalPages - instance.bottomPage) <= instance.scrollAppendThresholdPages);
    // If the bottom is still on the page, check to see if it's intersected; otherwise, fallback to whether instance.bottomPage is the last page
    return bottomObserver && bottom?.nodeType === Node.ELEMENT_NODE && document?.body?.contains(bottom) ? instance.bottomIntersected : ((instance.totalPages - instance.bottomPage) <= 0);
  }

  /**
   * Determines if the user has scrolled near the bottom of the content by a certain number of pixels.
   *
   * The "content" is either the entire HTML Document (in Page, Iframe, or Media modes) or the elements (in Element
   * mode). For example, if the threshold pixels value is 1000px, this checks if the user scrolled within 1000px of the
   * bottom of the content.
   *
   * Note: This function is only called when the scroll detection mode is Scroll Listener.
   *
   * @returns {boolean} true if scrolled near the bottom of the content by the pixels metric, false otherwise
   * @private
   */
  function scrolledNearBottomPixels() {
    // This is the absolute bottom position (the total document's height)
    const bottom_ = getTotalHeight(document);
    // This is the actual bottom we care about. In all modes except Append Element mode, it's the same as the bottom. But in Append Element mode, we need to subtract the offset from the bottom. The offset is the space from the insertion point (the bottom of the elements) to the very bottom of the document. The offset is 0 in all other modes
    const contentBottom = bottom_ - offset;
    // This is the current position of the scrollbar. The scroll position can also be calculated to just be window.scrollY without the window.innerHeight and this would be the TOP position of the grayed portion of the scrollbar instead of its BOTTOM position
    const scrollPosition = window.scrollY + window.innerHeight;
    // This is the amount of pixels left until reaching the bottom. Because JavaScript gives us precise subpixel values (e.g. decimal numbers like 1200.5) we will floor the value. This is useful when scrolling to the bottom of the document and ensuring a 0.5 is treated as 0
    const pixelsLeft = Math.floor(contentBottom - scrollPosition);
    // The user has scrolled near the bottom if the pixels left is less than or equal to the threshold (e.g. 1000 pixels)
    const scrolledNearBottom = pixelsLeft <= instance.scrollAppendThresholdPixels;
    console.log("scrolledNearBottomPixels() - contentBottom=" + contentBottom + ", bottom=" + bottom_ + ", offset=" + offset + ", scrollPosition=" + scrollPosition + ", pixelsLeft=" + pixelsLeft + ", thresholdPixels=" + instance.scrollAppendThresholdPixels + ", scrolledNearBottom=" + scrolledNearBottom);
    return scrolledNearBottom;
  }

  /**
   * Determines if another page should be appended. This only happens when the following conditions are met:
   * 1. The instance is enabled (after stop is called, it is no longer enabled)
   * 2. There isn't a page currently being loaded (e.g. fetched)
   * 3. Element Picker isn't currently on
   * 4. Auto isn't enabled (as auto handles this on its own)
   * 5. The user has scrolled near the bottom (either by pixels or pages, depending on the scroll detection mode)
   *
   * @returns {boolean} true if a new page should be appended, false otherwise
   * @private
   */
  function shouldAppend() {
    console.log("shouldAppend() - intersectionObserver=" + intersectionObserver + ", instance.isLoading=" + instance.isLoading);
    // Scrollbar Exists check only needs to occur when in Intersection Observer mode because the pixels checks this already implicitly
    return instance.enabled && !instance.isLoading && !instance.pickerEnabled && !instance.autoEnabled && (intersectionObserver ? !scrollbarExists() || scrolledNearBottomPages() : scrolledNearBottomPixels());
  }

  /**
   * Detects what the current page is.
   *
   * Handles setting the current page # scrolled into view, the history push state (if enabled), updating the tab title
   * (if enabled), and the page overlay (if enabled). This function is called by both the scroll listener and
   * intersection observer.
   *
   * @private
   */
  function detectCurrentPage() {
    let currentSet = false;
    // Note that this assumes the page order is from page 1 to page n (max) in order to set currentPage to the first page on the screen
    for (const page of pages) {
      // Two Cases: If using Intersection Observer, check if the page is intersecting, else if Scroll Listener check isScrolledIntoView()
      // if (intersectionObserver ? page.isIntersecting || page.reachedBottom : isScrolledIntoView(page.element)) {
      if (intersectionObserver ? page.isIntersecting : isScrolledIntoView(page.element)) {
        // We always want to set the bottomPage to be the last intersected page
        // if (page.reachedBottom) {
        //   instance.bottomPage = page.number;
        // }
        instance.bottomPage = page.number;
        // If io, we want to stop at the first currentPage we found (but continue setting bottomPage in later iterations)
        // if (!intersectionObserver || (!currentSet && page.isIntersecting)) {
        if (!intersectionObserver || !currentSet) {
          currentSet = true;
          instance.currentPage = page.number;
          console.log("detectCurrentPage() - page.number=" + page.number + ", page.url=" + page.url);
          // If this is not a local file URL, can update history or title
          if (!instance.isLocal) {
            // Check if the address bar (window.location.href) hasn't already been updated with this page's url to avoid unnecessarily setting it again
            if (instance.scrollUpdateAddress && page.url && window.location.href !== page.url) {
              // Because scrollDetectionThrottle has a hard-minimum of 100ms, we don't need to worry about adding a timeout to replace the history state too often (the minimum safe is 25ms before browsers start to complain)
              window.history.replaceState(undefined, undefined, page.url);
            }
            // Check if the document title hasn't already been set with this page's title to avoid unnecessarily setting it again
            if (instance.scrollUpdateTitle && page.title && document.title !== page.title) {
              document.title = page.title;
            }
          }
          // Update the Page Overlay with the current page number (if the setting is enabled)
          updateOverlay();
        }
        // We never break out in io because we want to set bottomPage with the last page that is intersecting
        if (!intersectionObserver) {
          break;
        }
      }
    }
  }

  /**
   * Determines if the element (e.g. page) has been scrolled into the current viewport.
   * Note: This function is only called in Scroll Listener mode.
   *
   * @param {Element} element - the element (e.g. page)
   * @returns {boolean} true if the element has been scrolled into view, false otherwise
   * @private
   */
  function isScrolledIntoView(element) {
    let isInView = false;
    const rect = element?.getBoundingClientRect();
    // The rect.height > 0 part allows us to ignore new pages that are still loading at the bottom that are about to be appended
    if (rect && rect.height > 0) {
      // The algorithm to detect if an element is in view depends on whether it is taller than the window or not
      // If element is taller than window... (Note: Math.round() because getBoundingClientRect return subpixel values with decimal places e.g. 409.99)
      if (Math.round(rect.height) >= window.innerHeight) {
        // ...then check if element is partially visible
        isInView = rect.top <= 1 && rect.bottom >= 0;
      } else {
        // ...else check if element is fully visible
        isInView = rect.top >= -1 && rect.bottom <= window.innerHeight;
      }
      // Don't print out console log statements unless it's in view to avoid cluttering console
      console.log(isInView ? "isScrolledIntoView() - element.id=" + element.id + ", isInView=" + isInView : "");
    }
    return isInView;
  }

  /**
   * Gets the total height of the document in pixels. This is also known as the bottom position of the document.
   *
   * Normally, we would only care about the body clientHeight when calculating the document's height. However some
   * websites are coded strangely where their height may not be calculated based on just that, so we look at the max
   * from all six possible height values from both the html and body.
   *
   * @param {Document} doc - the specific document whose height to calculate (iframes can have their own documents!)
   * @returns {number} the total height of the document in pixels
   * @see https://stackoverflow.com/questions/1145850/how-to-get-height-of-entire-document-with-javascript
   * @private
   */
  function getTotalHeight(doc) {
    const html = doc.documentElement;
    const body = doc.body;
    console.log("getTotalHeight() - hch="  + html.clientHeight + ", hsh=" + html.scrollHeight + ", hoh=" + html.offsetHeight + ", bch=" + body.clientHeight + ", bsh=" + body.scrollHeight + ", boh=" + body.offsetHeight);
    return Math.max(html.clientHeight, html.scrollHeight, html.offsetHeight, body.clientHeight, body.scrollHeight, body.offsetHeight);
  }

  /**
   * Prepends an element based on the instance's workflow.
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  function prepend(caller) {
    console.log("prepend() - caller=" + caller);
    const prepend = instance.workflowPrepend;
    switch (prepend) {
      case "divider":
        // To prepend the divider, we need to re-calculate the insertion point first (Click Element / AJAX Native)
        insertionPoint = Elementify.getInsertionPoint(Elementify.getPageElements(document), false);
        appendDivider();
        break;
    }
  }

  /**
   * Appends a new page using one of the append modes.
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  async function append(caller) {
    console.log("append() - caller=" + caller + ", instance.url=" + instance.url + ", pages.length=" + (pages.length));
    // Element Iframe Trim should redirect to iframe; AJAX Native to ajax-native; all other append modes remain the same
    const append =
      instance.action === "click" && instance.append === "element" ? "ajax-native" :
      instance.append === "element" && instance.pageElementIframe ? instance.pageElementIframe === "trim" ? "iframe" : "element" :
      instance.append === "ajax" ? instance.ajaxMode === "native" ? "ajax-native" : "element" :
      instance.append;
    switch (append) {
      case "page":    appendDivider(); appendLoading(); await appendPage(caller);    break;
      case "iframe":  appendDivider(); appendLoading(); await appendIframe(caller);  break;
      case "element": appendDivider(); appendLoading(); await appendElement(caller); break;
      case "media":   appendDivider(); appendLoading(); await appendMedia(caller);   break;
      case "none":                                      await appendNone(caller);    break;
      case "ajax-native":                               await appendAjax(caller);    break;
      default:                                                                       break;
    }
  }

  /**
   * Appends the next page's HTML as is to the original document's body.
   * Images and HTML may break in this mode, but it is the simplest append mode and requires no configuration.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function appendPage(caller) {
    console.log("appendPage() - caller=" + caller);
    const page = document.createElement("div");
    page.style = processStyle(PAGE_STYLE);
    document.body.appendChild(page);
    const nextDocument = await getNextDocument();
    if (!nextDocument) { return; }
    const fragment = document.createDocumentFragment();
    nextDocument.body.querySelectorAll(":scope > *").forEach(element => fragment.appendChild(DOMNode.transferNode(element, instance.transferNodeMode)));
    page.appendChild(fragment);
    resizeMedia("page", page);
    triggerCustomEvent(EVENT_NODE_APPENDED, page, { url: instance.url });
    await appendFinally("page", page, caller);
    // TODO: Don't wrap the page in a div anymore. Use the code below and use DOMNode.getNodesByTreeWalker() to pick an element to be the observable page element
    // const nextDocument = await getNextDocument();
    // const fragment = document.createDocumentFragment();
    // const elements = [...nextDocument.body.querySelectorAll(":scope > *")];
    // // (Need to also push bottomMargin div to elements array like with page 1)
    // const welements = instance.resizeMediaEnabled ? DOMNode.getNodesByTreeWalker(nextDocument.body, NodeFilter.SHOW_ELEMENT) : [];
    // elements.forEach(element => fragment.appendChild(element));
    // document.body.appendChild(fragment);
    // let observableElement = getObservable(elements);
    // if (!observableElement) {
    //   observableElement = document.createElement("span");
    //   // document.body.insertBefore(observableElement, elements[0]);
    //   DOMNode.insertBefore(observableElement, elements[0]);
    //   elements.unshift(observableElement);
    // }
    // resizeMedia("page", document.body, welements);
    // triggerCustomEvent(EVENT_NODE_APPENDED, page?, { url: instance.url });
    // appendFinally("page", observableElement, caller);
  }

  /**
   * Appends the next page in an iframe to isolate complex pages and prevent HTML and images from breaking.
   * This mode runs slower than append page mode and clicking on a link in an iframe may be problematic if the domain
   * differs because the link opens in the same frame.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function appendIframe(caller) {
    console.log("appendIframe() - caller=" + caller);
    const iframeMode = instance.append === "element" && instance.pageElementIframe ? instance.pageElementIframe === "trim" ? "trim" : "import" : "full";
    // We only create the iframe at append time in full mode; the other modes will have already created it after the last page was appended
    // The exception is if the user changes the append mode and the iframe hasn't yet been created (not a great safe guard, we need to catch this beforehand)
    if (iframeMode === "full" || !iframe) {
      await createIframe(instance.url, IFRAME_STYLE, iframeMode, caller);
    }
    if (!iframeDocument) {
      return;
    }
    if (iframeMode === "trim") {
      instance.scrollIframe = false;
      // Reset the style from IFRAME_FIXED_STYLE
      iframe.style = processStyle(IFRAME_STYLE);
      // Make sure the next link is in the iframeDocument before we clone it, waiting for the next link is a must!
      [pageElements] = await Promise.all([Iframe.getPageElementsFromIframe(iframeDocument), instance.action === "next" || instance.action === "prev" ? Iframe.getNextLinkFromIframe(iframeDocument) : 1]);
      // We store a clone of the iframe document after we have successfully retrieved the page elements and next link
      currentDocument = iframeDocument.cloneNode(true);
      // We need to cache both the pageElements (already done above) and the scripts/styles before we remove everything from the iframeDocument
      const scriptsAndStyles = iframeDocument.body.querySelectorAll("script, style");
      // Remove all elements from the iframeDocument so that we can then re-add just what we need
      iframeDocument.body.querySelectorAll(":scope > *").forEach(element => { iframeDocument.body.removeChild(element); });
      const fragment = document.createDocumentFragment();
      // TODO: Test resizeMedia() more in this mode before we calculate the welements (commented out code)
      // const welements = instance.resizeMediaEnabled && nextDocument && nextDocument.body ? DOMNode.getNodesByTreeWalker(nextDocument.body, NodeFilter.SHOW_ELEMENT) : [];
      // Add the scripts and styles and elements back to the iframe, note that we shouldn't have to use adoptNode() here
      scriptsAndStyles.forEach(element => fragment.appendChild(element));
      pageElements.forEach(element => fragment.appendChild(element));
      iframeDocument.body.appendChild(fragment);
    }
    resizeMedia("iframe", iframeDocument.body);
    // Only fix lazy loading in iframe mode if the user explicitly wants this and is using manual
    // TODO: Is it safe to even do this in Auto as well?
    // @see https://favpng.com/png_search/pokemon/ for an example of a website that needs both iframe and lazy loading
    if (instance.lazyLoad === "manual") {
      fixLazyLoadingPre(iframeDocument);
    }
    executeCustomScripts(iframeDocument, false);
    // Some websites dynamic content anchors haven't yet loaded; this is a bit hacky as we are using setTimeout()...
    for (let timeoutCheck = 0; timeoutCheck <= 3000; timeoutCheck += 1000) {
      setTimeout(() => { setLinksNewTab([iframeDocument]); }, timeoutCheck);
    }
    // Calculate the height only after resizing the media elements
    iframe.style.setProperty("height", getTotalHeight(iframeDocument) + "px", "important");
    iframeDocument.documentElement?.style?.setProperty("overflow", "hidden", "important");
    iframeDocument.body?.style?.setProperty("overflow", "hidden", "important");
    // If prepareFirstPage (iframePageOne=true), we need to remove all the elements from the document body except for this iframe and the overlay and loading divs
    if (caller === "prepareFirstPage") {
      document.body.querySelectorAll(":scope > *").forEach(element => { if (element !== iframe && element !== overlay && element !== loading) { document.body.removeChild(element); } });
    }
    triggerCustomEvent(EVENT_NODE_APPENDED, iframe, { url: instance.url });
    await appendFinally("iframe", iframe, caller);
  }

  /**
   * Appends specific elements for seamless scrolling. A page element path must be entered to determine which elements
   * to append.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function appendElement(caller) {
    console.log("appendElement() - caller=" + caller);
    // If we are in Element Iframe Import mode, we need to use the iframe obtained in appendIframe()
    if (instance.pageElementIframe || instance.append === "ajax") {
      // If the iframe doesn't exist because the append mode was changed, create it (not a great safe guard, we need to catch this beforehand)
      if (!iframe) {
        console.log("appendElement() - warning: no iframe, even though this instance uses iframes. creating iframe...");
        await createIframe(instance.url, IFRAME_STYLE + IFRAME_FIXED_STYLE, instance.pageElementIframe, caller);
      }
      // If the iframe has loaded a new URL (e.g. the button click was a link or form), we need to obtain the updated iframeDocument or it will stay on the previous page forever
      if (instance.append === "ajax") {
        iframeDocument = iframe.contentDocument;
        currentDocument = iframe.contentDocument.cloneNode(true);
      }
      // TODO: To be safe, should we await both promises and wait for the next link/button as well as the page elements even though it's not necessary?
      pageElements = await Iframe.getPageElementsFromIframe(iframeDocument);
      instance.scrollIframe = false;
      // TODO: See if we can refactor this so we can place this consistently in all append modes. This is normally done in getNextDocument(), but in Element Iframe mode we aren't sure if the elements have loaded till now
      setLinksNewTab(pageElements);
      // We store a clone of the iframeDocument after we have successfully retrieved the page elements and next link
      // Note that this isn't necessary for Element Iframe Import mode because the live iframeDocument will remain on the page, but is done as a precaution
      // We still want to do this so we can use the currentDocument to check the page elements in the popup
      if (instance.append !== "ajax") {
        currentDocument = iframeDocument.cloneNode(true);
      }
    } else {
      const nextDocument = await getNextDocument();
      if (!nextDocument) { return; }
      pageElements = Elementify.getPageElements(nextDocument);
    }
    for (let i = 0; i < pageElements.length; i++) {
      pageElements[i] = DOMNode.transferNode(pageElements[i], instance.transferNodeMode);
    }
    const fragment = document.createDocumentFragment();
    pageElements.forEach(element => fragment.appendChild(element));
    // The insertion point may have been "moved" by the website and no longer have a parentNode, so we re-calculate it to be the last element
    if (!insertionPoint || !insertionPoint.parentNode || insertionPoint.ownerDocument !== document) {
      console.log("appendElement() - the insertion point's hierarchy in the DOM was altered. " + (insertionPoint ? ("parentNode=" + insertionPoint.parentNode + ", ownerDocument === document=" + (insertionPoint.ownerDocument === document)) : "insertionPoint is undefined!"));
      insertionPoint = Elementify.getInsertionPoint(Elementify.getPageElements(document), false);
    }
    DOMNode.insertBefore(fragment, insertionPoint);
    // pageElements.forEach(el =>  console.log("adoptNode() - after insertion, ownerDocument === document=" + (el.ownerDocument === document)));
    // We need to now trigger the AP CustomEvent for each of the newly appended nodes from the fragment. This is for external scripts that may be listening for them
    pageElements.forEach(element => triggerCustomEvent(EVENT_NODE_APPENDED, element, { url: instance.url, parentNode: insertionPoint.parentNode }));
    // Calculate the observable element now after the elements are appended (inserted before) so their heights are now accessible
    let observableElement = getObservableElements(pageElements)[0];
    if (!observableElement) {
      console.log("appendElement() - no observable element found, manually creating a span");
      observableElement = document.createElement("span");
      DOMNode.insertBefore(observableElement, insertionPoint);
      pageElements.unshift(observableElement);
    }
    // We must calculate the insertion point now before this function is called again and we get the next document
    insertionPoint = Elementify.getInsertionPoint(pageElements, false);
    // resizeMedia("element", undefined, welements);
    await appendFinally("element", observableElement, caller);
  }

  /**
   * Appends a media element directly -- namely images, like 001.jpg. This mode can only be used with actions that allow
   * for sequential URLs such as the Increment URL and URL List Actions. Care must be taken into consideration when
   * dealing with specific browsers who style the images differently. For example, Firefox adds a position: fixed to the
   * image.
   *
   * Example URL: https://www.example.com/001.jpg
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function appendMedia(caller) {
    console.log("appendMedia() - mediaType=" + instance.mediaType);
    const media = document.createElement("div");
    media.style = processStyle(MEDIA_STYLE);
    document.body.appendChild(media);
    switch (instance.mediaType) {
      case "image":
        const img = document.createElement("img");
        img.src = instance.url;
        media.appendChild(img);
        break;
      case "video":
      case "audio":
        // Note: Both Chrome and Firefox actually use the video element when creating audio files, not the audio element!
        const video = document.createElement("video");
        video.setAttribute("name", "media");
        video.controls = "controls";
        const source = document.createElement("source");
        source.src = instance.url;
        // Note that we intentionally leave out setting source.type to a hard-coded value (e.g. "video/mp4" or "audio/mpeg"); it works well enough without one...
        video.appendChild(source);
        media.appendChild(video);
        break;
      default:
        break;
    }
    resizeMedia("media", media);
    triggerCustomEvent(EVENT_NODE_APPENDED, media, { url: instance.url });
    await appendFinally("media", media, caller);
  }

  /**
   * This append mode does not append anything. This is for actions like Click Button. The action executes (e.g.
   * clicking a "Load More" button) and it is expected that the website itself appends any additional content.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function appendNone(caller) {
    console.log("appendNone()");
    button = Click.findButton(instance.buttonPath, instance.buttonType, document, false).button;
    await appendFinally("none", button, caller);
  }

  /**
   * The AJAX append mode is an advanced version of the Element append mode and uses an injection script to message
   * pass with the page script. This specific append mode is only used by the AJAX Native mode (not the AJAX Iframe mode).
   *
   * The Click Button action and Element append mode combination also uses this append function because it operates the
   * same way in terms of how the page elements need to be calculated.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function appendAjax(caller) {
    console.log("appendAjax()");
    // // Wait one more second to ensure the elements are on the page? We already wait a second in Action after the button is clicked
    // await Promisify.sleep(1000);
    // We need to calculate the newly appended page's page elements after the button click by subtracting the past page elements from the total page elements
    // Important: We always re-calculate the insertion point at this point after the button was clicked and the elements have been presumably appended
    pageElements = Elementify.getFilteredPageElements(pages, [divider, bottom]);
    insertionPoint = Elementify.getInsertionPoint(pageElements, false);
    let observableElement = getObservableElements(pageElements)[0];
    if (!observableElement) {
      console.log("appendAjax() - no observable element found, manually creating a span");
      observableElement = document.createElement("span");
      DOMNode.insertBefore(observableElement, insertionPoint);
      pageElements.unshift(observableElement);
    }
    // Update page divider link we prepended (this was done before we performed the action and got the instance.url for the page)
    if (divider && typeof divider.querySelector === "function") {
      const a = divider.querySelector("a");
      if (a) {
        a.href = instance.url;
      }
    }
    // The newly added pageElements from the button click may not be on the page yet so we use a timeout to set them in the future
    for (let i = 1; i <= 3; i++) {
      setTimeout(() => {
        console.log("appendAjax() - setTimeout(), i=" + i);
        // TODO: Should we do this to be safe in case the page elements haven't been appended yet?
        pageElements = Elementify.getFilteredPageElements(pages.slice(0, -1), [divider, bottom]);
        insertionPoint = Elementify.getInsertionPoint(pageElements, false);
        setLinksNewTab(pageElements);
        appendBottom();
        // Click Button + Element also uses this append mode so we need this if
        if (instance.append === "ajax") {
          triggerCustomEvent(EVENT_AJAX, document, {
            "disableRemoveElementPath": instance.disableRemoveElementPath || DOMPath.generatePath(insertionPoint.parentNode, instance.pageElementType).path,
            "disableRemoveFunctions": instance.disableRemoveFunctions || "remove,removeChild",
            "pathType": instance.pageElementType
          }, true);
        }
      }, 1000 * i);
    }
    // Remember: instance.append can either be element or ajax as both use this function
    await appendFinally(instance.append, observableElement, caller);
  }

  /**
   * Performs all the finalization work for all append modes after the next page has been appended.
   *
   * @param {string} mode - the append mode (e.g. "page", "iframe") [why is this needed in place of instance.append?]
   * @param {Element} observableElement - the observable element to be stored in the pages array
   * @param {string} caller - the caller who called this function
   * @private
   */
  function appendFinally(mode, observableElement, caller) {
    console.log("appendFinally() - mode=" + mode + ", observableElement=" + observableElement + ", caller=" + caller);
    // Always hide the loading icon no matter what
    if (instance.scrollLoading) {
      if (loading) {
        setTimeout(() => { loading?.style?.setProperty("display", "none", "important"); }, instance.append === "media" ? 500 : 0);
      }
      // We replace the currently animated infinity icon with a static icon
      if (divider) {
        divider.querySelector("svg.infy-scroll-divider-infinity-icon")?.replaceWith(createIcon("infinity"));
      }
    }
    // If no el (e.g. we couldn't find the next page), we need to revert back. For append none, just ignore this if the button is null? workflowPrepend may not have it either
    if (!observableElement && mode !== "none" && !instance.workflowPrepend) {
      console.log("appendFinally() - no el, so removing last divider");
      if (divider && typeof divider.remove === "function") {
        divider.remove();
      }
      // TODO: Should we stop at this point?
      // instance.isLoading = false;
      // stop();
      return;
    }
    // Fix Lazy Loading Post
    fixLazyLoadingPost();
    // Execute Custom Scripts at this point on the root document if we need to (always *after* we append the page's scripts)
    executeCustomScripts(document, true);
    // Iframe Resizer
    resizeIframe(observableElement);
    // Delete older pages' iframes only if they were appended via the Element Iframe (Import) mode
    // Actually, don't do this because certain sites (p) will not load the images even after they've been imported into the document.
    // This is notably the case when using Auto or when using the down shortcut to go down a page quickly
    if (!instance.autoEnabled) {
      for (let i = 0; i < pages.length - 1; i++) {
        const page = pages[i];
        if (page.iframe && page.mode === "import" && typeof page.iframe.remove === "function") {
          page.iframe.remove();
        }
      }
    }
    // Create the new page object that we'll store in the pages array
    // Each page's element is the part of the page we are observing. Make sure to check that the divider was appended into the document (Bing Search, for example, removes it if it isn't a li)
    // We'll still also store the element in another property called "el" (need to give this a better name) just in case we need it and we are using the divider as the page.element
    const page = {
      "number": pages.length + 1,
      "url": instance.url,
      "title": currentDocument?.title,
      // "element": pages.length > 0 && typeof divider?.scrollIntoView === "function" && document?.contains(divider) ? divider : typeof observableElement?.scrollIntoView === "function" ? observableElement : undefined,
      "element": typeof divider?.scrollIntoView === "function" && document?.contains(divider) ? divider : typeof observableElement?.scrollIntoView === "function" ? observableElement : undefined,
      "el": observableElement,
      "divider": divider,
      "append": instance.append,
      "mode": instance.pageElementIframe
      //, "bottomElements": [observableElement]
      //, "isIntersecting": true
    };
    // Store a reference to the current iframe and pageElements for this page in case we need to remove them
    if (iframe) {
      page.iframe = iframe;
    }
    if (pageElements) {
      page.pageElements = pageElements;
      // We only detect the bottomElements on page 1
      // if (pages.length === 0) {
      // }
      // const multiplePageElements = pageElements.length === 1 && pageElements[0]?.children && pageElements[0].children.length > 1 ? [...pageElements[0].children] : pageElements;
      // const observableMultiplePageElements = [...new Set(getObservableElements(multiplePageElements.reverse()))];
      // // page.bottomElements = observableMultiplePageElements.slice(Math.max(observableMultiplePageElements.length - 5, 0));
      // page.bottomElements = observableMultiplePageElements.slice(0, 1);
      // console.log("multiplePageElements, observableMultiplePageElements, page.bottomElements=");
      // console.log(multiplePageElements);
      // console.log(observableMultiplePageElements);
      // console.log(page.bottomElements);
    }
    // We need to reset the divider to know which loading style to use (hybrid or fixed) for the next page in case the user changes the append mode, e.g. going from element (divider) to page (no divider)
    divider = undefined;
    // If there are already pages and we're calling prepareFirstPage again (e.g. Popup and user is clicking ACCEPT again, don't store this page)
    if (!(pages && pages.length > 0 && caller === "prepareFirstPage")) {
      // Investigate pages.unshift() so that newer pages are first for better performance?
      // ^ No, because we always want to iterate the pages in insertion order to prioritize earlier pages when setting current page (e.g. if multiple pages are visible in the viewport)
      pages.push(page);
    }
    instance.totalPages = pages.length;
    // Remove the pages after we've appended the latest page. This works better than trying to do the remove before the append. Also no benefit to adding a timeout
    removePages();
    // We observe the new page element and any other page elements (bottomElements)
    // if (caller === "prepareFirstPage" && instance.scrollDetection === "io") {
    //   appendDivider("hidden");
    // }
    // We always unobserve the old bottom before observing the new bottom, because we only need to observe one bottom
    // bottomObserver?.unobserve(bottom);
    // bottom = page.bottomElements[0];
    if (intersectionObserver) {
      if (caller !== "prepareFirstPage") {
        appendBottom();
      }
      try {
        intersectionObserver.observe(page.element);
        // Should we keep observing the bottom element just in case we had to create a new one?
        bottomObserver?.observe(bottom);
      } catch (e) {
        console.log(e);
      }
      // for (const bottomElement of page.bottomElements) {
      //   intersectionObserver.observe(bottomElement);
      // }
      // appendDivider(bottom, "bottom");
      // if (!bottom) {
      //
      // }
      // bottomObserver?.observe(bottom);
    }
    // Scroll into view only if shortcut commands, popup, script, or auto slideshow
    if (page && page.element && (caller === "command" || caller === "popupClickActionButton" || caller === "scrollClickActionButton" || (caller === "auto" && instance.autoSlideshow))) {
      page.element.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
    }
    // TODO: Trigger this event for all append modes?
    // We need to now trigger the AP CustomEvent that the next page has fully loaded. This is for external scripts that may be listening for them
    // Note: This is after all the nodes have been appended; we don't provide an event for the currentDocument, always just the root document
    if (caller !== "prepareFirstPage") {
      triggerCustomEvent(EVENT_PAGE_APPENDED, document, {});
    }
    // Calculate the offset. This is in appendFinally so it can be used after prepareFirstPage and then after every append
    // When calculating the offset, perhaps introducing a delay to "fully" wait for the page to load may be a good idea?
    // Note: We only do this on prepare first page or after every append in regular append element mode (not element iframe or ajax due to dynamic content)
    if (caller === "prepareFirstPage" || (instance.append === "element" && !instance.pageElementIframe)) {
      setTimeout(() => {
        // We don't need to use the button position to calculate the offset even in ajax mode?
        calculateOffset();
      }, 1000);
    }
    // Always push the loading div to the bottom of the body (not needed, just for "neatness" and easier debugging when viewing the HTML in DevTools)
    if (loading && instance.scrollLoading) {
      document?.body?.appendChild(loading);
    }
    // My Stats
    if (items.statsEnabled) {
      try {
        Promisify.storageGet("stats").then(result => {
          const actionsIndex = instance.action === "next" ? 0 : instance.action === "increment" ? 1 : instance.action === "click" ? 2 : instance.action === "list" ? 3 : 0;
          const appendsIndex = instance.append === "element" ? 2 : instance.append === "ajax" ? 5 : instance.append === "page" ? 0 : instance.append === "iframe" ? 1 : instance.append === "media" ? 3 : instance.append === "none" ? 4 : 0;
          result.actions[actionsIndex] += 1;
          result.appends[appendsIndex] += 1;
          // Elements is debatable; we count Page/Iframe/Media/None as just 1 element and for Element/AJAX we use the page elements length
          result.elements[appendsIndex] += ["element", "ajax"].includes(instance.append) ? pageElements?.length || 1 : 1;
          // Promisify.storageSet({statsActions: result.statsActions, statsAppends: result.statsAppends, statsElements: result.statsElements });
          Promisify.storageSet({stats: result });
        });
      } catch (e) {
        console.log("appendFinally() - Error calculating and saving stats, Error:");
        console.log(e);
      }
    }
  }

  /**
   * Imposes a delay before allowing the instance to load another page. This delay prevents Infy from making too many
   * requests in a small time frame. This function is used by Workflow.postWorkflow() and Scroll.start() to manage
   * preparing the first page.
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  async function delay(caller) {
    console.log("delay() - caller=" + caller);
    // If the caller is popup (e.g. ACCEPT Button) or auto there is no reason to delay
    // await Promisify.sleep(caller === "popup" || caller === "auto" ? 100 + (instance.workflowReverse ? instance.appendDelay || REVERSE_APPEND_DELAY : 0) : instance.workflowReverse ? instance.appendDelay || REVERSE_APPEND_DELAY : instance.action === "click" ? BUTTON_APPEND_DELAY : instance.scrollAppendDelay || 2000);
    await Promisify.sleep(caller === "popup" || caller === "auto" ? 100 : instance.scrollAppendDelay || 2000);
    instance.isLoading = false;
    // Don't call the autoListener in start/prepareFirstPage because Popup will have already called startAutoTimer()
    if (instance.autoEnabled && caller !== "start") {
      Auto.autoListener(instance);
    } else {
      // At this point we can perform the action again if necessary. For example, if there is still no scrollbar, we
      // can perform the action (appending another page). We can also decide to check shouldAppend(), which will check
      // if we are near the bottom in terms of pages or pixels. This is a very important decision, as the extension
      // can keep appending more pages automatically at this point. If we only check for the scrollbar, we can force
      // the extension to only append one page at a time when scrolling, which seems safer. If we do the check for
      // shouldAppend(), we can check if the caller is prepareFirstPage so that it won't append more pages automatically
      // on each page load and waits until the user actually starts scrolling.
      // TODO: Consider implementing a maximum number of consecutive appends that can be done by the pixels and pages thresholds (share this limit with scrollbarAppends?)
      scrollDetection();
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
  async function prepareIframe(actionPerformed, caller) {
    console.log("prepareIframe() - actionPerformed=" + actionPerformed + ", caller=" + caller);
    // This part is only called when starting
    if (caller === "start" || caller === "mirrorPageAdopt") {
      // Element Iframe
      if (instance.append === "element" && instance.pageElementIframe) {
        await Action.perform(instance.action, "prepareFirstPage");
        await createIframe(instance.url, IFRAME_STYLE + IFRAME_FIXED_STYLE, instance.pageElementIframe, "prepareFirstPage");
        if (!iframeDocument) {
          return;
        }
        scrollIframeIndefinitely();
      }
      // AJAX Iframe
      if (instance.append === "ajax" && instance.ajaxMode !== "native") {
        // AJAX Iframe needs to create its iframe now to minimize delay
        // If the caller is mirrorPageAdopt, we are calling this function a second time and don't need to create the Iframe again
        if (caller !== "mirrorPageAdopt") {
          await createIframe(instance.url, IFRAME_STYLE + IFRAME_FIXED_STYLE, "import", "prepareFirstPage");
          if (!iframeDocument) {
            return;
          }
          if (instance.mirrorPage && instance.action === "click" && instance.append === "ajax") {
            return await prepareFirstPage("mirrorPageAdopt");
          }
          scrollIframeIndefinitely();
        }
        // Technically just need the button, but wait for the page elements as well to be safe
        // await Promise.all([Iframe.getButtonFromIframe(iframeDocument), Iframe.getPageElementsFromIframe(iframeDocument)]);
        await Iframe.getButtonFromIframe(iframe?.contentDocument);
        await Action.perform(instance.action, "prepareFirstPage");
      }
      return;
    }
    // This part is only called for all successive pages (Page 2+)
    // We check for actionPerformed to make sure the button still exists or the next link was found (e.g. this could be the last page)
    if (actionPerformed) {
      instance.workflowSkipAppend = false;
      // We only need to create another iframe if this is the Element append mode as AJAX just uses the same iframe
      if (instance.append === "element" && instance.pageElementIframe) {
        await createIframe(instance.url, IFRAME_STYLE + IFRAME_FIXED_STYLE, instance.pageElementIframe, "appendFinally");
      }
      scrollIframeIndefinitely();
    } else {
      // If the action wasn't performed, the workflow goes to delay() and will eventually set instance.isLoading to false after a few seconds, allowing us to retry again
      // TODO: Implement logic for when the button isn't found, need to end this, if we can re-call appendFinally after a couple seconds but not add another page, that might be the ideal
      instance.workflowSkipAppend = true;
      pages.pop();
    }
  }

  /**
   * Gets the next page's document. This function uses the fetch api to make the request, and falls back to XHR if there's
   * an error. It's called by the Append Page and Append Element modes. This function also creates a clone of the document
   * to be used to find the next link.
   *
   * TODO: Don't create a clone of the next document and somehow just have one "unedited" document while returning the original document. This is going to be hard to achieve.
   *
   * @returns {Promise<Document>} the next page's document
   * @private
   */
  async function getNextDocument() {
    console.log("getNextDocument()");
    let nextDocument;
    try {
      const result = await Requestify.request(instance.url, instance.documentCharacterSet, instance.documentContentType, "GET", instance.requestAPI, true);
      // Save the request API that was successfully used for the next time we need to make another request
      instance.requestAPI = result.api;
      nextDocument = result.doc;
    } catch (e) {
      console.log("getNextDocument() - error fetching next document, giving up. Error:");
      console.log(e);
      appendMessage(chrome.i18n.getMessage("oops_error") + " " + chrome.i18n.getMessage("next_document_error") + " " + e);
      appendFinally(instance.append, undefined, "getNextDocument()");
      // TODO: Should we reset isLoading and keep trying?
      // instance.isLoading = false;
      return nextDocument;
    }
    try {
      currentDocument = nextDocument.cloneNode(true);
      // Fix Lazy Loading (first), then Execute scripts (second) before modifying the nextDocument
      // Note: We do not have a way to give the user the nextDocument here (e.g. via a Custom Event) as it would be asynchronous to have to wait to get the document back from them
      fixLazyLoadingPre(nextDocument);
      executeCustomScripts(nextDocument, false);
      setLinksNewTab([nextDocument]);
      // Remove all scripts and styles so they aren't appended. We can append them later if needed with the cloned document
      // Note: We do not remove the noscript tags on Database URLs. For some reason they're needed on some Database URLs. See: https://girlydrop.com/letter/page/2
      // Note: We do not remove the style tags on Database URLs. For some reason they're needed on some Database URLs. See https://photodune.net/search?sort=sales#content
      // Not sure about the link tag...
      // TODO: In Manifest v3, we may need to adjust this
      nextDocument.body.querySelectorAll("script" + (instance.append === "element" && instance.databaseFound ? "" : ", style, link, noscript")).forEach(element => { if (element && element.parentNode) { element.parentNode.removeChild(element); } });
    } catch (e) {
      console.log("getNextDocument() - error cloning document or removing scripts and styles. Error:");
      console.log(e);
    }
    return nextDocument;
  }

  /**
   * Executes custom scripts for specific URLs against the document.
   *
   * @param {Document} nextDocument - the next document that was fetched
   * @param {boolean} checkRootDocument - whether to check the rootDocument boolean to determine if the script should be executed
   * @private
   */
  function executeCustomScripts(nextDocument, checkRootDocument) {
    console.log("executeCustomScripts()");
    // If this instance has a custom script, execute it at this point on the next document's elements (note this must come before we remove disallowed elements like scripts and styles)
    try {
      // Opening this up for all append modes now TODO: Should we only restrict this to everything except none and media? (definitely need it for ajax)
      // if (instance.script >= 0 && Scripts[instance.script] && (instance.append === "page" || instance.append === "iframe" || instance.append === "element")) {
      // if (instance.script >= 0 && Scripts[instance.script] && Scripts[instance.script].rootDocument) {
      if (instance.script >= 0 && Scripts[instance.script] && (checkRootDocument ? Scripts[instance.script].rootDocument : true)) {
        console.log("executeCustomScripts() - executing a custom script, script url:" + Scripts[instance.script].url);
        Scripts[instance.script].fn(nextDocument);
      }
    } catch (e) {
      console.log("executeCustomScripts() - error executing custom script. Error:");
      console.log(e);
    }
  }

  /**
   * Fixes lazily loaded media (namely images) by looking for a dataset or attribute "source" with the URL of the media
   * and setting the destination attribute to it.
   *
   * This function has two modes: manual and auto.
   *
   * Manual mode lets the user specify the source and destination attributes to use.
   * The destination attribute (e.g. src) is set to the value of the source attribute (e.g. data-src).
   *
   * Auto mode uses an algorithm to look for common "source" attributes (e.g. data-src, data-thumb, etc) and tries to
   * replace the destination (always assumed to be "src") with it.
   *
   * Note: There is now a native "loading" attribute in which the browser will take of lazy loading automatically.
   * We can add this to help with performance. Supported on Chrome 77+
   *
   * @param {Document} nextDocument - the next document that was fetched
   * @see https://developer.mozilla.org/docs/Web/Performance/Lazy_loading#images_and_iframes
   * @see https://rocketnews24.com/page/2/
   * @private
   */
  function fixLazyLoadingPre(nextDocument) {
    console.log("fixLazyLoadingPre() - lazyLoad=" + instance.lazyLoad);
    try {
      lazys = new Map();
      // data-src          Pretty much everything!
      // data-original     fanfiction.net https://www.froma.com/tokyo/list/?st=01 https://www.fujisan.co.jp/zasshi_search/?dg=0&page=3&qk=NHK%E5%87%BA%E7%89%88&st=nd&t=s&tb=d https://skyrim.2game.info/next_view.php?cat=&q=&sort=update&flg=&detail=1&page=1 https://www.oricon.co.jp/special/ http://soso.nipic.com/?q=123&page=3
      // data-lazy-src     https://app.famitsu.com/category/news/page/3/ https://deadline.com/vcategory/the-contenders-emmys/page/3/
      // data-image-src    Appears to be used for background images (parallax scrolling). Also, Google Shopping uses it for secondary images https://www.google.com/search?q=
      // data-sco-src      https://youpouch.com/page/2/ https://rocketnews24.com/page/2/
      // data-cover        https://www.usgamer.net/tags/n/news/3
      // data-thumb_url    ...
      // data-ks-lazy-load (Taobao?)
      // data-cfsrc        https://getnews.jp/newarrival
      // ajax              https://www.watch.impress.co.jp/backno/top/ https://game.watch.impress.co.jp/docs/review/20141014_671069.html
      // loadlate          https://www.imdb.com/search/title/?genres=animation&countries=jp
      // data-echo         https://www.weddingpark.net/ranking/10-b14/page2/?p=1
      // Not used due to genericity: "data-image" "data-img" "data-source" "data-normal", "data-file", "data-url", "data-cover", "data-echo"
      const lazyImageAttributes = ["data-src", "data-original", "data-lazy-src", "data-actualsrc", "data-thumb", "data-thumb_url", "data-defer-src", "data-lazyload-src", "data-lazyload", "data-ks-lazyload", "data-cfsrc", "data-sco-src", "data-retina", "ajax", "loadlate"];
      const lazyImageAttributeRemovals = ["data-delay", "srcset"];
      // data-src (background): https://www.famitsu.com/schedule/
      // data-background-image: https://www.cyzo.com/page/2 https://mangaowl.com/popular/2
      // data-loadimage-background: https://appvs.famitsu.com/gametitle/2081/page/2/
      // data-bkg ...
      // https://pixelcog.github.io/parallax.js/ data-image-src data-parallax
      // const lazyBackgroundAttributes = ["data-src", "data-loadimage-background", "data-background-image", "data-bkg"];
      // data-poster ph gifs
      // const lazyVideoAttributes = ["data-poster"];
      // const lazyClasses = ["lazyload", "lazy-load", "lazy", "lozad", "b-lazy", "responsively-lazy", "lazyestload", "jetpack-lazy-image"];
      // const lazyBackgroundClasses = ["lazy-bg"];
      if (instance.lazyLoad) {
        if (instance.lazyLoad === "manual") {
          // Manual:
          // Get all elements that have the attribute source. Don't restrict on destination, just in case they didn't actually put it in the markup (e.g. imgs without src attributes defined in the HTML)
          const lazyManuals = nextDocument.querySelectorAll("[" + instance.lazyLoadSource + "]");
          // Cache this value as we will be checking it when iterating every lazy element
          const styleBackgroundImage = instance.lazyLoadDestination === "style.background-image";
          console.log("fixLazyLoadingPre() - lazyManuals.length=" + lazyManuals.length);
          for (const lazyManual of lazyManuals) {
            // style.background-image exception requires the url() css function see https://developer.mozilla.org/docs/Web/CSS/url()
            if (styleBackgroundImage) {
              lazyManual.style.backgroundImage = "url(" + lazyManual.getAttribute(instance.lazyLoadSource) + ")";
            } else {
              lazyManual.setAttribute(instance.lazyLoadDestination, lazyManual.getAttribute(instance.lazyLoadSource));
            }
            // Remove the lazyAttributes in case there is CSS on the page tied to them. Especially srcset
            for (const lazyAttribute of lazyImageAttributes.concat(lazyImageAttributeRemovals).concat([instance.lazyLoadSource])) {
              lazyManual.removeAttribute(lazyAttribute);
            }
            lazys.set(lazyManual, instance.lazyLoadSource);
          }
        } else {
          // Auto:
          // Algorithm: Check likely lazy candidate attribute names in the following priority order
          const lazyImages = nextDocument.querySelectorAll(lazyImageAttributes.map(la => "img[" + la + "]").join(", "));
          console.log("fixLazyLoadingPre() - lazyImages.length=" + lazyImages.length);
          for (const lazyImage of lazyImages) {
            try {
              // const lazyFilesrcs = ["data:image/gif;", "data:image/png"]'
              // data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7
              // data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7
              // data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7
              // data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20563'%3E%3C/svg%3E
              // https://deadline.com/wp-content/themes/pmc-deadline-2019/assets/public/lazyload-fallback.jpg
              // http://static.ntimg.cn/original/images/imgLoading.gif
              // images.goodsmile.info/media/load_s-d21a843ea7e26384ead5f36e5a59421e.gif
              let loadAttribute;
              let loadAttributeAlt;
              // Note: While static is sometimes used, it's also sometimes used for non lazy loaded images, so let's not use it. @see https://www.zerochan.net/3220706 and https://www.fanfiction.net/s/937211/5/Hope-and-Love
              const isLikelyLazyFilename = !lazyImage.src || new RegExp("data:image/|lightbox|lazy|load|placeholder|blank|empty|transparent|spacer", "i").test(lazyImage.src);
              console.log("fixLazyLoadingPre() - " + lazyImage.attributes.length + " attributes:\n" + Object.values(lazyImage.attributes).map(a => a.name + ":" + a.value));
              for (const lazyAttribute of lazyImageAttributes) {
                const lazyValue = lazyImage.getAttribute(lazyAttribute);
                // TODO: We need to finalize how conservative we are in accepting a lazy value URL... Should we test for isValidURL?
                // Relative URL Example: https://www.meneame.net/?page=2
                if (lazyValue && !!lazyValue.trim() && lazyValue !== lazyImage.src) {
                  if (Util.isValidExtension(lazyValue, "image")) {
                    // If this lazyValue has a valid image file extension, accept it
                    loadAttribute = {"name": lazyAttribute, "value": lazyValue};
                    break;
                  } else if (!loadAttributeAlt && isLikelyLazyFilename) {
                    // Then check for src values we can change
                    loadAttributeAlt = {"name": lazyAttribute, "value": lazyValue};
                  }
                }
              }
              loadAttribute = loadAttribute ? loadAttribute : loadAttributeAlt ? loadAttributeAlt : undefined;
              if (loadAttribute) {
                console.log("fixLazyLoadingPre() - setting src to attribute: " + loadAttribute.name + " " + loadAttribute.value);
                // We always assume 'src' is the destination attribute in auto mode
                // TODO: Should we use lazyImage.onerror = function () {} to set the src back to the original value in case the image returns an error 404? See https://stackoverflow.com/questions/18837735/check-if-image-exists-on-server-using-javascript
                lazyImage.src = loadAttribute.value;
                // Remove the lazyAttributes in case there is CSS on the page tied to them. Especially srcset
                for (const lazyAttribute of lazyImageAttributes.concat(lazyImageAttributeRemovals)) {
                  lazyImage.removeAttribute(lazyAttribute);
                }
                // TODO: Also remove the lazyClasses?
                // lazyImage.classList.remove(...lazyClasses);
                lazys.set(lazyImage, loadAttribute.name);
              }
            } catch (e) {
              console.log("fixLazyLoadingPre() - error encountered when setting a lazy element");
            }
          }
          // const lazyBackgrounds = nextDocument.querySelectorAll(lazyBackgroundAttributes.map(la => "figure[" + la + "], a[" + la + "], div[" + la + "]").join(", "));
          // console.log("fixLazyLoadingPre() - lazyBackgrounds.length=" + lazyImages.length);
          // for (const lazyBackground of lazyBackgrounds) {
          //   // TODO?
          // }
          // const lazyVideos = nextDocument.querySelectorAll(lazyVideoAttributes.map(la => "video[" + la + "]").join(", "));
          // console.log("fixLazyLoadingPre() - lazyVideos.length=" + lazyVideos.length);
          // for (const lazyVideo of lazyVideos) {
          //   // TODO?
          // }
        }
      }
    } catch (e) {
      console.log("fixLazyLoadingPre() - error fixing lazy loading. Error:");
      console.log(e);
    }
  }

  /**
   * Finishes fixes lazily loaded images and media. This function is called after the lazy images have been appended in
   * order to utilize window.getComputedStyle(). This post-production sets opacity back to 1 and other cleanup work
   * we may want to do.
   *
   * @private
   */
  function fixLazyLoadingPost() {
    console.log("fixLazyLoadingPost()");
    try {
      if (lazys && lazys.size > 0 && instance.lazyLoad) {
        console.log("fixLazyLoadingPost() - lazys.size=" + lazys.size);
        // lazys.forEach((attribute, lazy) => {
        for (const [attribute, lazy] of lazys) {
          const lazyStyle = window.getComputedStyle(lazy);
          // filter: blur(5px)
          if (/blur\(.*\)/.test(lazyStyle.filter)) {
            console.log("fixLazyLoadingPost() - setting filter: blur to 0 because filter was " + lazyStyle.filter);
            // lazy.style["filter"] = lazy.style["filter"].replace(/blur\(.*\)/, "blur(0)");
            lazy.style.setProperty("filter", lazy.style["filter"].replace(/blur\(.*\)/, "blur(0)"), "important");
          }
          // filter: opacity(0.5) Note if this filter value is set, it does NOT change the regular opacity computed style below (this is why we check for this as well)
          if (/opacity\(.*\)/.test(lazyStyle.filter)) {
            console.log("fixLazyLoadingPost() - setting filter: opacity to 1 because filter was " + lazyStyle.filter);
            // lazy.style["filter"] = lazy.style["filter"].replace(/opacity\(.*\)/, "opacity(1)");
            lazy.style.setProperty("filter", lazy.style["filter"].replace(/opacity\(.*\)/, "opacity(1)"), "important");
          }
          // opacity: 0.5 Note that it can't be percentage when it's computed
          if (/(0)|(\d?\.\d)/.test(lazyStyle.opacity)) {
            console.log("fixLazyLoadingPost() - setting opacity to 1 because opacity was " + lazyStyle.opacity);
            // lazy.style["opacity"] = "1";
            lazy.style.setProperty("opacity", "1", "important");
          }
          if (lazyStyle.display === "none") {
            // lazy.style["display"] = "inline";
            lazy.style.setProperty("display", "inline", "important");
          }
          if (lazyStyle.visibility === "hidden") {
            // lazy.style["visibility"] = "visible";
            lazy.style.setProperty("visibility", "visible", "important");
          }
        }
        // });
        // Don't clear so we can get the lazys for debugging purposes?
        // lazys.clear();
      }
    } catch (e) {
      console.log("fixLazyLoadingPost() - Error:");
      console.log(e);
    }
  }

  /**
   * Resizes all media elements (like images and videos) by scaling them down to the window's width.
   *
   * Note: This function is called to resize images to fit the screen before calculating the document's height in the
   * following append modes: iframe.
   *
   * @param {string} mode - the append mode (why not use instance.append?)
   * @param {HTMLElement} container - the parent container element whose children should be resized
   * @param {HTMLElement[]} elements - the specific elements to resize
   * @private
   */
  function resizeMedia(mode, container, elements) {
    console.log("resizeMedia() - mode=" + mode + ", container=" + container + ", container.children.length=" + (container && container.children ? container.children.length : "") + "elements.length=" + (elements ? elements.length : ""));
    try {
      switch(mode) {
        // TODO: Test append element mode more before including it here with the other modes
        case "page":
        case "iframe":
          // page, iframe, and element modes exit if resize media enabled is false (media still needs to do work here though)
          if (!instance.resizeMediaEnabled) {
            return;
          }
          // The HTML's clientWidth gets the window's width minus the scrollbar. If we want the scrollbar included, we should use window.innerWidth instead
          // TODO: Look at height too?
          const windowWidth = document.documentElement.clientWidth || window.innerWidth;
          console.log("resizeMedia() - windowWidth=" + windowWidth);
          // Get the actual window associated with this container's elements (iframes have their own windows!)
          const gwindow = container && container.ownerDocument && container.ownerDocument.defaultView ? container.ownerDocument.defaultView : window;
          // Depending on if we have a container or not to query against, filter the elements to only media elements
          // TODO: Include videos as well?
          if (!elements) {
            elements = [...container.querySelectorAll("img")];
          } else {
            elements = elements.filter(el => el && el.nodeName && el.nodeName.toUpperCase() === "IMG");
          }
          elements.forEach(el => {
            const computedStyle = gwindow.getComputedStyle(el);
            // Remove "px" from width to just get the numerical value
            const elementWidth = parseInt(computedStyle.width || computedStyle.getPropertyValue("width"), 10);
            // if ((!computedStyle.maxWidth || computedStyle.maxWidth.toLowerCase() === "none") && (computedStyle.width && computedStyle.width >= width)) {
            // Only resize the element if its width is greater than the window's width. Previously we were looking at maxWidth, but this is no longer necessary
            if (elementWidth >= windowWidth) {
              console.log("resizeMedia() - resizing el because its width=" + elementWidth + ". Its maxWidth=" + computedStyle.maxWidth);
              // el.style.objectFit = "scale-down";
              // el.style.maxWidth = "100%";
              el.style.setProperty("object-fit", "scale-down", "important");
              el.style.setProperty("max-width", "100%", "important");
            }
          });
          break;
        case "media":
          // Firefox sets "position: absolute" on img roots, so we always reset it to "position: initial"
          // const style = instance.resizeMediaEnabled ? "object-fit: scale-down; max-width: 100%; max-height: 100vh; position: initial;" : "position: initial;";
          const style = processStyle(instance.resizeMediaEnabled ? "object-fit: scale-down; max-width: 100%; max-height: 100vh; position: initial;" : "position: initial;");
          container.querySelectorAll("img, video").forEach(el => el.style = style);
          break;
      }
    } catch (e) {
      console.log("resizeMedia() - Error:");
      console.log(e);
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
   * @param {HTMLIFrameElement} iframe_ - the iframe
   * @private
   */
  function resizeIframe(iframe_) {
    console.log("resizeIframe()");
    try {
      if ((instance.append === "iframe" || (instance.append === "element" && instance.pageElementIframe === "trim")) && iframe_ && iframe_.contentDocument) {
        // Inject the iFrameResize.contentWindow script into the iframe to allow message passing between the two objects
        const iframeDoc = iframe_.contentDocument;
        const script = iframeDoc.createElement("script");
        // We have two ways to do this: 1) Make the script's textContent = to the text of our script or 2) set the src to the chrome location
        // const response = await fetch(chrome.runtime.getURL("/lib/iframe-resizer/iframeResizer.contentWindow.js"));
        // script.textContent = await response.text();
        script.src = chrome.runtime.getURL("/lib/iframe-resizer/iframeResizer.contentWindow.js");
        (iframeDoc.head || iframeDoc.body || iframeDoc.documentElement).appendChild(script);
        // Note that iframeResizer will set the iframe's id with the default pattern "iframeResizer#" (starting at 0)
        // Remember: we do the resize right before we add the next page, so add 1 to the id (like we do with the divider id)
        iFrameResize({id: "infy-scroll-iframe-" + (pages.length + 1)}, iframe_);
      }
    } catch (e) {
      console.log("resizeIframe() - Error:");
      console.log(e);
    }
  }

  // /**
  //  * Some websites have problematic styling applied to them, such as a height set to 100% with overflow set to auto.
  //  * This causes issues with detecting their scroll position when more content gets appended to the DOM. This function
  //  * will reset the styling to allow infinite scrolling to work on these sites.
  //  *
  //  * TODO: This unfortunately causes issues on some websites, notably sites with the Click Button Action, so commenting it all out for now.
  //  *
  //  * @private
  //  */
  // function resetStyling() {
  //   console.log("resetStyling()");
  //   // TODO: This is experimental. Test this more with append element mode...
  //   if (instance.databaseFound && instance.append === "element") {
  //     return;
  //   }
  //   // TODO: setTimeout because some websites need the default html/body style to properly load lazy images on page 1
  //   setTimeout(() => {
  //     try {
  //       const html = document.documentElement;
  //       const body = document.body;
  //       const htmlStyle = window.getComputedStyle(html);
  //       const bodyStyle = window.getComputedStyle(body);
  //       // If either the html or body's overflow is set to auto with a height set to 100%, this means that we won't be able to detect they're scrolling
  //       // Note: We need to set overflow to visible (not just overflowY, as that doesn't work on some websites)
  //       if (htmlStyle.overflow === "auto" || htmlStyle.overflow === "scroll") {
  //         console.log("resetStyling() - setting html.style.overflow to visible");
  //         html.style.setProperty("overflow", "visible", "important");
  //       }
  //       if (htmlStyle.overflowY === "auto" || htmlStyle.overflowY === "scroll") {
  //         console.log("resetStyling() - setting html.style.overflow-y to visible");
  //         html.style.setProperty("overflow-y", "visible", "important");
  //       }
  //       if (bodyStyle.overflow === "auto" || bodyStyle.overflow === "scroll") {
  //         console.log("resetStyling() - setting body.style.overflow to visible");
  //         body.style.setProperty("overflow", "visible", "important");
  //       }
  //       if (bodyStyle.overflowY === "auto" || bodyStyle.overflowY === "scroll") {
  //         console.log("resetStyling() - setting body.style.overflow-y to visible");
  //         body.style.setProperty("overflow-y", "visible", "important");
  //       }
  //     } catch (e) {
  //       console.log("resetStyling() - Error:");
  //       console.log(e);
  //     }
  //   }, 0);
  //   // TODO: Make this timeout value an option or test this more with a better hardcoded value (ideally make it higher).
  // }

  /**
   * Sets the elements' links to open in a new tab when clicking on them if this extra option is enabled.
   *
   * @param {Element[]|Document[]} els - the array of elements or context nodes (either a document or parent node) that contains the links
   * @private
   */
  function setLinksNewTab(els = [document]) {
    console.log("setLinksNewTab() - instance.linksNewTabEnabled=" + instance.linksNewTabEnabled);
    try {
      if (instance.linksNewTabEnabled) {
        // Used to just be "[href]"
        const selector = "[href]:not([target=_blank])";
        for (const el of els) {
          // If the el is an actual link, we should set it. Then we set all its children (in case the links are inside)
          if (el.href) {
            el.setAttribute("target", "_blank");
          }
          el.querySelectorAll(selector).forEach(link => { link.setAttribute("target", "_blank"); });
        }
        // Alternate method of making links open in a new tab is by adding a base that affects all links. Need to test it more. May be appropriate for iframes
        // document.querySelectorAll("base").forEach(base => { base.remove(); });
        // const base = document.createElement("base");
        // base.target = "_blank";
        // (document.head || document.body || document.documentElement).appendChild(base);
        // Trying to remove event click listeners:
        // link.outerHTML = link.outerHTML clones the node and removes all event listeners but will make thumbnails be hidden on some sites
      }
    } catch (e) {
      console.log("setLinksNewTab() - Error:");
      console.log(e);
    }
  }

  /**
   * Removes the previously appended pages if there is a maximum number of pages specified.
   *
   * Note that we don't technically delete the pages from the array. We delete the page object's properties (elements,
   * metadata) but keep the empty page object in the pages array to help facilitate the usage of pages.length instead of
   * relying on instance.totalPages.
   *
   * @private
   */
  function removePages() {
    // We don't want to remove pages while AUTO is enabled as the user will have set their own times value manually
    if (instance.scrollMaximumPages > 0 && !instance.autoEnabled && !["none", "ajax"].includes(instance.append)) {
      // Get all the page elements so we can check which ones are currently in view
      let allElements = [];
      for (const page of pages) {
        if (Array.isArray(page?.pageElements)) {
          allElements = allElements.concat(page.pageElements);
        }
      }
      // console.log("removePages() - allPageElements=");
      // console.log(allPageElements);
      for (let i = 0; i < pages.length - instance.scrollMaximumPages; i++) {
        const page = pages[i];
        // if (instance.currentPage <= page.number) {
        //   continue;
        // }
        // We do not want to remove the page if any of its elements are still on the screen
        const elements = (page.pageElements || []).concat([page.element, page.el, page.iframe, page.divider]).filter(e => e?.nodeType === Node.ELEMENT_NODE && typeof e.remove === "function");
        const isInView = elements.some(element => isScrolledIntoView(element));
        console.log("removePages() - isInView=" + isInView + ", elements=");
        console.log(elements);
        if (!isInView) {
          if (instance.append === "element") {
            // In order to calculate the height of what we're removing, we calculate the top-most and bottom-most position of the elements and take the difference
            // Note that getBoundingClientRect includes the padding and border, but does not include the margin, so we include them in our overall height calculation
            // const top = Math.min(...(elements.map(e => { const style = window.getComputedStyle(e); return getElementPosition(e).top - parseFloat(style.marginTop); } )));
            // const bottom = Math.max(...(elements.map(e => { const style = window.getComputedStyle(e); return getElementPosition(e).bottom + parseFloat(style.marginBottom); } )));
            // const height = bottom - top;
            const visibleElements = allElements.filter(e => isScrolledIntoView(e));
            const beforeTotalHeight = getTotalHeight(document);
            // Delete the elements and unobserve them
            for (const element of elements) {
              if (intersectionObserver) {
                intersectionObserver.unobserve(element);
              }
              element.remove();
            }
            const height = beforeTotalHeight - getTotalHeight(document);
            // Delete the page properties to remove the references to the elements and free up memory (don't think we need number, url, or title either)
            // Object.keys(page).filter(e => !["number", "url", "title"].includes(e))).forEach(key => delete page[key]);
            Object.keys(page).forEach(key => delete page[key]);
            console.log("removePages() - height=" + height + ", scrollY=" + window.scrollY + ", scrollY - height=" + (window.scrollY - height) + ", totalHeight=" + getTotalHeight(document) + ", window.scrollY - height > 0 ?=" + ((window.scrollY - height) > 0));
            // Note: Most websites do not need the scroll position adjusted (S)
            // We only adjust the scroll position on sites that have a low window.scrollY, which causes a negative so we don't adjust it on those sites (D/G)
            // Adjust the scrollbar y position to take into account the height of the removed page's elements by subtracting it
            // moved: if there was a previously visible element that is no longer visible, that means we moved and need to adjust the scroll position
            const moved = visibleElements.some(element => !isScrolledIntoView(element));
            console.log("removePages() - moved=" + moved + ", visibleElements=");
            console.log(visibleElements);
            if (moved && (height && (window.scrollY - height) > 0)) {
              // Note: The Window.scroll and Window.scrollTo functions are apparently identical in implementation so pick any one to use
              // window.scroll(window.scrollX, window.scrollY - height);
              window.scroll(window.scrollX, window.scrollY - height);
            }
          } else {
            // The Page Iframe Media append modes do not need a scroll position adjustment and we can just delete the page
            elements.forEach(element => element.remove());
            Object.keys(page).forEach(key => delete page[key]);
          }
        }
      }
    }
  }

  /**
   * Before Infy can append pages, the first page (i.e. the existing page on the screen) should be prepared. This is so
   * we can store the initial page in the pages array and check when the user has scrolled it into view. The append mode
   * is used to determine how to prepare it. For example, in element mode, the insertion point needs to be defined.
   *
   * Note: We do not await appendFinally() because start() calls this and we don't want to delay the popup or badge.
   * The only property that is set to the instance is total pages, which should always be 1 to begin with.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function prepareFirstPage(caller) {
    console.log("prepareFirstPage() - caller=" + caller);
    // If iframe, set to iframe or page depending on what iframePageOne is. Otherwise, do whatever the append mode is
    const mode = instance.append === "iframe" ? instance.iframePageOne ? "iframe" : "page" : instance.append;
    let observableElement;
    switch (mode) {
      case "page":
        // We choose the first page's element by picking the first one with a height > 0 px. We first look at the body's first-level children and then fall-back to walking through every element in the body
        observableElement = getObservableElements([...document.body.querySelectorAll(":scope > *")])[0] || getObservableElements(DOMNode.getNodesByTreeWalker(document.body, NodeFilter.SHOW_ELEMENT))[0];
        if (!observableElement) {
          observableElement = document.createElement("span");
          document.body.prepend(observableElement);
        }
        // We need to append a margin-bottom similar to the PAGE_STYLE and IFRAME_STYLE to give us some breathing room when detecting the current page
        const marginBottom = document.createElement("div");
        marginBottom.style.setProperty("margin-bottom", "2rem", "important");
        document.body.appendChild(marginBottom);
        resizeMedia("page", document.body);
        appendFinally("page", observableElement, "prepareFirstPage");
        break;
      case "iframe":
        // We are loading the first page in an iframe for maximum unbreakability!
        await appendIframe("prepareFirstPage");
        break;
      case "element":
      case "ajax":
      case "ajax-native":
        pageElements = Elementify.getPageElements(document);
        insertionPoint = Elementify.getInsertionPoint(pageElements, true);
        if (instance.debugEnabled && insertionPoint && insertionPoint.nodeType === Node.TEXT_NODE) {
         insertionPoint.textContent = "Infy Scroll (Debug Mode) Insertion Point";
        }
        observableElement = getObservableElements(pageElements)[0];
        // If no observable element, create a span and put it before the first page element. The first page element may not necessarily be the first child element of the parent, so we can't use insertionPoint.parentNode.prepend(observableElement)
        if (!observableElement && pageElements && pageElements[0]) {
          observableElement = document.createElement("span");
          DOMNode.insertBefore(observableElement, pageElements[0]);
        }
        // For websites where the insertion point's parent is a grid, we need to know the number of columns in order to make the page divider break
        if (insertionPoint.parentElement && (instance.scrollDivider === "element" || instance.scrollDivider === "yes")) {
          const style = window.getComputedStyle(insertionPoint.parentElement);
          if (style && style.display === "grid" && style.gridTemplateColumns && style.gridTemplateColumns !== "none") {
            instance.scrollDividerGrid = style.gridTemplateColumns.split(" ").length || 0;
          }
        }
        if (instance.append === "ajax" && instance.ajaxMode === "native" && !checks.ajaxScriptInjected) {
          const script = document.createElement("script");
          // TODO: We can make the event name random by passing in a parameter to this script, like this:
          // EVENT_AJAX = instance.randomString;
          // script.src = chrome.runtime.getURL("/js/ajax.js?") + new URLSearchParams({eventName: EVENT_AJAX});
          script.src = chrome.runtime.getURL("/js/ajax.js");
          script.onload = function () {
            console.log("prepareFirstPage() - ajax.js script loaded");
            checks.ajaxScriptInjected = true;
            setTimeout(() => {
              triggerCustomEvent(EVENT_AJAX, document, {
                // Test disableScrollObjects: window,document,document.documentElement,document.body
                "disableScrollObjects": instance.disableScrollObjects || "window",
                "disableScrollElementPath": instance.disableScrollElementPath || "",
                "disableScrollFunctions": instance.disableScrollFunctions || "onscroll,scroll,scrollBy,scrollIntoView,scrollIntoViewIfNeeded,scrollTo",
                "pathType": instance.pageElementType
              }, true);
              triggerCustomEvent(EVENT_AJAX, document, {
                "disableRemoveElementPath": instance.disableRemoveElementPath || DOMPath.generatePath(insertionPoint.parentNode, instance.pageElementType).path,
                "disableRemoveFunctions": instance.disableRemoveFunctions || "remove,removeChild",
                "pathType": instance.pageElementType
              }, true);
            }, 1000);
            // Remove the script to keep the page clean, the listener will still be active when we trigger events to it later on
            this.remove();
          };
          (document.head || document.body || document.documentElement).appendChild(script);
        }
        // TODO: Commenting this out for now since not sure if this is a good idea for page 1 links to open in a new tab
        // Note: We only set the links to open in a new tab on Page 1 for Append Element/AJAX modes since they are not the entire page
        // Some websites dynamic content anchors haven't yet loaded; this is a bit hacky as we are using setTimeout()...
        // if (instance.linksNewTabOneEnabled) {
          for (let timeoutCheck = 0; timeoutCheck <= 2000; timeoutCheck += 1000) {
            setTimeout(() => { setLinksNewTab(pageElements); }, timeoutCheck);
          }
        // }
        // resizeMedia("element", document.body);
        appendFinally(mode, observableElement, "prepareFirstPage");
        // We do this after appendFinally so that page one is appended properly first before calling the action on the iframe
        // if ((caller === "prepareFirstPage" || caller === "mirrorPageAdopt") && instance.workflowReverse) {
        if (instance.workflowReverse) {
          await prepareIframe(true, caller);
        }
        break;
      case "media":
        const media = document.createElement("div");
        media.style = processStyle(MEDIA_STYLE);
        document.body.querySelectorAll(":scope > *").forEach(element => media.appendChild(element));
        document.body.appendChild(media);
        resizeMedia("media", media);
        appendFinally("media", media, "prepareFirstPage");
        break;
      case "none":
        button = Click.findButton(instance.buttonPath, instance.buttonType, document, false).button;
        appendFinally("none", button, "prepareFirstPage");
        break;
    }
  }

  /**
   * Displays the loading element while the next page is loading. This is the loading element that is fixed in the
   * corner; it is only needed if there is no divider being appended, as the divider icon becomes the loading element
   * in those cases.
   *
   * @private
   */
  function appendLoading() {
    console.log("appendLoading() - scrollLoading=" + instance.scrollLoading);
    try {
      if (instance.scrollLoading && (!instance.scrollIcon || !divider)) {
        loading.style.setProperty("display", "block", "important");
      }
    } catch (e) {
      console.log("appendLoading() - Error:");
      console.log(e);
    }
  }

  /**
   * If scroll detection is Intersection Observer, appends the hidden bottom element for the bottom observer. If the bottom
   * element doesn't exist, creates it.
   *
   * TODO: This code is mostly made up of appendDivider(), should we try and combine them in one function?
   */
  function appendBottom() {
    // console.log("appendDivider() - instance.scrollDivider=" + instance.scrollDivider);
    try {
      // What about none?
      if (instance.scrollDetection === "io" && instance.append !== "none") {
        if (!bottom) {
          // The divider elements' style omits display intentionally because this is variable depending on tag and tag2
          // TODO: Add a default display to tag and tag2 when not div
          // const align = instance.scrollDividerAlign === "left" ? "left" : instance.scrollDividerAlign === "right" ? "right" : "center";
          // TODO: Add "direction: ltr;" to style to take into account rtl languages like Arabic, which make the infinity icon come after the Page #. A little worried this may screw things up on the other parts of the page
          // let style = "visibility: hidden; background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; float: none; height: 10px; margin: 0 auto; position: static; text-align: " + align + "; width: auto; z-index: auto; ";
          let style = "visibility: hidden; clear: both; float: none; height: 1px; margin: 0; padding: 0; auto; position: static; width: auto; z-index: auto; ";
          // Before we added the Page Divider Align Option, it was: const style = "visibility: visible; float: none; clear: both; text-align: center; margin: 0 auto; ";
          let tag = "div";
          let tag2 = "div";
          // The divider tag is dependant on what the page element parent is (e.g. div, ul, table)
          if (insertionPoint?.parentNode?.nodeName && (instance.append === "element" || instance.append === "ajax")) {
            const nodeName = insertionPoint.parentNode.nodeName.toUpperCase();
            switch(nodeName) {
              case "DL":                  tag = "dt"; tag2 = "dd"; break;
              case "OL":    case "UL":    tag = "li";              break;
              case "TABLE": case "TBODY": tag = "tr"; tag2 = "td"; break;
              case "THEAD":               tag = "tr"; tag2 = "th"; break;
            }
            // Bing Search removes the li divider in its ol parent, so we use a p instead. This is a bit hacky...
            if (instance.isBingSearchURL && tag === "li") {
              tag = "p";
            }
          }
          console.log("appendBottom() - creating bottom tag=" + tag + ", bottom.container tag=" + tag2);
          // If this is a table row, must calculate colspan before we re-create the divider
          const colSpan = tag === "tr" ? calculateColSpan() : undefined;
          bottom = document.createElement(tag);
          // Note: Do not apply a className to the divider. Some websites, like Bing Search, remove the divider due to having a className
          // TODO: Still need to fix the divider issue with Bing Search, as it still sometimes happens
          bottom.id = "infy-scroll-bottom";
          // bottom.classList.add(DIVIDER_CLASS);
          // Divider style only adds border-top and padding/margin if not a table row (tr)
          bottom.style = processStyle(style + (instance.scrollDividerGrid > 0 ? "grid-column-start: 1; grid-column-end: none; " : "") + (tag !== "tr" ? " " + instance.color + "; padding: 0 0 0 0; margin: 0 auto; width: 100%;" + (tag === "div" ? " display: block;" : tag === "li" ? "list-style: none;" : "") : ""));
          const container = document.createElement(tag2);
          container.style = processStyle(style + (tag2 === "div" ? "display: block;" : ""));
          if (colSpan) {
            container.colSpan = colSpan;
          }
          bottom.appendChild(container);
          // If the divider's parent element is a grid, we need to adjust it just once by subtracting one from it
          // if (!instance.scrollDividerGridParentModified && instance.scrollDividerGrid > 0 && insertionPoint && insertionPoint.parentElement) {
          if (instance.scrollDividerGrid > 0 && insertionPoint && insertionPoint.parentElement) {
            const array = window.getComputedStyle(insertionPoint.parentElement).gridTemplateColumns.split(" ");
            array.pop();
            if (array.length > 1) {
              insertionPoint.parentElement.style.setProperty("grid-template-columns", array.join(" "), "important");
            }
            // For complex sites, sometimes the grid is being appended multiple times and we need to keep modifying it so we can't just do it once as this boolean will restrict it to:
            // instance.scrollDividerGridParentModified = true;
          }
        }
        // Divider needs to be appended differently depending on the append mode. If element/ajax, use insertionPoint otherwise just append to the end of the document (page and iframe)
        if (instance.append === "element" || instance.append === "ajax") {
          // If we are in Element Iframe (Trim), we need to put the divider right before the iframe instead of using the insertion point because it was appended early
          const point = instance.append === "element" && instance.pageElementIframe === "trim" && iframe ? iframe : insertionPoint;
          DOMNode.insertBefore(bottom, point);
        } else {
          document.body.appendChild(bottom);
        }
      }
    } catch (e) {
      console.log("appendBottom() - Error:");
      console.log(e);
    }
  }

  /**
   * If enabled, appends a page divider for each page that was appended.
   * The page divider consists of the infinity svg icon, page number, and a horizontal line above it (except in tables).
   * If the option is enabled, it will also consist of extra page navigation buttons for going down and up pages.
   *
   * @private
   */
  function appendDivider() {
    // console.log("appendDivider() - instance.scrollDivider=" + instance.scrollDivider);
    try {
      if (instance.scrollDivider === "yes" || (instance.scrollDivider === "element" && (instance.append === "element" || instance.append === "ajax"))) {
        // The divider elements' style omits display intentionally because this is variable depending on tag and tag2
        // TODO: Add a default display to tag and tag2 when not div
        const align = instance.scrollDividerAlign === "left" ? "left" : instance.scrollDividerAlign === "right" ? "right" : "center";
        // TODO: Add "direction: ltr;" to style to take into account rtl languages like Arabic, which make the infinity icon come after the Page #. A little worried this may screw things up on the other parts of the page
        let style = "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; float: none; height: auto; margin: 0 auto; position: static; text-align: " + align + "; visibility: visible; width: auto; z-index: auto; ";
        // Before we added the Page Divider Align Option, it was: const style = "visibility: visible; float: none; clear: both; text-align: center; margin: 0 auto; ";
        let tag = "div";
        let tag2 = "div";
        // The divider tag is dependant on what the page element parent is (e.g. div, ul, table)
        if (insertionPoint?.parentNode?.nodeName && (instance.append === "element" || instance.append === "ajax")) {
          const nodeName = insertionPoint.parentNode.nodeName.toUpperCase();
          switch(nodeName) {
            case "DL":                  tag = "dt"; tag2 = "dd"; break;
            case "OL":    case "UL":    tag = "li";              break;
            case "TABLE": case "TBODY": tag = "tr"; tag2 = "td"; break;
            case "THEAD":               tag = "tr"; tag2 = "th"; break;
          }
          // Bing Search removes the li divider in its ol parent, so we use a p instead. This is a bit hacky...
          if (instance.isBingSearchURL && tag === "li") {
            tag = "p";
          }
        }
        console.log("appendDivider() - divider tag=" + tag + ", divider.container tag=" + tag2);
        // If this is a table row, must calculate colspan before we re-create the divider
        const colSpan = tag === "tr" ? calculateColSpan() : undefined;
        divider = document.createElement(tag);
        // Note: Do not apply a className to the divider. Some websites, like Bing Search, remove the divider due to having a className
        // TODO: Still need to fix the divider issue with Bing Search, as it still sometimes happens
        divider.id = "infy-scroll-divider-" + (pages.length + 1);
        divider.classList.add(DIVIDER_CLASS);
        // Divider style only adds border-top and padding/margin if not a table row (tr)
        divider.style = processStyle(style + (instance.scrollDividerGrid > 0 ? "grid-column-start: 1; grid-column-end: none; " : "") + (tag !== "tr" ? "border-top: 1px solid " + instance.color + "; padding: 4px 0 0 0; margin: 1rem auto; width: 100%;" + (tag === "div" ? " display: block;" : tag === "li" ? "list-style: none;" : "") : ""));
        const container = document.createElement(tag2);
        container.style = processStyle(style + (tag2 === "div" ? "display: block;" : ""));
        if (colSpan) {
          container.colSpan = colSpan;
        }
        const anchor = document.createElement("a");
        anchor.href = instance.url;
        // Also make the page divider follow the same behavior as page links based on the EXTRA option
        if (instance.linksNewTabEnabled) {
          anchor.target = "_blank";
        }
        anchor.style = processStyle(style + "display: inline; text-decoration: none; color:" + instance.color + ";");
        if (instance.scrollIcon) {
          const icon = createIcon("infinity", { animated: instance.scrollLoading });
          icon.setAttribute("class", "infy-scroll-divider-infinity-icon");
          anchor.appendChild(icon);
        }
        const text = document.createElement("span");
        text.style = processStyle(style + "color:" + instance.color + "; display: inline; font-weight: bold; font-style: normal; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; line-height: initial; letter-spacing: initial; vertical-align: middle; user-select: none;");
        text.textContent = chrome.i18n.getMessage("page_label") + " " + (pages.length + 1);
        anchor.appendChild(text);
        // Need to cache the current pages length right now to be used later for the divider buttons' listeners
        const currentPagesLength = pages.length;
        if (instance.scrollDividerButtons) {
          const icon2 = createIcon("angles-up");
          container.appendChild(icon2);
          icon2.addEventListener("click", () => { Workflow.execute("up", "scrollClickActionButton", {page: 1}); });
          const icon = createIcon("angle-up");
          container.appendChild(icon);
          icon.addEventListener("click", () => { Workflow.execute("up", "scrollClickActionButton", {page: currentPagesLength}); });
        }
        container.appendChild(anchor);
        if (instance.scrollDividerButtons) {
          const icon = createIcon("angle-down");
          container.appendChild(icon);
          icon.addEventListener("click", () => { Workflow.execute("down", "scrollClickActionButton", {page: currentPagesLength + 2});});
          const icon2 = createIcon("angles-down");
          container.appendChild(icon2);
          icon2.addEventListener("click", () => { Workflow.execute("down", "scrollClickActionButton", {page: pages.length});});
        }
        divider.appendChild(container);
        // If the divider's parent element is a grid, we need to adjust it just once by subtracting one from it
        // if (!instance.scrollDividerGridParentModified && instance.scrollDividerGrid > 0 && insertionPoint && insertionPoint.parentElement) {
        if (instance.scrollDividerGrid > 0 && insertionPoint && insertionPoint.parentElement) {
          const array = window.getComputedStyle(insertionPoint.parentElement).gridTemplateColumns.split(" ");
          array.pop();
          if (array.length > 1) {
            insertionPoint.parentElement.style.setProperty("grid-template-columns", array.join(" "), "important");
          }
          // For complex sites, sometimes the grid is being appended multiple times and we need to keep modifying it so we can't just do it once as this boolean will restrict it to:
         // instance.scrollDividerGridParentModified = true;
        }
        // Divider needs to be appended differently depending on the append mode. If element/ajax, use insertionPoint otherwise just append to the end of the document (page and iframe)
        if (instance.append === "element" || instance.append === "ajax") {
          // If we are in Element Iframe (Trim), we need to put the divider right before the iframe instead of using the insertion point because it was appended early
          // Note the bottom || insertionPoint so that we always insert the divider before the bottom (if it exists) to avoid a small "jump"
          const point = instance.append === "element" && instance.pageElementIframe === "trim" && iframe ? iframe : bottom || insertionPoint;
          DOMNode.insertBefore(divider, point);
        } else {
          document.body.appendChild(divider);
        }
      } else {
        // If the append mode changed and we are no longer appending a divider, we need this else to know to change the point to the element
        divider = undefined;
      }
    } catch (e) {
      console.log("appendDivider() - Error:");
      console.log(e);
    }
  }

  /**
   * Appends a message on the page in case there is an error encountered that the user should know about (e.g. iframes
   * not being supported).
   *
   * @param {string} message - the message to display
   * @param {Element} el - (optional) the element to append along with the message, e.g. an anchor
   * @private
   */
  function appendMessage(message, el) {
    console.log("appendMessage() - message=" + message);
    const div = document.createElement("div");
    div.id = "infy-scroll-message";
    div.style = processStyle("all: initial; position: fixed; bottom: 0; left: 0; padding: 8px; z-index: 2147483647; background: white;");
    if (instance.scrollIcon) {
      const icon = createIcon("infinity");
      div.appendChild(icon);
    } else {
      // By always appending a first child, we can always assume the text below is going to be overlay.children[1] when we go and later update it
      const span = document.createElement("span");
      span.textContent = chrome.i18n.getMessage("infy_scroll_message");
      div.appendChild(span);
    }
    const MESSAGE_STYLE = "vertical-align: middle; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; font-weight: bold; font-style: normal;";
    const text = document.createElement("span");
    text.style = processStyle(MESSAGE_STYLE + " color: #b00020");
    text.textContent = message;
    div.appendChild(text);
    if (el) {
      el.style = processStyle(MESSAGE_STYLE + " color: black; text-decoration: underline;");
      div.appendChild(el);
    }
    document.body.appendChild(div);
    setTimeout(function () {
      document.body.removeChild(div);
    }, 20000);
  }

  /**
   * Scrolls the current hidden iframe indefinitely, or for a set number of seconds.
   *
   * @private
   */
  async function scrollIframeIndefinitely() {
    console.log("scrollIframeIndefinitely() - scrollIframeEnabled=" + instance.scrollIframeEnabled);
    if (!instance.scrollIframeEnabled) {
      return;
    }
    // This property and the timeout is needed to make this run for a set number of seconds
    instance.scrollIframe = true;
    // Important: The height matters on some websites. If we only make this 0px or even 1px, it won't be enough to get the images to lazy load (e.g. "p" mobile)
    if (instance.debugEnabled) {
      // If we're debugging, we want to make the iframe take up a small space on the screen and have a scrollbar (which will show up after the iframe has been scrolled)
      iframe.style.setProperty("height", "250px", "important");
      iframe.removeAttribute("scrolling");
    } else {
      iframe.style.setProperty("height", ((Math.min(document.documentElement?.clientHeight, window.innerHeight) + "") || "500") + "px", "important");
    }
    clearTimeout(timeouts.scrollIframe);
    timeouts.scrollIframe = setTimeout(() => {
      instance.scrollIframe = false;
    }, 10000);
    while (instance.enabled && instance.scrollIframe) {
      await scrollIframe(iframe);
    }
    if (!instance.debugEnabled) {
      iframe.style.setProperty("height", "0", "important");
    }
  }

  /**
   * Scrolls the hidden iframe to display each page element. This is done to force the site to lazy load the page
   * elements' (images) before they are transferred from the iframe to the top-level document.
   *
   * @param {HTMLIFrameElement} iframe_ - the iframe to scroll
   * @private
   */
  async function scrollIframe(iframe_) {
    await Promisify.sleep(1);
    if (!iframe_ || !iframe_.contentDocument) {
      return;
    }
    const pageElements_ = Elementify.getPageElements(iframe_.contentDocument);
    // Scroll by pageElements (scrollIntoView)
    // Note: If the pageElements is just one element (e.g. a container element), look at its children (risky)
    for (const pageElement of (pageElements_.length === 1 && pageElements_[0] && pageElements_[0].children ? pageElements_[0].children : pageElements_)) {
      // Firefox Dead Object Error: Need to wrap this in a try-catch because the iframe document may have changed after we slept, and the pageElements may be dead
      try {
        // If scrollIframe was set to false, we need to exit this loop immediately (only really needed for Element Iframe Trim)
        if (!instance.scrollIframe) {
          break;
        }
        // We only want to scroll if the pageElement hasn't been imported to the top-level document
        if (pageElement.ownerDocument === iframe_.contentDocument) {
          // "start" seems to perform the best; options are start, end, center, nearest
          pageElement.scrollIntoView({behavior: "auto", block: "start", inline: "start"});
        }
        // We must sleep for at least 0ms or else this strategy won't work (using 1ms to be safe)
        await Promisify.sleep(1);
      } catch (e) {
        console.log("scrollIframe() - Error (most likely Firefox Dead Object Error):");
        console.log(e);
        break;
      }
    }
    // TODO: This doesn't seem to work after the first page or two; it may be a positioning issue
    // // Scroll by pageElements top and bottom (scrollTo)
    // const filteredElements = pageElements_.filter(e => e.nodeType === Node.ELEMENT_NODE);
    // const top = Math.min(...(filteredElements.map(e => getElementPosition(e).top)));
    // const bottom = Math.max(...(filteredElements.map(e => getElementPosition(e).bottom)));
    // for (let i = top; i < bottom; i += 25) {
    //   iframe.contentWindow.scrollTo({top: i, left: 0, behavior: "auto"});
    //   await Promisify.sleep(1);
    // }
  }

  /**
   * Gets the observable elements from the elements array.
   *
   * An observable element is the first Node.ELEMENT_NODE in the elements array. It must be a Node.ELEMENT_NODE because it is the element used to
   * observe which page we are in (text or comment nodes can't be used). It should also be 1px or higher so it can be
   * scrolled into view and detected. Finally, the element should have a default position attribute of static (or at
   * least relative) to avoid issues with absolute and fixed elements.
   *
   * Note: This function is also called in prepareFirstPage() to find the first page's observable element, and also in
   * Append Page mode to get each page's observable element.
   *
   * @param {Element[]} elements - the elements array
   * @returns {Element[]} the observable elements selected from the elements array
   * @private
   */
  function getObservableElements(elements) {
    console.log("getObservableElements() - elements.length=" + elements.length);
    let observableElements = [];
    if (elements && elements.length > 0) {
      // Set the observableElement to the first element node that is 1px or higher and that has a default position of static (it can't be a text or comment node in order to use getClientBoundRect in SL or to observe it in IO)
      // Prioritize finding a position node that meets all the requirements, then use the first available height node, then the first available element node
      const elementNodes = elements.filter(e => e && e.nodeType === Node.ELEMENT_NODE);
      const heightNodes = elementNodes.filter(e => Math.max(e.clientHeight, e.offsetHeight, e.scrollHeight) > 0);
      const positionNodes = heightNodes.filter(e => window.getComputedStyle(e).getPropertyValue("position") === "static");
      // TODO: Fallback to even text/comment nodes here, e.g. || elements[0] ?
      // observableElement = positionNodes[0] || heightNodes[0] || elementNodes[0];
      observableElements = positionNodes.concat(heightNodes, elementNodes);
    }
    return observableElements;
  }

  /**
   * Calculates the colSpan of the table (page element parent). This is only used for the divider in Append Element mode
   * when the divider needs to be a table row (in other words, the page element parent is a table or tbody).
   *
   * @returns {number} the colSpan of the table (page element parent)
   * @private
   */
  function calculateColSpan() {
    console.log("calculateColSpan()");
    let colSpan;
    try {
      // If we already have a divider with the container child's colspan, we don't need to calculate the colspan again
      if (divider?.children[0]?.colSpan > 0) {
        console.log("calculateColSpan() - colSpan already calculated, using prior divider's colSpan");
        colSpan = divider.children[0].colSpan;
      } else {
        // Else we need to calculate it by looking at each row using the number of cells and their colspan (using the max colSpan found for each row)
        console.log("calculateColSpan() - calculating colSpan for the first time using the table's rows...");
        // TODO: colspan can sometimes be 0 (nonstandard in HTML 5) so change to: cell.colspan || 1?
        colSpan = Math.max(...[...insertionPoint.parentNode.rows].map(row => [...row.cells].map(cell => cell.colSpan).reduce(function (a,b) { return a + b }, 0)));
      }
    } catch (e) {
      console.log("calculateColSpan() - Error:");
      console.log(e);
    }
    if (!colSpan || colSpan <= 0) {
      console.log("calculateColSpan() - no colSpan found, setting colSpan to 1");
      colSpan = 1;
    }
    console.log("calculateColSpan() - colSpan=" + colSpan);
    return colSpan;
  }

  /**
   * Calculates the offset, which is the space in pixels from the bottom of the content to the very bottom of the page.
   * This theoretically only needs to be calculated one time, as the offset should never change since this space is
   * never modified. However, on some websites (e.g. Amazon Reviews), the offset needs to be re-calculated after each
   * append call, perhaps due to dynamic content being added at the bottom, or else the pages get appended a bit late.
   *
   * @private
   */
  function calculateOffset() {
    // IntersectionObserver doesn't need an offset
    if (intersectionObserver) {
      return;
    }
    // Page, Iframe, and Media Append modes always have an offset of 0
    if (instance.append === "page" || instance.append === "iframe" || instance.append === "media") {
      console.log("calculateOffset() - append mode is page, iframe, or media, so setting offset to 0");
      offset = 0;
      return;
    }
    // In Click Button Action Manual mode, it's just buttonPosition and no need to calculate it
    if (instance.action === "click" && instance.append === "none" && instance.buttonDetection === "manual") {
      console.log("calculateOffset() - action is button and buttonDetection is manual, so setting offset to buttonPosition=" + instance.buttonPosition);
      offset = instance.buttonPosition;
      return;
    }
    // Everything Else either uses pageElements (Element, Element Iframe, AJAX) or Auto Button Detection (None)
    // First get the absolute bottom position (total height of the document) in pixels
    const bottom_ = getTotalHeight(document);
    // Check where the element point is on the document and find its position. Its position (top) can then be used to calculate the offset
    let elementPosition = instance.append === "none" ? getElementPosition(button) : getElementPosition(insertionPoint);
    // TODO: Experiment with NOT doing this anymore on the elementPosition and just relying on option 2 if insert isn't an element
    // If the insertion point isn't an element, we must wrap it inside an element to calculate its position
    // if (insertionPoint && insertionPoint.nodeType === Node.TEXT_NODE) {
    //   const element = convertTextToElement(insertionPoint);
    //   elementPosition = getElementPosition(element);
    //   // Take the insertion point out of the element and back where it was, then remove the element
    //   if (element) {
    //     DOMNode.insertBefore(insertionPoint, element);
    //     element.remove();
    //   }
    // } else {
    //  elementPosition = getElementPosition(insertionPoint);
    // }
    // 1st Option: Use the element's top position
    let difference = elementPosition.top;
    // 2nd Option: If in element/ajax mode, fall back to calculating the elements' bottom position and use the biggest value
    if ((instance.append === "element" || instance.append === "ajax") && (!difference || difference <= 0)) {
      console.log("calculateOffset() - no value found from the insertion point's top, calculating each element's bottom position ...");
      // If setting the instance (changing the append mode) and we haven't yet set the page elements for the first time
      if (!pageElements) {
        pageElements = Elementify.getPageElements(document);
      }
      // difference = Math.max(...(pageElements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => getElementPosition(e).bottom)));
      // TODO: getBoundingClientRect includes padding and border, should we remove these before computing the element's bottom?
      difference = Math.max(...(Elementify.getPageElements(document).filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => getElementPosition(e).bottom)));
    }
    // 3rd Option: Fall back to using the total document height * 0.75
    if (!difference || difference <= 0) {
      console.log("calculateOffset() - no value found from any of the elements' bottom position, calculating the document's bottom * 0.75 ...");
      difference = bottom_ * 0.75;
    }
    // ceil (round up 1 pixel) just in case?
    offset = Math.ceil(bottom_ - difference);
    console.log(pageElements ? ("calculateOffset() - the elements' max bottom position was:" + Math.max(...(pageElements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => getElementPosition(e).bottom)))) : "");
    console.log("calculateOffset() - bottom=" + bottom_ + ", offset=" + offset + ", elementPosition=" + elementPosition.top + ", backup bottom*0.75=" + (bottom_ * .75) + ", and the value chosen was=" + difference);
  }

  /**
   * Gets an element's position relative to the entire document. We use getBoundingClientRect() to find the position.
   *
   * @param {Element} element - the element to get the position of
   * @returns {{top: number, left: number}|{top}}
   * @see https://plainjs.com/javascript/styles/get-the-position-of-an-element-relative-to-the-document-24/
   * @see https://stackoverflow.com/a/1461143
   * @private
   */
  function getElementPosition(element) {
    let position = { top: 0, bottom: 0, left: 0 };
    try {
      if (typeof element.getBoundingClientRect === "function") {
        // Commented out the left since it's not needed for our purposes (we only care about vertical position)
        const rect = element.getBoundingClientRect();
        // const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        position.top = rect.top + scrollTop;
        position.bottom = rect.bottom + scrollTop;
        // position.left = rect + scrollLeft;
      }
    } catch (e) {
      console.log("getElementPosition() - Error:");
      console.log(e);
    }
    // console.log("getElementPosition() - position.top=" + position.top + ", position.bottom=" + position.bottom);
    return position;
  }

  /**
   * Triggers a {@link CustomEvent}. This allows userscripts and external extensions to act accordingly on the event.
   * This usually occurs when a new node is inserted into the document.
   *
   * A CustomEvent contains a details object that contains properties about this event, like the instance's current URL.
   *
   * @param {string} name - the event name
   * @param {Element|Document} element - the element or document that triggers this event
   * @param {CustomEventInit} detail - the detail object to attach to this event
   * @param {boolean} isRequired - if this event is required to be triggered, regardless of instance.customEventsEnabled
   * @see https://javascript.info/dispatch-events for the difference between {@link Event} and {@link CustomEvent}
   * @see https://vhudyma-blog.eu/custom-events-in-javascript/
   * @private
   */
  function triggerCustomEvent(name, element, detail, isRequired = false) {
    try {
      if (instance.customEventsEnabled || isRequired) {
        console.log("triggerCustomEvent() - name=" + name + ", element=" + element + ", force=" + isRequired);
        const object = {
          detail: undefined,
          bubbles: true,
          cancelable: false
        };
        // Depending on the browser we need to handle the detail differently:
        // Firefox: We need to use the Firefox-only "cloneInto" @see: https://stackoverflow.com/a/46081249 https://bugzilla.mozilla.org/show_bug.cgi?id=1495243
        // Firefox: Also @see https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
        // We also clone the detail due to a bug in Chrome. The detail object would normally return null. We also need this for Firefox as well. @see https://stackoverflow.com/a/53914790
        // Note: Must use JSON.parse(JSON.stringify())), Not Util.clone() or structuredClone() because it throws DOMException: Failed to execute 'structuredClone' on 'Window': HTMLDivElement object could not be cloned.
        if (items.browserName === "firefox" && typeof cloneInto === "function") {
          console.log("triggerCustomEvent() - using Firefox's window.cloneInto() to clone the detail");
          object.detail = cloneInto(JSON.parse(JSON.stringify(detail)), document.defaultView);
        } else {
          console.log("triggerCustomEvent() - only using normal clone to clone the detail");
          object.detail = JSON.parse(JSON.stringify(detail));
        }
        const event = new CustomEvent(name, object);
        element.dispatchEvent(event);
      }
    } catch (e) {
      console.log("triggerCustomEvent() - Error:");
      console.log(e);
    }
  }

  // TODO: This usually works really well but has occasionally given incorrect values, so we'll need to rethink this approach
  // /**
  //  * Converts a text node into a HTML element (namely the insertion point) so that we can use Node.ELEMENT_NODE
  //  * functions, like getBoundingClientRect in order to calculate the scroll position.
  //  *
  //  * @param {Node} node - the node
  //  * @returns {HTMLSpanElement|*} the converted element
  //  * @private
  //  */
  // function convertTextToElement(node) {
  //   console.log("convertTextToElement()");
  //   try {
  //     if (node.nodeType === Node.TEXT_NODE) {
  //       const element = document.createElement("span");
  //       DOMNode.insertBefore(element, node);
  //       element.appendChild(node);
  //       return element;
  //     }
  //   } catch (e) {
  //     console.log("convertTextToElement() - Error:");
  //     console.log(e);
  //   }
  //   return node;
  // }

  /**
   * Creates an SVG icon. This is used to create the infinity icon, the page divider up/down buttons, and the close
   * button for the overlay/debug.
   *
   * Note: infinity icon generated by loading.io
   *
   * @param {string} name - the name of the icon (FontAwesome icon name if applicable)
   * @param {Object} options - the options to override the default icon properties: color, width, height, and animated
   * @returns {SVGSVGElement | Text} the svg element or a text node if SVGs aren't supported
   * @see https://loading.io
   * @private
   */
  function createIcon(name, options = {}) {
    console.log("createIcon() - icon=" + name);
    let svg;
    const icons = {
      "infinity": {
        viewBox: "0 0 100 100",
        width: "33",
        height: "33",
        fill: "none",
        "stroke": instance.color,
        "strokeWidth": "15",
        "strokeLinecap": "round",
        "pathStyle": "transform:scale(0.77); transform-origin:50px 50px;",
        path: "M24.3 30C11.4 30 5 43.3 5 50s6.4 20 19.3 20c19.3 0 32.1-40 51.4-40 C88.6 30 95 43.3 95 50s-6.4 20-19.3 20C56.4 70 43.6 30 24.3 30z",
        style: ""
      },
      "angle-down": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        fill: instance.color,
        path: "M192 384c-8.188 0-16.38-3.125-22.62-9.375l-160-160c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L192 306.8l137.4-137.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-160 160C208.4 380.9 200.2 384 192 384z",
        style: "cursor: pointer; margin-left: 16px;"
      },
      "angle-up": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        fill: instance.color,
        path: "M352 352c-8.188 0-16.38-3.125-22.62-9.375L192 205.3l-137.4 137.4c-12.5 12.5-32.75 12.5-45.25 0s-12.5-32.75 0-45.25l160-160c12.5-12.5 32.75-12.5 45.25 0l160 160c12.5 12.5 12.5 32.75 0 45.25C368.4 348.9 360.2 352 352 352z",
        style: "cursor: pointer; margin-right: 16px;"
      },
      "angles-down": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        fill: instance.color,
        path: "M169.4 278.6C175.6 284.9 183.8 288 192 288s16.38-3.125 22.62-9.375l160-160c12.5-12.5 12.5-32.75 0-45.25s-32.75-12.5-45.25 0L192 210.8L54.63 73.38c-12.5-12.5-32.75-12.5-45.25 0s-12.5 32.75 0 45.25L169.4 278.6zM329.4 265.4L192 402.8L54.63 265.4c-12.5-12.5-32.75-12.5-45.25 0s-12.5 32.75 0 45.25l160 160C175.6 476.9 183.8 480 192 480s16.38-3.125 22.62-9.375l160-160c12.5-12.5 12.5-32.75 0-45.25S341.9 252.9 329.4 265.4z",
        style: "cursor: pointer; margin-left: 16px;"
      },
      "angles-up": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        fill: instance.color,
        path: "M54.63 246.6L192 109.3l137.4 137.4C335.6 252.9 343.8 256 352 256s16.38-3.125 22.62-9.375c12.5-12.5 12.5-32.75 0-45.25l-160-160c-12.5-12.5-32.75-12.5-45.25 0l-160 160c-12.5 12.5-12.5 32.75 0 45.25S42.13 259.1 54.63 246.6zM214.6 233.4c-12.5-12.5-32.75-12.5-45.25 0l-160 160c-12.5 12.5-12.5 32.75 0 45.25s32.75 12.5 45.25 0L192 301.3l137.4 137.4C335.6 444.9 343.8 448 352 448s16.38-3.125 22.62-9.375c12.5-12.5 12.5-32.75 0-45.25L214.6 233.4z",
        style: "cursor: pointer; margin-right: 16px;"
      },
      // TODO: These two circle-chevron icons aren't currently being used but we might have a need for them in the future
      // "circle-chevron-down": {
      //   viewBox: "0 0 512 512",
      //   width: "20",
      //   height: "20",
      //   fill: instance.color,
      //   path: "M256 0C114.6 0 0 114.6 0 256c0 141.4 114.6 256 256 256s256-114.6 256-256C512 114.6 397.4 0 256 0zM390.6 246.6l-112 112C272.4 364.9 264.2 368 256 368s-16.38-3.125-22.62-9.375l-112-112c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L256 290.8l89.38-89.38c12.5-12.5 32.75-12.5 45.25 0S403.1 234.1 390.6 246.6z",
      //   style: "cursor: pointer; margin-left: 16px;"
      // },
      // "circle-chevron-up": {
      //   viewBox: "0 0 512 512",
      //   width: "20",
      //   height: "20",
      //   fill: instance.color,
      //   path: "M256 0C114.6 0 0 114.6 0 256c0 141.4 114.6 256 256 256s256-114.6 256-256C512 114.6 397.4 0 256 0zM390.6 310.6c-12.5 12.5-32.75 12.5-45.25 0L256 221.3L166.6 310.6c-12.5 12.5-32.75 12.5-45.25 0s-12.5-32.75 0-45.25l112-112C239.6 147.1 247.8 144 256 144s16.38 3.125 22.62 9.375l112 112C403.1 277.9 403.1 298.1 390.6 310.6z",
      //   style: "cursor: pointer; margin-right: 12px;"
      // },
      "circle-xmark": {
        viewBox: "0 0 512 512",
        width: "16",
        height: "16",
        fill: instance.color,
        path: "M0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256zM175 208.1L222.1 255.1L175 303C165.7 312.4 165.7 327.6 175 336.1C184.4 346.3 199.6 346.3 208.1 336.1L255.1 289.9L303 336.1C312.4 346.3 327.6 346.3 336.1 336.1C346.3 327.6 346.3 312.4 336.1 303L289.9 255.1L336.1 208.1C346.3 199.6 346.3 184.4 336.1 175C327.6 165.7 312.4 165.7 303 175L255.1 222.1L208.1 175C199.6 165.7 184.4 165.7 175 175C165.7 184.4 165.7 199.6 175 208.1V208.1z",
        style: "cursor: pointer; position: fixed; top: 4px; right: 4px; padding: 2px;",
        title: chrome.i18n.getMessage("close_label")
      }
    };
    const icon = icons[name];
    try {
      // TODO: Should we also use setAttributeNS() instead of setAttribute()? Also, figure out if there is a way to set these with !important without adding a class
      const ns = "http://www.w3.org/2000/svg";
      svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", options.width || icon.width);
      svg.setAttribute("height", options.height || icon.height);
      svg.setAttribute("viewBox", icon.viewBox);
      svg.setAttribute("preserveAspectRatio", "xMidYMid");
      svg.setAttribute("style", processStyle("display: inline; position: initial; margin: auto; shape-rendering: auto; vertical-align: middle; visibility: visible; width: initial; height: initial; " + icon.style));
      const path = document.createElementNS(ns, "path");
      path.setAttribute("fill", icon.fill === "none" ? icon.fill : options.color || icon.fill);
      path.setAttribute("d", icon.path);
      if (icon.stroke) {
        path.setAttribute("stroke", options.color || icon.stroke);
        path.setAttribute("stroke-width", icon.strokeWidth);
        path.setAttribute("stroke-linecap", icon.strokeLinecap);
        path.setAttribute("style", processStyle(icon.pathStyle));
      }
      if (options.animated) {
        path.setAttribute("stroke-dasharray", "205.271142578125 51.317785644531256");
        const animate = document.createElementNS(ns, "animate");
        animate.setAttribute("attributeName", "stroke-dashoffset");
        animate.setAttribute("repeatCount", "indefinite");
        animate.setAttribute("dur", "2s");
        animate.setAttribute("keyTimes", "0;1");
        animate.setAttribute("values", "0;256.58892822265625");
        path.appendChild(animate);
      }
      if (icon.title) {
        const title = document.createElementNS(ns, "title");
        title.textContent = icon.title;
        svg.appendChild(title);
      }
      svg.appendChild(path);
    } catch (e) {
      console.log("createIcon() - Error:");
      console.log(e);
      svg = document.createTextNode(" ");
    }
    return svg;
  }

  /**
   * Creates the optional overlay that is fixed on the page. The overlay shows the current page # / total page # and is
   * updated as the user scrolls.
   *
   * Note: This function is only called one time when the instance is started for the very first time.
   *
   * Important: We cannot make this an iframe like we can with the Picker UI because we will not have direct access to
   * its contentDocument from the content script. We would have to use message passing and wake up the background. This
   * is problematic because we have to update the overlay as the user scrolls, which would keep the background alive
   * as we pass messages back and forth.
   *
   * @private
   */
  function createOverlay() {
    if (overlay && typeof overlay.remove === "function") {
      overlay.remove();
    }
    // TODO: Should we not show the overlay when scroll append is none (i.e. button click)?
    if (instance.scrollOverlay || instance.debugEnabled) {
      overlay = document.createElement("div");
      overlay.id = "infy-scroll-overlay";
      // TODO: Don't hardcode these values here?
      const theme = items.theme === "dark" || (items.theme === "default" && window.matchMedia("(prefers-color-scheme: dark)")?.matches) ? "dark" : "light";
      const overlayColor = theme === "light" ? "#000000" : "#CCCCCC";
      const background = theme === "light" ? "#FFFFFF" : "#202124";
      const OVERLAY_STYLE = "all: initial; z-index: 2147483647; background: " + background + "; ";
      overlay.style = processStyle(OVERLAY_STYLE + "position: fixed; top: 0; right: 0; width: 150px; padding: 8px;");
      // Close Button
      const close = createIcon("circle-xmark", { color: overlayColor });
      close.addEventListener("click", () => {
        if (instance.debugEnabled) {
          Promisify.storageSet({"debugEnabled": false});
          instance.debugEnabled = false;
          for (const page of pages) {
            if (page.iframe && page.append === "ajax" || page.mode === "import") {
              page.iframe.style.setProperty("visibility", "hidden", "important");
            }
          }
        }
        if (instance.scrollOverlay) {
          Promisify.storageSet({"scrollOverlay": false});
          instance.scrollOverlay = false;
        }
        overlay.remove();
      });
      overlay.appendChild(close);
      // Icon
      if (instance.scrollIcon) {
        const icon = createIcon("infinity", { color: overlayColor });
        overlay.appendChild(icon);
      } else {
        // By always appending a first child, we can always assume the text below is going to be overlay.children[1] when we go and later update it
        overlay.appendChild(document.createElement("span"));
      }
      const text = document.createElement("span");
      text.style = processStyle(OVERLAY_STYLE + "vertical-align: middle; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; font-weight: bold; font-style: normal; color: " + overlayColor + ";");
      text.textContent = chrome.i18n.getMessage("page_label") + " " + instance.currentPage + " / " + instance.totalPages;
      overlay.appendChild(text);
      if (instance.debugEnabled) {
        const debugFontStyle = OVERLAY_STYLE + "font-family: 'Roboto Mono', monospace, sans-serif; font-size: 10px; font-style: normal; color: " + overlayColor + "; display: block; ";
        const debug = document.createElement("div");
        debug.style = processStyle(debugFontStyle + "margin-top: 4px; vertical-align: middle; font-weight: bold; display:");
        const title = document.createElement("div");
        title.style = processStyle(debugFontStyle);
        title.textContent = "Infy's Debug Mode";
        debug.appendChild(title);
        const lines = document.createElement("div");
        lines.style = processStyle(debugFontStyle);
        debug.appendChild(lines);
        // Debug will have 7 Lines: Bottom, Insert Bottom, Elements Bottom, 075 Bottom, Offset, Insert, Lazys
        for (let i = 0; i < 7; i++) {
          const line = document.createElement("div");
          line.style = processStyle(debugFontStyle);
          //lines.appendChild(document.createElement("br"));
          lines.appendChild(line);
        }
        overlay.appendChild(debug);
      }
      (document.body || document.documentElement)?.appendChild(overlay);
    }
  }

  /**
   * Updates the overlay when the current page changes.
   *
   * @private
   */
  function updateOverlay() {
    console.log("updateOverlay() - scrollOverlay=" + instance.scrollOverlay)
    if ((instance.scrollOverlay || instance.debugEnabled) && overlay && overlay.children[2]) {
      overlay.children[2].textContent = chrome.i18n.getMessage("page_label") + " " + instance.currentPage + " / " + instance.totalPages;
      if (instance.debugEnabled && overlay.children[3] && overlay.children[3].children[1]) {
        const bottom_ = getTotalHeight(document);
        const bottom075 = Math.floor(bottom_ * 0.75);
        const bottomOffset = bottom_ - offset;
        let bottomElements = "N/A";
        // TODO: Calculating the bottomInsert every time here is very CPU-heavy just for debugging; need to find another way to do it when we append
        // let bottomInsert = "N/A";
        // if (instance.append === "element") {
        //   bottomInsert = getElementPosition(insertionPoint).top;
        //   bottomInsert = getElementPosition(insertionPoint).top || (bottom - offset);
        //   const elements = Elementify.getPageElements(document);
        //   bottomElements = Math.floor(Math.max(...(elements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => getElementPosition(e).bottom))));
        // }
        const details = overlay.children[3].children[1];
        details.children[0].textContent  = "total bottom = " + bottom_;
        details.children[1].textContent  = "offst bottom = " + bottomOffset;
        details.children[2].textContent  = "elems bottom = " + bottomElements;
        details.children[3].textContent  = "..075 bottom = " + bottom075;
        details.children[4].textContent  = "......offset = " + offset;
        details.children[5].textContent = "insert = " + (insertionPoint ? insertionPoint.nodeName : "N/A");
        details.children[6].textContent = "lazys = " + (lazys ? (lazys.size + " " + [...new Set(lazys.values())]) : "N/A");
      }
    }
  }

  /**
   * Creates the loading div with the animated infinity icon, initially set to display:none and re-appended after each
   * new page has been added.
   *
   * Note: This function is only called one time when the instance is started for the very first time.
   *
   * @private
   */
  function createLoading() {
    console.log("createLoading() - scrollLoading=" + instance.scrollLoading);
    if (loading && typeof loading.remove === "function") {
      loading.remove();
    }
    if (instance.scrollLoading) {
      loading = document.createElement("div");
      loading.id = "infy-scroll-loading";
      loading.style = processStyle("all: initial; display: none; position: fixed; bottom: 0; right: 0; padding: 8px; z-index: 2147483647;");
      const icon = createIcon("infinity", { animated: true });
      loading.appendChild(icon);
      document?.body?.appendChild(loading);
    }
  }

  /**
   * Creates and appends an iframe. (Waits for the iframe to load.)
   *
   * @param {string} src - the iframe's url
   * @param {string} style - the iframe's style
   * @param {string} mode - the iframe append mode type ("full", "import", "trim")
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function createIframe(src, style, mode, caller) {
    console.log("createIframe() - mode=" + mode + ", caller=" + caller);
    // Step 1 Create
    iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.style = processStyle(style);
    iframe.scrolling = "no";
    iframe.frameBorder = "0";
    // iframe.sandbox = "allow-same-origin allow-scripts allow-forms";
    // Step 2 Append
    // if (instance.append === "element" && (mode === "trim" || mode === "import")) {
    //   appendDivider();
    //   appendLoading();
    // }
    if (mode === "trim") {
      // The insertion point may have been "moved" by the website and no longer have a parentNode, so we re-calculate it to be the last element
      if (!insertionPoint || !insertionPoint.parentNode || insertionPoint.ownerDocument !== document) {
        console.log("createIframe() - the insertion point's hierarchy in the DOM was altered. " + (insertionPoint ? ("parentNode=" + insertionPoint.parentNode + ", ownerDocument === document=" + (insertionPoint.ownerDocument === document)) : "insertionPoint is undefined!"));
        insertionPoint = Elementify.getInsertionPoint(Elementify.getPageElements(document), false);
      }
      DOMNode.insertBefore(iframe, insertionPoint);
    } else if (mode === "import") {
      (document.documentElement || document.body).appendChild(iframe);
    } else {
      // "full"
      document.body.appendChild(iframe);
    }
    try {
      await Iframe.loadIframe(iframe);
    } catch (e) {
      // If error (promise rejected), there won't be an iframe.contentDocument, so we don't need to handle it here
      console.log("createIframe() - error loading iframe, Error:");
      console.log(e);
    }
    console.log("createIframe() - iframe loaded");
    // Step 3 contentDocument
    // If the iframe's document doesn't exist, we can't continue
    if (!iframe.contentDocument) {
      console.log("createIframe() - error, no iframe.contentDocument!");
      // TODO: We need to reset the instance's URL back to the previous URL so Next.findLink() doesn't return a duplicate URL when we try again. We should refactor the code so that the instance URL is only set after the page has been successfully appended...
      if (pages && pages.length > 0 && pages[pages.length - 1]) {
        instance.url = pages[pages.length - 1].url;
      }
      const anchor = document.createElement("a");
      anchor.href = "https://github.com/sixcious/xframey";
      anchor.target = "_blank";
      anchor.innerText = "Xframey";
      appendMessage(chrome.i18n.getMessage("oops_error") + " " + chrome.i18n.getMessage("iframes_not_supported_error"), anchor);
      // Return undefined so the divider gets removed (the iframe technically exists)
      appendFinally("iframe", undefined, caller);
      // TODO: Should we reset isLoading and keep trying? Valid use case is list and some URLs being from another origin
      // instance.isLoading = false;
      return;
    }
    console.log("createIframe() -` iframe.contentDocument.readyState=" + iframe.contentDocument.readyState);
    // Note that in the Element Iframe modes, we will later clone the iframe.contentDocument and set it to currentDocument after we're sure the page elements/next link have been loaded
    iframeDocument = iframe.contentDocument;
    currentDocument = iframe.contentDocument.cloneNode(true);
    // Step 4 Debug
    if (instance.debugEnabled) {
      iframe.style.setProperty("visibility", "visible", "important");
    }
    // Step 5 Mirror Iframe (Last Step)
    if (caller === "prepareFirstPage" && instance.mirrorPage && instance.action === "click" && instance.append === "ajax") {
      console.log("createIframe() - mirroring the top-level document to this iframe");
      // @see https://stackoverflow.com/a/11627589/988713
      // We need to mirror the current page the user is viewing
      switch (instance.mirrorPage) {
        case "adopt":
          // Adopting is rather complicated. First, we adopt the nodes into the iframe from the page
          iframeDocument.documentElement.replaceChild(iframeDocument.adoptNode(document.head), iframeDocument.head);
          iframeDocument.documentElement.replaceChild(iframeDocument.adoptNode(document.body), iframeDocument.body);
          // Second, we recreate the page's two compartments
          DOMNode.insertBefore(document.createElement("head"), iframe);
          DOMNode.insertBefore(document.createElement("body"), iframe);
          // Finally, we clone the iframe's transferred nodes and import them back to the page
          document.documentElement.replaceChild(document.importNode(iframeDocument.head, true), document.head);
          document.documentElement.replaceChild(document.importNode(iframeDocument.body, true), document.body);
          break;
        // case "import":
        default:
          iframeDocument.replaceChild(iframeDocument.importNode(document.documentElement, true), iframeDocument.documentElement);
          break;
      }
      // Some breathing space after all the mirroring (not necessary?)
      await Promisify.sleep(1000);
    }
  }

  // TODO: This was meant to be a helper function for setting individual style properties but decided not to use it for now
  // /**
  //  *
  //  * @param element
  //  * @param name
  //  * @param value
  //  * @param priority
  //  * @see https://developer.mozilla.org/docs/Web/API/CSSStyleDeclaration/setProperty
  //  */
  // function processIndividualStyle(element, name, value, priority) {
  //   // element.style.setProperty("display", "block", "important");
  //   element.style.setProperty(name, value, priority);
  // }

  /**
   * Process a semicolon delimited style string with !important added for each style.
   *
   * @param {string} style - the style to process
   * @returns {string} the processed style with !important
   * @private
   */
  function processStyle(style) {
    return style.replaceAll(";", " !important;");
  }

  /**
   * Checks to see if the databases need to be updated; if so, updates the databases.
   *
   * This function resides in the content script instead of the background's startup listener because that only fires
   * when Chrome starts, and users tend to keep their browser open for days or weeks before restarting.
   *
   * @param {Object} items - the storage items to parse to determine whether the database should be updated or not
   * @private
   */
  async function updateDatabases(items) {
    console.log("updateDatabase()");
    try {
      // This checks to see if the database needs to be updated (if the update was more than X number of days ago).
      // Note: 1 Day = 86400000 ms
      if ((items.databaseAPEnabled || items.databaseISEnabled) && items.databaseUpdate >= 1 && (!items.databaseDate || ((new Date() - new Date(items.databaseDate)) >= (86400000 * items.databaseUpdate)))) {
        console.log("updateDatabase() - updating database because databaseDate=" + items.databaseDate + " and databaseUpdate=" + items.databaseUpdate);
        const response = await Promisify.runtimeSendMessage({receiver: "background", greeting: "downloadDatabase", downloadAP: items.databaseAPEnabled, downloadIS: items.databaseISEnabled, downloadLocation: items.databaseLocation});
        console.log("updateDatabase() - download response=" + JSON.stringify(response));
      }
    } catch (e) {
      console.log("updateDatabase() - Error:");
      console.log(e);
    }
  }

  /**
   * This function is this content script's entry point. It runs on every page request and determines if the
   * extension should start itself or not on this tab. It initializes the storage items and instance on the page.
   *
   * Note: This function only runs one time.
   *
   * @private
   */
  async function init() {
    console.log("init()");
    const tab = { id: 0, url: window.location.href };
    items = await Promisify.storageGet(undefined, undefined, []);
    // Note that this is the best time we can update the databases (not in the background). Do not await this; try and start as fast as possible
    updateDatabases(items);
    // const startTime = performance.now();
    instance = await Instance.buildInstance(tab, items);
    items = instance.items;
    // Delete the items cache in the instance (we need to do this now in case the user enters the Popup early and tries to copy their debug data)
    delete instance.items;
    // If the instance's source is still items, check a few more times in case dynamic content hasn't finished loading
    if (instance.via === "items" || instance.via === "placeholder") {
      // Here is where we may be waiting quite some time (e.g. 5 seconds)
      const temp = await Instance.buildInstance(tab, items, 1);
      // The instance may have been set by the user in the time it took to await the previous statement; only set it if it hasn't been enabled
      console.log("init() - temp.via=" + temp.via + ", enabled=" + instance.enabled + ", pickerEnabled=" + instance.pickerEnabled + ", pickerSet=" + instance.pickerSet);
      if (temp.via !== "items" && !instance.enabled && !instance.pickerEnabled && !instance.pickerSet) {
        console.log("init() - setting instance to temp, temp=");
        console.log(temp);
        instance = temp;
      }
    }
    // const endTime = performance.now();
    // console.log("Call to do test took " + (endTime - startTime) + " milliseconds");
    console.log("init() - after filtering, saves.length=" + items.saves.length + ", databaseIS.length=" + items.databaseIS.length + ", databaseAP.length=" + items.databaseAP.length);
    console.log("init() - saves=\n" + (items.saves.map(x => x.url).join("\n")));
    console.log("init() - databaseIS=\n" + (items.databaseIS.map(x => x.url).join("\n")));
    console.log("init() - databaseAP=\n" + (items.databaseAP.map(x => x.url).join("\n")));
    // Delete the items cache in the instance
    delete instance.items;
    // Note: We do not want to delete the database or saves from the items cache to streamline checking them again later if this is an SPA
    console.log("init() - instance=");
    console.log(instance);
    if (instance.enabled) {
      await start("init");
    }
    // If this is an SPA, watch this page.
    // Note: We don't want to enable this on every website. For example, simply entering text in https://regex101.com/ keeps firing mutation changes
    if (instance.spa && items.on && (instance.databaseFound ? items.databaseMode === "blacklist" ? !instance.databaseBlacklisted : instance.databaseWhitelisted : true)) {
      console.log("init() - watching SPA");
      spaObserver = new MutationObserver(spaObserverCallback);
      spaObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  /**
   * This function is only called when the extension wants to "start" running on this page.
   * This will create some of Infy Scroll's one-time only elements (like the overlay and loading) for the very first time and actually add the scroll detection.
   *
   * Note: This function typically only runs one time. The difference between it and init() is that init() runs on each
   * page request, whereas start() only runs when the extension should be "started" (enabled) for the very first time
   * or restarted again (e.g. if after a stop() or if the user clicks the ACCEPT button in the Popup).
   *
   * Note: This function is public for Action.power(), Action.blacklist(), and Action.whitelist().
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  async function start(caller) {
    console.log("start() - caller=" + caller);
    // TODO: Is the enabled needed because we might start via shortcuts? The Popup normally sets this to true after clicking Accept
    instance.enabled = true;
    // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this instance (don't need to await this, so let's set the badge early)
    Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true}).then((tabId) => { instance.tabId = tabId; });
    if (!instance.started) {
      console.log("start() - was not started, so setting instance.started=true and doing initialization work...");
      instance.started = true;
      scrollListener = Util.throttle(scrollDetection, typeof items.scrollDetectionThrottle === "number" && items.scrollDetectionThrottle >= 200 && items.scrollDetectionThrottle <= 1000 ? items.scrollDetectionThrottle : 200);
      // If caller is command and via is items, this was a down action while not enabled, or it was a re-start if it was previously enabled already (somehow?)
      if (caller === "command" && instance.via === "items") {
        // We need to initialize it with the default action and append (next page) if we didn't find a save or database URL
        instance.action = "next";
        instance.append = "page";
        // We need to determine whether keywords should be enabled or not. We only enable keywords if the path failed on page 1 for a Keyboard Shortcut Command
        const link = Next.findLink(instance.nextLinkPath, instance.nextLinkType, instance.nextLinkProperty, undefined, items.nextLinkKeywords, undefined, true, document, false);
        instance.nextLinkKeywordsEnabled = link.method === "keyword";
        instance.nextLinkKeyword = link.keywordObject;
      }
      // resetStyling();
      await prepareFirstPage("start");
      // We need to now trigger the AP CustomEvent that we have loaded. This is for external scripts that may be listening for them
      triggerCustomEvent(EVENT_ON, document, {});
    }
    if (!items.on) {
      console.log("start() - was not on, so setting items.on=true");
      items.on = true;
      Promisify.storageSet({"on": true});
      // chrome.storage.local.set({"on": true});
    }
    // Note: We ned to call appendBottom() before addScrollDetection() so the bottomObserver can observe the bottom
    createOverlay();
    createLoading();
    appendBottom();
    addScrollDetection();
    // The AJAX Observer is only added if we are in native mode and removing or hiding elements
    if (instance.append === "ajax" &&  instance.ajaxMode === "native" && (instance.removeElementPath || instance.hideElementPath)) {
      ajaxObserver = new MutationObserver(ajaxObserverCallback);
      // TODO: Should we switch back to subtree: false? Need true for p int
      // ajaxObserver.observe(insertionPoint?.parentNode || document.body, { childList: true, subtree: false });
      ajaxObserver.observe(document.body, { childList: true, subtree: true });
    }
    // Note that we will always make isLoading=false every time start is called, resetting any weird states (e.g. to add Auto in the Popup after being enabled, isLoading might be previously true)
    delay("start");
  }

  /**
   * This function is called when the extension wants to "stop" running on this page. This code handles all non-instance
   * specific stopping logic, such as removing the scrollDetection and hiding the overlay and loading elements.
   *
   * This will put the instance in a disabled or stopped state in case the user decides to turn the extension back on
   * before refreshing the page. The instance will not be deleted, but pages will not be appended while it is stopped.
   *
   * The stop action can be initiated directly from a power (off) action for this tab, or if the Background sends a
   * message to a tab's content script (after receiving a power "off" notification from another tab).
   *
   * Note: This function is public for Action.power(), Action.blacklist(), and Action.whitelist().
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  function stop(caller) {
    console.log("stop() - caller=" + caller);
    removeScrollDetection();
    // Disconnect MutationObservers
    if (ajaxObserver) {
      ajaxObserver.disconnect();
      ajaxObserver = undefined;
    }
    if (spaObserver && caller !== "spaObserverCallback") {
      spaObserver.disconnect();
      spaObserver = undefined;
    }
    if (overlay && typeof overlay.remove === "function") {
      overlay.remove();
    }
    if (loading && typeof loading.remove === "function") {
      loading.remove();
    }
    if (bottom && typeof bottom.remove === "function") {
      bottom.remove();
    }
    // Instance Business Logic: This was...?
    if (instance.autoEnabled) {
      Auto.stopAutoTimer(instance, "stop");
    }
    // For callers like popup that still need the instance, disable all states and reset auto, multi, and urls array
    instance.enabled = instance.multiEnabled = instance.autoEnabled = instance.autoPaused = instance.autoSlideshow = instance.shuffleURLs = false;
    // instance.started will always remain true, do not reset it to false in the case the user re-enables the extension on this page
    instance.autoTimes = instance.autoTimesOriginal;
    instance.multi = {"1": {}, "2": {}, "3": {}};
    instance.multiCount = instance.autoRepeatCount = 0;
    instance.urls = [];
    // Scroll Instance Cleanup ... TODO: Why was this current page assignment needed?
    // instance.currentPage = instance.totalPages;
    // We must get the updated on/off state on this page's storage items cache
    // items.on = await Promisify.storageGet("on");
    Promisify.storageGet("on").then(on => {
      items.on = on;
    });
    // chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "off", temporary: true}, function (response) { if (chrome.runtime.lastError) {} });
    Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "off", temporary: true});
  }

  /**
   * This function is called everytime an extension shortcut (command) is initiated.
   * This works very similarly to how Popup.clickActionButton() works with a few special cases (the if statement).
   * For example, the down action can start the instance.
   *
   * @param {string} action - the shortcut command
   * @param {string} caller - the caller who called this function
   * @private
   */
  async function command(action, caller) {
    // Down action while not enabled allows it to start using default settings or re-start if it was previously enabled already (this is already handled in start())
    if (action === "down" && !instance.enabled) {
      await start(caller);
    } else if (((action === "down" || action === "up") && instance.enabled) ||
                (action === "auto" && instance.autoEnabled) ||
                (action === "blacklist" && instance.databaseFound && !instance.autoEnabled) ||
                (action === "power")) {
      // Update Scroll's local items cache on state to false while this window is still open. The storage items will be updated in performAction so we don't have to do it here
      if (action === "power") {
        items.on = !items.on;
        // TODO: Should we set instance.enabled to false here?
      }
      // If this is a blacklist action, we need to toggle it to whitelist if the user has auto activate set to false
      if (action === "blacklist" && items.databaseMode !== "blacklist") {
        action = "whitelist";
      }
      Workflow.execute(action, caller);
    }
  }

  /**
   * Listen for requests from chrome.tabs.sendMessage (Extension Environment: Background / Popup)
   * Note: Every request should be responded to via sendResponse. Otherwise we introduce an unnecessary delay in waiting
   * for the response.
   *
   * @param {Object} request - the request containing properties to parse (e.g. greeting message)
   * @param {Object} sender - the sender who sent this message, with an identifying tab
   * @param {function} sendResponse - the optional callback function (e.g. for a reply back to the sender)
   * @private
   */
  async function messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=");
    console.log(request);
    let response = {};
    switch (request.greeting) {
      case "getInstance":
        response = instance;
        break;
      case "setInstance":
        // Note: This setInstance message is only called from the Popup (Accept Button)
        // Store the current page before setting the instance
        const currentPage = instance.currentPage;
        // Clone to be safe?
        instance = Util.clone(request.instance);
        // Popup sometimes has out of date values for the current page and total pages
        instance.currentPage = currentPage;
        instance.totalPages = pages.length || 1;
        // Recalculate the offset in case the append mode changed
        calculateOffset();
        break;
      case "start":
        // Note: This start message is only called from the Popup (Accept Button)
        await start(request.caller);
        break;
      case "stop":
        stop(request.caller);
        break;
      case "executeWorkflow":
        Workflow.execute(request.action, request.caller, request.extra);
        break;
      case "checkSave":
        response = Saves.matchesSave(request.url, request.save);
        break;
      case "checkNextPrev":
        response = Next.findLinkWithProperties(request.path, request.type, request.property, request.keywordsEnabled, request.keywords, request.keywordObject, true, [currentDocument, iframe?.contentDocument], pages, instance.url, request.highlight);
        break;
      case "checkButton":
        response = Click.findButton(request.buttonPath, request.buttonType, instance.documentType === "iframe" ? iframe?.contentDocument : document, request.highlight).details;
        break;
      case "checkPageElement":
        // Note: If we are using auto detect, we always use the live document; otherwise use the current (latest) document to reflect the most accurate results
        const pageElements_ = Elementify.getPageElements(request.autoDetected || instance.documentType === "top" ? document : instance.documentType === "iframe" ? iframe?.contentDocument : currentDocument, request.pageElementType, request.pageElementPath, true);
        const insertionPoint_ = Elementify.getInsertionPoint(pageElements_[0], true, request.pageElementType, request.insertBeforePath, true);
        const parent = insertionPoint_[0] ? insertionPoint_[0].parentNode : undefined;
        response = { found: (pageElements_[0].length > 0 && !!insertionPoint_[0] && !!parent), elementsLength: pageElements_[0].length, error: pageElements_[1].error, insertDetails: insertionPoint_[1], parentNode: parent ? parent.nodeName : ""};
        if (request.highlight && typeof HoverBox !== "undefined") {
          new HoverBox().highlightElement(parent, true);
        }
        break;
      case "autoDetectPageElement":
        // Do not use our storage items cache of path properties as it may be out of date compared to the Popup's
        const autoDetectResult = AutoDetectPageElement.detect(items.preferredPathType, request.algorithm, request.quote, request.optimized);
        response = autoDetectResult.path;
        if (request.highlight && typeof HoverBox !== "undefined") {
          new HoverBox().highlightElement(autoDetectResult.el, true);
        }
        break;
      case "determinePathType":
        // Note: We always check the preferred path type on the first attempt, so we don't use request.type
        response = DOMPath.determinePathType(request.path, items.preferredPathType).type;
        break;
      case "findLinks":
        response = List.findLinks();
        break;
      case "openPicker":
        Picker.openPicker();
        break;
      case "closePicker":
        Picker.closePicker();
        break;
      case "initPicker":
        Picker.initPicker(request.algorithm, request.quote, request.optimized, request.js, request.property, request.size, request.corner);
        break;
      case "changePicker":
        Picker.changePicker(request.change, request.value);
        break;
      case "savePicker":
        Picker.savePicker();
        break;
      case "copyPicker":
        Picker.copyPicker();
        break;
      case "resizePicker":
        Picker.resizePicker(request.size);
        break;
      case "movePicker":
        Picker.movePicker(request.corner);
        break;
      case "startAutoTimer":
        // Only called by the Popup when Auto is toggled on
        Auto.startAutoTimer(instance, request.caller);
        break;
      case "stopAutoTimer":
        // Only called by the Popup when Auto is toggled off
        Auto.stopAutoTimer(instance, request.caller);
        break;
      case "incrementValidateSelection":
        response = Increment.validateSelection(request.instance.selection, request.instance.base, request.instance.baseCase, request.instance.baseDateFormat, request.instance.baseRoman, request.instance.baseCustom, request.instance.leadingZeros);
        break;
      case "incrementPrecalculateURLs":
        response = IncrementArray.precalculateURLs(request.instance);
        break;
      case "addSave":
        response = await Saves.addSave(request.instance);
        break;
      case "deleteSave":
        // Not doing response = because the saves array might be really big
        await Saves.deleteSave(request.id, request.url, request.writeToStorage);
        break;
      case "command":
        command(request.action, request.caller);
        break;
      default:
        break;
    }
    sendResponse(response);
  }

  // Scroll Listeners
  // Message Listener: We need to return immediately if the function will be performing asynchronous work
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "contentscript") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });

  // The Navigation API can help detect SPAs: Currently only supported in Chrome 102+ (not currently supported in Firefox!)
  // We add a timeout just in case this is fired very early to let init() build the instance first
  // @see https://developer.chrome.com/docs/web-platform/navigation-api/
  // @see https://developer.mozilla.org/docs/Web/API/Navigation_API
  // @see https://developer.mozilla.org/docs/Web/API/Navigation
  // @see https://stackoverflow.com/questions/75313690/is-there-chrome-api-event-listener-that-fires-when-modern-web-apps-update-their
  setTimeout(() => { try { if (typeof navigation !== "undefined" && typeof navigation?.addEventListener === "function") { navigation.addEventListener("navigate", navigateEvent => { spaObserverCallback([], {}, "navigate"); }); } } catch (e) { } }, 1000);

  // Initialize Scroll
  // Note: Previously we had timing issues with some websites, but due to the new multiple checks for activation, we no
  // longer need to force an initial timeout due to dynamic content. Also, we have a separate timeout for calculating
  // the offset, so there is no real reason to delay initialization
  setTimeout(() => { init(); }, 0);

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    get,
    set,
    debug,
    prepareIframe,
    prepend,
    append,
    delay,
    start,
    stop
  };

})();