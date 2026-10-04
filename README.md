# Eufy Video Locks

Home Assistant app and matching HACS integration for **S330 / T8530 with T8021 chime** and **standalone E330 / T8531**: lock control, status and video adapters. Independent community project; not an official Eufy product.

**Release candidate 0.1.0-rc.1.** The underlying repairs were verified on one installation. This configurable package has automated regression checks; other devices, firmware, accounts, regions and channels need their own validation. Do not replace a working installation without a backup.

## What to install

Install **both** components from this repository:

| Component | Where | Purpose |
|---|---|---|
| Eufy Video Locks – S330 & E330 | Settings → Apps → App store | Runs the SDK, repair adapters and video server |
| Eufy Video Locks | HACS → Integrations | Creates Home Assistant lock, camera and other entities; authenticates to the app |

No conversion script, manual SDK compilation or direct editing of Home Assistant's `.storage` files is required. GitHub Actions builds the container; Home Assistant downloads it. The new integration uses its own `eufy_video_locks` domain so upstream HACS updates do not overwrite it.

## Installation

1. In Settings → Apps → App store → ⋮ → Repositories, add:
   `https://github.com/BirdsofaFeather/ha-eufy-video-locks`
2. Install **Eufy Video Locks – S330 & E330**. If the app reports an image not found, the release image has not been published or its GHCR visibility is private; see [Publishing](docs/PUBLISHING.md).
3. In HACS → ⋮ → Custom repositories, add the same URL with category **Integration**. Download **Eufy Video Locks**, then restart Home Assistant.
4. In the app Configuration tab, enter your Eufy account email, password and country. A separate account shared to the home as **Resident** worked in the original tests. Confirm that this account can operate the intended lock in Eufy itself.
5. Configure your own device serials. S330 needs both its T8530 serial and the paired T8021 chime serial. Channel defaults to zero. E330 needs its T8531 serial. Leave a model's fields empty if you do not own it.
6. Leave `enable_control` **false** for initial setup. E330 control also requires **your own private command identity** in `e330_identity`. It is not included or discovered automatically. Read [E330 identity setup](docs/E330-IDENTITY.md) before enabling it. S330 control uses the account/member identity obtained by the SDK.
7. Stop any other bridge using the same Eufy account before starting this one. Start this app, then select **Open Web UI**. Copy its bridge hostname, bridge access token and video password privately.
8. Settings → Devices & services → Add integration → **Eufy Video Locks**. Enter that hostname, port **3000**, video port **8554**, and the two keys. Complete Eufy 2FA or captcha if requested.
9. Confirm devices and status. After the appropriate profile and E330 identity are validated, enable control and restart the app. Perform one supervised lock/unlock test at each closed door. Then test manual/app status changes and video separately.

Keep the app's Network port mappings disabled when Home Assistant and the app run on the same HA OS installation. Use the internal hostname shown in the setup page, not a fixed LAN IP.

## Documentation

- [Configuration, operation and migration](eufy_video_locks/DOCS.md)
- [What failed and how the repairs work](docs/TECHNICAL.md)
- [E330 private command identity](docs/E330-IDENTITY.md)
- [Backup, hardware replacement and reinstallation](docs/RESTORE.md)
- [Maintaining SDK versions and publishing updates](docs/PUBLISHING.md)
- [Security boundaries](SECURITY.md)

## Versions and updates

The app version, bridge release and JavaScript SDK version are separate. This package is **0.1.0-rc.1**, based on the upstream app wrapper **0.4.0**, and installs the JavaScript SDK **0.3.0** with a verified archive checksum. It does not stay on SDK 0.2.0. New upstream SDK releases require review of the guarded patches and supervised device tests before a new package release.

## Development

With Node 24.5+ and Python 3.12+:

```sh
bash scripts/prepare-test-sdk.sh
node tests/test-repairs.mjs
python tests/test-integration.py
python scripts/audit-package.py
```

Tests use synthetic identities, mock transports and a checksum-verified SDK archive. They send no commands to physical devices. Build guards reject changed upstream patch locations or an unexpected SDK version. A successful build does not prove behavior on another household's locks.

## Attribution and licensing

Based on [mega-yfue's bridge](https://github.com/mega-yfue/ha-eufy-sdk-bridge), [JavaScript SDK](https://github.com/mega-yfue/eufy-sdk), [Home Assistant integration](https://github.com/mega-yfue/ha-eufy-sdk), and [app wrapper](https://github.com/mega-yfue/ha-eufy-sdk-addon). Bridge/SDK and repair adapters: Apache-2.0; integration/app wrapper: MIT. See [NOTICE](NOTICE) and the corresponding license files. Public source fixtures retain their upstream license.
