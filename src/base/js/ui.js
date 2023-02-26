/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * UI provides user interface functions, such as generating alert messages and clicking buttons.
 */
const UI = (() => {

  /**
   * Generates an alert to display messages.
   *
   * This function is derived from the sample Google extension, Proxy Settings,
   * by Mike West.
   *
   * @param {string[]} messages - the messages array to display, line by line
   * @param {boolean} isError - true if this is an error alert, false otherwise
   * @see https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/_archive/mv2/extensions/proxy_configuration
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
    setTimeout(function () { div.classList.remove("overlay-visible"); document.body.removeChild(div); }, 8000);
  }

  /**
   * Applies a Hover.css effect to elements on click events.
   *
   * @param {Element} el - the element to apply the effect to
   * @param {string} effect - the Hover.css effect (class name) to use
   * @public
   */
  function clickHoverCss(el, effect) {
    // Carefully toggle the Hover.css class using setTimeout() to force a delay
    el.classList.remove(effect);
    setTimeout(function () { el.classList.add(effect); }, 50);
  }

  /**
   * Fires confetti using Canvas Confetti!
   *
   * This function is derived from Canvas Confetti's sample realistic option by catdad.
   *
   * @param {PointerEvent} event - the pointer event that triggered this
   * @see https://www.kirilv.com/canvas-confetti/#realistic
   * @public
   */
  function fireConfetti(event) {
    const options = [
      { particleRatio: 0.25, spread: 26,  startVelocity: 55,              scalar: 1.0, angle: 45  },
      { particleRatio: 0.20, spread: 60,                                  scalar: 1.0, angle: 135 },
      { particleRatio: 0.35, spread: 100,                    decay: 0.81, scalar: 0.8, angle: 60  },
      { particleRatio: 0.10, spread: 120, startVelocity: 25, decay: 0.82, scalar: 1.2, angle: 120 },
      { particleRatio: 0.10, spread: 120, startVelocity: 45,                           angle: 90  }
    ];
    for (const option of options) {
      confetti(Object.assign({ ticks: 300, origin: { x: event.clientX / (document.documentElement?.clientWidth || 1), y: event.clientY / (document.documentElement?.clientHeight || 1) } }, option, { particleCount: Math.floor(200 * option.particleRatio) }));
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    generateAlert,
    clickHoverCss,
    fireConfetti
  };

})();