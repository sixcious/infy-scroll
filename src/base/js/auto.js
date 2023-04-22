/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Auto handles all auto-related tasks and is called when Auto is enabled via the Popup. An inner Timer is
 * maintained that contains the auto state, such as the setTimeout seconds left, and paused/resumed state.
 */
class Auto {

  /**
   * Fields
   *
   * @param {Timer} timer - the Timer that Auto manages
   */
  static timer;

  /**
   * Starts the auto timer for the instance by doing all the necessary start-up work (convenience function).
   * Note that this function will "clear" (stop) any existing Timers that may be running for this instance.
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @public
   */
  static startTimer(caller) {
    console.log("Auto.startTimer() - starting auto timer");
    Auto.#clearTimer();
    Auto.#createTimer();
    // Set starting badge with either normal "auto" badge or repeat badge if it has repeated at least 1 or more times
    if (V.instance.autoRepeatCount === 0 || V.instance.autoBadge === "") {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "auto", temporary: false});
    } else {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "autorepeat", temporary: false});
    }
  }

  /**
   * Stops the auto timer for the instance by doing all the necessary stopping work (convenience function).
   *
   * Note that when Auto stops, it does NOT call the stop action on the instance. The instance resumes in ON status.
   *
   * This function can be called by the following callers and situations:
   *
   * 1. Auto.autoListener() - After Auto expires normally, like when autoTimes reaches 0
   * 2. Action - After the following actions fail: next, prev, click
   * 3. Scroll.stop() - After an off action is performed, the stop() will call this
   * 4. Popup - Whenever the user clicks the ACCEPT Button and Auto is not toggled on
   *
   * @param {string} caller - the caller who called this function (e.g. "popup")
   * @public
   */
  static stopTimer(caller) {
    console.log("Auto.stopTimer() - stopping auto timer");
    Auto.#clearTimer();
    V.instance.autoEnabled = false;
    V.instance.autoPaused = false;
    V.instance.autoSlideshow = false;
    V.instance.autoTimes = V.instance.autoTimesOriginal;
    V.instance.autoRepeatCount = 0;
    if (caller === "auto" || caller === "action") {
      Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "on", temporary: false});
    }
    // Note: We used to set the badge to off in this function but we no longer do it. We instead delegate that to Scroll.stop()
    // Don't set the off badge if popup is just updating the instance (ruins auto badge if auto is re-set) or any badge setting if auto repeat is on
  }

  /**
   * Repeats the instance's auto timer.
   *
   * Auto Repeat Workflow:
   * 1. After auto times reaches 0, AutoListener calls this function with a new deep copy of the instance
   * 2. Auto.repeatTimer() sets autoRepeating to true, sets the instance in Content Script, calls Auto.startTimer()
   * 3. Auto.startTimer() calls Auto.setTimeout()
   * 4. Auto.setTimeout() because autoRepeating is true calls Action.returnToStart()
   * 5. Action.returnToStart() sets autoRepeating to false, resets all the instance properties (including multi, array)
   *
   * Note: This function is no longer public. We moved the call to repeat from Action.stop() to the Auto
   * Listener here
   *
   * @private
   */
  static #repeatTimer() {
    console.log("Auto.repeatTimer() - repeating auto timer");
    V.instance.autoRepeating = true;
    V.instance.autoRepeatCount++;
    Auto.startTimer("repeatTimer");
  }

  /**
   * Sets the instance's auto timeout and then performs the auto action after the time has elapsed.
   *
   * @private
   */
  static #createTimer() {
    const callback = function() {
      // This is the only place and time we have to decrement autoTimes
      V.instance.autoTimes--;
      // 3 Cases: If repeating, return to start, slideshow always down (will be adjusted to instance.action in preWorkflow if needed), regular auto is always instance.action
      const action = V.instance.autoRepeating ? "return" : V.instance.autoSlideshow ? "down" : V.instance.action;
      Workflow.execute(action, "auto");
    };
    const delay = V.instance.autoSeconds * 1000;
    Auto.timer = new Timer(callback, delay);
  }

  /**
   * Clears the instance's auto timeout and deletes the auto timer.
   *
   * @private
   */
  static #clearTimer() {
    if (Auto.timer) {
      Auto.timer.clear();
      Auto.timer = undefined;
    }
  }

  /**
   * Pauses or resumes the instance's auto timer. If the instance is paused, it resumes or vice versa.
   *
   * @public
   */
  static pauseOrResumeTimer() {
    if (Auto.timer) {
      if (!V.instance.autoPaused) {
        console.log("Auto.pauseOrResumeTimer() - pausing auto timer...");
        Auto.timer.pause();
        V.instance.autoPaused = true;
        Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "autopause", temporary: false});
      } else {
        console.log("Auto.pauseOrResumeTimer() - resuming auto timer...");
        Auto.timer.resume();
        V.instance.autoPaused = false;
        // The small window when the auto timer is repeating (REP), show repeat badge if it's times
        if (V.instance.autoBadge === "times" && V.instance.autoRepeating) {
          Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "autorepeat", temporary: false});
        } else if (V.instance.autoBadge === "times" && V.instance.autoTimes !== V.instance.autoTimesOriginal) {
          // We always use normal "auto" badge at start even if badge is times
          Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "autotimes", temporary: false, text: V.instance.autoTimes + ""});
        } else {
          // All other conditions, show the normal auto badge
          Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "auto", temporary: false});
        }
      }
    }
  }

  /**
   * The instance's auto listener that fires when Auto is enabled and each time after an action is performed.
   * Decides whether or not to set the autoTimeout based on the instance's current properties.
   * Also decides when it is time to delete the instance when the auto times count has reached 0.
   *
   * @public
   */
  static autoListener() {
    console.log("Auto.autoListener() - instance.autoTimes=" + V.instance.autoTimes);
    if (V.instance.autoEnabled) {
      // If autoTimes is still greater than 0, set the auto timeout, else handle stopping auto normally
      // Note: Remember, the first time Auto is already done via Popup calling setAutoTimeout()
      if (V.instance.autoTimes > 0) {
        // Clearing the timeout first prevents adding multiple timeouts (e.g. if user manually navigated the auto tab)
        Auto.#clearTimer(V.instance);
        Auto.#createTimer(V.instance);
        // In very rare race situations, the timing of pausing just barely missed registering while the previous Timer was still alive, so we pause again on the new Timer
        if (V.instance.autoPaused) {
          console.log("Auto.autoListener() - rare auto pause race condition, attempting to re-pause it...");
          Auto.timer.pause();
          Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "autopause", temporary: false});
        }
        // If times badge, update the remaining times badge
        else if (V.instance.autoBadge === "times") {
          Promisify.runtimeSendMessage({receiver: "background", greeting: "setBadge", badge: "autotimes", temporary: false, text: V.instance.autoTimes + ""});
        }
      } else {
        // Two possibilities: if auto repeat (slideshow), repeat the auto timer, else stop the auto timer
        // Note: stopping will clearAutoTimeout and removeAutoListener, so we don't have to do it here
        // Workflow.execute("stop", "auto", instance);
        // Handle Auto Slideshow
        if (V.instance.autoSlideshow) {
          // Create a new deep copy of the instance for the repeat
          // repeatTimer(JSON.parse(JSON.stringify(instance)));
          Auto.#repeatTimer(Util.clone(V.instance));
        }
        // Auto has expired normally, return back to enabled/on state (but auto disabled). Do not proceed further to turn off instance
        else {
          // Auto.stopTimer("auto", "on");
          Auto.stopTimer("auto");
        }
        // Update the Popup in case the window is still open (except in Auto Slideshow mode, since that repeats all the time)
        if (!V.instance.autoSlideshow) {
          Promisify.runtimeSendMessage({receiver: "popup", greeting: "updatePopupInstance", caller: "auto", action: "", instance: V.instance});
        }
      }
    }
  }

}

/**
 * The Timer that Auto manages that contains the internal timeout with pause and resume capabilities.
 * It also contains a "wait" state to keep it from setting a timeout before the page has fully loaded,
 * if the user checked the "Wait for the page to fully load" checkbox. (This "wait" state is not used in Infy Scroll.)
 *
 * Note: This class is derived from code written by Tim Down @ stackoverflow.com.
 *
 * @see https://stackoverflow.com/a/3969760
 */
class Timer {

  /**
   * Fields
   *
   * @param {function} callback - the callback function to call when the timer has finished
   * @param {number} delay - the delay timeout to wait (in ms)
   * @param {Object} timeout - the actual set timeout object
   * @param {Date} start - the current time stamp (Date.now)
   * @param {number} remaining - the remaining time left until the timeout will execute the callback
   * @param {boolean} wait - if true, wait until the tab has completely loaded, false otherwise (not used in some extensions/apps)
   */
  callback;
  delay;
  timeout;
  start;
  remaining;
  wait;

  /**
   * The Timer Constructor.
   *
   * @param {function} callback - the callback function to call when the timer has finished
   * @param {number} delay - the delay timeout to wait (in ms)
   */
  constructor(callback, delay) {
    this.callback = callback;
    this.delay = delay;
    this.remaining = delay;
    this.wait = false;
    this.resume();
  }

  /**
   * Resumes the Timer. Note: This function must be explicitly called to "start" the Timer after it is created.
   */
  resume() {
    this.start = Date.now();
    clearTimeout(this.timeout);
    this.timeout = this.wait ? this.timeout : setTimeout(this.callback, this.remaining);
    console.log("Timer.resume() - timeout=" + this.timeout + " start=" + this.start + " delay=" + this.delay + " remaining=" + this.remaining + " wait=" + this.wait);
  }

  /**
   * Clears (Stops) the Timer.
   */
  clear() {
    clearTimeout(this.timeout);
  }

  /**
   * Pauses the Timer.
   */
  pause() {
    clearTimeout(this.timeout);
    this.remaining -= Date.now() - this.start;
    this.remaining = this.remaining < 0 || this.wait ? this.delay : this.remaining;
    console.log("Timer.pause() - timeout=" + this.timeout + " start=" + this.start + " delay=" + this.delay + " remaining=" + this.remaining + " wait=" + this.wait);
  }

  /**
   * Sets the wait boolean parameter.
   * Note: This is optional.
   *
   * @param {boolean} wait - if true, wait until the tab has completely loaded, false otherwise (not used in some extensions/apps)
   */
  setWait(wait) {
    this.wait = wait;
  }

}