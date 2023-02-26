/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Util provides common utility functions that don't fit in anywhere else.
 */
const Util = (() => {

  /**
   * Throttles the callback function by the specified wait (ms).
   * Note: This function is derived from code written by robertmirro @ github.com.
   * TODO: Investigate using rIC (requestIdleCallback) and rAF (requestAnimationFrame) for appending to the DOM.
   *
   * @param {function} fn - the callback function to throttle
   * @param {number} wait - the time in ms to wait (throttle)
   * @returns {function (): void} the invoked function
   * @see https://gist.github.com/beaucharman/e46b8e4d03ef30480d7f4db5a78498ca#gistcomment-3015837
   * @see https://developer.mozilla.org/docs/Web/API/Document/scroll_event#scroll_event_throttling
   * @public
   */
  function throttle(fn, wait) {
    let previouslyRun = 0;
    let timeout;
    return function invokeFn(...args) {
      const now = Date.now();
      const elapsed = now - previouslyRun;
      clearTimeout(timeout);
      if (elapsed >= wait) {
        console.log("throttle() - executing fn, wait=" + wait + ", elapsed=" + elapsed);
        fn.apply(null, args);
        previouslyRun = now;
      } else {
        timeout = setTimeout(invokeFn.bind(null, ...args), wait - elapsed);
      }
    }
  }

  /**
   * Clones an object via various methods:
   * 1. structuredClone (Chrome 98+)
   * 2. JSON.parse(JSON.stringify())
   *
   * @param {Object} object - the object to clone
   * @param {string} method - the cloning method to use
   * @param {boolean} fallback - true if the method should try and fallback to using other methods, false if not
   * @returns {Object} the cloned object
   * @public
   */
  function clone(object, method = "structuredClone", fallback = true) {
    console.log("clone() - method=" + method + ", fallback=" + fallback);
    let clonedObject;
    try {
      switch (method) {
        case "json":
          clonedObject = JSON.parse(JSON.stringify(object));
          break;
        // case "structuredClone":
        default:
          clonedObject = structuredClone(object);
          break;
      }
    } catch (e) {
      const alternateMethod = method === "structuredClone" ? "json" : "structuredClone";
      console.log("clone() - Error cloning via " + method + ", falling back to " + alternateMethod + ". Error:");
      console.log(e);
      if (fallback) {
        return clone(object, alternateMethod, false);
      }
    }
    return clonedObject;
  }

  /**
   * Determines if a potential URL is a valid URL based on the specific logic to use.
   *
   * @param {string} url - the URL to parse
   * @param {string} logic - the logic to use (e.g. "next-prev" or "default")
   * @param {Object} details - the details object that stores details about this action, such as error messages that were caught
   * @returns {boolean} true if the URL is a valid URL, false otherwise
   * @public
   */
  function isValidURL(url, logic = "default", details = {}) {
    // console.log("isValidURL() - url=" + url + ", logic=" + logic + ", details=" + details);
    let valid = false;
    // Banned protocols for a valid URL Object. Note: We probably want to keep "blob:" for the list action
    const protocols = ["about:", "javascript:", "mailto:"];
    try {
      const urlObject = new URL(url);
      switch (logic) {
        case "next-prev":
        // case "list":
          // Next Prev: A URL must 1) have a href, 2) not be the same URL as this URL, 3) be in the same domain/origin (hostname) due to CORS
          // TODO: Enforcing the href not being window.location.href messes up with us when we are checking for prev urls in the popup...
          // TODO: However, we must do this check now to exclude the URL from being a possible candidate
          // Note that we always get the absolute URL from next.js so we don't have to convert it here with the second argument in the URL constructor
          // Note: Doing the hostname check implicitly bans the protocol mailto: so we don't have to check for that (it seems)
          valid = urlObject && urlObject.href && urlObject.href !== window.location.href && urlObject.hostname === window.location.hostname;
          break;
        // case "protocol-relative":
        //   // Tests if a URL is valid, but also with the assumption that the URL may be a protocol-relative URL
        //   // https://stackoverflow.com/questions/10687099/how-to-test-if-a-url-string-is-absolute-or-relative
        //   // https://en.wikipedia.org/wiki/List_of_URI_schemes
        //   valid = new RegExp("^([a-z]+:)?//", "i").test(url);
        //   break;
        default:
          // Default: A URL must simply not throw an exception and have a href and have a banned protocol like mailto:
          valid = !!urlObject.href && !protocols.includes(urlObject.protocol);
          break;
      }
    } catch (e) {
      console.log("isValidURL() - Error:");
      console.log(e);
      details.error = e.message;
    }
    return valid;
  }

  /**
   * Checks if this URL has a valid file extension.
   *
   * @param {string} url - the URL whose file extension to check
   * @param {string} logic - the logic to use (e.g. "next-prev" or "default")
   * @param {Object} details - the details object that stores details about this action, such as error messages that were caught
   * @returns {boolean} true if the URL has a valid file extension, false otherwise
   * @public
   */
  function isValidExtension(url, logic = "default", details = {}) {
    // TODO: Next Prev should start as true, others false
    let valid = false;
    const extension = findExtension(findFilenameAndExtension(url)).toLowerCase();
    // Images
    // Note: apng (animated png) are usually saved as png. webp, avif, and jxl (jpeg xl) are newer web image formats
    const images =  ["jpg", "jpeg", "png", "gif", "svg", "webp", "avif", "jxl"];
    // Fonts
    const fonts = ["otf", "ttf", "woff", "woff2"];
    // Texts
    // Because the next prev link algorithm is aggressive, we ought to relax it and ignore common text extension
    // filenames like ".css" and ".js" that we know can't possibly be the next link. Note that we only enforce
    // this when checking keywords just in case the user actually WANTS to find css and js next links as a path
    // TODO: Should we also ban html, php, jsp? Probably not...
    const texts = ["css", "ico", "js", "json", "txt", "xml"];
    try {
      switch (logic) {
        case "next-prev":
          valid = !(texts.concat(images).concat(fonts)).includes(extension);
          // TODO: This shouldn't be reported to the user instead if the path fails to find a link, should it?
          // details.error = "invalid extension:" + extension;
          break;
        case "list":
          // Allow images for list in case of append media mode
          valid = !(texts.concat(fonts)).includes(extension);
          // valid = true;
          break;
        case "image":
          valid = images.includes(extension);
          break;
        case "download":
          valid = extension && extension.trim().length > 0 && /^[a-z0-9\\.]+$/i.test(extension) && extension.length <= 8;
          break;
        default:
          break;
      }
    } catch (e) {
      console.log("isValidExtension() - Error:");
      console.log(e);
      // details.error = e.message;
    }
    return valid;
  }

  /**
   * Finds the filename joined together with its extension from a URL.
   *
   * @param {string} url - the URL to parse
   * @returns {string} the filename and extension joined together
   * @public
   */
  function findFilenameAndExtension(url) {
    let filenameAndExtension = "";
    if (url) {
      filenameAndExtension = url.split('#').shift().split('?').shift().split('/').pop();
    }
    return filenameAndExtension;
  }

  /**
   * Finds the filename from a string containing a filename and extension joined together.
   *
   * @param {string} filenameAndExtension - the filename and extension (joined together) to parse
   * @returns {string} the filename (if found)
   * @public
   */
  function findFilename(filenameAndExtension) {
    let filename = "";
    if (filenameAndExtension) {
      filename = filenameAndExtension.split('.').shift();
    }
    return filename;
  }

  /**
   * Finds the extension from a string containing a filename and extension joined together.
   *
   * @param {string} filenameAndExtension - the filename and extension (joined together) to parse
   * @returns {string} the extension (if found)
   * @public
   */
  function findExtension(filenameAndExtension) {
    let extension = "";
    if (filenameAndExtension && filenameAndExtension.includes(".")) {
      extension = filenameAndExtension.split('.').pop();
      // If extension is not valid, throw it out
      // if (!isValidExtension(extension)) {
      //   extension = "";
      // }
    }
    return extension;
  }

  /**
   * Fixes a URL in two ways by comparing it to the location.
   *
   * 1. protocol: Converts a URL's protocol from https to http (or vice versa) if the location's protocol is different
   * 2. hostname: Converts a URL's hostname from www to no wwww (or vice versa) if the location's hostname is different
   *
   * @param {string} url - the url
   * @returns {string} the fixed url
   * @see https://stackoverflow.com/questions/5491196/rewriting-http-url-to-https-using-regular-expression-and-javascript/5491311
   * @public
   */
  function fixURL(url) {
    try {
      const urlo = new URL(url);
      // First fix: protocol (https and http)
      if ((urlo.protocol === "http:" && window.location.protocol === "https:") ||
          (window.location.protocol === "http:" && urlo.protocol === "https:")) {
        url = url.replace(urlo.protocol, window.location.protocol);
        console.log("fixURL() - fixed protocol https/http, url after=" + url);
      }
      // Second fix: hostname (www or no www)
      if ((urlo.hostname.startsWith("www.") && (urlo.hostname.replace("www.", "") === window.location.hostname)) ||
          (window.location.hostname.startsWith("www.") && (window.location.hostname.replace("www.", "") === urlo.hostname))) {
        url = url.replace(urlo.hostname, window.location.hostname);
        console.log("fixURL() - fixed hostname www/no www, url after=" + url);
      }
    } catch (e) {
      console.log("fixURL() - Error:");
      console.log(e);
    }
    return url;
  }

  /**
   * Converts a string with wildcard characters (*) into a regular expression.
   *
   * This lets us provide an "easy" regular expression option for users who don't want to deal with the complexities of
   * the full regex syntax.
   *
   * @param {string} wildcard - the wildcard string
   * @returns {RegExp} the converted regular expression object
   * @see https://gist.github.com/donmccurdy/6d073ce2c6f3951312dfa45da14a420f
   * @public
   */
  function wildcardToRegularExpression(wildcard) {
    return new RegExp("^" + wildcard.split(/\*+/).map(escapeRegularExpression).join(".*") + "$");
  }

  /**
   * Escapes reserved characters in a regular expression string input so that it can be compiled into a regular
   * expression object.
   *
   * @param {string} regex - the regular expression string to escape
   * @returns {string} the escaped regular expression string
   * @see https://developer.mozilla.org/docs/Web/JavaScript/Guide/Regular_Expressions
   * @see https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter
   * @public
   */
  function escapeRegularExpression(regex) {
    // Escapes the following reserved regex characters: . * + $ ? | \ { } ( ) [ ]
    // Note: "$&" Inserts the matched substring (meaning to match the whole string)
    return regex.replace(/[.*+^$?|\\{}()[\]]/g, "\\$&");
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    throttle,
    clone,
    isValidURL,
    isValidExtension,
    findFilenameAndExtension,
    findFilename,
    findExtension,
    fixURL,
    wildcardToRegularExpression,
    escapeRegularExpression
  };

})();