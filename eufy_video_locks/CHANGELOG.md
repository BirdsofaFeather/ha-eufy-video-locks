# Changelog

## 0.1.0-rc.2

- Track completed cloud polls independently of changed device states, preventing false watchdog reconnects in a quiet home while retaining failed/hung-poll and push recovery.
- Mark configured S330/E330 video as battery powered and disable media linger so the SDK stream budget and prompt shutdown apply.
- Share dedicated video clients across concurrent viewers and release them 1.5 seconds after the last viewer leaves; an individual failure preserves active sibling viewers.
- Add real SDK poll/budget and HTTP stream lifecycle regression tests to source checks and image publication.
- Document battery validation, update and rollback without publishing household identities or raw diagnostics.

## 0.1.0-rc.1

- Package configurable S330/chime control, live status and legacy video adapters.
- Package standalone E330 cloud control with private account/device identity validation.
- Pin JavaScript SDK 0.3.0 with archive checksum and guarded upstream source patches.
- Add private ingress pairing and authenticated HTTP/WebSocket/RTSP access.
- Supply matching HACS integration with independent domain and setup-form pairing credentials.
- Add synthetic protocol checks, publication audit and multiarchitecture image workflow.
- Document E330 identity prerequisites, migration, restore and version maintenance.

Experimental: generalized package requires supervised validation on each installation.
