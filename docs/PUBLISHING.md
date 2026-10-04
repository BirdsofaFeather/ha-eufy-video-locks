# Publishing and maintaining releases

## First release

1. Create the public `BirdsofaFeather/ha-eufy-video-locks` repository and upload this clean source tree, including `.github/workflows` and license files. Do not upload private recovery backups or captures.
2. Run the **Check source and repair guards** workflow and resolve all failures.
3. Actions → **Build and publish installable app** → Run workflow on the intended commit. Alternatively push a tag exactly matching `v` plus the manifest version, such as `v0.1.0-rc.1`.
4. The build installs checksum-verified SDK 0.3.0, applies guarded patches and publishes amd64/arm64 images under one GHCR tag. Confirm both architectures are present.
5. In the GitHub package's settings, ensure container visibility is **Public**. A public source repository does not guarantee a newly created package is public. Verify an anonymous pull before announcing installation.
6. Create a GitHub release for the same version, marked pre-release while experimental. HACS uses the repository's integration manifest; App store uses the app's `config.yaml` image/version.
7. Install on a test HA system and validate setup, keys, 2FA, entity state, supervised control and video before declaring stable support. A CI pass does not operate real locks.

Consumers do not compile the SDK. GitHub's workflow builds the image and Home Assistant downloads it. This requires GitHub Actions to be enabled and its job to have `packages: write`; no personal access token or Eufy credential belongs in the workflow.

## When upstream releases a newer SDK

App wrapper version, bridge version and JavaScript SDK version are distinct. Do not update the SDK automatically to `latest` or `beta`.

1. Create a development branch. Review the upstream SDK/bridge changelog and exact diff.
2. Choose explicit upstream base-image and SDK versions. Update the SDK archive URL/checksum in Dockerfile and test preparation script.
3. Review all build patch anchors and runtime interfaces. The current scripts intentionally reject SDK versions other than 0.3.0. Update their guards only after reviewing the new methods, encryption and media behavior.
4. Run synthetic tests and container builds for both architectures. Adapt the real-SDK command-frame tests to prove the new version still produces the expected guarded format.
5. Install on a test HA instance with your own private profiles. Physically validate S330 and E330 unlock/relock, manual/app status and separate live feeds. Disable auto-lock during relock verification so it cannot mask failure.
6. Increment app `config.yaml` and integration `manifest.json` together, update changelog and documentation, and publish a matching image tag. Retain the previous release for rollback.

Use Home Assistant's app update and HACS integration update once that release is published. Existing `/data` and config entries remain through a normal update. Re-pair only if credentials or schema intentionally change.

## Failure handling

- **Source anchor changed:** stop; inspect upstream code rather than weakening the build guard.
- **Image unavailable:** confirm completed build, correct tag and public GHCR visibility.
- **Pairing fails:** use this app's current internal hostname and both distinct keys; avoid exposing port 3000 as a workaround.
- **Control result times out:** verify the physical lock before sending another command; do not add automatic actuator retries.
- **Rollback:** restore app and integration from the previous full backup together, then validate state before re-enabling automations.
