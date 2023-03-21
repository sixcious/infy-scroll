/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Scroll is the main content script and handles all infinite scrolling logic. Scroll determines when a page should be
 * appended as the user scrolls down to the bottom. It then delegates business logic of performing actions and the
 * actual appending of pages to Workflow, Action, and Append.
 *
 * Scroll detection can either be implemented via a Scroll Listener or Intersection Observer. Infy Scroll supports both.
 */
class Scroll {

  /**
   * Adds the scroll detection (either Scroll Listener or Intersection Observer).
   *
   * @see https://developer.mozilla.org/docs/Web/API/Document/scroll_event
   * @see https://developer.mozilla.org/docs/Web/API/Intersection_Observer_API
   * @private
   */
  static #addScrollDetection() {
    Scroll.#removeScrollDetection();
    console.log("addScrollDetection() - adding " + V.instance.scrollDetection);
    // Can't use Intersection Observer when the append mode is none because we are not observing the button/page elements
    // TODO: Add IO support for none by observing the button element?
    if (V.instance.scrollDetection === "io" && V.instance.append !== "none") {
      // root: null means document. rootMargin: "0px 0px 1% 0px" is what we were previously using (basically 0px with extra bottom of 1%). Alternatively, "0px 0px -99% 0px" will only trigger when the top of the next page has been intersected. Use 0% or 1% to intersect the earliest (when any part of the next page is on the screen)
      V.intersectionObserver = new IntersectionObserver(Scroll.#intersectionObserverCallback, { root: null, rootMargin: "0px", threshold: 0 });
      // Need this for loop to 1) observe the first page due to prepareFirstPage() being called before the intersectionObserver is made, and 2) when re-enabling an V.instance after a stop
      for (const page of V.pages) {
        // try-catch because observe will throw an exception if the element is undefined or not a Node.ELEMENT_NODE
        try {
          V.intersectionObserver.observe(page.element);
        } catch (e) {
          console.log(e);
        }
      }
      // Note: The reason this is a separate observer is due to the rootMargin being different compared to the regular Intersection
      // Observer. We use a rootMargin of 0px for the former and a rootMargin of appendThreshold (500 pixels) for this.
      V.bottomObserver = new IntersectionObserver(Scroll.#bottomObserverCallback, { root: null, rootMargin: "0px 0px " + (typeof V.instance.appendThreshold === "number" ? V.instance.appendThreshold : 500) + "px 0px", threshold: 0 });
      try {
        V.bottomObserver.observe(V.bottom);
      } catch (e) {
        console.log(e);
      }
    } else {
      // Scroll Listener passive should already be the default on scroll events
      window.addEventListener("scroll", V.scrollListener, { passive: true });
    }
  }

  /**
   * Removes the scroll detection (either Scroll Listener or Intersection Observer).
   *
   * @see https://developer.mozilla.org/docs/Web/API/Document/scroll_event
   * @see https://developer.mozilla.org/docs/Web/API/Intersection_Observer_API
   * @private
   */
  static #removeScrollDetection() {
    console.log("removeScrollDetection() - removing " + V.instance.scrollDetection);
    // Note: We set the intersectionObserver to undefined because we check if it exists to determine which scroll detection mode we are in shouldAppend()
    if (V.intersectionObserver) {
      V.intersectionObserver.disconnect();
      V.intersectionObserver = undefined;
    }
    if (V.bottomObserver) {
      V.bottomObserver.disconnect();
      V.bottomObserver = undefined;
    }
    window.removeEventListener("scroll", V.scrollListener);
  }

  /**
   * The callback function for the Intersection Observer. Observes all page entries when they intersect (are visible) in
   * the root (document). We call the reusable scrollDetection function afterwards to set the current page and bottom page.
   *
   * @param {IntersectionObserverEntry[]} entries - the array of entries being observed (the pages' observed elements)
   * @private
   */
  static #intersectionObserverCallback(entries) {
    console.log("intersectionObserverCallback() - entries=");
    console.log(entries);
    // Gotcha Note: entries will only consist of entries whose isIntersecting boolean state has CHANGED (not all observed entries!).
    // If an observed entry is still intersecting (or still not intersecting), it won't be part of the entries
    // @see https://www.smashingmagazine.com/2018/01/deferring-lazy-loading-intersection-observer-api/#comment-1571093900989424964
    // We update the pages isIntersecting boolean property with the updated changes
    for (const entry of entries) {
      const index = V.pages.findIndex(page => page.element === entry.target);
      if (index >= 0) {
        // We later check page.isIntersecting in scrollDetection() to determine the V.instance's currentPage and also bottomPage
        V.pages[index].isIntersecting = entry.isIntersecting;
      }
      console.log(entry);
    }
    // We then always call scrollDetection to update the current page
    Scroll.#scrollDetection();
  }

  /**
   * The callback function for the Bottom Observer (Intersection Observer mode). Observes only the single bottom element and
   * detects when we've reached the bottom. We call the reusable scrollDetection function afterwards to detect if another
   * page should be appended.
   *
   * @param {IntersectionObserverEntry[]} entries - the array of entries being observed (bottom)
   * @private
   */
  static #bottomObserverCallback(entries) {
    // There should only be one entry (bottom) being observed, but to be safe, we look at the last one's isIntersecting state
    V.instance.bottomIntersected = entries[entries.length - 1].isIntersecting;
    console.log("bottomObserverCallback() - V.instance.bottomIntersected=" + V.instance.bottomIntersected + ", entries=");
    console.log(entries);
    // We then always call scrollDetection, but this is only so we can call shouldAppend(). We don't really need detectCurrentPage()
    Scroll.#scrollDetection();
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
  static #ajaxObserverCallback(mutations) {
    console.log("ajaxObserverCallback() - mutations.length=" + mutations.length);
    for (const mutation of mutations) {
      console.log("mutation, type=" + mutation.type + " mutation.addedNodes=" + mutation.addedNodes.length);
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        const removeElements = DOMNode.getElements(V.instance.removeElementPath, V.instance.pageElementType).elements;
        for (const element of removeElements) {
          element.remove();
        }
        const hideElements = DOMNode.getElements(V.instance.hideElementPath, V.instance.pageElementType).elements;
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
  static async #spaObserverCallback(mutations, observer, caller) {
    // Don't do this anymore, we always want the most up to date navigate call to proceed in case the url changes
    // // Introduce an SPA Check lock to stop this from being called multiple times while we're still checking
    // if (checks.checkingSPA) {
    //   console.log("spaObserverCallback() - already checking SPA, so returning... caller=" + caller);
    //   return;
    // }
    // checks.checkingSPA = true;
    console.log("spaObserverCallback() - mutations.length=" + mutations.length + ", caller=" + caller);
    // // Need to delay in case navigate fires fast and the elements from the past pages are still on the screen (i.e. shouldStop will return false)
    // if (caller === "navigate") {
    //   await Promisify.sleep(1000);
    // }
    let shouldStop = true;
    // Why pickerEnabled?
    if (V.instance.enabled || V.instance.pickerEnabled) {
      // If append is none, then the only criteria is that the button no longer exists (can't rely on the page.element buttons as the site may have added a new button at the bottom)
      if (V.instance.append === "none") {
        shouldStop = !Click.findButton(V.instance.buttonPath, V.instance.buttonType, document, false).button;
      } else {
        // Must have at least one page (i.e. still in the middle of prepareFirstPage() AJAX Iframe) and a page must be active for it to check if page.element is still in the document (e.g. the page wasn't removed in removePages())
        shouldStop = V.pages.length > 0 && V.pages.every(page => !page.active || !document.contains(page.element) || (page.observableElement && !document.contains(page.observableElement)));
      }
    }
    console.log("spaObserverCallback() - shouldStop=" + shouldStop);
    if (shouldStop) {
      await Scroll.stop("spaObserverCallback");
      // Clean up existing pages before resetting
      for (const page of V.pages) {
        // Remove all the iframes
        if (page.iframe && typeof page.iframe.remove === "function") {
          console.log("spaObserverCallback() - removing iframe");
          page.iframe.remove();
        }
        // Need to manually remove the dividers in case the website only handles its specific elements like (p when sorting from old to new or vice versa)
        if (page.divider && typeof page.divider.remove === "function") {
          console.log("spaObserverCallback() - removing divider");
          page.divider.remove();
        }
        // TODO: This seems risky
        // if (page.pageElements && page.pageElements.length > 0) {
        //   for (const pageElement of page.pageElements) {
        //     console.log("spaObserverCallback() - removing pageElements");
        //     pageElement.remove();
        //   }
        // }
      }
      // Need to manually remove the AJAX Iframe in case we haven't appended any pages yet
      if (V.iframe && typeof V.iframe.remove === "function") {
        V.iframe.remove();
      }
      // Note that we are now always removing all the pages and resetting currentDocument and iframe if it's going to stop so that when it starts again,
      // the currentDocument is able to find the next link on the top-level document, not the old cloned document
      // We always need to reset the documents so we can still find the new next link on the new page
      V.pages = [];
      V.currentDocument = document;
      V.insertionPoint = V.pageElements = V.button = V.iframe = V.lazys = V.bottom = V.loading = V.divider = V.overlay = undefined;
      V.offset = 0;
      V.timeouts = V.checks = {};
      // // We are still using checks.checkingSPA so don't reset this entire object
      // checks = { checkingSPA: true };
      const tab = { id: 0, url: window.location.href };
      console.log("spaObserverCallback() - tab.url=" + tab.url);
      // Note that the potential SPA database items and saves are still in our storage items cache and we don't have to get the full storage items again
      // Unless: this is a navigate event!
      if (caller === "navigate") {
        V.items = await Promisify.storageGet(undefined, undefined, []);
      }
      // V.instance = await Instance.buildInstance(tab, items);
      // Here is where we may be waiting quite some time (e.g. 5 seconds)
      const temp = await Instance.buildInstance(tab, V.items, 3);
      console.log("spaObserverCallback() - temp V.instance=");
      console.log(temp);
      if (!V.instance.enabled) {
        V.instance = temp;
        delete V.instance.items;
        if (V.instance.enabled) {
          console.log("spaObserverCallback() - starting!");
          await Scroll.start(caller);
        }
      }
    }
    // // Remove the SPA Check lock
    // checks.checkingSPA = false;
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
  static #scrollDetection() {
    Scroll.#detectCurrentPage();
    if (Scroll.#shouldAppend()) {
      V.instance.isLoading = true;
      Workflow.execute(V.instance.action, "scrollDetection");
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
  static #scrollbarExists() {
    let exists = true;
    let documentHeight = -1;
    if (!V.instance.scrollbarExists && V.instance.scrollbarAppends < 10) {
      documentHeight = Util.getTotalHeight(document);
      // A scrollbar exists if the document's height is bigger than the window's height. TODO: Test this more e.g. > vs >=
      // Also, if the documentHeight still hasn't changed since the last time we appended, then assume there's an overflow:hidden property applied and the scrollbar exists
      exists = (documentHeight > window.innerHeight) || ((documentHeight > 0) && (documentHeight === V.instance.scrollbarHeight));
      // If a scrollbar exists, we will stop checking. Otherwise, we increment the appends value so we only append a max of 10 pages due to lack of scrollbar
      if (exists) {
        V.instance.scrollbarExists = true;
      } else {
        V.instance.scrollbarAppends++;
        // Cache the documentHeight for the next scrollbar check
        V.instance.scrollbarHeight = documentHeight;
      }
    }
    console.log("scrollbarExists() - scrollbarExists=" + V.instance.scrollbarExists + ", scrollbarAppends=" + V.instance.scrollbarAppends + ", window.innerHeight=" + window.innerHeight + ", documentHeight=" + documentHeight);
    return exists;
  }

  /**
   * Determines if the user has scrolled near the bottom of the content in Intersection Observer mode.
   *
   * This checks if the bottom element has been intersected by the append threshold pixels value. If the bottom marker
   * isn't in the document, it falls back to checking if the current (bottom-most) page that is intersected is the last
   * page.
   *
   * @returns {boolean} true if scrolled near the bottom of the content, false otherwise
   * @private
   */
  static #scrolledNearBottomIO() {
    console.log("scrolledNearBottomIO() - bottomIntersected=" + V.instance.bottomIntersected + ", bottomPage=" + V.instance.bottomPage + ", totalPages=" + V.instance.totalPages);
    // If the bottom is still on the page, check to see if it's intersected; otherwise, fallback to whether V.instance.bottomPage is the last page
    // Note that for the fallback, we use V.instance.bottomPage instead of V.instance.currentPage. The bottomPage is only used to determined if it should append or not, not the currentPage
    return V.bottomObserver && V.bottom?.nodeType === Node.ELEMENT_NODE && document?.body?.contains(V.bottom) ? V.instance.bottomIntersected : ((V.instance.totalPages - V.instance.bottomPage) <= 0);
  }

  /**
   * Determines if the user has scrolled near the bottom of the content in Scroll Listener mode.
   *
   * The "content" is either the entire HTML Document (in Page, Iframe, or Media modes) or the elements (in Element
   * mode). For example, if the append threshold value is 1000px, this checks if the user scrolled within 1000px of the
   * bottom of the content.
   *
   * @returns {boolean} true if scrolled near the bottom of the content, false otherwise
   * @private
   */
  static #scrolledNearBottomSL() {
    // This is the absolute bottom position (the total document's height)
    const totalBottom = Util.getTotalHeight(document);
    // This is the actual bottom we care about. In all modes except Append Element/AJAX mode, it's the same as the bottom. But in Append Element mode, we need to subtract the offset from the bottom. The offset is the space from the insertion point (the bottom of the elements) to the very bottom of the document. The offset is 0 in all other modes
    const contentBottom = totalBottom - V.offset;
    // This is the current position of the scrollbar. The scroll position can also be calculated to just be window.scrollY without the window.innerHeight and this would be the TOP position of the grayed portion of the scrollbar instead of its BOTTOM position
    const scrollPosition = window.scrollY + window.innerHeight;
    // This is the amount of pixels left until reaching the bottom. Because JavaScript gives us precise subpixel values (e.g. decimal numbers like 1200.5) we will floor the value. This is useful when scrolling to the bottom of the document and ensuring a 0.5 is treated as 0
    const pixelsLeft = Math.floor(contentBottom - scrollPosition);
    // The user has scrolled near the bottom if the pixels left is less than or equal to the threshold (e.g. 1000 pixels)
    const scrolledNearBottom = pixelsLeft <= V.instance.appendThreshold;
    console.log("scrolledNearBottomSL() - contentBottom=" + contentBottom + ", totalBottom=" + totalBottom + ", offset=" + V.offset + ", scrollPosition=" + scrollPosition + ", pixelsLeft=" + pixelsLeft + ", appendThreshold=" + V.instance.appendThreshold + ", scrolledNearBottom=" + scrolledNearBottom);
    return scrolledNearBottom;
  }

  /**
   * Determines if another page should be appended. This only happens when the following conditions are met:
   * 1. The V.instance is enabled (after stop is called, it is no longer enabled)
   * 2. There isn't a page currently being loaded (e.g. fetched)
   * 3. Element Picker isn't currently on
   * 4. Auto isn't enabled (as auto handles this on its own)
   * 5. The user has scrolled near the bottom (either by pixels or pages, depending on the scroll detection mode)
   *
   * @returns {boolean} true if a new page should be appended, false otherwise
   * @private
   */
  static #shouldAppend() {
    console.log("shouldAppend() - intersectionObserver=" + V.intersectionObserver + ", V.instance.isLoading=" + V.instance.isLoading);
    // Scrollbar Exists check only needs to occur when in Intersection Observer mode because the pixels checks this already implicitly
    return V.instance.enabled && !V.instance.isLoading && !V.instance.pickerEnabled && !V.instance.autoEnabled && (V.intersectionObserver ? !Scroll.#scrollbarExists() || Scroll.#scrolledNearBottomIO() : Scroll.#scrolledNearBottomSL());
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
  static #detectCurrentPage() {
    let currentSet = false;
    // Note that this assumes the page order is from page 1 to page n (max) in order to set currentPage to the first page on the screen
    for (const page of V.pages) {
      // Two Cases: If using Intersection Observer, check if the page is intersecting, else if Scroll Listener check isScrolledIntoView()
      if (V.intersectionObserver ? page.isIntersecting : Scroll.isScrolledIntoView(page.element)) {
        // In io, we always want to set the bottomPage to be the last intersected page
        V.instance.bottomPage = page.number;
        // If io, we only want to set currentPage to the first intersected page (but continue setting bottomPage in later iterations)
        if (!V.intersectionObserver || !currentSet) {
          currentSet = true;
          V.instance.currentPage = page.number;
          console.log("detectCurrentPage() - page.number=" + page.number + ", page.url=" + page.url);
          // If this is not a local file URL, can update history or title
          if (!V.instance.isLocal) {
            // Check if the address bar (window.location.href) hasn't already been updated with this page's url to avoid unnecessarily setting it again
            if (V.instance.scrollUpdateAddress && page.url && window.location.href !== page.url) {
              // The minimum safe minimum ms to wait before replacing the history state repeatedly is 25ms before browsers start to complain
              // If ScrollListener, the throttle is 200ms, but IO may be an issue maybe, but haven't experienced a complaint yet with IO, so not using a timeout for now
              window.history.replaceState(undefined, undefined, page.url);
            }
            // Check if the document title hasn't already been set with this page's title to avoid unnecessarily setting it again
            if (V.instance.scrollUpdateTitle && page.title && document.title !== page.title) {
              document.title = page.title;
            }
          }
          // Update the Page Overlay with the current page number (if the setting is enabled)
          Scroll.#updateOverlay();
        }
        // We never break out in io because we want to set bottomPage with the last page that is intersecting
        if (!V.intersectionObserver) {
          break;
        }
      }
    }
  }

  /**
   * Determines if the element (e.g. page) has been scrolled into the current viewport.
   * Note: This function is only called in Scroll Listener mode and by Append.removePages().
   *
   * Gotcha Note: If the element is in another context (e.g. iframe), then this may return a
   * false positive (true) if we are evaluating the top-level document context.
   *
   * @param {Element} element - the element (e.g. page)
   * @returns {boolean} true if the element has been scrolled into view, false otherwise
   * @public
   */
  static isScrolledIntoView(element) {
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
   * Calculates the offset, which is the space in pixels from the bottom of the content to the very bottom of the page.
   * This theoretically only needs to be calculated one time, as the offset should never change since this space is
   * never modified. However, on some websites (e.g. Amazon Reviews), the offset needs to be re-calculated after each
   * append call, perhaps due to dynamic content being added at the bottom, or else the pages get appended a bit late.
   *
   * Note: The offset is only needed if the Scroll Detection mode is Scroll Listener.
   *
   * @public
   */
  static calculateOffset() {
    // IntersectionObserver doesn't need an offset
    if (V.intersectionObserver) {
      return;
    }
    // Page, Iframe, and Media Append modes always have an offset of 0
    if (V.instance.append === "page" || V.instance.append === "iframe" || V.instance.append === "media") {
      console.log("calculateOffset() - append mode is page, iframe, or media, so setting offset to 0");
      V.offset = 0;
      return;
    }
    // In Click Button Action Manual mode, it's just buttonPosition and no need to calculate it
    if (V.instance.action === "click" && V.instance.append === "none" && V.instance.buttonDetection === "manual") {
      console.log("calculateOffset() - action is button and buttonDetection is manual, so setting offset to buttonPosition=" + V.instance.buttonPosition);
      V.offset = V.instance.buttonPosition;
      return;
    }
    // Everything Else either uses pageElements (Element, Element Iframe, AJAX) or Auto Button Detection (None)
    // First get the absolute bottom position (total height of the document) in pixels
    const bottom_ = Util.getTotalHeight(document);
    // Check where the element point is on the document and find its position. Its position (top) can then be used to calculate the offset
    let elementPosition = V.instance.append === "none" ? DOMNode.getElementPosition(V.button) : DOMNode.getElementPosition(V.insertionPoint);
    // TODO: Experiment with NOT doing this anymore on the elementPosition and just relying on option 2 if insert isn't an element
    // If the insertion point isn't an element, we must wrap it inside an element to calculate its position
    // if (insertionPoint && insertionPoint.nodeType === Node.TEXT_NODE) {
    //   const element = convertTextToElement(insertionPoint);
    //   elementPosition = DOMNode.getElementPosition(element);
    //   // Take the insertion point out of the element and back where it was, then remove the element
    //   if (element) {
    //     DOMNode.insertBefore(insertionPoint, element);
    //     element.remove();
    //   }
    // } else {
    //  elementPosition = DOMNode.getElementPosition(insertionPoint);
    // }
    // 1st Option: Use the element's top position
    let difference = elementPosition.top;
    // 2nd Option: If in element/ajax mode, fall back to calculating the elements' bottom position and use the biggest value
    if ((V.instance.append === "element" || V.instance.append === "ajax") && (!difference || difference <= 0)) {
      console.log("calculateOffset() - no value found from the insertion point's top, calculating each element's bottom position ...");
      // If setting the V.instance (changing the append mode) and we haven't yet set the page elements for the first time
      if (!V.pageElements) {
        V.pageElements = Elementify.getPageElements(document);
      }
      // difference = Math.max(...(pageElements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => DOMNode.getElementPosition(e).bottom)));
      // TODO: getBoundingClientRect includes padding and border, should we remove these before computing the element's bottom?
      difference = Math.max(...(Elementify.getPageElements(document).filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => DOMNode.getElementPosition(e).bottom)));
    }
    // 3rd Option: Fall back to using the total document height * 0.75
    if (!difference || difference <= 0) {
      console.log("calculateOffset() - no value found from any of the elements' bottom position, calculating the document's bottom * 0.75 ...");
      difference = bottom_ * 0.75;
    }
    // ceil (round up 1 pixel) just in case?
    V.offset = Math.ceil(bottom_ - difference);
    console.log(V.pageElements ? ("calculateOffset() - the elements' max bottom position was:" + Math.max(...(V.pageElements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => DOMNode.getElementPosition(e).bottom)))) : "");
    console.log("calculateOffset() - bottom=" + bottom_ + ", offset=" + V.offset + ", elementPosition=" + elementPosition.top + ", backup bottom*0.75=" + (bottom_ * .75) + ", and the value chosen was=" + difference);
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
  // static #convertTextToElement(node) {
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
   * Creates the optional overlay that is fixed on the page. The overlay shows the current page # / total page # and is
   * updated as the user scrolls.
   *
   * Note: This function is only called one time when the V.instance is started for the very first time.
   *
   * Important: We cannot make this an iframe like we can with the Picker UI because we will not have direct access to
   * its contentDocument from the content script. We would have to use message passing and wake up the background. This
   * is problematic because we have to update the overlay as the user scrolls, which would keep the background alive
   * as we pass messages back and forth.
   *
   * @private
   */
  static #createOverlay() {
    if (V.overlay && typeof V.overlay.remove === "function") {
      V.overlay.remove();
    }
    // TODO: Should we not show the overlay when scroll append is none (i.e. button click)?
    if (V.instance.pageOverlay || V.instance.debugEnabled) {
      V.overlay = document.createElement("div");
      V.overlay.id = V.OVERLAY_ID;
      // TODO: Don't hardcode these values here?
      const theme = V.items.theme === "dark" || (V.items.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)")?.matches) ? "dark" : "light";
      const overlayColor = theme === "light" ? "#000000" : "#CCCCCC";
      const background = theme === "light" ? "#FFFFFF" : "#202124";
      const OVERLAY_STYLE = "all: initial; z-index: 2147483647; background: " + background + "; ";
      V.overlay.style = Util.processStyle(OVERLAY_STYLE + "position: fixed; top: 0; right: 0; width: 150px; padding: 8px;");
      // Close Button
      const close = Util.createIcon("xmark", { color: overlayColor, size: "12" });
      close.addEventListener("click", () => {
        if (V.instance.debugEnabled) {
          Promisify.storageSet({"debugEnabled": false});
          V.instance.debugEnabled = false;
          for (const page of V.pages) {
            if (page.iframe && page.append === "ajax" || page.mode === "import") {
              page.iframe.style.setProperty("visibility", "hidden", "important");
            }
          }
        }
        if (V.instance.pageOverlay) {
          Promisify.storageSet({"pageOverlay": false});
          V.instance.pageOverlay = false;
        }
        V.overlay.remove();
      });
      V.overlay.appendChild(close);
      // Icon
      if (V.instance.scrollIcon) {
        const icon = Util.createIcon("infinity", { color: overlayColor });
        V.overlay.appendChild(icon);
      } else {
        // By always appending a first child, we can always assume the text below is going to be overlay.children[1] when we go and later update it
        V.overlay.appendChild(document.createElement("span"));
      }
      const text = document.createElement("span");
      text.style = Util.processStyle(OVERLAY_STYLE + "vertical-align: middle; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; font-weight: bold; font-style: normal; color: " + overlayColor + ";");
      text.textContent = chrome.i18n.getMessage("page_label") + " " + V.instance.currentPage + " / " + V.instance.totalPages;
      V.overlay.appendChild(text);
      if (V.instance.debugEnabled) {
        const debugFontStyle = OVERLAY_STYLE + "font-family: 'Roboto Mono', monospace, sans-serif; font-size: 10px; font-style: normal; color: " + overlayColor + "; display: block; ";
        const debug = document.createElement("div");
        debug.style = Util.processStyle(debugFontStyle + "margin-top: 4px; vertical-align: middle; font-weight: bold; display:");
        const title = document.createElement("div");
        title.style = Util.processStyle(debugFontStyle);
        title.textContent = "Infy's Debug Mode";
        debug.appendChild(title);
        const lines = document.createElement("div");
        lines.style = Util.processStyle(debugFontStyle);
        debug.appendChild(lines);
        // Debug will have 7 Lines: Bottom, Insert Bottom, Elements Bottom, 075 Bottom, Offset, Insert, Lazys
        for (let i = 0; i < 7; i++) {
          const line = document.createElement("div");
          line.style = Util.processStyle(debugFontStyle);
          lines.appendChild(line);
        }
        V.overlay.appendChild(debug);
      }
      (document.body || document.documentElement)?.appendChild(V.overlay);
    }
  }

  /**
   * Updates the overlay when the current page changes.
   *
   * @private
   */
  static #updateOverlay() {
    console.log("updateOverlay() - pageOverlay=" + V.instance.pageOverlay)
    if ((V.instance.pageOverlay || V.instance.debugEnabled) && V.overlay && V.overlay.children[2]) {
      V.overlay.children[2].textContent = chrome.i18n.getMessage("page_label") + " " + V.instance.currentPage + " / " + V.instance.totalPages;
      if (V.instance.debugEnabled && V.overlay.children[3] && V.overlay.children[3].children[1]) {
        const bottom_ = Util.getTotalHeight(document);
        const bottom075 = Math.floor(bottom_ * 0.75);
        const bottomOffset = bottom_ - V.offset;
        let bottomElements = "N/A";
        // TODO: Calculating the bottomInsert every time here is very CPU-heavy just for debugging; need to find another way to do it when we append
        // let bottomInsert = "N/A";
        // if (V.instance.append === "element") {
        //   bottomInsert = DOMNode.getElementPosition(insertionPoint).top;
        //   bottomInsert = DOMNode.getElementPosition(insertionPoint).top || (bottom - offset);
        //   const elements = Elementify.getPageElements(document);
        //   bottomElements = Math.floor(Math.max(...(elements.filter(e => e.nodeType === Node.ELEMENT_NODE).map(e => DOMNode.getElementPosition(e).bottom))));
        // }
        const details = V.overlay.children[3].children[1];
        details.children[0].textContent  = "total bottom = " + bottom_;
        details.children[1].textContent  = "offst bottom = " + bottomOffset;
        details.children[2].textContent  = "elems bottom = " + bottomElements;
        details.children[3].textContent  = "..075 bottom = " + bottom075;
        details.children[4].textContent  = "......offset = " + V.offset;
        details.children[5].textContent = "insert = " + (V.insertionPoint ? V.insertionPoint.nodeName : "N/A");
        details.children[6].textContent = "lazys = " + (V.lazys ? (V.lazys.size + " " + [...new Set(V.lazys.values())]) : "N/A");
      }
    }
  }

  /**
   * Creates the loading div with the animated infinity icon, initially set to display:none and re-appended after each
   * new page has been added.
   *
   * Note: This function is only called one time when the V.instance is started for the very first time.
   *
   * @private
   */
  static #createLoading() {
    console.log("createLoading() - scrollLoading=" + V.instance.scrollLoading);
    if (V.loading && typeof V.loading.remove === "function") {
      V.loading.remove();
    }
    if (V.instance.scrollLoading) {
      V.loading = document.createElement("div");
      V.loading.id = V.LOADING_ID;
      V.loading.style = Util.processStyle("all: initial; display: none; position: fixed; bottom: 0; right: 0; padding: 8px; z-index: 2147483647;");
      const icon = Util.createIcon("infinity", { color: V.instance.color, animated: true });
      V.loading.appendChild(icon);
      document?.body?.appendChild(V.loading);
    }
  }

  /**
   * Injects the ajax.js script into the page's main world. (Applies only to AJAX Native.)
   *
   * @private
   */
  static #injectAjaxScript() {
    if (V.instance.append === "ajax" && V.instance.ajaxMode === "native" && !V.checks.ajaxScriptInjected) {
      const script = document.createElement("script");
      // TODO: We can make the event name random by passing in a parameter to this script, like this:
      // V.EVENT_AJAX = V.instance.randomString;
      // script.src = chrome.runtime.getURL("/js/ajax.js?") + new URLSearchParams({eventName: V.EVENT_AJAX});
      script.src = chrome.runtime.getURL("/js/ajax.js");
      script.onload = function () {
        console.log("injectAjaxScript() - ajax.js script loaded");
        V.checks.ajaxScriptInjected = true;
        setTimeout(() => {
          // V.instance.customEventsEnabled || isRequired
          Util.triggerCustomEvent(V.EVENT_AJAX, document, {
            // Test disableScrollObjects: window,document,document.documentElement,document.body
            "disableScrollObjects": V.instance.disableScrollObjects || "window",
            "disableScrollElementPath": V.instance.disableScrollElementPath || "",
            "disableScrollFunctions": V.instance.disableScrollFunctions || "onscroll,scroll,scrollBy,scrollIntoView,scrollIntoViewIfNeeded,scrollTo",
            "pathType": V.instance.pageElementType
          }, true, V.items.browserName);
          Util.triggerCustomEvent(V.EVENT_AJAX, document, {
            "disableRemoveElementPath": V.instance.disableRemoveElementPath || DOMPath.generatePath(V.insertionPoint.parentNode, V.instance.pageElementType).path,
            "disableRemoveFunctions": V.instance.disableRemoveFunctions || "remove,removeChild",
            "pathType": V.instance.pageElementType
          }, true, V.items.browserName);
        }, 1000);
        // Remove the script to keep the page clean, the listener will still be active when we trigger events to it later on
        this.remove();
      };
      (document.head || document.body || document.documentElement).appendChild(script);
    }
  }

  /**
   * Uses window.matchMedia to derive the current system theme. This is in the content script due to there not being a browser
   * provided API/listener to detect these changes in the background. Note that the MV2 background can use window.matchMedia
   * changes, but not listen for them. Service Workers can't do either.
   *
   * @see https://github.com/sixcious/infy-scroll/issues/55
   * @see https://github.com/w3c/webextensions/issues/229
   * @private
   * ]'
   */
  static #addThemeListener() {
    console.log("addThemeListener()");
    try {
      const prefersColorSchemeDark = window.matchMedia("(prefers-color-scheme: dark)");
      if (chrome.extension?.inIncognitoContext) {
        console.log("addThemeListener() - incognito tab, sending message to background");
        //} && (V.items.icon === "dark" || (V.items.icon === "system" && prefersColorSchemeDark))) {
        Promisify.runtimeSendMessage({sender: "contentscript", receiver: "background", greeting: "setIcon", icon: "light", tabSpecific: true });
      } else if (V.items.icon === "system") {
        Promisify.runtimeSendMessage({sender: "contentscript", receiver: "background", greeting: "setIcon", icon: prefersColorSchemeDark.matches ? "light" : "dark"});
        prefersColorSchemeDark.addEventListener("change", function(e) {
          console.log("prefers-color-scheme change, dark=" + e.matches);
          // Update the toolbar icon and send a message to the Options and Popup to update the favicon (not really necessary for the Popup)
          Promisify.runtimeSendMessage({sender: "contentscript", receiver: "background", greeting: "setIcon", icon: e.matches ? "light" : "dark"});
          Promisify.runtimeSendMessage({sender: "contentscript", receiver: "popup", greeting: "themeChanged", theme: e.matches ? "dark" : "light"});
          Promisify.runtimeSendMessage({sender: "contentscript", receiver: "options", greeting: "themeChanged", theme: e.matches ? "dark" : "light"});
        });
      }
    } catch (e) {
      console.log("addThemeListener() - Error:")
      console.log(e);
    }
  }

  /**
   * Adds the Navigation API's navigate listener to help detect browser navigations when browsing SPAs.
   *
   * Note: Navigation is currently only supported in Chrome/Edge 102+ (not currently supported in Firefox).
   *
   * @param {Object} tab - the tab object containing this tab's URL
   * @param {Object} items - the storage items containing the navigationBlacklist
   * @see https://developer.chrome.com/docs/web-platform/navigation-api/
   * @see https://developer.mozilla.org/docs/Web/API/Navigation_API
   * @see https://developer.mozilla.org/docs/Web/API/Navigation
   * @see https://stackoverflow.com/questions/75313690/is-there-chrome-api-event-listener-that-fires-when-modern-web-apps-update-their
   * @private
   */
  static #addNavigationListener(tab, items) {
    console.log("addNavigationListener()");
    try {
      const matches = Saves.matchesList(tab.url, tab.url, items?.navigationBlacklist, "Navigation Blacklist")?.matches;
      if (!matches && typeof navigation !== "undefined" && typeof navigation?.addEventListener === "function") {
        console.log("addNavigationListener() - adding navigation listener");
        // We add a timeout just in case this is fired very early to let init() build the V.instance first? Can't catch errors unless we add an inner try-catch here
        // setTimeout(() => { navigation.addEventListener("navigate", navigateEvent => { spaObserverCallback([], {}, "navigate") }); }, 1000);
        // This timeout seems to cause issues vs awaiting promisify 1 second inside the function
        navigation.addEventListener("navigate", navigateEvent => {
          console.log("navigationListener() - fired navigate event");
          clearTimeout(V.timeouts.navigationListener);
          V.timeouts.navigationListener = setTimeout(() => { Scroll.#spaObserverCallback([], {}, "navigate"); }, 1000);
        });
      }
    } catch (e) {
      console.log("addNavigationListener() - error initializing navigation listener, Error:")
      console.log(e);
    }
  }

  /**
   * Checks to see if the databases need to be updated; if so, updates the databases.
   *
   * This function resides in the content script instead of the background's startup listener because that only fires
   * when Chrome starts, and users tend to keep their browser open for days or weeks before restarting.
   *
   * @private
   */
  static async #updateDatabases() {
    console.log("updateDatabase()");
    try {
      // This checks to see if the database needs to be updated (if the update was more than X number of days ago).
      // Note: 1 Day = 86400000 ms
      if ((V.items.databaseAPEnabled || V.items.databaseISEnabled) && V.items.databaseUpdate >= 1 && (!V.items.databaseDate || ((new Date() - new Date(V.items.databaseDate)) >= (86400000 * V.items.databaseUpdate)))) {
        console.log("updateDatabase() - updating database because databaseDate=" + V.items.databaseDate + " and databaseUpdate=" + V.items.databaseUpdate);
        const response = await Promisify.runtimeSendMessage({receiver: "background", greeting: "downloadDatabase", downloadAP: V.items.databaseAPEnabled, downloadIS: V.items.databaseISEnabled, downloadLocation: V.items.databaseLocation});
        console.log("updateDatabase() - download response=" + JSON.stringify(response));
      }
    } catch (e) {
      console.log("updateDatabase() - Error:");
      console.log(e);
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
  static async start(caller) {
    console.log("start() - caller=" + caller);
    // TODO: Is the enabled needed because we might start via shortcuts? The Popup normally sets this to true after clicking Accept
    V.instance.enabled = true;
    // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this V.instance (don't need to await this, so let's set the badge early)
    Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true}).then((tabId) => { V.instance.tabId = tabId; });
    if (!V.instance.started) {
      console.log("start() - was not started, so setting V.instance.started=true and doing initialization work...");
      V.instance.started = true;
      V.scrollListener = Util.throttle(Scroll.#scrollDetection, 200);
      // If caller is command and via is items, this was a down action while not enabled, or it was a re-start if it was previously enabled already (somehow?)
      if (caller === "command" && V.instance.via === "items") {
        // We need to initialize it with the default action and append (next page) if we didn't find a save or database URL
        V.instance.action = "next";
        V.instance.append = "page";
        // If the previous action/append mode was workflowReverse, that will be true so we need to reset it back to false
        V.instance.workflowReverse = false;
        V.instance.workflowPrepend = "";
        V.instance.documentType = "current";
        V.instance.transferNodeMode = "adopt";
        // We need to determine whether keywords should be enabled or not. We only enable keywords if the path failed on page 1 for a Keyboard Shortcut Command
        const link = Next.findLink(V.instance.nextLinkPath, V.instance.nextLinkType, V.instance.nextLinkProperty, undefined, V.items.nextLinkKeywords, undefined, true, document, false);
        V.instance.nextLinkKeywordsEnabled = link.method === "keyword";
        V.instance.nextLinkKeyword = link.keywordObject;
      }
      // resetStyling();
      await Append.prepareFirstPage("start");
      // We need to now trigger the AP CustomEvent that we have loaded. This is for external scripts that may be listening for them
      Util.triggerCustomEvent(V.EVENT_ON, document, {}, V.instance.customEventsEnabled, V.items.browserName);
    }
    if (!V.items.on) {
      console.log("start() - was not on, so setting items.on=true");
      V.items.on = true;
      Promisify.storageSet({"on": true});
    }
    // Note: We ned to call appendBottom() before addScrollDetection() so the bottomObserver can observe the bottom
    Scroll.#createOverlay();
    Scroll.#createLoading();
    Append.appendBottom();
    Scroll.#addScrollDetection();
    Scroll.#injectAjaxScript();
    // The AJAX Observer is only added if we are in native mode and removing or hiding elements
    if (V.instance.append === "ajax" &&  V.instance.ajaxMode === "native" && (V.instance.removeElementPath || V.instance.hideElementPath)) {
      V.ajaxObserver = new MutationObserver(Scroll.#ajaxObserverCallback);
      // TODO: Should we switch back to subtree: false? Need true for p int
      // ajaxObserver.observe(insertionPoint?.parentNode || document.body, { childList: true, subtree: false });
      V.ajaxObserver.observe(document.body, { childList: true, subtree: true });
    }
    // Note that we will always make isLoading=false every time start is called, resetting any weird states (e.g. to add Auto in the Popup after being enabled, isLoading might be previously true)
    Scroll.delay("start");
  }

  /**
   * This function is called when the extension wants to "stop" running on this page. This code handles all non-instance
   * specific stopping logic, such as removing the scrollDetection and hiding the overlay and loading elements.
   *
   * This will put the V.instance in a disabled or stopped state in case the user decides to turn the extension back on
   * before refreshing the page. The V.instance will not be deleted, but pages will not be appended while it is stopped.
   *
   * The stop action can be initiated directly from a power (off) action for this tab, or if the Background sends a
   * message to a tab's content script (after receiving a power "off" notification from another tab).
   *
   * Note: This function is public for Action.power(), Action.blacklist(), and Action.whitelist().
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  static stop(caller) {
    console.log("stop() - caller=" + caller);
    Scroll.#removeScrollDetection();
    // Disconnect MutationObservers
    if (V.ajaxObserver) {
      V.ajaxObserver.disconnect();
      V.ajaxObserver = undefined;
    }
    if (V.spaObserver && caller !== "spaObserverCallback") {
      V.spaObserver.disconnect();
      V.spaObserver = undefined;
    }
    // Remove all infy-scroll specific elements (they can be re-added when restarting)
    if (V.overlay && typeof V.overlay.remove === "function") {
      V.overlay.remove();
    }
    if (V.loading && typeof V.loading.remove === "function") {
      V.loading.remove();
    }
    if (V.bottom && typeof V.bottom.remove === "function") {
      V.bottom.remove();
    }
    // Instance Business Logic: This was...?
    if (V.instance.autoEnabled) {
      Auto.stopTimer("stop");
    }
    // Only show the off badge if it was previously on so we can call stop silently for other situations where the V.instance may not be enabled?
    if (V.instance.enabled) {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "off", temporary: true});
    }
    // V.instance: For callers like popup that still need the V.instance, disable it and reset all auto properties
    // V.instance.started will always remain true, do not reset it to false in the case the user re-enables the extension on this page
    V.instance.enabled = false;
    // All this auto stuff is done in Auto.stopAutoTimer
    // V.instance.enabled = V.instance.autoEnabled = V.instance.autoPaused = V.instance.autoSlideshow = false;
    // V.instance.autoTimes = V.instance.autoTimesOriginal;
    // V.instance.autoRepeatCount = 0;
    // Items: Get the updated on/off state for this page's storage items cache
    Promisify.storageGet("on").then(on => { V.items.on = on; });
    // // For callers like popup that still need the V.instance, disable all states and reset auto, multi, and urls array
    // V.instance.enabled = V.instance.multiEnabled = V.instance.autoEnabled = V.instance.autoPaused = V.instance.autoSlideshow = V.instance.shuffleURLs = false;
    // V.instance.multi = {"1": {}, "2": {}, "3": {}};
    // V.instance.multiCount = V.instance.autoRepeatCount = 0;
    // V.instance.urls = [];
    // Scroll Instance Cleanup ... TODO: Why was this current page assignment needed?
    // V.instance.currentPage = V.instance.totalPages;
  }

  /**
   * Imposes a delay before allowing the V.instance to load another page. This delay prevents Infy from making too many
   * requests in a small time frame. This function is used by Workflow.postWorkflow() and Scroll.start() to manage
   * preparing the first page.
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  static async delay(caller) {
    console.log("delay() - caller=" + caller);
    // If the caller is popup (e.g. ACCEPT Button) or auto there is no reason to delay
    await Promisify.sleep(caller === "popup" || caller === "auto" ? 100 : V.instance.appendDelay || 2000);
    V.instance.isLoading = false;
    // Don't call the autoListener in start/prepareFirstPage because Popup will have already called startAutoTimer()
    if (V.instance.autoEnabled && caller !== "start") {
      Auto.autoListener();
    } else {
      // At this point we can perform the action again if necessary. For example, if there is still no scrollbar, we
      // can perform the action (appending another page). We can also decide to check shouldAppend(), which will check
      // if we are near the bottom in terms of pages or pixels. This is a very important decision, as the extension
      // can keep appending more pages automatically at this point. If we only check for the scrollbar, we can force
      // the extension to only append one page at a time when scrolling, which seems safer. If we do the check for
      // shouldAppend(), we can check if the caller is prepareFirstPage so that it won't append more pages automatically
      // on each page load and waits until the user actually starts scrolling.
      // TODO: Consider implementing a maximum number of consecutive appends that can be done by the pixels and pages thresholds (share this limit with scrollbarAppends?)
      Scroll.#scrollDetection();
    }
  }

  /**
   * This function is called everytime an extension shortcut (command) is initiated.
   * This works very similarly to how Popup.clickActionButton() works with a few special cases (the if statement).
   * For example, the down action can start the V.instance.
   *
   * @param {string} action - the shortcut command
   * @param {string} caller - the caller who called this function
   * @private
   */
  static async #command(action, caller) {
    // Down action while not enabled allows it to start using default settings or re-start if it was previously enabled already (this is already handled in start())
    if (action === "down" && !V.instance.enabled) {
      await Scroll.start(caller);
    } else if (((action === "down" || action === "up") && V.instance.enabled) ||
                (action === "auto" && V.instance.autoEnabled) ||
                (action === "blacklist" && V.instance.databaseFound && !V.instance.autoEnabled) ||
                (action === "power")) {
      // // Update Scroll's local items cache on state to false while this window is still open. The storage items will be updated in performAction so we don't have to do it here
      // if (action === "power") {
      //   V.items.on = !V.items.on;
      //   // TODO: Should we set V.instance.enabled to false here?
      // }
      // If this is a blacklist action, we need to toggle it to whitelist if the user has auto activate set to false
      if (action === "blacklist" && V.items.databaseMode !== "blacklist") {
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
  static async #messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=");
    console.log(request);
    let response = {};
    switch (request.greeting) {
      case "getInstance":
        response = V.instance;
        break;
      case "setInstance":
        // Note: This setInstance message is only called from the Popup (Accept Button)
        // Store the current page and append mode before setting the V.instance to do some post setInstance work
        const currentPage = V.instance.currentPage;
        const append = V.instance.append;
        const workflowReverse = V.instance.workflowReverse;
        // Clone to be safe?
        V.instance = Util.clone(request.instance);
        // We may need to reset the iframe if the user is changing the append mode so that we always load a new iframe with the latest V.instance.url
        // If we didn't do this, then if the pre-existing iframe had an older V.instance.url, we would use that for the next workflow's action/append
        // const isIframe = (V.instance.append === "iframe" || (V.instance.append === "element" && V.instance.pageElementIframe) || (V.instance.append === "ajax" && V.instance.ajaxMode !== "native"));
        if (append !== V.instance.append && V.iframe) {
          // If the user is changing from the regular iframe to another append, then we shouldn't remove the previously appended iframe (all other cases, we probably ought to though)
          // iframe.remove();
          V.iframe = undefined;
        }
        // This causes issues when setting the V.instance for the first time in the popup when the workflowReverse is true (e.g. just starting in Element Iframe mode)
        if (!workflowReverse && V.instance.workflowReverse && Array.isArray(V.pages) && V.pages.length > 0 && V.instance.started) {
          await Iframe.prepareIframe(true, "setInstance");
        }
        // TODO: We need to reset the V.instance's URL back to the previous URL so Next.findLink() doesn't return a duplicate URL when we try again. We should refactor the code so that the V.instance URL is only set after the page has been successfully appended...
        // TODO: We need to revert currentDocument back to previous document...?
        if (workflowReverse && !V.instance.workflowReverse && Array.isArray(V.pages) && V.pages[V.pages.length - 1]) {
          V.instance.url = V.pages[V.pages.length - 1].url;
        }
        // Popup sometimes has out of date values for the current page and total pages
        V.instance.currentPage = currentPage;
        V.instance.totalPages = V.pages.length || 1;
        // Recalculate the offset in case the append mode changed
        Scroll.calculateOffset();
        break;
      case "start":
        // Note: This start message is only called from the Popup (Accept Button)
        await Scroll.start(request.caller);
        break;
      case "stop":
        Scroll.stop(request.caller);
        break;
      case "executeWorkflow":
        Workflow.execute(request.action, request.caller, request.extra);
        break;
      case "popupOpened":
        V.instance.popupOpened = request.popupOpened;
        break;
      case "checkSave":
        response = Saves.matchesSave(request.url, request.save);
        break;
      case "checkNextPrev":
        response = Next.findLinkWithProperties(request.path, request.type, request.property, request.keywordsEnabled, request.keywords, request.keywordObject, true, [V.currentDocument, V.iframe?.contentDocument], V.pages, V.instance.url, request.highlight);
        break;
      case "checkButton":
        response = Click.findButton(request.buttonPath, request.buttonType, V.instance.documentType === "iframe" ? V.iframe?.contentDocument : document, request.highlight).details;
        break;
      case "checkPageElement":
        // Note: If we are using auto detect, we always use the live document; otherwise use the current (latest) document to reflect the most accurate results
        const pageElements_ = Elementify.getPageElements(request.autoDetected || V.instance.documentType === "top" ? document : V.instance.documentType === "iframe" ? V.iframe?.contentDocument : V.currentDocument, request.pageElementType, request.pageElementPath, true);
        const insertionPoint_ = Elementify.getInsertionPoint(pageElements_[0], true, request.pageElementType, request.insertBeforePath, true);
        const parent = insertionPoint_[0] ? insertionPoint_[0].parentNode : undefined;
        response = { found: (pageElements_[0].length > 0 && !!insertionPoint_[0] && !!parent), elementsLength: pageElements_[0].length, error: pageElements_[1].error, insertDetails: insertionPoint_[1], parentNode: parent ? parent.nodeName : ""};
        if (request.highlight && typeof HoverBox !== "undefined") {
          new HoverBox().highlightElement(parent, true);
        }
        break;
      case "autoDetectPageElement":
        // Do not use our storage items cache of path properties as it may be out of date compared to the Popup's
        // Use V.instance.pageElementType instead of items.preferredPathType in case the user has changed the type to a fixed type to generate a path using that path type
        // When returning the response, note that we can't send back the element, so just send the path and details
        const autoDetectResult = AutoDetectPageElement.detect(request.instance.pageElementType, request.algorithm, request.quote, request.optimized);
        response = {path: autoDetectResult.path, details: autoDetectResult.details};
        if (request.highlight && typeof HoverBox !== "undefined") {
          new HoverBox().highlightElement(autoDetectResult.el, true);
        }
        break;
      case "determinePathType":
        // Note: We always check the preferred path type on the first attempt, so we don't use request.type
        response = DOMPath.determinePathType(request.path, V.items.preferredPathType).type;
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
        Auto.startTimer(request.caller);
        break;
      case "stopAutoTimer":
        // Only called by the Popup when Auto is toggled off
        Auto.stopTimer(request.caller);
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
        Scroll.#command(request.action, request.caller);
        break;
      default:
        break;
    }
    sendResponse(response);
  }

  /**
   * Scroll initialization (IIFE).
   *
   * This function is this content script's entry point. It runs on every page request and determines if the
   * extension should start itself or not on this tab. It initializes the storage items and V.instance on the page.
   *
   * Note: This function only runs one time.
   *
   * @see https://stackoverflow.com/a/61203517
   * @private
   */
  static #init = (async () => {
    console.log("init()");
    // Scroll Listeners
    // Message Listener: We need to return immediately if the function will be performing asynchronous work
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "contentscript") { return; } Scroll.#messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });
    // Initialize Scroll
    // Note: Previously we had timing issues with some websites, but due to the new multiple checks for activation, we no
    // longer need to force an initial timeout due to dynamic content. Also, we have a separate timeout for calculating
    // the offset, so there is no real reason to delay initialization
    await Promisify.sleep(1);
    const tab = { id: 0, url: window.location.href };
    V.items = await Promisify.storageGet(undefined, undefined, []);
    // Change the icon to light if this tab is incognito
    Scroll.#addThemeListener();
    // Add the navigation listener relatively early before we await the next few things
    Scroll.#addNavigationListener(tab, V.items);
    // Note that this is the best time we can update the databases (not in the background). Do not await this; try and start as fast as possible, and have the updated database ready for the next page request
    Scroll.#updateDatabases(V.items);
    // const startTime = performance.now();
    V.instance = await Instance.buildInstance(tab, V.items);
    V.items = V.instance.items;
    // Delete the items cache in the V.instance (we need to do this now in case the user enters the Popup early and tries to copy their debug data)
    delete V.instance.items;
    // If the V.instance's source is still items, check a few more times in case dynamic content hasn't finished loading
    if (V.instance.via === "items" || V.instance.via === "placeholder") {
      // Here is where we may be waiting quite some time (e.g. 5 seconds)
      const temp = await Instance.buildInstance(tab, V.items, 1);
      // The V.instance may have been set by the user in the time it took to await the previous statement; only set it if it hasn't been enabled
      console.log("init() - temp.via=" + temp.via + ", enabled=" + V.instance.enabled + ", pickerEnabled=" + V.instance.pickerEnabled + ", pickerSet=" + V.instance.pickerSet);
      if (temp.via !== "items" && !V.instance.enabled && !V.instance.pickerEnabled && !V.instance.pickerSet) {
        console.log("init() - setting V.instance to temp, temp=");
        console.log(temp);
        if (V.instance.popupOpened) {
          Promisify.runtimeSendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: "init", action: "", instance: temp});
        }
        V.instance = temp;
      }
    }
    // const endTime = performance.now();
    // console.log("Call to do test took " + (endTime - startTime) + " milliseconds");
    console.log("init() - after filtering, saves.length=" + V.items.saves.length + ", databaseIS.length=" + V.items.databaseIS.length + ", databaseAP.length=" + V.items.databaseAP.length);
    console.log("init() - saves=\n" + (V.items.saves.map(x => x.url).join("\n")));
    console.log("init() - databaseIS=\n" + (V.items.databaseIS.map(x => x.url).join("\n")));
    console.log("init() - databaseAP=\n" + (V.items.databaseAP.map(x => x.url).join("\n")));
    // Delete the items cache in the V.instance
    delete V.instance.items;
    // Note: We do not want to delete the database or saves from the items cache to streamline checking them again later if this is an SPA
    console.log("init() - V.instance=");
    console.log(V.instance);
    if (V.instance.enabled) {
      await Scroll.start("init");
    }
    // If this is an SPA, watch this page.
    // Note: We don't want to enable this on every website. For example, simply entering text in https://regex101.com/ keeps firing mutation changes
    if (V.instance.spa && V.items.on && (V.instance.databaseFound ? V.items.databaseMode === "blacklist" ? !V.instance.databaseBlacklisted : V.instance.databaseWhitelisted : true)) {
      console.log("init() - watching SPA");
      // V.spaObserver = new MutationObserver(Scroll.#spaObserverCallback);
      V.spaObserver = new MutationObserver(Util.throttle(Scroll.#spaObserverCallback, 1000));
      V.spaObserver.observe(document.body, { childList: true, subtree: true });
    }
  })();

}