# Still Browser

A privacy and focus oriented desktop browser prototype for Windows and macOS, built with Electron and the installed Chromium runtime.

## Run it

1. Install Node.js 22.12 or newer for your operating system.
2. In this folder, run `npm install`.
3. Run `npm start`.

## macOS app

Mac users can run the steps above, or build a standalone app with `npm run package:mac`. This creates separate Apple Silicon (`arm64`) and Intel (`x64`) apps in `dist-platforms`. Build the app on a Mac; Windows cannot produce a usable macOS app bundle.

To share downloadable Mac builds from GitHub, add this project to a GitHub repository and run the **Build macOS apps** workflow from the Actions tab. It creates one downloadable app archive for each Mac processor type. These builds are unsigned; macOS may ask the user to approve opening the app. Signing and notarization require an Apple Developer account and certificates.

## What it does

- Opens pages in regular tabs and isolated private tabs.
- Lets you choose Google or DuckDuckGo for address bar searches. The choice is stored locally; DuckDuckGo is selected initially.
- Blocks requests to a small built-in set of common ad and analytics hosts.
- Denies browser permission requests by default.
- Clears the temporary private session when its tab is closed.
- Keeps bookmarks locally in the browser profile. It does not implement browsing history.

Keyboard shortcuts: `Ctrl+L` address bar, `Ctrl+T` new tab, `Ctrl+W` close tab, `Ctrl+R` reload, `Alt+Left/Right` back/forward. On macOS use `Command` in place of `Ctrl` for the address bar, tab and reload shortcuts; `Command+Left/Right` navigates back and forward.

## Extensions

Use the puzzle button and choose an unpacked extension folder. Electron supports a subset of Chrome extension APIs; `.crx` files and extensions that depend on unsupported APIs will not load. Firefox `.xpi` archives must be unpacked first, and only add-ons compatible with the APIs Electron implements will work. Extensions are enabled in regular tabs, not temporary private tabs. They reload from their selected folders when the browser starts.

## Scope

This is a working starting point, not a replacement for a mature browser security team. The tracker list is deliberately small and is not a complete content blocker. The app uses Electron's native `WebContentsView` to display pages. No claim is made that this provides stronger overall security or privacy than Firefox.
