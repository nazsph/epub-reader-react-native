import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export type EpubLocation = {
  cfi: string;
  progression?: number;
  displayed?: { page: number; total: number };
};

export type TocItem = {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
};

export type EpubFlow = "scrolled" | "paginated";

export type ThemePreset = "light" | "sepia" | "dark";

export type EpubTheme = {
  background?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
};

export type ReaderThemeConfig = {
  name: string;
  icon: string;
  theme: EpubTheme;
  ui: {
    bg: string;
    cardBg: string;
    text: string;
    subtext: string;
    border: string;
    activeBg: string;
  };
};

export type HeaderProps = {
  title: string;
  location: string;
  onOpenToc: () => void;
  onOpenSettings: () => void;
  theme: ReaderThemeConfig;
};

export type EpubReaderProps = {
  /** A file URI, content URI, or HTTPS URL pointing to an EPUB file. */
  source?: string;
  initialLocation?: string;
  title?: string;

  /** UI Customization */
  showHeader?: boolean;
  showToc?: boolean;
  showSettings?: boolean;
  renderHeader?: (props: HeaderProps) => ReactNode;
  renderHeaderRight?: (props: HeaderProps) => ReactNode;
  renderEmpty?: () => ReactNode;

  /** Themes & Settings Defaults */
  defaultTheme?: ThemePreset;
  defaultFontSize?: number;
  defaultFlow?: EpubFlow;
  customThemes?: Record<string, ReaderThemeConfig>;

  /** Direct overrides */
  flow?: EpubFlow;
  theme?: EpubTheme;
  style?: StyleProp<ViewStyle>;
  viewerStyle?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;

  /** Callbacks */
  onReady?: (metadata: { title?: string; creator?: string }) => void;
  onLocationChange?: (location: EpubLocation) => void;
  onTocChange?: (toc: TocItem[]) => void;
  onThemeChange?: (themeKey: string, theme: EpubTheme) => void;
  onFlowChange?: (flow: EpubFlow) => void;
  onFontSizeChange?: (fontSize: number) => void;
  onError?: (error: Error) => void;
  onLinkPress?: (href: string) => boolean | void;
};

export type EpubReaderRef = {
  goTo: (target: string) => void;
  next: () => void;
  prev: () => void;
  setTheme: (theme: EpubTheme) => void;
  setThemePreset: (preset: ThemePreset | string) => void;
  setFlow: (flow: EpubFlow) => void;
  setFontSize: (fontSize: number) => void;
  openToc: () => void;
  closeToc: () => void;
  openSettings: () => void;
  closeSettings: () => void;
};
