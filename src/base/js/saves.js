/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Saves handles all save specific logic, such as adding a new save, deleting a save (by URL), and determining if a
 * URL matches an existing save. Editing saves is done by deleting the existing save and adding a new save.
 */
class Saves {

  /**
   * Adds a new save. Saved URLs can either be Exact URLs, Patterns, or Regular Expressions.
   *
   * Note: This function is also called when editing an existing save. The existing save is deleted and a new save
   * is added in its place.
   *
   * @param {Object} instance - the instance to save
   * @returns {Object} the newly added save with the generated ID
   * @public
   */
  static async addSave(instance) {
    console.log("Saves.addSave() - adding a new saved url, type=" + instance.saveType + ", url=" + instance.saveURL);
    // Get the saves and checks if this ID or URL has already been saved. If it has, deletes the existing save
    const saves = await Saves.deleteSave(instance.saveID, instance.saveURL, false);
    // Generates a new ID by finding the the save with the highest ID and incrementing it by 1 (or 1 if no save exists)
    const id = saves.length > 0 ? Math.max.apply(Math, saves.map(s => s.id)) + 1 : 1;
    // Create the save object
    const save = {};
    save.id = id;
    save.name = instance.saveName;
    save.url = instance.saveURL;
    save.type = instance.saveType;
    save.date = new Date().toJSON();
    save.action = instance.action;
    save.append = instance.append;
    if (instance.comment) {
      save.comment = instance.comment;
    }
    // Only Page, Iframe, and Element append modes utilize lazyLoad so we shouldn't bother saving lazyLoad properties for Media, None, and AJAX
    // In Iframe mode, we only do lazyLoad if it's manual (not auto, which is the default)
    if (instance.lazyLoad && (instance.append === "page" || (instance.append === "iframe" && instance.lazyLoad === "manual") || instance.append === "element")) {
      save.lazyLoad = instance.lazyLoad;
      if (instance.lazyLoad === "manual") {
        save.lazyLoadSource = instance.lazyLoadSource;
        save.lazyLoadDestination = instance.lazyLoadDestination;
      }
    }
    // Only certain sites will use the SPA setting
    if (instance.spa) {
      save.spa = instance.spa;
    }
    if (instance.action === "next" || instance.action === "prev") {
      save[instance.action + "LinkPath"] = instance[instance.action + "LinkPath"];
      if (!(Array.isArray(instance[instance.action + "LinkProperty"]) && instance[instance.action + "LinkProperty"].length === 1 && instance[instance.action + "LinkProperty"][0] === "href")) {
        save[instance.action + "LinkProperty"] = instance[instance.action + "LinkProperty"];
      }
      // nextLinkKeyword will either be true (boolean) or an object (a specific keyword object) or simply nothing
      if (instance[instance.action + "LinkKeyword"] || instance[instance.action + "LinkKeywordsEnabled"]) {
        save[instance.action + "LinkKeyword"] = instance[instance.action + "LinkKeyword"] || instance[instance.action + "LinkKeywordsEnabled"];
      }
    }
    if (instance.action === "increment") {
      save.interval = instance.interval;
      if (instance.saveType === "exact") {
        save.selectionStart = instance.selectionStart;
        save.selectionEnd = instance.selectionEnd;
      } else {
        save.selectionStrategy = instance.selectionStrategy;
      }
      if (instance.selectionStrategy === "custom") {
        save.selectionCustom = instance.selectionCustom;
      }
      if (instance.leadingZeros) {
        save.leadingZeros = instance.leadingZeros;
      }
      save.base = instance.base;
      if (typeof instance.base === "number" && instance.base > 10) {
        save.baseCase = instance.baseCase;
      }
      if (instance.base === "date") {
        save.baseDateFormat = instance.baseDateFormat;
      }
      if (instance.base === "roman") {
        save.baseRoman = instance.baseRoman;
      }
      if (instance.base === "custom") {
        save.baseCustom = instance.baseCustom;
      }
      if (instance.errorSkip > 0) {
        save.errorSkip = instance.errorSkip;
        save.errorCodes = instance.errorCodes;
        if (instance.errorCodes && instance.errorCodes.includes("CUS") && instance.errorCodesCustom) {
          save.errorCodesCustom = instance.errorCodesCustom;
        }
      }
      if (instance.shuffleEnabled && instance.shuffleURLs) {
        save.shuffleURLs = instance.shuffleURLs;
      }
    }
    if (instance.action === "click") {
      save.clickElementPath = instance.clickElementPath;
      if (instance.clickElementDetection === "manual") {
        save.clickElementPosition = instance.clickElementPosition;
      }
    }
    if (instance.action === "list") {
      save.list = instance.list;
      // if (instance.listOptions) {
      //   save.listOptions = instance.listOptions;
      //   if (instance.shuffleEnabled && instance.shuffleURLs) {
      //     save.shuffleURLs = instance.shuffleURLs;
      //   }
      //   if (instance.errorSkip > 0) {
      //     save.errorSkip = instance.errorSkip;
      //     save.errorCodes = instance.errorCodes;
      //     if (instance.errorCodes && instance.errorCodes.includes("CUS") && instance.errorCodesCustom) {
      //       save.errorCodesCustom = instance.errorCodesCustom;
      //     }
      //   }
      // }
    }
    if (instance.append === "iframe") {
      if (instance.iframePageOne) {
        save.iframePageOne = instance.iframePageOne;
      }
      if (!instance.iframeResize) {
        save.iframeResize = instance.iframeResize;
      }
    }
    if (instance.append === "element") {
      save.pageElementPath = instance.pageElementPath;
      if (instance.insertBeforePath) {
        save.insertBeforePath = instance.insertBeforePath;
      }
      if (instance.pageElementIframe) {
        save.pageElementIframe = instance.pageElementIframe;
        if (instance.pageElementIframe === "trim" && !instance.iframeResize) {
          save.iframeResize = instance.iframeResize;
        }
      }
    }
    if (instance.append === "media") {
      save.mediaType = instance.mediaType;
    }
    if (instance.append === "ajax") {
      save.pageElementPath = instance.pageElementPath;
      if (instance.ajaxMode === "native") {
        save.ajaxMode = instance.ajaxMode;
        // AJAX Native Experimental Inputs
        for (const o of ["removeElementPath", "hideElementPath", "disableScrollObjects", "disableScrollElementPath", "disableScrollFunctions", "disableRemoveElementPath", "disableRemoveFunctions"]) {
          if (instance[o]) {
            save[o] = instance[o];
          }
        }
      } else {
        // AJAX Iframe only:
        if (typeof instance.iframeDelay === "number") {
          save.iframeDelay = instance.iframeDelay;
        }
      }
    }
    // These settings below are technically only needed for Element Iframe and AJAX Iframe
    if (instance.append === "ajax" && instance.ajaxMode !== "native" && instance.mirrorPage) {
      save.mirrorPage = instance.mirrorPage;
      if (instance.mirrorPage === "puppet") {
        save.puppet = instance.puppet;
      }
    }
    if (instance.loadElementPath) {
      save.loadElementPath = instance.loadElementPath;
    }
    if (instance.scrollIframeEnabled === false) {
      save.scrollIframeEnabled = false;
    }
    if (instance.transferNode) {
      save.transferNode = instance.transferNode;
    }
    // Scroll Options
    for (const key of Instance.OPTION_KEYS) {
      if (instance.hasOwnProperty("_" + key)) {
        save[key] = instance["_" + key];
      }
    }
    // Type (Fixed or Auto, only save if fixed type)
    for (let type of ["nextLinkType", "prevLinkType", "clickElementType", "pageElementType"]) {
      if (["selector", "xpath", "js"].includes(instance[type + "Mode"])) {
        save[type] = instance[type];
      }
    }
    // Translate the instance back to the source keys
    Instance.translateInstance(save, "instance>source");
    console.log("Saves.addSave() - generated save=" + JSON.stringify(save));
    // Unshift adds the save to the beginning of the saves array
    saves.unshift(save);
    // We always sort URLs by length to allow for more specific URL patterns to be found before more general URL patterns (if length is same, then we sort by earliest ID)
    saves.sort((a, b) => b.url?.length - a.url?.length || a.id - b.id);
    // saves.map(save => console.log({ "length": save.url.length, "id": save.id }));
    await Promisify.storageSet({"saves": saves});
    // Return the save in order for the caller to get the newly generated saveID (to be stored into the instance)
    return save;
  }

  /**
   * Deletes a save by its ID or URL.
   *
   * Note: This function has a boolean argument, writeToStorage, that determines whether or not it will write the new
   * saves array into storage.
   *
   * @param {number} id - the ID to lookup this save by
   * @param {string} url - the URL to lookup this save by
   * @param {boolean} writeToStorage - true if writing to the storage items, false otherwise
   * @returns {Object[]} the new saves array after deleting the save
   * @public
   */
  static async deleteSave(id, url, writeToStorage) {
    console.log("Saves.deleteSave() - id=" + id + ", url=" + url + ", writeToStorage=" + writeToStorage);
    let saves = await Promisify.storageGet("saves");
    // Filter out saves with this URL; this also removes duplicate saves with the same URL (e.g. overwriting an existing save with this url)
    // TODO: Business Logic Decision: Should we filter out the ID e.g. overwrite this save even if it doesn't match the URL anymore?
    // TODO: If yes, we need to add this check into the filter: save.id !== id
    saves = saves && saves.length > 0 ? saves.filter(save => save && save.url !== url) : [];
    // Re-generate IDs in case there is now a gap after filtering, e.g. if deleting ID 3 in this array: [1, 2, 4, 5, ...]
    saves.sort((a, b) => (a.id > b.id) ? 1 : -1);
    for (let i = 0; i < saves.length; i++) {
      if (saves[i]) {
        saves[i].id = i + 1;
      }
    }
    // Resort back to default sort order
    saves.sort((a, b) => b.url?.length - a.url?.length || a.id - b.id);
    // Store the new save in storage before returning to avoid synchronous issues (e.g. addSave will also be writing the saves to storage)
    if (writeToStorage) {
      await Promisify.storageSet({"saves": saves});
    }
    return saves;
  }

  /**
   * Tests if a URL matches a save of any type (exact, pattern, regex).
   *
   * @param {string} url - the URL to match
   * @param {Object} save - the save object
   * @returns {{matches: boolean}} the matches
   * @public
   */
  static matchesSave(url, save) {
    // console.log("Saves.matchesSave() - url=" + url +", save=");
    // console.log(save);
    let result = { matches: false };
    if (url && save && save.url) {
      try {
        switch (save.type) {
          case "exact":
            result = Saves.#matchesExact(url, save);
            break;
          case "pattern":
            result = Saves.#matchesPattern(url, save);
            break;
          // The default will be regex so we don't have to have a type for Save / Database IS sources
          case "regex":
          default:
            result = Saves.#matchesRegularExpression(url, save);
            break;
        }
      } catch (e) {
        console.log("Saves.matchesSave() - Error:");
        console.log(e);
      }
    }
    return result;
  }

  /**
   * Tests if a URL matches an item in a whitelist or blacklist.
   * This is used for multiple lists, including the database blacklist and database whitelist.
   *
   * There are multiple ways a URL can "match" an item in a list:
   * 1. Pattern - The default. Checks if a URL includes the characters in the pattern as a substring or as a wildcard
   * 3. Exact - Exact URL. Surrounded by " "
   * 4. Regex - Regular Expression. Surrounded by / /
   * 5. Alternative Exact - For matching Database URLs. Surrounded by ( )
   *
   * Alternative Exact Note:
   * The altURL is used to match only against database URLs. For example, you can exclude Database Generic Items like:
   * ^https?://. ^https?://.+ ^https?://.. ^https?://...
   * SPECIFICALLY, and without having to exclude ALL Database URLs that would match those items in using a regular
   * expression or pattern.
   *
   * @param {string} url - the URL to match (the actual tab URL)
   * @param {string} altURL - the alternative URL to match (e.g. the database URL, not tab URL; only applies to database lists)
   * @param {string[]} list - the array of url patterns or regular expressions that might match the url
   * @param {string} listName - the name of the list (e.g. "Whitelist", "Database Blacklist", "Database Whitelist"); this is only used for console logging
   * @returns {{type: string, matches: boolean, url: string}} the matches
   * @public
   */
  static matchesList(url, altURL, list, listName) {
    console.log("Saves.matchesList() - url=" + url + ", altURL=" + altURL + ", list=" + list + ", listName=" + listName);
    const result = { matches: false, url: "", type: "" };
    for (let item of list) {
      // TODO: In the case of Exact, Regex, and Alt, Make result.url = item.slice(1,-1)? But we need to save the "type" when reporting the URL in the Popup Hover/Title Icon (for possibly database white/blacklists?)
      try {
        // Exact "url"
        if (item.startsWith("\"") && item.endsWith("\"") && Saves.#matchesExact(url, {url: item.slice(1,-1)}).matches) {
          result.type = "exact";
        }
        // Alt (url)
        else if (item.startsWith("(") && item.endsWith(")") && Saves.#matchesExact(altURL, {url: item.slice(1,-1)}).matches) {
          result.type = "alt";
        }
        // Regex /url/
        else if (item.startsWith("/") && item.endsWith("/") && Saves.#matchesRegularExpression(url, {url: item.slice(1,-1)}).matches) {
          result.type = "regex";
        }
        // Pattern
        else if (Saves.#matchesPattern(url, {url: item}).matches) {
          result.type = "pattern";
        }
        if (result.type) {
          console.log("Saves.matchesList() - Found a " + listName + " URL (" + result.type + "): " + item);
          result.matches = true;
          result.url = item;
          break;
        }
      } catch (e) {
        console.log("Saves.matchesList() - error checking a " + listName + " URL: " + item + " - Error:");
        console.log(e);
      }
    }
    return result;
  }

  /**
   * Tests if a save matches a URL exactly. This process is somewhat complex in the case of incrementing.
   *
   * @param {string} url - the URL to match
   * @param {Object} save - the save object
   * @returns {{selection: {selectionStart: *, selection: *}, matches: boolean}} the matches with selection
   * @private
   */
  static #matchesExact(url, save) {
    let matches = false;
    let selectionObject = { selection: "", selectionStart: -1 };
    if (url && save) {
      const url1 = url.substring(0, save.selectionStart);
      const url2 = url.substring(url.length - save.selectionEnd);
      selectionObject.selection = url.substring(save.selectionStart, url2 ? url.lastIndexOf(url2) : url.length);
      selectionObject.selectionStart = save.selectionStart;
      // Increment Decrement: We check that the saved url matches exactly with the url with the selection removed (url1 + url2) and validate the selection; if true, we found a match
      // All Other Actions: We simply check the saved url is exactly the same as the url
      if (save.action === "increment" || save.action === "decrement") {
        const validateSelection = Increment.validateSelection(selectionObject.selection, save.base, save.baseCase, save.baseDateFormat, save.baseRoman, save.baseCustom, save.leadingZeros);
        matches = (save.url === (url1 + url2)) && validateSelection === "";
      } else {
        matches = save.url === url;
      }
    }
    // We return the selection so we don't have to find it a second time when preparing the instance object
    return { matches: matches, selection: selectionObject };
  }

  /**
   * Tests if a saved pattern matches a URL.
   * Note: A "pattern" is either a "substring" or "wildcard."
   *
   * @param {string} url - the URL to match
   * @param {Object} save - the save object
   * @returns {{matches: boolean}} the matches
   * @private
   */
  static #matchesPattern(url, save) {
    let matches = false;
    if (url && save) {
      const pattern = save.url;
      // Note that a pattern is either a substring (the URL "includes" it) or a wildcard
      // Wildcard Note 1: We should ensure this is intended to be a wildcard by seeing if it contains at least one asterisk character
      // Wildcard Note 2: The idea here is to convert the wildcard string into a regular expression so we can then simply use the RegExp.test() function
      matches = url.includes(pattern) || (pattern.includes("*") && Util.wildcardToRegularExpression(pattern).test(url));
    }
    return { matches: matches };
  }

  /**
   * Tests if a saved regular expression matches a URL.
   * Note: We do not escape regular expressions.
   *
   * @param {string} url - the URL to match
   * @param {Object} save - the save object
   * @returns {{matches: boolean}} the matches
   * @private
   */
  static #matchesRegularExpression(url, save) {
    let matches = false;
    if (url && save) {
      const regex = save.url;
      matches = new RegExp(regex).test(url);
    }
    return { matches: matches };
  }

}