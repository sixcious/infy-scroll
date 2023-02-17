/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Requestify handles making HTTP requests via the fetch and XHR APIs.
 *
 * The core function is the request() function.
 *
 * Note: The name "Requestify" is used instead of the reserved interface name, {@link Request}.
 */
const Requestify = (() => {

  /**
   * Makes an HTTP request via the specified API and returns its response (document).
   *
   * This function attempts to use the specified API to make the request and falls back to the other API if an error was
   * encountered and if fallback is true.
   *
   * @param {string} url - the url to request
   * @param {string} documentCharacterSet - the document's character set (used by the fetch api)
   * @param {string} documentContentType - the document's contentType (used by the fetch api)
   * @param {string} method - the HTTP request method (e.g. "GET")
   * @param {string} api - the api to use to make the request (e.g. "fetch")
   * @param {boolean} fallback - true if this should fallback to use another api to make the request, false otherwise
   * @return {{doc: Document, api: string}} the response as a document and the api used to get it
   * @public
   */
  async function request(url, documentCharacterSet, documentContentType, method = "GET", api = "fetch", fallback = true) {
    console.log("request() - url=" + url + ", documentCharacterSet=" + documentCharacterSet + ", documentContentType=" + documentContentType + ", method=" + method + ", api=" + api + ", fallback=" + fallback);
    let doc;
    try {
      switch (api) {
        case "xhr":
          doc = await xhrify(url, method, "document");
          break;
        // case "fetch":
        default:
          doc = await fetchify(url, documentCharacterSet, documentContentType, method);
          break;
      }
    } catch (e) {
      // If fallback, toggle to the other request api and try again (we set fallback to false after the second request)
      if (fallback) {
        // Wait to avoid making another request so soon
        await Promisify.sleep(1000);
        return await request(url, documentCharacterSet, documentContentType, method, api === "fetch" ? "xhr" : "fetch", false);
      }
      // If we failed both times, reset the api back to the original
      api = api === "fetch" ? "xhr" : "fetch";
    }
    return { doc: doc, api: api };
  }

  /**
   * Makes an HTTP request via the fetch API and returns its response (document).
   *
   * Important: We do not use fetch's standard response.text() here because text() assumes the encoding is UTF-8.
   * Some websites may have different encoding, like SHIFT_JIS for Japanese, so we use response.arrayBuffer() and
   * manually try to use the original document's charset encoding to decode the response text for all subsequent
   * documents.
   *
   * @param {string} url - the url to request
   * @param {string} documentCharacterSet - the document's character set (used by the fetch api)
   * @param {string} documentContentType - the document's contentType (used by the fetch api)
   * @param {string} method - the HTTP request method (e.g. "GET")
   * @returns {Promise<Document>} the response as a document
   * @see https://stackoverflow.com/questions/45512102/can-fetch-do-responsetype-document
   * @see https://stackoverflow.com/a/46784830
   * @private
   */
  async function fetchify(url, documentCharacterSet, documentContentType, method = "GET") {
    // Note: Do not check or trust response.ok or response.status === 404 and return assuming there's no next document. Some websites intentionally or mistakenly return bad error codes even though the site is live!
    const response = await fetch(url, {method: method, credentials: "same-origin"});
    const arrayBuffer = await response.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    const textDecoder = new TextDecoder(documentCharacterSet);
    const string = textDecoder.decode(dataView);
    return new DOMParser().parseFromString(string, documentContentType);
  }

  /**
   * Makes an HTTP request via the XMLHttpRequest (XHR) API and returns its response (document).
   *
   * @param {string} url - the url to request
   * @param {string} method - the HTTP request method (e.g. "GET")
   * @param {string} responseType - the response type, e.g. "document" ("text" is the default if not specified in XHR)
   * @returns {Promise<Document>} the response as a document
   * @private
   */
  function xhrify(url, method = "GET", responseType = "document") {
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

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    request
  };

})();