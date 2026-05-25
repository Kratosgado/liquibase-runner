import type * as vscode from 'vscode';

export type ExecutionStrategy = 'auto' | 'maven' | 'gradle' | 'cli';

export interface LiquibaseProject {
	id: string;
	name: string;
	rootPath: string;
	strategy: ExecutionStrategy;
	resolvedStrategy: 'maven' | 'gradle' | 'cli';
	changelogFile: string;
	propertiesFile: string;
}

export interface Changeset {
	id: string;
	author: string;
	filePath: string;
	lineNumber: number;
}

export interface ChangelogFile {
	absolutePath: string;
	relativePath: string;
	changesets: Changeset[];
}

export interface DatabaseConnection {
	name: string;
	url: string;
	username: string;
}

export type LiquibaseCommand =
	| 'update'
	| 'updateSql'
	| 'status'
	| 'validate'
	| 'rollback'
	| 'generateChangeLog'
	| 'diff'
	| 'diffChangelog';

export interface RunnerEvent {
	type: 'stdout' | 'stderr' | 'exit' | 'error' | 'command';
	data: string;
}

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

export enum NodeKind {
	Project = 'project',
	MigrationsFolder = 'migrationsFolder',
	ChangelogFile = 'changelogFile',
	Changeset = 'changeset',
}

export interface ProjectCommandConfig {
	referenceUrl?: string;
	rollbackTag?: string;
	generateChangelogDir?: string;
	contexts?: string;
	labels?: string;
	logLevel?: string;
}

export interface LiquibaseNode extends vscode.TreeItem {
	kind: NodeKind;
	project?: LiquibaseProject;
	changelogFile?: ChangelogFile;
	changeset?: Changeset;
}
