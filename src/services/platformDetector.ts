export interface PlatformCapabilities {
  supportsFileSystemAccess: boolean;
  supportsServiceWorker: boolean;
  isPWA: boolean;
  isOnline: boolean;
  platform: string;
  browserName: string;
  isMobile: boolean;
}

export function detectPlatformCapabilities(): PlatformCapabilities {
  const ua = navigator.userAgent.toLowerCase();
  
  return {
    supportsFileSystemAccess: 'showDirectoryPicker' in window,
    supportsServiceWorker: 'serviceWorker' in navigator,
    isPWA: window.matchMedia('(display-mode: standalone)').matches,
    isOnline: navigator.onLine,
    platform: getPlatform(),
    browserName: getBrowserName(),
    isMobile: /mobile|android|iphone|ipad/i.test(ua),
  };
}

function getPlatform(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/mac/i.test(ua)) return 'macOS';
  if (/win/i.test(ua)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Necunoscut';
}

function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/opera|opr/i.test(ua)) return 'Opera';
  return 'Necunoscut';
}