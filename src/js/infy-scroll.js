/**
 * Infy Scroll
 * @copyright © 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * This file is only used in production releases of Infy Scroll. In order to only use one file as the content script on
 * each page load, we concatenate the multiple content scripts into this one file.
 *
 * Update the manifest.json to only reflect infy-scroll.js as the sole content script.
 * Then insert the following scripts in this order:
 *
 * 1.  promisify.js
 * 2.  util.js
 * 3.  saves.js
 * 4.  next-prev.js
 * 5.  increment-decrement.js
 * 6.  auto.js
 * 7.  action.js
 * 8.  scripts.js
 * 9.  infy.js
 * 10. scroll.js
 */