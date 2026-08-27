import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import WebView, { type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { epubRuntime } from './epubRuntime.generated';
import type {
  EpubFlow,
  EpubReaderProps,
  EpubReaderRef,
  EpubTheme,
  HeaderProps,
  ReaderThemeConfig,
  ThemePreset,
  TocItem,
} from './types';
import { buildReaderHtml } from './readerHtml';

type Message = { type: string; payload?: any };
type WebViewHandle = { postMessage: (message: string) => void };

const ReaderWebView = WebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebViewHandle>
>;

export const DEFAULT_THEMES: Record<ThemePreset, ReaderThemeConfig> = {
  light: {
    name: 'Açık',
    icon: '☀️',
    theme: { background: '#ffffff', color: '#111111', fontFamily: 'Georgia', lineHeight: 1.6 },
    ui: { bg: '#f8f8f8', cardBg: '#ffffff', text: '#111111', subtext: '#666666', border: '#e0e0e0', activeBg: '#e8e8e8' },
  },
  sepia: {
    name: 'Sepya',
    icon: '📖',
    theme: { background: '#fbf0d9', color: '#2e241d', fontFamily: 'Georgia', lineHeight: 1.6 },
    ui: { bg: '#f4ebd0', cardBg: '#fbf0d9', text: '#2e241d', subtext: '#746457', border: '#d7c8b7', activeBg: '#e8ddd0' },
  },
  dark: {
    name: 'Koyu',
    icon: '🌙',
    theme: { background: '#141414', color: '#e2e2e2', fontFamily: 'Georgia', lineHeight: 1.6 },
    ui: { bg: '#0d0d0d', cardBg: '#1e1e1e', text: '#ffffff', subtext: '#999999', border: '#333333', activeBg: '#2a2a2a' },
  },
};

type FlatTocItem = TocItem & { level: number };
function flattenToc(items: TocItem[], level = 0): FlatTocItem[] {
  let result: FlatTocItem[] = [];
  for (const item of items) {
    result.push({ ...item, level });
    if (item.subitems && item.subitems.length > 0) {
      result = result.concat(flattenToc(item.subitems, level + 1));
    }
  }
  return result;
}

/**
 * Displays DRM-free EPUB 2/3 books with built-in customizable UI (Header, Table of Contents, Settings).
 */
export const EpubReader = forwardRef<EpubReaderRef, EpubReaderProps>(function EpubReader(
  {
    source,
    initialLocation,
    title,
    showHeader = true,
    showToc = true,
    showSettings = true,
    renderHeader,
    renderHeaderRight,
    renderEmpty,
    defaultTheme = 'sepia',
    defaultFontSize = 18,
    defaultFlow = 'scrolled',
    customThemes,
    flow: controlledFlow,
    theme: controlledTheme,
    style,
    viewerStyle,
    headerStyle,
    onReady,
    onLocationChange,
    onTocChange,
    onThemeChange,
    onFlowChange,
    onFontSizeChange,
    onError,
    onLinkPress,
  },
  ref,
) {
  const webView = useRef<WebViewHandle>(null);
  const post = useCallback((type: string, payload?: unknown) => {
    webView.current?.postMessage(JSON.stringify({ type, payload }));
  }, []);

  // Internal configuration states
  const [themePreset, setThemePreset] = useState<string>(defaultTheme);
  const [fontSize, setFontSize] = useState<number>(defaultFontSize);
  const [internalFlow, setInternalFlow] = useState<EpubFlow>(controlledFlow || defaultFlow);
  const [isTocVisible, setIsTocVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  // Book metadata & reading status
  const [bookTitle, setBookTitle] = useState(title || 'Kitap');
  const [locationText, setLocationText] = useState('Okumaya hazırlanıyor…');
  const [toc, setToc] = useState<TocItem[]>([]);

  // Themes mapping
  const allThemes: Record<string, ReaderThemeConfig> = useMemo(() => {
    return { ...DEFAULT_THEMES, ...customThemes };
  }, [customThemes]);

  const activeThemeConfig: ReaderThemeConfig = allThemes[themePreset] || DEFAULT_THEMES.sepia;

  // Active theme calculation
  const computedTheme: EpubTheme = useMemo(() => {
    if (controlledTheme) return controlledTheme;
    return {
      ...activeThemeConfig.theme,
      fontSize,
    };
  }, [controlledTheme, activeThemeConfig, fontSize]);

  const activeFlow = controlledFlow || internalFlow;

  // Imperative handle
  useImperativeHandle(ref, () => ({
    goTo: (target) => post('goTo', target),
    next: () => post('next'),
    prev: () => post('prev'),
    setTheme: (nextTheme: EpubTheme) => post('theme', nextTheme),
    setThemePreset: (preset: string) => {
      setThemePreset(preset);
      const targetTheme = allThemes[preset]?.theme;
      if (targetTheme) onThemeChange?.(preset, { ...targetTheme, fontSize });
    },
    setFlow: (nextFlow: EpubFlow) => {
      setInternalFlow(nextFlow);
      post('flow', nextFlow);
      onFlowChange?.(nextFlow);
    },
    setFontSize: (size: number) => {
      setFontSize(size);
      onFontSizeChange?.(size);
    },
    openToc: () => setIsTocVisible(true),
    closeToc: () => setIsTocVisible(false),
    openSettings: () => setIsSettingsVisible(true),
    closeSettings: () => setIsSettingsVisible(false),
  }), [post, allThemes, fontSize, onThemeChange, onFlowChange, onFontSizeChange]);

  // Update title if prop changes
  useEffect(() => {
    if (title) setBookTitle(title);
  }, [title]);

  // Read EPUB as Base64 on RN side
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [isWebViewBooted, setIsWebViewBooted] = useState(false);

  useEffect(() => {
    let active = true;
    if (!source) {
      setBase64Data(null);
      return;
    }
    (async () => {
      try {
        let fileUri = source;
        if (Platform.OS === 'android' && source.startsWith('content://')) {
          const dest = FileSystem.cacheDirectory + 'epub_reader_tmp_' + Date.now() + '.epub';
          await FileSystem.copyAsync({ from: source, to: dest });
          fileUri = dest;
        }
        const b64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (active) {
          setBase64Data(b64);
        }
      } catch (err) {
        if (active) onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    return () => { active = false; };
  }, [source]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let message: Message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type === 'log') {
      const { level, message: logMsg } = message.payload || {};
      if (level === 'error') console.error('[WebView:Reader]', logMsg);
      else if (level === 'warn') console.warn('[WebView:Reader]', logMsg);
      else console.log('[WebView:Reader]', logMsg);
    }
    if (message.type === 'booted') {
      setIsWebViewBooted(true);
    }
    if (message.type === 'ready') {
      if (message.payload?.title && !title) setBookTitle(message.payload.title);
      setLocationText(message.payload?.title ?? 'Okumaya hazır');
      onReady?.(message.payload);
    }
    if (message.type === 'toc') {
      setToc(message.payload || []);
      onTocChange?.(message.payload);
    }
    if (message.type === 'location') {
      const { displayed, progression } = message.payload || {};
      if (displayed && displayed.page) {
        setLocationText(`Sayfa ${displayed.page} / ${displayed.total}`);
      } else if (typeof progression === 'number') {
        setLocationText(`%${Math.round(progression * 100)}`);
      }
      onLocationChange?.(message.payload);
    }
    if (message.type === 'error') onError?.(new Error(String(message.payload)));
    if (message.type === 'link') onLinkPress?.(String(message.payload));
  }, [title, onReady, onTocChange, onLocationChange, onError, onLinkPress]);

  // Track what data, theme, and flow were sent to avoid re-opening on every parent render
  const lastOpenedDataRef = useRef<string | null>(null);
  const lastThemeRef = useRef<string | null>(null);
  const lastFlowRef = useRef<string | null>(null);

  // Send 'open' once per book
  useEffect(() => {
    if (isWebViewBooted && base64Data && lastOpenedDataRef.current !== base64Data) {
      lastOpenedDataRef.current = base64Data;
      lastThemeRef.current = JSON.stringify(computedTheme || {});
      lastFlowRef.current = activeFlow;
      post('open', { source: base64Data, openAs: 'base64', initialLocation, flow: activeFlow, theme: computedTheme });
    }
  }, [isWebViewBooted, base64Data, initialLocation, activeFlow, computedTheme, post]);

  // Update theme dynamically without re-opening the book
  useEffect(() => {
    if (isWebViewBooted && computedTheme && lastOpenedDataRef.current) {
      const themeStr = JSON.stringify(computedTheme);
      if (lastThemeRef.current !== themeStr) {
        lastThemeRef.current = themeStr;
        post('theme', computedTheme);
      }
    }
  }, [isWebViewBooted, computedTheme, post]);

  // Update flow dynamically without re-opening the book
  useEffect(() => {
    if (isWebViewBooted && activeFlow && lastOpenedDataRef.current) {
      if (lastFlowRef.current !== activeFlow) {
        lastFlowRef.current = activeFlow;
        post('flow', activeFlow);
      }
    }
  }, [isWebViewBooted, activeFlow, post]);

  const onSelectTocItem = (href: string) => {
    setIsTocVisible(false);
    post('goTo', href);
  };

  const headerProps: HeaderProps = {
    title: bookTitle,
    location: locationText,
    onOpenToc: () => setIsTocVisible(true),
    onOpenSettings: () => setIsSettingsVisible(true),
    theme: activeThemeConfig,
  };

  const ui = activeThemeConfig.ui;
  const isFixedSize = style && (StyleSheet.flatten(style)?.height !== undefined || (StyleSheet.flatten(style)?.flex === undefined && StyleSheet.flatten(style)?.maxHeight !== undefined));

  if (!source) {
    if (renderEmpty) return <>{renderEmpty()}</>;
    return (
      <View style={[isFixedSize ? styles.fixedContainer : styles.flexContainer, { backgroundColor: ui.bg }, style]}>
        <Text style={styles.emptyIcon}>📚</Text>
        <Text style={[styles.emptyTitle, { color: ui.text }]}>Henüz bir kitap seçilmedi</Text>
        <Text style={[styles.emptySubtitle, { color: ui.subtext }]}>
          Okumak için geçerli bir EPUB kaynağı belirtin.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[isFixedSize ? styles.fixedContainer : styles.flexContainer, { backgroundColor: ui.bg }, style]}>
      {/* Built-in or Custom Header */}
      {showHeader && (
        renderHeader ? (
          renderHeader(headerProps)
        ) : (
          <View style={[styles.header, { backgroundColor: ui.cardBg, borderBottomColor: ui.border }, headerStyle]}>
            <View style={styles.headerLeft}>
              {showToc && (
                <Pressable
                  accessibilityLabel="İçindekiler"
                  onPress={() => setIsTocVisible(true)}
                  style={[styles.iconButton, { backgroundColor: ui.activeBg }]}
                >
                  <Text style={[styles.iconButtonText, { color: ui.text }]}>☰</Text>
                </Pressable>
              )}
              <View style={styles.titleContainer}>
                <Text style={[styles.title, { color: ui.text }]} numberOfLines={1}>{bookTitle}</Text>
                <Text style={[styles.subtitle, { color: ui.subtext }]} numberOfLines={1}>{locationText}</Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              {renderHeaderRight && renderHeaderRight(headerProps)}
              {showSettings && (
                <Pressable
                  accessibilityLabel="Okuma Ayarları"
                  onPress={() => setIsSettingsVisible(true)}
                  style={[styles.iconButton, { backgroundColor: ui.activeBg }]}
                >
                  <Text style={[styles.iconButtonText, { color: ui.text, fontSize: 16, fontWeight: 'bold' }]}>Aa</Text>
                </Pressable>
              )}
            </View>
          </View>
        )
      )}

      {/* Reader WebView */}
      <View style={[styles.viewerWrapper, viewerStyle]}>
        <ReaderWebView
          ref={webView}
          source={{ html: buildReaderHtml(epubRuntime) }}
          originWhitelist={['*']}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          webviewDebuggingEnabled
          scalesPageToFit={false}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        />
      </View>

      {/* Table of Contents (TOC) Modal / Drawer */}
      {showToc && (
        <Modal visible={isTocVisible} animationType="slide" transparent onRequestClose={() => setIsTocVisible(false)}>
          <View style={styles.modalOverlay}>
            <SafeAreaView style={[styles.drawerContainer, { backgroundColor: ui.cardBg }]}>
              <View style={[styles.drawerHeader, { borderBottomColor: ui.border }]}>
                <Text style={[styles.drawerTitle, { color: ui.text }]}>İçindekiler</Text>
                <Pressable onPress={() => setIsTocVisible(false)} style={styles.closeButton}>
                  <Text style={[styles.closeButtonText, { color: ui.subtext }]}>✕</Text>
                </Pressable>
              </View>

              {toc.length === 0 ? (
                <View style={styles.emptyToc}>
                  <Text style={[styles.emptyTocText, { color: ui.subtext }]}>İçindekiler tablosu bulunamadı.</Text>
                </View>
              ) : (
                <FlatList
                  data={flattenToc(toc)}
                  keyExtractor={(item, index) => item.id || item.href || String(index)}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.tocItem, { paddingLeft: 18 + (item.level || 0) * 16, borderBottomColor: ui.border }]}
                      onPress={() => onSelectTocItem(item.href)}
                    >
                      <Text style={[styles.tocItemText, { color: ui.text }]} numberOfLines={2}>
                        {item.label?.trim() || 'Bölüm'}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </SafeAreaView>
          </View>
        </Modal>
      )}

      {/* Reader Settings Modal Sheet */}
      {showSettings && (
        <Modal visible={isSettingsVisible} animationType="fade" transparent onRequestClose={() => setIsSettingsVisible(false)}>
          <Pressable style={styles.settingsOverlay} onPress={() => setIsSettingsVisible(false)}>
            <Pressable style={[styles.settingsSheet, { backgroundColor: ui.cardBg, borderColor: ui.border }]}>
              <View style={styles.settingsHeader}>
                <Text style={[styles.settingsTitle, { color: ui.text }]}>Okuma Ayarları</Text>
                <Pressable onPress={() => setIsSettingsVisible(false)} style={styles.closeButton}>
                  <Text style={[styles.closeButtonText, { color: ui.subtext }]}>✕</Text>
                </Pressable>
              </View>

              {/* Font Size Adjuster */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: ui.subtext }]}>Yazı Boyutu</Text>
                <View style={styles.fontSizeControls}>
                  <TouchableOpacity
                    onPress={() => {
                      const next = Math.max(12, fontSize - 2);
                      setFontSize(next);
                      onFontSizeChange?.(next);
                    }}
                    style={[styles.fontBtn, { backgroundColor: ui.activeBg }]}
                  >
                    <Text style={[styles.fontBtnText, { color: ui.text }]}>A-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.fontSizeDisplay, { color: ui.text }]}>{fontSize}px</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const next = Math.min(34, fontSize + 2);
                      setFontSize(next);
                      onFontSizeChange?.(next);
                    }}
                    style={[styles.fontBtn, { backgroundColor: ui.activeBg }]}
                  >
                    <Text style={[styles.fontBtnText, { color: ui.text }]}>A+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Theme Options */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: ui.subtext }]}>Tema</Text>
                <View style={styles.themeOptions}>
                  {Object.keys(allThemes).map((tKey) => {
                    const t = allThemes[tKey];
                    const isSelected = themePreset === tKey;
                    return (
                      <TouchableOpacity
                        key={tKey}
                        onPress={() => {
                          setThemePreset(tKey);
                          onThemeChange?.(tKey, { ...t.theme, fontSize });
                        }}
                        style={[
                          styles.themeOptionBtn,
                          { backgroundColor: t.ui.cardBg, borderColor: isSelected ? '#ff6e07' : ui.border },
                          isSelected && { borderWidth: 2 },
                        ]}
                      >
                        <Text style={styles.themeOptionIcon}>{t.icon}</Text>
                        <Text style={[styles.themeOptionText, { color: t.ui.text }]}>{t.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Reading Mode (Flow) */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: ui.subtext }]}>Okuma & Kaydırma Şekli</Text>
                <View style={styles.flowOptions}>
                  <TouchableOpacity
                    onPress={() => {
                      setInternalFlow('paginated');
                      post('flow', 'paginated');
                      onFlowChange?.('paginated');
                    }}
                    style={[
                      styles.flowOptionBtn,
                      { backgroundColor: ui.activeBg, borderColor: activeFlow === 'paginated' ? '#ff6e07' : ui.border },
                      activeFlow === 'paginated' && { borderWidth: 2 },
                    ]}
                  >
                    <Text style={styles.flowOptionIcon}>↔️</Text>
                    <View>
                      <Text style={[styles.flowOptionTitle, { color: ui.text }]}>Sağa / Sola Kaydır</Text>
                      <Text style={[styles.flowOptionSubtitle, { color: ui.subtext }]}>Sayfa sayfa geçiş (Swipe)</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setInternalFlow('scrolled');
                      post('flow', 'scrolled');
                      onFlowChange?.('scrolled');
                    }}
                    style={[
                      styles.flowOptionBtn,
                      { backgroundColor: ui.activeBg, borderColor: activeFlow === 'scrolled' ? '#ff6e07' : ui.border },
                      activeFlow === 'scrolled' && { borderWidth: 2 },
                    ]}
                  >
                    <Text style={styles.flowOptionIcon}>↕️</Text>
                    <View>
                      <Text style={[styles.flowOptionTitle, { color: ui.text }]}>Aşağı Kaydır</Text>
                      <Text style={[styles.flowOptionSubtitle, { color: ui.subtext }]}>Sürekli dikey akış (Scroll)</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  flexContainer: { flex: 1, width: '100%' },
  fixedContainer: { width: '100%', overflow: 'hidden' },
  viewerWrapper: { flex: 1, width: '100%', overflow: 'hidden' },

  // Header styles
  header: {
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: { fontSize: 18 },
  titleContainer: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 2 },

  // Drawer / TOC Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
  },
  drawerContainer: {
    width: '84%',
    maxWidth: 360,
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: { fontSize: 18, fontWeight: '700' },
  closeButton: { padding: 6 },
  closeButtonText: { fontSize: 16, fontWeight: 'bold' },
  tocItem: {
    paddingVertical: 14,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tocItemText: { fontSize: 14, lineHeight: 20 },
  emptyToc: { padding: 24, alignItems: 'center' },
  emptyTocText: { fontSize: 14 },

  // Settings Modal Sheet
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 15,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  settingsTitle: { fontSize: 18, fontWeight: '700' },
  settingRow: { marginBottom: 18 },
  settingLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },

  // Font size controls
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fontBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontBtnText: { fontSize: 16, fontWeight: 'bold' },
  fontSizeDisplay: {
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '700',
  },

  // Theme options
  themeOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  themeOptionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  themeOptionIcon: { fontSize: 20, marginBottom: 4 },
  themeOptionText: { fontSize: 13, fontWeight: '600' },

  // Flow options
  flowOptions: {
    gap: 8,
  },
  flowOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
  },
  flowOptionIcon: { fontSize: 22 },
  flowOptionTitle: { fontSize: 14, fontWeight: '700' },
  flowOptionSubtitle: { fontSize: 11, marginTop: 2 },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: { fontSize: 56, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
