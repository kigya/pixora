# Pixora — presets and assets

Seven AI presets use four primary networks alongside separate Pixel Art. Names/final processing are original functional alternatives, not exact reproductions of Upscayl models. Weight licenses permit redistribution; provenance/hashes are pinned in manifests.

| Preset | Network | Suitable reference |
|---|---|---|
| Standard | RealESRGAN_x4plus | [Golden Gate: bridge and landscape](https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_from_Battery_Spencer.jpg) |
| Lite | realesr-general-x4v3 | [Cliffs of Moher: sea and cliffs](https://commons.wikimedia.org/wiki/File:Cliffs_of_Moher,County_Clare,_Ireland.jpg) |
| Natural | RealESRNet_x4plus | [Hong Kong: smooth night transitions](https://commons.wikimedia.org/wiki/File:Hong-Kong_skyline.JPG) |
| Detail | RealESRGAN_x4plus + USM 0.15 | [Gazelles: fine outlines](https://commons.wikimedia.org/wiki/File:Gazelles_of_Sunset.jpg) |
| Balanced | RealESRGAN_x4plus, AI 80% / source 20% | [Fronalpstock: vegetation and water](https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg) |
| Sharp | RealESRGAN_x4plus + USM 0.35 | [Colosseum: architecture and masonry](https://commons.wikimedia.org/wiki/File:Roman_Colosseum_10.jpg) |
| Illustration | RealESRGAN_x4plus_anime_6B | [Wikipe-tan: line drawing](https://commons.wikimedia.org/wiki/File:Wikipe-tan_full_length.svg) |
| Pixel Art | Nearest-neighbor, without AI | [Isometric drawing, 31 × 28](https://commons.wikimedia.org/wiki/File:Isometric_Pixel_Art_Sample.png) |

Reference pages provide attribution/licenses. They are not bundled in the APK or represented as Pixora output. The current picker bundles different owner-supplied Before/After pairs; their numbering follows the table. Provenance, original/bundled SHA-256 values and dimensions are pinned in the [manifest](../assets/presets/manifest.json). The Processing example label does not promise identical bundled-model output.

Every AI preset supports 2×/4× and Fast/Quality. Fast caps AI input at 512 px; Quality at 1024 px; target dimensions are identical. Inputs up to 512 px use identical computation. Pixel Art has no speed switch. See [PRD](PRD.md) for configuration and limits.

Official catalog: [Real-ESRGAN model zoo](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/model_zoo.md). Quality depends on input; universal optimality is not claimed.
