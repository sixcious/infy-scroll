/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * This is the AJAX append mode's injection script. It disables the page from removing elements and from scrolling the
 * user.
 *
 * Note: We do not use window.addEventListener("message", function) for security considerations.
 * Listening for a unique CustomEvent is much more secure.
 *
 * Important: We must append this script to the page and add the event listener to the page's document in order to
 * disable its window/document/elements. Executing this code "as is" in our content script won't disable the page's
 * objects, thus the reason we need to do it this way. This code must be executed in the page's context, not the content
 * script's context.
 *
 * @see https://stackoverflow.com/questions/9515704/use-a-content-script-to-access-the-page-context-variables-and-functions
 */
(() => {

  // TODO: We can make the event name random by passing in a parameter to this script, like this:
  // const EVENT_AJAX = new URLSearchParams(document.currentScript.src.split("?")[1]).get("eventName");
  const EVENT_AJAX = "InfyScrollAJAX";

  /**
   * Listens to the {@link EVENT_AJAX} event.
   *
   * @param {CustomEvent} event the CustomEvent
   * @private
   */
  function listener(event) {
    console.log(EVENT_AJAX + " - event.detail= " + JSON.stringify(event.detail));
    disableScroll(event.detail);
    disableRemove(event.detail);
  }

  /**
   * Disables the page from scrolling.
   *
   * @param {CustomEvent.detail} detail the CustomEvent's detail
   * @private
   */
  function disableScroll(detail) {
    // Disable Scroll Objects (e.g. window, document, document.documentElement)
    const disableScrollObjects = detail.disableScrollObjects?.split(",");
    const disableScrollFunctions = detail.disableScrollFunctions?.split(",");
    if (disableScrollObjects && disableScrollFunctions) {
      for (const disableScrollObject of disableScrollObjects) {
        // Note: even for window, window["window"] === window returns true
        // @see https://developer.mozilla.org/en-US/docs/Web/API/Window/window
        const array = disableScrollObject.split(".");
        let object = window[array[0]];
        for (let i = 1; i < array.length; i++) {
          object = object[array[i]];
        }
        if (object) {
          for (const disableScrollFunction of disableScrollFunctions) {
            console.log(EVENT_AJAX + "() - disabling: " + disableScrollObject + "." + disableScrollFunction);
            object[disableScrollFunction] = function () {};
          }
        }
      }
    }
    // Disable Scroll Elements
    const disableScrollElementPath = detail.disableScrollElementPath;
    const type = detail.pathType;
    if (disableScrollElementPath && disableScrollFunctions) {
      let elements = [];
      if (type === "selector") {
        const result = document.querySelectorAll(disableScrollElementPath);
        elements = Array.from(result);
      } else {
        const result = document.evaluate(disableScrollElementPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        if (result && result.snapshotLength > 0) {
          for (let i = 0; i < result.snapshotLength; i++) {
            elements.push(result.snapshotItem(i));
          }
        }
      }
      for (const element of elements) {
        for (const disableScrollFunction of disableScrollFunctions) {
          element[disableScrollFunction] = function () {};
        }
      }
    }
  }

  /**
   * Disables the page from removing specific elements.
   *
   * @param {CustomEvent.detail} detail the CustomEvent's detail
   * @private
   */
  function disableRemove(detail) {
    const disableRemoveElementPath = detail.disableRemoveElementPath;
    const disableRemoveFunctions = detail.disableRemoveFunctions?.split(",");
    const type = detail.pathType;
    if (disableRemoveElementPath && disableRemoveFunctions) {
      let container;
      if (type === "selector") {
        container = document.querySelector(disableRemoveElementPath);
      } else {
        container = document.evaluate(disableRemoveElementPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      }
      console.log(EVENT_AJAX + "() - container=");
      console.log(container);
      if (container) {
        [...container.getElementsByTagName("*")].concat(container).forEach(element => {
          for (const disableRemoveFunction of disableRemoveFunctions) {
            // console.log(EVENT_AJAX + "() - disabling: " + (element?.tagName : "") + "." + disableRemoveFunction);
            element[disableRemoveFunction] = function () {};
          }
        });
      }
    }
  }

  document.addEventListener(EVENT_AJAX, listener, false);

})();