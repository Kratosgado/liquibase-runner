# Configuration

All settings live under the `liquibaseRunner` namespace in VS Code settings (`Ctrl+,`).

## Settings Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `liquibaseRunner.executionStrategy` | `"auto" \| "maven" \| "gradle" \| "cli"` | `"auto"` | How Liquibase is invoked. `"auto"` detects from project files. |
| `liquibaseRunner.mavenExecutable` | `string` | `"mvn"` | Path or name of the Maven executable. Set to `"./mvnw"` to always use the wrapper. |
| `liquibaseRunner.gradleExecutable` | `string` | `""` | Path to Gradle. Empty means auto-detect `./gradlew` or `gradlew.bat`. |
| `liquibaseRunner.cliBinaryPath` | `string` | `"liquibase"` | Path to the standalone Liquibase CLI binary. |
| `liquibaseRunner.defaultRollbackTag` | `string` | `""` | Pre-fills the rollback tag InputBox. |
| `liquibaseRunner.diffReferenceUrl` | `string` | `""` | Pre-fills the reference URL InputBox for `diff`. |
| `liquibaseRunner.projectOverrides` | `object` | `{}` | Per-project overrides (see below). |

---

## Auto-Detection Logic

When `executionStrategy` is `"auto"`, the extension checks each workspace folder in this order:

1. `mvnw` file present → **Maven** (uses `./mvnw`)
2. `pom.xml` contains `"liquibase"` → **Maven** (uses `mvn`)
3. `gradlew`/`gradlew.bat` present AND `build.gradle` contains `"liquibase"` → **Gradle**
4. `liquibase` binary found on system `PATH` → **CLI**
5. `liquibase.properties` file present → **Maven** (fallback for Spring Boot projects)

If none match, the folder is skipped (not shown in the tree).

---

## Locating the Changelog File

The extension reads the `changelogFile` property from `liquibase.properties`:

```properties
changelogFile=src/main/resources/db/changelog/db.changelog-master.yaml
```

If the properties file is absent or the property is not set, it scans for common paths:

```
src/main/resources/db/changelog/db.changelog-master.yaml
src/main/resources/db/changelog/db.changelog-master.xml
src/main/resources/db/changelog/changelog-master.yaml
src/main/resources/db/changelog/changelog-master.xml
db/changelog/db.changelog-master.yaml
db.changelog-master.yaml
```

---

## Per-Project Overrides

Use `liquibaseRunner.projectOverrides` in your workspace `settings.json` to override detected values for a specific project:

```json
{
  "liquibaseRunner.projectOverrides": {
    "/absolute/path/to/project": {
      "changelogFile": "custom/path/to/changelog.yaml",
      "propertiesFile": "config/liquibase.properties"
    }
  }
}
```

Keys are absolute paths to the project root folder.

---

## Workspace settings.json Example

```json
{
  "liquibaseRunner.executionStrategy": "auto",
  "liquibaseRunner.mavenExecutable": "mvn",
  "liquibaseRunner.defaultRollbackTag": "v1.0.0",
  "liquibaseRunner.diffReferenceUrl": "jdbc:postgresql://localhost:5432/reference_db"
}
```

---

## Environment Variables

Commands are spawned with `env: { ...process.env }` — the full shell environment is inherited. This means:

- `JAVA_HOME`, `M2_HOME`, `PATH` all flow through automatically.
- Database credentials in `liquibase.properties` are read by the Liquibase process itself; the extension never touches them.
