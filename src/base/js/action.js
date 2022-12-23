/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Action handles all business logic involving performing actions. The core function is the performAction() function.
 *
 * The following are the four main actions:
 * 1. next      - finds the next or previous link
 * 2. increment - increments or decrements a URL
 * 3. button    - performs a button click (like a load more button)
 * 4. list      - uses a custom list of URLs (array) to append
 *
 * In addition, the following control actions are handled:
 * 1. down      - moves the instance down one page
 * 2. up        - moves the instance up one page
 * 3. auto      - performs either a "Pause" or "Resume" when Auto is enabled
 * 4. return    - returns the instance to the initial state (e.g. page=1), usually only called when in Auto Slideshow mode when it repeats
 * 5. repeat    - resets the instance in preparation for an auto repeat (e.g. slideshow)
 * 6. blacklist - blacklists or un-blacklists a URL, stopping or starting the instance, respectively
 * 7. whitelist - whitelists or un-whitelists a URL, starting or stopping the instance, respectively
 * 8. power     - turns the extension on/off, starting and stopping all instances, respectively
 *
 * Power (On/Off) Action
 * ---------------------
 * Turns on/off the extension.
 * The Power (On/Off) action can only be initiated in the following ways:
 * 1. The Popup Window's "Power" Button
 * 2. The Options Page's Power Toggle Switch ("Current State")
 * 3. The Keyboard Shortcut Command "power"
 *
 * Stop Action
 * -----------
 * Stops the instance and disables it so it doesn't append any more pages (this does not delete the instance).
 * The stop action can only be initiated in the following ways:
 * 1. The Background sends a message to a tab's content script (after receiving an "off" notification)
 *
 * The Power (Off) and Stop Actions are different. Turning the extension off implicitly stops each tab's instance.
 * Therefore, a Power (Off) always implies that a Stop will follow.
 *
 * Note that when Auto stops, it does NOT call the stop action on the instance. The instance resumes in ON status.
 */
const Action = (() => {

  /**
   * Performs an action.
   *
   * After the action is performed, a message is sent to the Popup to update the instance if and only if the action was
   * called by the Popup.
   *
   * @param action     the action (e.g. "increment")
   * @param caller     String indicating who called this function (e.g. command, popup, message)
   * @param instance   the instance for this tab
   * @param items      (optional) the storage items
   * @param document_  (optional) the current cloned document to parse, used in next()
   * @param document__ (optional) the current live document to parse, used in next()
   * @param extra      (optional) any extra action parameters that may be needed by the action
   * @public
   */
  async function performAction(action, caller, instance, items, document_, document__, extra) {
    console.log("performAction() - action=" + action + ", caller=" + caller);
    // If action is blacklist/whitelist, we always need the most current storage items, not the cache in Scroll
    items = items && action !== "blacklist" && action !== "whitelist" ? items : await Promisify.storageGet();
    document_ = document_ || Scroll.get().document_;
    document__ = document__ || Scroll.get().document__;
    const pages = Scroll.getPages();
    let actionPerformed = false;
    // Pre-Perform Action
    // Handle Down (Non-Auto)
    if (!instance.autoEnabled && action === "down") {
      action = instance.isLoading || instance.currentPage + 1 <= pages.length ? "down" : instance.action;
      // TODO: Write a better check for this isLoading situation, integrating it with the normal appending we do when scrolling. We need to guard against excessive user actions (shortcuts and button clicks). Normal appends via scrolling should handle isLoading properly
      // IMPORTANT: The following is necessary if the user tries to perform the down command too many times very fast (e.g. holding down the shortcut key or pressing Down Button too rapidly)
      // If the action is no longer a "down" (i.e. it is now the instance.action as changed above), we are now performing the action itself and we should set the instance's isLoading to true. This will avoid performing multiple increments if the user tries to press the Down Shortcut multiple times quickly when on the last page
      if (action !== "down") {
        console.log("performAction() - changing the down action to the instance.action and setting the instance isLoading to true because the action is no longer down, action=" + action);
        instance.isLoading = true;
        Scroll.setInstance(instance);
      }
    }
    // Handle Auto:
    // TODO: Also need to handle Up for Auto Slideshow if decrementing auto times
    if (instance.autoEnabled && caller === "auto" && action === "down") {
      // In case auto has been paused, get the most recent instance from Scroll content script
      instance = Scroll.getInstance() || instance;
      // If slideshow mode and have enough pages, action is always just down; otherwise Regular auto or slideshow without enough pages is always the scroll action (appends a new page); otherwise it's just going down one page (only slideshow)
      // TODO: Handle Auto Slideshow, should buttons/shortcuts increment or decrement autoTimes?
      action = instance.autoSlideshow && pages.length > instance.autoTimesOriginal ? "down" : instance.action;
      // Handle autoTimes
      instance.autoTimes--;
    }
    // Actions: down, up, and off do not have actionPerformed ever set to true because they don't have badges
    switch (action) {
      case "down":
        down(caller, instance, pages, extra);
        break;
      case "up":
        up(caller, instance, pages, extra);
        break;
      case "next":
      case "prev":
        actionPerformed = next(action, caller, instance, document_, document__);
        break;
      case "increment":
      case "decrement":
        actionPerformed = increment(action, caller, instance, items);
        break;
      case "button":
        actionPerformed = button(caller, instance);
        break;
      // For modes that only have one action like Auto, Toolkit, and Scroll, we treat "list" the same as an "increment" of an array (only one possible direction in list - increment)
      case "list":
        actionPerformed = increment(action, caller, instance, items);
        break;
      case "auto":
        actionPerformed = auto(instance);
        break;
      case "repeat":
        actionPerformed = repeat(instance);
        break;
      case "return":
        actionPerformed = returnToStart(caller, instance);
        break;
      case "blacklist":
        await blacklist(caller, instance, items);
        break;
      case "whitelist":
        await whitelist(caller, instance, items);
        break;
      case "power":
        await power(caller, instance);
        break;
    }
    // Post-Perform Action
    // Handle Auto Slideshow after Down/Up
    if (instance.autoEnabled && instance.autoSlideshow && caller === "auto" && action === "down") {
      Auto.autoListener(instance);
    }
    // Icon Feedback if debug enabled and if action was performed and other conditions are met (e.g. we don't show feedback if auto is enabled):
    if (items.debugEnabled && actionPerformed && !(instance.autoEnabled || (caller === "auto" && instance.autoSlideshow))) {
      // Reset Multi Action to the appropriate badge (increment becomes "incrementm", increment1 becomes "increment")
      action = instance.multiEnabled ? action === "increment" || action === "decrement" ? action + "m" : action === "increment1" || action === "decrement1" ? action.slice(0, -1) : action : action;
      Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: action, temporary: true});
    }
    // Only send a message to update the popup if the caller was the popup (this wakes up the Background)
    // We need to update the popup if this was an off, blacklist, or whitelist to update the buttons/icons
    // TODO: Why aren't we getting the updated instance from Scroll.getInstance() here after the action is performed?
    // We only update the popup at this point if the action wasn't performed or it's an off/blacklist/whitelist. If the action is performed, Scroll.appendFinally() updates it after appending the next page, so we don't need to do it here
    if ((caller === "popupClickActionButton" && !actionPerformed) || action === "auto" || action === "power" || action === "blacklist" || action === "whitelist") {
      Promisify.runtimeSendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: caller, action: action, instance: instance});
    }
  }

  /**
   * Updates the tab (carryover terminology from URLI), sets the instance in the Scroll content script, and appends the
   * next page.
   *
   * @param caller   String indicating who called this function (e.g. command, popup, message)
   * @param instance the instance
   * @private
   */
  function updateTab(caller, instance) {
    console.log("updateTab() - caller=" + caller);
    Scroll.setInstance(instance);
    Scroll.append(caller);
    // Note: We don't want to send a message to update the popup instance because it wakes up the background process every time an action is performed
  }

  /**
   * Performs a "down" action, scrolling the instance one page down.
   * TODO: Should this reside in Scroll?
   *
   * @param caller   String indicating who called this function (e.g. command, popup, message)
   * @param instance the instance
   * @param pages    the pages array from Scroll
   * @param extra    (optional) the specific page to go down to
   * @private
   */
  function down(caller, instance, pages, extra) {
    const nextPage = extra || instance.currentPage + 1;
    console.log("down() - instance.currentPage=" + instance.currentPage + ", caller=" + caller + ", nextPage=" + nextPage);
    instance.currentPage =  nextPage < pages.length ? nextPage : pages.length;
    Scroll.setInstance(instance);
    const page = pages[instance.currentPage - 1];
    if (page && page.element && typeof page.element.scrollIntoView === "function") {
      page.element.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
    }
  }

  /**
   * Performs an "up" action, scrolling the instance one page up.
   * TODO: Should this reside in Scroll?
   *
   * @param caller   String indicating who called this function (e.g. command, popup, message)
   * @param instance the instance
   * @param pages    the pages array from Scroll
   * @param extra    (optional) the specific page to go up to
   * @private
   */
  function up(caller, instance, pages, extra) {
    const nextPage = extra || instance.currentPage - 1;
    console.log("up() - instance.currentPage=" + instance.currentPage + ", caller=" + caller + ", nextPage=" + nextPage);
    instance.currentPage = nextPage >= 1 ? nextPage : 1;
    Scroll.setInstance(instance);
    const page = pages[instance.currentPage - 1];
    if (page && page.element && typeof page.element.scrollIntoView === "function") {
      page.element.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
    }
  }

  /**
   * Performs a next or prev action.
   *
   * @param action     the action (e.g. next or prev)
   * @param caller     String indicating who called this function (e.g. command, popup, message)
   * @param instance   the instance for this tab
   * @param document_  (optional) the current document to parse
   * @param document__ (optional) the current live document to parse
   * @returns {boolean} true if the action was performed, false otherwise
   * @private
   */
  function next(action, caller, instance, document_, document__) {
    console.log("next() - action=" + action);
    let actionPerformed = false;
    // First, try the cloned document (document_)
    // Second, try the live document (document__) if the next link is in the iframe in Element Iframe (Trim) mode
    // Third, try the parent document (document) if the next link is in Element Iframe mode (Import) and the next link was imported into it
    const result = Next.findLinkWithInstance(instance, action, [document_, document__, document]);
    // We purposely only update the tab if the next/prev result url is different than one we've already appended
    // TODO: We may be still appending duplicate pages sometimes with # params as the only difference
    if (result && result.url && result.url !== instance.url && (!Scroll.getPages() || !Scroll.getPages().find(p => p.url === result.url))) {
      console.log("next() - result=" + JSON.stringify(result));
      actionPerformed = true;
      // TODO: We should refactor the code so that the instance URL is only set after the page has been successfully appended... This is so that if there was an error while appending, we can go back here and not get a duplicate URL error
      instance.url = result.url;
      updateTab(caller, instance);
    } else {
      console.log("next() - " + (result && result.url ? ("duplicate result url found:" + result.url) : " no result found"));
      if (instance.autoEnabled) {
        Auto.stopAutoTimer(instance, "action");
      }
      // TODO: Should we somehow call stop here or at least get rid of the loading?
      // Scroll.stop();
      // TODO: Or keep retrying...?
      // instance.isLoading = false;
      // Scroll.setInstance(instance);
    }
    return actionPerformed;
  }

  /**
   * Performs an increment or decrement action; if error skipping is enabled, delegates to another function.
   * Note: This function is reusable across all extensions.
   *
   * @param action   the action (increment or decrement)
   * @param caller   String indicating who called this function (e.g. command, popup, message)
   * @param instance the instance for this tab
   * @param items    the storage items
   * @returns {boolean|*} true if the action was performed, false otherwise
   * @private
   */
  function increment(action, caller, instance, items) {
    console.log("increment()");
    let actionPerformed = false;
    // If can increment/decrement selection or operating on a urls array, continue (can't increment/decrement otherwise)
    // Note: If urlsCurrentIndex is on the last page, we stop here
    if ((instance.selection !== "" && instance.selectionStart >= 0) || (action === "list" && instance.urls && instance.urls.length > 0 && instance.urlsCurrentIndex < instance.urls.length)) {
      actionPerformed = true;
      // Error Skipping:
      // Scrolling only: Can't call fetch when it's a local file:// url
      if (instance.errorSkip > 0 && (instance.errorCodes && instance.errorCodes.length > 0) && (!instance.scrollEnabled || !instance.isLocal)) {
        incrementErrorSkip(action, caller, instance, instance.errorSkip);
      }
      // Regular:
      else {
        Increment.increment(action, instance);
        updateTab(caller, instance);
      }
    }
    return actionPerformed;
  }

  /**
   * Performs an increment or decrement action with error skipping.
   * Note: This function is reusable across all extensions.
   *
   * @param action             the action to perform (increment or decrement)
   * @param caller             String indicating who called this function (e.g. command, popup, message)
   * @param instance           the instance containing the URL and parameters used to increment or decrement
   * @param errorSkipRemaining the number of times left to skip while performing this action
   * @param retrying           (optional) boolean indicating whether the fetch method was switched to retry the URL
   * @private
   */
  async function incrementErrorSkip(action, caller, instance, errorSkipRemaining, retrying) {
    console.log("incrementErrorSkip() - instance.fetchMethod=" + instance.fetchMethod + ", instance.errorCodes=" + instance.errorCodes + ", instance.errorCodesCustom=" + instance.errorCodesCustom  + ", errorSkipRemaining=" + errorSkipRemaining + ", retrying=" + retrying);
    let response;
    let exception = false;
    let error = false;
    // If the fetch method was just switched to GET, don't increment again to allow retrying with the same instance URL
    if (!retrying) {
      Increment.increment(action, instance);
    }
    if (errorSkipRemaining <= 0) {
      console.log("incrementErrorSkip() - exhausted the errorSkip attempts. aborting and updating tab");
      updateTab(caller, instance);
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
        console.log("incrementErrorSkip() - skipping this URL because response.status was in errorCodes or response.redirected, response.status=" + response.status + ", response.redirected=" + response.redirected + ", response.ok=" + response.ok);
        error = true;
      }
    } catch (e) {
      console.log("incrementErrorSkip() - a fetch() exception was caught. Error:");
      console.log(e);
      if (instance.errorCodes.includes("EXC")) {
        exception = true;
      }
    } finally {
      // If the server disallows HEAD requests, switch to GET and retry this request using the same errorSkipRemaining
      if (response.status === 405 && instance.fetchMethod === "HEAD") {
        console.log("incrementErrorSkip() - switching fetch method from HEAD to GET and retrying because server disallows HEAD (status 405)");
        instance.fetchMethod = "GET";
        incrementErrorSkip(action, caller, instance, errorSkipRemaining, true);
      } else if (!error && !exception) {
        console.log("incrementErrorSkip() - not attempting to skip this URL because response.status=" + response.status  + " and it was not in errorCodes. aborting and updating tab");
        updateTab(caller, instance);
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
        incrementErrorSkip(action, caller, instance, errorSkipRemaining - 1);
      }
    }
  }

  /**
   * Performs a button action, like clicking a "load more" button.
   *
   * @param caller   String indicating who called this function (e.g. command, popup, content script)
   * @param instance the instance for this tab
   * @returns {boolean|*} true if the action was performed, false otherwise
   * @private
   */
  function button(caller, instance) {
    console.log("button() - type=" + instance.buttonType + ", rule="  + instance.buttonPath);
    let actionPerformed = Button.clickButton(instance.buttonType, instance.buttonPath);
    if (actionPerformed) {
      updateTab(caller, instance);
    } else {
      // TODO: Should Auto stop at this point?
      // if (!actionPerformed && instance.autoEnabled) {
      //   Auto.stopAutoTimer(instance, "action");
      // }
      // TODO: If we didn't find/click the button, keep retrying? Risky to do setTimeout and set the instance...
      // setTimeout(() => {
      // }, 1000);
      instance.isLoading = false;
      Scroll.setInstance(instance);
    }
    return actionPerformed;
  }

  /**
   * Performs an auto action (the auto action is either a pause or resume).
   *
   * @param instance the instance for this tab
   * @returns {boolean} true if the action was performed, false otherwise
   * @private
   */
  function auto(instance) {
    console.log("auto() - instance.autoPaused=" + instance.autoPaused + "instance.autoEnabled=" + instance.autoEnabled);
    let actionPerformed = false;
    if (instance.autoEnabled) {
      Auto.pauseOrResumeAutoTimer(instance);
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
   * @param instance the instance for this tab
   * @returns {boolean} true if the action was performed, false otherwise
   * @private
   */
  function repeat(instance) {
    console.log("repeat()");
    // Not an action
    let actionPerformed = false;
    const pages = Scroll.getPages();
    // Auto Slideshow Mode (Repeat) + Shuffle (this is complicated!)
    if (instance.shuffleURLs) {
      // Step 1: Re-shuffle the pages after the repeat
      IncrementArray.shuffle(pages);
      // Step 2: Reset each page's number in the new shuffled order; this is because we set instance.currentPage to page.number later on
      for (let i = 0; i < pages.length; i++) {
        pages[i].number = i + 1;
      }
    }
    instance.currentPage = 1;
    Scroll.setInstance(instance);
    Scroll.setPages(pages);
    // TODO: If instance.scrollBehavior is "smooth", it is possible for the time it takes to scroll back up to the first page might be longer than autoSeconds
    const page = pages[instance.currentPage - 1];
    if (page && page.element) {
      page.element.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
    }
    Auto.autoListener(instance);
    return actionPerformed;
  }

  /**
   * Performs a return action, returning back to the instance's starting URL. This is usually called in Auto Slideshow
   * when it repeats in order to return back to the first page.
   *
   * @param caller   String indicating who called this function (e.g. command, popup, content script)
   * @param instance the instance for this tab
   * @returns {boolean} true if the action was performed, false otherwise
   * @private
   */
  function returnToStart(caller, instance) {
    console.log("returnToStart()");
    let actionPerformed = false;
    if (instance.enabled && instance.startingURL) {
      actionPerformed = true;
      instance.url = instance.startingURL;
      instance.selection = instance.startingSelection;
      instance.selectionStart = instance.startingSelectionStart;
      // Multi
      if (instance.multiEnabled) {
        for (let i = 1; i <= instance.multiCount; i++) {
          instance.multi[i].selection = instance.multi[i].startingSelection;
          instance.multi[i].selectionStart = instance.multi[i].startingSelectionStart;
        }
      }
      // Auto
      if (instance.autoEnabled) {
        instance.autoRepeating = false;
        instance.autoTimes = instance.autoTimesOriginal;
        // Don't updateTab, just have scroll return to start and return (append new page, look at refactoring this whole function)
        if (instance.autoSlideshow) {
          repeat(instance);
          return actionPerformed;
        }
      }
      // Array
      if (instance.urls && instance.urls.length > 0) {
        instance.urlsCurrentIndex = instance.startingURLsCurrentIndex;
        // Shuffle
        if (instance.shuffleURLs) {
          instance.urls = [];
          const precalculateProps = IncrementArray.precalculateURLs(instance);
          instance.urls = precalculateProps.urls;
          instance.urlsCurrentIndex = precalculateProps.currentIndex;
        }
      }
      updateTab(caller, instance);
    }
    return actionPerformed;
  }

  /**
   * Adds a Database URL to the Database Blacklist or removes it ("Un-Blacklists" it).
   *
   * @param caller   String indicating who called this function (e.g. command, popup, message)
   * @param instance the instance for this tab
   * @param items    the storage items
   * @private
   */
  async function blacklist(caller, instance, items) {
    console.log("blacklist()");
    if (!items || !Array.isArray(items.databaseBlacklist)) {
      return;
    }
    let databaseBlacklist = items.databaseBlacklist;
    const matches = Saves.matchesList(instance.tabURL, instance.databaseURL, databaseBlacklist, "Database Blacklist").matches;
    console.log("blacklist() - " + (!matches ? "blacklisting" : "un-blacklisting") + " databaseURL:" + instance.databaseURL + " with: " + instance.databaseBlacklistWhitelistURL);
    if (!matches) {
      instance.databaseBlacklisted = true;
      databaseBlacklist.push(instance.databaseBlacklistWhitelistURL);
    } else {
      instance.databaseBlacklisted = false;
      databaseBlacklist = databaseBlacklist.filter(x => x !== instance.databaseBlacklistWhitelistURL);
    }
    // We need to update the Scroll's instance with the updated properties we set
    Scroll.setInstance(instance);
    // If we're stopping we need to get the updated "disabled" state of the instance after Scroll.stop() for the Popup
    if (!matches) {
      await Scroll.stop();
    } else {
      await Scroll.start();
    }
    instance = Scroll.getInstance();
    await Promisify.storageSet({"databaseBlacklist": databaseBlacklist});
  }

  /**
   * Adds a Database URL to the Database Whitelist or removes it ("Un-Whitelists" it).
   *
   * @param caller   String indicating who called this function (e.g. command, popup, message)
   * @param instance the instance for this tab
   * @param items    the storage items
   * @private
   */
  async function whitelist(caller, instance, items) {
    console.log("whitelist()");
    if (!items || !Array.isArray(items.databaseWhitelist)) {
      return;
    }
    let databaseWhitelist = items.databaseWhitelist;
    const matches = Saves.matchesList(instance.tabURL, instance.databaseURL, databaseWhitelist, "Database Whitelist").matches;
    console.log("whitelist() - " + (!matches ? "whitelisting" : "un-whitelisting") + " databaseURL:" + instance.databaseURL + " with: " + instance.databaseBlacklistWhitelistURL);
    if (!matches) {
      instance.databaseWhitelisted = true;
      databaseWhitelist.push(instance.databaseBlacklistWhitelistURL);
    } else {
      instance.databaseWhitelisted = false;
      databaseWhitelist = databaseWhitelist.filter(x => x !== instance.databaseBlacklistWhitelistURL);
    }
    // We need to update the Scroll's instance with the updated properties we set
    Scroll.setInstance(instance);
    // If we're stopping we need to get the updated "disabled" state of the instance after Scroll.stop() for the Popup
    if (matches) {
      await Scroll.stop();
    } else {
      await Scroll.start();
    }
    instance = Scroll.getInstance();
    await Promisify.storageSet({"databaseWhitelist": databaseWhitelist});
  }

  /**
   * Performs a power on or off action. When turning off, this is NOT the same thing as a "stop" action. Turning off
   * will ask the Background to send a message to all tabs' content scripts (including this one) to stop themselves.
   *
   * Note: We do not delete the instance in case the user tries to re-start the instance (e.g. opening the Popup again)
   *
   * @param caller   String indicating who called this function (e.g. command, popup, content script)
   * @param instance the instance for this tab
   * @returns {boolean} true if the action was performed, false otherwise
   * @private
   */
  async function power(caller, instance) {
    console.log("power()");
    // Handle on/off state, send message to background to turn off the other instances in all tabs
    const items = await Promisify.storageGet();
    await Promisify.storageSet({"on": !items.on});
    if (!items.on) {
      // if (instance.previouslyEnabled) {
      //   await Scroll.start();
      //   instance = Scroll.getInstance();
      // }
      // Down action while not enabled allows it to start using default settings or re-start if it was previously enabled already
      if (!instance.previouslyEnabled && instance.via === "items") {
        // // This is the only opportunity (besides the Popup) that we have of getting the tab ID to identify this instance
        // instance.tabId = await Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false, needsTabId: true});
        // We only use the default action and append (next page) if we didn't find a save/whitelist/database URL
        // We need to set the default action and append mode here for the down command: next page
        instance.action = "next";
        instance.append = "page";
        // We need to determine whether keywords should be enabled or not. We only enable keywords if the rule failed on page 1 for a Whitelist or Keyboard Shortcut
        const link = Next.findLink(instance.nextLinkType, instance.nextLinkPath, instance.nextLinkProperty, undefined, items.nextLinkKeywords, undefined, true, false, document);
        instance.nextLinkKeywordsEnabled = link.method === "keyword";
        instance.nextLinkKeyword = link.keywordObject;
        Scroll.setInstance(instance);
        // await start();
      }
      await Scroll.start();
      instance = Scroll.getInstance();
    } else {
      await Promisify.runtimeSendMessage({receiver: "background", greeting: "turnOff"});
      // Note that we do not have to call stop() here ourselves. The background will send this tab a message to stop and also update its copy of the storage items and send the "off" badge icon
      // TODO: This is a bit hacky, but we need to update the popup with a stopped instance here
      instance.enabled = instance.multiEnabled = instance.autoEnabled = instance.autoPaused = instance.autoSlideshow = instance.shuffleURLs = false;
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    performAction
  };

})();