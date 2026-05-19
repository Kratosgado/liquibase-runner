# Architecture

## Overview

The extension follows a layered architecture with a clear separation of concerns. Every layer communicates upward through explicit interfaces; nothing imports downward.

```
src/
├── extension.ts          ← entry point, wires all layers together
├── types/index.ts        ← shared interfaces and enums (no internal imports)
├── config/               ← project detection + VS Code settings
├── runner/               ← command execution (strategy pattern)
├── changelog/            ← file parsing + file watching
├── tree/                 ← VS Code sidebar tree view
├── webview/              ← HTML panel (output, status, diff)
└── commands/             ← user-facing command handlers
```

---

## Data Flow: User Action → Output

```
User right-clicks project node → "Liquibase: Update"
        │
        ▼ commands/updateCommand.ts
  1. Resolve LiquibaseProject from tree node (or QuickPick)
  2. webviewManager.show('Liquibase: update')
  3. runnerFactory(project) → CommandRunner(MavenStrategy)
  4. runner.run('update', project, undefined, onEvent)
        │
        ▼ runner/CommandRunner.ts
  5. MavenStrategy.buildArgs()  → ['liquibase:update']
  6. MavenStrategy.getExecutable() → 'mvn'
  7. spawn('mvn', ['liquibase:update'], { cwd: project.rootPath })
  8. stdout chunks → onEvent({ type: 'stdout', data })
  9. process close → onEvent({ type: 'exit', data: '0' })
        │
        ▼ onEvent callback (in updateCommand.ts)
  10. webviewManager.postMessage({ type: 'stdout', data })
  11. outputChannel.append(data)
        │
        ▼ Webview JS (WebviewPanelManager.ts inlined HTML)
  12. window.addEventListener('message') → appendOutput(data)
  13. auto-scroll #output-stream
        │
        ▼ back in updateCommand.ts (after await)
  14. exitCode === 0 → treeProvider.refresh()
  15. exitCode !== 0 → vscode.window.showErrorMessage(...)
```

**Cancel flow:**
```
User clicks "Cancel" in webview
  → webview JS: vscode.postMessage({ type: 'cancelCommand' })
  → WebviewPanelManager fires messageHandlers
  → Command handler calls runner.cancel()
  → AbortController.abort() → SIGTERM on child process
  → close event fires with exitCode -1
```

---

## Layer Details

### `src/types/index.ts`

Single source of truth for all types. No imports from the project — only from `vscode`. Key types:

| Type | Purpose |
|---|---|
| `LiquibaseProject` | Detected project with rootPath, strategy, changelog/properties file paths |
| `ChangelogFile` | Parsed changelog file with its list of `Changeset[]` |
| `Changeset` | One `-- changeset author:id` entry with file path and line number |
| `LiquibaseCommand` | Union of `'update' \| 'status' \| 'validate' \| 'rollback' \| 'generateChangelog' \| 'diff'` |
| `RunnerEvent` | Streaming event: `{ type: 'stdout' \| 'stderr' \| 'exit' \| 'error', data: string }` |
| `CommandResult` | Final result: `{ exitCode, stdout, stderr, durationMs }` |
| `WebviewMessage` | Typed postMessage protocol between extension host and webview |
| `NodeKind` | Enum for tree node context values (`project`, `migrationsFolder`, `changelogFile`, `changeset`) |

### `src/config/`

**`projectDetector.ts`** — `detectProjects(workspaceFolders)` scans each folder and returns `LiquibaseProject[]`. Auto-detection order per folder:
1. `mvnw` present → Maven
2. `pom.xml` mentioning `liquibase` → Maven
3. `gradlew`/`gradlew.bat` + `build.gradle` mentioning `liquibase` → Gradle
4. `liquibase` binary on PATH → CLI
5. `liquibase.properties` present → Maven (fallback for Java projects)

Also reads `liquibase.properties` via regex to extract `changelogFile=` value.

**`configManager.ts`** — thin wrappers over `vscode.workspace.getConfiguration('liquibaseRunner')`. All settings read through here. `onConfigurationChange` lets `extension.ts` re-detect projects when settings change.

### `src/runner/`

Strategy pattern. `IRunStrategy` defines three methods every strategy must implement:

```ts
interface IRunStrategy {
  buildArgs(cmd, project, extraArgs?): string[];
  getExecutable(project): string;
  getCwd(project): string;
}
```

| Strategy | Executable | Example args |
|---|---|---|
| `MavenStrategy` | `mvn` or `./mvnw` | `['liquibase:update']`, `['liquibase:rollback', '-Dliquibase.rollbackTag=v1']` |
| `GradleStrategy` | `./gradlew` or `gradlew.bat` | `['liquibaseUpdate']`, `['liquibaseRollback', '--rollbackTag=v1']` |
| `CliStrategy` | `liquibase` (or configured path) | `['--changelog-file=...', '--defaults-file=...', 'update']` |

`CommandRunner` owns a `child_process.spawn` call and an `AbortController`. The `run()` method resolves with a `CommandResult` after the process exits. Streaming events are delivered synchronously via the `onEvent` callback.

`createRunnerFactory()` returns a factory function `(project: LiquibaseProject) => CommandRunner` that picks the right strategy based on `project.resolvedStrategy`.

### `src/changelog/`

**`ChangelogParser`** — no external dependencies (no js-yaml, no xml2js). Uses:
- SQL files: `/^--\s*changeset\s+(\S+):(\S+)/` per line
- XML files: `/<changeSet[^>]+id="([^"]+)"[^>]+author="([^"]+)"/g`
- YAML master: `/path:\s*['"]?([^'"\n\r]+)['"]?/` to find `includeAll` folder

`parseAll(project)` returns all `ChangelogFile[]` in alphabetical order (matching Liquibase's `includeAll` execution order).

**`ChangelogWatcher`** — wraps `vscode.workspace.createFileSystemWatcher`. Debounces 300ms before calling the `onChanged` callback to avoid thrashing on bulk saves.

### `src/tree/`

**`LiquibaseTreeNode`** extends `vscode.TreeItem`. The `contextValue` is set to the `NodeKind` enum string (`'project'`, `'changelogFile'`, etc.) which drives `when` clauses in `package.json` menus.

Node hierarchy:
```
project          → database icon, description = resolvedStrategy
└── migrationsFolder  → folder icon
    ├── changelogFile → file-code icon, resourceUri set for coloring
    │   └── changeset → git-commit icon, label = "author:id"
    └── ...
```

**`LiquibaseTreeProvider`** maintains an in-memory `changelogCache` keyed by `project.id`. Cache is cleared on `refresh()`. The provider also exposes `updateProjects()` so `extension.ts` can hot-reload detected projects without recreating the tree view.

### `src/webview/WebviewPanelManager.ts`

Singleton: at most one panel exists at a time; `show()` reveals an existing panel or creates a new one. The panel is created with `retainContextWhenHidden: true` so output is not lost when the user switches tabs.

The HTML/CSS/JS is a template literal inside `getWebviewContent(webview, nonce)`. No separate file — keeps the single-entry esbuild config intact.

**Three tabs:**
- **Output** — `<pre id="output-stream">` with ANSI stripping, auto-scroll, cancel button
- **Status** — table rendered when `showStatus` message arrives after a `status` command
- **Diff** — `<pre>` rendered when `showDiff` message arrives after a `diff` command

CSP: `script-src 'nonce-${nonce}'` with a fresh `crypto.randomUUID()` per panel creation.

### `src/commands/`

**`shared.ts`** — utilities reused by all command handlers:
- `pickProject(projects)` — skips QuickPick if only one project, shows it otherwise
- `buildOnEvent(webview, outputChannel)` — returns an `onEvent` callback that forwards to both the webview and the VS Code Output Channel
- `runCommand(opts)` — generic run+report helper used by `update`, `validate`, `generateChangelog`

Commands with extra interaction (`rollback`, `diff`, `status`) handle their own flow directly rather than going through `runCommand`.

**`registerCommands.ts`** — single registration point. Uses `(...args: any[]) => unknown` for the handler type since VS Code passes `unknown` at runtime; each handler internally casts to its expected argument type.

### `src/extension.ts`

`activate()` orchestration order:
1. Create `OutputChannel` + `WebviewPanelManager`
2. `detectProjects(workspaceFolders)` → initial project list
3. Create `LiquibaseTreeProvider` and `ChangelogWatcher[]`
4. `createTreeView(...)` — registers sidebar
5. `registerCommands(...)` — registers all 9 commands
6. Wire `onDidChangeWorkspaceFolders` and `onConfigurationChange` → `refreshProjects()`

---

## Adding a New Command

1. Add the command name to `LiquibaseCommand` in [src/types/index.ts](../src/types/index.ts)
2. Add the Maven goal / Gradle task / CLI verb to the `COMMAND_MAP` in each strategy file
3. Create `src/commands/myNewCommand.ts` following the pattern in [updateCommand.ts](../src/commands/updateCommand.ts)
4. Register it in [src/commands/registerCommands.ts](../src/commands/registerCommands.ts)
5. Add the command entry to `contributes.commands` and the desired menu in [package.json](../package.json)
