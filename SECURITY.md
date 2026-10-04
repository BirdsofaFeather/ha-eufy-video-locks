# Security and private data

Configure only devices/accounts you own or are authorized to operate. Never commit Eufy credentials, command identities, sessions, packet captures or Home Assistant backups to this public repository.

The app needs no Home Assistant Core API access, Supervisor API token, host networking or HA configuration mount. Its setup page is available only through Home Assistant's administrator ingress. Port mappings are disabled by default. Keep the app protected and retain those defaults for HA OS.

The bridge requires a 32-byte random Bearer token, represented as 64 hexadecimal characters. RTSP has a separate random password. These authenticate access but do not encrypt HTTP/RTSP themselves; use the private app network and Home Assistant's authenticated frontend. Do not expose the raw ports to the internet or an untrusted LAN.

E330 cloud operation depends on Eufy's cloud services and encryption/identity rules. DNS selects broker candidates; a successful read-only settings response is required before one guarded actuator publish. Device/profile validation is not permission to issue a test command: tests of physical doors must be supervised.

The E330 identity and Eufy account may permit door operation. Protect backups accordingly. Home Assistant integration diagnostics redact credential fields; detailed app/event logs may still contain upstream device/account information, so inspect and redact logs before sharing.

To rotate app pairing keys, first make a backup, stop the app and remove its private key file through an authorized administrative procedure. Restarting generates new keys; re-pair the integration with both new values. Do not delete the Eufy session or command identity merely to rotate bridge keys.

For a suspected vulnerability, use GitHub's private vulnerability reporting if enabled, or contact the repository owner privately. Do not post working credentials or a command identity in a public issue.
