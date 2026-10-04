# E330 command identity prerequisite

The E330 repair is not a universal zero-configuration command recipe. It requires a command identity matching **your** lock and the Eufy account used by this bridge. The SDK's generic member values did not reproduce the working Android app's command for the tested installation.

The app's private `e330_identity` setting is a JSON string containing these fields:

| Field | Meaning |
|---|---|
| `target` | Exact configured T8531 serial |
| `adminUserId` | 40-character hexadecimal owner/admin identifier matching the SDK's device membership record |
| `cloudAccountId` | 40-character hexadecimal identity used in the working cloud envelope; must be the owner/admin or the signed-in bridge account |
| `username` | Working app's printable operation username, 1–64 characters |
| `shortUserId` | Working app's short user ID bytes encoded as hexadecimal, 1–16 bytes |

## Existing successful repair

Use the identity from your own private recovery backup only if the lock, home ownership, sharing and bridge account are unchanged. Enter its JSON privately in Home Assistant; do not commit it to GitHub or paste it into issues. Changing accounts or re-sharing the device may require a fresh identity.

## New household or changed account

This release does **not** include an automated capture/decryption wizard. Establish the identity using authorized diagnostics of your own working Eufy app. The original investigation used an Android phone, local debugger/network captures, a Resident account with Bluetooth off, and a successful cloud unlock/relock. The working command's identity was compared with the SDK's membership record before being accepted.

The settings page loading successfully does not identify all actuator fields. A status-only capture is insufficient. Do not fill these fields with invented values, someone else's capture or an owner password. Normal Eufy 2FA login does not replace this identity prerequisite.

Until your own identity is obtained and verified, leave `enable_control` false. Status and video can be evaluated independently. This limitation is why the package is an experimental release candidate rather than a claim of support for every T8531 installation.
