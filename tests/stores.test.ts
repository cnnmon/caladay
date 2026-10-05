import { APP_STORE_URL, PLAY_STORE_URL, storeLinksFor } from "../lib/stores";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const appStore = { device: "iPhone", href: APP_STORE_URL };
const play = { device: "Android", href: PLAY_STORE_URL };

it.each([false, true])("sends iPhones and iPads to the App Store (Play live: %s)", (live) => {
  expect(storeLinksFor(IPHONE, 5, live)).toEqual([appStore]);
  expect(storeLinksFor(IPAD, 5, live)).toEqual([appStore]);
});

it("offers Android phones nothing until the Play listing is public", () => {
  expect(storeLinksFor(ANDROID, 5, false)).toEqual([]);
  expect(storeLinksFor(ANDROID, 5, true)).toEqual([play]);
});

it("offers computers every live store", () => {
  expect(storeLinksFor(WINDOWS, 0, false)).toEqual([appStore]);
  expect(storeLinksFor(IPAD, 0, false)).toEqual([appStore]); // a Mac without touch
  expect(storeLinksFor(WINDOWS, 0, true)).toEqual([appStore, play]);
});
