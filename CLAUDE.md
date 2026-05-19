# CLAUDE.md — Liquibase Runner VS Code Extension

## What This Is

A VS Code extension that provides a UI for managing Liquibase database migrations in Java projects. Supports Maven, Gradle, and standalone CLI execution strategies.

## Build & Dev Commands

```bash
pnpm run check-types     # TypeScript type check (tsc --noEmit)
pnpm run lint            # Biome linter (biome check src)
pnpm run compile         # check-types + lint + esbuild bundle → dist/extension.js
node esbuild.js          # bundle only (faster iteration)
pnpm run watch           # watch mode (esbuild + tsc in parallel)
```

Press **F5** in VS Code to launch the Extension Development Host.

## Testing Against a Real Project

Reference project: `/home/esslifie/projects/java/auts`
- Spring Boot + Maven
- Master changelog: `src/main/resources/db/changelog/db.changelog-master.yaml` (uses `includeAll`)
- 13 SQL migration files in `src/main/resources/db/changelog/migrations/`
- Config: `liquibase.properties` at project root
- Database: PostgreSQL at `localhost:5432/auts_db`

Open this folder as a VS Code workspace — the extension auto-activates (detects `liquibase.properties`).

## Source Map

```
src/
├── extension.ts                 ← activate() entry point — wires everything
├── types/index.ts               ← ALL shared interfaces/enums (edit here first)
├── config/
│   ├── projectDetector.ts       ← auto-detects Maven/Gradle/CLI per workspace folder
│   └── configManager.ts         ← VS Code settings wrappers (liquibaseRunner.*)
├── runner/
│   ├── IRunStrategy.ts          ← interface: buildArgs / getExecutable / getCwd
│   ├── MavenStrategy.ts         ← mvn liquibase:<cmd> [-Dliquibase.<key>=<val>]
│   ├── GradleStrategy.ts        ← ./gradlew liquibase<Cmd> [--<key>=<val>]
│   ├── CliStrategy.ts           ← liquibase --changelog-file=... <cmd>
│   └── CommandRunner.ts         ← spawn() wrapper, streaming, AbortController cancel
├── changelog/
│   ├── ChangelogParser.ts       ← regex-based SQL/YAML/XML parser, no external deps
│   └── ChangelogWatcher.ts      ← FileSystemWatcher with 300ms debounce
├── tree/
│   ├── LiquibaseNode.ts         ← TreeItem with contextValue = NodeKind enum
│   └── LiquibaseTreeProvider.ts ← TreeDataProvider, caches changelog parsing
├── webview/
│   └── WebviewPanelManager.ts   ← singleton panel, inlined HTML/CSS/JS, 3 tabs
└── commands/
    ├── shared.ts                ← pickProject(), buildOnEvent(), runCommand()
    ├── registerCommands.ts      ← single place that calls registerCommand for all 9
    ├── updateCommand.ts
    ├── statusCommand.ts
    ├── validateCommand.ts
    ├── rollbackCommand.ts       ← QuickPick (By Tag / By Count) → InputBox
    ├── generateChangelogCommand.ts
    └── diffCommand.ts           ← InputBox for reference URL
```

## Key Conventions

- **Types first**: any new data shape goes into `src/types/index.ts` before writing implementation
- **No external runtime deps**: everything uses Node.js built-ins (`child_process`, `fs`, `path`) + VS Code API
- **Strategy for new build tools**: implement `IRunStrategy`, add to `createRunnerFactory()` switch
- **Context values drive menus**: tree node `contextValue` must match the `when` clause in `package.json` `menus`
- **Settings namespace**: all user settings use `liquibaseRunner.*` (not `liquibase-runner.*`)
- **Command namespace**: all commands use `liquibaseRunner.*` (camelCase)

## Adding a New Liquibase Command

1. Add verb to `LiquibaseCommand` union in `src/types/index.ts`
2. Add to `COMMAND_MAP`/`COMMAND_NAMES` in all three strategy files
3. Create `src/commands/myCommand.ts` (copy `updateCommand.ts` as template)
4. Register in `src/commands/registerCommands.ts`
5. Add to `contributes.commands` + appropriate `menus` in `package.json`

## Webview Message Protocol

Extension → webview: `commandStart`, `stdout`, `stderr`, `commandEnd`, `showStatus`, `showDiff`
Webview → extension: `cancelCommand`

Full types in `src/types/index.ts` (`WebviewMessage`).

## VS Code Settings

| Key | Default | Purpose |
|---|---|---|
| `liquibaseRunner.executionStrategy` | `"auto"` | `auto \| maven \| gradle \| cli` |
| `liquibaseRunner.mavenExecutable` | `"mvn"` | Maven binary/path |
| `liquibaseRunner.gradleExecutable` | `""` | Gradle binary/path |
| `liquibaseRunner.cliBinaryPath` | `"liquibase"` | Standalone CLI path |
| `liquibaseRunner.defaultRollbackTag` | `""` | Pre-fill rollback prompt |
| `liquibaseRunner.diffReferenceUrl` | `""` | Pre-fill diff reference URL |
| `liquibaseRunner.projectOverrides` | `{}` | Per-root-path overrides |

## Docs

- [docs/architecture.md](docs/architecture.md) — layers, data flow, adding new commands
- [docs/commands.md](docs/commands.md) — every command, CLI args, behaviours
- [docs/configuration.md](docs/configuration.md) — all settings, auto-detection logic
- [docs/runner.md](docs/runner.md) — strategy pattern, CLI arg mapping table
- [docs/webview.md](docs/webview.md) — message protocol, tabs, CSS variables, ANSI stripping
