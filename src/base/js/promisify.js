/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Promisify contains promise-based wrappers for common extension tasks, like getting storage items, getting tabs, and
 * sending messages between different parts of the extension.
 *
 * Because the chrome.* api uses callbacks, this is a convenience object that allows the extension to use async/await
 * and be coded in a simpler fashion.
 */
const Promisify = (() => {

  /**
   * Gets the storage items via a promise-based wrapper for async/await callers.
   *
   * @param key       (optional) the storage item key to get or null for all items
   * @param namespace (optional) the storage namespace, either "local" or "sync"
   * @param deletes   (optional) the items to delete from the cache; databases and saves are assumed to be deleted
   * @returns {Promise<{}>} the storage items
   * @public
   */
  function storageGet(key = null, namespace = "local", deletes = ["databaseAP", "databaseIS", "saves"]) {
    return new Promise(resolve => {
      chrome.storage[namespace].get(key, items => {
        deletes.forEach(del => { if (del !== key) { delete items[del]; } });
        key ? resolve(items[key]) : resolve(items);
      });
    });
  }

  /**
   * Sets the storage items via a promise-based wrapper for async/await callers.
   *
   * @param items     the storage items (object {}) to set
   * @param namespace (optional) the storage namespace, either "local" or "sync"
   * @returns {Promise<{}>}
   * @public
   */
  function storageSet(items, namespace = "local") {
    return new Promise(resolve => {
      chrome.storage[namespace].set(items, resolve);
    });
  }

  /**
   * Removes a storage item via a promise-based wrapper for async/await callers.
   * Example: chrome.storage.local.remove("myStorageItemToRemove");
   *
   * @param items     the storage items to remove, this can either be a String for one value or Array [] for multiple
   * @param namespace (optional) the storage namespace, either "local" or "sync"
   * @returns {Promise<{}>}
   * @public
   */
  function storageRemove(items, namespace = "local") {
    return new Promise(resolve => {
      chrome.storage[namespace].remove(items, resolve);
    });
  }

  /**
   * Clears the storage items via a promise-based wrapper for async/await callers.
   *
   * @param namespace (optional) the storage namespace, either "local" or "sync"
   * @returns {Promise<{}>}
   * @public
   */
  function storageClear(namespace = "local") {
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
  function runtimeOpenOptionsPage() {
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
   * @param message the message object e.g. {greeting: "doSomething"}
   * @returns {Promise<{}>} the response
   * @public
   */
  function runtimeSendMessage(message) {
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
   * @param tabId   the content script's tab ID to send the message to
   * @param message the message object e.g. {greeting: "doSomething"}
   * @returns {Promise<{}>} the response
   * @public
   */
  function tabsSendMessage(tabId, message) {
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
   * @param tabId   the content script's tab ID to send the message to
   * @param details the details object e.g. {file: "my-content-script.js"}
   * @returns {Promise<{}>} the results array of the last statement executed in the contet script
   * @public
   */
  function tabsExecuteScript(tabId, details) {
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
   * @param queryInfo (optional) the query object to use
   * @returns {Promise<{}>} the tabs
   * @public
   */
  function tabsQuery(queryInfo = {active: true, lastFocusedWindow: true}) {
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
  //  * @param options the download options to use to download an item
  //  * @returns {Promise<{}>} the downloadId of the downloaded item after successfully commencing, or undefined if an error
  //  * @public
  //  */
  // function downloadsDownload(options) {
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
  //  * @param downloadId the id of the download to cancel
  //  * @returns {Promise<{}>}
  //  * @public
  //  */
  // function downloadsCancel(downloadId) {
  //   return new Promise(resolve => {
  //     chrome.downloads.cancel(downloadId, resolve);
  //   });
  // }

  // URL Incrementer:
  // /**
  //  * Requests a permission via a promise-based wrapper for async/await callers.
  //  *
  //  * @param permission the permission object to request, e.g. {origins: ["<all_urls>"]}
  //  * @returns {Promise<{}>} true if granted, false if not granted
  //  * @public
  //  */
  // function permissionsRequest(permission) {
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
  //  * @param permission the permission object to remove, e.g. {origins: ["<all_urls>"]}
  //  * @returns {Promise<{}>} true if removed, false if not removed
  //  * @public
  //  */
  // function permissionsRemove(permission) {
  //   return new Promise(resolve => {
  //     chrome.permissions.remove(permission, removed => {
  //       console.log("permissionsRemove() - removed=" + removed);
  //       resolve(removed);
  //     });
  //   });
  // }

  // Infy Scroll:
  /**
   * Makes an XMLHttpRequest to a URL and returns its document via a promise-based wrapper for async/await callers.
   *
   * @param url          the url to make the request to
   * @param method       the HTTP request method, e.g. "GET"
   * @param responseType the request's response type, e.g. "document" ("text" is the default if not specified in XHR)
   * @returns {Promise<>} the response
   * @public
   */
  function xhr(url, method = "GET", responseType = "document") {
    console.log("xhr() - method=" + method + ", responseType=" + responseType + ", url=" + url);
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(method, url);
      request.responseType = responseType;
      request.onload = function (event) {
        console.log("xhr() onload() - request.response=" + request.response);
        resolve(request.response);
      };
      request.onerror = function () {
        console.log("xhr() onerror() - request=" + request);
        reject("xhr() onerror() - promise rejected");
      };
      request.send();
    });
  }

  /**
   * Makes the thread sleep for the specified duration (milliseconds).
   *
   * @param ms the milliseconds to sleep
   * @returns {Promise<>}
   */
  function sleep(ms) {
    console.log("Promisify.sleep()");
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    storageGet,
    storageSet,
    storageRemove,
    storageClear,
    runtimeOpenOptionsPage,
    runtimeSendMessage,
    tabsSendMessage,
    tabsExecuteScript,
    tabsQuery,
    // downloadsDownload,
    // downloadsCancel,
    // permissionsRequest,
    // permissionsRemove,
    xhr,
    sleep
  };

})();