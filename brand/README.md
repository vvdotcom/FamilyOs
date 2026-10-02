# Hometide brand

**Name:** Hometide (one word, capital H), always written that way, including in the wordmark (Bricolage Grotesque ExtraBold).

**Mark:** a rounded house doorway with the sun rising over two waves: the rhythm of a family's day.

| Colour | Hex | Use |
| --- | --- | --- |
| Night | `#1D2B36` | Doorway on light grounds, TV icon and banner background |
| Tide | `#2F7F7A` | Water; phone and web app icon background |
| Sun | `#F2A65A` | The sun |
| Shell | `#F3EFE6` | Doorway on dark grounds, wave line, wordmark on dark |

## Files

| File | Where it is used |
| --- | --- |
| `hometide-mark.svg` | Master mark for light backgrounds |
| `hometide-mark-on-dark.svg` | Master mark for dark backgrounds |
| `app-icon-1024.png` | Phone app icon (`apps/companion/assets/icon.png`), no transparency, as the App Store requires |
| `make-brand-assets.py` | Re-renders every PNG below from the SVG and the repo's Bricolage font |

Rendered copies in the apps:

- Phone/iOS and Android: `apps/companion/assets/icon.png`, `adaptive-icon.png` (on Tide), `brand-mark.png` (header).
- Web app: `apps/companion/public/icons/` (192, 512, maskable 512, Apple touch icon).
- TV app (Vega and Fire OS): `packages/shared-ui/src/assets/images/hometide-mark.png` (top-bar menu button), `apps/expo-multi-tv/assets/tv_icons/` (launcher icons and banner).
- Amazon Appstore listing: `store-listing/fire-tv/icon-1280x720.png` and `background-1920x1080.png`.
