/**
 * Infy Scroll
 * @copyright © 2020 Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Action handles all business logic involving performing actions. The core function is the performAction() function.
 *
 * The following are the four main actions:
 * 1. next/prev           - finds the next or previous link
 * 2. increment/decrement - increments or decrements a URL
 * 3. button              - performs a button click (like a load more button)
 * 4. list                - uses a custom list of URLs (array) to append
 *
 * In addition, the following control actions are handled:
 * 1. stop   - stops the instance and disables it so it doesn't append any more pages (this does not delete the instance)
 * 2. return - returns the instance to the initial state (e.g. page=1), usually only called when in Auto Slideshow mode when it repeats
 * 3. auto   - performs either a "Pause" or "Resume" when Auto is enabled
 *
 * The Off and Stop Actions are different. Turning the extension off implicitly stops each tab's instance. Therefore,
 * an Off always means a Stop will follow.
 *
 * Off Action
 * ---------
 * The off action can only be initiated in the following ways:
 * 1. The Popup Window's "Red Power Off" Button
 * 2. The Options Page's "Current State" Toggle Switch
 * 3. The Keyboard Shortcut Command "off"
 *
 * Stop Action
 * -----------
 * The stop action can only be initiated in the following ways:
 * 1. The Background sends a message to a tab's content script (after receiving an "off" notification)
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
   * @param callback   (optional) the function callback
   * @param document_  (optional) the current cloned document to parse, used in nextPrev()
   * @param document__ (optional) the current live document to parse, used in nextPrev()
   * @public
   */
  async function performAction(action, caller, instance, items, callback, document_, document__) {
    console.log("performAction() - action=" + action + ", caller=" + caller);
    items = items ? items : await Promisify.storageGet();
    document_ = document_ ? document_ : Scroll.getDocument();
    const pages = Scroll.getPages();
    let actionPerformed = false;
    // Pre-Perform Action
    // Handle Down (Non-Auto)
    if (!instance.autoEnabled && action === "down") {
      action = instance.isLoading || instance.currentPage + 1 <= pages.length ? "down" : instance.scrollAction;
      // TODO: Write a better check for this isLoading situation, integrating it with the normal appending we do when scrolling. We need to guard against excessive user actions (shortcuts and button clicks). Normal appends via scrolling should handle isLoading properly
      // IMPORTANT: The following is necessary if the user tries to perform the down command too many times very fast (e.g. holding down the shortcut key or pressing Down Button too rapidly)
      // If the action is no longer a "down" (i.e. it is now the scrollAction as changed above), we are now performing the action itself and we should set the instance's isLoading to true. This will avoid performing multiple increments if the user tries to press the Down Shortcut multiple times quickly when on the last page
      if (action !== "down") {
        console.log("performAction() - changing the down action to the scrollAction and setting the instance isLoading to true because the action is no longer down, action=" + action);
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
      action = instance.autoSlideshow && pages.length > instance.autoTimesOriginal ? "down" : instance.scrollAction;
      // Handle autoTimes
      instance.autoTimes--;
    }
    // Actions: down, up, and off do not have actionPerformed ever set to true because they don't have badges
    switch (action) {
      case "down":
        down(instance, pages);
        break;
      case "up":
        up(instance, pages);
        break;
      case "next": case "prev":
        actionPerformed = nextPrev(action, caller, instance, document_, document__);
        break;
      case "increment": case "decrement":
        actionPerformed = incrementDecrement(action, caller, instance, items);
        break;
      case "button":
        actionPerformed = button(caller, instance);
        break;
      // We treat list the same as increment in Infy Scroll (only one possible direction in list - increment)
      case "list":
        actionPerformed = incrementDecrement(action, caller, instance, items);
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
      case "off":
        await off(caller, instance);
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
      chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: action, temporary: true}, function(response) { if (chrome.runtime.lastError) {} });
    }
    // Only send a message to update the popup if the caller was the popup (this wakes up the Background)
    // TODO: Why aren't we getting the updated instance from Scroll.getInstance() here after the action is performed?
    if (caller === "popupClickActionButton" || action === "off") {
      chrome.runtime.sendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: caller, action: action, instance: instance}, function(response) { if (chrome.runtime.lastError) {} });
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
   * @param instance the instance
   * @param pages    the pages array from Scroll
   * @private
   */
  function down(instance, pages) {
    console.log("down() - instance.currentPage=" + instance.currentPage);
    instance.currentPage = instance.currentPage + 1 < pages.length ? instance.currentPage + 1 : pages.length;
    Scroll.setInstance(instance);
    const page = pages[instance.currentPage - 1];
    if (page && page.point && typeof page.point.scrollIntoView === "function") {
      page.point.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
    }
  }

  /**
   * Performs an "up" action, scrolling the instance one page up.
   * TODO: Should this reside in Scroll?
   *
   * @param instance the instance
   * @param pages    the pages array from Scroll
   * @private
   */
  function up(instance, pages) {
    console.log("up() - instance.currentPage=" + instance.currentPage);
    instance.currentPage = instance.currentPage - 1 >= 1 ? instance.currentPage - 1 : 1;
    Scroll.setInstance(instance);
    const page = pages[instance.currentPage - 1];
    if (page && page.point && typeof page.point.scrollIntoView === "function") {
      page.point.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
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
   * @returns {boolean} true if the action was completed successfully, false otherwise
   * @private
   */
  function nextPrev(action, caller, instance, document_, document__) {
    let actionPerformed = true;
    let result = NextPrev.findNextPrevURL(
      instance[action + "Type"],
      instance[action + "Selector"],
      instance[action + "Xpath"],
      instance[action + "Property"],
      instance[action + "KeywordsEnabled"],
      instance[action + "Keywords"],
      instance.decodeURIEnabled,
      instance.debugEnabled,
      document_);
    // If we didn't find the next or prev url using the current document_ try the live document__
    if (document__ && (!result || !result.url)) {
      console.log("nextPrev() - no result.url using the current document_ so now checking the live document__ ...");
      result = NextPrev.findNextPrevURL(
        instance[action + "Type"],
        instance[action + "Selector"],
        instance[action + "Xpath"],
        instance[action + "Property"],
        instance[action + "KeywordsEnabled"],
        instance[action + "Keywords"],
        instance.decodeURIEnabled,
        instance.debugEnabled,
        document__);
    }
    // We purposely only update the tab if the next/prev result url is different than one we've already appended
    // TODO: We may be still appending duplicate pages sometimes with # params as the only difference
    if (result && result.url && result.url !== instance.url && (!Scroll.getPages() || !Scroll.getPages().find(p => p.url === result.url))) {
      console.log("nextPrev() - result=" + JSON.stringify(result));
      // TODO: We should refactor the code so that the instance URL is only set after the page has been successfully appended... This is so that if there was an error while appending, we can go back here and not get a duplicate URL error
      instance.url = result.url;
      updateTab(caller, instance);
    } else {
      console.log("nextPrev() - " + (result && result.url ? ("duplicate result url found:" + result.url) : " no result found"));
      if (instance.autoEnabled) {
        Auto.stopAutoTimer(instance, "action");
      }
    }
    return actionPerformed;
  }

  /**
   * Performs an increment or decrement action; if error skipping is enabled, delegates to another function.
   *
   * @param action   the action (increment or decrement)
   * @param caller   String indicating who called this function (e.g. command, popup, message)
   * @param instance the instance for this tab
   * @param items    the storage items
   * @returns {boolean} true if the action was completed successfully, false otherwise
   * @private
   */
  function incrementDecrement(action, caller, instance, items) {
    console.log("incrementDecrement()");
    let actionPerformed = false;
    // If incrementDecrementEnabled (can't increment or decrement if no selection was found or not stepping thru the URLs array)
    if ((instance.selection !== "" && instance.selectionStart >= 0) || (instance.urls && instance.urls.length > 0)) {
      actionPerformed = true;
      // Error Skipping: Can't call fetch when it's a local file:// url
      if (!instance.isLocal && instance.errorSkip > 0 && ((instance.errorCodes && instance.errorCodes.length > 0) ||
          (instance.errorCodesCustomEnabled && instance.errorCodesCustom && instance.errorCodesCustom.length > 0))) {
        incrementDecrementErrorSkip(action, caller, instance, instance.errorSkip);
      }
      // Regular:
      else {
        IncrementDecrement.incrementDecrement(action, instance);
        updateTab(caller, instance);
      }
    }
    return actionPerformed;
  }

  /**
   * Performs an increment or decrement action with error skipping.
   *
   * @param action             the action to perform (increment or decrement)
   * @param caller             String indicating who called this function (e.g. command, popup, message)
   * @param instance           the instance containing the URL and parameters used to increment or decrement
   * @param errorSkipRemaining the number of times left to skip while performing this action
   * @private
   */
  function incrementDecrementErrorSkip(action, caller, instance, errorSkipRemaining) {
    console.log("incrementDecrementErrorSkip() - instance.errorCodes=" + instance.errorCodes +", instance.errorCodesCustomEnabled=" + instance.errorCodesCustomEnabled + ", instance.errorCodesCustom=" + instance.errorCodesCustom  + ", errorSkipRemaining=" + errorSkipRemaining);
    IncrementDecrement.incrementDecrement(action, instance);
    if (errorSkipRemaining > 0) {
      // fetch using credentials: same-origin to keep session/cookie state alive (to avoid redirect false flags e.g. after a user logs in to a website)
      fetch(instance.url, { method: "HEAD", credentials: "same-origin" }).then(function(response) {
        if (response && response.status &&
          ((instance.errorCodes && (
            (instance.errorCodes.includes("404") && response.status === 404) ||
            // Note: 301,302,303,307,308 return response.status of 200 and must be checked by response.redirected
            (instance.errorCodes.includes("3XX") && ((response.status >= 300 && response.status <= 399) || response.redirected)) ||
            (instance.errorCodes.includes("4XX") && response.status >= 400 && response.status <= 499) ||
            (instance.errorCodes.includes("5XX") && response.status >= 500 && response.status <= 599))) ||
            (instance.errorCodesCustomEnabled && instance.errorCodesCustom &&
            // response.status + "" because custom array stores string inputs
            (instance.errorCodesCustom.includes(response.status + "") || (response.redirected && ["301", "302", "303", "307", "308"].some(redcode => instance.errorCodesCustom.includes(redcode))))))) {
          console.log("incrementDecrementErrorSkip() - skipping this URL because response.status was in errorCodes or response.redirected, response.status=" + response.status + ", response.redirected=" + response.redirected + ", response.ok=" + response.ok);
          if (!instance.autoEnabled) {
            chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "skip", temporary: true, text: response.redirected ? "RED" : response.status + ""});
          }
          // Recursively call this method again to perform the action again and skip this URL, decrementing errorSkipRemaining
          incrementDecrementErrorSkip(action, caller, instance, errorSkipRemaining - 1);
        } else {
          console.log("incrementDecrementErrorSkip() - not attempting to skip this URL because response.status=" + response.status  + " and it was not in errorCodes. aborting and updating tab");
          updateTab(caller, instance);
        }
      }).catch(e => {
        console.log("incrementDecrementErrorSkip() - a fetch() exception was caught:" + e);
        if (!instance.autoEnabled) {
          chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "skip", temporary: true, text: "ERR"});
        }
        // Recursively call this method again to perform the action again and skip this URL, decrementing errorSkipRemaining
        incrementDecrementErrorSkip(action, caller, instance, errorSkipRemaining - 1);
      });
    } else {
      console.log("incrementDecrementErrorSkip() - exhausted the errorSkip attempts. aborting and updating tab ");
      updateTab(caller, instance);
    }
  }

  /**
   * Performs a button action, like clicking a "load more" button.
   *
   * Note: This function is the only other function that is public. This is the only function whose business logic
   * resides in Action and it needs to be called by Scroll.
   * TODO: Put this in a file called button.js?
   *
   * @param caller   String indicating who called this function (e.g. command, popup, content script)
   * @param instance the instance for this tab
   * @returns {boolean|*} true if the action was completed successfully, false otherwise or details if caller is popup
   * @public
   */
  function button(caller, instance) {
    console.log("button() - type=" + instance.buttonType + ", rule="  + instance.buttonRule + ", method=" + instance.buttonMethod);
    let actionPerformed = false;
    // Stores the exception or error message in order to return it back to the user for feedback (e.g. invalid selector)
    const details = {};
    let element;
    try {
      if (instance.buttonType === "xpath") {
        element = document.evaluate(instance.buttonRule, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      } else {
        element = document.querySelector(instance.buttonRule);
      }
      // Don't click the button if the caller is popup and just checking
      if (instance.buttonMethod === "click" && caller !== "popup") {
        element.click();
      }
      actionPerformed = true;
    } catch(e) {
      console.log("button() - error:" + e);
      details.error = e.message;
      // TODO: Should Auto stop at this point?
      // if (instance.autoEnabled) {
      //   Auto.stopAutoTimer(instance, "action");
      // }
    }
    if (caller === "popup") {
      details.found = !!element;
      details.clickable = !!(element && element.click);
      details.buttonNode = element ? element.nodeName : "";
      return details;
    }
    updateTab(caller, instance);
    return actionPerformed;
  }

  /**
   * Performs an auto action (the auto action is either a pause or resume).
   *
   * @param instance the instance for this tab
   * @returns {boolean} true if the action was completed successfully, false otherwise
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
   * @returns {boolean} true if the action was completed successfully, false otherwise
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
      IncrementDecrementArray.shuffle(pages);
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
    if (page && page.point) {
      page.point.scrollIntoView({behavior: instance.scrollBehavior, block: "start", inline: "start"});
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
   * @returns {boolean} true if the action was completed successfully, false otherwise
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
        // Don't updateTab, just have scroll return to start and return (append new page, look at refactoring this whole method)
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
          const precalculateProps = IncrementDecrementArray.precalculateURLs(instance);
          instance.urls = precalculateProps.urls;
          instance.urlsCurrentIndex = precalculateProps.currentIndex;
        }
      }
      updateTab(caller, instance);
    }
    return actionPerformed;
  }

  /**
   * Performs a turn off action. This is NOT the same thing as a "stop" action. Turning off will ask the Background to
   * send a message to all tabs' content scripts (including this one) to stop themselves.
   *
   * Note: We do not delete the instance in case the user tries to re-start the instance (e.g. opening the Popup again)
   *
   * @param caller   String indicating who called this function (e.g. command, popup, content script)
   * @param instance the instance for this tab
   * @returns {boolean} true if the action was completed successfully, false otherwise
   * @private
   */
  async function off(caller, instance) {
    console.log("off()");
    // Handle on/off state, send message to background to turn off the other instances in all tabs
    await Promisify.storageSet({"on": false});
    await Promisify.runtimeSendMessage({receiver: "background", greeting: "turnOff"});
    // Note that we do not have to call stop() here ourselves. The background will send this tab a message to stop and also update its copy of the storage items and send the "off" badge icon
    // TODO: This is a bit hacky, but we need to update the popup with a disabled instance here (e.g. in case the off was a shortcut command and not a power off button click)
    instance.enabled = instance.multiEnabled = instance.autoEnabled = instance.autoPaused = instance.autoSlideshow = instance.shuffleURLs = false;
    // Note: We send the popup the updated instance at the end of performAction() so we don't have to do it in this function
    // TODO: Make sure that updating the instance here actually updates the instance we are sending to the popup in performAction (i.e. pass by reference style)
    // await Promisify.runtimeSendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: caller, action: "off", instance: instance});
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    performAction,
    button
  };

})();
