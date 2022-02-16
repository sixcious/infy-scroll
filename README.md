# Infy Scroll
<img src="https://raw.githubusercontent.com/sixcious/infy-scroll/main/assets/icon-medium.svg?sanitize=true" width="196" height="196" alt="Infy Scroll" title="Infy Scroll">

## Available For
<a href="https://chrome.google.com/webstore/detail/infy-scroll/gdnpnkfophbmbpcjdlbiajpkgdndlino" title="Download for Google Chrome"><img src="https://raw.githubusercontent.com/sixcious/infy-scroll/main/assets/chrome.svg?sanitize=true" height="64" alt="Google Chrome"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://microsoftedge.microsoft.com/addons/detail/infy-scroll/fmdemgjiipojpgemeljnbaabjeinicba" title="Download for Microsoft Edge"><img src="https://raw.githubusercontent.com/sixcious/infy-scroll/main/assets/edge.png" height="64" alt="Microsoft Edge, Icon: By Source, Fair use, https://en.wikipedia.org/w/index.php?curid=62848768"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://addons.mozilla.org/firefox/addon/infy-scroll/" title="Download for Mozilla Firefox"><img src="https://raw.githubusercontent.com/sixcious/infy-scroll/main/assets/firefox.svg?sanitize=true" height="64" alt="Mozilla Firefox"></a>

<br><br>
<img src="https://raw.githubusercontent.com/sixcious/assets/main/infy.png" height="600" alt="Infy" title="Infy" align="left">

## Important Note
Infy is currently in beta. This means it might contain a few bugs and it might not work on every website you try it on! But I really want you to be 100% happy with Infy, so if something isn't working right, or if there's a feature you think is missing, please open an issue on GitHub and give me a chance to fix it before leaving a low rating/review, and I promise I will.
<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>

## About
Infy Scroll is an extension in beta that can auto-load the next page and let you add customized infinite scrolling to websites. It's also compatible with the AutoPagerize Database, which means it supports thousands of websites automatically. Infy supports 4 different actions and 4 different append modes so you can customize each site's infinite scrolling to how you want it to be. Infy understands both CSS Selector and XPath expressions for finding next links, and it features an Element Picker that can generate them for you, similar to the original AutoPager. It can also increment URLs and perform special actions, like clicking "Load More" buttons. You can save your settings for each URL and Infy will auto-activate the next time you visit them.

## Features
- 4 Actions: Next Link, Increment URL, Click Button, URL List
- 4 Append Modes: Page (for Simple Websites), Iframe (for Complex Websites), Element (AutoPagerize Mode), and Media (for Images like 001.jpg)
- Element Picker: Pick an element on the page and generate its CSS Selector or XPath expression automatically or use the EP's buttons to traverse the DOM in any direction (May not work on complex websites)
- Auto Detect Page Element (a new innovative feature): Let Infy's algorithm try to detect the page element for you roughly ~50% of the time (May not work well on complex websites)
- Next Link Algorithm: Let Infy's algorithm also try to figure out the next link for you by using your own customizable keywords
- Auto Mode: Automatically append pages, or use Slideshow Mode with Pause and Repeat
- Save URLs: Infy can save custom site-specific settings and then auto-activate on your favorite URLs
- AutoPagerize Database: Infy can use the AP Database to pre-configure thousands of websites for you automatically
- Custom Scripts: Infy has custom scripts for a few popular websites (such as Google Search) that will try to fix missing image thumbnails
- Advanced Features: Fix lazy loading or use the Element Iframe mode to fix missing images while in AP mode
- Chrome / Edge: Uses 0 Background Memory when inactive
- Firefox: Support for Firefox for Android (Fenix Nightly with Collections Workaround, Some features may not work perfectly)
- No Ads, No Tracking, No Bloat

## Support for Anti-Infinite Scrolling Sites Like Pixiv*
<img src="https://i.imgur.com/Ja7ieng.png" height="361" alt="Pixiv Infinite Scrolling (Infy Scroll)" title="Pixiv Infinite Scrolling (Infy Scroll)">

#### Infy Settings Used:
- Example URL: [https://www.pixiv.net/tags/Re:ゼロから始める異世界生活/illustrations](https://www.pixiv.net/tags/Re%3A%E3%82%BC%E3%83%AD%E3%81%8B%E3%82%89%E5%A7%8B%E3%82%81%E3%82%8B%E7%95%B0%E4%B8%96%E7%95%8C%E7%94%9F%E6%B4%BB/illustrations)
- Action: `Next Link`
- Next Rule (Selector): `nav > button[aria-current="true"] + a`
- Append: `Element` and check `Element Iframe Mode`
- Page Element Rule (Selector): `div.sc-l7cibp-0.juyBTC,div.sc-1eop7y7-0.cJYTWr`
- Saved URL (Regular Expression): `^https://www\.pixiv\.net/.*/?tags/.*/(illustrations|manga|novels)`

`*`*Tested on March 30, 2021. Requires page refresh due to SPA (Single Page Application) nature. Links must be opened in a new tab due to the nature of Iframes. Websites can change their code at any time and break these settings. `AUTO` mode may not work due to the complexity involved. Firefox users will need to use the regular `Iframe` append mode. This is just a simple example to show Infy's potential.*

## Help Guide
[View the Help Guide!](https://github.com/sixcious/infy-scroll/wiki/Help)

## Mini FAQ

#### Why Can't Infy Scroll Execute Custom Scripts (Besides Button Clicks)?
Unfortunately, because Browsers strongly discourage this from a security standpoint. This is easily possible, and something I really wanted to include, but having something like `eval()` or `chrome.tabs.executeScript(code: <CustomScriptString>)` in the public release would likely result in either a rejection or extremely long extension review times (especially when Chrome's Manifest v3 comes out).

###### A Workaround: Hardcoded Custom Scripts and Custom Events
Infy now ships with its own unique `scripts.js` file with hardcoded custom scripts inside of it. The scripts are for a few popular websites (including Google Search and Microsoft Bing Search) that fixes missing images and broken HTML. The script will execute on each new page that is appended. However, because the scripts are hardcoded, an update will be required if the website changes and the script no longer works.

Also, Infy can now trigger Custom Events whenever a new node is inserted or a page has been appended. You can write JavaScript code using a Userscript Manager like Violentmonkey that can listen for these events and then execute your custom code that way. Feel free to [see the Help Guide!](https://github.com/sixcious/infy-scroll/wiki/Help) for more details.

#### Can Infy work on websites that auto-load the next page via AJAX?
It depends, but implementing something that works generically (across many websites) would be extremely difficult without allowing custom scripts for each site. The most Infy can do is click a button for you and rely on the website itself to append the content asynchronously, but if the website *replaces* the previous page with the next page's content, this probably won't be what you're looking for.

## Permissions Justification
- `Read and change all your data on the websites you visit` - Infy needs to request this permission so that its content script can auto-activate on any Saved URL or Database URL you want it to.
- `wedata.net` and `github.io` - Infy needs to request permissions to these domains so it can download and use the AutoPagerize Database.

## Privacy Policy
Infy Scroll does *not* track you. It does *not* use analytic services. It does *not* collect or transmit any data from your device or computer. All your data is stored locally on your device. Your data is *your* data.

## Credits and Special Thanks
<ul>
  <li>Infy: <a href="https://twitter.com/thejoyfool" target="_blank">Joyfool</a></li>
  <li>UI: <a href="https://material.io/" target="_blank">Material Design</a></li>
  <li>Fonts: <a href="https://fonts.google.com/specimen/Roboto" target="_blank">Roboto</a></li>
  <li>Icons: <a href="https://fontawesome.com/" target="_blank">FontAwesome</a></li>
  <li>Animations: <a href="https://ianlunn.github.io/Hover/" target="_blank">Hover.css</a></li>
  <li>Tooltips: <a href="https://kazzkiq.github.io/balloon.css/" target="_blank">Balloon.css</a></li>
  <li>Loading: <a href="https://loading.io/" target="_blank">Loading.io</a></li>
  <li>Resizing: <a href="https://github.com/davidjbradshaw/iframe-resizer" target="_blank">Iframe Resizer</a></li>
  <li>DOM Paths & Hover Box: <a href="https://github.com/chromium/chromium" target="_blank">Chromium</a> & <a href="https://github.com/AlienKevin/html-element-picker" target="_blank">EP</a></li>
  <li>Database: <a href="http://wedata.net/users/" target="_blank">AutoPagerize Contributors | Wedata</a></li>
  <li>Inspiration: <a href="#byWindLi">AutoPager</a>, <a href="https://github.com/swdyh/autopagerize" target="_blank">AutoPagerize</a>, <a href="https://github.com/jkoomjian/PageZipper" target="_blank">PageZipper</a>, <a href="https://github.com/machsix/Super-preloader" target="_blank">Super-preloader</a></li>
  <li>With Special Thanks:
  <a href="#">LostPacket, </a></li>
</ul>

## License
<a href="https://github.com/sixcious/infy-scroll/blob/main/LICENSE">View License</a>

## Copyright
Infy Scroll  
Copyright &copy; 2015-2020 <a href="https://github.com/sixcious" target="_blank">Roy Six</a>  
Character Design and Artwork Copyright &copy; 2020 <a href="https://twitter.com/thejoyfool" target="_blank">Joyfool</a>
