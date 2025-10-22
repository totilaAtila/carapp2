export interface PlatformCapabilities {
  browserName: string;
  platform: string;
  supportsFileSystemAccess: boolean;
  isPWA: boolean;
  isOnline: boolean;
  isIOS: boolean;
}

/** Detectează platforma și capabilitățile browserului */
export function detectPlatformCapabilities(): PlatformCapabilities {
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isSafari =
    /^((?!chrome|android).)*safari/i.test(ua) || !!(window as any).webkit;

  const supportsFileSystemAccess =
    !isIOS &&
    "showDirectoryPicker" in window &&
    typeof (window as any).showDirectoryPicker === "function";

  const browserName = isSafari
    ? "Safari"
    : navigator.userAgent.includes("Chrome")
    ? "Chrome"
    : navigator.userAgent.includes("Firefox")
    ? "Firefox"
    : "Alt browser";

  const platform = isIOS ? "iOS" : navigator.platform;
  const isPWA =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
  const isOnline = navigator.onLine;

  return {
    browserName,
    platform,
    supportsFileSystemAccess,
    isPWA,
    isOnline,
    isIOS,
  };
}
