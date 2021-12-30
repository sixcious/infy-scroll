/**
 * Infy Scroll
 * @copyright © 2020 Roy Six
 * @license https://github.com/roysix/infy-scroll/blob/main/LICENSE
 */

/**
 * Saves handles all Saved URL specific logic, such as adding a new save, deleting a save (by URL), and determining if a
 * URL matches an existing save.
 *
 * This also handles Whitelists (which are essentially Saved URLs, except they all use the same default settings).
 */
const Saves = (() => {

  /**
   * Adds a new save. Saved URLs can either be Exact URLs, Patterns, or Regular Expressions.
   *
   * Note: This function is also called when editing an existing save. The existing save is deleted and a new save
   * is added in its place.
   *
   * @param instance the instance properties
   * @returns {Promise<{}>} the newly added save with the generated ID
   * @public
   */
  async function addSave(instance) {
    console.log("addSave() - adding a new saved url, type=" + instance.saveType + ", url=" + instance.saveURL);
    // Get the saves and checks if this ID or URL has already been saved. If it has, deletes the existing save
    const saves = await deleteSave(instance.saveID, instance.saveURL, false);
    // Generates a new ID by finding the the save with the highest ID and incrementing it by 1 (or 1 if no save exists)
    const id = saves.length > 0 ? Math.max.apply(Math, saves.map(s => s.id)) + 1 : 1;
    // Get the current version and store it in the save for future reference
    // TODO: Uncomment this out for 0.7
    // const version = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest() && chrome.runtime.getManifest().version ? chrome.runtime.getManifest().version : "";
    const version = "0.6";
    // Create the save object
    const save = {
      "id": id, "type": instance.saveType, "url": instance.saveURL, "title": instance.saveTitle, "date": new Date().toJSON(), "decodeURIEnabled": instance.decodeURIEnabled,
      "order": instance.saveType === "exact" ? 1 : instance.saveType === "pattern" ? 2 : instance.saveType === "regex" ? 3 : -1,
      "scrollAction": instance.scrollAction, "scrollAppend": instance.scrollAppend,
      "scrollAppendScripts": instance.scrollAppendScripts, "scrollAppendStyles": instance.scrollAppendStyles, "scrollAppendCustomStyles": instance.scrollAppendCustomStyles, "scrollAppendCustomStylesValue": instance.scrollAppendCustomStylesValue,
      "scrollLazyLoad": instance.scrollLazyLoad, "scrollLazyLoadMode": instance.scrollLazyLoadMode, "scrollLazyLoadAttributeSource": instance.scrollLazyLoadAttributeSource, "scrollLazyLoadAttributeDestination": instance.scrollLazyLoadAttributeDestination,
      "scrollElementRule": instance.scrollElementRule, "scrollElementInsertRule": instance.scrollElementInsertRule, "scrollElementType": instance.scrollElementType, "scrollElementIframe": instance.scrollElementIframe,
      "scrollMediaType": instance.scrollMediaType, "scrollWrapFirstPage": instance.scrollWrapFirstPage, "scrollHeightWait": instance.scrollHeightWait,
      "nextType": instance.nextType, "nextSelector": instance.nextSelector, "nextXpath": instance.nextXpath, "nextProperty": instance.nextProperty, "nextKeywordsEnabled": instance.nextKeywordsEnabled,
      "prevType": instance.prevType, "prevSelector": instance.prevSelector, "prevXpath": instance.prevXpath, "prevProperty": instance.prevProperty, "prevKeywordsEnabled": instance.prevKeywordsEnabled,
      "buttonType": instance.buttonType, "buttonRule": instance.buttonRule, "buttonMethod": instance.buttonMethod, "buttonScrollPixels": instance.buttonScrollPixels,
      "list": instance.list, "listArray": instance.listArray,
      "selectionStart": instance.selectionStart, "selectionEnd": instance.selectionEnd, "selectionPriority": instance.selectionPriority, "selectionCustom": instance.selectionCustom,
      "leadingZeros": instance.leadingZeros, "interval": instance.interval,
      "base": instance.base, "baseCase": instance.baseCase, "baseDateFormat": instance.baseDateFormat, "baseRoman": instance.baseRoman, "baseCustom": instance.baseCustom,
      "errorSkip": instance.errorSkip, "errorCodes": instance.errorCodes, "errorCodesCustom": instance.errorCodesCustom,
      "shuffleURLs": instance.shuffleURLs, "shuffleLimit": instance.shuffleLimit,
      "version": version
    };
    console.log("addSave() - generated save=" + JSON.stringify(save));
    // Unshift adds the save to the beginning of the saves array; then we sort it by order and date and save in storage
    saves.unshift(save);
    // We always sort URLs by order (type e.g . regex), then length to allow for more specific URL patterns to be found before more general URL patterns
    saves.sort((a, b) => (a.order > b.order) ? 1 : (a.order === b.order) ? ((a.url && b.url && a.url.length < b.url.length) ? 1 : -1) : -1);
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
   * @param id             the ID to lookup this save by
   * @param url            the URL to lookup this save by
   * @param writeToStorage true if writing to the storage items, false otherwise
   * @returns {Promise<{}>} the new saves array after deleting the save
   * @public
   */
  async function deleteSave(id, url, writeToStorage) {
    console.log("deleteSave() - id=" + id + ", url=" + url + ", writeToStorage=" + writeToStorage);
    let saves = await Promisify.storageGet("saves");
    // Filter out saves with this URL; this also removes duplicate saves with the same URL (e.g. overwriting an existing save with this url)
    // TODO: Business Logic Decision: Should we filter out the ID e.g. overwrite this save even if it doesn't match the URL anymore? If yes, we need to add this check into the filter: save.id !== id &&
    saves = saves && saves.length > 0 ? saves.filter(save => save && save.url !== url) : [];
    // Re-generate IDs in case there is now a gap after filtering, e.g. if deleting ID 3 in this array: [1, 2, 4, 5, ...]
    saves.sort((a, b) => (a.id > b.id) ? 1 : -1);
    for (let i = 0; i < saves.length; i++) {
      if (saves[i]) {
        saves[i].id = i + 1;
      }
    }
    // Resort back to default sort order
    saves.sort((a, b) => (a.order > b.order) ? 1 : (a.order === b.order) ? ((a.url && b.url && a.url.length < b.url.length) ? 1 : -1) : -1);
    // Store the new save in storage before returning to avoid synchronous issues (e.g. addSave will also be writing the saves to storage)
    if (writeToStorage) {
      await Promisify.storageSet({"saves": saves});
    }
    return saves;
  }

  /**
   * Tests if a URL matches a save of any type (exact, pattern, regex).
   *
   * @param url  the URL to match
   * @param save the saved URL (exact, pattern, or regex)
   * @returns {{matches: *}} the matches
   * @public
   */
  function matchesSave(url, save) {
    console.log("matchesSave() - url=" + url +", save=" + JSON.stringify(save));
    let result = { matches: false };
    if (url && save && save.url) {
      try {
        if (save.type === "exact") {
          result = matchesExact(url, save);
        } else if (save.type === "pattern") {
          result = matchesPattern(url, save);
        } else if (save.type === "regex") {
          result = matchesRegularExpression(url, save);
        }
      } catch (e) {
        console.log("matchesSave() - error:" + e);
      }
    }
    return result;
  }

  /**
   * Tests if a URL matches an item in a whitelist or blacklist.
   * This is used for the following 3 lists: whitelist, database blacklist, and database whitelist.
   *
   * There are multiple ways a URL can "match" an item in a list:
   * 1. Pattern - The default. Checks if a URL includes the characters in the pattern as a substring or as a wildcard
   * 3. Exact - Exact URL. Surrounded by " "
   * 4. Regex - Regular Expression. Surrounded by / /
   * 5. Alternative Exact - For matching Database URLs. Surrounded by ( )
   *
   * Alternative Exact Note:
   * The altURL is used to match only against database URLs. For example, you can exclude Database Generic Rules like:
   * ^https?://. ^https?://.+ ^https?://.. ^https?://...
   * SPECIFICALLY, and without having to exclude ALL URLs that would match those rules in using a regular expression or
   * pattern.
   *
   * @param url      the URL to match (the actual tab URL)
   * @param altURL   the alternative URL to match (e.g. the database URL, not tab URL; only applies to database lists)
   * @param list     the list of url patterns or regular expressions that might match the url
   * @param listName the name of the list (e.g. "Whitelist", "Database Blacklist", "Database Whitelist")
   * @returns {{type: string, matches: boolean, url: string}} the matches
   * @public
   */
  function matchesList(url, altURL, list, listName) {
    console.log("matchesList() - url=" + url +", listName=" + listName);
    const result = { matches: false, url: "", type: "" };
    for (let item of list) {
      // TODO: In the case of Exact, Regex, and Alt, Make result.url = item.slice(1,-1)? But we need to save the "type" when reporting the whitelist URL in the Popup Hover/Title Icon (and possibly databse white/blacklists?)
      try {
        // Exact "url"
        if (item.startsWith("\"") && item.endsWith("\"") && matchesExact(url, {url: item.slice(1,-1)}).matches) {
          result.type = "exact";
        }
        // Regex /url/
        else if (item.startsWith("/") && item.endsWith("/") && matchesRegularExpression(url, {url: item.slice(1,-1)}).matches) {
          result.type = "regex";
        }
        // Alt (url)
        else if (item.startsWith("(") && item.endsWith(")") && matchesExact(altURL, {url: item.slice(1,-1)}).matches) {
          result.type = "alt";
        }
        // Pattern
        else if (matchesPattern(url, {url: item}).matches) {
          result.type = "pattern";
        }
        if (result.type) {
          console.log("matchesList() - Found a " + listName + " URL (" + result.type + "): " + item);
          result.matches = true;
          result.url = item;
          break;
        }
      } catch(e) {
        console.log("matchesList() - error checking a " + listName + " URL: " + item + " - " + e);
      }
    }
    return result;
  }

  /**
   * Tests if a saved exact URL matches a URL.
   *
   * @param url  the URL to match
   * @param save the saved exact URL
   * @returns {{selection: {selectionStart: *, selection: *}, matches: *}} the matches with selection
   * @private
   */
  function matchesExact(url, save) {
    const url1 = url.substring(0, save.selectionStart);
    const url2 = url.substring(url.length - save.selectionEnd);
    const selection = url.substring(save.selectionStart, url2 ? url.lastIndexOf(url2) : url.length);
    let matches;
    // Increment Decrement: We check that the saved url matches exactly with the url with the selection removed (url1 + url2) and validate the selection; if true, we found a match
    // All Other Actions: We simply check the saved url is exactly the same as the url
    if (save.scrollAction === "increment" || save.scrollAction === "decrement") {
      const validateSelection = IncrementDecrement.validateSelection(selection, save.base, save.baseCase, save.baseDateFormat, save.baseRoman, save.baseCustom, save.leadingZeros);
      matches = (save.url === (url1 + url2)) && validateSelection === "";
    } else {
      matches = save.url === url;
    }
    // We return the selection so we don't have to find it a second time when preparing the instance object
    return { matches: matches, selection: { selection: selection, selectionStart: save.selectionStart } };
  }

  /**
   * Tests if a saved pattern matches a URL.
   * Note: A "pattern" is either a "substring" or "wildcard."
   *
   * @param url  the URL to match
   * @param save the saved pattern
   * @returns {{matches: *}} the matches
   * @private
   */
  function matchesPattern(url, save) {
    const pattern = save.url;
    // Note that a pattern is either a substring (the URL "includes" it) or a wildcard
    // Wildcard Note 1: We should ensure this is intended to be a wildcard by seeing if it contains at least one asterisk character
    // Wildcard Note 2: The idea here is to convert the wildcard string into a regular expression so we can then simply use the RegExp.test() method
    const matches = url.includes(pattern) || (pattern.includes("*") && Util.wildcardToRegularExpression(pattern).test(url));
    return { matches: matches };
  }

  /**
   * Tests if a saved regular expression matches a URL.
   * Note: We do not escape regular expressions.
   *
   * @param url  the URL to match
   * @param save the saved regular expression
   * @returns {{matches: *}} the matches
   * @private
   */
  function matchesRegularExpression(url, save) {
    const regex = save.url;
    const matches = new RegExp(regex).test(url);
    return { matches: matches };
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    addSave,
    deleteSave,
    matchesSave,
    matchesList
  };

})();