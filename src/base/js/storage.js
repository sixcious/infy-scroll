/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Storage is a class that handles all storage-specific tasks, such as updating data between versions and backing up and restoring data.
 * It features additional helper methods, such as getting the browser name.
 *
 * TODO: Rename this because "Storage" is a reserved interface name. ("Store"?)
 */
class Storage {

  /**
   * Fields
   *
   * @param {string} ID_CHROME - the chrome extension id (used to help determine what browser this is)
   * @param {string} ID_EDGE - the edge extension id (used to help determine what browser this is)
   * @param {string} ID_FIREFOX - the firefox extension id (used to help determine what browser this is)
   */
  static #ID_CHROME = "gdnpnkfophbmbpcjdlbiajpkgdndlino";
  static #ID_EDGE = "fmdemgjiipojpgemeljnbaabjeinicba";
  static #ID_FIREFOX = "infy-scroll@webextensions";

  /**
   * Gets the storage default values (SDV) of the extension.
   *
   * Note: Storage.set can only set top-level JSON objects, avoid using nested JSON objects.
   * Instead, prefix keys that should be grouped together with a label e.g. "auto"
   *
   * @returns {Object} the storage default values object
   * @public
   */
  static getStorageDefaultValues() {
    console.log("getStorageDefaultValues()");
    const version = chrome.runtime.getManifest().version;
    const date = new Date().toJSON();
    const platformName = Storage.#getPlatformName();
    const browserName = Storage.#getBrowserName();
    const _ = {};
    _.version = version;
    _.installVersion = version;
    _.installDate = date;
    _.firstRun = false;
    _.firstVersionRun = false;
    _.browserName = browserName;
    _.platformName = platformName;
    _.on = true;
    _.icon = "system";
    _.theme = "system";
    _.themeVersion = false;
    _.buttonSize = 40;
    _.tooltipsEnabled = true;
    _.extraInputs = false;
    _.preferredPathType = "selector";
    _.drawerCollapsed = false;
    _.action = "next";
    _.append = "page";
    _.interval = 1;
    _.leadingZerosPadByDetection = true;
    _.base = 10;
    _.baseCase = "lowercase";
    _.baseDateFormat = "yyyy/mm/dd";
    _.baseRoman = "latin";
    _.baseCustom = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    _.selectionStrategy = "smart";
    _.selectionCustom = { "url": "", "regex": "", "flags": "", "group": 0, "index": 0 };
    _.shuffleURLs = 100;
    _.errorSkip = 0;
    _.errorCodes = ["404", "3XX"];
    _.errorCodesCustom = [];
    _.nextLinkSelector = "[rel='next']";
    _.nextLinkXpath = "//*[@rel='next']";
    _.nextLinkPath = _.nextLinkSelector;
    _.nextLinkProperty = ["href"];
    _.nextLinkKeywords = ["pnnext", "nextpage", "next>", "next›", "next→", "next»", "nextlink", "next", "olderposts", "olderpost", "moreresults", "loadmore", "showmore", "rightarrow", "arrowright", "angleright", "chevronright", "caretright", "circleright", "squareright", "下一页", "次のページ", "次へ", "次", "다음페이지", "다음", "التالية", "Следующая", "weiter", "suivant", "siguiente", "&gt;", ">", "›", "→", "»", "older", "forward"];
    _.prevLinkSelector = "[rel='prev'],[rel='previous']";
    _.prevLinkXpath = "//*[@rel='prev']|//*[@rel='previous']";
    _.prevLinkPath = _.prevLinkSelector;
    _.prevLinkProperty = ["href"];
    _.prevLinkKeywords = ["pnprev", "previouspage", "prevpage", "<prev", "‹prev", "←prev", "«prev", "previouslink", "prev", "previous", "newerposts", "newerpost", "leftarrow", "arrowleft", "angleleft", "chevronleft", "caretleft", "circleleft", "squareleft", "上一页", "前のページ", "前へ", "前", "이전페이지", "이전", "السابقة", "Предыдущая", "zurück", "précédent", "anterior", "&lt;", "<", "‹", "←", "«", "newer", "backward"];
    _.buttonPosition = 1000;
    _.mediaType = "image";
    _.autoTimes = 10;
    _.autoSeconds = 2;
    _.autoBadge = "times";
    _.autoSlideshow = false;
    _.autoBehavior = "smooth";
    _.autoStart = false;
    _.lazyLoad = "auto";
    _.scrollDetection = "io";
    _.scrollBehavior = "auto";
    _.scrollUpdateAddress = platformName !== "mobile";
    _.scrollUpdateTitle = platformName !== "mobile";
    _.appendThreshold = 500;
    _.appendDelay = 2000;
    _.pageDivider = "element";
    _.pageDividerAlign = "center";
    _.pageDividerButtons = false;
    _.pageOverlay = false;
    _.scrollIcon = true;
    _.scrollLoading = true;
    _.maximumPages = 0;
    _.saves = [];
    _.savesEnabled = true;
    _.savesTemplate = { action: "next", append: "page", nextLink: "[rel='next']", keyword: true, name: "", url: "https://www.example.com", type: "pattern" };
    _.databaseAP = [];
    _.databaseAPDate = null;
    _.databaseAPLocation = null;
    _.databaseAPEnabled = true;
    _.databaseIS = [];
    _.databaseISDate = null;
    _.databaseISLocation = null;
    _.databaseISEnabled = true;
    _.databaseDate = null;
    _.databaseUpdate = 1;
    _.databaseLocation = "jsdelivr.net";
    _.databaseMode = "blacklist";
    _.databaseBlacklist = [];
    _.databaseWhitelist = [];
    _.pickerSize = "maximize";
    _.pickerCorner = "top-left";
    _.pathAlgorithm = "internal";
    _.pathQuote = "single";
    _.pathOptimized = true;
    _.customScriptsEnabled = true;
    _.resizeMediaEnabled = true;
    _.linksNewTabEnabled = true;
    _.customEventsEnabled = false;
    _.debugEnabled = false;
    _.stats = { actions: [0,0,0,0], appends: [0,0,0,0,0,0], elements: [0,0,0,0,0,0] };
    _.statsEnabled = true;
    _.navigationBlacklist = [];
    return _;
  }

  /**
   * Gets this browser's name by examining this extension's ID or by inspecting the navigator.userAgent object.
   *
   * @returns {string} the browser's name in all lowercase letters: "chrome", "edge", "firefox"
   * @private
   */
  static #getBrowserName() {
    const chromeName = "chrome";
    const edgeName = "edge";
    const firefoxName = "firefox";
    // chrome.runtime.id
    const ID = typeof chrome !== "undefined" && chrome && chrome.runtime && chrome.runtime.id ? chrome.runtime.id : "";
    let browserName = ID === Storage.#ID_CHROME ? chromeName : ID === Storage.#ID_EDGE ? edgeName : ID === Storage.#ID_FIREFOX ? firefoxName : "";
    let method = "chrome.runtime.id:" + ID;
    // navigator.userAgent (Note: navigator is still supported in Manifest V3 Service Worker)
    if (!browserName) {
      const UA = typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "";
      browserName = UA.includes("Firefox/") ? firefoxName : UA.includes("Edg/") ? edgeName : chromeName;
      method = "navigator.userAgent:" + UA;
    }
    console.log("getBrowserName() - browserName=" + browserName + ", method=" + method);
    return browserName;
  }

  /**
   * Gets this platform's name. This is primarily needed so we can change to better default settings for mobile users.
   *
   * @returns {string} the platform's name in all lowercase letters: "desktop", "mobile"
   * @private
   */
  static #getPlatformName() {
    // Detect by examining extension API feature support (works for Firefox, but may not be reliable in unofficial Chromium builds?)
    // return !!(typeof chrome !== "undefined" && chrome.commands) ? "desktop" : "mobile";
    // navigator.userAgent (Note: navigator is still supported in Manifest V3 Service Worker)
    const UA = typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "";
    const platformName = /Android|iPad|iPhone|iPod|Kindle|Opera Mini|webOS|Windows Phone/i.test(UA) ? "mobile" : "desktop";
    console.log("getPlatformName() - platformName=" + platformName);
    return platformName;
  }

  /**
   * Performs one-time-only installation work, installing the default storage and then opening the options page.
   *
   * @public
   */
  static async install() {
    console.log("install()");
    const SDV = Storage.getStorageDefaultValues();
    SDV.firstRun = true;
    await Promisify.storageClear();
    await Promisify.storageSet(SDV);
    // Note: When the extension is first installed, we await at least 2 seconds for the Options page to load and set the preferred color before startupListener executes
    await Promisify.runtimeOpenOptionsPage();
    await Promise.all([Database.download(true, true), Promisify.sleep(2000)]);
    await Promisify.runtimeSendMessage({receiver: "options", greeting: "databaseDownloaded"});
  }

  /**
   * Updates a previous version's storage items or jsonData to the current version.
   *
   * @param {string} previousVersion - the previous version of the data
   * @param {Object} jsonData - (optional) the json data object to restore (if restoring data)
   * @returns {Promise<boolean>} true if the update/restore was successful, false otherwise
   * @public
   */
  static async update(previousVersion, jsonData) {
    console.log("update() - previousVersion=" + previousVersion + ", jsonData=" + jsonData);
    let successful = true;
    // Cache storage items in case of error along the way
    let currentItems;
    try {
      currentItems = await Promisify.storageGet(undefined, undefined, []);
      await Storage.#_restoreJson(jsonData);
      await Storage.#_02(previousVersion);
      await Storage.#_03(previousVersion);
      await Storage.#_04(previousVersion);
      await Storage.#_05(previousVersion);
      await Storage.#_06(previousVersion);
      await Storage.#_0606(previousVersion);
      await Storage.#_07(previousVersion);
      await Storage.#_08(previousVersion);
      await Storage.#_firstVersionRun(previousVersion, !!jsonData);
    } catch (e) {
      console.log("update() - error encountered, rolling back storage to currentItems. Error:");
      console.log(e);
      successful = false;
      if (currentItems) {
        await Promisify.storageSet(currentItems);
      }
    }
    return successful;
  }

  /**
   * Restores data from a text file or input and writes it into storage.
   *
   * @param {Object} jsonData - the JSON data to restore
   * @private
   */
  static async #_restoreJson(jsonData) {
    if (!jsonData) {
      return;
    }
    console.log("_restoreJson() - restoring JSON data ...");
    // Need to reacquire the browserName and platformName just in case the user is migrating data from a different browser or platform
    jsonData.browserName = Storage.#getBrowserName();
    jsonData.platformName = Storage.#getPlatformName();
    await Promisify.storageSet(jsonData);
    console.log(JSON.stringify(jsonData));
  }

  /**
   * 0.2 Update:
   * Add new options, force re-download database (if applicable), re-sort saves by ID to remove previously bad id
   * duplicate id generation.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_02(previousVersion) {
    if (previousVersion >= "0.2") {
      return;
    }
    console.log("_02() - updating to 0.2 ...");
    const items = await Promisify.storageGet(undefined, undefined, []);
    console.log("_02() - storageGet=");
    console.log(JSON.stringify(items));
    const shouldDownloadDatabase = items && items.database && items.database.length > 0;
    console.log("_02() shouldDownloadDatabase=" + shouldDownloadDatabase);
    await Promisify.storageSet({
      "version": "0.2",
      "interfaceMessages": true,
      "whitelistEnabled": items && items.whitelist && items.whitelist.length > 0,
      "database": [],
      "databaseDate": null,
      "databaseAutoUpdate": 1,
      "databaseBlacklist": items && items.databaseExclusions ? items.databaseExclusions : [],
      "databaseWhitelist": []
    });
    await Promisify.storageRemove("databaseExclusions");
    let saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
    // Ensure each save has a url and type (there was no validation on this in 0.1)
    saves = saves.filter(save => save.url && save.type);
    // Re-generate IDs in case there is now a gap after filtering, e.g. if deleting ID 3 in this array: [1, 2, 4, 5, ...]
    saves.sort((a, b) => (a.order > b.order) ? 1 : (a.order === b.order) ? ((a.url && b.url && a.url.length < b.url.length) ? 1 : -1) : -1);
    for (let i = 0; i < saves.length; i++) {
      // Set new id and new properties: title and scrollElementInsertRule added in 0.2
      if (saves[i]) {
        saves[i].id = i + 1;
        saves[i].title = "";
        saves[i].scrollElementInsertRule = "";
      }
    }
    // Resort back to default sort order
    saves.sort((a, b) => (a.order > b.order) ? 1 : (a.order === b.order) ? ((a.url && b.url && a.url.length < b.url.length) ? 1 : -1) : -1);
    await Promisify.storageSet({"saves": saves});
    // Force re-download database if the user already had a prior database because 0.1's database is stored in a different format in 0.2+
    if (shouldDownloadDatabase) {
      await Database.download();
    }
  }

  /**
   * 0.3 Update:
   * Reset scroll options to better default values to avoid too many requests, change percentage thresholds to pixels
   * thresholds, add new scripts and styles options.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_03(previousVersion) {
    if (previousVersion >= "0.3") {
      return;
    }
    console.log("_03() - updating to 0.3 ...");
    const items = await Promisify.storageGet(undefined, undefined, []);
    console.log("_03() - storageGet=");
    console.log(JSON.stringify(items));
    // Set new storage items and reset default values for some items
    await Promisify.storageSet({
      "version": "0.3",
      "customScriptsEnabled": true,
      "scrollAppendThresholdPages": items && items.scrollDetection === "io" ? 1 : 0,
      "scrollAppendThresholdPixels": 500,
      "scrollAppendDelay": 2000,
      "scrollAppendScripts": false,
      "scrollAppendStyles": false,
      "buttonScrollPixels": 1000
    });
    // Remove unused storage items
    await Promisify.storageRemove(["script", "scriptStart", "buttonScrollPercentage", "scrollAppendThresholdPercentage"]);
    // Add new properties introduced in 0.3 and remove unused properties to each save object
    const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
    for (const save of saves) {
      save.scrollAppendScripts = false;
      save.scrollAppendStyles = false;
      save.buttonScrollPixels = 1000;
      save.nextKeywordsEnabled = true;
      save.prevKeywordsEnabled = true;
      delete save.buttonScrollPercentage;
    }
    await Promisify.storageSet({"saves": saves});
  }

  /**
   * 0.4 Update:
   * Scroll Append Threshold pixels/pages changes. Also changed Append Element selector rule to target the children of
   * the parent element, not the parent (this affects append element selector saves).
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_04(previousVersion) {
    if (previousVersion >= "0.4") {
      return;
    }
    console.log("_04() - updating to 0.4 ...");
    const items = await Promisify.storageGet(undefined, undefined, []);
    console.log("_04() - storageGet=");
    console.log(JSON.stringify(items));
    // Reset default values for scroll append threshold due to internal algorithm change and new minimum values being 0, not -1
    // Reset scrollElementInsertRule due to selector rule change, add new autoBehavior and on storage items
    await Promisify.storageSet({
      "version": "0.4",
      "scrollAppendThresholdPages": 0,
      "scrollAppendThresholdPixels": 500,
      "scrollElementRule": "body > *",
      "autoBehavior": "smooth",
      "on": true
    });
    // Remove the scrollbar detection option; this option is pretty much irrelevant in scroll listener mode as scroll pixels will always append pages until a scrollbar exists anyway
    await Promisify.storageRemove("scrollbarDetect");
    // Fix saves that use Append Element mode with selector rule type to point to the child elements (not the parent element)
    const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
    for (const save of saves) {
      if (save && save.scrollAppend === "element" && save.scrollElementType === "selector" && save.scrollElementRule && save.scrollElementRule.length > 0) {
        save.scrollElementRule += " > *";
      }
    }
    await Promisify.storageSet({"saves": saves});
  }

  /**
   * 0.5 Update:
   * Reset scrollAction due to Action consolidation. Three new options: scroll divider alignment, scroll icon, scroll
   * wrap first page.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_05(previousVersion) {
    if (previousVersion >= "0.5") {
      return;
    }
    console.log("_05() - updating to 0.5 ...");
    const items = await Promisify.storageGet(undefined, undefined, []);
    console.log("_05() - storageGet=");
    console.log(JSON.stringify(items));
    // Reset scrollAction and add new storage items for two options
    await Promisify.storageSet({
      "version": "0.5",
      "scrollAction": "next",
      "scrollWrapFirstPage": true,
      "scrollDividerAlign": "center",
      "scrollIcon": true
    });
    // Change saves that use Decrement action to Increment with a negative interval due to action consolidation
    const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
    for (const save of saves) {
      if (save) {
        save.scrollWrapFirstPage = false;
        if (save.scrollAction === "decrement") {
          save.scrollAction = "increment";
          save.interval = -save.interval;
        }
      }
    }
    await Promisify.storageSet({"saves": saves});
  }

  /**
   * 0.6 Update:
   * Store browser name, increase button size to 50, scrollWrapFirstPage default change, new options added for iframe
   * height wait, element iframe hybrid, and lazy load script.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_06(previousVersion) {
    if (previousVersion >= "0.6") {
      return;
    }
    console.log("_06() - updating to 0.6 ...");
    const items = await Promisify.storageGet(undefined, undefined, []);
    console.log("_06() - storageGet=");
    console.log(JSON.stringify(items));
    // Storage Items changes - Increase button size if still using default 40px size, make scroll wrap first page false (see certain websites with iframe mode for why)
    await Promisify.storageSet({
      "version": "0.6",
      "browserName": Storage.#getBrowserName(),
      "buttonSize": items && items.buttonSize && items.buttonSize !== 40 ? items.buttonSize : 50,
      "interfaceTheme": false,
      "dynamicSettings": false,
      "nextProperty": items.nextAttribute ? items.nextAttribute : ["href"],
      "prevProperty": items.prevAttribute ? items.prevAttribute : ["href"],
      "scrollWrapFirstPage": false,
      "scrollHeightWait": 0,
      "scrollElementIframe": false,
      "scrollLazyLoad": false,
      "scrollLazyLoadMode": "auto",
      "scrollLazyLoadAttributeSource": "data-src",
      "scrollLazyLoadAttributeDestination": "src"
    });
    // Remove the outdated "Attribute" names as they are now named "Property"
    await Promisify.storageRemove(["nextAttribute", "prevAttribute"]);
    // Add new options and delete unused options to save object
    const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
    for (const save of saves) {
      if (save) {
        save.version = "0.6";
        save.nextProperty = save.nextAttribute;
        save.prevProperty = save.prevAttribute;
        save.scrollHeightWait = 0;
        save.scrollElementIframe = false;
        save.scrollLazyLoad = false;
        save.scrollLazyLoadMode = "auto"
        save.scrollLazyLoadAttributeSource = "data-src";
        save.scrollLazyLoadAttributeDestination = "src";
        delete save.nextAttribute;
        delete save.prevAttribute;
      }
    }
    await Promisify.storageSet({"saves": saves});
    // Whitelist Exact URLs Change (*url*) to ("url")
    let whitelist = items && items.whitelist && items.whitelist.length > 0 ? items.whitelist : [];
    whitelist = whitelist.map(url => {
      return url && url.startsWith("*") && url.endsWith("*") ? "\"" + url.substring(1, url.length - 1) + "\"" : url
    });
    await Promisify.storageSet({"whitelist": whitelist});
    // Database Blacklist Exact URLs Change (*url*) to ("url")
    let databaseBlacklist = items && items.databaseBlacklist && items.databaseBlacklist.length > 0 ? items.databaseBlacklist : [];
    databaseBlacklist = databaseBlacklist.map(url => {
      return url && url.startsWith("*") && url.endsWith("*") ? "\"" + url.substring(1, url.length - 1) + "\"" : url
    });
    await Promisify.storageSet({"databaseBlacklist": databaseBlacklist});
    // Database Whitelist Exact URLs Change (*url*) to ("url")
    let databaseWhitelist = items && items.databaseWhitelist && items.databaseWhitelist.length > 0 ? items.databaseWhitelist : [];
    databaseWhitelist = databaseWhitelist.map(url => {
      return url && url.startsWith("*") && url.endsWith("*") ? "\"" + url.substring(1, url.length - 1) + "\"" : url
    });
    await Promisify.storageSet({"databaseWhitelist": databaseWhitelist});
  }

  /**
   * 0.6.0.6 Update:
   * Make Fix Lazy Load default to true.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_0606(previousVersion) {
    if (previousVersion >= "0.6.0.6") {
      return;
    }
    console.log("_0606() - updating to 0.6.0.6 ...");
    const items = await Promisify.storageGet(undefined, undefined, []);
    console.log("_0606() - storageGet=");
    console.log(JSON.stringify(items));
    // Storage Items changes - scrollLazyLoad is now true by default
    await Promisify.storageSet({
      "version": "0.6.0.6",
      "scrollLazyLoad": true
    });
    // No changes to the saves
  }

  /**
   * 0.7 Update:
   * Rename scrollAction to action, Drawer Closed, Links New Tab extra option, Append Custom Styles, CustomEvents.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_07(previousVersion) {
    if (previousVersion >= "0.7") {
      return;
    }
    console.log("_07() - updating to 0.7 ...");
    const items = await Promisify.storageGet(undefined, undefined, []);
    console.log("_07() - storageGet=");
    console.log(JSON.stringify(items));
    // Storage Items changes - new append custom styles, need to reset the scrollElementRule stuff as we should never save it (it's always different for every page)
    await Promisify.storageSet({
      "version": "0.7",
      "tooltipsEnabled": true,
      "drawerCollapsed": false,
      "action": items && items.scrollAction ? items.scrollAction : "next",
      "linksNewTabEnabled": false,
      "customEventsEnabled": false,
      "databaseCustom": [],
      "databaseCustomEnabled": false,
      "databaseCustomOptions": false,
      "scrollElementRule": "",
      "scrollElementInsertRule": "",
      "scrollElementIframe": false,
      "scrollHeightWait": 0,
      "scrollWrapFirstPage": false,
      "pickerMinimize": "maximize",
      "pickerCorner": "bottom-right"
    });
    // Finally remove decodeURIEnabled from options, but NOT from Saves until the future
    await Promisify.storageRemove(["scrollAction", "decodeURIEnabled", "dynamicSettings", "interfaceImage", "interfaceMessages"]);
    // Saves: new append custom styles
    const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
    for (const save of saves) {
      if (save) {
        save.action = save.scrollAction || "next";
        delete save.scrollAction;
        delete save.version;
      }
    }
    await Promisify.storageSet({"saves": saves});
  }

  /**
   * 0.8 Update:
   * Too much to list.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @private
   */
  static async #_08(previousVersion) {
    if (previousVersion >= "0.8") {
      return;
    }
    console.log("_08() - updating to 0.8 ...");
    let items = await Promisify.storageGet(undefined, undefined, []);
    // To avoid null-checking this every time in this function
    items = items || {};
    console.log("_08() - storageGet=");
    console.log(JSON.stringify(items));
    const databaseEnabled = items.database?.length > 0;
    console.log("_08() databaseEnabled=" + databaseEnabled);
    // Storage Items removals - Remove before adding/changes due to database to databaseAP rename (don't want to risk not having space for both)
    // Forgot to remove autoAction as we are no longer needing it/Remove scrollHeightWait after confirming iFrameResizer will work/Remove shuffleStart
    await Promisify.storageRemove([
      "toolbarIcon", "interfaceTheme",
      "nextSelector", "nextXpath", "nextType", "nextProperty", "nextKeywords",
      "prevSelector", "prevXpath", "prevType", "prevProperty", "prevKeywords",
      "selectionPriority",
      "buttonRule", "buttonType", "buttonMethod", "buttonScrollPixels",
      "database", "databaseAutoActivate", "databaseAutoUpdate",
      "databaseCustom", "databaseCustomEnabled", "databaseCustomOptions",
      "whitelist", "whitelistEnabled",
      "scrollAppend", "scrollWrapFirstPage", "scrollMediaType",
      "scrollElementRule", "scrollElementType", "scrollElementIframe", "scrollElementInsertRule",
      "scrollLazyLoad", "scrollLazyLoadMode", "scrollLazyLoadAttributeSource", "scrollLazyLoadAttributeDestination",
      "scrollAppendScripts", "scrollAppendStyles",
      "scrollDetectionThrottle", "scrollAppendThresholdPixels", "scrollAppendThresholdPages", "scrollAppendDelay",
      "scrollDivider", "scrollDividerAlign", "scrollHeightWait",
      "shuffleLimit", "shuffleStart", "autoAction", "pickerMinimize",
      "currentVersion"
    ]);
    // Storage Items changes - new platformName property, reset buttonPath to "" as we should never save it (it's always different for every page), button properties
    await Promisify.storageSet({
      "version": "0.8",
      // // Keep the versions three characters for simplicity (e.g. 0.6.0.6 should become 0.6)
      // "installVersion": items.installVersion?.substring(0,3) || "0.8",
      "platformName": Storage.#getPlatformName(),
      "icon": items.toolbarIcon || "system",
      "theme": "system",
      "themeVersion": !!items.interfaceTheme,
      "preferredPathType": ["selector", "xpath"].includes(items.nextType) ? items.nextType : "selector",
      "buttonSize": typeof items.buttonSize !== "number" || items.buttonSize === 50 ? 40 : items.buttonSize,
      "scrollLoading": false,
      "appendThreshold": typeof items.scrollAppendThresholdPixels === "number" ? items.scrollAppendThresholdPixels : 500,
      "appendDelay": typeof items.scrollAppendDelay === "number" ? items.scrollAppendDelay : 2000,
      "pageDivider": typeof items.scrollDivider === "string" ? items.scrollDivider : "element",
      "pageDividerAlign": typeof items.scrollDividerAlign === "string" ? items.scrollDividerAlign : "center",
      "pageDividerButtons": false,
      "pageOverlay": typeof items.scrollOverlay === "boolean" ? items.scrollOverlay : false,
      "append": typeof items.scrollAppend === "string" ? items.scrollAppend : "page",
      "nextLinkProperty": ["href"],
      "prevLinkProperty": ["href"],
      "selectionStrategy": items.selectionPriority || "smart",
      "shuffleURLs": 100,
      "buttonPosition": 1000,
      "mediaType": items.scrollMediaType || "image",
      "lazyLoad": items.scrollLazyLoad || "auto",
      // "lazyLoadSource": items && items.scrollLazyLoadAttributeSource ? items.scrollLazyLoadAttributeSource : "data-src",
      // "lazyLoadDestination": items && items.scrollLazyLoadAttributeDestination ? items.scrollLazyLoadAttributeDestination : "src",
      "pickerSize": items.pickerMinimize || "maximize",
      "pathAlgorithm": "internal",
      "pathQuote": "single",
      "pathOptimized": true,
      "savesEnabled": true,
      "databaseAP": items.database || items.databaseAP || [],
      "databaseAPDate": items.databaseAPDate || items.databaseDate || null,
      "databaseAPLocation": items.databaseAPLocation || null,
      "databaseAPEnabled": databaseEnabled || !!items.databaseAPEnabled,
      "databaseIS": items.databaseIS || [],
      "databaseISDate": items.databaseISDate || null,
      "databaseISLocation": items.databaseISLocation || null,
      "databaseISEnabled": databaseEnabled || !!items.databaseISEnabled,
      "databaseLocation": "jsdelivr.net",
      "databaseMode": typeof items.databaseAutoActivate === "boolean" && !items.databaseAutoActivate ? "whitelist" : "blacklist",
      "databaseUpdate": typeof items.databaseAutoUpdate === "number" ? items.databaseAutoUpdate : 1,
      "debugEnabled": false,
      "stats": { actions: [0,0,0,0], appends: [0,0,0,0,0,0], elements: [0,0,0,0,0,0] },
      "statsEnabled": false
    });
    // Next/Prev Selector XPath Double Quote to Single Quote
    if (items.nextSelector === "[rel=\"next\"]") {
      await Promisify.storageSet({"nextLinkSelector": "[rel='next']"});
    }
    if (items.nextXpath === "//*[@rel=\"next\"]") {
      await Promisify.storageSet({"nextLinkXpath": "//*[@rel='next']"});
    }
    if (items.prevSelector === "[rel=\"prev\"],[rel=\"previous\"]") {
      await Promisify.storageSet({"prevSelector": "[rel='prev'],[rel='previous']"});
    }
    if (items.prevXpath === "//*[@rel=\"prev\"]|//*[@rel=\"previous\"]") {
      await Promisify.storageSet({"prevXpath": "//*[@rel='prev']|//*[@rel='previous']"});
    }
    // Next Keywords 0.X > 0.8
    if (items.installVersion && items.nextLinkKeywords && Array.isArray(items.nextLinkKeywords)) {
      const os = [
        {v: "0.1", k: ["pnnext", "nextpage", "next>", "next»", "next→", "next", "moreresults", "olderposts", "olderpost", "older", "forward", "次", "&gt;", ">", "›", "→", "»"]},
        {v: "0.2", k: ["pnnext", "nextpage", "next-page", "next_page", "next>", "next»", "next→", "next", "moreresults", "olderposts", "olderpost", "older", "forward", "次", "&gt;", ">", "›", "→", "»"]},
        {v: "0.3", k: ["pnnext", "nextpage", "next-page", "next_page", "next>", "next»", "next→", "next", "moreresults", "olderposts", "olderpost", "older", "forward", "下一页", "次のページ", "次", "&gt;", ">", "›", "→", "»"]},
        {v: "0.4", k: ["pnnext", "nextpage", "next-page", "next_page", "next>", "next»", "next→", "next", "moreresults", "olderposts", "olderpost", "older", "forward", "下一页", "次のページ", "次", "&gt;", ">", "›", "→", "»"]},
        {v: "0.5", k: ["pnnext", "nextpage", "next-page", "next_page", "next>", "next›", "next→", "next»", "next", "moreresults", "olderposts", "olderpost", "arrow-right", "angle-right", "chevron-right", "caret-right", "circle-right", "square-right", "下一页", "次のページ", "次", "&gt;", ">", "›", "→", "»", "older", "forward"]},
        {v: "0.6", k: ["pnnext", "nextpage", "next-page", "next_page", "next>", "next›", "next→", "next»", "next", "moreresults", "olderposts", "olderpost", "arrow-right", "angle-right", "chevron-right", "caret-right", "circle-right", "square-right", "下一页", "次のページ", "次へ", "次", "&gt;", ">", "›", "→", "»", "older", "forward"]},
        {v: "0.6.0.6", k: ["pnnext", "nextpage", "next-page", "next_page", "next>", "next›", "next→", "next»", "next", "moreresults", "olderposts", "olderpost", "arrow-right", "angle-right", "chevron-right", "caret-right", "circle-right", "square-right", "下一页", "次のページ", "次へ", "次", "&gt;", ">", "›", "→", "»", "older", "forward"]},
        {v: "0.7", k: ["pnnext", "nextpage", "next-page", "next_page", "next>", "next›", "next→", "next»", "next", "moreresults", "olderposts", "olderpost", "right-arrow", "arrow-right", "angle-right", "chevron-right", "caret-right", "circle-right", "square-right", "下一页", "次のページ", "次へ", "次", "다음페이지", "다음", "&gt;", ">", "›", "→", "»", "older", "forward"]}
      ];
      for (const o of os) {
        // Removing this condition so that we don't care what the install version is: items.installVersion === o.v &&
        if (items.nextLinkKeywords.length === o.k.length &&
            items.nextLinkKeywords.every(function (e,i) {
              return e === o.k[i];
            })) {
          console.log("_08() - updating " + "nextLinkKeywords to 0.8 keywords");
          await Promisify.storageSet({"nextLinkKeywords": ["pnnext", "nextpage", "next>", "next›", "next→", "next»", "nextlink", "next", "olderposts", "olderpost", "moreresults", "loadmore", "showmore", "rightarrow", "arrowright", "angleright", "chevronright", "caretright", "circleright", "squareright", "下一页", "次のページ", "次へ", "次", "다음페이지", "다음", "التالية", "Следующая", "weiter", "suivant", "siguiente", "&gt;", ">", "›", "→", "»", "older", "forward"]});
          break;
        }
      }
    }
    // Prev Keywords 0.X > 0.8
    if (items.installVersion && items.prevLinkKeywords && Array.isArray(items.prevLinkKeywords)) {
      const os = [
        {v: "0.1", k: ["pnprev", "previouspage", "<prev", "«prev", "←prev", "prev", "previous", "newerposts", "newerpost", "newer", "前", "&lt;", "<", "‹", "←", "«"]},
        {v: "0.2", k: ["pnprev", "previouspage", "prevpage", "prev-page", "prev_page", "<prev", "«prev", "←prev", "prev", "previous", "newerposts", "newerpost", "newer", "前", "&lt;", "<", "‹", "←", "«"]},
        {v: "0.3", k: ["pnprev", "previouspage", "prevpage", "prev-page", "prev_page", "<prev", "«prev", "←prev", "prev", "previous", "newerposts", "newerpost", "newer", "上一页", "前のページ", "前", "&lt;", "<", "‹", "←", "«"]},
        {v: "0.4", k: ["pnprev", "previouspage", "prevpage", "prev-page", "prev_page", "<prev", "«prev", "←prev", "prev", "previous", "newerposts", "newerpost", "newer", "上一页", "前のページ", "前", "&lt;", "<", "‹", "←", "«"]},
        {v: "0.5", k: ["pnprev", "previouspage", "prevpage", "prev-page", "prev_page", "<prev", "‹prev", "←prev", "«prev", "prev", "previous", "newerposts", "newerpost", "arrow-left", "angle-left", "chevron-left", "caret-left", "circle-left", "square-left", "上一页", "前のページ", "前", "&lt;", "<", "‹", "←", "«", "newer", "backward"]},
        {v: "0.6", k: ["pnprev", "previouspage", "prevpage", "prev-page", "prev_page", "<prev", "‹prev", "←prev", "«prev", "prev", "previous", "newerposts", "newerpost", "arrow-left", "angle-left", "chevron-left", "caret-left", "circle-left", "square-left", "上一页", "前のページ", "前へ", "前", "&lt;", "<", "‹", "←", "«", "newer", "backward"]},
        {v: "0.6.0.6", k: ["pnprev", "previouspage", "prevpage", "prev-page", "prev_page", "<prev", "‹prev", "←prev", "«prev", "prev", "previous", "newerposts", "newerpost", "arrow-left", "angle-left", "chevron-left", "caret-left", "circle-left", "square-left", "上一页", "前のページ", "前へ", "前", "&lt;", "<", "‹", "←", "«", "newer", "backward"]},
        {v: "0.7", k: ["pnprev", "previouspage", "prevpage", "prev-page", "prev_page", "<prev", "‹prev", "←prev", "«prev", "prev", "previous", "newerposts", "newerpost", "left-arrow", "arrow-left", "angle-left", "chevron-left", "caret-left", "circle-left", "square-left", "上一页", "前のページ", "前へ", "前", "이전페이지", "이전", "&lt;", "<", "‹", "←", "«", "newer", "backward"]}
      ];
      for (const o of os) {
        // Removing this condition so that we don't care what the install version is: items.installVersion === o.v &&
        if (items.prevLinkKeywords.length === o.k.length &&
          items.prevLinkKeywords.every(function (e,i) {
            return e === o.k[i];
          })) {
          console.log("_08() - updating prevLinkKeywords to 0.8 keywords");
          await Promisify.storageSet({"prevLinkKeywords": ["pnprev", "previouspage", "prevpage", "<prev", "‹prev", "←prev", "«prev", "previouslink", "prev", "previous", "newerposts", "newerpost", "leftarrow", "arrowleft", "angleleft", "chevronleft", "caretleft", "circleleft", "squareleft", "上一页", "前のページ", "前へ", "前", "이전페이지", "이전", "السابقة", "Предыдущая", "zurück", "précédent", "anterior", "&lt;", "<", "‹", "←", "«", "newer", "backward"]});
          break;
        }
      }
    }
    // Next Keywords - remove space, dash, underscore and lowercase
    const nextLinkKeywords = [];
    const oldNextLinkKeywords = await Promisify.storageGet("nextLinkKeywords");
    for (const keyword of oldNextLinkKeywords) {
      nextLinkKeywords.push(keyword.replace(/\s|-|_/g, "").toLowerCase());
    }
    await Promisify.storageSet({"nextLinkKeywords": nextLinkKeywords});
    // Prev Keywords - remove space, hyphen, underscore and lowercase
    const prevLinkKeywords = [];
    const oldPrevLinkKeywords = await Promisify.storageGet("prevLinkKeywords");
    for (const keyword of oldPrevLinkKeywords) {
      prevLinkKeywords.push(keyword.replace(/\s|-|_/g, "").toLowerCase());
    }
    await Promisify.storageSet({"prevLinkKeywords": prevLinkKeywords});
    // Saves (Too many changes to list)
    // Note: We are keeping the types (nextLinkType, pageElementType, etc.) just to be safe
    const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
    for (let i = 0; i < saves.length; i++) {
      const save = saves[i];
      if (!save) {
        continue;
      }
      // We are removing the decodeURIEnabled field. There are two potential issues worth mentioning:
      // 1. We are using encodeURI instead of encodeURIComponent to revert back
      // 2. If Increment URL action, then selection start may not be the same position anymore
      if (save.decodeURIEnabled) {
        try {
          // Note: even though we used decodeURIComponent to decode the URL, we use encodeURI instead of encodeURIComponent due to forward slashes e.g. https://
          save.url = encodeURI(save.url);
        } catch (e) {
          console.log(e);
        }
      }
      save.append = save.scrollAppend;
      save.name = save.title;
      save.shuffleURLs = save.shuffleURLs ? save.shuffleLimit : undefined;
      save.iframePageOne = save.scrollWrapFirstPage;
      save.pageElement = save.scrollElementRule;
      save.pageElementType = save.scrollElementType;
      save.pageElementIframe = save.scrollElementIframe ? "trim" : undefined;
      save.insertBefore = save.scrollElementInsertRule;
      save.mediaType = save.scrollMediaType;
      save.lazyLoad = save.scrollLazyLoad && save.scrollLazyLoadMode ? save.scrollLazyLoadMode : undefined;
      save.lazyLoadSource = save.scrollLazyLoadAttributeSource;
      save.lazyLoadDestination = save.scrollLazyLoadAttributeDestination;
      save.nextLink = save.nextType === "xpath" ? save.nextXpath : save.nextSelector;
      save.nextLinkProperty = save.nextProperty;
      save.keyword = (save.action === "next" && save.nextKeywordsEnabled) || (save.action === "prev" && save.prevKeywordsEnabled);
      save.nextLinkType = save.nextType;
      save.prevLink = save.prevType === "xpath" ? save.prevXpath : save.prevSelector;
      save.prevLinkProperty = save.prevProperty;
      save.prevLinkType = save.prevType;
      save.selectionStrategy = save.selectionPriority;
      save.button = save.buttonRule;
      save.buttonPosition = save.buttonScrollPixels;
      // save.buttonType = save.buttonType;
      save.list = save.listArray;
      if (save.action === "button") {
        save.action = "click";
      }
      delete save.order;
      delete save.scrollAppend;
      delete save.title;
      delete save.shuffleLimit;
      delete save.scrollWrapFirstPage;
      delete save.scrollElementRule;
      delete save.scrollElementType;
      delete save.scrollElementIframe;
      delete save.scrollElementInsertRule;
      delete save.scrollMediaType;
      delete save.scrollLazyLoad;
      delete save.scrollLazyLoadMode;
      delete save.scrollLazyLoadAttributeSource;
      delete save.scrollLazyLoadAttributeDestination;
      delete save.scrollHeightWait;
      delete save.nextSelector;
      delete save.nextXpath;
      delete save.nextType;
      delete save.nextProperty;
      delete save.nextKeywordsEnabled;
      delete save.prevSelector;
      delete save.prevXpath;
      delete save.prevType;
      delete save.prevProperty;
      delete save.prevKeywordsEnabled;
      delete save.selectionPriority;
      delete save.buttonRule;
      delete save.buttonType;
      delete save.buttonScrollPixels;
      delete save.listArray;
      delete save.buttonMethod;
      delete save.decodeURIEnabled;
      delete save.scrollAppendScripts;
      delete save.scrollAppendStyles;
      // Delete unused save properties depending on the save action and append
      if (!save.lazyLoad || !((save.append === "element" && !save.pageElementIframe) || save.append === "page")) {
        delete save.lazyLoad;
      }
      if (save.lazyLoad !== "manual") {
        delete save.lazyLoadSource;
        delete save.lazyLoadDestination;
      }
      if (save.action !== "next") {
        delete save.nextLink;
        delete save.nextLinkType;
        delete save.nextLinkProperty;
      }
      if (save.action !== "prev") {
        delete save.prevLink;
        delete save.prevLinkType;
        delete save.prevLinkProperty;
      }
      // For next and prev actions, delete the nextLinkProperty if its the default ["href"] (This should be the vast majority of cases)
      if (save.action === "next" || save.action === "prev") {
        if (Array.isArray(save[save.action + "LinkProperty"]) && save[save.action + "LinkProperty"].length === 1 && save[save.action + "LinkProperty"][0] === "href") {
          delete save[save.action + "LinkProperty"];
        }
      }
      if (!save.keyword) {
        delete save.keyword;
      }
      if (save.action !== "click") {
        delete save.button;
        delete save.buttonPosition;
      }
      if (save.action !== "list") {
        delete save.list;
      }
      if (save.append !== "iframe" || !save.iframePageOne) {
        delete save.iframePageOne;
      }
      if (save.append !== "element") {
        delete save.pageElement;
        delete save.pageElementType;
      }
      if (save.append !== "element" || !save.insertBeforePath) {
        delete save.insertBefore;
      }
      if (save.append !== "element" || !save.pageElementIframe) {
        delete save.pageElementIframe;
      }
      if (save.append !== "media") {
        delete save.mediaType;
      }
      if (save.action !== "increment") {
        delete save.selectionStart;
        delete save.selectionEnd;
        delete save.selectionStrategy;
        delete save.leadingZeros;
        delete save.interval;
        delete save.base;
        delete save.errorSkip;
        delete save.errorCodes;
        delete save.errorCodesCustom;
        delete save.shuffleURLs;
      }
      if (save.selectionStrategy !== "custom") {
        delete save.selectionCustom;
      }
      if (!(typeof save.base === "number" && save.base > 10)) {
        delete save.baseCase;
      }
      if (save.base !== "date") {
        delete save.baseDateFormat;
      }
      if (save.base !== "roman") {
        delete save.baseRoman;
      }
      if (save.base !== "custom") {
        delete save.baseCustom;
      }
      if (save.action === "increment") {
        if (save.type === "exact") {
          delete save.selectionStrategy;
        } else {
          delete save.selectionStart;
          delete save.selectionEnd;
        }
        if (!save.leadingZeros) {
          delete save.leadingZeros;
        }
        if (save.errorSkip <= 0) {
          delete save.errorSkip;
          delete save.errorCodes;
        }
        if (!Array.isArray(save.errorCodes) || !save.errorCodes.includes("CUS")) {
          delete save.errorCodesCustom;
        }
        if (!save.shuffleURLs) {
          delete save.shuffleURLs;
        }
      }
      // Sort the save keys in alphabetical order, needed for Firefox
      const newSave = {};
      for (const key of Object.keys(save).sort()) {
        newSave[key] = save[key];
      }
      saves[i] = newSave;
    }
    // Merge Whitelist into Saves
    if (items.whitelistEnabled && items.whitelist && Array.isArray(items.whitelist)) {
      // Generates a new ID by finding the the save with the highest ID and incrementing it by 1 (or 1 if no save exists)
      let id = saves.length > 0 ? Math.max.apply(Math, saves.map(s => s.id)) + 1 : 1;
      const date = new Date().toJSON();
      for (const url of items.whitelist) {
        const save = {};
        save.action = "next";
        save.append = "page";
        save.date = date;
        save.id = id++;
        if (items.lazyLoad) {
          save.lazyLoad = "auto";
        }
        // save.nextType = items.nextType;
        save.nextLink = items.nextType === "selector" ? items.nextSelector : items.nextXpath;
        // save.nextLinkKeyword = true;
        save.keyword = true;
        // Include a source for bookkeeping and in case we need to fix something later with the merge
        save.source = "whitelist";
        save.name = "";
        // Exact "url"
        if (url.startsWith("\"") && url.endsWith("\"")) {
          save.type = "exact";
        }
        // Regex /url/
        else if (url.startsWith("/") && url.endsWith("/")) {
          save.type = "regex";
        }
        // Pattern
        else {
          save.type = "pattern";
        }
        save.url = url;
        saves.push(save);
      }
    }
    // Merge Custom Database into Saves
    if (items.databaseCustomEnabled && items.databaseCustom && Array.isArray(items.databaseCustom)) {
      // Generates a new ID by finding the the save with the highest ID and incrementing it by 1 (or 1 if no save exists)
      let id = saves?.length > 0 ? Math.max.apply(Math, saves.map(s => s.id)) + 1 : 1;
      const date = new Date().toJSON();
      for (const item of items.databaseCustom) {
        const save = {};
        // Include a source for bookkeeping and in case we need to fix something later with the merge
        save.source = "customDatabase";
        save.id = id++;
        save.name = item.name ;
        save.type = "regex";
        save.action = "next";
        save.append = "element";
        save.date = date;
        if (items.lazyLoad) {
          save.lazyLoad = "auto";
        }
        // Database items should have
        const data = item?.data;
        save.nextLink = data?.nextLink;
        save.pageElement = data?.pageElement;
        save.url = data?.url;
        // save.nextLinkType = "xpath"
        // save.pageElementType = "xpath";
        saves.push(save);
      }
    }
    // Sort the saves only by URL length now (we used to sort them by their type/order)
    saves.sort((a, b) => b.url?.length - a.url?.length || a.id - b.id);
    await Promisify.storageSet({"saves": saves});
    // Check the saves if any of them contain the extra inputs before setting this setting
    await Promisify.storageSet({"extraInputs": Array.isArray(saves) && saves.length > 0 && saves.some(save => { return save.insertBefore || save.nextLinkProperty || save.prevLinkProperty} )});
    // Download new IS database and re-download AP database to new databaseAP key (just to be safe in case rename didn't work). Note that we only download the database if this is an update via the old storage items databaseEnabled (not json)
    if (databaseEnabled) {
      await Database.download(true, true, "");
    }
  }

  // /**
  //  * 0.9 Update
  //  *
  //  * @param {string} previousVersion - the previous version that is being updated to this version
  //  * @private
  //  */
  // static async #_09(previousVersion) {
  //   if (previousVersion >= "0.9") {
  //     return;
  //   }
  //   console.log("_09() - updating to 0.9 ...");
  //   const items = await Promisify.storageGet(undefined, undefined, []);
  //   console.log("_09() - storageGet=");
  //   console.log(JSON.stringify(items));
  //   // Storage Items changes - ...
  //   await Promisify.storageSet({
  //     "version": "0.9",
  //   });
  // }

  /**
   * First Version Run - if the previous version is lower than the current version, set firstVersionRun to true so we
   * can show the user what's new in this version.
   *
   * @param {string} previousVersion - the previous version that is being updated to this version
   * @param {boolean} skip - if this function should be skipped
   * @private
   */
  static async #_firstVersionRun(previousVersion, skip) {
    // Only set firstVersionRun to true if the user is updating from a lower version and if skip is false (e.g. updating from Backup). This will get called every time the extension is reloaded so we don't want to keep setting it to true.
    if ((previousVersion >= chrome.runtime.getManifest().version) || skip) {
      return;
    }
    console.log("update() - setting firstVersionRun to true because the current version=" + chrome.runtime.getManifest().version);
    await Promisify.storageSet({"firstVersionRun": true});
  }

}