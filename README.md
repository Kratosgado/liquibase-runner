# Liquibase Runner

A VS Code extension that provides a UI for managing [Liquibase](https://www.liquibase.com/) database migrations in Java projects — no terminal required.

## Features

- **Sidebar tree view** — detects Liquibase projects in your workspace and displays changelogs and changesets
- **Run commands via right-click** — Update, Status, Validate, Rollback, Generate Changelog, Diff
- **Live dashboard panel** — streams command output in real time with Output / Status / Diff tabs and clearer command state
- **Cancel in-flight commands** — abort long-running operations from the panel
- **Auto-detects build tool** — Maven, Gradle, or standalone Liquibase CLI, with no manual configuration required
- **File watching** — tree refreshes automatically when changelog files change on disk

## Requirements

Your project must use one of the following:

- **Maven** — `pom.xml` referencing `liquibase` (e.g. `spring-boot-starter-liquibase`)
- **Gradle** — `build.gradle` referencing `liquibase`
- **Standalone CLI** — `liquibase` binary available on your `PATH`

Java and the build tool must be installed and accessible from your terminal.

## Getting Started

1. Open a workspace containing a Java project with Liquibase
2. The extension auto-activates when it detects `liquibase.properties` or a master changelog file
3. Click the **Liquibase** icon in the activity bar to open the project tree
4. Right-click a project node to run commands

## Extension Settings

| Setting | Default | Description |
| --- | --- | --- |
| `liquibaseRunner.executionStrategy` | `"auto"` | `auto`, `maven`, `gradle`, or `cli` |
| `liquibaseRunner.mavenExecutable` | `"mvn"` | Path to the Maven executable |
| `liquibaseRunner.gradleExecutable` | `""` | Path to Gradle (auto-detects `./gradlew` if empty) |
| `liquibaseRunner.cliBinaryPath` | `"liquibase"` | Path to the standalone Liquibase CLI |
| `liquibaseRunner.defaultRollbackTag` | `""` | Pre-fills the rollback tag prompt |
| `liquibaseRunner.diffReferenceUrl` | `""` | Pre-fills the reference URL prompt for `diff` |
| `liquibaseRunner.projectOverrides` | `{}` | Per-project path overrides for changelog and properties files |

## Commands

All commands are available from the command palette (`Ctrl+Shift+P`) and the tree view context menu.

| Command | Description |
| --- | --- |
| `Liquibase: Update` | Apply all pending changesets |
| `Liquibase: Status` | Show pending changesets |
| `Liquibase: Validate` | Validate the changelog for errors |
| `Liquibase: Rollback` | Rollback by tag or count |
| `Liquibase: Generate Changelog` | Generate a changelog from a database snapshot or Spring/Hibernate entities |
| `Liquibase: Diff` | Compare two database schemas |
| `Liquibase: Refresh` | Re-scan projects and changelogs |
| `Liquibase: Open Output Panel` | Open the output panel |

## Known Issues

- The `status` command output parser expects Liquibase's default format (`file::id::author` lines). Custom log formats may not populate the Status tab.
- `generateChangelog` now prompts for an output file so it can write to a new changelog instead of the master file.
- The entity-based generation flow uses Liquibase `diffChangelog` with a Hibernate/Spring reference URL. It compares the entity model exposed through Hibernate to the database; it does not inspect JPA annotations directly.

## Release Notes

### 0.0.1

Initial release — sidebar tree view, webview output panel, Maven/Gradle/CLI support, full command set.
