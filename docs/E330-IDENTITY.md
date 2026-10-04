# Capture your private E330 command identity

This guide covers **E330 / T8531**, with the Eufy app on **Android or iPhone**. A companion tool on your computer receives authorized cloud messages for your own lock, extracts the operation identity and saves a private JSON file. Import that file into Home Assistant's `e330_identity` setting afterward.

**S330 / T8530 does not need this file.** Its separate repair gets the member identity from the SDK and sends commands through the paired T8021 chime. Configure the S330 serial, chime serial and channel using [the app instructions](../eufy_video_locks/DOCS.md). Do not use an E330 identity for an S330.

## What has been verified

| Part | Evidence and limitation |
|---|---|
| Original Android investigation | A working Resident-account app unlock/relock with Bluetooth off supplied the identity used by the successful Home Assistant E330 repair. |
| Companion helper in this source tree | Newly generalized from that diagnostic method. Decoder and request/reply safeguards have synthetic tests. **This standalone helper has not yet been tested against a physical lock.** |
| iPhone procedure | Uses the same computer-side cloud subscription, with Eufy on iPhone as the command source. It is a protocol-based procedure, **not a verified iPhone capture result**. Different command formats, broker routing or account policies may prevent capture. |
| Installed `0.1.0-rc.1` app | Accepts `e330_identity` but has **no capture button/wizard**. The helper is separate from the running Home Assistant app and lives in the updated source, not the original release ZIP. |

A Settings read, status event, MQTT connection or video stream alone cannot supply this identity. A timeout saves no identity; do not guess the missing fields.

## 1. Check your existing private recovery backup first

Look for **`command-identity-private.json`**, usually in an `e330_resident_lock_capture_...` folder under the saved app configuration. Keep it separate from your public GitHub package.

Reuse it only if the physical lock/serial, Eufy home ownership/sharing and bridge account remain unchanged. Restoring Home Assistant on replacement hardware alone does not necessarily require recapture. Changing accounts, re-sharing the home, transferring ownership or replacing the lock may invalidate it. If you already have a matching file, skip to **section 6**.

## 2. Understand the file

The identity is private device/account configuration, not a password, lock PIN, Home Assistant token or 2FA code.

| Field | Meaning |
|---|---|
| `target` | Exact configured T8531 serial. |
| `adminUserId` | Owner/admin identifier matching the SDK membership record: 40 hexadecimal characters. This does not mean you must promote the bridge account to Admin. |
| `cloudAccountId` | Identity used in the successful cloud envelope; must be the owner/admin or signed-in bridge account: 40 hexadecimal characters. |
| `username` | Working command's printable operation username, 1–64 ASCII characters; not necessarily the login email or display name. |
| `shortUserId` | Working command's short-member-ID bytes, encoded as hexadecimal: 1–16 bytes; not the displayed user number. |
| `observedAt` | Capture date in milliseconds since the Unix epoch; informational. |

The helper requires a consistent unlock/relock pair with matching successful replies, followed by your physical confirmation. Passwords, login sessions, MQTT certificates and raw messages are not saved. A captcha image may be written privately if login requires one.

## 3. Prepare the door, account and computer

1. Back up Home Assistant and save your bridge settings privately. In **Settings → Apps → Eufy Video Locks – S330 & E330 → Configuration**, note the bridge's Eufy account, `e330_serial` and `mqtt_host`.
2. Use that **same Eufy account** on the phone. A Resident account worked in the original repair; do not switch to Owner just to capture. Accept its home-sharing invitation and confirm it can see and operate the intended lock.
3. Leave `enable_control` false for new installations. Briefly stop the existing bridge and other diagnostic clients using that account during capture. Keep the phone's Eufy app running. Entities may be unavailable while the bridge is stopped; preserve its configuration.
4. Stand beside the closed door with a charged battery and a physical way to regain entry. Keep the computer clock accurate and both screens awake.
5. Download the **updated repository source**, extract it and find **`tools/identity-capture`**. It must contain `capture.mjs`, `decode.mjs`, `package.json` and `package-lock.json`. Installing the Home Assistant app does not install this computer tool.
6. Install **Node.js 24.5 or later** from [the official Node.js download page](https://nodejs.org/en/download). The installer includes `npm`. Open a new Terminal afterward.
7. Open Terminal in `tools/identity-capture`. On Mac, type `cd `, drag that folder onto Terminal and press Enter. On Windows/Linux, open a terminal in the folder or use `cd` with its path in quotes.
8. Run:

   ```sh
   node --version
   npm --version
   npm ci --ignore-scripts
   node capture.mjs
   ```

   `npm ci` installs the lockfile's dependencies with integrity verification. `--ignore-scripts` disables dependency installation scripts. This installs the helper locally and does not uninstall, convert or update Home Assistant's SDK.
9. Enter the bridge's Eufy email/password, two-letter account country and T8531 serial. Sensitive prompts show **no characters or dots**: type normally and press Enter. Credentials are not command-line arguments or shell-history entries. Use a normal interactive Terminal, not redirected input.
10. Complete the private 2FA prompt if requested. For a captcha, open the indicated `private/captcha-...-private.png` locally and type its answer. Do not retry rapidly after repeated challenges.
11. Enter the bridge's `mqtt_host`. The helper suggests a US/EU security hostname from the account region; other regions need their verified regional hostname. Optional observed IPv4 addresses normally stay blank.
12. Wait for **`LISTENING — 120 seconds`** before operating the lock. Continue with your phone section below.

The helper logs into Eufy, reads the authorized device record, gets MQTT credentials and **subscribes only**. It sends no Settings, video, lock or unlock command. You cause the bolt movements by pressing Eufy's controls. No USB debugging, root, jailbreak or interception certificate is required.

It checks up to six broker addresses because backend instances may route separately. Connections have distinct random client IDs, certificate verification enabled, no reconnect loop and subscriptions only to your lock's exact request/response topics. A topic grant does not establish that your phone's command arrived.

## 4A. Android: generate the working command

1. Sign into Eufy using the same account as the bridge. Turn Bluetooth **off in Android Settings**; keep Wi-Fi or cellular internet active.
2. Open the intended E330 device page and keep the screen awake. Do not open live video or operate other devices during this window.
3. After **LISTENING** appears on the computer, press **Unlock** in Eufy. Confirm the bolt physically retracts.
4. Wait about five to ten seconds, press **Lock** in Eufy and confirm the bolt extends. Do this before auto-lock if possible: an automatic relock event is not the explicit app command the helper needs.
5. Wait for the helper to report matching successful unlock and lock replies. Type **`YES`** at its final prompt only if both movements occurred and the door is now locked.
6. The helper should save:

   ```text
   tools/identity-capture/private/command-identity-private.json
   ```

7. A timeout/refusal saves no new file. Use troubleshooting below. Restore Bluetooth and your prior bridge state when finished.

The underlying Android method was physically verified in the original investigation. The newly generalized standalone tool still requires its own hardware validation.

## 4B. iPhone: generate the working command

1. Sign into Eufy using the same bridge account and confirm access to the shared home/device.
2. Go to **Settings → Bluetooth → Off**. Do not rely on Control Center: its Bluetooth button does not fully turn Bluetooth off. [Apple explains the distinction](https://support.apple.com/en-us/102412).
3. Keep Wi-Fi or cellular internet active. Open the intended E330 page and keep the screen awake.
4. After the computer says **LISTENING**, press **Unlock** in Eufy and confirm the bolt retracts. Wait five to ten seconds, press **Lock** and confirm it extends, preferably before auto-lock.
5. Wait for both matching successful replies. Type **`YES`** only if both physical movements occurred and the door is locked.
6. If a private identity file is saved, continue with section 6. If Eufy works but the helper saves nothing, the iOS path/format or broker routing may differ. This remains an unresolved result; do not import a partial identity.
7. Restore Bluetooth and your prior bridge state afterward. An authorized Android phone using the same Resident account is an alternative for reproducing the previously verified method.

**iPhone capture has not been physically verified for this project.** The helper can be attempted from a Mac, Windows or Linux computer, but it does not guarantee that the iPhone app uses the tested format. An iPhone cannot run Android ADB or PCAPdroid.

## 5. Optional phone diagnostics if the listener sees nothing

These identify connection endpoints or errors, not the private identity automatically. Their output can contain other private information; save it outside the public repository.

### Android: PCAPdroid connection capture

1. Get PCAPdroid using its [official Quick Start](https://emanuele-f.github.io/PCAPdroid/quick_start).
2. Set **App Filter → Eufy Security**, choose **PCAP File** and leave TLS decryption off for this endpoint-only trace.
3. Start capture and approve the local VPN prompt. Stop another VPN first if necessary.
4. With Bluetooth off, perform one supervised Eufy unlock/explicit relock. Stop capture immediately afterward and export the PCAP to a private computer folder.
5. In Wireshark, compare DNS/connection endpoints at the operation times. A useful display filter is `dns || tcp.port == 8883`; the actual port/path can differ.
6. If you identify a different verified Eufy security broker/address, supply it to the helper for one fresh window. Do not disable server certificate verification.

PCAP alone preserves TLS encryption. PCAPdroid's [TLS-decryption guide](https://emanuele-f.github.io/PCAPdroid/tls_decryption) describes trust/pinning restrictions and further application encryption. Its VPN alone does not expose the operation TLVs; this project has no verified Eufy TLS-interception recipe.

### Android: optional ADB log capture

Install [official Android Platform Tools](https://developer.android.com/tools/releases/platform-tools), enable Developer options → USB debugging, connect by USB and approve the computer. In a private output folder:

```sh
adb devices
adb -s PHONE_SERIAL logcat -v threadtime > eufy-phone-private.log
```

Replace `PHONE_SERIAL` with the phone's debugger serial, particularly if the Portal is also connected. Perform the single app operation pair, then press **Control-C**. This is a broad system/application log and may include unrelated private information. The app may omit payloads. [Android's logcat documentation](https://developer.android.com/tools/logcat) describes logging, not TLS decryption. Do not publish the log.

### iPhone: optional Mac RVI packet capture

Apple's [Recording a Packet Trace](https://developer.apple.com/documentation/network/recording-a-packet-trace) describes an attached iPhone's **Remote Virtual Interface (RVI)**. Normal identity capture does not need this.

1. Install the Apple developer tools/Xcode needed for `rvictl`. Connect the unlocked iPhone by USB and approve **Trust This Computer**.
2. Find its UDID in **Xcode → Window → Devices and Simulators**. Keep it private.
3. Open Terminal in a private output folder and replace the placeholder:

   ```sh
   rvictl -s YOUR_IPHONE_UDID
   ```

4. Note the resulting interface, commonly `rvi0`. Substitute the actual name below if different:

   ```sh
   sudo tcpdump -i rvi0 -w eufy-iphone-private.pcap
   ```

5. Perform one supervised Eufy unlock/explicit relock with Bluetooth off. Press **Control-C** immediately afterward, then remove the interface:

   ```sh
   rvictl -x YOUR_IPHONE_UDID
   ```

6. Use Wireshark to compare broker endpoints around the operations. An RVI can capture other apps' traffic; keep the recording short/private.

RVI records packets without decrypting TLS or the inner Eufy payload. No verified iPhone-only decryption recipe is provided here. Windows users can run the companion helper but cannot use this Mac RVI procedure. No jailbreak or certificate-pinning bypass is required by this guide.

## 6. Import the file and verify Home Assistant

1. Open your saved `command-identity-private.json` locally in a text editor. Do not upload it to GitHub or paste it into issues/chat.
2. Open **Settings → Apps → Eufy Video Locks – S330 & E330 → Configuration**. Confirm `e330_serial` matches `target` and the bridge account matches the captured account.
3. Paste the **entire JSON object**, not its file path, into the private **`e330_identity` text/string field**. If editing YAML, keep this option a JSON *string*, not a nested YAML object. The normal configuration form avoids quoting mistakes.
4. Save with `enable_control` false and start/restart the app. Complete authentication if needed. Verify discovery/status first.
5. When ready beside the closed door, enable control and restart. Send exactly one supervised Home Assistant unlock, confirm the bolt retracts, then one lock and confirm it extends. Do not send repeat commands while a request is pending.
6. Distinguish explicit relock from auto-lock. Test before the timer, or temporarily disable auto-lock in Eufy for the test and restore it afterward. A “locked” state after auto-lock does not prove the Home Assistant lock command moved the bolt.
7. Test manual/app status changes and video separately. The actuator identity does not by itself validate either feature.
8. Save the identity, app settings and working release/source version in your **encrypted recovery backup**. Exclude the helper's `private` folder, node_modules and phone recordings from public source ZIPs.

The app validates the identity against its current membership record before sending a command. No `.storage` edit, password change or manual conversion of the SDK is needed to import it.

## 7. Troubleshooting and cleanup

| Result | What to do |
|---|---|
| Missing helper folder | Obtain the updated source; the old release ZIP does not include it. |
| Node/npm unavailable | Install a supported Node runtime and reopen Terminal. |
| Input refused | Use a normal interactive local Terminal without redirected input. |
| Login fails/repeated challenges | Check country/account/invitation, stop competing clients and wait. SDK exception details are suppressed to avoid printing private data. |
| Membership record missing | Check T8531 model, exact serial and sharing access. Do not invent the owner ID. |
| Broker/topic denied | Verify region, configured `mqtt_host`, account permissions and cloud connectivity. Resident-to-Owner promotion is not an assumed fix. |
| App works but no requests | Check account/device, Bluetooth off and LISTENING first. Use an endpoint trace to diagnose different broker routing. |
| Unlock only | Press explicit Lock in Eufy before auto-lock during a fresh window. |
| Requests without matching success replies | No validated pair exists; do not import a partial result. |
| Conflicting identities | Stop other devices/accounts operating the lock; capture a consistent pair again. |
| Existing private output file | The tool refuses to overwrite it. Move it into a private recovery backup before rerunning. |
| iPhone still fails | iOS compatibility remains unverified. Preserve private diagnostics or use an authorized Android phone with the same account. |
| Imported identity rejected | Check JSON, serial, sharing, ownership and bridge account. Do not bypass the guard. |
| Status/video fails after control works | Those are separate adapters; see [Technical repairs](TECHNICAL.md). |

After any capture, confirm the door is locked, stop optional recording/VPN, restore Bluetooth/auto-lock and restart the previously running bridge. No temporary listener should remain running indefinitely.

## 8. Extraction details

The SDK obtains the account's MQTT credentials and device membership. The tool uses verified TLS to subscribe to `cmd/eufy_security/T8531/<your serial>/req` and `/res`, without publishing a device command.

The tested request has outer device/account identifiers and base64 `trans` JSON with command **1940**, API **6018**, request time and an encrypted BLE `ff09` frame. The decoder checks length, version, XOR checksum, opcode **0x4023** and fresh request time. It decrypts AES-128-CBC using the tested owner-ID/time key derivation and serial-derived IV.

TLVs **0xa1–0xa5** contain a four-byte field, owner/admin ID, direction (**0 lock / 1 unlock**), operation username and short-user-ID bytes. Only the configured device and permitted account are accepted. Successful **0x4823** replies must match request time. Both directions must yield one consistent identity before physical confirmation and private export.

This is a narrow decoder pinned to SDK **0.3.0**, not a universal Eufy protocol extractor. Protocol changes need review and supervised tests.
