/**
 * Infy Scroll
 * @copyright © 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * UI provides user-interface specific logic, such as generating alert messages and clicking buttons.
 */
const UI = (() => {

  /**
   * Generates an alert to display messages.
   *
   * This function is derived from the sample Google extension, Proxy Settings,
   * by Mike West.
   *
   * @param messages the messages array to display, line by line
   * @param isError  true if this is an error alert, false otherwise
   * @see https://developer.chrome.com/extensions/samples#search:proxy
   * @public
   */
  function generateAlert(messages, isError) {
    const div = document.createElement("div");
    const ul = document.createElement("ul");
    div.classList.add("overlay");
    if (isError) {
      messages.unshift(chrome.i18n.getMessage("oops_error"));
      ul.classList.add("error");
    }
    for (const message of messages) {
      const li = document.createElement("li");
      li.appendChild(document.createTextNode(message));
      ul.appendChild(li);
    }
    div.appendChild(ul);
    document.body.appendChild(div);
    setTimeout(function () { div.classList.add("overlay-visible"); }, 10);
    setTimeout(function () { div.classList.remove("overlay-visible"); document.body.removeChild(div); }, 6000);
  }

  /**
   * Applies a Hover.css effect to DOM elements on click events.
   *
   * @param el     the DOM element to apply the effect to
   * @param effect the Hover.css effect (class name) to use
   * @public
   */
  function clickHoverCss(el, effect) {
    // Carefully toggle the Hover.css class using setTimeout() to force a delay
    el.classList.remove(effect);
    setTimeout(function () { el.classList.add(effect); }, 50);
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    generateAlert,
    clickHoverCss
  };

})();