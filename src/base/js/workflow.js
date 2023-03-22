/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Workflow is a class that handles the workflow business logic of performing actions and appending pages. The
 * core function is the execute() function.
 *
 * The basic workflow:
 * 1. Scroll.shouldAppend() - As the user scrolls, shouldAppend() is called. If true, sets isLoading to true and calls Workflow.execute()
 * 2. Workflow.execute() - Executes the workflow, which is comprised of performing the action and append. There are different workflow types (normal, reverse, control actions)
 *
 * The workflow is in reverse or advance order for special append modes like AJAX and Element Iframe (that is, it does the
 * append and then calls the action early for the next page to avoid a delay with loading the iframe by the time the
 * next page needs to be appended).
 *
 * 1. Normal - Action then Append (Most actions and append modes)
 * 2. Reverse - After the previous Append, performs the Action for the next page in advance (for Element Iframe and AJAX Iframe)
 *
 * There is also a special case of the Normal workflow, where we need to prepend an element (e.g. the divider) before
 * the action is performed.
 *
 * Page 1's Workflow:
 * Workflow does not perform the workflow for the first page. Scroll.start() handles that instead.
 * 1. After the page has loaded, in prepareFirstPage(): create the iframe, perform the action (button click), and start scrolling the iframe
 * 2. When the user reaches the bottom, call append() and import the iframe's elements, then call action() and start scrolling the iframe again
 */
class Workflow {

  /**
   * Fields
   *
   * @param {string[]} MAIN_ACTIONS - the array of all main actions
   * @param {string[]} SUB_ACTIONS - the array of all sub actions
   */
  static #MAIN_ACTIONS = ["next", "prev", "increment", "decrement", "click", "list"];
  static #SUB_ACTIONS = ["down", "up", "auto", "repeat", "return", "blacklist", "whitelist", "power"];

  /**
   * Executes the workflow.
   *
   * @param {string} action - the action to perform (e.g. "next")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @param {Object} extra - (optional) any extra parameters not in the instance that may be needed by the action
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @public
   */
  static async execute(action, caller, extra = {}) {
    console.log("Workflow.execute() - caller=" + caller + ", action=" + action + ", extra=" + extra);
    action = Workflow.#preWorkflow(action, caller);
    const actionPerformed = await Workflow.#mainWorkflow(action, caller, extra);
    await Workflow.#postWorkflow(action, caller, actionPerformed);
    return actionPerformed;
  }

  /**
   * Pre Workflow determines what the final action will be. For example, if the user clicks the "down" button to perform
   * a down action, but there are no pages below the current page, the action resolves to a primary action in order to
   * append the next page.
   *
   * @param {string} action - the action to perform (e.g. "next")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @return {string} the final (resolved) action
   * @private
   */
  static #preWorkflow(action, caller) {
    console.log("preWorkflow()");
    // Handle Down:
    if (action === "down" && !V.instance.autoEnabled && !V.instance.isLoading && ((V.instance.currentPage + 1) > V.pages.length)) {
      // TODO: Write a better check for this isLoading situation, integrating it with the normal appending we do when scrolling. We need to guard against excessive user actions (shortcuts and button clicks). Normal appends via scrolling should handle isLoading properly
      // IMPORTANT: Setting isLoading to true is necessary to guard against the user trying to perform the down command too many times very fast (e.g. holding down the shortcut key or pressing Down Button too rapidly)
      // If the action is no longer a "down" (i.e. it is now the instance.action as changed above), we are now performing the action itself and we should set the instance's isLoading to true.
      // This will avoid performing multiple actions if the user tries to press the Down Shortcut multiple times quickly when on the last page
      console.log("preWorkflow() - changing the down action to the instance.action=" + V.instance.action);
      action = V.instance.action;
      V.instance.isLoading = true;
      // if (!instance.autoEnabled && action === "down") {
      // action = instance.isLoading || instance.currentPage + 1 <= pages.length ? "down" : instance.action;
    }
    // Handle Auto Slideshow:
    if (action === "down" && V.instance.autoEnabled && caller === "auto" && V.instance.autoSlideshow && V.pages.length <= V.instance.autoTimesOriginal) {
      // TODO: Handle Auto Slideshow, should buttons/shortcuts increment or decrement autoTimes?
      // TODO: Also need to handle Up for Auto Slideshow if decrementing auto times
      // If slideshow mode and have enough pages, action is always just down; otherwise Regular auto or slideshow without enough pages is always the scroll action (appends a new page); otherwise it's just going down one page (only slideshow)
      console.log("preWorkflow() - (auto) changing the down action to the instance.action=" + V.instance.action);
      action = V.instance.action;
      V.instance.isLoading = true;
      // V.instance.autoTimes--;
      // if (V.instance.autoEnabled && caller === "auto" && action === "down") {
      // action = V.instance.autoSlideshow && pages.length > V.instance.autoTimesOriginal ? "down" : V.instance.action;
    }
    return action;
  }

  /**
   * Executes the main workflow, performing the action and append. There are different types of workflows, thus the need
   * for this function.
   *
   * @param {string} action - the action to perform (e.g. "next")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @param {Object} extra - (optional) any extra parameters not in the instance that may be needed by the action
   * @return {boolean} true if the action was successfully performed, false otherwise
   * @private
   */
  static async #mainWorkflow(action, caller, extra) {
    console.log("mainWorkflow()");
    let actionPerformed;
    // Workflow 1 - Sub Actions (Just perform the action, these actions do not need to append anything)
    if (Workflow.#SUB_ACTIONS.includes(action)) {
      actionPerformed = await Action.execute(action, caller, extra);
    }
    // Workflow 2 - Reverse Workflow: Append Action
    else if (V.instance.workflowReverse) {
      // If the previous action attempt failed, we don't want to append anything (this includes the divider)
      if (!V.instance.workflowSkipAppend) {
        // We must await this before the action is called so that appendFinally() appends the current page before instance.url is updated
        await Append.execute(caller);
        // // This is when we really want to update the popup with the new current page, but we have to await the action below so we call it now instead of in postWorkflow
        // updatePopup(action, caller);
      }
      // The reason why we await this is mainly due to Iframe.prepareIframe()
      actionPerformed = await Action.execute(action, caller, extra);
      // Should we await this?
      await Iframe.prepareIframe(actionPerformed, caller);
    }
    // Workflow 3 - Normal Workflow: Action Append
    else {
      // Certain actions and append mode combinations need to append (prepend) the divider before the action; otherwise they operate the same as normal workflow
      if (V.instance.workflowPrepend) {
        Append.prepend(caller);
      }
      actionPerformed = await Action.execute(action, caller, extra);
      if (actionPerformed) {
        // Should we await this?
        await Append.execute(caller);
      }
    }
    return actionPerformed;
  }

  /**
   * Executes after the workflow has finished, doing any post workflow tasks or cleanup.
   *
   * After the action is performed, a message is sent to the Popup to update the instance if the action was called by the Popup.
   *
   * @param {string} action - the action to perform (e.g. "next")
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @param {boolean} actionPerformed - whether the action was performed (true) or not (false)
   * @private
   */
  static async #postWorkflow(action, caller, actionPerformed) {
    console.log("postWorkflow()");
    // Handle Auto Slideshow after Down/Up
    if (V.instance.autoEnabled && V.instance.autoSlideshow && caller === "auto" && action === "down") {
      Auto.autoListener();
    }
    // Icon Feedback if debug enabled and if relevant action was performed (e.g. not down, etc.) and other conditions are met (e.g. we don't show feedback if auto is enabled):
    if (V.instance.debugEnabled && actionPerformed && !(V.instance.autoEnabled || (caller === "auto" && V.instance.autoSlideshow)) && !["down", "up", "blacklist", "whitelist", "power"].includes(action) ) {
      // Reset Multi Action to the appropriate badge (increment becomes "incrementm", increment1 becomes "increment")
      const badge = V.instance.multiEnabled ? action === "increment" || action === "decrement" ? action + "m" : action === "increment1" || action === "decrement1" ? action.slice(0, -1) : action : action;
      Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: badge, temporary: true});
    }
    // Send a message to update the popup if it's opened or if this is a relevant action (this process wakes up the Background, so we don't want to always do it)
    // if (caller === "popupClickActionButton" || ["auto", "power", "blacklist", "whitelist"].includes(action)) {
    if (V.instance.popupOpened || caller === "popupClickActionButton" || ["auto", "power", "blacklist", "whitelist"].includes(action)) {
      // If a new page was appended (action is now a MAIN_ACTION), we need to set current page to total pages in case scrolling is smooth (finishes after sending instance to popup)
      if (Workflow.#MAIN_ACTIONS.includes(action)) {
        V.instance.currentPage = V.pages.length;
      }
      Promisify.runtimeSendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: caller, action: action, instance: V.instance});
    }
    // // We call this function in two places; in mainWorkflow if workflowReverse and not a sub action
    // // Otherwise we always call it here in postWorkflow. This if guards against it being called twice if the former condition is true
    // if (Workflow.#SUB_ACTIONS.includes(action) || !instance.workflowReverse) {
    //   updatePopup(action, caller);
    // }
    // Sub Actions end their post workflow here and do not have a delay imposed on them
    if (Workflow.#SUB_ACTIONS.includes(action)) {
      return;
    }
    // We impose a delay on main actions to prevent them from calling the workflow again quickly
    // Note: Scroll.delay() checks scrollDetection and this will call the workflow again if needed
    await Scroll.delay(caller);
  }

  // /**
  //  * Updates the popup with the newly updated instance. This is a separate function because we need to call it early in
  //  * mainWorkflow() if workflowReverse is true so it doesn't await the action and update the popup late.
  //  *
  //  * @param {string} action - the action to perform (e.g. "next")
  //  * @param {string} caller - the caller who called this function (e.g. "popup")
  //  * @private
  //  */
  // function updatePopup(action, caller) {
  //   console.log("updatePopup()");
  //   // Send a message to update the popup if this is a relevant action (this process wakes up the Background, so we don't want to always do it)
  //   if ((caller === "popupClickActionButton") || ["auto", "power", "blacklist", "whitelist"].includes(action)) {
  //     // If a new page was appended (action is now a MAIN_ACTION), we need to set current page to total pages in case scrolling is smooth (finishes after sending instance to popup)
  //     if (MAIN_ACTIONS.includes(action)) {
  //       V.instance.currentPage = V.pages.length
  //     }
  //     Promisify.runtimeSendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: caller, action: action, instance: V.instance});
  //   }
  // }

}