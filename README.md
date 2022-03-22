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
[View the Help Guide!](https://github.com/sixcious/infy-scroll/wiki)

## FAQ

#### Why Can't Infy Scroll Execute Custom Scripts?
Unfortunately, because Browsers strongly discourage this from a security standpoint. This is easily possible, and something I really wanted to include, but having something like `eval()` or `chrome.tabs.executeScript(code: <CustomScriptString>)` in the public release would likely result in either a rejection or extremely long extension review times (especially with Chrome's Manifest V3!).

###### A Workaround
You can write your own custom scripts inside a Userscript Manager (like [Violentmonkey](https://github.com/violentmonkey/violentmonkey)) by listening for Custom Events that Infy triggers whenever a new node or page has been appended or by implementing a [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver). Feel free to read the [Custom Scripts and Styles](https://github.com/sixcious/infy-scroll/wiki/Custom-Scripts-and-Styles) section for examples and more information.

#### What is the minimum browser version (and why is it to so high)?
Infy currently requires Chrome/Edge/Firefox `90` and higher to run. I tend to update the minimum browser version about once a year so I can use the latest and greatest ECMAScript features without worry. It also significantly saves in my testing time in having to maintain older Chromium builds. In the past, I used to offer "modified" builds with a lower minimum version, but I can no longer do this. If your browser doesn't support Infy, I'm afraid you'll have to use another app/extension (sorry).

#### Why is the production version's source code minified?
I use [Terser](https://github.com/terser/terser) to minify the source code for production releases that I upload to your browser's web store. I mainly do this because I write a lot of comments and `console.log()` statements for debugging that you don't want to have and because it cuts down the file size significantly. That said, you can always view a "Pretty Print" of the source code by using a [CRX Viewer](https://robwu.nl/crxviewer/) to inspect it before installing it.

## Permissions Justification
- `Read and change all your data on the websites you visit` - Infy needs to request this permission so that its content script can auto-activate on any Saved URL or Database URL you want it to.

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
  <li>Hover Box: <a href="https://github.com/AlienKevin" target="_blank">AlienKevin</a></li>
  <li>DOM Paths: <a href="https://github.com/chromium/chromium" target="_blank">Chromium</a></li>
  <li>Database: <a href="http://wedata.net/users/" target="_blank">AutoPagerize Contributors | Wedata</a></li>
  <li>Inspiration: <a href="#byWindLi">AutoPager</a>, <a href="https://github.com/swdyh/autopagerize" target="_blank">AutoPagerize</a>, <a href="https://github.com/jkoomjian/PageZipper" target="_blank">PageZipper</a>, <a href="https://github.com/machsix/Super-preloader" target="_blank">Super-preloader</a></li>
  <li>With Special Thanks:
    <a href="#lostpacket">LostPacket</a> and <a href="#daydreaming5">DayDreaming</a></li>
</ul>

... and most of all you for using Infy

## License
<a href="https://github.com/sixcious/infy-scroll/blob/main/LICENSE">View License</a>  

<a href="https://github.com/sixcious/infy-scroll/blob/main/LICENSEP">View Production Version License</a>

## Copyright
Infy Scroll  
Copyright &copy; 2015-2020 <a href="https://github.com/sixcious" target="_blank">Roy Six</a>  
Character Design and Artwork Copyright &copy; 2020 <a href="https://twitter.com/thejoyfool" target="_blank">Joyfool</a>
