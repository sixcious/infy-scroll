/**
 * Infy Scroll
 * @copyright © 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Background handles all extension-specific background tasks, such as installation and update events, listeners, and
 * supporting chrome.* apis that are only available in the background (such as commands or setting the toolbar icon).
 *
 * Since this extension is designed to be a content script based extension, and because this extension does not have a
 * persistent background, there is little logic contained here, and there is no "state" (objects in memory).
 */
const Background = (() => {

  /**
   * Variables
   *
   * @param ID_CHROME  the chrome extension id (used to help determine what browser this is)
   * @param ID_EDGE    the edge extension id (used to help determine what browser this is)
   * @param ID_FIREFOX the firefox extension id (used to help determine what browser this is)
   */
  const ID_CHROME = "gdnpnkfophbmbpcjdlbiajpkgdndlino";
  const ID_EDGE = "fmdemgjiipojpgemeljnbaabjeinicba";
  const ID_FIREFOX = "infy-scroll@webextensions";

  /**
   * Gets the storage default values (SDV) of the extension.
   *
   * Note: Storage.set can only set top-level JSON objects, avoid using nested JSON objects.
   * Instead, prefix keys that should be grouped together with a label e.g. "auto"
   *
   * @returns {*} the storage default values object
   * @private
   */
  function getStorageDefaultValues() {
    console.log("getStorageDefaultValues()");
    return {
      "installVersion": chrome.runtime.getManifest().version, "installDate": new Date().toJSON(), "browserName": getBrowserName(), "firstRun": true, "on": true,
      "toolbarIcon": getPreferredColor(), "buttonSize": 50, "interfaceImage": "infinity", "interfaceTheme": false, "interfaceMessages": true, "dynamicSettings": true,
      "customScriptsEnabled": true, "resizeMediaEnabled": true, "linksNewTabEnabled": false, "customEventsEnabled": false, "decodeURIEnabled": false, "debugEnabled": false,
      "interval": 1, "leadingZerosPadByDetection": true, "shuffleLimit": 100, "shuffleStart": false,
      "base": 10, "baseCase": "lowercase", "baseDateFormat": "yyyy/mm/dd", "baseRoman": "latin", "baseCustom": "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      "selectionPriority": "smart", "selectionCustom": { "url": "", "regex": "", "flags": "", "group": 0, "index": 0 },
      "errorSkip": 0, "errorCodes": ["404", "3XX"], "errorCodesCustom": [],
      "nextType": "selector", "nextSelector": "[rel=\"next\"]", "nextXpath": "//*[@rel=\"next\"]", "nextProperty": ["href"],
      "prevType": "selector", "prevSelector": "[rel=\"prev\"],[rel=\"previous\"]", "prevXpath": "//*[@rel=\"prev\"]|//*[@rel=\"previous\"]", "prevProperty": ["href"],
      "nextKeywords": ["pnnext","nextpage","next-page","next_page","next>","next›","next→","next»","next","moreresults","olderposts","olderpost","arrow-right","angle-right","chevron-right","caret-right","circle-right","square-right","下一页","次のページ","次へ","次","&gt;",">","›","→","»","older","forward"],
      "prevKeywords": ["pnprev","previouspage","prevpage","prev-page","prev_page","<prev","‹prev","←prev","«prev","prev","previous","newerposts","newerpost","arrow-left","angle-left","chevron-left","caret-left","circle-left","square-left","上一页","前のページ","前へ","前","&lt;","<","‹","←","«","newer","backward"],
      "buttonType": "selector", "buttonRule": "#load-more-button", "buttonMethod": "click", "buttonScrollPixels": 1000,
      "autoTimes": 10, "autoSeconds": 2, "autoBadge": "times", "autoSlideshow": false, "autoBehavior": "smooth", "autoStart": false,
      "scrollAction": "next", "scrollAppend": "page", "scrollElementRule": "body > *", "scrollElementInsertRule": "", "scrollElementType": "selector", "scrollElementIframe": false, "scrollMediaType": "image",
      "scrollDetection": "sl", "scrollDetectionThrottle": 200, "scrollBehavior": "auto", "scrollUpdateAddress": true, "scrollUpdateTitle": true,
      "scrollAppendThresholdPages": 0, "scrollAppendThresholdPixels": 500, "scrollAppendDelay": 2000, "scrollAppendScripts": false, "scrollAppendStyles": false, "scrollAppendCustomStyles": false, "scrollAppendCustomStylesValue": "",
      "scrollLazyLoad": true, "scrollLazyLoadMode": "auto", "scrollLazyLoadAttributeSource": "data-src", "scrollLazyLoadAttributeDestination": "src",
      "scrollDivider": "element", "scrollDividerAlign": "center", "scrollOverlay": false, "scrollIcon": true, "scrollLoading": true, "scrollWrapFirstPage": false, "scrollHeightWait": 0,
      "saves": [], "whitelist": [], "whitelistEnabled": false, "database": [], "databaseDate": null, "databaseAutoActivate": true, "databaseAutoUpdate": 1, "databaseBlacklist": [], "databaseWhitelist": []
    };
  }

  /**
   * Gets all possible browser action badges of the extension.
   *
   * The browser action badges are displayed against the extension icon. Each "badge" consists of a text string and
   * backgroundColor.
   *
   * @returns {*} the browser action badges object
   * @private
   */
  function getBrowserActionBadges() {
    console.log("getBrowserActionBadges()");
    return {
      "incrementm": {"text": "+", "backgroundColor": "#4AACED"},
      "decrementm": {"text": "-", "backgroundColor": "#4AACED"},
      "increment": {"text": "+", "backgroundColor": "#1779BA"},
      "decrement": {"text": "-", "backgroundColor": "#1779BA"},
      "next": {"text": ">", "backgroundColor": "#05854D"},
      "prev": {"text": "<", "backgroundColor": "#05854D"},
      "button": {"text": "BTN", "backgroundColor": "#8073AE"},
      "list": {"text": "LIST", "backgroundColor": "#8073AE"},
      "return": {"text": "RET", "backgroundColor": "#FFCC22"},
      "auto": {"text": "AUTO", "backgroundColor": "#FF6600"},
      "autotimes": {"text": "", "backgroundColor": "#FF6600"},
      "autopause": {"text": "❚❚", "backgroundColor": "#FF6600"},
      "autorepeat": {"text": "REP", "backgroundColor": "#FF6600"},
      "skip": {"text": "SKIP", "backgroundColor": "#000000"},
      "on": {"text": "ON", "backgroundColor": "#615492"},
      "off": {"text": "OFF", "backgroundColor": "#B00020"},
      "default": {"text": "", "backgroundColor": [0, 0, 0, 0]}
    };
  }

  /**
   * Gets this browser's name by examining this extension's ID or by inspecting the navigator.userAgent object.
   *
   * @returns {string} the browser's name in all lowercase letters: "chrome", "edge", "firefox"
   * @private
   */
  function getBrowserName() {
    const chromeName = "chrome";
    const edgeName = "edge";
    const firefoxName = "firefox";
    // chrome.runtime.id
    const ID = typeof chrome !== "undefined" && chrome && chrome.runtime && chrome.runtime.id ? chrome.runtime.id : "";
    let browserName = ID === ID_CHROME ? chromeName : ID === ID_EDGE ? edgeName : ID === ID_FIREFOX ? firefoxName : "";
    let method = "chrome.runtime.id:" + ID;
    // navigator.userAgent
    if (!browserName) {
      const UA = typeof navigator !== "undefined" && navigator && navigator.userAgent ? navigator.userAgent : "";
      browserName = UA.includes("Firefox/") ? firefoxName : UA.includes("Edg/") ? edgeName : chromeName;
      method = "navigator.userAgent:" + UA;
    }
    console.log("getBrowserName() - browserName=" + browserName + ", method=" + method);
    return browserName;
  }

  /**
   * Gets the user's preferred icon color. Note this is actually the opposite of what prefers-color-scheme returns.
   * If the preferred color scheme is dark, this returns light and vice versa.
   *
   * @returns {string} the preferred icon color, either "dark" or "light"
   * @private
   */
  function getPreferredColor() {
    let color = "dark";
    if (typeof window !== "undefined" && window.matchMedia) {
      color = window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
    }
    console.log("getPreferredColor() - color=" +  color);
    return color;
  }

  /**
   * Sets the browser action badge for this tabId. Can either be temporary or for an indefinite time.
   * Note that when the tab is updated, the browser removes the badge.
   *
   * @param tabId           the tab ID to set this badge for
   * @param badge           the badge key to set from BROWSER_ACTION_BADGES
   * @param temporary       boolean indicating whether the badge should be displayed temporarily (true) or not (false)
   * @param text            (optional) the text to use instead of the the badge text
   * @param backgroundColor (optional) the backgroundColor to use instead of the badge backgroundColor
   * @private
   */
  function setBadge(tabId, badge, temporary, text, backgroundColor) {
    console.log("setBadge() - tabId=" + tabId + ", badge=" + badge + ", temporary=" + temporary + ", text=" + text + ", backgroundColor=" + backgroundColor);
    // Firefox Android: chrome.browserAction.setBadge API isn't supported
    if (!chrome.browserAction.setBadgeText || !chrome.browserAction.setBadgeBackgroundColor) {
      console.log("setBadge() - no chrome.browserAction badge functions are available, returning");
      return;
    }
    const BROWSER_ACTION_BADGES = getBrowserActionBadges();
    // Must either have a badge object OR both a text and backgroundColor to continue
    if (!BROWSER_ACTION_BADGES[badge] && (!text || !backgroundColor)) {
      console.log("setBadge() - no badge and either no text or backgroundColor detected, returning");
      return;
    }
    chrome.browserAction.setBadgeText({text: text || BROWSER_ACTION_BADGES[badge].text, tabId: tabId});
    chrome.browserAction.setBadgeBackgroundColor({color: backgroundColor || BROWSER_ACTION_BADGES[badge].backgroundColor, tabId: tabId});
    if (temporary) {
      setTimeout(function () {
        // If this is an off, revert to default, otherwise assume we're still on
        const revert = badge === "off" ? "default": "on";
        chrome.browserAction.setBadgeText({text: BROWSER_ACTION_BADGES[revert].text, tabId: tabId});
        chrome.browserAction.setBadgeBackgroundColor({color: BROWSER_ACTION_BADGES[revert].backgroundColor, tabId: tabId});
      }, 2000);
    }
  }

  /**
   * Downloads the database.
   *
   * Note: This function is in the Background because both the Options and Content Script need the ability to download
   * the database. If it weren't in the Background, we would need to duplicate this function in both places.
   *
   * @param options the download options (for example, if this should fallback to use a backup database url)
   * @returns {Promise<{error: *, downloaded: boolean}>}
   * @private
   */
  async function downloadDatabase(options) {
    console.log("downloadDatabase - options=" + JSON.stringify(options));
    const result = { downloaded: false, error: undefined };
    let url = "";
    try {
      // Save the Database Date first (separately) to avoid potential issues, such as this function being called on every request in case of error with the fetch request
      await Promisify.storageSet({"databaseDate": new Date().toJSON()});
      url = chrome.i18n.getMessage("database_url" + (options && options.useBackup && options.previousException ? "_backup" : ""));
      console.log("downloadDatabase() - downloading database from: " + url);
      const response = await fetch(url);
      let database = await response.json();
      // Filter the database to only records who contain the required properties
      database = database.filter(d => d.data && d.data.url && d.data.nextLink && d.data.pageElement);
      // Map the database records (r) to just the 3 or 4 required components in each record's data: url, nextLink, pageElement, insertBefore (optional)
      database = database.map(d => { const r = { "url": d.data.url, "nextLink": d.data.nextLink, "pageElement": d.data.pageElement }; for (const o of ["insertBefore"]) { if (d.data[o]) { r[o] = d.data[o]; } } return r; });
      // Sort the database with the longest URLs first to find the most exact URL match first
      database.sort((a, b) => (a.url.length < b.url.length) ? 1 : -1);
      if (database.length > 0) {
        await Promisify.storageSet({"database": database});
        result.downloaded = true;
      } else {
        throw "Database length is 0";
      }
    } catch (e) {
      console.log("downloadDatabase() - error downloading database from: " + url + " - error=" + e);
      result.error = e;
      if (options && options.useBackup && !options.previousException) {
        options.previousException = true;
        return await downloadDatabase(options);
      }
    }
    console.log("downloadDatabase() - result.downloaded=" + result.downloaded + ", result.error=" + result.error);
    if (options && options.sendMessage) {
      chrome.runtime.sendMessage({receiver: "options", greeting: "databaseDownloaded"}, function(response) { if (chrome.runtime.lastError) {} });
    }
    return result;
  }

  /**
   * Listen for installation changes and do storage/extension initialization work.
   *
   * @param details the installation details
   * @private
   */
  async function installedListener(details) {
    console.log("installedListener() - details=" + JSON.stringify(details));
    if (details.reason === "install") {
      console.log("installedListener() - installing ...");
      const SDV = getStorageDefaultValues();
      await Promisify.storageClear();
      await Promisify.storageSet(SDV);
      downloadDatabase({"useBackup": true, "sendMessage": true});
      chrome.runtime.openOptionsPage();
    } else if (details.reason === "update") {
      Storage.update(details.previousVersion);
    }
    startupListener();
  }

  /**
   * The extension's background startup listener that is run the first time the extension starts.
   * For example, when Chrome is started, when the extension is installed or updated, or when the
   * extension is re-enabled after being disabled.
   *
   * @private
   */
  async function startupListener() {
    console.log("startupListener()");
    const items = await Promisify.storageGet();
    // Ensure the chosen toolbar icon is set. Firefox Android: chrome.browserAction.setIcon() not supported
    if (chrome.browserAction.setIcon && items && ["dark", "light"].includes(items.toolbarIcon)) {
      console.log("startupListener() - setting browserAction icon to " + items.toolbarIcon);
      chrome.browserAction.setIcon({
        path : {
          "16": "/img/icon-" + items.toolbarIcon + ".png",
          "24": "/img/icon-" + items.toolbarIcon + ".png",
          "32": "/img/icon-" + items.toolbarIcon + ".png"
        }
      });
    }
    // Firefox: Set badge text color to white always instead of using default color-contrasting introduced in FF 63
    if (typeof browser !== "undefined" && browser.browserAction && browser.browserAction.setBadgeTextColor) {
      browser.browserAction.setBadgeTextColor({color: "white"});
    }
  }

  /**
   * Listen for requests from chrome.runtime.sendMessage (e.g. Content Scripts). Note: sender contains tab
   *
   * @param request      the request containing properties to parse (e.g. greeting message)
   * @param sender       the sender who sent this message, with an identifying tab
   * @param sendResponse the optional callback function (e.g. for a reply back to the sender)
   * @private
   */
  async function messageListener(request, sender, sendResponse) {
    console.log("messageListener() - request=" + JSON.stringify(request));
    // TODO: This isn't actually needed anymore because we don't ever use the sender.tab.url (this was a carryover from URLI); however keeping it commented out for reference in the future
    // Firefox: sender.tab.url is undefined in FF due to not having tabs permissions (even though we have <all_urls>!), so use sender.url, which should be identical in 99% of cases (e.g. iframes may be different)
    // if (sender && sender.url && sender.tab && !sender.tab.url) {
    // sender.tab.url = sender.url;
    // }
    // Default response
    let response = {};
    switch (request.greeting) {
      case "setBadge":
        const tabId = request.tabId ? request.tabId : sender.tab.id;
        setBadge(tabId, request.badge, request.temporary, request.text, request.backgroundColor);
        // Only respond back with the tabId when Scroll.start() needs it the very first time
        if (request.needsTabId) {
          response = tabId;
        }
        break;
      case "getSDV":
        response = getStorageDefaultValues();
        break;
      case "downloadDatabase":
        response = await downloadDatabase(request.options);
        break;
      case "turnOff":
        const tabs = await Promisify.tabsQuery({});
        if (tabs) {
          for (const tab of tabs) {
            if (tab && tab.id) {
              console.log("messageListener() - sending a stop message to tab.id=" + tab.id);
              chrome.tabs.sendMessage(tab.id, {receiver: "contentscript", greeting: "stop", caller: "background"});
            }
          }
        }
        break;
      default:
        break;
    }
    sendResponse(response);
  }

  /**
   * Listen for commands (Browser Extension shortcuts) and perform the command's action.
   *
   * @param command the shortcut command that was performed
   * @private
   */
  async function commandListener(command) {
    console.log("commandListener() - command=" + command);
    if (command === "down" || command === "up" || command === "off" || command === "auto")  {
      const tabs = await Promisify.tabsQuery();
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {receiver: "contentscript", greeting: "command", caller: "command", action: command});
      }
    }
  }

  // Background Listeners
  chrome.runtime.onInstalled.addListener(installedListener);
  chrome.runtime.onStartup.addListener(startupListener);
  // Message Listener: We need to return immediately if the function will be performing asynchronous work
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) { if (!request || request.receiver !== "background") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });
  // Firefox Android: chrome.commands is unsupported
  if (chrome.commands) { chrome.commands.onCommand.addListener(commandListener); }

})();