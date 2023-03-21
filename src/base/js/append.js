/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Append handles all business logic involving appending pages. The core function is {@link Append.execute}.
 *
 * The following are the append modes:
 * page - appends the full page's HTML, as is
 * iframe - appends the full page in an iframe
 * element - appends specific elements from the page
 * media - appends a media element, like an image, video, or audio file
 * none - does not append anything, allowing the website to append the content
 * ajax - an advanced and unique append mode that comes in two flavors: iframe and native
 *
 * TODO: Change Node.ownerDocument !== document to !document.contains(Node)?
 */
class Append {

  /**
   * Appends a new page using one of the append modes.
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  static async execute(caller) {
    console.log("Append.execute() - caller=" + caller + ", V.instance.url=" + V.instance.url + ", pages.length=" + (V.pages.length));
    // Element Iframe Trim should redirect to iframe; AJAX Native to ajax-native; all other append modes remain the same
    const mode =
      V.instance.action === "click" && V.instance.append === "element" ? "ajax-native" :
      V.instance.append === "element" && V.instance.pageElementIframe ? V.instance.pageElementIframe === "trim" ? "iframe" : "element" :
      V.instance.append === "ajax" ? V.instance.ajaxMode === "native" ? "ajax-native" : "element" :
      V.instance.append;
    switch (mode) {
      case "page":    Append.#appendDivider(); Append.#appendLoading(); await Append.#appendPage(caller);    break;
      case "iframe":  Append.#appendDivider(); Append.#appendLoading(); await Append.#appendIframe(caller);  break;
      case "element": Append.#appendDivider(); Append.#appendLoading(); await Append.#appendElement(caller); break;
      case "media":   Append.#appendDivider(); Append.#appendLoading(); await Append.#appendMedia(caller);   break;
      case "none":                                                      await Append.#appendNone(caller);    break;
      case "ajax-native":                                               await Append.#appendAjax(caller);    break;
      default:                                                                                               break;
    }
  }

  /**
   * Prepends an element based on the instance's workflow.
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  static prepend(caller) {
    console.log("prepend() - caller=" + caller);
    const mode = V.instance.workflowPrepend;
    switch (mode) {
      case "divider":
        // To prepend the divider, we need to re-calculate the insertion point first (Click Element / AJAX Native)
        V.insertionPoint = Elementify.getInsertionPoint(Elementify.getPageElements(document), false);
        Append.#appendDivider();
        break;
      default:
        // Same as divider, but called for reverse workflow to prepend the divider early
        V.insertionPoint = Elementify.getInsertionPoint(Elementify.getPageElements(document), false);
        Append.#appendDivider();
        Append.#appendLoading();
        break;
    }
  }

  /**
   * Before Infy can append pages, the first page (i.e. the existing page on the screen) should be prepared. This is so
   * we can store the initial page in the pages array and check when the user has scrolled it into view. The append mode
   * is used to determine how to prepare it. For example, in element mode, the insertion point needs to be defined.
   *
   * Note: We do not await appendFinally() because start() calls this and we don't want to delay the popup or badge.
   * The only property that is set to the V.instance is total pages, which should always be 1 to begin with.
   *
   * @param {string} caller - the caller who called this function
   * @public
   */
  static async prepareFirstPage(caller) {
    console.log("prepareFirstPage() - caller=" + caller);
    // If iframe, set to iframe or page depending on what iframePageOne is. Otherwise, do whatever the append mode is
    const mode = V.instance.append === "iframe" ? V.instance.iframePageOne ? "iframe" : "page" : V.instance.append;
    let observableElement;
    switch (mode) {
      case "page":
        // We choose the first page's element by picking the first one with a height > 0 px. We first look at the body's first-level children and then fall-back to walking through every element in the body
        // pageElements.forEach(element => fragment.appendChild(element));
        //document.querySelectorAll("body > *");
        // elements = Array.from(doc.querySelectorAll(path));
        V.pageElements = DOMNode.getElements("body > *", "selector", document).elements;
        // observableElement = Append.#getObservableElements([...document.body.querySelectorAll(":scope > *")])[0] || Append.#getObservableElements(DOMNode.getNodesByTreeWalker(document.body, NodeFilter.SHOW_ELEMENT))[0];
        observableElement = Append.#getObservableElements(V.pageElements)[0] || Append.#getObservableElements(DOMNode.getNodesByTreeWalker(document.body, NodeFilter.SHOW_ELEMENT))[0];
        if (!observableElement) {
          observableElement = document.createElement("span");
          document.body.prepend(observableElement);
        }
        // We need to append a margin-bottom similar to the PAGE_STYLE and IFRAME_STYLE to give us some breathing room when detecting the current page
        const marginBottom = document.createElement("div");
        marginBottom.style.setProperty("margin-bottom", "2rem", "important");
        document.body.appendChild(marginBottom);
        V.pageElements.push(marginBottom);
        Append.#resizeMedia("page", document.body);
        Append.#appendFinally("page", observableElement, "prepareFirstPage");
        break;
      case "iframe":
        // We are loading the first page in an iframe for maximum unbreakability!
        await Append.#appendIframe("prepareFirstPage");
        break;
      case "element":
      case "ajax":
      case "ajax-native":
        V.pageElements = Elementify.getPageElements(document);
        V.insertionPoint = Elementify.getInsertionPoint(V.pageElements, true);
        if (V.instance.debugEnabled && V.insertionPoint && V.insertionPoint.nodeType === Node.TEXT_NODE) {
          V.insertionPoint.textContent = "Infy Scroll (Debug Mode) Insertion Point";
        }
        observableElement = Append.#getObservableElements(V.pageElements)[0];
        // If no observable element, create a span and put it before the first page element. The first page element may not necessarily be the first child element of the parent, so we can't use insertionPoint.parentNode.prepend(observableElement)
        if (!observableElement && V.pageElements && V.pageElements[0]) {
          observableElement = document.createElement("span");
          DOMNode.insertBefore(observableElement, V.pageElements[0]);
        }
        // For websites where the insertion point's parent is a grid, we need to know the number of columns in order to make the page divider break
        if (V.insertionPoint?.parentElement && (V.instance.pageDivider === "element" || V.instance.pageDivider === "yes")) {
          const style = window.getComputedStyle(V.insertionPoint.parentElement);
          if (style && style.display === "grid" && style.gridTemplateColumns && style.gridTemplateColumns !== "none") {
            V.instance.pageDividerGrid = style.gridTemplateColumns.split(" ").length || 0;
          }
        }
        // Doing this in start() because we need to make sure it's also done if the user changes the append mode when this isn't called anymore
        // injectAjaxScript();
        // TODO: Commenting this out for now since not sure if it is a good idea for page 1 links to open in a new tab.
        //  Based on testing, I found it weird on some pages that it did it
        // Note: We only set the links to open in a new tab on Page 1 for Append Element/AJAX modes since they are not the entire page
        // Some websites dynamic content anchors haven't yet loaded; this is a bit hacky as we are using setTimeout()...
        // if (V.instance.linksNewTabOneEnabled) {
        //   for (let timeoutCheck = 0; timeoutCheck <= 2000; timeoutCheck += 1000) {
        //     setTimeout(() => { Append.#setLinksNewTab(pageElements); }, timeoutCheck);
        //   }
        // }
        // Append.#resizeMedia("element", document.body);
        Append.#appendFinally(mode, observableElement, "prepareFirstPage");
        // We do this after appendFinally so that page one is appended properly first before calling the action on the iframe
        // if ((caller === "prepareFirstPage" || caller === "mirrorPageAdopt") && V.instance.workflowReverse) {
        if (V.instance.workflowReverse) {
          // await Iframe.prepareIframe(true, caller);
          const result = await Iframe.prepareIframe(true, caller);
          if (result === "mirrorPageAdopt") {
            return await Append.prepareFirstPage("mirrorPageAdopt");
          }
        }
        break;
      case "media":
        const media = document.createElement("div");
        media.style = Util.processStyle(V.MEDIA_STYLE);
        document.querySelectorAll("body > *").forEach(element => media.appendChild(element));
        (document.body || document.documentElement).appendChild(media);
        Append.#resizeMedia("media", media);
        Append.#appendFinally("media", media, "prepareFirstPage");
        break;
      case "none":
        V.button = Click.findButton(V.instance.buttonPath, V.instance.buttonType, document, false).button;
        Append.#appendFinally("none", V.button, "prepareFirstPage");
        break;
    }
  }

  /**
   * Appends a message on the page in case there is an error encountered that the user should know about (e.g. iframes
   * not being supported).
   *
   * @param {string} message - the message to display
   * @param {Element} el - (optional) the element to append along with the message, e.g. an anchor
   * @public
   */
  static appendMessage(message, el) {
    console.log("appendMessage() - message=" + message);
    const div = document.createElement("div");
    div.id = V.MESSAGE_ID;
    div.style = Util.processStyle("all: initial; position: fixed; bottom: 0; left: 0; padding: 8px; z-index: 2147483647; background: white;");
    if (V.instance.scrollIcon) {
      const icon = Util.createIcon("infinity", { color: V.instance.color });
      div.appendChild(icon);
    } else {
      // By always appending a first child, we can always assume the text below is going to be overlay.children[1] when we go and later update it
      const span = document.createElement("span");
      span.textContent = chrome.i18n.getMessage("infy_scroll_message");
      div.appendChild(span);
    }
    const MESSAGE_STYLE = "vertical-align: middle; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; font-weight: bold; font-style: normal;";
    const text = document.createElement("span");
    text.style = Util.processStyle(MESSAGE_STYLE + " color: #b00020");
    text.textContent = message;
    div.appendChild(text);
    if (el) {
      el.style = Util.processStyle(MESSAGE_STYLE + " color: black; text-decoration: underline;");
      div.appendChild(el);
    }
    document.body.appendChild(div);
    setTimeout(function () {
      document.body.removeChild(div);
    }, 20000);
  }

  /**
   * Appends the next page's HTML as is to the original document's body.
   * Images and HTML may break in this mode, but it is the simplest append mode and requires no configuration.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  static async #appendPage(caller) {
    console.log("appendPage() - caller=" + caller);
    const page = document.createElement("div");
    page.id = V.PAGE_ID + (V.pages.length + 1);
    page.style = Util.processStyle(V.PAGE_STYLE);
    document.body.appendChild(page);
    const nextDocument = await Append.#getNextDocument();
    if (!nextDocument) { return; }
    const fragment = document.createDocumentFragment();
    V.pageElements = DOMNode.getElements("body > *", "selector", nextDocument).elements;
    V.pageElements.forEach(element => fragment.appendChild(DOMNode.transferNode(element, V.instance.transferNodeMode)));
    page.appendChild(fragment);
    Append.#resizeMedia("page", page);
    Util.triggerCustomEvent(V.EVENT_NODE_APPENDED, page, { url: V.instance.url }, V.instance.customEventsEnabled, V.items.browserName);
    Append.#appendFinally("page", page, caller);
    // TODO: Don't wrap the page in a div anymore. Use the code below and use DOMNode.getNodesByTreeWalker() to pick an element to be the observable page element
    // const nextDocument = await Append.#getNextDocument();
    // const fragment = document.createDocumentFragment();
    // const elements = [...nextDocument.body.querySelectorAll(":scope > *")];
    // // (Need to also push bottomMargin div to elements array like with page 1)
    // const welements = V.instance.resizeMediaEnabled ? DOMNode.getNodesByTreeWalker(nextDocument.body, NodeFilter.SHOW_ELEMENT) : [];
    // elements.forEach(element => fragment.appendChild(element));
    // document.body.appendChild(fragment);
    // let observableElement = getObservable(elements);
    // if (!observableElement) {
    //   observableElement = document.createElement("span");
    //   // document.body.insertBefore(observableElement, elements[0]);
    //   DOMNode.insertBefore(observableElement, elements[0]);
    //   elements.unshift(observableElement);
    // }
    // Append.#resizeMedia("page", document.body, welements);
    // Util.triggerCustomEvent(V.EVENT_NODE_APPENDED, page?, { url: V.instance.url }, V.instance.customEventsEnabled, V.items.browserName);
    // Append.#appendFinally("page", observableElement, caller);
  }

  /**
   * Appends the next page in an iframe to isolate complex pages and prevent HTML and images from breaking.
   * This mode runs slower than append page mode and clicking on a link in an iframe may be problematic if the domain
   * differs because the link opens in the same frame.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  static async #appendIframe(caller) {
    console.log("appendIframe() - caller=" + caller);
    const iframeMode = V.instance.append === "element" && V.instance.pageElementIframe ? V.instance.pageElementIframe === "trim" ? "trim" : "import" : "full";
    // We only create the iframe at append time in full mode; the other modes will have already created it after the last page was appended
    // The exception is if the user changes the append mode and the iframe hasn't yet been created (not a great safe guard, we need to catch this beforehand)
    if (iframeMode === "full" || !V.iframe) {
      await Iframe.createIframe(V.instance.url, V.IFRAME_STYLE, iframeMode, caller);
    }
    const iframeDocument = V.iframe.contentDocument;
    if (!iframeDocument) {
      return;
    }
    if (iframeMode === "trim") {
      V.instance.scrollIframe = false;
      // Reset the style from V.IFRAME_FIXED_STYLE
      V.iframe.style = Util.processStyle(V.IFRAME_STYLE);
      // Make sure the next link is in the iframeDocument before we clone it, waiting for the next link is a must!
      [V.pageElements] = await Promise.all([Iframe.getPageElementsFromIframe(iframeDocument), V.instance.action === "next" || V.instance.action === "prev" ? Iframe.getNextLinkFromIframe(iframeDocument) : 1]);
      // We store a clone of the iframe document after we have successfully retrieved the page elements and next link
      V.currentDocument = iframeDocument.cloneNode(true);
      // We need to cache both the pageElements (already done above) and the scripts/styles before we remove everything from the iframeDocument
      const scriptsAndStyles = iframeDocument.body.querySelectorAll("script, style");
      // Remove all elements from the iframeDocument so that we can then re-add just what we need
      // iframeDocument.body.querySelectorAll(":scope > *").forEach(element => { iframeDocument.body.removeChild(element); });
      iframeDocument.querySelectorAll("body > *").forEach(element => { if (typeof element?.remove === "function") { element.remove(); } });
      const fragment = document.createDocumentFragment();
      // TODO: Test resizeMedia() more in this mode before we calculate the welements (commented out code)
      // const welements = V.instance.resizeMediaEnabled && nextDocument && nextDocument.body ? DOMNode.getNodesByTreeWalker(nextDocument.body, NodeFilter.SHOW_ELEMENT) : [];
      // Add the scripts and styles and elements back to the iframe, note that we shouldn't have to use adoptNode() here
      scriptsAndStyles.forEach(element => fragment.appendChild(element));
      V.pageElements.forEach(element => fragment.appendChild(element));
      iframeDocument.body.appendChild(fragment);
    }
    Append.#resizeMedia("iframe", iframeDocument.body);
    // Only fix lazy loading in iframe mode if the user explicitly wants this and is using manual
    // TODO: Is it safe to even do this in Auto as well?
    // @see https://favpng.com/png_search/pokemon/ for an example of a website that needs both iframe and lazy loading
    if (V.instance.lazyLoad === "manual") {
      Append.#fixLazyLoadingPre(iframeDocument);
    }
    Append.#executeCustomScripts(iframeDocument, false);
    // Some websites dynamic content anchors haven't yet loaded; this is a bit hacky as we are using setTimeout()...
    for (let timeoutCheck = 0; timeoutCheck <= 3000; timeoutCheck += 1000) {
      setTimeout(() => { Append.#setLinksNewTab([iframeDocument]); }, timeoutCheck);
    }
    // Calculate the height only after resizing the media elements
    V.iframe.style.setProperty("height", Util.getTotalHeight(iframeDocument) + "px", "important");
    iframeDocument.documentElement?.style?.setProperty("overflow", "hidden", "important");
    iframeDocument.body?.style?.setProperty("overflow", "hidden", "important");
    // If prepareFirstPage (iframePageOne=true), we need to remove all the elements from the document body except for this iframe and the overlay and loading divs
    if (caller === "prepareFirstPage") {
      document.body.querySelectorAll(":scope > *").forEach(element => { if (element !== V.iframe && element !== V.overlay && element !== V.loading) { document.body.removeChild(element); } });
    }
    Util.triggerCustomEvent(V.EVENT_NODE_APPENDED, V.iframe, { url: V.instance.url }, V.instance.customEventsEnabled, V.items.browserName);
    Append.#appendFinally("iframe", V.iframe, caller);
  }

  /**
   * Appends specific elements for seamless scrolling. A page element path must be entered to determine which elements
   * to append.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  static async #appendElement(caller) {
    console.log("appendElement() - caller=" + caller);
    // If we are in Element Iframe Import mode, we need to use the iframe obtained in appendIframe()
    if (V.instance.pageElementIframe || V.instance.append === "ajax") {
      // If the iframe doesn't exist because the append mode was changed, create it (not a great safe guard, we need to catch this beforehand)
      if (!V.iframe) {
        console.log("appendElement() - warning: no iframe, even though this V.instance uses iframes. creating iframe...");
        await Iframe.createIframe(V.instance.url, V.IFRAME_STYLE + V.IFRAME_FIXED_STYLE, V.instance.pageElementIframe, caller);
      }
      // If it's been more than the full amount of seconds for the timeout and the iframe is no longer being scrolled, re-scroll in case the user went out of this tab's focus, causing the iframe to never be scrolled
      if (!V.instance.scrollIframe) {
        Iframe.scrollIframe();
      }
      // TODO: To be safe, should we await both promises and wait for the next link/button as well as the page elements even though it's not necessary?
      V.pageElements = await Iframe.getPageElementsFromIframe(V.iframe.contentDocument);
      V.instance.scrollIframe = false;
      // TODO: See if we can refactor this so we can place this consistently in all append modes. This is normally done in getNextDocument(), but in Element Iframe mode we aren't sure if the elements have loaded till now
      Append.#setLinksNewTab(V.pageElements);
      // We store a clone of the iframe's document after we have successfully retrieved the page elements and next link
      // Note that this isn't necessary for Element Iframe Import mode because the live iframe document will remain on the page, but is done as a precaution
      // We still want to do this so we can use the currentDocument to check the page elements in the popup
      // AJAX needs this too: If the iframe has loaded a new URL (e.g. the button click was a link or form), we need to obtain the updated iframe's document or it will stay on the previous page forever
      V.currentDocument = V.iframe.contentDocument.cloneNode(true);
    } else {
      const nextDocument = await Append.#getNextDocument();
      if (!nextDocument) { return; }
      V.pageElements = Elementify.getPageElements(nextDocument);
    }
    for (let i = 0; i < V.pageElements.length; i++) {
      V.pageElements[i] = DOMNode.transferNode(V.pageElements[i], V.instance.transferNodeMode);
    }
    const fragment = document.createDocumentFragment();
    V.pageElements.forEach(element => fragment.appendChild(element));
    // The insertion point may have been "moved" by the website and no longer have a parentNode, so we re-calculate it to be the last element
    if (!V.insertionPoint || !V.insertionPoint.parentNode || V.insertionPoint.ownerDocument !== document) {
      console.log("appendElement() - the insertion point's hierarchy in the DOM was altered. " + (V.insertionPoint ? ("parentNode=" + V.insertionPoint.parentNode + ", ownerDocument === document=" + (V.insertionPoint.ownerDocument === document)) : "insertionPoint is undefined!"));
      V.insertionPoint = Elementify.getInsertionPoint(Elementify.getPageElements(document), false);
    }
    DOMNode.insertBefore(fragment, V.insertionPoint);
    // pageElements.forEach(el =>  console.log("adoptNode() - after insertion, ownerDocument === document=" + (el.ownerDocument === document)));
    // We need to now trigger the AP CustomEvent for each of the newly appended nodes from the fragment. This is for external scripts that may be listening for them
    V.pageElements.forEach(element => Util.triggerCustomEvent(V.EVENT_NODE_APPENDED, element, { url: V.instance.url, parentNode: V.insertionPoint.parentNode }, V.instance.customEventsEnabled, V.items.browserName));
    // Calculate the observable element now after the elements are appended (inserted before) so their heights are now accessible
    let observableElement = Append.#getObservableElements(V.pageElements)[0];
    if (!observableElement) {
      console.log("appendElement() - no observable element found, manually creating a span");
      observableElement = document.createElement("span");
      DOMNode.insertBefore(observableElement, V.insertionPoint);
      V.pageElements.unshift(observableElement);
    }
    // We must calculate the insertion point now before this function is called again and we get the next document
    V.insertionPoint = Elementify.getInsertionPoint(V.pageElements, false);
    // Append.#resizeMedia("element", undefined, welements);
    Append.#appendFinally("element", observableElement, caller);
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
  static async #appendMedia(caller) {
    console.log("appendMedia() - mediaType=" + V.instance.mediaType);
    const media = document.createElement("div");
    media.style = Util.processStyle(V.MEDIA_STYLE);
    document.body.appendChild(media);
    switch (V.instance.mediaType) {
      case "image":
        const img = document.createElement("img");
        img.src = V.instance.url;
        media.appendChild(img);
        break;
      case "video":
      case "audio":
        // Note: Both Chrome and Firefox actually use the video element when creating audio files, not the audio element!
        const video = document.createElement("video");
        video.setAttribute("name", "media");
        video.controls = "controls";
        const source = document.createElement("source");
        source.src = V.instance.url;
        // Note that we intentionally leave out setting source.type to a hard-coded value (e.g. "video/mp4" or "audio/mpeg"); it works well enough without one...
        video.appendChild(source);
        media.appendChild(video);
        break;
      default:
        break;
    }
    Append.#resizeMedia("media", media);
    Util.triggerCustomEvent(V.EVENT_NODE_APPENDED, media, { url: V.instance.url }, V.instance.customEventsEnabled, V.items.browserName);
    Append.#appendFinally("media", media, caller);
  }

  /**
   * This append mode does not append anything. This is for actions like Click Button. The action executes (e.g.
   * clicking a "Load More" button) and it is expected that the website itself appends any additional content.
   *
   * @param {string} caller - the caller who called this function
   * @private
   */
  static async #appendNone(caller) {
    console.log("appendNone()");
    V.button = Click.findButton(V.instance.buttonPath, V.instance.buttonType, document, false).button;
    Append.#appendFinally("none", V.button, caller);
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
  static async #appendAjax(caller) {
    console.log("appendAjax()");
    // // Wait one more second to ensure the elements are on the page? We already wait a second in Action after the button is clicked
    // await Promisify.sleep(1000);
    // We need to calculate the newly appended page's page elements after the button click by subtracting the past page elements from the total page elements
    // Important: We always re-calculate the insertion point at this point after the button was clicked and the elements have been presumably appended
    V.pageElements = Elementify.getFilteredPageElements(V.pages, [V.divider, V.bottom]);
    V.insertionPoint = Elementify.getInsertionPoint(V.pageElements, false);
    let observableElement = Append.#getObservableElements(V.pageElements)[0];
    if (!observableElement) {
      console.log("appendAjax() - no observable element found, manually creating a span");
      observableElement = document.createElement("span");
      DOMNode.insertBefore(observableElement, V.insertionPoint);
      V.pageElements.unshift(observableElement);
    }
    // Update page divider link we prepended (this was done before we performed the action and got the V.instance.url for the page)
    if (V.divider && typeof V.divider.querySelector === "function") {
      const a = V.divider.querySelector("a");
      if (a) {
        a.href = V.instance.url;
      }
    }
    // The newly added pageElements from the button click may not be on the page yet so we use a timeout to set them in the future
    // MutationObserver is not reliable enough because it can get called every second on some pages (e.g. sr.com)
    for (let i = 1; i <= 3; i++) {
      setTimeout(() => {
        console.log("appendAjax() - setTimeout(), i=" + i);
        // TODO: Should we do this to be safe in case the page elements haven't been appended yet?
        V.pageElements = Elementify.getFilteredPageElements(V.pages.slice(0, -1), [V.divider, V.bottom]);
        V.insertionPoint = Elementify.getInsertionPoint(V.pageElements, false);
        Append.#setLinksNewTab(V.pageElements);
        Append.appendBottom();
        // Click Button + Element also uses this append mode so we need this if
        if (V.instance.append === "ajax") {
          Util.triggerCustomEvent(V.EVENT_AJAX, document, {
            "disableRemoveElementPath": V.instance.disableRemoveElementPath || DOMPath.generatePath(V.insertionPoint.parentNode, V.instance.pageElementType).path,
            "disableRemoveFunctions": V.instance.disableRemoveFunctions || "remove,removeChild",
            "pathType": V.instance.pageElementType
          }, true, V.items.browserName);
        }
      }, 1000 * i);
    }
    // Remember: V.instance.append can either be element or ajax as both use this function
    Append.#appendFinally(V.instance.append, observableElement, caller);
  }

  /**
   * Performs all the finalization work for all append modes after the next page has been appended.
   *
   * @param {string} mode - the append mode (e.g. "page", "iframe") [why is this needed in place of V.instance.append?]
   * @param {Element} observableElement - the observable element to be stored in the pages array
   * @param {string} caller - the caller who called this function
   * @private
   */
  static #appendFinally(mode, observableElement, caller) {
    console.log("appendFinally() - mode=" + mode + ", observableElement=" + observableElement + ", caller=" + caller);
    // Always hide the loading icon no matter what
    if (V.instance.scrollLoading) {
      if (V.loading) {
        setTimeout(() => { V.loading?.style?.setProperty("display", "none", "important"); }, V.instance.append === "media" ? 500 : 0);
      }
      // We replace the currently animated infinity icon with a static icon
      if (V.divider) {
        V.divider.querySelector("." + V.DIVIDER_INFINITY_ICON_CLASS)?.replaceWith(Util.createIcon("infinity", { color: V.instance.color }));
      }
    }
    // If no el (e.g. we couldn't find the next page), we need to revert back. For append none, just ignore this if the button is null? workflowPrepend may not have it either
    if (!observableElement && mode !== "none" && !V.instance.workflowPrepend) {
      console.log("appendFinally() - no el, so removing last divider");
      if (V.divider && typeof V.divider.remove === "function") {
        V.divider.remove();
      }
      // TODO: Should we stop at this point?
      // V.instance.isLoading = false;
      // stop();
      return;
    }
    // Fix Lazy Loading Post
    Append.#fixLazyLoadingPost();
    // Execute Custom Scripts at this point on the root document if we need to (always *after* we append the page's scripts)
    Append.#executeCustomScripts(document, true);
    // Iframe Resizer
    Iframe.resizeIframe(observableElement);
    // Delete older pages' iframes only if they were appended via the Element Iframe (Import) mode
    // Actually, don't do this because certain sites (p) will not load the images even after they've been imported into the document.
    // This is notably the case when using Auto or when using the down shortcut to go down a page quickly
    if (!V.instance.autoEnabled) {
      for (let i = 0; i < V.pages.length - 1; i++) {
        const page = V.pages[i];
        if (page.iframe && page.mode === "import" && typeof page.iframe.remove === "function") {
          page.iframe.remove();
        }
      }
    }
    // Create the new page object that we'll store in the pages array
    // Each page's element is the part of the page we are observing. Make sure to check that the divider was appended into the document (Bing Search, for example, removes it if it isn't a li)
    // We'll still also store the element in another property called "el" (need to give this a better name) just in case we need it and we are using the divider as the page.element
    const page = {
      "number": V.pages.length + 1,
      "url": V.instance.url,
      "title": V.currentDocument?.title,
      "element": typeof V.divider?.scrollIntoView === "function" && document?.contains(V.divider) ? V.divider : typeof observableElement?.scrollIntoView === "function" ? observableElement : undefined,
      "observableElement": observableElement,
      "divider": V.divider,
      "append": V.instance.append,
      "mode": V.instance.pageElementIframe,
      // "ajaxMode": V.instance.ajaxMode,
      "active": true
      //, "bottomElements": [observableElement]
      //, "isIntersecting": true
    };
    // Store a reference to the current iframe and pageElements for this page in case we need to remove them
    if (V.iframe) {
      page.iframe = V.iframe;
    }
    if (V.pageElements) {
      page.pageElements = V.pageElements;
      // We only detect the bottomElements on page 1
      // if (pages.length === 0) {
      // }
      // const multiplePageElements = pageElements.length === 1 && pageElements[0]?.children && pageElements[0].children.length > 1 ? [...pageElements[0].children] : pageElements;
      // const observableMultiplePageElements = [...new Set(Append.#getObservableElements(multiplePageElements.reverse()))];
      // // page.bottomElements = observableMultiplePageElements.slice(Math.max(observableMultiplePageElements.length - 5, 0));
      // page.bottomElements = observableMultiplePageElements.slice(0, 1);
      // console.log("multiplePageElements, observableMultiplePageElements, page.bottomElements=");
      // console.log(multiplePageElements);
      // console.log(observableMultiplePageElements);
      // console.log(page.bottomElements);
    }
    // We need to reset the divider to know which loading style to use (hybrid or fixed) for the next page in case the user changes the append mode, e.g. going from element (divider) to page (no divider)
    V.divider = undefined;
    // If there are already pages and we're calling prepareFirstPage again (e.g. Popup and user is clicking ACCEPT again, don't store this page)
    if (!(V.pages && V.pages.length > 0 && caller === "prepareFirstPage")) {
      // Investigate pages.unshift() so that newer pages are first for better performance?
      // ^ No, because we always want to iterate the pages in insertion order to prioritize earlier pages when setting current page (e.g. if multiple pages are visible in the viewport)
      V.pages.push(page);
    }
    V.instance.totalPages = V.pages.length;
    // Remove the pages after we've appended the latest page. This works better than trying to do the remove before the append. Also no benefit to adding a timeout
    Append.#removePages();
    // We observe the new page element and any other page elements (bottomElements)
    // if (caller === "prepareFirstPage" && V.instance.scrollDetection === "io") {
    //   Append.#appendDivider("hidden");
    // }
    // We always unobserve the old bottom before observing the new bottom, because we only need to observe one bottom
    // bottomObserver?.unobserve(bottom);
    // bottom = page.bottomElements[0];
    if (V.intersectionObserver) {
      if (caller !== "prepareFirstPage") {
        Append.appendBottom();
      }
      try {
        V.intersectionObserver.observe(page.element);
        // Should we keep observing the bottom element just in case we had to create a new one?
        V.bottomObserver?.observe(V.bottom);
      } catch (e) {
        console.log(e);
      }
      // for (const bottomElement of page.bottomElements) {
      //   intersectionObserver.observe(bottomElement);
      // }
      // Append.#appendDivider(bottom, "bottom");
      // if (!bottom) {
      //
      // }
      // bottomObserver?.observe(bottom);
    }
    // Scroll into view only if shortcut commands, popup, script, or auto slideshow
    if (page && page.element && (caller === "command" || caller === "popupClickActionButton" || caller === "scrollClickActionButton" || (caller === "auto" && V.instance.autoSlideshow))) {
      page.element.scrollIntoView({behavior: V.instance.scrollBehavior, block: "start", inline: "start"});
    }
    // TODO: Trigger this event for all append modes?
    // We need to now trigger the AP CustomEvent that the next page has fully loaded. This is for external scripts that may be listening for them
    // Note: This is after all the nodes have been appended; we don't provide an event for the currentDocument, always just the root document
    if (caller !== "prepareFirstPage") {
      Util.triggerCustomEvent(V.EVENT_PAGE_APPENDED, document, {}, V.instance.customEventsEnabled, V.items.browserName);
    }
    // Calculate the offset. This is in appendFinally so it can be used after prepareFirstPage and then after every append
    // When calculating the offset, perhaps introducing a delay to "fully" wait for the page to load may be a good idea?
    // Note: We only do this on prepare first page or after every append in regular append element mode (not element iframe or ajax due to dynamic content)
    if (caller === "prepareFirstPage" || (V.instance.append === "element" && !V.instance.pageElementIframe)) {
      setTimeout(() => {
        // We don't need to use the button position to calculate the offset even in ajax mode?
        Scroll.calculateOffset();
      }, 1000);
    }
    // Always push the loading div to the bottom of the body (not needed, just for "neatness" and easier debugging when viewing the HTML in DevTools)
    if (V.loading && V.instance.scrollLoading) {
      document?.body?.appendChild(V.loading);
    }
    // My Stats
    if (V.items.statsEnabled) {
      try {
        Promisify.storageGet("stats").then(result => {
          const actionsIndex = V.instance.action === "next" ? 0 : V.instance.action === "increment" ? 1 : V.instance.action === "click" ? 2 : V.instance.action === "list" ? 3 : 0;
          const appendsIndex = V.instance.append === "element" ? 2 : V.instance.append === "ajax" ? 5 : V.instance.append === "page" ? 0 : V.instance.append === "iframe" ? 1 : V.instance.append === "media" ? 3 : V.instance.append === "none" ? 4 : 0;
          result.actions[actionsIndex] += 1;
          result.appends[appendsIndex] += 1;
          // Elements is debatable; we count Page/Iframe/Media/None as just 1 element and for Element/AJAX we use the page elements length
          result.elements[appendsIndex] += ["element", "ajax"].includes(V.instance.append) ? V.pageElements?.length || 1 : 1;
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
   * Displays the loading element while the next page is loading. This is the loading element that is fixed in the
   * corner; it is only needed if there is no divider being appended, as the divider icon becomes the loading element
   * in those cases.
   *
   * @private
   */
  static #appendLoading() {
    console.log("appendLoading() - scrollLoading=" + V.instance.scrollLoading);
    try {
      if (V.instance.scrollLoading && (!V.instance.scrollIcon || !V.divider)) {
        V.loading.style.setProperty("display", "block", "important");
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
   * @public
   */
  static appendBottom() {
    // console.log("appendDivider() - V.instance.pageDivider=" + V.instance.pageDivider);
    try {
      // What about none?
      if (V.instance.scrollDetection === "io" && V.instance.append !== "none") {
        if (!V.bottom) {
          let style = "visibility: hidden; clear: both; float: none; height: 1px; margin: 0; padding: 0; auto; position: static; width: auto; z-index: auto; ";
          let tag = "div";
          let tag2 = "div";
          // The divider tag is dependant on what the page element parent is (e.g. div, ul, table)
          if (V.insertionPoint?.parentNode?.nodeName && (V.instance.append === "element" || V.instance.append === "ajax")) {
            const nodeName = V.insertionPoint.parentNode.nodeName.toUpperCase();
            switch(nodeName) {
              case "DL":                  tag = "dt"; tag2 = "dd"; break;
              case "OL":    case "UL":    tag = "li";              break;
              case "TABLE": case "TBODY": tag = "tr"; tag2 = "td"; break;
              case "THEAD":               tag = "tr"; tag2 = "th"; break;
            }
            // Bing Search removes the li divider in its ol parent, so we use a p instead. This is a bit hacky...
            if (V.instance.isBingSearchURL && tag === "li") {
              tag = "p";
            }
          }
          console.log("appendBottom() - creating bottom tag=" + tag + ", bottom.container tag=" + tag2);
          // If this is a table row, must calculate colspan before we re-create the divider
          const colSpan = tag === "tr" ? Append.#calculateColSpan() : undefined;
          V.bottom = document.createElement(tag);
          // Note: Do not apply a className to the divider. Some websites, like Bing Search, remove the divider due to having a className
          // TODO: Still need to fix the divider issue with Bing Search, as it still sometimes happens
          V.bottom.id = V.BOTTOM_ID;
          // bottom.classList.add(V.DIVIDER_CLASS);
          // Divider style only adds border-top and padding/margin if not a table row (tr)
          V.bottom.style = Util.processStyle(style + (V.instance.pageDividerGrid > 0 ? "grid-column-start: 1; grid-column-end: none; " : "") + (tag !== "tr" ? " " + V.instance.color + "; padding: 0 0 0 0; margin: 0 auto; width: 100%;" + (tag === "div" ? " display: block;" : tag === "li" ? "list-style: none;" : "") : ""));
          const container = document.createElement(tag2);
          container.style = Util.processStyle(style + (tag2 === "div" ? "display: block;" : ""));
          if (colSpan) {
            container.colSpan = colSpan;
          }
          V.bottom.appendChild(container);
          // If the divider's parent element is a grid, we need to adjust it just once by subtracting one from it
          // if (!V.instance.pageDividerGridParentModified && V.instance.pageDividerGrid > 0 && insertionPoint && insertionPoint.parentElement) {
          if (V.instance.pageDividerGrid > 0 && V.insertionPoint && V.insertionPoint.parentElement) {
            const array = window.getComputedStyle(V.insertionPoint.parentElement).gridTemplateColumns.split(" ");
            array.pop();
            if (array.length > 1) {
              V.insertionPoint.parentElement.style.setProperty("grid-template-columns", array.join(" "), "important");
            }
            // For complex sites, sometimes the grid is being appended multiple times and we need to keep modifying it so we can't just do it once as this boolean will restrict it to:
            // V.instance.pageDividerGridParentModified = true;
          }
        }
        // Divider needs to be appended differently depending on the append mode. If element/ajax, use insertionPoint otherwise just append to the end of the document (page and iframe)
        if (V.instance.append === "element" || V.instance.append === "ajax") {
          // If we are in Element Iframe (Trim), we need to put the divider right before the iframe instead of using the insertion point because it was appended early
          // const point = V.instance.append === "element" && V.instance.pageElementIframe === "trim" && iframe ? iframe : insertionPoint;
          // Note: When repositioning the bottom, we don't have to worry about Element Iframe (Trim) and can just always use the insertionPoint as the reference point instead of the iframe
          DOMNode.insertBefore(V.bottom, V.insertionPoint);
        } else {
          document.body.appendChild(V.bottom);
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
  static #appendDivider() {
    // console.log("appendDivider() - V.instance.pageDivider=" + V.instance.pageDivider);
    try {
      // We already appended the divider when the caller was prepend in workflow, so we don't append it when the caller is undefined in append()
      // Could also add the following to the if: && caller !== "prepend" && V.instance.workflowReverse
      if (V.divider && V.divider.id.endsWith(String(V.instance.pages.length + 1))) {
        console.log("appendDivider() - already appended this page number divider! " + (V.instance.pages.length + 1));
        return;
      }
      if (V.instance.pageDivider === "yes" || (V.instance.pageDivider === "element" && (V.instance.append === "element" || V.instance.append === "ajax"))) {
        // The divider elements' style omits display intentionally because this is variable depending on tag and tag2
        // TODO: Add a default display to tag and tag2 when not div
        const align = V.instance.pageDividerAlign === "left" ? "left" : V.instance.pageDividerAlign === "right" ? "right" : "center";
        // TODO: Add "direction: ltr;" to style to take into account rtl languages like Arabic, which make the infinity icon come after the Page #. A little worried this may screw things up on the other parts of the page
        let style = "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; float: none; height: auto; margin: 0 auto; position: static; text-align: " + align + "; visibility: visible; width: auto; z-index: auto; ";
        // Before we added the Page Divider Align Option, it was: const style = "visibility: visible; float: none; clear: both; text-align: center; margin: 0 auto; ";
        let tag = "div";
        let tag2 = "div";
        // The divider tag is dependant on what the page element parent is (e.g. div, ul, table)
        if (V.insertionPoint?.parentNode?.nodeName && (V.instance.append === "element" || V.instance.append === "ajax")) {
          const nodeName = V.insertionPoint.parentNode.nodeName.toUpperCase();
          switch(nodeName) {
            case "DL":                  tag = "dt"; tag2 = "dd"; break;
            case "OL":    case "UL":    tag = "li";              break;
            case "TABLE": case "TBODY": tag = "tr"; tag2 = "td"; break;
            case "THEAD":               tag = "tr"; tag2 = "th"; break;
          }
          // Bing Search removes the li divider in its ol parent, so we use a p instead. This is a bit hacky...
          if (V.instance.isBingSearchURL && tag === "li") {
            tag = "p";
          }
        }
        console.log("appendDivider() - divider tag=" + tag + ", divider.container tag=" + tag2);
        // If this is a table row, must calculate colspan before we re-create the divider
        const colSpan = tag === "tr" ? Append.#calculateColSpan() : undefined;
        V.divider = document.createElement(tag);
        // Note: Do not apply a className to the divider. Some websites, like Bing Search, remove the divider due to having a className
        // TODO: Still need to fix the divider issue with Bing Search, as it still sometimes happens
        V.divider.id = V.DIVIDER_ID + (V.pages.length + 1);
        V.divider.classList.add(V.DIVIDER_CLASS);
        // Divider style only adds border-top and padding/margin if not a table row (tr)
        V.divider.style = Util.processStyle(style + (V.instance.pageDividerGrid > 0 ? "grid-column-start: 1; grid-column-end: none; " : "") + (tag !== "tr" ? "border-top: 1px solid " + V.instance.color + "; padding: 4px 0 0 0; margin: 1rem auto; width: 100%;" + (tag === "div" ? " display: block;" : tag === "li" ? "list-style: none;" : "") : ""));
        const container = document.createElement(tag2);
        container.style = Util.processStyle(style + (tag2 === "div" ? "display: block;" : ""));
        if (colSpan) {
          container.colSpan = colSpan;
        }
        const anchor = document.createElement("a");
        anchor.href = V.instance.url;
        // Also make the page divider follow the same behavior as page links based on the EXTRA option
        if (V.instance.linksNewTabEnabled) {
          anchor.target = "_blank";
        }
        anchor.style = Util.processStyle(style + "display: inline; text-decoration: none; color:" + V.instance.color + ";");
        if (V.instance.scrollIcon) {
          const icon = Util.createIcon("infinity", { color: V.instance.color, animated: V.instance.scrollLoading });
          icon.setAttribute("class", V.DIVIDER_INFINITY_ICON_CLASS);
          anchor.appendChild(icon);
        }
        const text = document.createElement("span");
        text.style = Util.processStyle(style + "color:" + V.instance.color + "; display: inline; font-weight: bold; font-style: normal; font-family: 'Roboto', Arial, sans-serif; font-size: 16px; line-height: initial; letter-spacing: initial; vertical-align: middle; user-select: none;");
        text.textContent = chrome.i18n.getMessage("page_label") + " " + (V.pages.length + 1);
        anchor.appendChild(text);
        // Need to cache the current pages length right now to be used later for the divider buttons' listeners
        const currentPagesLength = V.pages.length;
        if (V.instance.pageDividerButtons) {
          const icon2 = Util.createIcon("angles-up", { color: V.instance.color });
          container.appendChild(icon2);
          icon2.addEventListener("click", () => { Workflow.execute("up", "scrollClickActionButton", {page: 1}); });
          const icon = Util.createIcon("angle-up", { color: V.instance.color });
          container.appendChild(icon);
          icon.addEventListener("click", () => { Workflow.execute("up", "scrollClickActionButton", {page: currentPagesLength}); });
        }
        container.appendChild(anchor);
        if (V.instance.pageDividerButtons) {
          const icon = Util.createIcon("angle-down", { color: V.instance.color });
          container.appendChild(icon);
          icon.addEventListener("click", () => { Workflow.execute("down", "scrollClickActionButton", {page: currentPagesLength + 2});});
          const icon2 = Util.createIcon("angles-down", { color: V.instance.color });
          container.appendChild(icon2);
          icon2.addEventListener("click", () => { Workflow.execute("down", "scrollClickActionButton", {page: V.pages.length});});
        }
        V.divider.appendChild(container);
        // If the divider's parent element is a grid, we need to adjust it just once by subtracting one from it
        // if (!V.instance.pageDividerGridParentModified && V.instance.pageDividerGrid > 0 && insertionPoint && insertionPoint.parentElement) {
        if (V.instance.pageDividerGrid > 0 && V.insertionPoint && V.insertionPoint.parentElement) {
          const array = window.getComputedStyle(V.insertionPoint.parentElement).gridTemplateColumns.split(" ");
          array.pop();
          if (array.length > 1) {
            V.insertionPoint.parentElement.style.setProperty("grid-template-columns", array.join(" "), "important");
          }
          // For complex sites, sometimes the grid is being appended multiple times and we need to keep modifying it so we can't just do it once as this boolean will restrict it to:
          // V.instance.pageDividerGridParentModified = true;
        }
        // Divider needs to be appended differently depending on the append mode. If element/ajax, use insertionPoint otherwise just append to the end of the document (page and iframe)
        if (V.instance.append === "element" || V.instance.append === "ajax") {
          // If we are in Element Iframe (Trim), we need to put the divider right before the iframe instead of using the insertion point because it was appended early
          // Note the bottom || insertionPoint so that we always insert the divider before the bottom (if it exists) to avoid a small "jump"
          const point = V.instance.append === "element" && V.instance.pageElementIframe === "trim" && V.iframe ? V.iframe : V.bottom || V.insertionPoint;
          DOMNode.insertBefore(V.divider, point);
        } else {
          document.body.appendChild(V.divider);
        }
      } else {
        // If the append mode changed and we are no longer appending a divider, we need this else to know to change the point to the element
        V.divider = undefined;
      }
    } catch (e) {
      console.log("appendDivider() - Error:");
      console.log(e);
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
  static async #getNextDocument() {
    console.log("getNextDocument()");
    let nextDocument;
    try {
      const result = await Requestify.request(V.instance.url, V.instance.documentCharacterSet, V.instance.documentContentType, "GET", V.instance.requestAPI, true);
      // Save the request API that was successfully used for the next time we need to make another request
      V.instance.requestAPI = result.api;
      nextDocument = result.doc;
    } catch (e) {
      console.log("getNextDocument() - error fetching next document, giving up. Error:");
      console.log(e);
      Append.appendMessage(chrome.i18n.getMessage("oops_error") + " " + chrome.i18n.getMessage("next_document_error") + " " + e);
      Append.#appendFinally(V.instance.append, undefined, "getNextDocument()");
      // TODO: Should we reset isLoading and keep trying?
      // V.instance.isLoading = false;
      return nextDocument;
    }
    try {
      V.currentDocument = nextDocument.cloneNode(true);
      // Fix Lazy Loading (first), then Execute scripts (second) before modifying the nextDocument
      // Note: We do not have a way to give the user the nextDocument here (e.g. via a Custom Event) as it would be asynchronous to have to wait to get the document back from them
      Append.#fixLazyLoadingPre(nextDocument);
      Append.#executeCustomScripts(nextDocument, false);
      Append.#setLinksNewTab([nextDocument]);
      // Remove all scripts and styles so they aren't appended. We can append them later if needed with the cloned document
      // Note: We do not remove the noscript tags on Database URLs. For some reason they're needed on some Database URLs. See: https://girlydrop.com/letter/page/2
      // Note: We do not remove the style tags on Database URLs. For some reason they're needed on some Database URLs. See https://photodune.net/search?sort=sales#content
      // Not sure about the link tag...
      // TODO: In Manifest v3, we may need to adjust this
      nextDocument.body.querySelectorAll("script" + (V.instance.append === "element" && V.instance.databaseFound ? "" : ", style, link, noscript")).forEach(element => { if (element && element.parentNode) { element.parentNode.removeChild(element); } });
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
  static #executeCustomScripts(nextDocument, checkRootDocument) {
    console.log("executeCustomScripts()");
    // If this V.instance has a custom script, execute it at this point on the next document's elements (note this must come before we remove disallowed elements like scripts and styles)
    try {
      // Opening this up for all append modes now TODO: Should we only restrict this to everything except none and media? (definitely need it for ajax)
      // if (V.instance.script >= 0 && Scripts[V.instance.script] && (V.instance.append === "page" || V.instance.append === "iframe" || V.instance.append === "element")) {
      // if (V.instance.script >= 0 && Scripts[V.instance.script] && Scripts[V.instance.script].rootDocument) {
      if (V.instance.script >= 0 && Scripts[V.instance.script] && (checkRootDocument ? Scripts[V.instance.script].rootDocument : true)) {
        console.log("executeCustomScripts() - executing a custom script, script url:" + Scripts[V.instance.script].url);
        Scripts[V.instance.script].fn(nextDocument);
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
  static #fixLazyLoadingPre(nextDocument) {
    console.log("fixLazyLoadingPre() - lazyLoad=" + V.instance.lazyLoad);
    try {
      V.lazys = new Map();
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
      if (V.instance.lazyLoad) {
        if (V.instance.lazyLoad === "manual") {
          // Manual:
          // Get all elements that have the attribute source. Don't restrict on destination, just in case they didn't actually put it in the markup (e.g. imgs without src attributes defined in the HTML)
          const lazyManuals = nextDocument.querySelectorAll("[" + V.instance.lazyLoadSource + "]");
          // Cache this value as we will be checking it when iterating every lazy element
          const styleBackgroundImage = V.instance.lazyLoadDestination === "style.background-image";
          console.log("fixLazyLoadingPre() - lazyManuals.length=" + lazyManuals.length);
          for (const lazyManual of lazyManuals) {
            // style.background-image exception requires the url() css function see https://developer.mozilla.org/docs/Web/CSS/url()
            if (styleBackgroundImage) {
              lazyManual.style.backgroundImage = "url(" + lazyManual.getAttribute(V.instance.lazyLoadSource) + ")";
            } else {
              lazyManual.setAttribute(V.instance.lazyLoadDestination, lazyManual.getAttribute(V.instance.lazyLoadSource));
            }
            // Remove the lazyAttributes in case there is CSS on the page tied to them. Especially srcset
            for (const lazyAttribute of lazyImageAttributes.concat(lazyImageAttributeRemovals).concat([V.instance.lazyLoadSource])) {
              lazyManual.removeAttribute(lazyAttribute);
            }
            V.lazys.set(lazyManual, V.instance.lazyLoadSource);
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
                V.lazys.set(lazyImage, loadAttribute.name);
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
  static #fixLazyLoadingPost() {
    console.log("fixLazyLoadingPost()");
    try {
      if (V.lazys && V.lazys.size > 0 && V.instance.lazyLoad) {
        console.log("fixLazyLoadingPost() - lazys.size=" + V.lazys.size);
        // lazys.forEach((attribute, lazy) => {
        for (const [attribute, lazy] of V.lazys) {
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
   * Calculates the colSpan of the table (page element parent). This is only used for the divider in Append Element mode
   * when the divider needs to be a table row (in other words, the page element parent is a table or tbody).
   *
   * @returns {number} the colSpan of the table (page element parent)
   * @private
   */
  static #calculateColSpan() {
    console.log("calculateColSpan()");
    let colSpan;
    try {
      // If we already have a divider with the container child's colspan, we don't need to calculate the colspan again
      if (V.divider?.children[0]?.colSpan > 0) {
        console.log("calculateColSpan() - colSpan already calculated, using prior divider's colSpan");
        colSpan = V.divider.children[0].colSpan;
      } else {
        // Else we need to calculate it by looking at each row using the number of cells and their colspan (using the max colSpan found for each row)
        console.log("calculateColSpan() - calculating colSpan for the first time using the table's rows...");
        // TODO: colspan can sometimes be 0 (nonstandard in HTML 5) so change to: cell.colspan || 1?
        colSpan = Math.max(...[...V.insertionPoint.parentNode.rows].map(row => [...row.cells].map(cell => cell.colSpan).reduce(function (a,b) { return a + b }, 0)));
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

  // /**
  //  * Some websites have problematic styling applied to them, such as a height set to 100% with overflow set to auto.
  //  * This causes issues with detecting their scroll position when more content gets appended to the DOM. This function
  //  * will reset the styling to allow infinite scrolling to work on these sites.
  //  *
  //  * TODO: This unfortunately causes issues on some websites, notably sites with the Click Button Action, so commenting it all out for now.
  //  *
  //  * @private
  //  */
  // static #resetStyling() {
  //   console.log("resetStyling()");
  //   // TODO: This is experimental. Test this more with append element mode...
  //   if (V.instance.databaseFound && V.instance.append === "element") {
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
  static #setLinksNewTab(els = [document]) {
    console.log("setLinksNewTab() - V.instance.linksNewTabEnabled=" + V.instance.linksNewTabEnabled);
    try {
      if (V.instance.linksNewTabEnabled) {
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
   * relying on V.instance.totalPages.
   *
   * @private
   */
  static #removePages() {
    // We don't want to remove pages while AUTO is enabled as the user will have set their own times value manually
    if (V.instance.maximumPages > 0 && !V.instance.autoEnabled && !["none"].includes(V.instance.append)) {
      // Get all the page elements so we can check which ones are currently in view
      let allElements = [];
      for (const page of V.pages) {
        if (Array.isArray(page?.pageElements)) {
          allElements = allElements.concat(page.pageElements);
        }
      }
      // console.log("removePages() - allPageElements=");
      // console.log(allPageElements);
      for (let i = 0; i < V.pages.length - V.instance.maximumPages; i++) {
        const page = V.pages[i];
        // if (V.instance.currentPage <= page.number) {
        //   continue;
        // }
        // We do not want to remove the page if any of its elements are still on the screen
        // Note: we don't look at page.iframe in case we're in AJAX Iframe mode; regular iframe appends will have observableElement be the iframe)
        // Note 2: In Element Iframe (Trim) mode, we don't look at the page elements because scrolledIntoView always seems to return true for them (due to being in an iframe)
        const elements = (page.append === "element" && page.mode === "trim" ? [] : page.pageElements || []).concat([page.element, page.observableElement, page.divider]).filter(e => e?.nodeType === Node.ELEMENT_NODE && typeof e.remove === "function");
        const isInView = elements.some(element => Scroll.isScrolledIntoView(element));
        console.log("removePages() - isInView=" + isInView + ", elements=");
        console.log(elements);
        if (!isInView) {
          if (V.instance.append === "element") {
            // In order to calculate the height of what we're removing, we calculate the top-most and bottom-most position of the elements and take the difference
            // Note that getBoundingClientRect includes the padding and border, but does not include the margin, so we include them in our overall height calculation
            // const top = Math.min(...(elements.map(e => { const style = window.getComputedStyle(e); return DOMNode.getElementPosition(e).top - parseFloat(style.marginTop); } )));
            // const bottom = Math.max(...(elements.map(e => { const style = window.getComputedStyle(e); return DOMNode.getElementPosition(e).bottom + parseFloat(style.marginBottom); } )));
            // const height = bottom - top;
            const visibleElements = allElements.filter(e => Scroll.isScrolledIntoView(e));
            const beforeTotalHeight = Util.getTotalHeight(document);
            // Delete the elements and unobserve them
            for (const element of elements) {
              if (V.intersectionObserver) {
                V.intersectionObserver.unobserve(element);
              }
              element.remove();
            }
            const height = beforeTotalHeight - Util.getTotalHeight(document);
            // Delete the page properties to remove the references to the elements and free up memory (don't think we need number, url, or title either)
            // Object.keys(page).filter(e => !["number", "url", "title"].includes(e))).forEach(key => delete page[key]);
            Object.keys(page).forEach(key => delete page[key]);
            console.log("removePages() - height=" + height + ", scrollY=" + window.scrollY + ", scrollY - height=" + (window.scrollY - height) + ", totalHeight=" + Util.getTotalHeight(document) + ", window.scrollY - height > 0 ?=" + ((window.scrollY - height) > 0));
            // Note: Most websites do not need the scroll position adjusted (S)
            // We only adjust the scroll position on sites that have a low window.scrollY, which causes a negative so we don't adjust it on those sites (D/G)
            // Adjust the scrollbar y position to take into account the height of the removed page's elements by subtracting it
            // moved: if there was a previously visible element that is no longer visible, that means we moved and need to adjust the scroll position
            const moved = visibleElements.some(element => !Scroll.isScrolledIntoView(element));
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
   * Resizes all media elements (like images and videos) by scaling them down to the window's width.
   *
   * Note: This function is called to resize images to fit the screen before calculating the document's height in the
   * following append modes: iframe.
   *
   * @param {string} mode - the append mode (why not use V.instance.append?)
   * @param {HTMLElement} container - the parent container element whose children should be resized
   * @param {HTMLElement[]} elements - the specific elements to resize
   * @private
   */
  static #resizeMedia(mode, container, elements) {
    console.log("resizeMedia() - mode=" + mode + ", container=" + container + ", container.children.length=" + (container && container.children ? container.children.length : "") + "elements.length=" + (elements ? elements.length : ""));
    try {
      switch(mode) {
        // TODO: Test append element mode more before including it here with the other modes
        case "page":
        case "iframe":
          // page, iframe, and element modes exit if resize media enabled is false (media still needs to do work here though)
          if (!V.instance.resizeMediaEnabled) {
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
          // const style = V.instance.resizeMediaEnabled ? "object-fit: scale-down; max-width: 100%; max-height: 100vh; position: initial;" : "position: initial;";
          const style = Util.processStyle(V.instance.resizeMediaEnabled ? "object-fit: scale-down; max-width: 100%; max-height: 100vh; position: initial;" : "position: initial;");
          container.querySelectorAll("img, video").forEach(el => el.style = style);
          break;
      }
    } catch (e) {
      console.log("resizeMedia() - Error:");
      console.log(e);
    }
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
  static #getObservableElements(elements) {
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

}