/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Content is the main part of the content script and initializes/starts it. It decides whether it should activate itself or not.
 */
class Content {

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
    //   console.log("Content.spaObserverCallback() - already checking SPA, so returning... caller=" + caller);
    //   return;
    // }
    // checks.checkingSPA = true;
    console.log("Content.spaObserverCallback() - mutations.length=" + mutations.length + ", caller=" + caller);
    // // Need to delay in case navigate fires fast and the elements from the past pages are still on the screen (i.e. shouldStop will return false)
    // if (caller === "navigate") {
    //   await Promisify.sleep(1000);
    // }
    // if (!V.items.on) {
    //   return;
    // }
    let shouldStop = true;
    // Why pickerEnabled?
    if (V.instance.enabled || V.instance.pickerEnabled) {
      // If append is none, then the only criteria is that the button no longer exists (can't rely on the page.element buttons as the site may have added a new button at the bottom)
      if (V.instance.append === "none") {
        shouldStop = !Click.findElement(V.instance.clickElementPath, V.instance.clickElementType, document, false).element;
      } else {
        // Must have at least one page (i.e. still in the middle of prepareFirstPage() AJAX Iframe) and a page must be active for it to check if page.element is still in the document (e.g. the page wasn't removed in removePages())
        shouldStop = V.pages.length > 0 && V.pages.every(page => !page.active || !document.contains(page.element) || (page.observableElement && !document.contains(page.observableElement)));
      }
    }
    console.log("Content.spaObserverCallback() - shouldStop=" + shouldStop);
    if (shouldStop) {
      await Scroll.stop("spaObserverCallback");
      // Clean up existing pages before resetting
      for (const page of V.pages) {
        // Remove all the iframes
        if (page.iframe && typeof page.iframe.remove === "function") {
          console.log("Content.spaObserverCallback() - removing iframe");
          page.iframe.remove();
        }
        // Need to manually remove the dividers in case the website only handles its specific elements like (p when sorting from old to new or vice versa)
        if (page.divider && typeof page.divider.remove === "function") {
          console.log("Content.spaObserverCallback() - removing divider");
          page.divider.remove();
        }
        // TODO: This seems risky
        // if (page.pageElements && page.pageElements.length > 0) {
        //   for (const pageElement of page.pageElements) {
        //     console.log("Content.spaObserverCallback() - removing pageElements");
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
      V.insertionPoint = V.pageElements = V.clickElement = V.iframe = V.lazys = V.bottom = V.loading = V.divider = V.overlay = undefined;
      V.offset = 0;
      V.timeouts = V.checks = {};
      // // We are still using checks.checkingSPA so don't reset this entire object
      // checks = { checkingSPA: true };
      const tab = { id: 0, url: window.location.href };
      console.log("Content.spaObserverCallback() - tab.url=" + tab.url);
      // Note that the potential SPA database items and saves are still in our storage items cache and we don't have to get the full storage items again
      // Unless: this is a navigate event!
      if (caller === "navigate") {
        V.items = await Promisify.storageGet();
      }
      // V.instance = await Instance.buildInstance(tab, items);
      // Here is where we may be waiting quite some time (e.g. 5 seconds)
      const temp = await Instance.buildInstance(tab, V.items, 3);
      console.log("Content.spaObserverCallback() - temp V.instance=");
      console.log(temp);
      if (!V.instance.enabled) {
        V.instance = temp;
        delete V.instance.items;
        if (V.instance.enabled) {
          console.log("Content.spaObserverCallback() - starting!");
          await Scroll.start(caller);
        }
      }
    }
    // // Remove the SPA Check lock
    // checks.checkingSPA = false;
  }

  /**
   * Uses window.matchMedia to derive the current system theme. This is in the content script due to there not being a browser
   * provided API/listener to detect these changes in the background. Note that the MV2 background can use window.matchMedia
   * changes, but not listen for them. Service Workers can't do either.
   *
   * Important: We need to add this listener on every tab's content script as it only fires when the tab is focused.
   *
   * @see https://github.com/sixcious/infy-scroll/issues/55
   * @see https://github.com/w3c/webextensions/issues/229
   * @private
   * ]'
   */
  static #addThemeListener() {
    console.log("Content.addThemeListener()");
    try {
      // Note: chrome.extension.inIncognitoContext can also be used here in the content script to determine if this is
      // incognito, but we ought to test for it in the background using a chrome.tabs.onUpdated listener for a more fluid/faster icon set
      if (V.items.icon === "system") {
        const prefersColorSchemeDark = window.matchMedia("(prefers-color-scheme: dark)");
        Promisify.runtimeSendMessage({sender: "contentscript", receiver: "background", greeting: "setIcon", icon: prefersColorSchemeDark.matches ? "light" : "dark"});
        prefersColorSchemeDark.addEventListener("change", function(e) {
          console.log("Content.themeListener() - prefers-color-scheme change triggered, dark=" + e.matches);
          // Update the toolbar icon and send a message to the Options and Popup to update the favicon (not really necessary for the Popup)
          Promisify.runtimeSendMessage({sender: "contentscript", receiver: "background", greeting: "setIcon", icon: e.matches ? "light" : "dark"});
          Promisify.runtimeSendMessage({sender: "contentscript", receiver: "popup", greeting: "themeChanged", theme: e.matches ? "dark" : "light"});
          Promisify.runtimeSendMessage({sender: "contentscript", receiver: "options", greeting: "themeChanged", theme: e.matches ? "dark" : "light"});
        });
      }
    } catch (e) {
      console.log("Content.addThemeListener() - Error:")
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
    console.log("Content.addNavigationListener()");
    try {
      const matches = Saves.matchesList(tab.url, tab.url, items?.navigationBlacklist, "Navigation Blacklist")?.matches;
      if (!matches && typeof navigation !== "undefined" && typeof navigation?.addEventListener === "function") {
        console.log("Content.addNavigationListener() - adding navigation listener");
        // We add a timeout just in case this is fired very early to let init() build the V.instance first? Can't catch errors unless we add an inner try-catch here
        // setTimeout(() => { navigation.addEventListener("navigate", navigateEvent => { spaObserverCallback([], {}, "navigate") }); }, 1000);
        // This timeout seems to cause issues vs awaiting promisify 1 second inside the function
        navigation.addEventListener("navigate", navigateEvent => {
          console.log("Content.navigationListener() - navigate event triggered");
          clearTimeout(V.timeouts.navigationListener);
          V.timeouts.navigationListener = setTimeout(() => { Content.#spaObserverCallback([], {}, "navigate"); }, 1000);
        });
      }
    } catch (e) {
      console.log("Content.addNavigationListener() - error initializing navigation listener, Error:")
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
    console.log("Content.updateDatabase()");
    try {
      // This checks to see if the database needs to be updated (if the update was more than X number of days ago).
      // Note: 1 Day = 86400000 ms
      if ((V.items.databaseAPEnabled || V.items.databaseISEnabled) && V.items.databaseUpdate >= 1 && (!V.items.databaseDate || ((new Date() - new Date(V.items.databaseDate)) >= (86400000 * V.items.databaseUpdate)))) {
        console.log("Content.updateDatabase() - updating database because databaseDate=" + V.items.databaseDate + " and databaseUpdate=" + V.items.databaseUpdate);
        const response = await Promisify.runtimeSendMessage({receiver: "background", greeting: "downloadDatabase", downloadAP: V.items.databaseAPEnabled, downloadIS: V.items.databaseISEnabled, downloadLocation: V.items.databaseLocation});
        console.log("Content.updateDatabase() - download response=" + JSON.stringify(response));
      }
    } catch (e) {
      console.log("Content.updateDatabase() - Error:");
      console.log(e);
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
    // If this is a blacklist command, we need to toggle it to whitelist if the user is in whitelist mode
    if (action === "blacklist" && V.items.databaseMode !== "blacklist") {
      action = "whitelist";
    }
    // Special Case: Down command while not enabled allows it to start using default settings or re-start if it was previously enabled already (this is already handled in start())
    if (action === "down" && !V.instance.enabled) {
      await Scroll.start(caller);
    } else if (((action === "down" || action === "up") && V.instance.enabled) ||
      (action === "auto" && V.instance.autoEnabled) ||
      (action === "blacklist" && V.instance.databaseFound && !V.instance.autoEnabled) ||
      (action === "whitelist" && V.instance.databaseFound && !V.instance.autoEnabled) ||
      (action === "power")) {
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
    console.log("Content.messageListener() - request=");
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
      case "checkClickElement":
        response = Click.findElement(request.clickElementPath, request.clickElementType, V.instance.documentType === "iframe" ? V.iframe?.contentDocument : document, request.highlight).details;
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
        Content.#command(request.action, request.caller);
        break;
      default:
        break;
    }
    sendResponse(response);
  }

  /**
   * Content Script initialization (IIFE).
   *
   * This function is the content script's entry point. It runs on every page request and determines if the
   * extension should start itself or not on this tab. It initializes the storage items and instance on the page.
   *
   * Note: This function only runs one time.
   *
   * @see https://stackoverflow.com/a/61203517
   * @private
   */
  static #init = (async () => {
    console.log("Content.init() - Content Script Started");
    // Scroll Listeners
    // Message Listener: We need to return immediately if the function will be performing asynchronous work
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "contentscript") { return; } Content.#messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });
    // Initialize Scroll
    // Note: Previously we had timing issues with some websites, but due to the new multiple checks for activation, we no
    // longer need to force an initial timeout due to dynamic content. Also, we have a separate timeout for calculating
    // the offset, so there is no real reason to delay initialization
    await Promisify.sleep(1);
    const tab = { id: 0, url: window.location.href };
    V.items = await Promisify.storageGet();
    // Change the system theme listener to change the icon (dark or light)
    Content.#addThemeListener();
    // Add the navigation listener relatively early before we await the next few things
    Content.#addNavigationListener(tab, V.items);
    // Note that this is the best time we can update the databases (not in the background). Do not await this; try and start as fast as possible, and have the updated database ready for the next page request
    Content.#updateDatabases(V.items);
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
      console.log("Content.init() - temp.via=" + temp.via + ", enabled=" + V.instance.enabled + ", pickerEnabled=" + V.instance.pickerEnabled + ", pickerSet=" + V.instance.pickerSet);
      if (temp.via !== "items" && !V.instance.enabled && !V.instance.pickerEnabled && !V.instance.pickerSet) {
        console.log("Content.init() - setting V.instance to temp, temp=");
        console.log(temp);
        if (V.instance.popupOpened) {
          Promisify.runtimeSendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: "init", action: "", instance: temp});
        }
        V.instance = temp;
      }
    }
    // const endTime = performance.now();
    // console.log("Call to do test took " + (endTime - startTime) + " milliseconds");
    console.log("Content.init() - after filtering, saves.length=" + V.items.saves.length + ", databaseIS.length=" + V.items.databaseIS.length + ", databaseAP.length=" + V.items.databaseAP.length);
    console.log("Content.init() - saves=\n" + (V.items.saves.map(x => x.url).join("\n")));
    console.log("Content.init() - databaseIS=\n" + (V.items.databaseIS.map(x => x.url).join("\n")));
    console.log("Content.init() - databaseAP=\n" + (V.items.databaseAP.map(x => x.url).join("\n")));
    // Delete the items cache in the V.instance
    delete V.instance.items;
    // Note: We do not want to delete the database or saves from the items cache to streamline checking them again later if this is an SPA
    console.log("Content.init() - V.instance=");
    console.log(V.instance);
    if (V.instance.enabled) {
      await Scroll.start("init");
    }
    // If this is an SPA, watch this page.
    // Note: We don't want to enable this on every website. For example, simply entering text in https://regex101.com/ keeps firing mutation changes
    if (V.instance.spa && V.items.on && (V.instance.databaseFound ? V.items.databaseMode === "blacklist" ? !V.instance.databaseBlacklisted : V.instance.databaseWhitelisted : true)) {
      console.log("Content.init() - watching SPA");
      // V.spaObserver = new MutationObserver(Content.#spaObserverCallback);
      V.spaObserver = new MutationObserver(Util.throttle(Content.#spaObserverCallback, 1000));
      V.spaObserver.observe(document.body, { childList: true, subtree: true });
    }
  })();

}