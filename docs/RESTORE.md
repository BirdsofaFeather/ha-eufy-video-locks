# Backup and restoration

## Make a recoverable backup

1. Settings → System → Backups: create a full backup including Home Assistant and the **Eufy Video Locks** app. Confirm app data is included.
2. Download the backup and retain its encryption/recovery information privately. Keep a second copy off the Home Assistant hardware.
3. Privately record the app release, integration release, configured device/chime/channel, Eufy account used and source repository URL.
4. Preserve your own E330 command identity securely. The public source repository contains no credentials or household identity; downloading it alone cannot restore those values.

The app's persistent `/data` contains options, Eufy sessions, generated client ID and HTTP/RTSP pairing keys. The integration's config entry contains its bridge address and pairing keys. Restore both sides together when possible.

## Hardware failure or complete Home Assistant reinstall

1. Install supported Home Assistant OS on replacement hardware, then restore the full backup using Home Assistant's restore flow.
2. Ensure this repository remains in the App store and HACS. If app/source code was not restored, add the repository and reinstall the same release.
3. Restart Home Assistant after restoring/installing the custom integration. Check the app Configuration tab and start it.
4. Open the app Web UI and compare its current pairing values privately with the integration. The internal hostname can change when installing from a differently named repository; use the hostname currently shown.
5. If the integration cannot connect and its data was not restored, add **Eufy Video Locks** with the current hostname, ports and keys. Complete Eufy login challenges as needed.
6. Confirm status first. Check both physical doors before any supervised control test, then verify manual/app state changes and video separately. Update dashboards only to actual restored entity IDs.

## Uninstall/reinstall the app without reinstalling Home Assistant

Back up the app and its data **before uninstalling**. Uninstalling can remove `/data`, including your E330 identity and pairing keys. Prefer restoring the app backup after reinstalling. Otherwise re-enter your own Eufy credentials, profiles and identity; the app generates new pairing keys, so remove/re-add the integration with those keys. A GitHub reinstall alone does not recover lost credentials.

## Uninstall/reinstall the JavaScript SDK or upstream bridge

For this package, do not manually replace `node_modules` in a running container or run the old conversion script. Reinstall/update **this app** from its repository: its image build installs the pinned SDK and reapplies all repair/security layers. Container-local edits disappear on recreation.

Reinstalling the original upstream `eufy-sdk-bridge` creates a different app without these repair adapters. It cannot replace this app while retaining the repair simply because its name looks similar. Stop the upstream bridge, install this app and pair the matching integration. Preserve the old working backup for rollback.

## Upstream HACS updates

The upstream integration has domain `eufy_sdk`; this integration has domain `eufy_video_locks`. Updating one does not modify the other's files. Follow this repository's releases for app and matching integration updates. A future upstream repair may make the fork unnecessary, but migrating requires its own verified tests.

Never paste an encrypted backup's password, app credentials, private command identity or pairing keys into a GitHub issue.
