# react-native-epub-reader

DRM-free EPUB 2/3 books for React Native and Expo. It is a local-first reader: the EPUB renderer runs in a sandboxed WebView and can open a `file://`, `content://`, or HTTPS EPUB URI.

## Status

This is a new package scaffold. The public React Native API, events, navigation, and theming are in place. Its build generates and embeds the `epub.js` runtime, so the published package stays offline-capable rather than loading a CDN at runtime.

## Install

```sh
npm install react-native-epub-reader react-native-webview
```

## Use

```tsx
import { useRef } from 'react';
import { EpubReader, type EpubReaderRef } from 'react-native-epub-reader';

const reader = useRef<EpubReaderRef>(null);

<EpubReader
  ref={reader}
  source="file:///data/user/0/com.myapp/files/book.epub"
  initialLocation="epubcfi(/6/2[chapter1]!/4/2/1:0)"
  theme={{ background: '#fffaf0', color: '#201a15', fontSize: 19, lineHeight: 1.7 }}
  onReady={(book) => console.log(book.title)}
  onLocationChange={(location) => saveProgress(location.cfi)}
  onError={console.error}
/>
```

Use `reader.current?.next()`, `prev()`, and `goTo(cfiOrHref)` to control navigation.

## Development

```sh
npm install
npm run typecheck
npm run build
```

## Roadmap

- Bundle epub.js into the WebView HTML during the release build
- Android `content://` stream adapter and iOS security-scoped file support
- Search, highlights/annotations, table of contents, and pagination mode
- Example Expo application and end-to-end tests with public-domain fixture EPUBs

## Security

Only DRM-free EPUB files are supported. Treat downloaded EPUBs as untrusted content; keep their rendering inside the supplied WebView and do not enable arbitrary native bridge commands.
