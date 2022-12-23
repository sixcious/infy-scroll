/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Scroll is the main content script of the extension and handles all infinite scrolling logic.
 *
 * This includes the following three main purposes:
 * 1. Scroll Detection - This can either be implemented via a Scroll Listener or Intersection Observer
 * 2. Appending of Pages - Supports 4 modes: Page, Iframe, Element, and Media
 * 3. Getting the Next Document - Via the Fetch API (Or falls back to XHR)
 *
 * Workflow:
 * 1. Scroll - As the user scrolls, shouldAppend() is called. If true, it calls Action.performAction()
 * 2. Action - Performs the action, and if the action was performed successfully, calls Scroll.append()
 * 3. Scroll - Appends the next page, does finalization work in appendFinally() and repeats from step 1
 *
 * Note that the instance is primarily stored in this object. Therefore, if the Action or other area of the extension
 * needs access to it, a getter is provided.
 *
 * Important note about the storage items:
 * We only update the items when the extension's on/off state has changed in Scroll.stop() (which is called by Action).
 * We will not update the storage items for other settings that change after the page loads (e.g. if the user
 * tried changing the Scroll Detection API from Scroll Listener to Intersection Observer in Options and then expects it
 * to automatically change here, as that is unrealistic to handle).
 *
 * We also do not update the storage items if the user tries turning the extension back on because we do not ever
 * send a message to all other tabs to "turn on." The user is expected to click on the toolbar icon or to refresh
 * the page due to the complexity involved in handling multiple on/off state changes.
 *
 * Important: Whenever we want to apply a style to an element, we must always either use the processStyles() function
 * here or the Element.style.setProperty() function in order to make the styles be "important"
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/setProperty
 *
 * TODO: Consider moving all the Append code into its own file (e.g. append.js)
 * TODO: Rename _ variables like document_ and document__ to better names
 * TODO: Move scrollbarExists and scrollbarAppends outside of instance and into variable here (we only use them here)
 * TODO: Make PAGE_STYLE, IFRAME_STYLE, etc. non constants so we can call processStyle on them in init once?
 * TODO: Should we replace: 1) document.body calls with (document.body || document.documentElement) 2) removeChild with remove 3) :scope with body in selectors?
 * TODO: Change insertionPoint.ownerDocument !== document to !document.contains(insertionPoint)
 */
const Scroll = (() => {

  /**
   * Variables
   * @param EVENT_AJAX           the custom event name for when interacting with the injected ajax script
   * @param EVENT_ON             the custom event name for when the extension turns itself on
   * @param EVENT_PAGE_APPENDED  the custom event name for when a page is appended
   * @param EVENT_NODE_APPENDED  the custom event name for when a node is appended
   * @param DIVIDER_CLASS        the class name to set the divider with
   * @param PAGE_STYLE           the css that is used for Append Page
   * @param IFRAME_STYLE         the css that is used for Append Iframe
   * @param MEDIA_STYLE          the css that is used for Append Media
   * @param COLOR                the css color that is used for various styles, like the infinity icon and page divider
   * @param BUTTON_APPEND_DELAY  the extra append delay for Click Button action (in ms) to prevent the button from being clicked again
   * @param instance             the instance object that contains all the properties for this page (such as the URL, action, and append mode)
   * @param items                the storage items cache containing the user's options
   * @param pages                the pages array that contains a reference to each appended page in the DOM
   * @param document_            the cloned full document for the current (latest) page that is being observed; we need a reference to the newly appended page's document
   * @param document__           the live modified document for the current (latest) page that is being observed; we need a reference to the newly appended page's document
   * @param insertionPoint       the insertion point is only used in append element mode and is the point at the bottom of the content to start inserting more elements
   * @param pageElements         the current page's array of page elements (in append element mode)
   * @param allElements          the array of all pages' page elements to keep track of in Append AJAX mode
   * @param button_              the current button used for the Click Button action
   * @param iframe_              the iframe that was appended for the current page for the Element Iframe (Import) mode
   * @param lazys                the lazy image/media elements that we obtain in fixLazyLoadingPre() and that we then need to later handle in fixLazyLoadingPost() after they are appended
   * @param offset               the offset is the pixels from the bottom of the content (e.g. elements or buttonPosition) to the very bottom of the HTML document
   * @param loading              the loading element that is appended while a new page is being loaded
   * @param divider              the last page divider element that was appended; we store this in order to not have to re-calculate the colSpan again for future dividers in Append Element mode (tables)
   * @param overlay              (optional) the overlay element that is fixed onto the page, showing the current page number and total pages
   * @param timeouts             the reusable timeouts object that stores all named timeouts used on this page
   * @param scrollListener       the scroll listener callback function that fires every time the user scrolls. It calls the reusable scrollDetection function. Note this is written as a variable instead of a function due to the tricky way event listeners work
   * @param intersectionObserver the intersection observer object that observes elements in Intersection Observer mode (not the callback function)
   * @param ajaxObserver         the mutation observer object that observes the mutations in the AJAX Append mode
   * @param spaObserver          the mutation observer object that observes the mutations if this is an SPA that changes its page content dynamically
   */
  const EVENT_AJAX = "InfyScrollAJAX";
  const EVENT_ON = "GM_AutoPagerizeLoaded";
  const EVENT_PAGE_APPENDED = "GM_AutoPagerizeNextPageLoaded";
  const EVENT_NODE_APPENDED = "AutoPagerize_DOMNodeInserted";
  // Fixes #22 https://github.com/sixcious/infy-scroll/issues/22 - Some external extensions (e.g. Ublacklist) require us to add this specific AP className in order to recognize DOM mutations whenever Infy appends another page on Google Search
  const DIVIDER_CLASS = "autopagerize_page_info";
  // Note: Do not set min-height: 0, this causes issues, always initial (auto) or leave it out TODO: Decide on how to set z-index for these three styles. They are position: static (initial) and have z-index: auto. We need the overlay, 2 loading, and message to have the z-index be higher than these so we can't use z-index: 2147483647. Is it better to NOT have a z-index applied to them?
  const PAGE_STYLE =   "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: auto; margin: 0 0 2rem 0; max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0;                   padding: 0; position: static; visibility: visible; width: auto; z-index: auto;";
  const IFRAME_STYLE = "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: 0;    margin: 0 0 2rem 0; max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0; overflow: hidden; padding: 0; position: static; visibility: visible; width: 100%; z-index: auto;";
  const MEDIA_STYLE =  "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: flex;  float: none; height: auto; margin: 2rem auto;  max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0;                   padding: 0; position: static; visibility: visible; width: auto; z-index: auto;";
  const COLOR = "#55555F";
  const BUTTON_APPEND_DELAY = 1000;
  // We should initialize the instance to an empty object to avoid potential NPEs because we sometimes use it as a default value for some method arguments e.g. (x = instance.x, ...)
  let instance = {};
  let items;
  let pages = [];
  let document_ = document;
  let document__;
  let insertionPoint;
  let pageElements;
  // let allElements;
  let button_;
  let iframe_;
  let lazys;
  let offset = 0;
  let loading;
  let divider;
  let overlay;
  // let scrollbar = { exists: false, appends: 0 };
  let timeouts = {};
  let scrollListener;
  let intersectionObserver;
  let ajaxObserver;
  let spaObserver;
  // let href = typeof window === "object" && window.location && window.location.href ? window.location.href : "";
  // let mutationThrottle = Util.throttle(mutationObserverCallback, 10000);

  /**
   * Gets the declared variables. This can be used by other parts of the app or for debugging purposes.
   *
   * @returns {*} the variables
   * @public
   */
  function get() {
    return {
      instance, items, pages, document_, document__, insertionPoint, pageElements, button_, iframe_, lazys, offset,
      loading, divider, overlay, timeouts, scrollListener, intersectionObserver, ajaxObserver, spaObserver
    };
  }

  /**
   * Gets the instance.
   *
   * @returns {*} instance the instance
   * @public
   */
  function getInstance() {
    return instance;
  }

  /**
   * Sets the instance.
   *
   * @param instance_ the instance to set
   * @public
   */
  function setInstance(instance_) {
    instance = instance_;
  }

  /**
   * Gets the pages.
   *
   * @returns {*} pages the pages
   * @public
   */
  function getPages() {
    return pages;
  }

  /**
   * Sets the pages.
   *
   * @param pages_ the pages to set
   * @public
   */
  function setPages(pages_) {
    pages = pages_;
  }

  /**
   * Adds the scroll detection (either Scroll Listener or Intersection Observer).
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
   * @private
   */
  function addScrollDetection() {
    removeScrollDetection();
    console.log("addScrollDetection() - adding " + items.scrollDetection);
    // Can't use Intersection Observer when scroll action is button because we are not observing the button element
    // TODO: Add IO support for button by observing the button element?
    // if (items.scrollDetection === "io" || instance.action === "button") {
    if (items.scrollDetection === "io" && instance.action !== "button") {
      // Observer rootMargin '0px 0px -99%' will only trigger when the top of the next page has been intersected. Use 0% or 1% to intersect the earliest (when any part of the next page is on the screen)
      intersectionObserver = new IntersectionObserver(intersectionObserverCallback, { root: null, rootMargin: '0px 0px 1%', threshold: 0});
      // Need this for loop to 1) observe the first page due to prepareFirstPage() being called before the intersectionObserver is made, and 2) when re-enabling an instance after a stop
      for (const page of pages) {
        intersectionObserver.observe(page.element);
      }
    } else {
      // Scroll Listener passive should already be the default on scroll events
      window.addEventListener("scroll", scrollListener, { passive: true });
    }
    // AJAX MutationObserver
    if (instance.append === "ajax" && instance.removeElementPath) {
      ajaxObserver = new MutationObserver(ajaxObserverCallback);
      ajaxObserver.observe(insertionPoint && insertionPoint.parentNode ? insertionPoint.parentNode : document.body, { childList: true, subtree: false });
    }
  }

  /**
   * Removes the scroll detection (either Scroll Listener or Intersection Observer).
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
   * @private
   */
  function removeScrollDetection() {
    console.log("removeScrollDetection() - removing " + items.scrollDetection);
    // if ((items.scrollDetection === "io" || instance.action === "button") && intersectionObserver) {'
    if (items.scrollDetection === "io" && instance.action !== "button" && intersectionObserver) {
      intersectionObserver.disconnect();
      // We set to undefined because we check if the intersectionObserver exists to determine which mode we are in shouldAppend()
      intersectionObserver = undefined;
    } else {
      window.removeEventListener("scroll", scrollListener);
    }
    // AJAX MutationObserver
    if (ajaxObserver) {
      ajaxObserver.disconnect();
      ajaxObserver = undefined;
    }
  }

  /**
   * The callback function for the Intersection Observer. Observes all page entries when they intersect (are visible) in
   * the root (document body). Whenever a new entry is intersecting, we call the reusable scrollDetection function to
   * perform the work.
   *
   * @param entries the page entries being observed
   * @private
   */
  function intersectionObserverCallback(entries) {
    // TODO: Investigate if reversing the entries so that the last pages are iterated first is better for efficiency?
    // entries.reverse();
    for (const entry of entries) {
      // TODO: Consider using intersectionRatio (experimental)? https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserverEntry/intersectionRatio
      if (entry.isIntersecting) {
        console.log("intersectionObserverCallback() - an entry is intersecting: " + (entry.target ? entry.target.id : entry.target));
        // TODO: Is this setTimeout not needed anymore?
        // This timeout is an unfortunate compromise to avoid the intersectionObserver from firing scrollDetection() at the same time as append() to avoid a double performAction
        // setTimeout(() => { scrollDetection(entry); }, items.scrollDetectionThrottle);
        scrollDetection(entry);
        break;
      }
    }
  }

  /**
   * The callback function for the AJAX Mutation Observer. Observes when a mutation to the sub tree (such as when a node
   * has been added or removed) and reacts accordingly. This function is currently only needed for the AJAX append mode.
   *
   * @param mutations the list of mutations
   * @private
   */
  function ajaxObserverCallback(mutations) {
    console.log("ajaxObserverCallback() - mutations.length=" + mutations.length);
    for (const mutation of mutations) {
      console.log("mutation, type=" + mutation.type + " mutation.addedNodes=" + mutation.addedNodes.length);
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        // const node = mutation.target;
        // // allElements.add(node);
        // // [...node.getElementsByTagName("*")].concat(node).forEach(n => {
        // //   // sanitize(n);
        // // });
        let elements = [];
        if (instance.pageElementType === "selector") {
          const result = document.querySelectorAll(instance.removeElementPath);
          elements = Array.from(result);
        } else {
          const result = document.evaluate(instance.removeElementPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          if (result && result.snapshotLength > 0) {
            for (let i = 0; i < result.snapshotLength; i++) {
              elements.push(result.snapshotItem(i));
            }
          }
        }
        for (const element of elements) {
          element.remove();
        }
        break;
      }
    }
  }

  // Step 3: AJAX Removals
  // const removeElementPath = detail.removeElement;
  // const removeTimeout = detail.removeTimeout ? parseInt(detail.removeTimeout) : 0;
  // if (removeElement) {
  //   setTimeout(() => {
  //     let elements = [];
  //     if (type === "selector") {
  //       const result = document.querySelectorAll(removeElement);
  //       elements = Array.from(result);
  //     } else if (type === "xpath") {
  //       const result = document.evaluate(removeElement, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  //       if (result && result.snapshotLength > 0) {
  //         for (let i = 0; i < result.snapshotLength; i++) {
  //           elements.push(result.snapshotItem(i));
  //         }
  //       }
  //     }
  //     for (const element of elements) {
  //       element.remove();
  //     }
  //     //li[@class="sc-l7cibp-2 gpVAva"][.//div[@class="sc-rp5asc-0 fxGVAF"]]
  //     //a[.//td[@value="val"]]
  //     //"li.sc-l7cibp-2.gpVAva > div.sc-rp5asc-0.fxGVAF"
  //     // Make this in XPath so we can support parent selectors
  //     // document.querySelectorAll(removeElement).forEach(element => {
  //     //   element.parentElement.remove();
  //     // });
  //   }, removeTimeout);
  // }

  /**
   * The callback function for the SPA Mutation Observer. Observes when a mutation to the sub tree (such as when a node
   * has been added or removed) and reacts accordingly. This function is currently only needed for the AJAX append mode.
   *
   * @param mutations the list of mutations
   * @private
   */
  function spaObserverCallback(mutations) {
    console.log("spaObserverCallback() - mutations.length=" + mutations.length);
    clearTimeout(timeouts.spaCheck);
    timeouts.spaCheck = setTimeout(async () => {
      let check = true;
      if (instance.enabled) {
        check = false;
        for (const page of pages) {
          if (!document.contains(page.element)) {
            console.log("spaObserverCallback() - stopping!");
            check = true;
            await stop();
            break;
          }
        }
      }
      if (check) {
        const tab = { id: 0, url: window.location.href };
        // Note that the potential SPA database and saves are still in our storage items cache and we don't have to get the full storage items again
        // items = await Promisify.storageGet(undefined, undefined, []);
        instance = await Instance.buildInstance(tab, items);
        delete instance.items;
        if (instance.enabled) {
          console.log("spaObserverCallback() - starting!");
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
            // if (page.pageElements && page.pageElements.length > 0) {
            //   for (const pageElement of page.pageElements) {
            //     console.log("spaObserver() - removing pageElements");
            //     pageElement.remove();
            //   }
            // }
          }
          pages = [];
          document_ = document;
          document__ = document;
          start();
        }
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
   * @param entry (optional) if using Intersection Observer API, the entry (page) we are currently intersecting
   * @private
   */
  function scrollDetection(entry) {
    detectCurrentPage(entry ? entry.target : undefined);
    if (shouldAppend()) {
      instance.isLoading = true;
      Action.performAction(instance.action, "scrollDetection", instance, items, document_, document__);
    }
  }

  /**
   * Determines if a vertical scrollbar is present on the screen. The extension will only check a maximum of 10 times.
   *
   * Note: This check is only performed when in Intersection Observer mode. This is due to the Scroll Listener's pixels
   * check implicitly already checking this.
   *
   * @returns {boolean} true if a vertical scrollbar exists, false otherwise
   * @see https://stackoverflow.com/questions/1145850/how-to-get-height-of-entire-document-with-javascript
   * @private
   */
  function scrollbarExists() {
    let exists = true;
    let documentHeight = -1;
    if (!instance.scrollbarExists && instance.scrollbarAppends < 10) {
      documentHeight = getTotalHeight(document);
      // A scrollbar exists if the document's height is bigger than the window's height. TODO: Test this more e.g. > vs >=
      exists = documentHeight > window.innerHeight;
      // If a scrollbar exists, we will stop checking. Otherwise, we increment the appends value so we only append a max of 10 pages due to lack of scrollbar
      if (exists) {
        instance.scrollbarExists = true;
      } else {
        instance.scrollbarAppends++;
      }
    }
    console.log("scrollbarExists() - scrollbarExists=" + instance.scrollbarExists + ", scrollbarAppends=" + instance.scrollbarAppends + ", window.innerHeight=" + window.innerHeight + ", documentHeight=" + documentHeight);
    return exists;
  }

  /**
   * Determines if the user has scrolled near the bottom of the document by a certain number of pages.
   *
   * Note: This function is only called when the scroll detection mode is Intersection Observer.
   *
   * Examples (based on the instance.scrollAppendThresholdPages):
   * 1. If the threshold pages value is 1, this checks if the user scrolled within 1 page of the last page of the document (i.e. the next-to-last page).
   * 2. If the threshold pages value is 0, this essentially checks if the user has scrolled to the last page of the document.
   *
   * @returns {boolean} true if scrolled near the bottom of the document by the pages metric, false otherwise
   * @private
   */
  function scrolledNearBottomPages() {
    console.log("scrolledNearBottomPages() - currentPage=" + instance.currentPage + ", totalPages=" + instance.totalPages + ", thresholdPages=" + instance.scrollAppendThresholdPages + ", scrolled=" + ((instance.totalPages - instance.currentPage) <= instance.scrollAppendThresholdPages));
    return ((instance.totalPages - instance.currentPage) <= instance.scrollAppendThresholdPages);
  }

  /**
   * Determines if the user has scrolled near the bottom of the content by a certain number of pixels. The "content" is
   * either the entire HTML Document (in Page, Iframe, or Media modes) or the elements (in Element mode).
   * For example, if the threshold pixels value is 1000px, this checks if the user scrolled within 1000px of the bottom
   * of the content.
   *
   * Note: This function is only called when the scroll detection mode is Scroll Listener.
   *
   * @returns {boolean} true if scrolled near the bottom of the content by the pixels metric, false otherwise
   * @private
   */
  function scrolledNearBottomPixels() {
    // This is the absolute bottom position (the total document's height)
    const bottom = getTotalHeight(document);
    // This is the actual bottom we care about. In all modes except Append Element mode, it's the same as the bottom. But in Append Element mode, we need to subtract the offset from the bottom. The offset is the space from the insertion point (the bottom of the elements) to the very bottom of the document. The offset is 0 in all other modes
    const contentBottom = bottom - offset;
    // This is the current position of the scrollbar. The scroll position can also be calculated to just be window.scrollY without the window.innerHeight and this would be the TOP position of the grayed portion of the scrollbar instead of its BOTTOM position
    const scrollPosition = window.scrollY + window.innerHeight;
    // This is the amount of pixels left until reaching the bottom. Because JavaScript gives us precise subpixel values (e.g. decimal numbers like 1200.5) we will floor the value. This is useful when scrolling to the bottom of the document and ensuring a 0.5 is treated as 0
    const pixelsLeft = Math.floor(contentBottom - scrollPosition);
    // The user has scrolled near the bottom if the pixels left is less than or equal to the threshold (e.g. 1000 pixels)
    const scrolledNearBottom = pixelsLeft <= instance.scrollAppendThresholdPixels;
    console.log("scrolledNearBottomPixels() - contentBottom=" + contentBottom + ", bottom=" + bottom + ", offset=" + offset + ", scrollPosition=" + scrollPosition + ", pixelsLeft=" + pixelsLeft + ", thresholdPixels=" + instance.scrollAppendThresholdPixels + ", scrolledNearBottom=" + scrolledNearBottom);
    return scrolledNearBottom;
  }

  /**
   * Determines if the extension should append another page. This only happens when the following conditions are met:
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
   * @param element the page element intersected (only if called by the intersection observer)
   * @private
   */
  function detectCurrentPage(element) {
    for (const page of pages) {
      // Two Cases: If using Intersection Observer, check if element === page.element, else if Scroll Listener check isScrolledIntoView()
      if (page && page.element && (element ? element === page.element : isScrolledIntoView(page.element))) {
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
        break;
      }
    }
  }

  /**
   * Determines if the element (e.g. page) has been scrolled into the current viewport.
   * Note: This function is only called in Scroll Listener mode.
   *
   * @param element the element (e.g. page)
   * @returns {boolean} true if the element has been scrolled into view, false otherwise
   * @private
   */
  function isScrolledIntoView(element) {
    let isInView = false;
    const rect = element.getBoundingClientRect();
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
   * Appends a new page using one of the append modes.
   *
   * @param caller string indicating who called this function (e.g. command, popup, content script)
   * @public
   */
  function append(caller) {
    console.log("append() - caller=" + caller + ", instance.url=" + instance.url + ", pages.length=" + (pages.length + 1));
    // Element Iframe should redirect to iframe; all other append modes remain the same
    const append = instance.append === "element" && instance.pageElementIframe ? "iframe" : instance.append;
    switch (append) {
      case "page":    appendDivider(); appendPage(caller);    appendLoading(); break;
      case "iframe":  appendDivider(); appendIframe(caller);  appendLoading(); break;
      case "element": appendDivider(); appendElement(caller); appendLoading(); break;
      case "media":   appendDivider(); appendMedia(caller);   appendLoading(); break;
      case "none":                     appendNone(caller);                     break;
      case "ajax":    appendDivider(); appendAjax(caller);                     break;
      default:                                                                 break;
    }
  }

  /**
   * Appends the next page's HTML as is to the original document's body.
   * Images and HTML may break in this mode, but it is the fastest append mode.
   *
   * @param caller who called this function
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
    // nextDocument.body.querySelectorAll(":scope > *").forEach(element => fragment.appendChild(element));
    nextDocument.body.querySelectorAll(":scope > *").forEach(element => fragment.appendChild(document.adoptNode(element)));
    page.appendChild(fragment);
    resizeMedia("page", page);
    triggerCustomEvent(EVENT_NODE_APPENDED, page, { url: instance.url });
    appendFinally("page", page, caller);
    // TODO: Don't wrap the page in a div anymore. Use the code below and use getNodesByTreeWalker() to pick an element to be the observable page element
    // const nextDocument = await getNextDocument();
    // const fragment = document.createDocumentFragment();
    // const elements = [...nextDocument.body.querySelectorAll(":scope > *")];
    // const welements = items.resizeMediaEnabled ? getNodesByTreeWalker(nextDocument.body, NodeFilter.SHOW_ELEMENT) : [];
    // elements.forEach(element => fragment.appendChild(element));
    // document.body.appendChild(fragment);
    // let observableElement = getObservable(elements);
    // if (!observableElement) {
    //   observableElement = document.createElement("span");
    //   document.body.insertBefore(observableElement, elements[0]);
    //   // elements.unshift(observableElement);
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
   * @param caller who called this function
   * @private
   */
  function appendIframe(caller) {
    console.log("appendIframe() - caller=" + caller);
    const iframe = document.createElement("iframe");
    iframe.src = instance.url;
    iframe.style = processStyle(IFRAME_STYLE);
    iframe.scrolling = "no";
    iframe.frameBorder = "0";
    // TODO: Make a final decision on sandboxing
    // sandbox iframe to avoid "For security reasons, framing is not allowed; click OK to remove the frames."
    // @see https://meta.stackexchange.com/questions/155720/i-busted-the-stack-overflow-frame-buster-buster-buster
    // @see https://stackoverflow.com/a/9163087
    // iframe.sandbox = "allow-same-origin allow-scripts allow-forms";
    // Element Iframe (Trim):
    const iframeMode = instance.append === "element" && instance.pageElementIframe ? instance.pageElementIframe === "trim" ? "trim" : "import" : "";
    if (iframeMode === "trim") {
      // The insertion point may have been "moved" by the website and no longer have a parentNode, so we re-calculate it to be the last element
      if (!insertionPoint || !insertionPoint.parentNode || insertionPoint.ownerDocument !== document) {
        console.log("appendIframe() - the insertion point's hierarchy in the DOM was altered. " + (insertionPoint ? ("parentNode=" + insertionPoint.parentNode + ", ownerDocument === document=" + (insertionPoint.ownerDocument === document)) : "insertionPoint is undefined!"));
        insertionPoint = getInsertionPoint(getPageElements(document), false);
      }
      // TODO: This null check is bothersome. Should the application simply fail at this point and display an error message?
      if (insertionPoint && insertionPoint.parentNode) {
        insertionPoint.parentNode.insertBefore(iframe, insertionPoint);
      }
    }
    // Iframe and Element Iframe (Import):
    else {
      document.body.appendChild(iframe);
    }
    iframe.onload = async function () {
      // If the iframe's contentDocument (the document) doesn't exist, we can't continue
      if (!iframe.contentDocument) {
        console.log("appendIframe() - iframe.onload() - no iframe.contentDocument!");
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
      console.log("appendIframe() - the iframe loaded, iframe.contentDocument.readyState=" + iframe.contentDocument.readyState);
      // Note that in the Element Iframe modes, we will later clone the iframe.contentDocument and set it to document_ after we're sure the page elements/next link have been loaded
      document_ = iframe.contentDocument;
      const iframeDocument = iframe.contentDocument;
      const html = iframeDocument.documentElement;
      const body = iframeDocument.body;
      // Element Iframe (Trim) requires filtering elements
      if (iframeMode === "trim") {
        // TODO: pageElementIframeWait is a hidden variable not exposed to the user, but can bet set in a save or database URL. Remove this in the future when we're sure we don't need it
        await Promisify.sleep(instance.pageElementIframeWait);
        // Make sure the next link is in the iframeDocument before we clone it, waiting for the next link is a must!
        [pageElements] = await Promise.all([getPageElementsFromIframe(iframeDocument), instance.action === "next" || instance.action === "prev" ? getNextLinkFromIframe(iframeDocument) : 1]);
        // We store a clone of the iframe document after we have successfully retrieved the page elements and next link
        document_ = iframeDocument.cloneNode(true);
        // We need to cache both the pageElements (already done above) and the scripts/styles before we remove everything from the iframeDocument
        const scriptsAndStyles = iframeDocument.body.querySelectorAll("script, style");
        // Remove all elements from the iframeDocument so that we can then re-add just what we need
        iframeDocument.body.querySelectorAll(":scope > *").forEach(element => { iframeDocument.body.removeChild(element); });
        const fragment = document.createDocumentFragment();
        // TODO: Test resizeMedia() more in this mode before we calculate the welements (commented out code)
        // const welements = items.resizeMediaEnabled && nextDocument && nextDocument.body ? getNodesByTreeWalker(nextDocument.body, NodeFilter.SHOW_ELEMENT) : [];
        // Add the scripts and styles and elements back to the iframe, note that we shouldn't have to use Document.adoptNode() here
        scriptsAndStyles.forEach(element => fragment.appendChild(element));
        pageElements.forEach(element => fragment.appendChild(element));
        iframeDocument.body.appendChild(fragment);
        // TODO: Should we trigger Custom Event for the individual elements appended in iframe mode? Not sure if they're even accessible to the root
        // Cache a copy of the iframe document in the rare case that the next link doesn't appear in the cloned document_ but is in the live document on the page
        document__ = iframeDocument;
      }
      // Element Iframe (Import) is super simple and just reuses the same appendElement code we've been using
      else if (iframeMode === "import") {
        // TODO: Note that we already set the height to 0px in the initial IFRAME_STYLE. Is this display: none style necessary?
        iframe.style.setProperty("display", "none", "important");
        document__ = iframeDocument;
        // function importIframe(by) {
        //   console.log("importIframe() - by=" + by + ", checkIframeCount=" + timeouts.checkIframeCount);
        //   // if (by === "initial" && timeouts.checkIframeCount > 0) {
        //   //   return;
        //   // }
        //   document_ = iframe.contentDocument.cloneNode(true);
        //   setLinksNewTab([iframe.contentDocument]);
        //   appendElement(caller);
        //   // if (iframeMutationObserver) {
        //   //   iframeMutationObserver.disconnect();
        //   //   iframeMutationObserver = undefined;
        //   // }
        // }
        // iframeMutationObserver Method (Bailing on this approach as it isn't reliable):
        // timeouts.checkIframeCount = 0;
        // let iframeMutationObserver = new MutationObserver(function(mutations) {
        //   console.log("iframeMutationObserverCallback() - mutations.length=" + mutations.length);
        //   if (timeouts.checkIframeCount < 5) {
        //     clearTimeout(timeouts.checkIframe);
        //   }
        //   timeouts.checkIframe = setTimeout(() => { importIframe("iframeMutationObserver"); }, 500);
        //   timeouts.checkIframeCount++;
        // });
        // await Promisify.sleep(instance.pageElementIframeWait);
        // const iframePageElements = getPageElements(iframeDocument);
        // console.log("appendIframe() - iframeMutationObserver is observing " + (iframePageElements && iframePageElements[0] && iframePageElements[0].parentNode ? "parentNode" : "body"));
        // iframeMutationObserver.observe(iframePageElements && iframePageElements[0] && iframePageElements[0].parentNode ? iframePageElements[0].parentNode : body, { childList: true, subtree: true });
        // // Initial
        // clearTimeout(timeouts.checkIframe);
        // timeouts.checkIframe = setTimeout(() => { importIframe("initial"); }, 1000);
        // Standard Method:
        // TODO: pageElementIframeWait is a hidden variable not exposed to the user, but can bet set in a save or database URL. Remove this in the future when we're sure we don't need it
        await Promisify.sleep(instance.pageElementIframeWait);
        // importIframe();
        document_ = iframe.contentDocument.cloneNode(true);
        setLinksNewTab([iframe.contentDocument]);
        appendElement(caller);
        return;
      }
      // Regular Iframe append mode: add a small delay before processing it in case of dynamic content
      else {
        await Promisify.sleep(500);
      }
      resizeMedia("iframe", body);
      // Only fix lazy loading in iframe mode if the user explicitly wants this and is using manual
      // TODO: Is it safe to even do this in Auto as well?
      // @see https://favpng.com/png_search/pokemon/ for an example of a website that needs both iframe and lazy loading
      if (instance.lazyLoad === "manual") {
        fixLazyLoadingPre(iframeDocument);
      }
      executeCustomScripts(iframeDocument, false);
      // Some websites dynamic content anchors haven't yet loaded; this is a bit hacky as we are using setTimeout()...
      // for (let timeoutCheck = 0; timeoutCheck <= 4000; timeoutCheck += 1000) {
      //   setTimeout(() => { setLinksNewTab([iframeDocument]); }, timeoutCheck);
      // }
      setLinksNewTab([iframeDocument]);
      // Calculate the height only after resizing the media elements
      iframe.style.setProperty("height", getTotalHeight(iframeDocument) + "px", "important");
      html.style.setProperty("overflow", "hidden", "important");
      body.style.setProperty("overflow", "hidden", "important");
      // If prepareFirstPage (iframePageOne=true), we need to remove all the elements from the document body except for this iframe and the overlay and loading divs
      if (caller === "prepareFirstPage") {
        document.body.querySelectorAll(":scope > *").forEach(element => { if (element !== iframe && element !== overlay && element !== loading) { document.body.removeChild(element); } });
      }
      triggerCustomEvent(EVENT_NODE_APPENDED, iframe, { url: instance.url });
      appendFinally("iframe", iframe, caller);
    };
    // TODO: Show an error message on the page that infy can't use this mode. Also, error appendFinally needs different handling, don't do the first part
    // iframe.onerror = function () {
    //   console.log("iframe.onerror() - Iframe Error!");
    //   // instance.isLoading = false;
    //   appendMessage(chrome.i18n.getMessage("oops_error") + " " + chrome.i18n.getMessage("iframes_not_supported_error"));
    //   // Return undefined so the divider gets removed (the iframe technically exists)
    //   appendFinally("iframe", iframe, caller);
    // };
    // Store the current iframe to be added later to the pages for reference
    iframe_ = iframe;
  }

  /**
   * Appends specific elements for seamless scrolling. A page element (Selector or XPath) must be entered to
   * determine which elements to append.
   *
   * @param caller who called this function
   * @private
   */
  async function appendElement(caller) {
    console.log("appendElement() - caller=" + caller);
    // If we are in Element Iframe (Import) mode, we need to use the iframe obtained in appendIframe()
    const nextDocument = instance.pageElementIframe ? document__ : await getNextDocument();
    if (!nextDocument) { return; }
    const fragment = document.createDocumentFragment();
    if (instance.pageElementIframe) {
      // To be safe, we'll await both promises and wait for the next link as well as the page elements even though it's not necessary
      // pageElements = await getPageElementsFromIframe(nextDocument);
      [pageElements] = await Promise.all([getPageElementsFromIframe(nextDocument), instance.action === "next" || instance.action === "prev" ? getNextLinkFromIframe(nextDocument) : 1]);
      // TODO: See if we can refactor this so we can place this consistently in all append modes. This is normally done in getNextDocument(), but in Element Iframe mode we aren't sure if the elements have loaded till now
      setLinksNewTab(pageElements);
    } else {
      pageElements = getPageElements(nextDocument);
    }
    // TODO: Test resizeMedia() more in this mode before we calculate the welements (commented out code)
    // const welements = items.resizeMediaEnabled && nextDocument && nextDocument.body ? getNodesByTreeWalker(nextDocument.body, NodeFilter.SHOW_ELEMENT) : [];
    // There are 3 ways to transfer the node from the nextDocument/iframeDocument to this document: importNode, adoptNode, and a standard appendChild
    // importNode doesn't work with some websites (p), so we should only use either the standard appendChild or adoptNode
    // pageElements.forEach(element => fragment.appendChild(document.importNode(element, true)));
    pageElements.forEach(element => fragment.appendChild(document.adoptNode(element)));
    // pageElements.forEach(element => fragment.appendChild(element));
    // The insertion point may have been "moved" by the website and no longer have a parentNode, so we re-calculate it to be the last element
    if (!insertionPoint || !insertionPoint.parentNode || insertionPoint.ownerDocument !== document) {
      console.log("appendElement() - the insertion point's hierarchy in the DOM was altered. " + (insertionPoint ? ("parentNode=" + insertionPoint.parentNode + ", ownerDocument === document=" + (insertionPoint.ownerDocument === document)) : "insertionPoint is undefined!"));
      insertionPoint = getInsertionPoint(getPageElements(document), false);
    }
    // TODO: This null check is bothersome. Should the application simply fail at this point and display an error message?
    if (insertionPoint && insertionPoint.parentNode) {
      insertionPoint.parentNode.insertBefore(fragment, insertionPoint);
    }
    // We need to now trigger the AP CustomEvent for each of the newly appended nodes from the fragment. This is for external scripts that may be listening for them
    pageElements.forEach(element => triggerCustomEvent(EVENT_NODE_APPENDED, element, { url: instance.url, parentNode: insertionPoint.parentNode }));
    // Calculate the observable element now after the elements are appended (inserted before) so their heights are now accessible
    let observableElement = getObservableElement(pageElements);
    if (!observableElement) {
      console.log("appendElement() - no page element found, manually creating a span");
      observableElement = document.createElement("span");
      insertionPoint.parentNode.insertBefore(observableElement, insertionPoint);
      pageElements.unshift(observableElement);
    }
    // We must calculate the insert element now before this function is called again and we get the next document
    insertionPoint = getInsertionPoint(pageElements, false);
    // resizeMedia("element", undefined, welements);
    appendFinally("element", observableElement, caller);
  }

  /**
   * Appends a media element directly -- namely images, like 001.jpg. This mode can only be used with actions that allow
   * for sequential URLs such as the Increment URL and URL List Actions. Care must be taken into consideration when
   * dealing with specific browsers who style the images differently. For example, Firefox adds a position: fixed to the
   * image.
   *
   * Example URL: https://www.example.com/001.jpg
   *
   * @param caller who called this function
   * @private
   */
  function appendMedia(caller) {
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
    appendFinally("media", media, caller);
  }

  /**
   * This mode does not append anything. This is for actions that do not append anything (like clicking buttons).
   * The action executes (e.g. clicking a "Load More" button) and it is expected that the website itself appends any
   * additional content.
   *
   * @param caller who called this function
   * @private
   */
  function appendNone(caller) {
    console.log("appendNone()");
    button_ = Button.findButton(instance.buttonType, instance.buttonPath).button;
    appendFinally("none", button_, caller);
  }

  /**
   * The AJAX append mode is an advanced version of the Element append mode and uses an injection script to message
   * pass with the page script.
   *
   * @param caller who called this function
   * @private
   */
  async function appendAjax(caller) {
    console.log("appendAjax()");
    pageElements = getPageElements(document);
    // allElements = new Set(...allElements, ...elements);
    // const allElementsSize = allElements.size;
    // elements.forEach(element => allElements.add(element));
    // if (allElementsSize === elements.length) {
    //   console.log("appendAjax() - allElementsSize === elements.length, retrying ...");
    //   setTimeout(() => { appendAjax(caller); }, 1000);
    //   return;
    // }
    // console.log("allElementsSize=" + allElementsSize);
    // console.log("elements.length=" + elements.length);
    // console.log("allElements.size=" + allElements.size);
    // elements.forEach(element => fragment.appendChild(element));
    // The insertion point may have been "moved" by the website and no longer have a parentNode, so we re-calculate it to be the last element
    if (!insertionPoint || !insertionPoint.parentNode || insertionPoint.ownerDocument !== document) {
      console.log("appendAjax() - the insertion point's hierarchy in the DOM was altered. " + (insertionPoint ? ("parentNode=" + insertionPoint.parentNode + ", ownerDocument === document=" + (insertionPoint.ownerDocument === document)) : "insertionPoint is undefined!"));
      insertionPoint = getInsertionPoint(getPageElements(document), false);
    }
    let observableElement = getObservableElement(pageElements);
    if (!observableElement) {
      console.log("appendAjax() - no observable element found, manually creating a span");
      observableElement = document.createElement("span");
      insertionPoint.parentNode.insertBefore(observableElement, insertionPoint);
      pageElements.unshift(observableElement);
    }
    // We must calculate the insert element now before this function is called again and we get the next document
    insertionPoint = getInsertionPoint(pageElements, false);
    triggerCustomEvent(EVENT_AJAX, document, {
      "disableRemoveElementPath": instance.disableRemoveElementPath || DOMPath.generatePath(insertionPoint.parentNode, instance.pageElementType),
      "disableRemoveFunctions": instance.disableRemoveFunctions || "remove,removeChild",
      "pathType": instance.pageElementType
    }, true);
    for (let timeoutCheck = 0; timeoutCheck <= 4000; timeoutCheck += 2000) {
      // TODO: Unfortunately, this doesn't work because we actually don't have the elements yet
      // setTimeout(() => { setLinksNewTab(elements); }, timeoutCheck);
      setTimeout(() => { setLinksNewTab([insertionPoint.parentNode]); }, timeoutCheck);
    }
    appendFinally("ajax", observableElement, caller);
  }

  /**
   * Performs all the finalization work for all append modes after the next page has been appended.
   *
   * @param mode              the append mode, e.g. "page", "iframe", and so on
   * @param observableElement the observable element to be stored in the pages array
   * @param caller            who called this function
   * @private
   */
  function appendFinally(mode, observableElement, caller) {
    console.log("appendFinally() - mode=" + mode + ", observableElement=" + observableElement + ", caller=" + caller);
    // Always hide the loading icon no matter what
    if (items.scrollLoading) {
      if (loading) {
        // loading.style.setProperty("display", "none", "important");
        setTimeout(() => { loading?.style?.setProperty("display", "none", "important"); }, instance.append === "media" ? 500 : 0);
      }
      // We replace the currently animated infinity icon with a static icon
      if (divider) {
        divider.querySelector("svg.infy-scroll-divider-infinity-icon")?.replaceWith(createIcon("infinity"));
      }
    }
    // If no el (e.g. we couldn't find the next page), we need to revert back. For append none, just ignore this if the button is null?
    if (!observableElement && mode !== "none") {
      console.log("appendFinally() - no el, so removing last divider");
      if (divider && typeof divider.remove === "function") {
        divider.remove();
      }
      // TODO: Should we stop at this point?
      // instance.isLoading = false;
      // Action.performAction("stop", "appendFinally", instance, items, document_, document__);
      return;
    }
    // Fix Lazy Loading Post
    fixLazyLoadingPost();
    // Append Scripts or Styles (Optional)
    // We must re-create a new script/style object and append them. We can append to document.head or document.body, and they will execute just the same, but appending to head for now to be safe
    // try {
    //   if ((instance.append === "page" || instance.append === "element") && caller !== "prepareFirstPage") {
    //     if (instance.scrollAppendScripts) {
    //       console.log("appendFinally() - appending this page's scripts");
    //       document_.querySelectorAll("script").forEach(script => { const script2 = document.createElement("script"); script2.textContent = script.textContent; (document.head || document.body || document.documentElement).appendChild(script2);} );
    //     }
    //     if (instance.scrollAppendStyles) {
    //       console.log("appendFinally() - appending this page's styles");
    //       document_.querySelectorAll("style").forEach(style => { const style2 = document.createElement("style"); style2.textContent = style.textContent; (document.head || document.body || document.documentElement).appendChild(style2);} );
    //     }
    //   }
    // } catch (e) {
    //   console.log("appendFinally() - error appending scripts for this page");
    // }
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
    // Push new page into array and scroll into view if caller dictates this
    // Each page's element is the part of the page we are observing. Make sure to check that the divider was appended into the document (Bing Search, for example, removes it if it isn't a li)
    // We'll still also store the element in another property called "el" just in case we need it and we are using the divider as the page.element
    const page = {"number": pages.length + 1, "divider": divider, "url": instance.url, "title": document_.title, "element": divider && divider.scrollIntoView && document && document.contains(divider) ? divider : observableElement && observableElement.scrollIntoView ? observableElement : undefined, "el": observableElement, "append": instance.append, "mode": instance.pageElementIframe};
    // Store a reference to the current iframe and pageElements for this page in case we need to remove them
    if (iframe_) {
      page.iframe = iframe_;
      iframe_ = undefined;
    }
    if (pageElements) {
      page.pageElements = pageElements;
    }
    // We need to reset the divider to know which loading style to use (hybrid or fixed) for the next page in case the user changes the append mode, e.g. going from element (divider) to page (no divider)
    divider = undefined;
    // TODO: Investigate pages.unshift() so that newer pages are first for better performance?
    pages.push(page);
    instance.totalPages = pages.length;
    if (intersectionObserver) {
      intersectionObserver.observe(page.element);
    }
    // Scroll into view only if shortcut commands, popup, script, or auto slideshow
    if (page && page.element && (caller === "command" || caller === "popupClickActionButton" || caller === "scrollClickActionButton" || (caller === "auto" && instance.autoSlideshow))) {
      page.element.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
      // TODO: This isn't working for iframes for some reason. Need to try a different approach
      // // We use the setTimeout primarily for iframes because if we don't, we never end up scrolling to them because their onload event still needs some extra time for them to appear on the screen
      // setTimeout(() => {
      //   page.element.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
      // }, instance.append === "iframe" || (instance.append === "element" && instance.pageElementIframe) ? 100 : 0);
    }
    if (caller === "popupClickActionButton") {
      // Need to set current page in case scrolling is smooth (finishes after sending instance to popup)
      instance.currentPage = pages.length;
      chrome.runtime.sendMessage({receiver: "popup", greeting: "updatePopupInstance", instance: instance}, function (response) { if (chrome.runtime.lastError) {} });
    }
    // TODO: Trigger this event for all append modes?
    // We need to now trigger the AP CustomEvent that the next page has fully loaded. This is for external scripts that may be listening for them
    // Note: This is after all the nodes have been appended; we don't provide an event for the current document_, always just the root document
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
    // Small timeout to set isLoading flag to false and perform finalization work
    // Delay the append by a small time frame to avoid making too many requests (if caller is not auto)
    setTimeout(()=> {
      console.log("appendFinally() - timeout ended, ready to append the next page");
      instance.isLoading = false;
      // Don't call the autoListener in prepareFirstPage because Popup will have already called startAutoTimer()
      if (instance.autoEnabled && caller !== "prepareFirstPage") {
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
        // if (!scrollbarExists()) {
        // if (!scrollbarExists() || (caller !== "prepareFirstPage" && shouldAppend())) {
        // if (!scrollbarExists() || shouldAppend()) {
        if (shouldAppend()) {
          instance.isLoading = true;
          Action.performAction(instance.action, "append", instance, items, document_, document__);
        }
      }
    }, (caller === "auto" ? 100 : items.scrollAppendDelay) + (instance.action === "button" ? BUTTON_APPEND_DELAY : 0));
  }

  /**
   * Gets the next page's document. This function uses the fetch api to make the request, and falls back to XHR if there's
   * an error. It's called by the Append Page and Append Element modes. This function also creates a clone of the document
   * to be used to find the next link.
   *
   * Important: We do not use fetch's standard response.text() here because text() assumes the encoding is UTF-8.
   * Some websites may have different encoding, like SHIFT_JIS for Japanese, so we use response.arrayBuffer() and
   * manually try to use the original document's charset encoding to decode the response text for all subsequent
   * documents.
   *
   * TODO: Don't create a clone of the next document and somehow just have one "unedited" document while returning the original document. This is going to be hard to achieve.
   *
   * @returns {Promise<Document>} the response document in the original encoding
   * @see https://stackoverflow.com/questions/45512102/can-fetch-do-responsetype-document
   * @see https://stackoverflow.com/a/46784830
   * @private
   */
  async function getNextDocument() {
    console.log("getNextDocument() - documentContentType=" + instance.documentContentType + ", documentCharacterSet=" + instance.documentCharacterSet);
    let nextDocument;
    try {
      if (instance.useXHR) {
        throw new Error("useXHR");
      }
      // Note: Do not check or trust response.ok or response.status === 404 and return assuming there's no next document. Some websites intentionally or mistakenly return bad error codes even though the site is live!
      const response = await fetch(instance.url, {method: "GET", credentials: "same-origin"});
      const arrayBuffer = await response.arrayBuffer();
      const dataView = new DataView(arrayBuffer);
      const decoder = new TextDecoder(instance.documentCharacterSet);
      const str = decoder.decode(dataView);
      nextDocument = new DOMParser().parseFromString(str, instance.documentContentType);
    } catch (e) {
      console.log("getNextDocument() - error fetching document, will now fallback to using xhr. Error:");
      console.log(e);
      instance.useXHR = true;
      try {
        // We don't want to make a second request too fast
        await Promisify.sleep(1000);
        nextDocument = await Promisify.xhr(instance.url);
      } catch (e) {
        console.log("getNextDocument() - error fetching document using xhr, giving up. Error:");
        console.log(e);
        appendMessage(chrome.i18n.getMessage("oops_error") + " " + chrome.i18n.getMessage("next_document_error") + " " + e);
        appendFinally(instance.append, undefined, "getNextDocument()");
        // TODO: Should we reset isLoading and keep trying?
        // instance.isLoading = false;
        return nextDocument;
      }
    }
    try {
      document_ = nextDocument.cloneNode(true);
      // Fix Lazy Loading (first), then Execute scripts (second) before modifying the nextDocument
      // Note: We do not have a way to give the user the nextDocument here (e.g. via a Custom Event) as it would be asynchronous to have to wait to get the document back from them
      fixLazyLoadingPre(nextDocument);
      executeCustomScripts(nextDocument, false);
      setLinksNewTab([nextDocument]);
      // Remove all scripts and styles so they aren't appended. We can append them later if needed with the cloned document
      // Note: We do not remove the noscript tags on Database URLs. For some reason they're needed on some Database URLs. See: https://girlydrop.com/letter/page/2
      // Note: We do not remove the style tags on Database URLs. For some reason they're needed on some Database URLs. See https://photodune.net/search?sort=sales#content
      // Not sure about the link tag...
      // TODO: In Manifest v3, we'll need to probably adjust this
      nextDocument.body.querySelectorAll("script" + (instance.append === "element" && instance.databaseFound ? "" : ", style, link, noscript")).forEach(element => { if (element && element.parentNode) { element.parentNode.removeChild(element); } });
      // // Store a reference to the live/original/potentially modified document that is going to be appended on the page in case we need it to find the next link
      // document__ = nextDocument;
    } catch (e) {
      console.log("getNextDocument() - error cloning document or removing scripts and styles. Error:");
      console.log(e);
    }
    return nextDocument;
  }

  /**
   * Executes custom scripts for specific URLs against the document.
   *
   * @param nextDocument the next document that was fetched
   * @param checkRootDocument whether to check the rootDocument boolean to determine if the script should be executed
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
   * @param nextDocument the next document that was fetched
   * @see https://developer.mozilla.org/en-US/docs/Web/Performance/Lazy_loading#images_and_iframes
   * @see https://rocketnews24.com/page/2/
   * @private
   */
  function fixLazyLoadingPre(nextDocument) {
    console.log("fixLazyLoadingPre() - lazyLoad=" + instance.lazyLoad);
    try {
      lazys = new Map();
      // data-src          Pretty much everything :)
      // data-original     fanfiction.net https://www.froma.com/tokyo/list/?st=01 https://www.fujisan.co.jp/zasshi_search/?dg=0&page=3&qk=NHK%E5%87%BA%E7%89%88&st=nd&t=s&tb=d https://skyrim.2game.info/next_view.php?cat=&q=&sort=update&flg=&detail=1&page=1 https://www.oricon.co.jp/special/ http://soso.nipic.com/?q=123&page=3
      // data-lazy-src     https://app.famitsu.com/category/news/page/3/ https://deadline.com/vcategory/the-contenders-emmys/page/3/
      // data-image-src    Appears to be used for background images (parallax scrolling). Also, Google Shopping uses it for secondary images https://www.google.com/search?q=
      // data-sco-src      https://youpouch.com/page/2/ https://rocketnews24.com/page/2/
      // data-cover        https://www.usgamer.net/tags/n/news/3
      // data-thumb_url    ...
      // data-ks-lazy-load Chinese websites (Taobao?)
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
            // style.background-image exception requires the url() css function see https://developer.mozilla.org/en-US/docs/Web/CSS/url()
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
        lazys.forEach((attribute, lazy) => {
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
        });
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
   * @param mode      the append mode
   * @param container the parent container element whose children should be resized
   * @param elements  the specific elements to resize
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
          if (!items.resizeMediaEnabled) {
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
          // const style = items.resizeMediaEnabled ? "object-fit: scale-down; max-width: 100%; max-height: 100vh; position: initial;" : "position: initial;";
          const style = processStyle(items.resizeMediaEnabled ? "object-fit: scale-down; max-width: 100%; max-height: 100vh; position: initial;" : "position: initial;");
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
   *
   * @param iframe the iframe
   * @private
   */
  async function resizeIframe(iframe) {
    console.log("resizeIframe()");
    try {
      if ((instance.append === "iframe" || (instance.append === "element" && instance.pageElementIframe === "trim")) && iframe && iframe.contentDocument) {
        // Inject the iFrameResize.contentWindow script into the iframe to allow message passing between the two objects
        const iframeDocument = iframe.contentDocument;
        const script = iframeDocument.createElement("script");
        // We have two ways to do this: 1) Make the script's textContent = to the text of our script or 2) set the src to the chrome location
        // const response = await fetch(chrome.runtime.getURL("/lib/iframe-resizer/iframeResizer.contentWindow.js"));
        // script.textContent = await response.text();
        script.src = chrome.runtime.getURL("/lib/iframe-resizer/iframeResizer.contentWindow.js");
        (iframeDocument.head || iframeDocument.body || iframeDocument.documentElement).appendChild(script);
        // TODO: Should we bother keeping a reference to the iframe in an array? We already store the iframe in the pages array
        // resizes.push(iFrameResize(undefined, iframe));
        iFrameResize(undefined, iframe)
        // TODO: Some websites are still not being resized properly by iFrameResize, should we reintroduce a manual height option? Example: https://engine.presearch.org
        // setTimeout(() => {
        //   iframe.style.setProperty("height", getTotalHeight(iframeDocument) + "px", "important");
        // }, 1000);
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
   * @param els the elements array or context node (either a document or parent node) that contains the links
   * @private
   */
  function setLinksNewTab(els = [document]) {
    console.log("setLinksNewTab() - items.linksNewTabEnabled=" + items.linksNewTabEnabled);
    try {
      if (items.linksNewTabEnabled) {
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
   * Before Infy can append pages, the first page (i.e. the existing page on the screen) should be prepared. This is so
   * we can store the initial page in the pages array and check when the user has scrolled it into view. The append mode
   * is used to determine how to prepare it. For example, in element mode, the insertion point needs to be defined.
   *
   * @private
   */
  function prepareFirstPage() {
    console.log("prepareFirstPage() - scrollPrepareFirstPageAttempts=" + instance.scrollPrepareFirstPageAttempts);
    // If iframe, set to iframe or page depending on what iframePageOne is. Otherwise, do whatever the append mode is
    const mode = instance.append === "iframe" ? instance.iframePageOne ? "iframe" : "page" : instance.append;
    let observableElement;
    switch (mode) {
      case "page":
        // We choose the first page's element by picking the first one with a height > 0 px. We first look at the body's first-level children and then fall-back to walking through every element in the body
        observableElement = getObservableElement([...document.body.querySelectorAll(":scope > *")]) || getObservableElement(getNodesByTreeWalker(document.body, NodeFilter.SHOW_ELEMENT));
        if (!observableElement) {
          observableElement = document.createElement("span");
          document.body.prepend(observableElement);
        }
        // We need to append a margin-bottom similar to the PAGE_STYLE and IFRAME_STYLE to give us some breathing room when detecting the current page
        const marginBottom = document.createElement("div");
        // marginBottom.style.marginBottom = "2rem";
        marginBottom.style.setProperty("margin-bottom", "2rem", "important");
        document.body.appendChild(marginBottom);
        resizeMedia("page", document.body);
        appendFinally("page", observableElement, "prepareFirstPage");
        break;
      case "iframe":
        // We are wrapping the first page in an iframe for maximum unbreakability!
        appendIframe("prepareFirstPage");
        break;
      case "element":
      case "ajax":
        pageElements = getPageElements(document);
        // allElements = new Set(elements);
        // Certain websites (p) sometimes load really slow, so we need to wait a few seconds and try prepareFirstPage again
        // This logic, in reality, only applies to Saved URLs as Database URLs won't be "found" if their elements are 0 initially in buildInstance()
        if (!pageElements || pageElements.length <= 0) {
          console.log("prepareFirstPage() - no elements, so retrying again using setTimeout...");
          if (instance.scrollPrepareFirstPageAttempts <= 5) {
            setTimeout(() => { instance.scrollPrepareFirstPageAttempts++; prepareFirstPage(); instance.isLoading = false; }, 1000 * (instance.scrollPrepareFirstPageAttempts));
          }
          return;
        }
        // In ajax mode, we need to store the elements in a variable outside this function for later use
        // if (instance.append === "ajax") {
        //   allElements = new Set(elements);
        // }
        insertionPoint = getInsertionPoint(pageElements, true);
        // if (items.debugEnabled && insertionPoint && insertionPoint.nodeType === Node.TEXT_NODE) {
        //  insertionPoint.textContent = "Infy Scroll (Debug Mode) Insertion Point";
        // }
        // TODO: Decide on how the parent is decided. Should it be the lastElement's parentNode or insert's parentNode? What if the insert element is NOT among the elements. Should we validate this?
        // The parent should prioritize being the insertionPoint's parentNode instead of the lastElement's parentNode. This is evident on some obscure insertBefore URLs
        // See: https://movie.walkerplus.com/list/2.html
        // parent_ = insertionPoint && insertionPoint.parentNode ? insertionPoint.parentNode : undefined;
        // lastElement && lastElement.parentNode ? lastElement.parentNode : undefined;
        observableElement = getObservableElement(pageElements);
        if (!observableElement && insertionPoint && insertionPoint.parentNode) {
          observableElement = document.createElement("span");
          // insertionPoint.parentNode.prepend(observableElement);
          // Put the page element right before the first element. The first element may not necessarily be the first child element of the parent, so we can't use insertionPoint.parentNode.prepend(observableElement)
          const firstElement = pageElements[0];
          firstElement.parentNode.insertBefore(observableElement, firstElement);
        }
        // // When calculating the offset, perhaps introducing a delay to "fully" wait for the page to load may be a good idea?
        // setTimeout(() => {
        //   // if (instance.append === "ajax") {
        //   //   button_ = Button.findButton(instance.buttonType, instance.buttonPath).button;
        //   //   calculateOffset(undefined, button);
        //   // } else {
        //   //   calculateOffset(elements);
        //   // }
        //   // We don't need to use the button position to calculate the offset even in ajax mode?
        //   calculateOffset(elements);
        // }, 1000);
        // resizeMedia("element", document.body);
        if (insertionPoint.parentElement && (instance.scrollDivider === "element" || instance.scrollDivider === "yes")) {
          // For websites where the insert parent is a grid, we need to know the number of columns in order to make the page divider break
          const style = window.getComputedStyle(insertionPoint.parentElement);
          if (style && style.display === "grid" && style.gridTemplateColumns && style.gridTemplateColumns !== "none") {
            instance.scrollDividerGrid = style.gridTemplateColumns.split(" ").length || 0;
          }
        }
        if (instance.append === "ajax") {
          const script = document.createElement("script");
          script.src = chrome.runtime.getURL("/js/ajax.js");
          script.onload = function () {
            console.log("prepareFirstPage() - ajax.js script loaded");
            setTimeout(() => {
              triggerCustomEvent(EVENT_AJAX, document, {
                // Test disableScrollObjects: window,document,document.documentElement,document.body
                "disableScrollObjects": instance.disableScrollObjects || "window",
                "disableScrollElementPath": instance.disableScrollElementPath || "",
                "disableScrollFunctions": instance.disableScrollFunctions || "onscroll,scroll,scrollBy,scrollIntoView,scrollIntoViewIfNeeded,scrollTo",
                "pathType": instance.pageElementType
              }, true);
            }, 1000);
            // Remove the script to keep the page clean, the listener will still be active when we trigger events to it later on
            this.remove();
          };
          (document.head || document.body || document.documentElement).appendChild(script);
        }
        // Note: We only set the links to open in a new tab on Page 1 for Append Element mode since they are not the entire page
        // Some websites dynamic content anchors haven't yet loaded; this is a bit hacky as we are using setTimeout()...
        for (let timeoutCheck = 0; timeoutCheck <= 4000; timeoutCheck += 2000) {
          setTimeout(() => { setLinksNewTab(pageElements); }, timeoutCheck);
        }
        appendFinally(mode, observableElement, "prepareFirstPage");
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
        button_ = Button.findButton(instance.buttonType, instance.buttonPath).button;
        appendFinally("none", button_, "prepareFirstPage");
        break;
    }
    // // When calculating the offset, perhaps introducing a delay to "fully" wait for the page to load may be a good idea?
    // setTimeout(() => {
    //   // We don't need to use the button position to calculate the offset even in ajax mode?
    //   calculateOffset(elements, button);
    // }, 1000);
  }

  /**
   * Appends the loading element while Infy is loading (fetching) the next page. There is only one loading element that
   * we created in the DOM, so we reuse it and simply "re-append" it to the bottom of the document.
   *
   * @private
   */
  function appendLoading() {
    console.log("appendLoading() - scrollLoading=" + items.scrollLoading);
    try {
      if (items.scrollLoading && (!items.scrollIcon || !divider)) {
      // if (items.scrollLoading) {
        loading?.style?.setProperty("display", "block", "important");
      }
    } catch (e) {
      console.log("appendLoading() - Error:");
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
    console.log("appendDivider() - instance.scrollDivider=" + instance.scrollDivider);
    try {
      if (instance.scrollDivider === "yes" || (instance.scrollDivider === "element" && (instance.append === "element" || instance.append === "ajax"))) {
        // The divider elements' style omits display intentionally because this is variable depending on tag and tag2
        // TODO: Add a default display to tag and tag2 when not div
        const align = items.scrollDividerAlign === "left" ? "left" : items.scrollDividerAlign === "right" ? "right" : "center";
        // TODO: Add "direction: ltr;" to style to take into account rtl languages like Arabic, which make the infinity icon come afer the Page #. A little worried this may screw things up on the other parts of the page
        const style = "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; float: none; height: auto; margin: 0 auto; position: static; text-align: " + align + "; visibility: visible; width: auto; z-index: auto; ";
        // Before we added the Page Divider Align Option, it was: const style = "visibility: visible; float: none; clear: both; text-align: center; margin: 0 auto; ";
        let tag = "div";
        let tag2 = "div";
        // The divider tag is dependant on what the element_ is (e.g. div, ul, table)
        if (insertionPoint && insertionPoint.parentNode && insertionPoint.parentNode.nodeName && (instance.append === "element" || instance.append === "ajax")) {
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
          // if (retry && (tag === "li" || tag === "div")) {
          //   tag = "p";
          // }
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
        divider.style = processStyle(style + (instance.scrollDividerGrid > 0 ? "grid-column-start: 1; grid-column-end: none; " : "") + (tag !== "tr" ? "border-top: 1px solid " + COLOR + "; padding: 4px 0 0 0; margin: 1rem auto; width: 100%;" + (tag === "div" ? " display: block;" : tag === "li" ? "list-style: none;" : "") : ""));
        const container = document.createElement(tag2);
        container.style = processStyle(style + (tag2 === "div" ? "display: block;" : ""));
        if (colSpan) {
          container.colSpan = colSpan;
        }
        const anchor = document.createElement("a");
        anchor.href = instance.url;
        // Also make the page divider follow the same behavior as page links based on the EXTRA option
        if (items.linksNewTabEnabled) {
          anchor.target = "_blank";
        }
        anchor.style = processStyle(style + "display: inline; text-decoration: none; color:" + COLOR + ";");
        if (items.scrollIcon) {
          const icon = createIcon("infinity", undefined, undefined, items.scrollLoading);
          // const icon = createIcon("infinity", undefined, undefined, false);
          icon.setAttribute("class", "infy-scroll-divider-infinity-icon");
          anchor.appendChild(icon);
        }
        const text = document.createElement("span");
        text.style = processStyle(style + "color:" + COLOR + "; display: inline; font-weight: bold; font-style: normal; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; line-height: initial; letter-spacing: initial; vertical-align: middle; user-select: none;");
        text.textContent = chrome.i18n.getMessage("page_label") + " " + (pages.length + 1);
        anchor.appendChild(text);
        // Need to cache the current pages length right now to be used later for the divider buttons' listeners
        const currentPagesLength = pages.length;
        if (items.scrollDividerButtons) {
          const icon = createIcon("circle-chevron-up");
          container.appendChild(icon);
          icon.addEventListener("click", () => { Action.performAction("up", "scrollClickActionButton", instance, items, document_, document__, currentPagesLength);});
        }
        container.appendChild(anchor);
        if (items.scrollDividerButtons) {
          const icon = createIcon("circle-chevron-down");
          container.appendChild(icon);
          icon.addEventListener("click", () => { Action.performAction("down", "scrollClickActionButton", instance, items, document_, document__, currentPagesLength + 2);});
        }
        divider.appendChild(container);
        // If the divider's parent element is a grid, we need to adjust it just once by subtracting one from it
        if (!instance.scrollDividerGridParentModified && instance.scrollDividerGrid > 0 && insertionPoint && insertionPoint.parentElement) {
          const array = window.getComputedStyle(insertionPoint.parentElement).gridTemplateColumns.split(" ");
          array.pop();
          if (array.length > 1) {
            insertionPoint.parentElement.style.setProperty("grid-template-columns", array.join(" "), "important");
          }
          instance.scrollDividerGridParentModified = true;
        }
        // Divider needs to be appended differently depending on the append mode. If element/ajax, use insertionPoint otherwise just append to the end of the document (page and iframe)
        if (instance.append === "element") {
          insertionPoint.parentNode.insertBefore(divider, insertionPoint);
        } else if (instance.append === "ajax") {
          insertionPoint.parentNode.appendChild(divider);
        } else {
          document.body.appendChild(divider);
        }
        // This strategy doesn't work with Bing unfortunately, returning true so the divider is in the document for a while...
        // console.log("appendDivider() - document.contains(divider)=" + document.contains(divider));
        // if (!document.contains(divider) && !retry) {
        //   console.log("appendDivider() - document doesn't contain divider, retrying...")
        //   appendDivider(true);
        // }
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
   * @param message the message to display
   * @param el      (optional) the element to append along with the message, e.g. an anchor
   * @private
   */
  function appendMessage(message, el) {
    console.log("appendMessage() - message=" + message);
    const div = document.createElement("div");
    div.id = "infy-scroll-message";
    div.style = processStyle("all: initial; position: fixed; bottom: 0; left: 0; padding: 8px; z-index: 2147483647; background: white;");
    if (items.scrollIcon) {
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
   * Gets the total height of the document in pixels. This is also known as the bottom position of the document.
   *
   * Normally, we would only care about the body clientHeight when calculating the document's height. However some
   * websites are coded strangely where their height may not be calculated based on just that, so we look at the max
   * from all six possible height values from both the html and body.
   *
   * @param doc the specific document whose height to calculate (iframes can have their own documents!)
   * @returns {number} the total height of the document in pixels
   * @private
   */
  function getTotalHeight(doc) {
    const html = doc.documentElement;
    const body = doc.body;
    console.log("getTotalHeight() - hch="  + html.clientHeight + ", hsh=" + html.scrollHeight + ", hoh=" + html.offsetHeight + ", bch=" + body.clientHeight + ", bsh=" + body.scrollHeight + ", boh=" + body.offsetHeight);
    return Math.max(html.clientHeight, html.scrollHeight, html.offsetHeight, body.clientHeight, body.scrollHeight, body.offsetHeight);
  }

  /**
   * Gets all nodes (includes both Element and Text Nodes) via the document.createTreeWalker() function.
   *
   * @param root       the root node to walk against (e.g. document.body)
   * @param whatToShow (optional) the filtered nodes to show (e.g. to only show Elements use NodeFilter.SHOW_ELEMENT)
   * @returns {[]} the nodes
   * @see https://stackoverflow.com/a/44516001
   * @private
   */
  function getNodesByTreeWalker(root, whatToShow) {
    console.log("getNodesByTreeWalker() - root=" + root + ", whatToShow=" + whatToShow);
    const nodes = [];
    try {
      const walker = document.createTreeWalker(root, whatToShow);
      // Note: The walker's first node is the root, so we can safely start iterating with a leading nextNode()
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }
    } catch (e) {
      console.log("getNodesByTreeWalker() - Error:");
      console.log(e);
    }
    return nodes;
  }

  /**
   * Gets the next link from an iframe. Technically, only Element Iframe (Trim) mode needs this as the Import mode will
   * have the iframe remain on the page.
   *
   * @param iframeDocument the iframe document to obtain the page elements from
   * @param attempt        the current attempt number
   * @returns the page elements
   */
  async function getNextLinkFromIframe(iframeDocument, attempt = 0) {
    const result = Next.findLinkWithInstance(instance, instance.action, [iframeDocument]);
    // Recursively call this function and try again if no next link was found.
    // TODO: This will always take the full amount of attempts on the last page! Is there a way to detect this is the last page at this point and increase the max attempts?
    if (attempt < 15 && !(result && result.url && result.url !== instance.url && (!pages || !pages.find(p => p.url === result.url)))) {
      await Promisify.sleep(200);
      return getNextLinkFromIframe(iframeDocument, attempt + 1);
    }
    console.log("getNextLinkFromIframe() - took " + (attempt * 200) + "ms, result.url=" + result?.url);
    return result;
  }

  /**
   * Gets the page elements from an iframe (both modes).
   *
   * @param iframeDocument the iframe document to obtain the page elements from
   * @param attempt        the current attempt number
   * @returns the page elements
   */
  async function getPageElementsFromIframe(iframeDocument, attempt = 0) {
    pageElements = getPageElements(iframeDocument);
    // Determine if the page elements are placeholder ghost nodes by comparing the innerHTML of each of the page elements to see if they are the same
    // If we're using the parent element container for the pageElements (e.g. "trim" mode), look at the children (risky!)
    const innerHTMLs = [];
    for (const pageElement of (pageElements?.length === 1 && pageElements[0] && pageElements[0].children ? pageElements[0].children : pageElements)) {
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
    // Recursively call this function and try again if no page elements were found or if they appear to be ghost nodes
    if ((attempt < 25 && pageElements.length <= 0) || (attempt < 15 && isLikelyGhostNodes)) {
      await Promisify.sleep(200);
      return getPageElementsFromIframe(iframeDocument, attempt + 1);
    }
    console.log("getPageElementsFromIframe() - took " + (attempt * 200) + "ms, pageElements.length=" + pageElements?.length + ", isLikelyGhostNodes=" + isLikelyGhostNodes);
    return pageElements;
  }

  /**
   * Gets the array of page elements in Append Element mode.
   * Note: This is public so Instance.buildInstance() can call it when determining if this is a database URL.
   *
   * @param currentDocument the document to use when querying or evaluating the array of elements
   * @param pageElementType the type to query or evaluate (selector or xpath)
   * @param pageElementPath the CSS Selector or XPath expression
   * @param withDetails     whether to include the details object or not
   * @returns {[]} the array of elements
   * @public
   */
  function getPageElements(currentDocument, pageElementType = instance.pageElementType, pageElementPath = instance.pageElementPath, withDetails = false) {
    // Note: We do not want to set the global pageElements variable in this function in case we are just checking for it
    let pageElements_ = [];
    // Stores the exception or error message in order to return it back to the user for feedback (e.g. invalid selector)
    const details = {};
    try {
      if (pageElementType === "selector") {
        const result = currentDocument.querySelectorAll(pageElementPath);
        pageElements_ = Array.from(result);
      } else {
        // TODO: Investigate XPath resolver. Is null always OK?
        const result = currentDocument.evaluate(pageElementPath, currentDocument, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        if (result && result.snapshotLength > 0) {
          for (let i = 0; i < result.snapshotLength; i++) {
            pageElements_.push(result.snapshotItem(i));
          }
        }
      }
    } catch (e) {
      console.log("getPageElements() - Error:");
      console.log(e);
      details.error = e.message;
    }
    console.log("getPageElements() - pageElementType=" + pageElementType + ", pageElementPath=" + pageElementPath + ", elements=");
    console.log(pageElements_);
    return withDetails ? [pageElements_, details] : pageElements_;
  }

  /**
   * Gets the insertion point in the Append Element mode. We first check using the insertBefore rule (if supplied), and
   * then fall back to checking the elements.
   *
   * Note: The insertBefore rule is completely optional and was only found to be used in ~1% of all Database records. It
   * should only be used on the first page (original document).
   *
   * @param elements         the page elements to use to get the insert element from
   * @param useInsertRule    (optional) if true, attempts to use the insert before rule
   * @param pageElementType  (optional) the type of rule to query or evaluate for the insert before rule (selector or xpath)
   * @param insertBeforePath (optional) the insert before rule to use to get the insert element
   * @param withDetails      (optional) if true, returns extra details, such as the source of the insert element
   *
   * @returns {*} the insert element or the insert element with source
   * @private
   */
  function getInsertionPoint(elements, useInsertRule = false, pageElementType = instance.pageElementType, insertBeforePath = instance.insertBeforePath, withDetails = false) {
    // Note: We do not want to set the global insertionPoint variable in this function in case we are just checking for it
    let insertionPoint_;
    let details = "";
    // Check insertBefore only on first page on original document (wrap in try/catch in case there's a problem to fallback to normal insert point)
    try {
      if (insertBeforePath && useInsertRule) {
        if (pageElementType === "selector") {
          insertionPoint_ = document.querySelector(insertBeforePath);
        } else {
          insertionPoint_ = document.evaluate(insertBeforePath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        }
        details = chrome.i18n.getMessage("insertion_point_before");
      }
    } catch (e) {
      console.log("getInsertionPoint() - error checking insertBefore rule. Error:");
      console.log(e);
      details = e.message;
    }
    // If no insert element found using the insert before rule, set insertion point using the last element
    if (!insertionPoint_ && elements && elements.length > 0) {
      try {
        // TODO: Button AJAX uses first element, not last
        // if (instance.append === "ajax") {
        //   const firstElement = elements[0];
        //   if (firstElement.previousSibling) {
        //     insertionPoint_ = firstElement.previousSibling;
        //     details = "the first element's previous sibling";
        //   } else {
        //     // Don't modify the DOM if only requesting details! (e.g. Popup checking...) Just return the lastElement so we get the parent from it
        //     if (withDetails) {
        //       insertionPoint_ = firstElement;
        //     } else {
        //       // TODO: Investigate if we can create an element span, as that lets us use getBoundingClientRect
        //       insertionPoint_ = firstElement.parentNode.insertBefore(firstElement, document.createTextNode(" "));
        //     }
        //     details = "a new node created by the document";
        //   }
        // }
        // Normal Non-Button insert element:
        // else {
        const lastElement = elements[elements.length - 1];
        if (lastElement.nextSibling) {
          insertionPoint_ = lastElement.nextSibling;
          details = chrome.i18n.getMessage("insertion_point_sibling");
        } else {
          // Don't modify the DOM if only requesting details! (e.g. Popup checking...) Just return the lastElement so we get the parent from it
          if (withDetails) {
            insertionPoint_ = lastElement;
          } else {
            // TODO: Investigate if we can create an element span, as that lets us use getBoundingClientRect
            insertionPoint_ = lastElement.parentNode.appendChild(document.createTextNode(" "));
          }
          details = chrome.i18n.getMessage("insertion_point_new");
        }
        //}
      } catch (e) {
        console.log("getInsertionPoint() - error checking lastElement. Error:");
        console.log(e);
        details = e.message;
      }
    }
    console.log("getInsertionPoint() - pageElementType=" + pageElementType + ", insertBeforePath=" + insertBeforePath + "details=" + details + ", insertionPoint=");
    console.log(insertionPoint_);
    return withDetails ? [insertionPoint_, details] : insertionPoint_;
  }

  /**
   * Gets the observable element from the elements array, used in the Append Element mode. The observable element is
   * the first Node.ELEMENT_NODE in the elements array. It must be a Node.ELEMENT_NODE because it is the element used to
   * observe which page we are in (text or comment nodes can't be used). It should also be 1px or higher so it can be
   * scrolled into view and detected. Finally, the element should have a default position attribute of static (or at
   * least relative) to avoid issues with absolute and fixed elements.
   *
   * Note: This function is also called in prepareFirstPage() to find the first page's observable element, and also in
   * Append Page mode to get each page's observable element.
   *
   * @param elements the elements array, of which an observable element will be selected from
   * @returns Node.ELEMENT_NODE the observable element selected from the elements array
   * @private
   */
  function getObservableElement(elements) {
    console.log("getObservableElement() - elements.length=" + elements.length);
    let observableElement;
    if (elements && elements.length > 0) {
      // Set the observableElement to the first element node that is 1px or higher and that has a default position of static (it can't be a text or comment node in order to use getClientBoundRect in SL or to observe it in IO)
      // Prioritize finding a position node that meets all the requirements, then use the first available height node, then the first available element node
      const elementNodes = elements.filter(e => e && e.nodeType === Node.ELEMENT_NODE);
      const heightNodes = elementNodes.filter(e => Math.max(e.clientHeight, e.offsetHeight, e.scrollHeight) > 0);
      const positionNode = heightNodes.filter(e => window.getComputedStyle(e).getPropertyValue("position") === "static")[0];
      // TODO: Fallback to even text/comment nodes here, e.g. || elements[0] ?
      observableElement = positionNode || heightNodes[0] || elementNodes[0];
    }
    return observableElement;
  }

  /**
   * Calculates the colSpan of the table (element_). This is only used for the divider in Append Element mode when the
   * divider needs to be a table row (in other words, the parent element_ is a table or tbody).
   *
   * @returns {number} the colSpan of the table (element_)
   * @private
   */
  function calculateColSpan() {
    console.log("calculateColSpan()");
    let colSpan;
    try {
      // If we already have a divider with the container child's colspan, we don't need to calculate the colspan again
      if (divider && divider.children[0] && divider.children[0].colSpan && divider.children[0].colSpan > 0) {
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
   * TODO: Add a way to call this again if the mode changes (e.g. from Page to Element).
   * @private
   */
  function calculateOffset() {
    // Page, Iframe, and Media Append modes always have an offset of 0
    // if (!elements && !button) {
    if (instance.append === "page" || instance.append === "iframe" || instance.append === "media") {
      console.log("calculateOffset() - no elements or button so setting offset to 0");
      offset = 0;
      return;
    }
    // In Click Button Action Manual mode, it's just buttonPosition and no need to calculate it
    // if (!elements && button && instance.buttonDetection === "manual") {
    if (instance.action === "button" && instance.buttonDetection === "manual") {
      console.log("calculateOffset() - manual buttonDetection, setting offset to buttonPosition=" + instance.buttonPosition);
      offset = instance.buttonPosition;
      return;
    }
    // Everything Else either uses pageElements (Element, Element Iframe, AJAX) or Auto Button Detection (None)
    // First get the absolute bottom position (total height of the document) in pixels
    const bottom = getTotalHeight(document);
    // Check where the element point is on the document and find its position. Its position (top) can then be used to calculate the offset
    // let elementPosition = button ? getElementPosition(button) : getElementPosition(insertionPoint);
    let elementPosition = instance.append === "none" ? getElementPosition(button_) : getElementPosition(insertionPoint);
    // TODO: Experiment with NOT doing this anymore on the elementPosition and just relying on option 2 if insert isn't an element
    // If the insert isn't an element, we must wrap it inside an element to calculate its position
    // if (insertionPoint && insertionPoint.nodeType === Node.TEXT_NODE) {
    //   const element = convertTextToElement(insertionPoint);
    //   elementPosition = getElementPosition(element);
    //   // Take the insert out of the element and back where it was, then remove the element
    //   if (element && element.parentNode && element.parentNode.insertBefore) {
    //     element.parentNode.insertBefore(insertionPoint, element);
    //     element.remove();
    //   }
    // } else {
    //  elementPosition = getElementPosition(insertionPoint);
    // }
    // 1st Option: Use the element's top position
    let difference = elementPosition.top;
    // 2nd Option: If in element mode, fall back to calculating the elements' bottom position and use the biggest value
    // if (pageElements && (!difference || difference <= 0)) {
    if ((instance.append === "element" || instance.append === "ajax") && (!difference || difference <= 0)) {
      console.log("calculateOffset() - no value found from the insert position's top, calculating each element's bottom position ...");
      // If setting the instance (changing the append mode) and we haven't yet set the page elements for the first time
      if (!pageElements) {
        pageElements = getPageElements(document);
      }
      difference = Math.max(...(pageElements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => getElementPosition(e).bottom)));
    }
    // 3rd Option: Fall back to using the total document height * 0.75
    if (!difference || difference <= 0) {
      console.log("calculateOffset() - no value found from any of the elements' bottom position, calculating the document's bottom * 0.75 ...");
      difference = bottom * 0.75;
    }
    // ceil (round up 1 pixel) just in case?
    offset = Math.ceil(bottom - difference);
    console.log(pageElements ? ("calculateOffset() - the elements' max bottom position was:" + Math.max(...(pageElements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => getElementPosition(e).bottom)))) : "");
    console.log("calculateOffset() - bottom=" + bottom + ", offset=" + offset + ", elementPosition=" + elementPosition.top + ", backup bottom*0.75=" + (bottom * .75) + ", and the value chosen was=" + difference);
  }

  /**
   * Gets an element's position relative to the entire document. We use getBoundingClientRect() to find the position.
   *
   * @param element the element to get the position of
   * @returns {{top: number, left: number}|{top}}
   * @see https://plainjs.com/javascript/styles/get-the-position-of-an-element-relative-to-the-document-24/
   * @see https://stackoverflow.com/a/1461143
   * @private
   */
  function getElementPosition(element) {
    let position = { top: 0, bottom: 0, left: 0 };
    try {
      // Commented out the left since it's not needed for our purposes (we only care about vertical position)
      const rect = element.getBoundingClientRect();
      // const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      position.top = rect.top + scrollTop;
      position.bottom = rect.bottom + scrollTop;
      // position.left = rect + scrollLeft;
    } catch (e) {
      console.log("getElementPosition() - Error:");
      console.log(e);
    }
    console.log("getElementPosition() - position.top=" + position.top + ", position.bottom=" + position.bottom);
    return position;
  }

  /**
   * Triggers a {@link CustomEvent}. This allows userscripts and external extensions to act accordingly on the event.
   * This usually occurs when a new node is inserted into the document.
   *
   * A CustomEvent contains a details object that contains properties about this event, like the instance's current URL.
   *
   * @param name    the event name
   * @param element the element that triggers this event
   * @param detail  the detail object to attach to this event
   * @param force   if this is event should be force triggered, regardless of items.customEventsEnabled
   * @see https://javascript.info/dispatch-events for the difference between {@link Event} and {@link CustomEvent}
   * @see https://vhudyma-blog.eu/custom-events-in-javascript/
   * @private
   */
  function triggerCustomEvent(name, element, detail, force = false) {
    try {
      if (items.customEventsEnabled || force) {
        console.log("triggerCustomEvent() - name=" + name + ", element=" + element + ", force=" + force);
        const object = {
          detail: undefined,
          bubbles: true,
          cancelable: false
        };
        // Depending on the browser we need to handle the detail differently:
        // Firefox: We need to use the Firefox-only "cloneInto" @see: https://stackoverflow.com/a/46081249 https://bugzilla.mozilla.org/show_bug.cgi?id=1495243
        // Firefox: Also @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
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
  //  * @param node the node
  //  * @returns {HTMLSpanElement|*} the converted element
  //  * @private
  //  */
  // function convertTextToElement(node) {
  //   console.log("convertTextToElement()");
  //   try {
  //     if (node.nodeType === Node.TEXT_NODE) {
  //       const element = document.createElement("span");
  //       node.parentNode.insertBefore(element, node);
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
   * @param name   the name of the icon (FontAwesome icon name if applicable)
   * @param width  the icon width
   * @param height the icon height
   * @param animated true if this icon should be animated
   * @returns {SVGSVGElement | Text} the svg element or a text node if SVGs aren't supported
   * @see https://loading.io
   * @private
   */
  function createIcon(name, width, height, animated = false) {
    console.log("createIcon() - icon=" + name);
    let svg;
    const icons = {
      "infinity": {
        viewBox: "0 0 100 100",
        width: "33",
        height: "33",
        fill: "none",
        "stroke": COLOR,
        "strokeWidth": "15",
        "strokeLinecap": "round",
        "pathStyle": "transform:scale(0.77); transform-origin:50px 50px;",
        path: "M24.3 30C11.4 30 5 43.3 5 50s6.4 20 19.3 20c19.3 0 32.1-40 51.4-40 C88.6 30 95 43.3 95 50s-6.4 20-19.3 20C56.4 70 43.6 30 24.3 30z",
        style: ""
      },
      "circle-chevron-down": {
        viewBox: "0 0 512 512",
        width: "20",
        height: "20",
        fill: COLOR,
        path: "M256 0C114.6 0 0 114.6 0 256c0 141.4 114.6 256 256 256s256-114.6 256-256C512 114.6 397.4 0 256 0zM390.6 246.6l-112 112C272.4 364.9 264.2 368 256 368s-16.38-3.125-22.62-9.375l-112-112c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L256 290.8l89.38-89.38c12.5-12.5 32.75-12.5 45.25 0S403.1 234.1 390.6 246.6z",
        style: "cursor: pointer; margin-left: 16px;"
      },
      "circle-chevron-up": {
        viewBox: "0 0 512 512",
        width: "20",
        height: "20",
        fill: COLOR,
        path: "M256 0C114.6 0 0 114.6 0 256c0 141.4 114.6 256 256 256s256-114.6 256-256C512 114.6 397.4 0 256 0zM390.6 310.6c-12.5 12.5-32.75 12.5-45.25 0L256 221.3L166.6 310.6c-12.5 12.5-32.75 12.5-45.25 0s-12.5-32.75 0-45.25l112-112C239.6 147.1 247.8 144 256 144s16.38 3.125 22.62 9.375l112 112C403.1 277.9 403.1 298.1 390.6 310.6z",
        style: "cursor: pointer; margin-right: 12px;"
      },
      "circle-xmark": {
        viewBox: "0 0 512 512",
        width: "16",
        height: "16",
        fill: COLOR,
        path: "M0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256zM175 208.1L222.1 255.1L175 303C165.7 312.4 165.7 327.6 175 336.1C184.4 346.3 199.6 346.3 208.1 336.1L255.1 289.9L303 336.1C312.4 346.3 327.6 346.3 336.1 336.1C346.3 327.6 346.3 312.4 336.1 303L289.9 255.1L336.1 208.1C346.3 199.6 346.3 184.4 336.1 175C327.6 165.7 312.4 165.7 303 175L255.1 222.1L208.1 175C199.6 165.7 184.4 165.7 175 175C165.7 184.4 165.7 199.6 175 208.1V208.1z",
        style: "cursor: pointer; position: fixed; top: 4px; right: 4px; padding: 2px;",
        title: chrome.i18n.getMessage("close_label")
      }
    };
    const icon = icons[name];
    try {
      // TODO: Should we also use setAttributeNS() instead of setAttribute()?
      const ns = "http://www.w3.org/2000/svg";
      svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", width || icon.width);
      svg.setAttribute("height", height || icon.height);
      svg.setAttribute("viewBox", icon.viewBox);
      svg.setAttribute("preserveAspectRatio", "xMidYMid");
      svg.setAttribute("style", processStyle("display: inline; position: initial; margin: auto; shape-rendering: auto; vertical-align: middle; visibility: visible; width: initial; height: initial; " + icon.style));
      const path = document.createElementNS(ns, "path");
      path.setAttribute("fill", icon.fill);
      path.setAttribute("d", icon.path);
      if (icon.stroke) {
        path.setAttribute("stroke", icon.stroke);
        path.setAttribute("stroke-width", icon.strokeWidth);
        path.setAttribute("stroke-linecap", icon.strokeLinecap);
        path.setAttribute("style", processStyle(icon.pathStyle));
      }
      if (animated) {
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
   * @private
   */
  function createOverlay() {
    // TODO: Should we not show the overlay when scroll append is none (i.e. button click)?
    if ((items.scrollOverlay || items.debugEnabled) && document && (document.body || document.documentElement)) {
      overlay = document.createElement("div");
      overlay.id = "infy-scroll-overlay";
      overlay.style = processStyle("all: initial; position: fixed; top: 0; right: 0; width: 135px; padding: 8px; z-index: 2147483647; background: white;");
      // Close Button
      const close = createIcon("circle-xmark");
      close.addEventListener("click", () => {
        if (items.debugEnabled) {
          Promisify.storageSet({"debugEnabled": false});
          items.debugEnabled = false;
        }
        if (items.scrollOverlay) {
          Promisify.storageSet({"scrollOverlay": false});
          items.scrollOverlay = false;
        }
        overlay.remove();
      });
      overlay.appendChild(close);
      // Icon
      if (items.scrollIcon) {
        const icon = createIcon("infinity");
        overlay.appendChild(icon);
      } else {
        // By always appending a first child, we can always assume the text below is going to be overlay.children[1] when we go and later update it
        overlay.appendChild(document.createElement("span"));
      }
      const text = document.createElement("span");
      text.style = processStyle("vertical-align: middle; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; font-weight: bold; font-style: normal; color: " + COLOR + ";");
      text.textContent = chrome.i18n.getMessage("page_label") + " " + instance.currentPage + " / " + instance.totalPages;
      overlay.appendChild(text);
      if (items.debugEnabled) {
        const debugFontStyle = "font-family: monospace, sans-serif; font-size: 10px; font-style: normal; color: " + COLOR + ";";
        const debug = document.createElement("div");
        debug.style = processStyle("margin-top: 4px; vertical-align: middle; font-weight: bold; " + debugFontStyle);
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
      (document.body || document.documentElement).appendChild(overlay);
    }
  }

  /**
   * Updates the overlay when the current page changes.
   *
   * @private
   */
  function updateOverlay() {
    console.log("updateOverlay() - scrollOverlay=" + items.scrollOverlay)
    if ((items.scrollOverlay || items.debugEnabled) && overlay && overlay.children[2]) {
      overlay.children[2].textContent = chrome.i18n.getMessage("page_label") + " " + instance.currentPage + " / " + instance.totalPages;
      if (items.debugEnabled && overlay.children[3] && overlay.children[3].children[1]) {
        const bottom = getTotalHeight(document);
        const bottom075 = Math.floor(bottom * 0.75);
        const bottomOffset = bottom - offset;
        let bottomElements = "N/A";
        // TODO: Calculating the bottomInsert every time here is very CPU-heavy just for debugging; need to find another way to do it when we append
        // let bottomInsert = "N/A";
        // if (instance.append === "element") {
        //   bottomInsert = getElementPosition(insertionPoint).top;
        //   bottomInsert = getElementPosition(insertionPoint).top || (bottom - offset);
        //   const elements = getPageElements(document);
        //   bottomElements = Math.floor(Math.max(...(elements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => getElementPosition(e).bottom))));
        // }
        const details = overlay.children[3].children[1];
        details.children[0].textContent  = "total bottom = " + bottom;
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
    console.log("createLoading() - scrollLoading=" + items.scrollLoading);
    if (items.scrollLoading) {
      loading = document.createElement("div");
      loading.id = "infy-scroll-loading";
      loading.style = processStyle("all: initial; display: none; position: fixed; bottom: 0; right: 0; padding: 8px; z-index: 2147483647;");
      const icon = createIcon("infinity", undefined, undefined,true);
      loading.appendChild(icon);
      document?.body?.appendChild(loading);
    }
  }

  // /**
  //  *
  //  * @param element
  //  * @param name
  //  * @param value
  //  * @param priority
  //  * @see https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/setProperty
  //  */
  // function processIndividualStyle(element, name, value, priority) {
  //   //element.style.setProperty("display", "block", "important");
  //   element.style.setProperty(name, value, priority);
  // }

  /**
   * Process a semicolon delimited style string with !important added for each style.
   *
   * @param style {string} the style to process
   * @returns {string} the processed style with !important
   * @private
   */
  function processStyle(style) {
    return style.replaceAll(";", " !important;");
  }

  /**
   * Checks to see if the database needs to be updated; if so, updates the database.
   *
   * This function resides in the content script instead of the background's startup listener because that only fires
   * when Chrome starts, and users tend to keep their browser open for days or weeks before restarting.
   *
   * @param items the storage items to parse to determine whether the database should be updated or not
   * @private
   */
  async function updateDatabase(items) {
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
   * extension should start itself or not. It initializes the storage items and instance on the page.
   *
   * Note: This function only runs one time.
   *
   * @returns {Promise<void>}
   * @private
   */
  async function init() {
    console.log("init()");
    const tab = { id: 0, url: window.location.href };
    items = await Promisify.storageGet(undefined, undefined, []);
    // Check to see if the database needs to be updated. Note that this is the best/only time we can do this (here in the content script, not the background).
    // Do not await this; we will try and start as fast as possible on this page request and we'll have the updated db on the next page request
    updateDatabase(items);
    // items = Instance.filterItems(tab, items);
    // console.log("filterItems() - before filtering, saves.length=" + items.saves.length + ", databaseIS.length=" + items.databaseIS.length + ", databaseAP.length=" + items.databaseAP.length);
    // const startTime = performance.now();
    // items = Instance.filterItems(tab, items);
    instance = await Instance.buildInstance(tab, items);
    items = instance.items;
    // If the instance's source is still items, check a few more times in case dynamic content hasn't finished loading
    console.log("init() - instance.via=" + instance.via);
    if (instance.via === "items") {
      // Here is where we may be waiting quite some time, (1,3,5,7,10 seconds)
      const temp = await Instance.buildInstance(tab, items, 1);
      // The instance may have been set by the user in the time it took to await the previous statement; only set it if it isn't enabled
      if (!instance.enabled) {
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
    // Note: We do not want to delete the database or saves to streamline checking them again later if this is an SPA
    // To avoid querying for the items twice, we manually delete the database and saves after buildInstance is done. This is the only place/time where we need to do this
    // delete items.databaseAP;
    // delete items.databaseIS;
    // // delete items.databaseCustom;
    // delete items.saves;
    console.log("init() - instance=");
    console.log(instance);
    if (instance.enabled) {
      await start();
      // // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this instance
      // instance.tabId = await Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true});
    }
    // If this is an SPA, watch this page.
    // Note: We don't want to enable this on every website. For example, simply entering text in https://regex101.com/ keeps firing mutation changes
    if (instance.spa && items.on && (instance.databaseFound ? items.databaseMode === "blacklist" ? !instance.databaseBlacklisted : instance.databaseWhitelisted : true)) {
      console.log("init() - watching SPA");
      spaObserver = new MutationObserver(spaObserverCallback);
      spaObserver.observe(document.body, { childList: true, subtree: true });
      // We can instead use a timer to check if the URL has changed, but some SPAs do not change the URL so this may not be as reliable long-term:
      // setInterval(() => { if (href !== window.location.href) { href = window.location.href; spaObserverCallback([]); } }, 1000);
    }
  }

  /**
   * This function is only called when the extension wants to "start" running on this page.
   * This will create some of Infy Scroll's one-time only elements (like the overlay and loading) for the very first time and actually add the scroll detection.
   *
   * Note: This function typically only runs one time. The difference between it and init() is that init() runs on each
   * page request, whereas start() only runs when the extension should be "started" (enabled) for the very first time.
   *
   * Note: This function is public for Action.blacklist() and Action.whitelist().
   *
   * @public
   */
  async function start() {
    console.log("start()");
    // TODO: Is the enabled needed because we might start via shortcuts? The Popup normally sets this to true after clicking Accept
    instance.enabled = true;
    instance.previouslyEnabled = true;
    if (!instance.started) {
      console.log("start() - was not started, so setting instance.started=true and doing initialization work...");
      instance.started = true;
      scrollListener = Util.throttle(scrollDetection, items.scrollDetectionThrottle);
      // resetStyling();
      createOverlay();
      createLoading();
      prepareFirstPage();
      // We need to now trigger the AP CustomEvent that we have loaded. This is for external scripts that may be listening for them
      triggerCustomEvent(EVENT_ON, document, {});
      // // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this instance
      // instance.tabId = await Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true});
    } else {
      // Sometimes after the Popup is setting the instance again (e.g. to add Auto after being enabled), isLoading is in a strange state of true
      // While we could always set this to false every time start() is called, we probably want to at least do prepareFirstPage() first, which calls appendFinally() and then sets it after a timeout
      instance.isLoading = false;
    }
    if (!items.on) {
      console.log("start() - was not on, so setting items.on=true");
      items.on = true;
      // // We don't need to wait for these two asynchronous actions to finish, so don't use await Promisify here
      // chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false}, function (response) { if (chrome.runtime.lastError) {} });
      chrome.storage.local.set({"on": true});
      // // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this instance
      // instance.tabId = await Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true});
    }
    // Re-show the overlay if the instance is starting again after stopping (outside the if instance.started check)
    if (overlay && overlay.style) {
      overlay.style.setProperty("display", "block", "important");
    }
    // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this instance
    instance.tabId = await Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true});
    // Add scroll detection if instance is starting again after stopping (outside the if instance.started check)
    addScrollDetection();
  }

  /**
   * This function is called when the extension wants to "stop" running on this page. This code handles all non-instance
   * specific stopping logic, such as removing the scrollDetection and hiding the overlay and loading elements.
   *
   * This will put the instance in a disabled or stopped state in case the user decides to turn the extension back on
   * before refreshing the page.
   *
   * Note: This function is public for Action.blacklist() and Action.whitelist().
   *
   * @public
   */
  async function stop() {
    console.log("stop()");
    removeScrollDetection();
    if (overlay && overlay.style) {
      overlay.style.setProperty("display", "none", "important");
    }
    if (loading && loading.style) {
      loading.style.setProperty("display", "none", "important");
    }
    // We must get the updated on/off state on this page's storage items cache
    items.on = await Promisify.storageGet("on");
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
    chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "off", temporary: true}, function (response) { if (chrome.runtime.lastError) {} });
  }

  /**
   * This function is called everytime an extension shortcut (command) is initiated.
   * This works very similarly to how Popup.clickActionButton() works with a few special cases (the if statement).
   * For example, the down action can start the instance.
   *
   * @param action the shortcut command
   * @param caller string indicating who called this function (e.g. command, popup, content script)
   * @private
   */
  async function command(action, caller) {
    // Down action while not enabled allows it to start using default settings or re-start if it was previously enabled already
    if (action === "down" && !instance.enabled) {
      // // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this instance
      // instance.tabId = await Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true});
      // We only use the default action and append (next page) if we didn't find a save/whitelist/database URL
      if (instance.via === "items") {
        // We need to set the default action and append mode here for the down command: next page
        instance.action = "next";
        instance.append = "page";
        // We need to determine whether keywords should be enabled or not. We only enable keywords if the rule failed on page 1 for a Whitelist or Keyboard Shortcut
        const nextResult = Next.findLink(instance.nextLinkType, instance.nextLinkPath, instance.nextLinkProperty, undefined, items.nextLinkKeywords, undefined, false, document_);
        instance.nextLinkKeywordsEnabled = nextResult.method === "keyword";
        instance.nextLinkKeyword = nextResult.keywordObject;
      }
      await start();
    } else if (
      ((action === "down" || action === "up") && (instance.enabled)) ||
      (action === "auto" && instance.autoEnabled) ||
      (action === "blacklist" && instance.databaseFound && !instance.autoEnabled) ||
      (action === "power")) {
      // Update Scroll's local items cache on state to false while this window is still open. The storage items will be updated in performAction so we don't have to do it here
      if (action === "power") {
        // action = items.on ? "off" : "on";
        items.on = !items.on;
        // TODO: Should we set the instance.enabled to false here?
      }
      // If this is a blacklist action, we need to toggle it to whitelist if the user has auto activate set to false
      if (action === "blacklist" && items.databaseMode !== "blacklist") {
        action = "whitelist";
      }
      Action.performAction(action, caller, instance, items, document_, document__);
    }
  }

  /**
   * Listen for requests from chrome.tabs.sendMessage (Extension Environment: Background / Popup)
   * Note: Every request should be responded to via sendResponse. Otherwise we introduce an unnecessary delay in waiting
   * for the response.
   *
   * @param request      the request object, which contains a greeting indicating what the request is
   * @param sender       the sender object (contains other information like tab)
   * @param sendResponse the response wrapper
   * @returns {Promise<void>} the response
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
        setInstance(request.instance);
        // Popup sometimes has out of date values for the current page and total pages
        instance.currentPage = currentPage;
        instance.totalPages = pages.length;
        // Recalculate the offset in case the append mode changed
        calculateOffset();
        break;
      case "start":
        // Note: This start message is only called from the Popup (Accept Button)
        await start();
        break;
      case "stop":
        stop();
        break;
      case "performAction":
        Action.performAction(request.action, request.caller, instance, items, document_, document__);
        break;
      case "checkSave":
        response = Saves.matchesSave(request.url, request.save);
        break;
      case "checkNextPrev":
        response = Next.findLink(request.type, request.rule, request.property, request.keywordsEnabled, request.keywords, request.keywordObject, true, request.highlight, document_);
        // If no response.url, use document__
        if (document__ && (!response || !response.url)) {
          response = Next.findLink(request.type, request.rule, request.property, request.keywordsEnabled, request.keywords, request.keywordObject, true, request.highlight, document__);
        }
        break;
      case "checkButton":
        response = Button.findButton(request.buttonType, request.buttonPath, request.highlight).details;
        break;
      case "checkPageElement":
        // Page Element Iframe (Import) won't have the elements any longer inside document_ as they were adopted into the parent document
        const pageElements_ = getPageElements(instance.append === "element" && instance.pageElementIframe === "import" ? document : document_, request.pageElementType, request.pageElementPath, true);
        const insertionPoint_ = getInsertionPoint(pageElements_[0], true, request.pageElementType, request.insertBeforePath, true);
        const parent = insertionPoint_[0] ? insertionPoint_[0].parentNode : undefined;
        response = { found: (pageElements_[0].length > 0 && !!insertionPoint_[0] && !!parent), elementsLength: pageElements_[0].length, error: pageElements_[1].error, insertDetails: insertionPoint_[1], parentNode: parent ? parent.nodeName : ""};
        if (request.highlight && typeof HoverBox !== "undefined") {
          new HoverBox().highlightElement(parent, true);
        }
        break;
      case "autoDetectPageElement":
        // TODO: Should this use the root document or document_? If we use the document_ we won't be able to use getBoundingClientRect() due to nothing being appended on the page
        // Do not use our storage items cache of path properties as it may be out of date compared to the Popup's
        const autoDetectResult = Element_.autoDetectPageElement(document, items.preferredPathType, request.algorithm, request.quote, request.optimized);
        response = autoDetectResult.path;
        if (typeof HoverBox !== "undefined") {
          new HoverBox().highlightElement(autoDetectResult.el, true);
        }
        break;
      case "determinePathType":
        response = DOMPath.determinePathType(request.path, request.type).type;
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
        Picker.initPicker(request.algorithm, request.quote, request.optimized, request.js, request.property, request.minimize, request.corner);
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
      case "minimizePicker":
        Picker.minimizePicker(request.toggle);
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

  // Initialize Scroll
  // Note: Some websites have a "timing" issue in which Infy starts way too fast before the page has "loaded" See Database URL: https://book.yyts.org/welcome-to-typescript
  // Note: This is also needed for some websites where Infy does find the page elements at first, but doesn't after the page has finished loading. See Database URL: http://wedata.net/items/418
  // Note: Or maybe not?
  setTimeout(() => { init(); }, 0);
  // init();

  // // AJAX/SPA Dynamic URL Workaround (WebNavigation state change)
  // let href = window.location.href;
  // setInterval(() => {
  //   if (href !== window.location.href) {
  //     href = window.location.href;
  //     if (!instance.enabled && !instance.started) {
  //       init();
  //     }
  //   }
  // }, 5000);

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    get,
    getInstance,
    setInstance,
    getPages,
    setPages,
    getPageElements,
    append,
    start,
    stop
  };

})();