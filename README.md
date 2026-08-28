# react-native-epub-reader

A modern, offline-capable, and customizable EPUB 2/3 reader component for **React Native** and **Expo**.

Powered by an embedded, sandboxed `epub.js` runtime inside a native WebView with zero CDN dependencies. It supports local files (`file://`, `content://`), base64 decoding, gesture-based pagination (swipe), continuous vertical scrolling, built-in themes, font resizing, and a table of contents drawer.

---

## ✨ Features

- 📖 **EPUB 2 & 3 Support**: Fast rendering for DRM-free EPUB books.
- ⚡ **Offline-First**: Bundled `epub.js` & `JSZip` runtimes—no remote CDN scripts needed.
- 📱 **Expo & React Native Ready**: Works seamlessly on Android & iOS.
- 🎨 **Built-in & Customizable UI**:
  - Header with book title, reading progress, and action buttons.
  - Table of Contents (TOC) drawer menu (`☰`).
  - Reading settings sheet (`Aa`) with Font Size adjuster (`A-`/`A+`), Themes, and Reading Modes.
- 🌗 **Themes Out of the Box**: Light ☀️, Sepia 📖, Dark 🌙 presets + custom themes support.
- 🔄 **Multiple Reading Modes**:
  - **Swipe / Paginated**: Smooth horizontal page-by-page swipe gestures.
  - **Scroll**: Continuous vertical reading with pull-to-next/prev chapter transitions.
- 📐 **Flexible Layouts**: Supports full-screen reader or embeddable fixed-height/card widget mode (`style={{ height: 400, borderRadius: 16 }}`).

---

## 📦 Installation

```sh
npm install react-native-epub-reader react-native-webview expo-file-system
```

or with Expo / Yarn:

```sh
npx expo install react-native-epub-reader react-native-webview expo-file-system
```

---

## 🚀 Quick Start

### Basic Usage (With Built-in UI)

```tsx
import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { EpubReader, type EpubReaderRef } from 'react-native-epub-reader';

export default function BookReaderScreen() {
  const reader = useRef<EpubReaderRef>(null);

  return (
    <View style={styles.container}>
      <EpubReader
        ref={reader}
        source="file:///path/to/book.epub"
        title="Pride and Prejudice"
        defaultTheme="sepia"
        defaultFontSize={18}
        defaultFlow="paginated"
        onReady={(meta) => console.log('Book ready:', meta.title)}
        onLocationChange={(loc) => console.log('Progress:', loc.displayed?.page)}
        onError={(err) => console.error(err)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

---

## 🛠️ Advanced Customization

### 1. Embedded / Card Widget Mode

You can constrain the reader to a card, modal, or fixed container size:

```tsx
<EpubReader
  source={bookUri}
  title="Preview Chapter"
  style={{
    height: 420,
    borderRadius: 16,
    overflow: 'hidden',
    margin: 16,
    elevation: 4,
  }}
/>
```

### 2. Custom Header Buttons (e.g., File Picker)

Add custom action buttons directly into the built-in header:

```tsx
<EpubReader
  source={bookUri}
  renderHeaderRight={({ theme }) => (
    <Pressable
      onPress={pickNewBook}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: theme.ui.activeBg,
      }}
    >
      <Text style={{ color: theme.ui.text, fontWeight: 'bold' }}>Pick File</Text>
    </Pressable>
  )}
/>
```

### 3. Custom Themes

Define your own color palettes and styles:

```tsx
const customThemes = {
  nordic: {
    name: 'Nordic',
    icon: '❄️',
    theme: { background: '#2e3440', color: '#eceff4', fontFamily: 'serif' },
    ui: {
      bg: '#242933',
      cardBg: '#2e3440',
      text: '#eceff4',
      subtext: '#d8dee9',
      border: '#434c5e',
      activeBg: '#3b4252',
    },
  },
};

<EpubReader
  source={bookUri}
  customThemes={customThemes}
  defaultTheme="nordic"
/>
```

### 4. Headless Mode (Custom UI)

Hide built-in UI components and control navigation programmatically via ref:

```tsx
<EpubReader
  ref={reader}
  source={bookUri}
  showHeader={false}
  showToc={false}
  showSettings={false}
/>
```

---

## 📖 API Reference

### `EpubReader` Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `source` | `string` | `undefined` | A local `file://`, `content://`, or remote `https://` EPUB URI. |
| `title` | `string` | `metadata.title` | Book title displayed in the header. |
| `initialLocation` | `string` | `undefined` | Initial EPUB CFI or chapter href to display. |
| `showHeader` | `boolean` | `true` | Show or hide the top navigation header. |
| `showToc` | `boolean` | `true` | Enable the Table of Contents drawer button (`☰`) and modal. |
| `showSettings` | `boolean` | `true` | Enable the Reading Settings button (`Aa`) and modal sheet. |
| `defaultTheme` | `'light' \| 'sepia' \| 'dark' \| string` | `'sepia'` | Initial active theme preset. |
| `defaultFontSize` | `number` | `18` | Initial font size in pixels. |
| `defaultFlow` | `'paginated' \| 'scrolled'` | `'scrolled'` | Initial reading mode (Swipe vs Continuous Scroll). |
| `customThemes` | `Record<string, ReaderThemeConfig>` | `undefined` | Custom theme definitions with UI colors. |
| `style` | `StyleProp<ViewStyle>` | `{ flex: 1 }` | Container style (supports fixed `height`, `margin`, `borderRadius`). |
| `viewerStyle` | `StyleProp<ViewStyle>` | `undefined` | Style applied directly to the reader viewer container. |
| `headerStyle` | `StyleProp<ViewStyle>` | `undefined` | Custom style overrides for the built-in header bar. |
| `renderHeaderRight` | `(props: HeaderProps) => ReactNode` | `undefined` | Render custom component on the right side of the header. |
| `renderHeader` | `(props: HeaderProps) => ReactNode` | `undefined` | Replace the entire header with a custom component. |
| `renderEmpty` | `() => ReactNode` | `undefined` | Render custom empty state when `source` is undefined. |
| `onReady` | `(meta: { title?: string; creator?: string }) => void` | `undefined` | Fired when the EPUB book has been loaded and parsed. |
| `onLocationChange` | `(location: EpubLocation) => void` | `undefined` | Fired on page/chapter change with progress and CFI. |
| `onTocChange` | `(toc: TocItem[]) => void` | `undefined` | Fired when the Table of Contents has been extracted. |
| `onThemeChange` | `(themeKey: string, theme: EpubTheme) => void` | `undefined` | Fired when user selects a different theme preset. |
| `onFlowChange` | `(flow: EpubFlow) => void` | `undefined` | Fired when user switches between paginated and scrolled mode. |
| `onFontSizeChange` | `(size: number) => void` | `undefined` | Fired when font size is adjusted. |
| `onError` | `(error: Error) => void` | `undefined` | Fired on loading or rendering error. |
| `onLinkPress` | `(href: string) => boolean \| void` | `undefined` | Intercept internal and external link presses. |

---

### `EpubReaderRef` Methods

Access imperative actions using `ref.current`:

```ts
// Navigation
reader.current?.next();                      // Go to next page/section
reader.current?.prev();                      // Go to previous page/section
reader.current?.goTo('chapter2.xhtml');      // Navigate to CFI or href

// Appearance & Settings
reader.current?.setThemePreset('dark');      // Switch active theme
reader.current?.setFontSize(20);             // Change font size
reader.current?.setFlow('scrolled');         // Switch reading mode ('paginated' | 'scrolled')

// Modals
reader.current?.openToc();                   // Open Table of Contents drawer
reader.current?.closeToc();                  // Close Table of Contents drawer
reader.current?.openSettings();              // Open reading settings sheet
reader.current?.closeSettings();             // Close reading settings sheet
```

---

## 🔒 Security & Offline Support

- All EPUB content is rendered in an isolated sandbox with restricted WebView origin.
- The `epub.js` runtime is embedded during the build, enabling complete offline reading without network requests.

---

## 📄 License

MIT © [react-native-epub-reader](https://github.com/nazsph/epub-reader-react-native)
