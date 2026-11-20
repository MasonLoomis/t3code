# Mason's T3 Code fork

This fork adds customizable notification and settle sounds to
[T3 Code](https://github.com/pingdotgg/t3code). It follows official **stable** releases and ships a
Windows installer that replaces the official app and uses the same data folder
(`%USERPROFILE%\.t3\userdata`).

Nothing here is sent upstream. Upstream does not take outside feature PRs, so never open a PR or
issue against `pingdotgg/t3code` from this fork.

## What's different

- **Notification sounds.** **Settings → General → Notifications** lets you choose a sound pack,
  set the volume and focus rule, and use your own clips for individual events. The command
  palette can mute notification sounds and switch packs. Export a JSON pack to move your custom
  clips to another device.
- **Settle sounds.** Settling a thread yourself plays one sound. A thread that settles any other
  way plays a second sound: auto-settle after a pull request merges or after the idle-days limit,
  an agent settling threads (for example with `t3_thread_organize`), or a settle from another
  device. The speaker button in the chat header turns the sounds on and off. **Settings → General →
  Sounds** picks the file for each kind (or Off) and sets the volume. Both settings stay on this
  device.
- **Your own sound files.** The app plays files from `%USERPROFILE%\.t3\userdata\sounds`
  (`.wav`, `.mp3`, `.ogg`, `.m4a`, `.flac`, `.webm`, up to 20 MB). The defaults are
  `Transformers-G1-Scene-Transition.wav` for your own settles and
  `Transformers-G1-Transformation.wav` for the rest. Your settle clips stay in that folder. With
  the folder empty or missing, settle sounds are silent.
- **Updates come from this fork.** The installer's updater reads releases from
  `MasonLoomis/t3code`, so the official updater cannot replace the fork. Only the stable track
  exists here; switching the app to nightly finds no updates.
- **Unsigned builds.** Windows SmartScreen shows "Windows protected your PC" the first time you
  run an installer. Choose **More info → Run anyway**.

How a settle is classified: `useThreadActions.settleThread` is the one path every manual settle
in the app takes (sidebar, menus, keybinding, command palette). It claims the thread and plays the
manual sound once the server accepts. The app also watches every environment's live thread list;
a thread that becomes settled without a claim from this window plays the automatic sound.

## Branches and tags

| Ref               | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `main`            | Mirror of `pingdotgg/t3code` `main`. Never commit here.                            |
| `vX.Y.Z`          | Fork releases, on the fork's commit. The app links update notes to this tag.       |
| `mason/stable`    | The default branch: the latest upstream stable tag plus the fork's commits on top. |
| `mason/candidate` | Temporary branch the sync workflow builds before it moves `mason/stable`.          |

Base fork feature branches on `mason/stable` and review changes against that stable base. When
bringing in a new upstream stable tag at the same time, use a temporary review branch that already
contains the tag and the existing fork patches. Advance `mason/stable` after the feature review.

## How syncing works

`.github/workflows/fork-sync.yml` runs every four hours and on demand (Actions → Fork sync → Run
workflow). It:

1. Finds the newest upstream tag matching `vX.Y.Z` exactly (nightly and preview tags are skipped)
   and the stable tag `mason/stable` is based on.
2. If they differ, rebases the fork's commits onto the new tag and pushes `mason/candidate`.
3. Runs `vp run check:changed <tag>` (format, lint, typecheck and the tests beside the fork's
   changes).
4. Builds the x64 NSIS installer on a Windows runner, with the official public sign-in config
   from `.env.example` and a WSL runtime archive built from the fork on Linux.
5. Publishes release `vX.Y.Z` with the installer, its blockmap and `latest.yml`, marks it latest,
   moves `mason/stable` (only if nobody pushed to it during the run), and mirrors upstream `main`.

A conflict or any failed step opens an issue on this repository and publishes nothing.

Steps 2 and 5 push commits that change `.github/workflows`, which the built-in Actions token is
not allowed to do. They need a repository secret named `FORK_SYNC_TOKEN`: a fine-grained personal
access token for `MasonLoomis/t3code` only, with **Contents: read and write** and **Workflows:
read and write**. Without it, runs with nothing new still pass, and a new upstream tag opens a
failure issue that says the secret is missing.

## Resolving a conflict

The fork's `vX.Y.Z` tags point at fork commits, so fetch upstream's tags into their own namespace
and rebase between those:

```sh
git fetch origin
git fetch https://github.com/pingdotgg/t3code.git '+refs/tags/v*:refs/upstream-tags/v*'
git switch mason/stable
git rebase --onto refs/upstream-tags/vNEW refs/upstream-tags/vOLD   # vOLD: the base mason/stable is on now
# fix each conflict, then: git add <files> && git rebase --continue
vp i && vp run check:changed refs/upstream-tags/vNEW
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
