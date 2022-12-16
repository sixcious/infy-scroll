/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Worker is the service worker for the Manifest V3 extension. The manifest file no longer supports multiple background
 * scripts, so the worker imports the scripts every time the background needs to run.
 *
 * @see https://stackoverflow.com/questions/66406672/chrome-extension-mv3-modularize-service-worker-js-file
 */
const Worker = (() => {

  console.log("Service Worker Started");

  try {
    importScripts("promisify.js", "database.js", "storage.js", "background.js");
  } catch (e) {
    console.log(e);
  }

})();