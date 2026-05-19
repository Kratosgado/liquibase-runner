# Runner Layer

The runner layer executes Liquibase commands as child processes and streams output back to the UI. It uses the Strategy design pattern so execution details are swappable without changing any command handler.

## Strategy Pattern

```
CommandRunner
    └── IRunStrategy (interface)
            ├── MavenStrategy   → mvn liquibase:<command>
            ├── GradleStrategy  → ./gradlew liquibase<Command>
            └── CliStrategy     → liquibase <command>
```

`createRunnerFactory()` returns a factory that selects the right strategy based on `project.resolvedStrategy`:

```ts
const runnerFactory = createRunnerFactory();
const runner = runnerFactory(project);  // picks Maven/Gradle/CLI automatically
```

---

## IRunStrategy Interface

```ts
interface IRunStrategy {
  buildArgs(cmd: LiquibaseCommand, project: LiquibaseProject, extraArgs?: Record<string, string>): string[];
  getExecutable(project: LiquibaseProject): string;
  getCwd(project: LiquibaseProject): string;
}
```

Every strategy must implement these three methods. `buildArgs` produces the full argument list passed to `spawn`. `extraArgs` carries command-specific parameters (rollback tag, reference URL, etc.).

---

## Strategy Implementations

### MavenStrategy

Maps `LiquibaseCommand` → Maven goal via `COMMAND_MAP`:

| Command | Maven goal |
|---|---|
| `update` | `liquibase:update` |
| `status` | `liquibase:status` |
| `validate` | `liquibase:validate` |
| `rollback` | `liquibase:rollback` |
| `generateChangelog` | `liquibase:generateChangelog` |
| `diff` | `liquibase:diff` |

Extra args become `-Dliquibase.<key>=<value>` flags:
```
rollbackTag=v1.0  →  -Dliquibase.rollbackTag=v1.0
```

Executable resolution: configured value → `./mvnw` if present → `mvn`.

### GradleStrategy

Maps `LiquibaseCommand` → Gradle task via `COMMAND_MAP`:

| Command | Gradle task |
|---|---|
| `update` | `liquibaseUpdate` |
| `status` | `liquibaseStatus` |
| `validate` | `liquibaseValidate` |
| `rollback` | `liquibaseRollback` |
| `generateChangelog` | `liquibaseGenerateChangelog` |
| `diff` | `liquibaseDiff` |

Extra args become `--<key>=<value>` flags:
```
rollbackTag=v1.0  →  --rollbackTag=v1.0
```

Executable: configured value → `./gradlew` (Linux/Mac) or `gradlew.bat` (Windows).

### CliStrategy

Builds a flat argument list for the standalone Liquibase binary:

```
liquibase --changelog-file=<abs-path> --defaults-file=<abs-path> <command> [--<key>=<value>]
```

Both `--changelog-file` and `--defaults-file` use absolute paths resolved from `project.rootPath`.

---

## CommandRunner

```ts
class CommandRunner {
  run(cmd, project, extraArgs?, onEvent?): Promise<CommandResult>
  cancel(): void
}
```

### Execution

1. Calls `strategy.buildArgs()`, `strategy.getExecutable()`, `strategy.getCwd()`
2. Spawns the process with:
   ```ts
   spawn(executable, args, {
     cwd,
     env: { ...process.env },  // inherit PATH and JAVA_HOME
     shell: process.platform === 'win32',
     signal: abortController.signal,
   })
   ```
3. Accumulates `stdout`/`stderr` into strings AND calls `onEvent` in real time
4. Resolves with `CommandResult` on process close

### Cancellation

`cancel()` calls `abortController.abort()` which sends `SIGTERM` to the spawned process. The process exits with code `-1`. The `onEvent` callback receives `{ type: 'exit', data: '' }` and the `run()` promise resolves (not rejects).

### onEvent Callback

```ts
type RunnerEvent = { type: 'stdout' | 'stderr' | 'exit' | 'error', data: string }
```

The caller (command handler) typically wires this to both the webview and the output channel:

```ts
// from commands/shared.ts
const onEvent = (event: RunnerEvent) => {
  if (event.type === 'stdout' || event.type === 'stderr') {
    webview.postMessage({ type: event.type, data: event.data });
    outputChannel.append(event.data);
  }
};
```

---

## Command → CLI Mapping Quick Reference

| `LiquibaseCommand` | Maven | Gradle | CLI |
|---|---|---|---|
| `update` | `liquibase:update` | `liquibaseUpdate` | `update` |
| `status` | `liquibase:status` | `liquibaseStatus` | `status` |
| `validate` | `liquibase:validate` | `liquibaseValidate` | `validate` |
| `rollback` | `liquibase:rollback` | `liquibaseRollback` | `rollback` |
| `generateChangelog` | `liquibase:generateChangelog` | `liquibaseGenerateChangelog` | `generate-changelog` |
| `diff` | `liquibase:diff` | `liquibaseDiff` | `diff` |
