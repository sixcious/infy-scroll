# Infy Scroll
<img src="res/icon.svg" width="128" height="128" alt="Infy Scroll" title="Infy Scroll">

## Available For
<a href="https://chromewebstore.google.com/detail/infy-scroll/gdnpnkfophbmbpcjdlbiajpkgdndlino" title="Download for Google Chrome"><img src="res/chrome.svg" width="64" height="64" alt="Google Chrome"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://microsoftedge.microsoft.com/addons/detail/infy-scroll/fmdemgjiipojpgemeljnbaabjeinicba" title="Download for Microsoft Edge"><img src="res/edge.svg" width="64" height="64" alt="Microsoft Edge"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://addons.mozilla.org/firefox/addon/infy-scroll/" title="Download for Mozilla Firefox"><img src="res/firefox.svg" width="64" height="64" alt="Mozilla Firefox"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;

<br><br>
<img src="res/infy.png" width="540" height="600" alt="Infy" title="Infy">
<br><br>

## Important
I want you to be 100% happy with Infy Scroll! If something isn't working right, or if there's a feature you think is missing, please open an issue on GitHub and give me a chance to help before leaving a review:
https://github.com/sixcious/infy-scroll/issues
<br><br>

## About
Infy Scroll can let you add customized infinite scrolling to paginated websites and can auto-load the next page for you. Infy supports the AutoPagerize and InfyScroll databases so it can work automatically on many websites. Infy is is all about customization: you can customize each site's infinite scrolling settings exactly to how you want them to be, or you can let Infy analyze the page and try to apply the recommended settings for you. Note: Because each site is designed differently, Infy might not work on every site you try it on.

## Features
- Auto Settings: Infy can analyze a page and apply the recommended settings for you with a confidence score using its algorithms (May not work on every website)
- Customization: Customize settings in the UI Window for any site
- Main Features: 4 Actions and 6 Append Modes to support many websites
- Auto Mode: Automatically append pages, or use Slideshow Mode (supports Pause and Repeat)
- Save URLs: Infy can save your settings and then auto-activate on your favorite URLs
- Database Support: Infy supports the AutoPagerize and InfyScroll Databases allowing it to support thousands of websites for you automatically
- Element Picker (Powered by ElemPick): Pick an element on the page and generate a path to it automatically (May not work on complex websites)
- Path Types: Infy understands CSS Selectors, XPath expressions, and JS Paths, and can auto-detect what type of path you are entering, or can be set to a fixed path type by toggling the label (SE/XP/JS)
- Extra Features: Infy has extra features and custom scripts for a few popular websites (such as Google Search) that will try to fix missing image thumbnails
- User Interface: A simple UI made with Material Design and Lit

## Introducing AJAX
Since releasing Infy Scroll in August 2020, if you were to ask me what is the one feature I was working my hardest to implement — it's always been an append mode for [AJAX websites](https://developer.mozilla.org/docs/Glossary/AJAX). After two years of on and off development, I'm really proud to offer this [completely new and innovative append mode](https://github.com/sixcious/infy-scroll/wiki/AJAX) in V8, The Eightfinity Edition. AJAX comes in two versions: Iframe and Native.

## XF — One Step Closer to the Endgame
In developing something like Infy Scroll, my primary research is focused on answering the question: "Can it work on this site?" Starting in V9, XF makes many of these "impossible" sites — possible. It's tech that no one else is currently using (as of September 2025). That's Innovation — *that's* Infy.

## Auto Settings, AI, and the Auto Activation Endgame
With Auto Settings now in V10, we're coming ever closer to what I think the endgame for Infy Scroll will look like. The true endgame is a feature I'm dubbing "Auto Activation." To get there though, we'll likely need AI. I'm currently working on some proof-of-concept ideas and hope to make this a plausible reality one day in the near or distant future.

## Documentation
[Help Guide](https://github.com/sixcious/infy-scroll/wiki)

## FAQ
#### Can you help me make it work with a specific website?
I really wish I could! Please see [this post](https://github.com/sixcious/infy-scroll/issues/100) for a potential solution.

#### Why can't Infy Scroll execute custom scripts?
Unfortunately, because browsers strongly discourage this from a security standpoint (especially now that Manifest V3 is out!). Please  feel free to read the [Scripts and Styles](https://github.com/sixcious/infy-scroll/wiki/Scripts-and-Styles) section for more information and a potential solution.

#### What is the minimum browser version (and why is it to so high)?
The current minimum browser version is Chrome/Edge/Firefox `140`. I usually update the minimum browser version every time I do a release so I can use the latest and greatest ECMAScript features without worry. If your browser doesn't support it, I'm afraid you'll have to use another app/extension (I'm sorry!).

#### Why is the production version's source code minified?
I use [Terser](https://github.com/terser/terser) to minify the source code for production releases that I upload to your browser's web store. I mainly do this because I write a lot of comments and `console.log()` statements for debugging and because it cuts down the file size significantly.

## Permissions Justification
- `Read and change all your data on the websites you visit` - Infy needs to request this permission so that its content script can auto-activate on any Saved URL or Database URL you want it to.

## Privacy Policy
Infy Scroll does *not* track you. It does *not* use analytic services. It does *not* collect or transmit any data from your device or computer. All your data is stored locally on your device. Your data is *your* data.

## Contributing
Thank you for considering to contribute! The best way you can help me is to leave a review on the [Chrome Web Store](https://chromewebstore.google.com/detail/infy-scroll/gdnpnkfophbmbpcjdlbiajpkgdndlino/reviews), [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/infy-scroll/fmdemgjiipojpgemeljnbaabjeinicba), or [Mozilla Firefox Add-ons](https://addons.mozilla.org/firefox/addon/infy-scroll/). I really appreciate your support.

Kind Note: I am currently unable to accept code contributions or pull requests; if you have an idea or improvement in mind, please feel free to open an issue instead.

## License
<a href="https://github.com/sixcious/infy-scroll/blob/main/LICENSE">View License</a>  

## Copyright
Infy Scroll  
Copyright &copy; 2015-2020 <a href="https://github.com/sixcious" target="_blank">Sixcious</a>  
