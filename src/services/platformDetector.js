/** Detectează platforma și capabilitățile browserului */
export function detectPlatformCapabilities() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua) || !!window.webkit;
    const supportsFileSystemAccess = !isIOS &&
        "showDirectoryPicker" in window &&
        typeof window.showDirectoryPicker === "function";
    const browserName = isSafari
        ? "Safari"
        : navigator.userAgent.includes("Chrome")
            ? "Chrome"
            : navigator.userAgent.includes("Firefox")
                ? "Firefox"
                : "Alt browser";
    const platform = isIOS ? "iOS" : navigator.platform;
    const isPWA = window.matchMedia("(display-mode: standalone)").matches ||
        navigator.standalone === true;
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
