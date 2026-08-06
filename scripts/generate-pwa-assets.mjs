// One-time generator for the PWA icon + splash assets committed under
// public/icons/ and public/splash/. Source of truth is the iOS app icon.
// Run with: npm run generate:pwa-assets
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";
const PARCHMENT = "#f2ede7";

// Portrait apple-touch-startup-image sizes: [device points w, h, scale]
// One entry per iPhone class; iOS only uses exact media-query matches.
const SPLASH_SIZES = [
  [375, 667, 2], // SE 2/3
  [375, 812, 3], // X/XS/11 Pro/12-13 mini
  [414, 896, 2], // XR/11
  [414, 896, 3], // XS Max/11 Pro Max
  [390, 844, 3], // 12/13/14
  [393, 852, 3], // 14 Pro/15/15 Pro/16
  [428, 926, 3], // 12/13 Pro Max/14 Plus
  [430, 932, 3], // 14 Pro Max/15 Plus/15 Pro Max/16 Plus
  [402, 874, 3], // 16 Pro
  [440, 956, 3], // 16 Pro Max
];

await mkdir("public/icons", { recursive: true });
await mkdir("public/splash", { recursive: true });

// Plain resizes. The source has no alpha, so apple-touch-icon needs no
// flattening; iOS rounds the corners itself.
for (const [size, name] of [
  [192, "icons/icon-192.png"],
  [512, "icons/icon-512.png"],
  [180, "icons/apple-touch-icon.png"],
]) {
  await sharp(SOURCE).resize(size, size).png().toFile(`public/${name}`);
  console.log(`public/${name}`);
}

// Maskable: full-bleed parchment canvas, icon scaled into the ~80% safe zone.
{
  const inner = await sharp(SOURCE).resize(410, 410).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 3, background: PARCHMENT },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile("public/icons/icon-maskable-512.png");
  console.log("public/icons/icon-maskable-512.png");
}

// Splash screens: solid parchment, icon centered at ~25% of device width.
for (const [w, h, scale] of SPLASH_SIZES) {
  const pxW = w * scale;
  const pxH = h * scale;
  const iconPx = Math.round(pxW * 0.25);
  const inner = await sharp(SOURCE).resize(iconPx, iconPx).png().toBuffer();
  const name = `public/splash/splash-${pxW}x${pxH}.png`;
  await sharp({
    create: { width: pxW, height: pxH, channels: 3, background: PARCHMENT },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(name);
  console.log(name);
}
