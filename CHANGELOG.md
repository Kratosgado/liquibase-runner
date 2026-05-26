# Change Log

All notable changes to the "liquibase-runner" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.1-beta] — 2026-05-26

**Manage Liquibase database migrations directly inside VS Code — no terminal required.**

Liquibase Runner gives Java developers a first-class UI for running, inspecting, and managing Liquibase migrations. It auto-detects your build tool, streams live output, and surfaces changelogs in a sidebar tree — all without leaving the editor.

---

### What's included

**Project detection & sidebar tree**
Opens automatically when a workspace contains `liquibase.properties`. Displays all detected projects, changelog files, and individual changesets. Click any changeset to jump straight to its line in the file.

**Zero-config build tool support**
Auto-detects Maven (`mvnw` / `mvn`), Gradle (`gradlew` / `gradle`), or standalone Liquibase CLI. Override per-project via settings if needed.

#### Full command set

| Command | Description |
| --- | --- |
| Update | Apply all pending changesets, with optional contexts, labels, and log level |
| Status | Show pending changesets not yet applied |
| Validate | Check the changelog for errors before running |
| Rollback | Roll back by tag or by count (multi-step wizard) |
| Diff | Compare two database schemas; optionally save the diff as a new changelog |
| Generate Changelog | Reverse-engineer a changelog from a live database or Spring/Hibernate entities |
| Tag | Mark the current database state with a named tag |
| Tag Exists | Check whether a specific tag is present in the database |
| Drop All | Drop all objects in the target database (with confirmation) |
| Snapshot | Capture the current database structure to the output panel |
| Unexpected Changesets | Show changesets in the database not present in the changelog |
| Reset | Drop all objects, then immediately run Update — full schema rebuild in one click (with confirmation) |

**Live output panel**
Streams stdout/stderr in real time with command timing. Cancel any in-flight operation from the status bar. Output is preserved across commands in a scrollable panel.

**Saved values**
Contexts, labels, rollback tags, reference URLs, and output paths are remembered per project so you don't re-enter them on every run.

**Database connection manager**
Save named JDBC connections (URL, username, password) and select them from dropdowns — avoids editing `liquibase.properties` for environment switching.

---

### Requirements

- VS Code 1.120+
- Java installed and on `PATH`
- One of: Maven (with `liquibase-maven-plugin`), Gradle (with `org.liquibase.gradle`), or the standalone Liquibase CLI ≥ 4.x

---

### Known limitations in this beta

- Changelog parser uses regex-based detection — exotic multi-file include chains may not fully resolve in the tree view
- The Status tab populates only when Liquibase outputs its default `file::id::author` format; custom log appenders may show raw text instead
- Entity-based changelog generation requires `liquibase-hibernate6` on the Maven/Gradle classpath
- Windows path handling with spaces is untested

---

### Feedback

Please report bugs and feature requests at [github.com/Kratosgado/liquibase-runner/issues](https://github.com/Kratosgado/liquibase-runner/issues). Include your build tool, Liquibase version, and the content of the Output panel.
