# Pixora Android Maestro acceptance flows

These are user-driven Android acceptance journeys for an already installed debug or release build. They use the installed app's current session and settings; they do not clear app state, uninstall the app, choose arbitrary recent photos, send feedback, open email, or interact with a review/store prompt.

## Install the pinned CLI and run

The setup script installs only the official Maestro 2.11.0 CLI from [the pinned GitHub release archive](https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip) under ignored project-local data. It verifies SHA-256 `5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a` before extraction, rejects unsafe archive entries, and preserves executable permissions. It does not install anything globally.

```sh
python3 scripts/setup-maestro.py
```

Use the project's pinned JDK 21. Keep Maestro's Java user home and local state inside the ignored project-local directory, and disable CLI analytics and analysis notifications before any CLI command:

```sh
export JAVA_HOME='<configured JDK 21 path>'
export PIXORA_MAESTRO_HOME="$PWD/.p-build-app/local/maestro"
export JAVA_TOOL_OPTIONS="-Duser.home=$PIXORA_MAESTRO_HOME/user-home"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export MAESTRO_DISABLE_UPDATE_CHECK=true
MAESTRO="$PIXORA_MAESTRO_HOME/maestro/bin/maestro"
"$JAVA_HOME/bin/java" -version
"$MAESTRO" --version
"$MAESTRO" check-syntax e2e/maestro/01-upscale-save.yaml
"$MAESTRO" check-syntax e2e/maestro/02-settings-rtl-feedback-no-send.yaml
```

Before a device run, set `PIXORA_SAMSUNG_UDID` to the exact device ID from the current device inventory and choose the matching installed variant. The explicit target is required; do not let Maestro select another connected device. The flows require the external `APP_ID` parameter; the package ID is not baked into them. Do not reinstall between setup and flow execution.

```sh
export PIXORA_SAMSUNG_UDID='<exact Samsung device ID from current inventory>'
"$MAESTRO" --device="$PIXORA_SAMSUNG_UDID" test --env APP_ID=dev.kigya.pixora.debug e2e/maestro
"$MAESTRO" --device="$PIXORA_SAMSUNG_UDID" test --env APP_ID=dev.kigya.pixora e2e/maestro
```

Do not use Maestro Cloud or `--analyze` for this local acceptance gate. Android allows one UiAutomation owner at a time: stop the task-owned Android MCP/uiautomator session before starting Maestro, and do not issue MCP UI calls while a flow runs. Reconnect MCP after the flow has finished.

## Fixture and state preconditions

The first flow starts from the product's **READY** screen with the controlled `qa-large-photo.jpg` fixture already imported through Android Photo Picker from **Collections → PixoraQA**. The approved fixture is 1600×1200 and is staged by the acceptance owner at `Pictures/PixoraQA/qa-large-photo.jpg`. Select that album explicitly; never select a personal or “newest” photo. The flow does not automate the system picker because Photo Picker's album labels vary by Android build, and it never guesses a photo from the device library. It scrolls the app's long workbench to reach recommendation, preparation, and export actions on the Samsung viewport.

Complete first-language selection before running either flow. The first flow applies the photo fixture's Lite recommendation, deliberately changes the profile to Standard, selects Fast and 4×, cancels the large-image preparation once, then starts and saves the result. It sets the app's notification permission to denied for that launch. If the one-time “Continue without notifications” choice is present, it takes that path; if the choice was already recorded on this install, the run proceeds without asking again. After export it checks the persistent **Open** and **Share** actions instead of relying on the transient success message. A successful run leaves the completed/exported session available in the app.

The settings flow chooses Urdu and Hebrew and captures RTL screenshots, confirms Hebrew survives an app restart, returns the interface to English and the theme to System, then opens the feedback form and verifies its privacy disclosure and fields. Native locale synchronization recreates the Android Activity; the flow waits for Home and opens Settings again. It deliberately does not press **Send feedback** or open the email client. It leaves language English and theme System for the next test.

## Evidence boundary

The flows select the app's visible accessibility copy. On the tested Samsung, Maestro 2.11.0's live ID query missed a React Native testID that was present in the captured hierarchy; text selectors and relative selectors distinguish the profile action from its heading and the start action from the scale heading. Assertions check state transitions and outcomes of the journey, not just that a screen rendered. The Urdu and dark-theme screenshots are visual artifacts for later review.

Both flows have passed on the physical Samsung debug build. Final integrated debug/release repetitions remain acceptance work; current outcomes and artifact identity belong in `docs/quality/device-report.md`. A syntax parse or source inspection is not a device pass.

## Maestro syntax references

- [Maestro Flows](https://docs.maestro.dev/maestro-flows)
- [Pass an external `APP_ID` parameter](https://docs.maestro.dev/extra-materials/troubleshooting/faq)
- [Launch app and configure permissions](https://docs.maestro.dev/reference/commands-available/launchapp)
- [Conditional flow steps](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions)
- [Assertions](https://docs.maestro.dev/reference/commands-available/assertvisible)
- [Target one physical device](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/specify-and-start-devices)
- [Pinned official Maestro 2.11.0 release](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.11.0)
