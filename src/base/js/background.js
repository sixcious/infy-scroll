/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
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
   * @param BROWSER_ACTION_BADGES The browser action badges are displayed against the extension icon. Each "badge" consists of a text string and backgroundColor.
   */
  const BROWSER_ACTION_BADGES = {
    "incrementm": { "text": "+",    "backgroundColor": "#000000" },
    "decrementm": { "text": "-",    "backgroundColor": "#000000" },
    "increment":  { "text": "+",    "backgroundColor": "#000000" },
    "decrement":  { "text": "-",    "backgroundColor": "#000000" },
    "next":       { "text": ">",    "backgroundColor": "#000000" },
    "prev":       { "text": "<",    "backgroundColor": "#000000" },
    "button":     { "text": "BTN",  "backgroundColor": "#000000" },
    "list":       { "text": "LIST", "backgroundColor": "#000000" },
    "return":     { "text": "RET",  "backgroundColor": "#000000" },
    "skip":       { "text": "SKIP", "backgroundColor": "#000000" },
    "auto":       { "text": "AUTO", "backgroundColor": "#FF6600" },
    "autotimes":  { "text": "",     "backgroundColor": "#FF6600" },
    "autopause":  { "text": "❚❚",    "backgroundColor": "#FF6600" },
    "autorepeat": { "text": "REP",  "backgroundColor": "#FF6600" },
    "on":         { "text": "ON",   "backgroundColor": "#615492" },
    "off":        { "text": "OFF",  "backgroundColor": "#B00020" },
    "default":    { "text": "",     "backgroundColor": [0, 0, 0, 0] }
  };

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
    // Firefox Android: chrome.action.setBadge API isn't supported
    if (!chrome.action || !chrome.action.setBadgeText || !chrome.action.setBadgeBackgroundColor) {
      console.log("setBadge() - no chrome.action badge functions are available, returning");
      return;
    }
    // Must either have a badge object OR both a text and backgroundColor to continue
    if (!BROWSER_ACTION_BADGES[badge] && (!text || !backgroundColor)) {
      console.log("setBadge() - no badge and either no text or backgroundColor detected, returning");
      return;
    }
    chrome.action.setBadgeText({text: text || BROWSER_ACTION_BADGES[badge].text, tabId: tabId});
    chrome.action.setBadgeBackgroundColor({color: backgroundColor || BROWSER_ACTION_BADGES[badge].backgroundColor, tabId: tabId});
    if (temporary) {
      setTimeout(async function () {
        // Infy Scroll Only: Assume we are reverting back to on, but revert to default if this is an off and it's not enabled still
        // To determine the latter, we get the instance to check and see if it has become enabled again if the user tried turning it back on before the timeout executes
        let revert = "on";
        if (badge === "off") {
          const instance = await Promisify.tabsSendMessage(tabId, {receiver: "contentscript", greeting: "getInstance"});
          if (instance && !instance.enabled) {
            revert = "default";
          }
        }
        chrome.action.setBadgeText({text: BROWSER_ACTION_BADGES[revert].text, tabId: tabId});
        chrome.action.setBadgeBackgroundColor({color: BROWSER_ACTION_BADGES[revert].backgroundColor, tabId: tabId});
      }, 2000);
    }
  }

  /**
   * Sets the browser action icon (the toolbar icon) to the specified icon.
   *
   * @param icon the icon to set
   * @private
   */
  function setIcon(icon) {
    console.log("setIcon() - setting browserAction icon to " + icon);
    // Ensure the chosen toolbar icon is set. Firefox Android: chrome.action.setIcon() not supported
    if (chrome.action && chrome.action.setIcon && ["dark", "light"].includes(icon)) {
      chrome.action.setIcon({
        path : {
          "16": "/img/icon-" + icon + ".png",
          "24": "/img/icon-" + icon + ".png",
          "32": "/img/icon-" + icon + ".png"
        }
      });
    }
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
      const SDV = Storage.getStorageDefaultValues();
      SDV.firstRun = true;
      await Promisify.storageClear();
      await Promisify.storageSet(SDV);
      // Note: When the extension is first installed, we await at least 2 seconds for the Options page to load and set the preferred color before startupListener executes
      await Promisify.runtimeOpenOptionsPage();
      await Promise.all([Database.download(true, true), Promisify.sleep(2000)]);
      await Promisify.runtimeSendMessage({receiver: "options", greeting: "databaseDownloaded"});
    } else if (details.reason === "update" && details.previousVersion < chrome.runtime.getManifest().version) {
      console.log("installedListener() - updating ...");
      await Storage.update(details.previousVersion);
    }
    startupListener("installedListener");
  }

  /**
   * The extension's background startup listener that is run the first time the extension starts.
   * For example, when Chrome is started, when the extension is installed or updated, or when the
   * extension is re-enabled after being disabled.
   *
   * @param caller who called this function (useful because startupListener can be called from three different places!)
   *
   * @private
   */
  async function startupListener(caller) {
    console.log("startupListener() - caller=" + caller);
    const items = await Promisify.storageGet();
    setIcon(items.icon);
    // Firefox: Set badge text color to white always instead of using default color-contrasting introduced in FF 63
    if (typeof browser !== "undefined" && browser.browserAction && typeof browser.browserAction.setBadgeTextColor === "function") {
      browser.browserAction.setBadgeTextColor({color: "#FFFFFF"});
    }
    // Chrome: Set badge text color to white always instead of using default color-contrasting introduced in Chrome 104, Chrome 110 Only!
    // @see https://bugs.chromium.org/p/chromium/issues/detail?id=1337783
    else if (typeof chrome !== "undefined" && chrome.action && typeof chrome.action.setBadgeTextColor === "function") {
      chrome.action.setBadgeTextColor({color: "#FFFFFF"});
    }
    // MV3: We need to store the started state in memory in case this didn't  get called when the extension is disabled and re-enabled (e.g. the toolbar icon isn't updated)
    if (chrome.storage.session) {
      Promisify.storageSet({"started": true}, "session");
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
    console.log("messageListener() - request=");
    console.log(request);
    // TODO: This isn't actually needed anymore because we don't ever use the sender.tab.url (this was a carryover from URLI); however keeping it commented out for reference in the future
    // Firefox: sender.tab.url is undefined in FF due to not having tabs permissions (even though we have <all_urls>!), so use sender.url, which should be identical in 99% of cases (e.g. iframes may be different)
    // if (sender && sender.url && sender.tab && !sender.tab.url) {
    // sender.tab.url = sender.url;
    // }
    const tabId = request && request.tabId ? request.tabId : sender && sender.tab && sender.tab.id ? sender.tab.id : 0;
    // Default response
    let response = {};
    switch (request.greeting) {
      case "setBadge":
        // const tabId = request.tabId ? request.tabId : sender.tab.id;
        setBadge(tabId, request.badge, request.temporary, request.text, request.backgroundColor);
        // Only respond back with the tabId when Scroll.start() needs it the very first time
        if (request.needsTabId) {
          response = tabId;
        }
        break;
      case "setIcon":
        setIcon(request.icon);
        break;
      case "getSDV":
        response = Storage.getStorageDefaultValues();
        break;
      case "restoreData":
        response = await Storage.update(request.previousVersion, request.data);
        break;
      case "downloadDatabase":
        response = await Database.download(request.downloadAP, request.downloadIS, request.downloadLocation);
        break;
      // case "tabsExecuteScript":
      //   await Promisify.tabsExecuteScript(tabId, {file: request.file, runAt: "document_end"});
      //   response = {executed: true};
      //   break;
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
      case "initPicker":
        chrome.tabs.sendMessage(tabId, {receiver: "contentscript", greeting: "initPicker", algorithm: request.algorithm, quote: request.quote, optimized: request.optimized, js: request.js, property: request.property, minimize: request.minimize, corner: request.corner });
        break;
      case "changePicker":
        chrome.tabs.sendMessage(tabId, {receiver: "contentscript", greeting: "changePicker", change: request.change, value: request.value});
        break;
      case "savePicker":
        chrome.tabs.sendMessage(tabId, {receiver: "contentscript", greeting: "savePicker"});
        break;
      case "copyPicker":
        chrome.tabs.sendMessage(tabId, {receiver: "contentscript", greeting: "copyPicker"});
        break;
      case "closePicker":
        chrome.tabs.sendMessage(tabId, {receiver: "contentscript", greeting: "closePicker"});
        break;
      case "minimizePicker":
        chrome.tabs.sendMessage(tabId, {receiver: "contentscript", greeting: "minimizePicker", toggle: request.toggle});
        break;
      case "movePicker":
        chrome.tabs.sendMessage(tabId, {receiver: "contentscript", greeting: "movePicker", corner: request.corner});
        break;
      case "updatePickerUI":
        chrome.tabs.sendMessage(tabId, {receiver: "picker-ui", greeting: "updatePickerUI", picker: request.picker, type: request.type, data: request.data, meta: request.meta, element: request.element});
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
    if (command === "down" || command === "up" || command === "power" || command === "blacklist" || command === "auto")  {
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
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) { if (!request || request.receiver !== "background") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });
  // Firefox Android: chrome.commands is unsupported
  if (chrome.commands) { chrome.commands.onCommand.addListener(commandListener); }
  // MV3: We need this in case the startupListener didn't get called when the extension is disabled and re-enabled (e.g. the toolbar icon isn't updated)
  if (chrome.storage.session) { setTimeout(async () => { const started = await Promisify.storageGet("started", "session"); if (!started) { startupListener("timeout");} }, 3000); }
  // MV3 / MV2 convenience code
  if (!chrome.action) { chrome.action = chrome.browserAction; }

})();