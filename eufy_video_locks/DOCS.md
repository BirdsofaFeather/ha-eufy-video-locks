# Configuration and operation

## App options

| Option | What to enter |
|---|---|
| `email`, `password` | Eufy credentials entered privately in Home Assistant |
| `country` | Two-letter country used by your Eufy account; default US |
| `s330_serial` | Your S330's T8530 serial, or empty |
| `s330_chime_serial` | Its T8021 chime serial, or empty; both S330 fields are required together |
| `s330_channel` | Lock channel on that chime; original verification used 0 |
| `e330_serial` | Your standalone E330's T8531 serial, or empty |
| `e330_identity` | Private JSON for this E330 and account, described in the repository's E330 identity guide |
| `mqtt_host` | Eufy Security broker hostname; default `security-mqtt-us.anker.com` |
| `mqtt_fallback_ips` | Optional administrator-supplied IPv4 fallback addresses; normally leave empty |
| `enable_control` | Enables explicit repaired lock/unlock commands for configured profiles; initially false |
| `poll_ms` | SDK cloud polling interval, default 600000 ms |
| `stream_idle_ms`, `rtsp_idle_off_ms` | Media inactivity limits, default 300000 ms each |
| `stream_battery_budget_ms` | Optional positive limit for a battery-camera stream |
| `event_log` | Detailed event logging; false by default; keep logs private when enabled |

Other countries do not automatically change the explicit repair broker hostname. Use a verified endpoint for your region. Non-US repair routing and nonzero S330 channels have not been physically validated by this project.

## Pairing

The Web UI is an administrator setup page protected by Home Assistant ingress. It shows the container's own hostname. HTTP/WebSocket and RTSP credentials are different random keys generated once and retained in the app's `/data` directory.

The matching integration accepts those keys through its setup form and stores them in its config entry. It does not load secrets from a fixed shared file. If the app is uninstalled without keeping/restoring its data, new keys are generated. Remove/re-add the integration with the new pairing values, or restore both sides together.

## Video

Add the resulting camera entities to a Home Assistant picture-entity or picture-glance card and enable live view. Try one camera at a time and close the Eufy app's live view first. Battery devices can take time to wake; HLS adds buffering. Inventory discovery does not automatically open cameras.

Video adapters expose media only. They do not invent camera power/privacy capabilities for video locks. A successful lock command does not prove video works; test the feed separately. This repository does not configure Tapo or UniFi cameras.

## Migration from an existing repaired bridge

1. Make a full Home Assistant backup including the old bridge app, its data and the current custom integration. Download it to another machine.
2. Install the new app and integration, but leave the new app stopped initially. Record the original bridge's name, version and integration settings privately.
3. Stop the old bridge and disable its start-on-boot/watchdog before starting the new one. Disable/unload its integration if it keeps reconnecting. Keep its files and backup for rollback.
4. Configure this app with your own credentials, device profiles and E330 identity. Start and pair using its newly generated keys.
5. New integration entities have a different domain identity. Update dashboards/automations to the actual new entity IDs shown in Home Assistant. Do not guess or rename entities while automations are enabled.
6. Validate control, manual/app status updates and video at both doors. Only remove the old installation after these pass.

To roll back, stop the new app, disable its integration, restore/re-enable the old app and integration, and restore dashboard references. Do not run both bridges on the same account as a troubleshooting shortcut.
