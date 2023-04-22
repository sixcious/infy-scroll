/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Action handles all business logic involving performing actions. The core function is {@link Action.execute}.
 *
 * The following are the main actions:
 * next      - finds the next or previous link
 * click     - clicks a button (like a load more button or next button)
 * increment - increments or decrements a URL
 * list      - goes to the next URL in a custom list of URLs
 *
 * The following are the sub actions:
 * down      - moves down one page
 * up        - moves up one page
 * auto      - performs either a "Pause" or "Resume" when Auto is enabled
 * return    - returns the instance to the initial state (e.g. page=1), usually only called when in Auto Slideshow mode when it repeats
 * repeat    - resets the instance in preparation for an auto repeat (e.g. slideshow)
 * blacklist - blacklists or un-blacklists a URL (toggle), also stopping or starting the instance, respectively
 * whitelist - whitelists or un-whitelists a URL (toggle), also starting or stopping the instance, respectively
 * power     - turns the extension on or off (toggle), starting and stopping the instance(s), respectively
 */
class Action {

  /**
   * Executes an action.
   *
   * @param {string} action - the action to perform (e.g. "next")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @param {Object} extra - (optional) any extra parameters not in the instance that may be needed by the action
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @public
   */
  static async execute(action, caller, extra) {
    console.log("Action.execute() - action=" + action);
    let actionPerformed = false;
    switch (action) {
      case "next":
      case "prev":
        actionPerformed = Action.#next(action, caller);
        break;
      case "click":
        actionPerformed = await Action.#click(caller);
        break;
      case "increment":
        actionPerformed = await Action.#increment(action, caller);
        break;
      // For modes that only have one action like Auto, Toolkit, and Scroll, we treat "list" the same as an "increment" of an array (only one possible direction in list - increment)
      case "list":
        actionPerformed = await Action.#increment(action, caller);
        break;
      case "down":
        actionPerformed = Action.#down(caller, extra);
        break;
      case "up":
        actionPerformed = Action.#up(caller, extra);
        break;
      case "auto":
        actionPerformed = Action.#auto();
        break;
      case "repeat":
        actionPerformed = Action.#repeat();
        break;
      case "return":
        actionPerformed = Action.#returnToStart(caller);
        break;
      case "blacklist":
        actionPerformed = await Action.#blacklist(caller);
        break;
      case "whitelist":
        actionPerformed = await Action.#whitelist(caller);
        break;
      case "power":
        actionPerformed = await Action.#power(caller);
        break;
    }
    return actionPerformed;
  }

  /**
   * Performs a next or prev action.
   *
   * @param {string} action - the action to perform (e.g. "next")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static #next(action, caller) {
    console.log("Action.next()");
    let actionPerformed = false;
    // First, try the currentDocument
    // Second, try the iframeDocument if the next link is in the iframe in Element Iframe (Trim) mode
    // Third, try the top-level document (document) if the next link is in Element Iframe mode (Import) and the next link was imported into it
    const result = Next.findLinkWithInstance(V.instance, V.items, action, [V.currentDocument, V.iframe?.contentDocument, document], V.pages);
    if (result?.url && !result.duplicate) {
      console.log("Action.next() - result=" + JSON.stringify(result));
      actionPerformed = true;
      // TODO: We should refactor the code so that the instance URL is only set after the page has been successfully appended... This is so that if there was an error while appending, we can go back here and not get a duplicate URL error
      V.instance.url = result.url;
    } else {
      console.log("Action.next() - " + (result?.duplicate ? ("duplicate result url found:" + result.url) : " no result found"));
      if (V.instance.autoEnabled) {
        Auto.stopTimer("action");
      }
      // TODO: Should we somehow call stop here or at least get rid of the loading?
      // Scroll.stop();
      // TODO: Or keep retrying...?
      // V.instance.isLoading = false;
    }
    return actionPerformed;
  }

  /**
   * Performs a click action, like clicking a "load more" button.
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static async #click(caller) {
    console.log("Action.click()");
    let actionPerformed = false;
    // We will either be clicking the top-level document's button or the iframe document's button (AJAX Iframe mode)
    let doc = V.instance.documentType === "iframe" ? V.iframe?.contentDocument : document;
    const result = Click.clickElement(V.instance.clickElementPath, V.instance.clickElementType, doc);
    if (result.clicked) {
      actionPerformed = true;
      // If AJAX or Element, we should wait a second to see if the document's URL will change to a new URL after the button click
      if (V.instance.append === "ajax" || V.instance.append === "element") {
        await Promisify.sleep(1000);
      }
      // Firefox Dead Object Error: Need to reacquire the iframe document in case the iframe loaded a new document
      doc = V.instance.documentType === "iframe" ? V.iframe?.contentDocument : document;
      V.instance.url = result.url || doc?.URL || V.instance.url || V.instance.tabURL;
      console.log("Action.click() - result.url:" + result.url + "\ndoc.URL: " + doc.URL + "\ninstance.url:" + V.instance.url + "\ninstance.tabURL:" + V.instance.tabURL);
      // // Firefox Dead Object Error: Need to update currentDocument to the new iframe document in case the iframe loaded a new document
      // V.currentDocument = V.iframe?.contentDocument ? V.iframe.contentDocument.cloneNode(true) : V.currentDocument;
    } else {
      // TODO: Should Auto stop at this point?
      // if (!actionPerformed && instance.autoEnabled) {
      //   Auto.stopAutoTimer("action");
      // }
      // TODO: If we didn't find/click the button, keep retrying? Risky to do setTimeout and set the instance...
      // setTimeout(() => {
      // }, 1000);
      // await Promisify.sleep(1000);
      // V.instance.isLoading = false;
    }
    return actionPerformed;
  }

  /**
   * Performs an increment or decrement action; if error skipping is enabled, delegates to another function.
   *
   * @param {string} action - the action to perform (e.g. "increment")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static async #increment(action, caller) {
    console.log("Action.increment()");
    let actionPerformed = false;
    // If can increment/decrement selection or operating on a urls array, continue (can't increment/decrement otherwise)
    // Note: If urlsCurrentIndex is on the last page, we stop here
    if ((V.instance.selection !== "" && V.instance.selectionStart >= 0) || (action === "list" && V.instance.urls && V.instance.urls.length > 0 && V.instance.urlsCurrentIndex < V.instance.urls.length)) {
      actionPerformed = true;
      // Error Skipping:
      // Scrolling only: Can't call fetch when it's a local file:// url
      if (V.instance.errorSkip > 0 && (V.instance.errorCodes && V.instance.errorCodes.length > 0) && (!V.instance.scrollEnabled || !V.instance.isLocal)) {
        await Action.#incrementErrorSkip(action, caller, V.instance, V.instance.errorSkip, false);
      }
      // Regular:
      else {
        Increment.increment(action, V.instance);
        // Scroll.set("instance", V.instance);
      }
    }
    return actionPerformed;
  }

  /**
   * Performs an increment or decrement action with error skipping.
   * Note: This function is reusable across all extensions.
   *
   * @param {string} action - the action to perform (e.g. "increment")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @param {Object} instance - the instance containing the URL and parameters used to increment or decrement
   * @param {number} errorSkipRemaining - the number of times left to skip while performing this action
   * @param {boolean} retrying - (optional) indicates whether the fetch method was switched to retry the URL
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static async #incrementErrorSkip(action, caller, instance, errorSkipRemaining, retrying) {
    console.log("Action.incrementErrorSkip() - instance.fetchMethod=" + instance.fetchMethod + ", instance.errorCodes=" + instance.errorCodes + ", instance.errorCodesCustom=" + instance.errorCodesCustom  + ", errorSkipRemaining=" + errorSkipRemaining + ", retrying=" + retrying);
    let response;
    let exception = false;
    let error = false;
    // If the fetch method was just switched to GET, don't increment again to allow retrying with the same instance URL
    if (!retrying) {
      Increment.increment(action, instance);
    }
    if (errorSkipRemaining <= 0) {
      console.log("Action.incrementErrorSkip() - exhausted the errorSkip attempts. aborting and updating tab");
      // Scroll.set("instance", instance);
      // updateTab(caller, instance);
      return;
    }
    // fetch using credentials: same-origin to keep session/cookie state alive (to avoid redirect false flags e.g. after a user logs in to a website)
    try {
      response = await fetch(instance.url, { method: instance.fetchMethod, credentials: "same-origin" });
      if (response && response.status && instance.errorCodes &&
        ((instance.errorCodes.includes("404") && response.status === 404) ||
          // Note: 301,302,303,307,308 return response.status of 200 and must be checked by response.redirected
          (instance.errorCodes.includes("3XX") && ((response.status >= 300 && response.status <= 399) || response.redirected)) ||
          (instance.errorCodes.includes("4XX") && response.status >= 400 && response.status <= 499) ||
          (instance.errorCodes.includes("5XX") && response.status >= 500 && response.status <= 599) ||
          (instance.errorCodes.includes("CUS") && instance.errorCodesCustom &&
            // response.status + "" because custom array stores string inputs
            (instance.errorCodesCustom.includes(response.status + "") ||
              (response.redirected && ["301", "302", "303", "307", "308"].some(redcode => instance.errorCodesCustom.includes(redcode))))))) {
        console.log("Action.incrementErrorSkip() - skipping this URL because response.status was in errorCodes or response.redirected, response.status=" + response.status + ", response.redirected=" + response.redirected + ", response.ok=" + response.ok);
        error = true;
      }
    } catch (e) {
      console.log("Action.incrementErrorSkip() - a fetch() exception was caught. Error:");
      console.log(e);
      if (instance.errorCodes.includes("EXC")) {
        exception = true;
      }
    } finally {
      // If the server disallows HEAD requests, switch to GET and retry this request using the same errorSkipRemaining
      if (response.status === 405 && instance.fetchMethod === "HEAD") {
        console.log("Action.incrementErrorSkip() - switching fetch method from HEAD to GET and retrying because server disallows HEAD (status 405)");
        instance.fetchMethod = "GET";
        await Action.#incrementErrorSkip(action, caller, instance, errorSkipRemaining, true);
      } else if (!error && !exception) {
        console.log("Action.incrementErrorSkip() - not attempting to skip this URL because response.status=" + response.status  + " and it was not in errorCodes. aborting and updating tab");
        // Scroll.set("instance", instance);
      } else {
        if (!instance.autoEnabled) {
          // If this is running in a content script (scrollEnabled), we need to send a message to the Background; otherwise we just call the Background's setBadge method
          if (instance.scrollEnabled) {
            Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "skip", temporary: true, text: exception ? "EXC" : response.redirected ? "RED" : response.status + ""});
          } else {
            Background.setBadge(instance.tabId, "skip", true, exception ? "EXC" : response.redirected ? "RED" : response.status + "");
          }
        }
        // Recursively call this function again to perform the action again and skip this URL, decrementing errorSkipRemaining
        await Action.#incrementErrorSkip(action, caller, instance, errorSkipRemaining - 1, false);
      }
    }
  }

  /**
   * Performs a "down" action, scrolling the instance one page down.
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @param {Object} extra - (optional) any extra parameters not in the instance that may be needed by the action
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static #down(caller, extra) {
    let actionPerformed = false;
    const nextPage = extra?.page || V.instance.currentPage + 1;
    const page = V.pages[((nextPage < V.pages.length && nextPage >= 1) ? nextPage : V.pages.length) - 1];
    if (page && page.element && page.number && typeof page.element.scrollIntoView === "function") {
      V.instance.currentPage = page.number;
      page.element.scrollIntoView({behavior: V.instance.scrollBehavior, block: "start", inline: "start"});
      actionPerformed = true;
    }
    console.log("Action.down() - caller=" + caller + ", currentPage=" + V.instance.currentPage + ", nextPage=" + nextPage);
    return actionPerformed;
  }

  /**
   * Performs an "up" action, scrolling the instance one page up.
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @param {Object} extra - (optional) any extra parameters not in the instance that may be needed by the action
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static #up(caller, extra) {
    let actionPerformed = false;
    const nextPage = extra?.page || V.instance.currentPage - 1;
    let page = V.pages[((nextPage < V.pages.length && nextPage >= 1) ? nextPage : 1) - 1];
    // This is for the page navigation button that goes to page 1. If there is a maximum/limited number of pages, then
    // we won't have page 1 anymore and need to calculate the "new" page 1 (topmost page). (Note: find finds the first.)
    if (!page?.element) {
      page = V.pages.find(page => page.element);
    }
    if (page && page.number && page.element && typeof page.element.scrollIntoView === "function") {
      V.instance.currentPage = page.number;
      page.element.scrollIntoView({behavior: V.instance.scrollBehavior, block: "start", inline: "start"});
      actionPerformed = true;
    }
    console.log("Action.up() - caller=" + caller + ", currentPage=" + V.instance.currentPage + ", nextPage=" + nextPage);
    return actionPerformed;
  }

  /**
   * Performs an auto action (the auto action is either a pause or resume).
   *
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static #auto() {
    console.log("Action.auto()");
    let actionPerformed = false;
    if (V.instance.autoEnabled) {
      Auto.pauseOrResumeTimer();
      actionPerformed = true;
    }
    return actionPerformed;
  }

  /**
   * Called by the returnToStart() function when in Auto Slideshow (Repeat Mode) when it wants to repeat itself.
   * Sets the instance's current page back to page 1.
   *
   * TODO: Consolidate returnToStart (first function) and repeat (second function) into one repeat function. These are only called in Auto Slideshow mode
   *
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static #repeat() {
    console.log("Action.repeat()");
    // Not an action
    let actionPerformed = true;
    // Auto Slideshow Mode (Repeat) + Shuffle (this is complicated!)
    if (V.instance.shuffleURLs) {
      // Step 1: Re-shuffle the pages after the repeat
      IncrementArray.shuffle(V.pages);
      // Step 2: Reset each page's number in the new shuffled order; this is because we set instance.currentPage to page.number later on
      for (let i = 0; i < V.pages.length; i++) {
        V.pages[i].number = i + 1;
      }
    }
    V.instance.currentPage = 1;
    // TODO: If instance.scrollBehavior is "smooth", it is possible for the time it takes to scroll back up to the first page might be longer than autoSeconds
    const page = V.pages[V.instance.currentPage - 1];
    if (page && page.element) {
      page.element.scrollIntoView({behavior: V.instance.scrollBehavior, block: "start", inline: "start"});
    }
    Auto.autoListener();
    return actionPerformed;
  }

  /**
   * Performs a return action, returning back to the instance's starting URL. This is usually called in Auto Slideshow
   * when it repeats in order to return back to the first page.
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static #returnToStart(caller) {
    console.log("Action.returnToStart()");
    let actionPerformed = false;
    if (V.instance.enabled && V.instance.startingURL) {
      actionPerformed = true;
      V.instance.url = V.instance.startingURL;
      V.instance.selection = V.instance.startingSelection;
      V.instance.selectionStart = V.instance.startingSelectionStart;
      // Multi
      if (V.instance.multiEnabled) {
        for (let i = 1; i <= V.instance.multiCount; i++) {
          V.instance.multi[i].selection = V.instance.multi[i].startingSelection;
          V.instance.multi[i].selectionStart = V.instance.multi[i].startingSelectionStart;
        }
      }
      // Auto
      if (V.instance.autoEnabled) {
        V.instance.autoRepeating = false;
        V.instance.autoTimes = V.instance.autoTimesOriginal;
        // Don't update tab, just have scroll return to start and return (append new page, look at refactoring this whole function)
        if (V.instance.autoSlideshow) {
          Action.#repeat();
          return actionPerformed;
        }
      }
      // Array
      if (V.instance.urls && V.instance.urls.length > 0) {
        V.instance.urlsCurrentIndex = V.instance.startingURLsCurrentIndex;
        // Shuffle
        if (V.instance.shuffleURLs) {
          V.instance.urls = [];
          const precalculateProps = IncrementArray.precalculateURLs(V.instance);
          V.instance.urls = precalculateProps.urls;
          V.instance.urlsCurrentIndex = precalculateProps.currentIndex;
        }
      }
    }
    return actionPerformed;
  }

  /**
   * Adds a Database URL to the Database Blacklist or removes it ("Un-Blacklists" it).
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static async #blacklist(caller) {
    console.log("Action.blacklist()");
    let actionPerformed = false;
    // If action is blacklist/whitelist, we always need the most current storage items, not the cache in Scroll
    const items = await Promisify.storageGet(undefined, undefined, ["databaseAP", "databaseIS", "saves"]);
    if (items && Array.isArray(items.databaseBlacklist)) {
      actionPerformed = true;
      let databaseBlacklist = items.databaseBlacklist;
      const matches = Saves.matchesList(V.instance.tabURL, V.instance.databaseURL, databaseBlacklist, "Database Blacklist").matches;
      console.log("Action.blacklist() - " + (!matches ? "blacklisting" : "un-blacklisting") + " databaseURL:" + V.instance.databaseURL + " with: " + V.instance.databaseBlacklistWhitelistURL);
      if (!matches) {
        V.instance.databaseBlacklisted = true;
        databaseBlacklist.push(V.instance.databaseBlacklistWhitelistURL);
      } else {
        V.instance.databaseBlacklisted = false;
        databaseBlacklist = databaseBlacklist.filter(x => x !== V.instance.databaseBlacklistWhitelistURL);
      }
      // We need to update the Scroll's instance with the updated properties we set
      // Scroll.set("instance", V.instance);
      // If we're stopping we need to get the updated "disabled" state of the instance after Scroll.stop() for the Popup
      if (!matches) {
        await Scroll.stop("blacklist");
      } else {
        await Scroll.start("blacklist");
      }
      await Promisify.storageSet({"databaseBlacklist": databaseBlacklist});
    }
    return actionPerformed;
  }

  /**
   * Adds a Database URL to the Database Whitelist or removes it ("Un-Whitelists" it).
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static async #whitelist(caller) {
    console.log("Action.whitelist()");
    let actionPerformed = false;
    // If action is blacklist/whitelist, we always need the most current storage items, not the cache in Scroll
    const items = await Promisify.storageGet(undefined, undefined, ["databaseAP", "databaseIS", "saves"]);
    if (items && Array.isArray(items.databaseWhitelist)) {
      actionPerformed = true;
      let databaseWhitelist = items.databaseWhitelist;
      const matches = Saves.matchesList(V.instance.tabURL, V.instance.databaseURL, databaseWhitelist, "Database Whitelist").matches;
      console.log("Action.whitelist() - " + (!matches ? "whitelisting" : "un-whitelisting") + " databaseURL:" + V.instance.databaseURL + " with: " + V.instance.databaseBlacklistWhitelistURL);
      if (!matches) {
        V.instance.databaseWhitelisted = true;
        databaseWhitelist.push(V.instance.databaseBlacklistWhitelistURL);
      } else {
        V.instance.databaseWhitelisted = false;
        databaseWhitelist = databaseWhitelist.filter(x => x !== V.instance.databaseBlacklistWhitelistURL);
      }
      // We need to update the Scroll's instance with the updated properties we set
      // Scroll.set("instance", V.instance);
      // If we're stopping we need to get the updated "disabled" state of the instance after Scroll.stop() for the Popup
      if (matches) {
        await Scroll.stop("whitelist");
      } else {
        await Scroll.start("whitelist");
      }
      await Promisify.storageSet({"databaseWhitelist": databaseWhitelist});
    }
    return actionPerformed;
  }

  /**
   * Performs a power on or off action. When turning off, this is NOT the same thing as a "stop" action. Turning off
   * will ask the Background to send a message to all tabs' content scripts to stop themselves.
   *
   * Note: We do not delete the instance in case the user tries to re-start the instance (e.g. opening the Popup again).
   *
   * The Power (On/Off) action can only be initiated in the following ways:
   * 1. The Popup Window's "Power" Button
   * 2. The Options Page's Power Toggle Switch ("Current State")
   * 3. The Keyboard Shortcut Command "power"
   *
   * The Power (Off) and Stop Actions are different. Turning the extension off implicitly stops each tab's instance.
   * Therefore, a Power (Off) always implies that a Stop will follow.
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static async #power(caller) {
    console.log("Action.power()");
    let actionPerformed = true;
    // Handle on/off state, send message to background to turn off the other instances in all tabs
    const on = await Promisify.storageGet("on");
    await Promisify.storageSet({"on": !on});
    if (!on) {
      await Scroll.start(caller);
    } else {
      // Note: Although turnOff could also stop this tab, this would require us to write messy code to await that because we need to update the Popup instance
      // Instead, we manually call stop on this tab now, and Background's turnOff won't send a message to this tab's ID (the sender tab ID)
      await Scroll.stop(caller);
      Promisify.runtimeSendMessage({receiver: "background", greeting: "turnOff", caller: caller});
    }
    return actionPerformed;
  }

}