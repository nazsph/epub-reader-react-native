import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export type EpubLocation = {
  cfi: string;
  progression?: number;
  displayed?: { page: number; total: number };
  href?: string;
  index?: number;
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
  currentLocation?: EpubLocation;
  onOpenToc: () => void;
  onOpenSettings: () => void;
  theme: ReaderThemeConfig;
};

export type ProgressBarProps = {
  progression: number;
  location?: EpubLocation;
  onSeek: (percentage: number) => void;
  theme: ReaderThemeConfig;
};

export type EpubReaderProps = {
  /** A file URI, content URI, or HTTPS URL pointing to an EPUB file. */
  source?: string;
  initialLocation?: string;
  title?: string;

  /** Granular UI Customization (all elements optional) */
  showHeader?: boolean;
  showTocButton?: boolean;
  showBookTitle?: boolean;
  showSettingsButton?: boolean;
  showToc?: boolean;
  showSettings?: boolean;
  showProgressBar?: boolean;

  /** Custom Render Slots */
  renderHeader?: (props: HeaderProps) => ReactNode;
  renderHeaderLeft?: (props: HeaderProps) => ReactNode;
  renderHeaderCenter?: (props: HeaderProps) => ReactNode;
  renderHeaderRight?: (props: HeaderProps) => ReactNode;
  renderProgressBar?: (props: ProgressBarProps) => ReactNode;
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
  onLocationsReady?: (total: number) => void;
  onLocationChange?: (location: EpubLocation) => void;
  onTocChange?: (toc: TocItem[]) => void;
  onThemeChange?: (themeKey: string, theme: EpubTheme) => void;
  onFlowChange?: (flow: EpubFlow) => void;
  onFontSizeChange?: (fontSize: number) => void;
  onControlsVisibilityChange?: (visible: boolean) => void;
  onPress?: (event: { x: number; y: number }) => void;
  onError?: (error: Error) => void;
  onLinkPress?: (href: string) => boolean | void;
};

export type EpubReaderRef = {
  goTo: (target: string | number) => void;
  goToPercentage: (percentage: number) => void;
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
  toggleControls: () => void;
  setControlsVisible: (visible: boolean) => void;
  getCurrentLocation: () => EpubLocation | undefined;
  getToc: () => TocItem[];
};
