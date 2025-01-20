/**
 * Infy Scroll
 * @copyright © 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Auto handles all auto-related tasks and is called when Auto is enabled via the Popup. An inner AutoTimer object is
 * maintained that contains the auto state (such as the setTimeout seconds left, and paused/resumed state).
 */
const Auto = (() => {

  /**
   * Variables
   *
   * @param autoTimer the {@link AutoTimer} object
   */
  let autoTimer;

  /**
   * Gets the auto timer.
   * Note that this function is only needed for debugging purposes.
   *
   * @returns {*} the auto timer
   * @public
   * @debug
   */
  function getAutoTimer() {
    return autoTimer;
  }

  /**
   * Starts the auto timer for the instance by doing all the necessary start-up work (convenience method).
   * Note that this function will "clear" (stop) any existing AutoTimers that may be running for this instance.
   *
   * @param instance the instance to start an auto timer for
   * @param caller   the caller asking to start the auto timer
   * @public
   */
  function startAutoTimer(instance, caller) {
    console.log("startAutoTimer() - starting auto timer");
    clearAutoTimeout(instance);
    setAutoTimeout(instance);
    // Set starting badge with either normal "auto" badge or repeat badge if it has repeated at least 1 or more times
    if (instance.autoRepeatCount === 0 || instance.autoBadge === "") {
      chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "auto", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
    } else {
      chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "autorepeat", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
    }
  }

  /**
   * Stops the auto timer for the instance by doing all the necessary stopping work (convenience method).
   *
   * This function can be called by the following callers and situations:
   *
   * 1. Auto.autoListener() - After Auto expires normally, like when autoTimes reaches 0
   * 2. Action.performAction() - After the following actions fail: next, prev, button
   * 3. Scroll.stop() - After an off action is performed, the stop() will call this
   * 4. Popup - Whenever the user clicks the ACCEPT Button and Auto is not toggled on
   *
   * @param instance the instance's auto timer to stop
   * @param caller   the caller asking to stop the auto timer (to determine how to set the badge)
   * @public
   */
  function stopAutoTimer(instance, caller) {
    console.log("stopAutoTimer() - stopping auto timer");
    clearAutoTimeout(instance);
    instance.autoEnabled = false;
    instance.autoPaused = false;
    instance.autoTimes = instance.autoTimesOriginal;
    Scroll.setInstance(instance);
    if (caller === "auto" || caller === "action") {
      chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
    }
    // Note: We used to set the badge to off in this function but we no longer do it. We instead delegate that to Scroll.stop()
    // Don't set the off badge if popup is just updating the instance (ruins auto badge if auto is re-set) or any badge setting if auto repeat is on
  }

  /**
   * Repeats the instance's auto timer.
   *
   * Auto Repeat Workflow:
   * 1. After auto times reaches 0, AutoListener calls this function with a new deep copy of the instance
   * 2. Auto.repeatAutoTimer() sets autoRepeating to true, sets the instance in Content Script, calls Auto.startAutoTimer()
   * 3. Auto.startAutoTimer() calls Auto.setTimeout()
   * 4. Auto.setTimeout() because autoRepeating is true calls Action.returnToStart()
   * 5. Action.returnToStart() sets autoRepeating to false, resets all the instance properties (including multi, array)
   *
   * Note: This function is no longer public. We moved the call to repeat from Action.performAction (stop) to the Auto
   * Listener here
   *
   * @param instance the instance's auto timer to repeat
   * @private
   */
  function repeatAutoTimer(instance) {
    console.log("repeatAutoTimer() - repeating auto timer");
    instance.autoRepeating = true;
    instance.autoRepeatCount++;
    Scroll.setInstance(instance);
    startAutoTimer(instance);
  }

  /**
   * Sets the instance's auto timeout and then performs the auto action after the time has elapsed.
   *
   * @param instance the instance's timeout to set
   * @private
   */
  function setAutoTimeout(instance) {
    autoTimer = new AutoTimer(async function() {
      // If instance is in slideshow mode and auto repeating, return to start; otherwise perform a down action
      if (instance.autoRepeating) {
        Action.performAction("return", "auto", instance);
      } else {
        Action.performAction("down", "auto", instance);
      }
    }, instance.autoSeconds * 1000);
  }

  /**
   * Clears the instance's auto timeout and deletes the auto timer.
   *
   * @param instance the instance's timeout to clear
   * @private
   */
  function clearAutoTimeout(instance) {
    // TODO: We are not using the instance in this function
    if (autoTimer) {
      autoTimer.clear();
      autoTimer = undefined;
    }
  }

  /**
   * Pauses or resumes the instance's auto timer. If the instance is paused, it resumes or vice versa.
   *
   * @param instance the instance's auto timer to pause or resume
   * @public
   */
  function pauseOrResumeAutoTimer(instance) {
    if (autoTimer) {
      if (!instance.autoPaused) {
        console.log("pauseOrResumeAutoTimer() - pausing auto timer...");
        autoTimer.pause();
        instance.autoPaused = true;
        chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "autopause", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
      } else {
        console.log("pauseOrResumeAutoTimer() - resuming auto timer...");
        autoTimer.resume();
        instance.autoPaused = false;
        // The small window when the auto timer is repeating (REP), show repeat badge if it's times
        if (instance.autoBadge === "times" && instance.autoRepeating) {
          chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "autorepeat", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
        } else if (instance.autoBadge === "times" && instance.autoTimes !== instance.autoTimesOriginal) {
          // We always use normal "auto" badge at start even if badge is times
          chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "autotimes", temporary: false, text: instance.autoTimes + ""}, function(response) { if (chrome.runtime.lastError) {} });
        } else {
          // All other conditions, show the normal auto badge
          chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "auto", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
        }
      }
      // Update instance.autoPaused boolean state (This is necessary)
      Scroll.setInstance(instance);
    }
  }


  /**
   * The auto listener that fires when Auto is enabled and each time after an action is performed.
   * Decides whether or not to set the autoTimeout based on the instance's current properties.
   * Also decides when it is time to delete the instance when the auto times count has reached 0.
   *
   * @param instance the instance that auto listens for
   * @public
   */
  function autoListener(instance) {
    // TODO: Investigate if we can potentially handle the autoTimes just here instead of in two separate places outside this function
    // // Handles autoTimes in both situations: when autoListener is called: regularly in appendFinally, or after down in slideshow in performAction
    // if (!instance.autoRepeating) {
    //   instance.autoTimes--;
    // }
    console.log("autoListener() - instance.autoTimes=" + instance.autoTimes);
    if (instance.autoEnabled) {
      // If autoTimes is still greater than 0, set the auto timeout, else handle stopping auto normally
      // Note: Remember, the first time Auto is already done via Popup calling setAutoTimeout()
      if (instance.autoTimes > 0) {
        // Clearing the timeout first prevents adding multiple timeouts (e.g. if user manually navigated the auto tab)
        clearAutoTimeout(instance);
        setAutoTimeout(instance);
        // In very rare race situations, the timing of pausing just barely missed registering while the previous AutoTimer was still alive, so we pause again on the new AutoTimer
        if (instance.autoPaused) {
          console.log("autoListener() - rare auto pause race condition, attempting to re-pause it...");
          autoTimer.pause();
          chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "autopause", temporary: false}, function(response) { if (chrome.runtime.lastError) {} });
        }
        // If times badge, update the remaining times badge
        else if (instance.autoBadge === "times") {
          chrome.runtime.sendMessage({receiver: "background", greeting: "setBadge", badge: "autotimes", temporary: false, text: instance.autoTimes + ""}, function(response) { if (chrome.runtime.lastError) {} });
        }
      } else {
        // Two possibilities: if auto repeat (slideshow), repeat the auto timer, else stop the auto timer
        // Note: stopping will clearAutoTimeout and removeAutoListener, so we don't have to do it here
        // Action.performAction("stop", "auto", instance);
        // Handle Auto Slideshow
        if (instance.autoSlideshow) {
          // Create a new deep copy of the instance for the repeat
          repeatAutoTimer(JSON.parse(JSON.stringify(instance)));
        }
        // Auto has expired normally, return back to enabled/on state (but auto disabled). Do not proceed further to turn off instance
        else {
          stopAutoTimer(instance, "auto", "on");
        }
        // Update the Popup in case the window is still open (except in Auto Slideshow mode, since that repeats all the time)
        instance = Scroll.getInstance();
        if (!instance.autoSlideshow) {
          chrome.runtime.sendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: "auto", action: "", instance: instance}, function(response) { if (chrome.runtime.lastError) {} });
        }
      }
    }
  }

  /**
   * The AutoTimer that contains the internal timeout with pause and resume capabilities.
   * It also contains a "wait" state to keep it from setting a timeout before the page has fully loaded,
   * if the user checked the "Wait for the page to fully load" checkbox. (This "wait" state is not used in Infy Scroll.)
   *
   * Note: This function is derived from code written by Tim Down @ stackoverflow.com.
   *
   * @param callback  the callback function to call when the timer has finished
   * @param delay     the delay timeout to wait (in ms)
   * @see https://stackoverflow.com/a/3969760
   * @private
   */
  function AutoTimer(callback, delay) {

    /**
     * Variables
     *
     * @param timeout   the actual set timeout object
     * @param start     the current time stamp (Date.now)
     * @param remaining the remaining time left until the timeout will execute the callback
     * @param wait      {boolean} if true, wait until the tab has completely loaded, false otherwise (not used in some extensions/apps)
     */
    let timeout;
    let start;
    let remaining = delay;
    let wait = false;

    /**
     * Resumes the AutoTimer. This function will also start the AutoTimer for the first time.
     */
    function resume() {
      start = Date.now();
      clearTimeout(timeout);
      timeout = wait ? timeout : setTimeout(callback, remaining);
      console.log("AutoTimer.resume() - timeout=" + timeout + " start=" + start + " delay=" + delay + " remaining=" + remaining + " wait=" + wait);
    }

    /**
     * Clears (Stops) the AutoTimer.
     */
    function clear() {
      clearTimeout(timeout);
    }

    /**
     * Pauses the AutoTimer.
     */
    function pause() {
      clearTimeout(timeout);
      remaining -= Date.now() - start;
      remaining = remaining < 0 || wait ? delay : remaining;
      console.log("AutoTimer.pause() - timeout=" + timeout + " start=" + start + " delay=" + delay + " remaining=" + remaining + " wait=" + wait);
    }

    /**
     * Sets the wait boolean parameter.
     * Note: This is optional.
     *
     * @param wait_ {boolean} if true, wait until the tab has completely loaded, false otherwise (not used in some extensions/apps)
     */
    function setWait(wait_) {
      wait = wait_;
    }

    // Starts the AutoTimer as soon as it's instantiated
    resume();

    return {
      resume,
      clear,
      pause,
      setWait
    };

  }

  // TODO: Decide on whether we should use a class or function for AutoTimer. Class requires class fields (Chrome 75+)
  // /**
  //  * The AutoTimer that contains the internal timeout with pause and resume capabilities.
  //  * It also contains a "wait" state to keep it from setting a timeout before the page has fully loaded,
  //  * if the user checked the "Wait for the page to fully load" checkbox. (This "wait" state is not used in Infy Scroll.)
  //  *
  //  * Note: This class is derived from code written by Tim Down @ stackoverflow.com.
  //  *
  //  * @see https://stackoverflow.com/a/3969760
  //  * @private
  //  */
  // class AutoTimer {
  //
  //   /**
  //    * Variables (Class Fields, requires Chrome 75+)
  //    *
  //    * @param callback  the callback function to call when the timer has finished
  //    * @param delay     the delay timeout to wait (in ms)
  //    * @param timeout   the actual set timeout object
  //    * @param start     the current time stamp (Date.now)
  //    * @param remaining the remaining time left until the timeout will execute the callback
  //    * @param wait      {boolean} if true, wait until the tab has completely loaded, false otherwise (not used in some extensions/apps)
  //    */
  //   callback;
  //   delay;
  //   timeout;
  //   start;
  //   remaining;
  //   wait;
  //
  //   /**
  //    * The AutoTimer Constructor.
  //    *
  //    * @param callback the callback function to call when the timer has finished
  //    * @param delay    the delay timeout to wait (in ms)
  //    */
  //   constructor(callback, delay) {
  //     this.callback = callback;
  //     this.delay = delay;
  //     this.remaining = delay;
  //     this.wait = false;
  //     this.resume();
  //   }
  //
  //   /**
  //    * Resumes the AutoTimer. Note: This function must be explicitly called to "start" the AutoTimer after it is created.
  //    */
  //   resume() {
  //     this.start = Date.now();
  //     clearTimeout(this.timeout);
  //     this.timeout = this.wait ? this.timeout : setTimeout(this.callback, this.remaining);
  //     console.log("AutoTimer.resume() - timeout=" + this.timeout + " start=" + this.start + " delay=" + this.delay + " remaining=" + this.remaining + " wait=" + this.wait);
  //   }
  //
  //   /**
  //    * Clears (Stops) the AutoTimer.
  //    */
  //   clear() {
  //     clearTimeout(this.timeout);
  //   }
  //
  //   /**
  //    * Pauses the AutoTimer.
  //    */
  //   pause() {
  //     clearTimeout(this.timeout);
  //     this.remaining -= Date.now() - this.start;
  //     this.remaining = this.remaining < 0 || this.wait ? this.delay : this.remaining;
  //     console.log("AutoTimer.pause() - timeout=" + this.timeout + " start=" + this.start + " delay=" + this.delay + " remaining=" + this.remaining + " wait=" + this.wait);
  //   }
  //
  //   /**
  //    * Sets the wait boolean parameter.
  //    * Note: This is optional.
  //    *
  //    * @param wait {boolean} if true, wait until the tab has completely loaded, false otherwise (not used in some extensions/apps)
  //    */
  //   setWait(wait) {
  //     this.wait = wait;
  //   }
  //
  // }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    getAutoTimer,
    startAutoTimer,
    stopAutoTimer,
    pauseOrResumeAutoTimer,
    autoListener
  };

})();