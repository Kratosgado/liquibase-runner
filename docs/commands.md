# Commands Reference

All commands are registered under the `liquibaseRunner.*` namespace.

## User-Facing Commands

| Command ID | Title | Entry Points |
|---|---|---|
| `liquibaseRunner.update` | Liquibase: Update | Tree context menu (project, changelogFile), command palette |
| `liquibaseRunner.status` | Liquibase: Status | Tree context menu (project), command palette |
| `liquibaseRunner.validate` | Liquibase: Validate | Tree context menu (project), command palette |
| `liquibaseRunner.rollback` | Liquibase: Rollback | Tree context menu (project), command palette |
| `liquibaseRunner.generateChangelog` | Liquibase: Generate Changelog | Tree context menu (project), command palette |
| `liquibaseRunner.diff` | Liquibase: Diff | Tree context menu (project), command palette |
| `liquibaseRunner.refresh` | Liquibase: Refresh | Tree view title bar, command palette |
| `liquibaseRunner.openPanel` | Liquibase: Open Output Panel | Tree view title bar, command palette |
| `liquibaseRunner.openChangeset` | Open File | Tree context menu (changeset node), inline |

---

## Command Behaviour

### `update`
Applies all pending changesets.

- Maven: `mvn liquibase:update`
- Gradle: `./gradlew liquibaseUpdate`
- CLI: `liquibase --changelog-file=... update`

On success: refreshes the tree view.

---

### `status`
Shows which changesets have not been applied to the target database.

- Maven: `mvn liquibase:status`
- Gradle: `./gradlew liquibaseStatus`
- CLI: `liquibase ... status`

On success: parses stdout for `file::id::author` lines and populates the **Status** tab in the webview panel.

Output format Liquibase prints (one line per pending changeset):
```
     path/to/file.sql::changeset-id::author
```

---

### `validate`
Validates the changelog for syntax and referential errors without touching the database.

- Maven: `mvn liquibase:validate`
- Gradle: `./gradlew liquibaseValidate`
- CLI: `liquibase ... validate`

Does not refresh the tree (no database state changed).

---

### `rollback`
Interactive rollback. Prompts the user first:
1. QuickPick: **By Tag** or **By Count**
2. InputBox: tag string (e.g. `v1.0.0`) or integer count

- Maven (by tag): `mvn liquibase:rollback -Dliquibase.rollbackTag=v1.0.0`
- Maven (by count): `mvn liquibase:rollback -Dliquibase.rollbackCount=3`
- Gradle (by tag): `./gradlew liquibaseRollback --rollbackTag=v1.0.0`
- CLI (by tag): `liquibase ... rollback --tag=v1.0.0`

On success: refreshes the tree. Pre-fills tag from `liquibaseRunner.defaultRollbackTag` setting.

---

### `generateChangelog`
Generates a changelog from the current state of the database schema.

- Maven: `mvn liquibase:generateChangelog`
- Gradle: `./gradlew liquibaseGenerateChangelog`
- CLI: `liquibase ... generate-changelog`

On success: refreshes the tree (new files may have been created).

---

### `diff`
Compares the target database against a reference database.

Prompts for a reference JDBC URL (pre-filled from `liquibaseRunner.diffReferenceUrl`).

- Maven: `mvn liquibase:diff -Dliquibase.referenceUrl=jdbc:...`
- Gradle: `./gradlew liquibaseDiff --referenceUrl=jdbc:...`
- CLI: `liquibase ... diff --referenceUrl=jdbc:...`

On success: posts diff output to the **Diff** tab in the webview panel.

---

### `openChangeset`
Opens the SQL/XML file containing the changeset at the exact line number.

Invoked by clicking a `changeset` tree node. Uses `vscode.window.showTextDocument` with a `Range` pointing to the changeset's line.

---

## Adding a New Command

1. Add the new verb to `LiquibaseCommand` in [src/types/index.ts](../src/types/index.ts)
2. Map it in all three strategy files:
   - `COMMAND_MAP` in [src/runner/MavenStrategy.ts](../src/runner/MavenStrategy.ts)
   - `COMMAND_MAP` in [src/runner/GradleStrategy.ts](../src/runner/GradleStrategy.ts)
   - `COMMAND_NAMES` in [src/runner/CliStrategy.ts](../src/runner/CliStrategy.ts)
3. Create `src/commands/myCommand.ts`:
   ```ts
   export function createMyCommand(projects, webview, outputChannel, runnerFactory, treeProvider) {
     return async (node?: LiquibaseTreeNode) => {
       const project = node?.project ?? await pickProject(projects);
       if (!project) return;
       await runCommand({ project, commandTitle: 'myCommand', runner: runnerFactory(project),
                          webview, outputChannel, treeProvider });
     };
   }
   ```
4. Register in [src/commands/registerCommands.ts](../src/commands/registerCommands.ts)
5. Add to `contributes.commands` and the appropriate `menus` entry in [package.json](../package.json)
