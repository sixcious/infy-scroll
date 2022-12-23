# Infy Scroll Version History

## Version 0.8 Eightfinity Edition
<b>Released on ?</b>
- New AJAX Append Mode (Experimental)
- New SPA option (Experimental)
- New improvements to the Element Iframe Append Mode
- New 1-Click Database Blacklist and Whitelist Buttons (Toggable)
- New Preferred Path Type option and now auto-detects the path type (Selector or XPath) you enter in the inputs
- New Infy Scroll Database Support (Experimental)
- New Database Features: New Download Location option and you can now view the database and see its stats
- New URL List Action Find Links and Sort List functions and Options
- New Element Picker Options with DOM Path Algorithm/Quote/Optimized toggle options
- New Add Save and Edit Save functions in the Options screen and now displaying their titles along with their URLs
- Saves now take up much less space and now only save data relevant to their action and append mode
- Saves are now always sorted by URL length (not type)
- New next/prev keywords added for AJAX keywords and for other languages (Arabic, Russian, German, French, and Spanish)
- New Button Detection property for the Click Button action (choose between Auto or Manual)
- New Page Divider Buttons option (add down or up page navigation buttons in the divider)
- Power button in Popup is now toggable to go to on and off (previously only supported off)
- Now checks the page for late activation for up to 5 seconds after the page loads in case dynamic content appears later
- Merged Whitelist into Saves
- Merged Custom Database into Saves
- Removed the Append Scripts and Styles settings due to MV3 restriction
- Updated to FontAwesome 6.0 Icons
- Updated loading style: if the loading animation is enabled and a page divider is present, the page divider icon animates, otherwise an icon is fixed in the bottom-right corner
- Fixed Firefox CustomEvent details access by using window.cloneInto(). The event.detail permission error was: "Permission denied to access property"
- Completely revamped DOMPath. Separated Chromium's into ChromiumPath and our own in DOMPath. Fixed it when it didn't return the right node. The DOMPath.xPath2 function wasn't always returning the right unique node when a node has a class name (it assumes the class name is unique instead of using [#])
- Improved Auto Detect Page Element Algorithm: Now banning individual classes on children, added more banned keywords, and lowered the similartyThreshold from 10 to 9
- Fixed the Down shortcut to use a Saved URL/Database action and append when it wanted to activate/turn on Infy. Previously it would always use the default next/page even if it found a Saved or Database URL
- Added new platformName property to storage items. This is needed so that if browser is Firefox Android, it sets the Scroll Updates Address Bar/Tab Title options to false
- Added extra styles for page divider for more robustness across various websites (e.g. background: initial, border-radius: 0)
- For page elements that are grids, fixed the divider to be on a new row instead of inline with the other elements on the same row
- Fixed when the Next Link Path is really long, the balloon tooltip caused a vertical scrollbar to appear in the Popup Window. Now put a max length of 500 characters. Example Database URL ^https?://.+
- Removed scrollHeightWait from storage items and saves (now that we've confirmed that iFrameResizer will work)
- Finished implementing Restore from JSON Data function to mirror Update Storage Items for Backup/Restore purposes
- Debug Mode by default adds the overlay stats and fixed bottom-right loading
- When iframes aren't supported on the page, linking to Xframey GitHub as a possible solution
- Commented out Scroll.resetStyling() - it's making some sites scrollbar not show up anymore and doing harm rather than good
- New Shuffle URLs Dialog. shuffleLimit changed to shuffleAmount and moved from Options (Global) to Popup (Instance)
- URL List Action: Stopping at last page (at last)
- Now remembers the keyword that was used on the next/prev page (keywordObject) so consistently using the same keyword
- No longer falls back to an alternate keyword if one was found on the first page
- For Backup/Restore feature, can now upload files in addition to uploading text
- Older versions will be updated to the new next/prev keywords and next/prev single quote rules/paths if they haven't modified them 
- Fixed small bug with Append Element Iframe mode; it was always previously appending the iframe to the last text node of the parent instead of the last element's next sibling
- Fixed a bug involving Auto and Append Element Iframe mode with the Next Link action; it will now find the next link without issue (it wasn't passing in the document__ in Action.performAction)  
- Now using the class version of AutoTimer in Auto and removed the function version
- Refactor code base: function() to function () with a space
- Refactor svg use xlink:href to href (xlink is now deprecated)
- Renamed: scrollAppend to append, scrollWrapFirstPage to iframePageOne, scrollElement to pageElement, scrollMediaType to mediaType, scrollLazyLoad to lazyLoad, next/prev Selector/XPath to next/prev Rule, and so on...
- Now throwing Error messages inside the Error() constructor instead of just throwing the string as is (this was bad practice) and refactored all "catchs()" (without spaces) to "catch ()"
- Revamped the Help Guide on GitHub and now each section is in its own page for easier reading
- Redid Gallery Screens to reflect latest changes (new append modes, UI, screenshots)
- Manifest V3 (MV3) Update

## Version 0.7 Seven Hearts Edition
<b>Released on 02/14/2022</b>
- New Feature: Element Picker Mode (UI Window > Eyedropper Button)
- New Feature: Auto Detect Page Element (UI Window > Search Button)
- Redesigned the UI with a custom-made Material Design collapsable drawer
- Replaced selector/xpath radios with selects to increase width of inputs
- Fixed Popup Window horizontal scrollbars not showing when the OS/Browser zoom settings are higher than 100%
- Commented Out: New Append Custom JS Option (Scripts and Styles Dialog)
- Commented Out: New Append Custom CSS Option (Scripts and Styles Dialog)
- New Custom Database with option to allow Blacklist/Whitelist to apply to it (Options > Database)
- New Backup/Restore function (Options > Backup)
- New option to open links in a new tab (Options > Extra)
- New option to trigger Custom Events (Options > Extra): GM_AutoPagerizeLoaded, GM_AutoPagerizeNextPageLoaded, AutoPagerize_DOMNodeInserted
- Page divider links now always open in a new tab (Enhancement)
- New Tooltips Enabled option (Options > UI)
- No longer using scrollHeightWait for Iframes and now using the iFrameResizer library, which uses a MutationObserver to observe changes to the iframe
- Added new Custom Script
- Fixed missing page divider for Bing Search by making it a p instead of a li
- Added new processStyle() function to add "!important" and extra style attributes to all styles (e.g. PAGE_STYLE, divider style, svg style) when appending infy specific container or items
- Removed database and saves from Promisify.storageGet() calls (improves memory/performance)
- Removed dynamicSettings UI option as it was overly complex; now just saving last used action/append as the default
- Now using "next" "page" as the default action/append for Whitelist and Shortcut Down command
- Removed decodeURIEnabled extra option, but still honoring existing saves that had this option enabled
- Renamed scrollAction to action to be consistent with non-scroll extensions that have the same concept as an action (URLI, Downloadyze)
- Fixed a bug with using database microformat; we were concatenating it incorrectly
- On the Options > Scroll settings, when selecting Intersection Observer hid the scroll detection throttle setting as it doesn't apply to that mode
- Fixed floating divider issue with Safebooru and sites that use float content so the divider is always positioned on the bottom (display: block)
- Fixed autofocus and outline on anchors in mdc-dialogs when they open. This was caused by an injected stylesheet by the browser (e.g. Chrome). We override the focus in mdc-dialog anchors to not have an outline
- Now executing custom scripts in every append mode (e.g. iframe is now included)

## Version 0.6.0.6 Starry Night Edition (Remix)
<b>Released on 03/30/2021</b>
- Improved Fix Lazy Loading algorithm and now have it on by default on all appended pages
- Fixed false positive "ON" badge for Saved URLs. Save URLs will no longer "activate" Infy if the action or append mode do not validate (on certain actions/append modes). Previously we would always validate as long as the URL matched the Saved URL
- Added support to fix URL links' protocol (http or https) and links' hostname (www. or no www.) relative to the location's properties, assuming all else are equal
- Added feedback when iframe's aren't supported by appending a message on the page
- When Infy finds a Database URL, it won't set the Save URL to the Database URL if it consists of 13 characters or less to avoid generic Database URLs like `https?://.`
- When calculating the insertion point, no longer trying to convert the insertPosition into an element (if it was a text node) in order to use getBoundingClientRect() and now relying on calculating the max bottom of all the page elements
- Adding a small delay before Infy initializes its content script to support certain websites who haven't finished loading (fixes a few Database URLs)
- No longer removing noscript,style,link tags in element/database mode; this will fix some database websites
- Added support for the AutoPagerize Microformat .* Database URL (this is the fallback rule that relies on websites storing the pageElement and nextLink using autopagerize class names)
- Added a new useXHR property to the instance. If Infy starts using XHR, it will now continue to use XHR on the website instead of always attempting to first use the `fetch` api (avoids two requests for each page)

## Version 0.6 Starry Night Edition
<b>Released on 03/19/2021</b>
- Added a new Dynamic Settings option to allow for both use-cases depending on user preferences (sticky default settings, or dynamic defualt settings)
- Added a new Lazy Load Media/Images setting inside Scripts and Styles
- Added a new Hybrid Iframe mode inside Append Element mode
- Added new scrollHeightWait option to improve Iframe height handling; now setting the height again after multiple timeouts after the iframe loads to account for lazily loaded images
- Added new Audio option in Append Media mode. Audio files will be treated just like "video" tags (as this is how Chrome/Firefox treat them in their own markup)
- Added new Saved URL Wildcard type that uses the `*` character (Part of Pattern)
- Added new `scrollPrepareFirstPage` counter that will allow `Scroll.prepareFirstPage()` to be called multiple times before giving up (if for example, `Scroll.getElements()` fails initially, e.g. for certain websites in Hybrid Iframe mode)
- Added a new version number property to saves; this helps us keep track of what version a save is tied to
- Added a new Reset Option "confirm" dialog before resetting the options. Also added a timeout; this fixes a bug where if you clicked on it multiple times too fast, your entire options would be deleted!
- Added new UI Theme option to show the current version's theme
- Changed Exact Saved URL indicator from *url* to "url"
- Storing the nextDocument as document__ for the live document, in addition to document_ for the clone, in cases where the next/prev link is physically on the page and not in the cloned document (e.g. for certain websites). Note: Do NOT cache next link. It doesn't really buy us anything
- Added a new asynchronous on-demand listener for checking that the Saved URL matches the URL in Infy's Window
- In Popup, now saves last-used options (Scroll, Button, Auto -- not Next Link or Increment URL, also disregards Element and Append Mode settings if this is a Database URL)
- Options: Removed the default scroll action and append settings; Infy will now instead remember the last-used setting set in the Popup as the default dynamically
- Removed all remaining traces of "autoRepeat" and replaced them with "autoSlideshow"; they are both the same thing, so just use one. URLI uses autoRepeat, but I suppose Infy shouldn't
- Fixed the keyboard "on" shortcut to turn Infy on properly when it wasn't enabled/off (it wasn't previously doing some things that should be done in 0.5)
- Changed next/prev "attribute" name to "property". This isn't just an attribute, as it supports DOM properties like parentNode and also nesting of them
- UI: New mdc-theme-primary color that better reflects Infy's color, also was able to make mdc-dropdown icon match the custom mdc-theme-primary color
- Replaced the emoji separator-icon between text fields with a circle svg so they look consistent across browsers
- Now saving browser name in storage (e.g. "CHROME", "FIREFOX", "EDGE")
- Changed the Firefox Configure Shortcuts button in the Options to open a modal dialog explaining the steps
- Added new assets/help directory to store help images
- When sending messages via chrome.* api, added new receiver property to indicate that a message is intended for a specific environment (e.g. background, popup, options, contentscript)
- Changed all `var` references to `const` for all IIFEs
- Removed custom hard-coded scripts for websites that can be fixed via the new Fix Lazy Load option or Append Scripts option
- Auto: Now stopping the Auto Timer correctly when the user clicks Accept in the Popup but Auto isn't toggled on anymore. Also added commented out class version of AutoTimer

## Version 0.5 Happy Holidays Edition
<b>Released on 11/20/2020</b>
- Consolidated Actions. Combined the Next and Prev actions together and the Increment and Decrement actions together
- Now displaying the Database URL and Saved URL to the icon titles in the button controls when you hover over them
- Added a way to turn off UI messages when the message appears in the Popup. Now shows OK and Don't show this again
- Added page divider alignment option: left, center, or right alignment
- Added icon option to display or not display the infinity icon in the page divider or overlay
- Improved `Scroll.resizeMedia()` so that it only resizes images that are bigger than the window's width
- Improved Next/Prev Link algorithm. Now checking the element's parent, added endsWith subtype, and added about 5 more keywords for next/prev icons like `angle-right`
- Improved Page Divider styling for better compatibility with websites (added width: auto, height: auto, and position: initial)
- Fixed Firefox Version's inconsistent horizontal width in the Setup when switching actions (e.g. Next Link / Increment URL and Click Button / URL List) 
- Fixed Firefox Version's Button Controls showing a vertical scrollbar when the button size is really large (100 pixels or more) by increasing the margin around the buttons from 4px to 8px
- Fixed false positive "ON" badge for Database URLs. This was due to not testing the validity of the URL returned from the database's nextLink rule (e.g. it could have been the same URL or an invalid URL). Now calling `NextPrev.findNextPrevURL()` to determine the validity
- Fixed incorrect feedback on the insertion point sometimes being the last element's next sibling (this is because we were actually creating a text node when just performing the check)
- Added a second alternative option in `Scroll.calculateOffset()` to get the bottom in Append Element mode if the insertion point returns 0 using the max value of the elements' bottom position
- Added a way for the instance to get the tabId in two places: When the background sets the badge or when the Popup is opened. This is needed so that 
- Reworked some stats and formatting in the Debug Mode's overlay (line breaks)

## Version 0.4 Halloween Edition
<b>Released on 10/31/2020</b>
- Added new "Off" state with an `Off Button`; this replaces the "Clear" (X) Button, which only stopped the current instance on the page. The extension can now be (globally) permanently turned off by clicking Off. It will then never auto-activate again until you click the Accept button in the Window
- Controls/Buttons: Changed the order of the buttons slightly (Down and Up are reversed so Down isn't next to the Turn Off button) and added titles to them so users know what they do
- Replaced the "clear" action/shortcut with "off" and "stop". The name clear was a carryover from URLI's logic and doesn't make sense in Infy at all, when it really just means stop here
- Fixed a bug in the Firefox version's Window. The Window used to always show a horizontal scrollbar when a vertical scrollbar was present (this was fixed by setting overflow property to hidden)  
- Added three separate asynchronous on-demand listeners in Infy's Window that will give immediate feedback and details when editing the Next/Prev Rule, Page Element Rule, or Button Rule inputs (similar to the current Next Prev Link feedback)
- Changed the Element icon from window-maximize to cube. Changed the Database icon from cubes to database.
- Completely rewrote the algorithm in `Scroll.scrolledNearBottomPixels()` when using Append Element mode. We simply use the full document height (bottom) and subtract the fixed offset we calculate at the beginning (e.g. the insertion point). It used to simply try and calculate the parent element's height, but this isn't the correct way to do it
- Append Threshold metric is now tied to the Scroll Detection method. Pixels is now exclusively used in Scroll Listener mode and Pages is now exclusively used in Intersection Observer mode
- If Auto is enabled, the extension will now auto-pause itself every time you click the toolbar icon and open its Window
- Auto Pause Bugfix; there was a rare race condition where it "missed" a pause if you tried to pause it right after the Auto Listener creates the next AutoTimer
- Auto Slideshow Behavior now has its own setting saved in storage that is completely independent of the default Scroll Behavior (instant or smooth)
- A lot of the Auto code (Slideshow especially) has been substantially improved. During Slideshow, I decided to make it flexible and allow the user to go down and up as well. It probably isn't experimental anymore and is more robust now, but need to do more testing to make sure
- Fixed a bug that previously allowed multiple actions to fire before a page is appended (for example, multiple increment actions could happen before the next page got appended). This happened when the user tries to enter too many Down shortcut commands or button presses. We now immediately set the instance.isLoading property to true to guard against this in `Action.performAction()`
- No longer wrapping the first page in Append Page and Append Iframe modes. Infy previously would wrap the first page in a DIV or IFRAME in order to store the page in its pages array
- Internal Code: Removed `Scroll.outerPerformAction()` and refactored that code into `Action.performAction()`. This includes the "down," "up," and "repeat" Scroll-specific logic
- Internal Code: Removed `Scroll.wrapFirstPage()` and refactored it into `Scroll.prepareFirstPage()` and just a basic switch statement
- Internal Code: Now setting enabled state and other properties earlier in `Infy.buildInstance()` instead of waiting to do it in `Scroll.start()`. This avoids having to keep checking if an instance is a Saved URL or Database URL in different parts of the application
- Internal Code: Refactored Append Element/AutoPagerize code into separate and reusable functions: `getElements(), getInsertElement(), getPageElement()`
- Added stats in the Debug Mode's Overlay (e.g. bottom, offset)

## Version 0.3
<b>Released on 10/13/2020</b>
- Replaced all Percentage metrics (Append Threshold, Button) with Pixels from the bottom. Pixels scale perfectly no matter how many pages are on the screen
- Added two new properties: append scripts and append styles. These two options may help in fixing broken HTML or missing images on some websites (similar to Append Iframe mode)
- Added Auto Slideshow Behavior setting (this is transient and not saved to storage; its default value is derived from the Scroll Behavior setting in Options)
- Save URL Dialog: Added note that you must also click Accept to finalize saving the URL

## Version 0.2
<b>Released on 9/10/2020</b>
- Much better integration with AutoPagerize Database. You can now download the database instead of having to input it into a textfield
- Added Database Blacklist and a new Database Whitelist. The list that you use depends on whether you have Auto-activate on all Database URLs checked or not. Note: The Blacklist was named "Database Exclusions" in previous versions
- Database much more space-optimized. It was previously storing everything from the JSON response (including unnecessary data like example URLs); now it only stores the 3 or 4 required properties for each Database URL (url, nextLink, pageElement, insertBefore)
- Added Insert Before Rule for Append Element mode (Optional and rarely used 4th parameter for AutoPagerize Database URLs)
- Added new option to turn on/off UI Messages ("Heads up, Infy is already...")
- Fetch now uses the original Document's character encoding instead of always using UTF-8. This was problematic on some sites, especially older Japanese sites that used SHIFT-JIS
- Added xhr() fallback to fetch

## Version 0.1
<b>Released on 8/1/2020</b>
- First release after 5 years of development (Project start date was July 2015)
