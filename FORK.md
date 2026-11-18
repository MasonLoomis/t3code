# Mason's T3 Code fork

This is [T3 Code](https://github.com/pingdotgg/t3code) with one addition: sounds when a thread
settles. It follows the official **stable** releases only and ships a Windows installer that
replaces the official app and uses the same data folder (`%USERPROFILE%\.t3\userdata`).

Nothing here is sent upstream. Upstream does not take outside feature PRs, so never open a PR or
issue against `pingdotgg/t3code` from this fork.

## What's different

- **Settle sounds.** Settling a thread yourself plays one sound. A thread that settles any other
  way plays a second sound: auto-settle after a pull request merges or after the idle-days limit,
  an agent settling threads (for example with `t3_thread_organize`), or a settle from another
  device. The speaker button in the chat header turns the sounds on and off. **Settings → General →
  Sounds** picks the file for each kind (or Off) and sets the volume. Both settings stay on this
  device.
- **Your own sound files.** The app plays files from `%USERPROFILE%\.t3\userdata\sounds`
  (`.wav`, `.mp3`, `.ogg`, `.m4a`, `.flac`, `.webm`, up to 20 MB). The defaults are
  `Transformers-G1-Scene-Transition.wav` for your own settles and
  `Transformers-G1-Transformation.wav` for the rest. No sound files live in this repository. With
  the folder empty or missing, nothing plays and nothing errors.
- **Updates come from this fork.** The installer's updater reads releases from
  `MasonLoomis/t3code`, so the official updater cannot replace the fork. Only the stable track
  exists here; switching the app to nightly finds no updates.
- **Unsigned builds.** Windows SmartScreen shows "Windows protected your PC" the first time you
  run an installer. Choose **More info → Run anyway**.

The patch is small on purpose so upstream updates rarely conflict:

| Where                                                                                                                             | What                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/contracts/src/settleSounds.ts`                                                                                          | The `settleSounds` client setting                    |
| `apps/server/src/fork/settleSounds.ts`                                                                                            | `GET /api/fork/sounds` and `/api/fork/sounds/<file>` |
| `apps/web/src/fork/`                                                                                                              | Playback, the header button and the Settings section |
| One or two lines each in `settings.ts`, `server.ts`, `appInit.tsx`, `ChatHeader.tsx`, `SettingsPanels.tsx`, `useThreadActions.ts` | Hook points                                          |
| `.github/workflows/fork-sync.yml`, `FORK.md`                                                                                      | Sync and docs                                        |

How a settle is classified: `useThreadActions.settleThread` is the one path every manual settle
in the app takes (sidebar, menus, keybinding, command palette). It claims the thread and plays the
manual sound once the server accepts. The app also watches every environment's live thread list;
a thread that becomes settled without a claim from this window plays the automatic sound.

## Branches and tags

| Ref               | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `main`            | Mirror of `pingdotgg/t3code` `main`. Never commit here.                            |
| `vX.Y.Z`          | Upstream stable tags, mirrored.                                                    |
| `mason/stable`    | The default branch: the latest upstream stable tag plus the fork's commits on top. |
| `mason/candidate` | Temporary branch the sync workflow builds before it moves `mason/stable`.          |
| `mason-vX.Y.Z`    | Fork releases. The installer's version is the upstream version.                    |

## How syncing works

`.github/workflows/fork-sync.yml` runs every four hours and on demand (Actions → Fork sync → Run
workflow). It:

1. Finds the newest upstream tag matching `vX.Y.Z` exactly (nightly and preview tags are skipped)
   and the stable tag `mason/stable` is based on.
2. If they differ, rebases the fork's commits onto the new tag and pushes `mason/candidate`.
3. Runs `vp run check:changed <tag>` (format, lint, typecheck and the tests beside the fork's
   changes).
4. Builds the x64 NSIS installer on a Windows runner, with the official public sign-in config
   from `.env.example` and the official WSL runtime archive for the same version.
5. Publishes release `mason-vX.Y.Z` with the installer, its blockmap and `latest.yml`, marks it
   latest, moves `mason/stable`, and mirrors upstream `main` and the tag.

A conflict or any failed step opens an issue on this repository and publishes nothing.

Steps 2 and 5 push commits that change `.github/workflows`, which the built-in Actions token is
not allowed to do. They need a repository secret named `FORK_SYNC_TOKEN`: a fine-grained personal
access token for `MasonLoomis/t3code` only, with **Contents: read and write** and **Workflows:
read and write**. Without it, runs with nothing new still pass, and a new upstream tag opens a
failure issue that says the secret is missing.

## Resolving a conflict

```sh
git fetch origin
git fetch https://github.com/pingdotgg/t3code.git 'refs/tags/v*:refs/tags/v*'
git switch mason/stable
git rebase --onto vNEW vOLD        # vOLD is the tag mason/stable is based on now
# fix each conflict, then: git add <files> && git rebase --continue
vp i && vp run check:changed vNEW
git push --force-with-lease origin mason/stable
```

Then run the workflow by hand. It sees `mason/stable` already on the new tag and builds and
publishes it. Close the conflict issue.

## Building locally

Install [Vite+](https://viteplus.dev/guide/) (`irm https://vite.plus/ps1 | iex` in PowerShell),
Rust, Python 3 and Visual Studio Build Tools with the C++ workload, Windows SDK and Spectre
libraries (see `docs/operations/development.md#windows-installer-prerequisites`). Then:

```powershell
vp i
Copy-Item .env.example .env
$env:T3CODE_DESKTOP_UPDATE_REPOSITORY = "MasonLoomis/t3code"
vp run dist:desktop:win:x64
```

For a quick look without an installer, `vp run dev` runs the server and web app against a copy of
your data in the worktree's `.t3` folder. Copy your sound files into `.t3\userdata\sounds` to hear
them there.
