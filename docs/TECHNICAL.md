# Repair details and evidence

## Components and version boundaries

This repository combines a Supervisor app with a separate Home Assistant custom integration. The app embeds the upstream bridge and SDK plus narrowly scoped adapters. The integration authenticates to WebSocket, HTTP image and RTSP endpoints. It does not rewrite Home Assistant Core or upstream HACS files during startup.

Release candidate: 0.1.0-rc.1. Upstream app image: 0.4.0. JavaScript SDK: 0.3.0, installed from its public archive and checksum-verified. These version numbers describe different projects.

## S330 / T8530 with T8021 chime

**Control failure:** The generic FF09 actuator route waited for a level-2 session key. The working S330/chime path used the established 16-byte level-1 encrypted SET_PAYLOAD route with inner command **1961**. The original front-door test physically confirmed Home Assistant unlock and relock.

**Repair:** `front-control.mjs` checks the configured serial, T8530 model, paired chime, channel, attachment, member identity and encryption-key length. It sends one encrypted command using the verified direction mapping. `patch-front-control.mjs` inserts this path ahead of the SDK's default route; unrelated devices retain the SDK path. No action runs during import, discovery or app startup.

**Status failure:** The generic state decoding left the front lock unknown; older cloud snapshots could overwrite fresh live events.

**Repair:** `s330-status.mjs` decodes Eufy parameter **1912**: 3 means unlocked, 4 means locked; absent/malformed/anomalous values remain unknown. It retains newer boolean `lockState` events until a genuinely newer cloud parameter timestamp is available. It never interprets a jammed or missing value as unlocked.

**Video failure:** The device was a video lock rather than a generic camera codec. Its legacy chime start/stop frames differed from the SDK's normal path.

**Repair:** `door-video.mjs` uses the SDK's existing media provider without adding camera power/privacy capabilities. A dedicated S330 video client adapts encrypted integer command **1003** for start, **1139** for keepalive and **1004** for stop. The adapter checks the configured chime and channel and excludes the control client. Video startup and lock control remain separate operations.

## E330 / T8531 standalone

**Control failure:** The standalone route did not supply the P2P session key expected by the generic SDK actuator. Earlier generic commands, identity values and route assumptions produced no physical movement. The Android Eufy app operated the same lock through cloud with a Resident account and Bluetooth off, ruling out a requirement to use the Owner account or Bluetooth.

**Repair:** `back-cloud-control.mjs` uses a validated cloud MQTT route. It resolves the configured regional broker through DNS; a read-only FF09 settings request must succeed before any actuator publish. `read-settings.mjs` guards command **1940**, settings API **6016**, the exact lock/account envelope and settings plaintext.

The actuator uses transfer command **1940**, API **6018**, request opcode **0x4023** and correlated reply opcode **0x4823**. It validates the captured owner/account/name/short-user identity and TLV direction: zero locks, one unlocks. It allows **one** actuator publish and requires a matching request time and successful return code. Broker candidates may be tried while validating settings; an actuator timeout does not cause another actuator publish. A timeout means the physical result is unconfirmed, not proof that nothing moved.

The corrected original installation physically unlocked from Home Assistant. Relock was separately verified with the device's 30-second auto-lock disabled, so automatic relocking could not mask failure.

The E330 repair does not replace the S330 path. Models have different transport, encryption and identity rules. Both adapters are packaged in one app, selected by configured model/serial.

## Security repair

`patch-access.mjs` requires a private Bearer token for HTTP and WebSocket bridge access. It accepts no query-string tokens. Only actual same-container loopback GET health/media-producer requests bypass authentication. RTSP uses a separate password. go2rtc management/WebRTC listeners bind to loopback. Both config data and generated keys persist privately in `/data`; generated files use owner-only permissions.

The matching integration passes credentials in headers and escapes RTSP URL fields. Diagnostics redact pairing credentials and identifying values. Raw HTTP/RTSP are intended for the private HA app network, not internet exposure.

## What the automated checks prove

Synthetic tests validate configured target/chime/channel checks, S330 encryption/direction, status timestamp precedence, dedicated video framing, E330 real-SDK frame generation, settings-before-actuation, one publish, response correlation, rejection/timeouts, ordinary-device passthrough, pairing isolation and client credential handling.

Build-time patches check exact upstream source anchors and SDK version and fail rather than apply to an unknown layout. Hardware, network, firmware, regional and account behavior still require supervised physical validation after installation. The public package does not include the original household's credentials, device serials, captures, private identity or backups.
