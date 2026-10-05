// App store listings, and which ones to offer a website visitor.
export const APP_STORE_URL = "https://apps.apple.com/app/id6798105948";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.caladay.app";

// Flip to true once the Play listing is public. Until then (closed
// testing) the link shows "item not found" to everyone else, so the
// website offers no app to Android visitors and Android shares link to
// the website instead.
export const PLAY_STORE_LIVE = false;

export interface StoreLink {
  device: "iPhone" | "Android";
  href: string;
}

// The store for the visitor's phone, or every live store on a computer.
export function storeLinksFor(
  userAgent: string,
  maxTouchPoints = 0,
  playLive = PLAY_STORE_LIVE,
): StoreLink[] {
  const appStore: StoreLink = { device: "iPhone", href: APP_STORE_URL };
  const play: StoreLink = { device: "Android", href: PLAY_STORE_URL };
  // iPadOS reports itself as a Mac; touch support gives it away.
  const isIOS = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (isIOS) return [appStore];
  if (/Android/i.test(userAgent)) return playLive ? [play] : [];
  return playLive ? [appStore, play] : [appStore];
}
