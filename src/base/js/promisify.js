/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Promisify is a class that contains promise-based wrappers for common tasks, like getting storage items, getting tabs, and
 * sending messages between different parts of the extension.
 *
 * Because the chrome.* api uses callbacks, Promisify was created for convenience and allows us to use async/await
 * and be coded in a simpler fashion.
 *
 * Note: The name "Promisify" is used instead of the reserved object name, {@link Promise}.
 */
class Promisify {

  /**
   * Gets the storage items via a promise-based wrapper for async/await callers.
   *
   * @param {string|string[]|null} key - (optional) the storage item key to get or null for all items
   * @param {string} namespace - (optional) the storage namespace, either "local", "sync", or "session"
   * @param {string[]} deletes - (optional) the items to delete from the cache; databases and saves are assumed to be deleted
   * @returns {Promise<{}>} the storage items
   * @public
   */
  static storageGet(key = null, namespace = "local", deletes = ["databaseAP", "databaseIS", "saves"]) {
    return new Promise(resolve => {
      chrome.storage[namespace].get(key, items => {
        deletes.forEach(del => { if (del !== key) { delete items[del]; } });
        key && !Array.isArray(key) ? resolve(items[key]) : resolve(items);
      });
    });
  }

  /**
   * Sets the storage items via a promise-based wrapper for async/await callers.
   *
   * @param {Object} items - the storage items to set
   * @param {string} namespace - (optional) the storage namespace, either "local" or "sync"
   * @returns {Promise<{}>}
   * @public
   */
  static storageSet(items, namespace = "local") {
    return new Promise(resolve => {
      chrome.storage[namespace].set(items, resolve);
    });
  }

  /**
   * Removes a storage item via a promise-based wrapper for async/await callers.
   * Example: chrome.storage.local.remove("myStorageItemToRemove");
   *
   * @param {string|string[]} items - the storage items to remove, this can either be a String for one value or Array [] for multiple
   * @param {string} namespace - (optional) the storage namespace, either "local" or "sync"
   * @returns {Promise<{}>}
   * @public
   */
  static storageRemove(items, namespace = "local") {
    return new Promise(resolve => {
      chrome.storage[namespace].remove(items, resolve);
    });
  }

  /**
   * Clears the storage items via a promise-based wrapper for async/await callers.
   *
   * @param {string} namespace - (optional) the storage namespace, either "local" or "sync"
   * @returns {Promise<{}>}
   * @public
   */
  static storageClear(namespace = "local") {
    return new Promise(resolve => {
      chrome.storage[namespace].clear(resolve);
    });
  }

  /**
   * Opens the options page via a promise-based wrapper for async/await callers.
   *
   * @returns {Promise<{}>}
   * @public
   */
  static runtimeOpenOptionsPage() {
    return new Promise(resolve => {
      // chrome.runtime.openOptionsPage(resolve);
      chrome.runtime.openOptionsPage(response => {
        resolve(response);
        if (chrome.runtime.lastError) {
          console.log("runtimeOpenOptionsPage() - lastError= " + chrome.runtime.lastError.message);
        }
      });
    });
  }

  /**
   * Sends a message to the extension's runtime (background) via a promise-based wrapper for async/await callers.
   *
   * @param {Object} message - the message object e.g. {greeting: "doSomething"}
   * @returns {Promise<{}>} the response
   * @public
   */
  static runtimeSendMessage(message) {
    return new Promise(resolve => {
      // TODO: Don't assume this is async and handle it in either the sender or receiver's side
      message.async = true;
      chrome.runtime.sendMessage(message, response => {
        resolve(response);
        if (chrome.runtime.lastError) {
          console.log("runtimeSendMessage() - lastError= " + chrome.runtime.lastError.message);
        }
      });
    });
  }

  /**
   * Sends a message to a tab's content script via a promise-based wrapper for async/await callers.
   *
   * @param {number} tabId - the content script's tab ID to send the message to
   * @param {Object} message - the message object e.g. {greeting: "doSomething"}
   * @returns {Promise<{}>} the response
   * @public
   */
  static tabsSendMessage(tabId, message) {
    return new Promise(resolve => {
      // TODO: Don't assume this is async and handle it in either the sender or receiver's side
      message.async = true;
      chrome.tabs.sendMessage(tabId, message, response => {
        resolve(response);
        if (chrome.runtime.lastError) {
          console.log("tabsSendMessage() - lastError= " + chrome.runtime.lastError.message);
        }
      });
    });
  }

  /**
   * Executes a content script on a given tab via a promise-based wrapper for async/await callers.
   *
   * Important: This should be the only chrome.* api function that handles a reject in the promise.
   * Example Usage: await Promisify.tabsExecuteScript(tabs[0].id, {file: "/js/script.js", runAt: "document_end"});
   *
   * @param {number} tabId - the content script's tab ID to send the message to
   * @param {Object} details - the details object e.g. {file: "my-content-script.js"}
   * @returns {Promise<{}>} the results array of the last statement executed in the content script
   * @public
   */
  static tabsExecuteScript(tabId, details) {
    return new Promise((resolve, reject) => {
      // MV3 Version:
      if (typeof chrome.scripting?.executeScript === "function") {
        chrome.scripting.executeScript(
          { target: {tabId: tabId}, files: [details.file] },
          () => {
            if (chrome.runtime.lastError) {
              console.log("tabsExecuteScript() - lastError= " + chrome.runtime.lastError.message);
              reject(chrome.runtime.lastError.message);
            } else {
              resolve();
            }
          });
      }
      // MV2 Version:
      else {
        chrome.tabs.executeScript(tabId, details, results => {
          if (chrome.runtime.lastError) {
            console.log("tabsExecuteScript() - lastError= " + chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError.message);
          } else {
            resolve(results);
          }
        });
      }
    });
  }

  /**
   * Gets the queried tabs via a promise-based wrapper for async/await callers.
   *
   * @param {Object} queryInfo - (optional) the query object to use
   * @returns {Promise<{}>} the tabs
   * @public
   */
  static tabsQuery(queryInfo = {active: true, lastFocusedWindow: true}) {
    return new Promise(resolve => {
      chrome.tabs.query(queryInfo, tabs => {
        resolve(tabs);
      });
    });
  }

  // Downloadyze:
  // /**
  //  * Commences a download for async/await callers.
  //  *
  //  * Important: This should be the only chrome.* api function that handles a reject in the promise.
  //  *
  //  * @param {Object} options - the download options to use to download an item
  //  * @returns {Promise<{}>} the downloadId of the downloaded item after successfully commencing, or undefined if an error
  //  * @public
  //  */
  // static downloadsDownload(options) {
  //   return new Promise((resolve, reject) => {
  //     chrome.downloads.download(options, downloadId => {
  //       if (chrome.runtime.lastError) {
  //         console.log("downloadsDownload() - " + chrome.runtime.lastError.message);
  //         reject(downloadId);
  //       } else {
  //         resolve(downloadId);
  //       }
  //     });
  //   });
  // }
  //
  // /**
  //  * Cancels a download for async/await callers.
  //  *
  //  * @param {number} downloadId - the id of the download to cancel
  //  * @returns {Promise<{}>}
  //  * @public
  //  */
  // static downloadsCancel(downloadId) {
  //   return new Promise(resolve => {
  //     chrome.downloads.cancel(downloadId, resolve);
  //   });
  // }

  // URL Incrementer:
  // /**
  //  * Requests a permission via a promise-based wrapper for async/await callers.
  //  *
  //  * @param {Object} permission - the permission object to request, e.g. {origins: ["<all_urls>"]}
  //  * @returns {Promise<{}>} true if granted, false if not granted
  //  * @public
  //  */
  // static permissionsRequest(permission) {
  //   return new Promise(resolve => {
  //     chrome.permissions.request(permission, granted => {
  //       console.log("permissionsRequest() - granted=" + granted);
  //       resolve(granted);
  //     });
  //   })
  // }
  //
  // /**
  //  * Removes a permission via a promise-based wrapper for async/await callers.
  //  *
  //  * @param {Object} permission - the permission object to remove, e.g. {origins: ["<all_urls>"]}
  //  * @returns {Promise<{}>} true if removed, false if not removed
  //  * @public
  //  */
  // static permissionsRemove(permission) {
  //   return new Promise(resolve => {
  //     chrome.permissions.remove(permission, removed => {
  //       console.log("permissionsRemove() - removed=" + removed);
  //       resolve(removed);
  //     });
  //   });
  // }

  /**
   * Makes the thread sleep for the specified duration (milliseconds).
   *
   * @param {number} ms - the milliseconds to sleep
   * @returns {Promise<>}
   * @public
   */
  static sleep(ms) {
    // console.log("Promisify.sleep()");
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

}