/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Worker is the service worker for the Manifest V3 extension. The manifest file no longer supports multiple background
 * scripts, so the worker imports the scripts every time the background needs to run.
 *
 * Note: No name is used for this object because of the reserved interface name, {@link Worker}.
 *
 * @see https://stackoverflow.com/questions/66406672/chrome-extension-mv3-modularize-service-worker-js-file
 */
(() => {

  console.log("Service Worker Started");

  try {
    importScripts("promisify.js", "util.js", "database.js", "storage.js", "background.js");
  } catch (e) {
    console.log(e);
  }

})();