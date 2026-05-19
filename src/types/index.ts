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

export type LiquibaseCommand =
	| 'update'
	| 'status'
	| 'validate'
	| 'rollback'
	| 'generateChangelog'
	| 'diff';

export interface RunnerEvent {
	type: 'stdout' | 'stderr' | 'exit' | 'error';
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

export type WebviewMessage =
	| { type: 'commandStart'; command: string; project: string }
	| { type: 'stdout'; data: string }
	| { type: 'stderr'; data: string }
	| { type: 'commandEnd'; exitCode: number; durationMs: number }
	| { type: 'showStatus'; pending: Changeset[] }
	| { type: 'showDiff'; content: string }
	| { type: 'cancelCommand' };

export interface LiquibaseNode extends vscode.TreeItem {
	kind: NodeKind;
	project?: LiquibaseProject;
	changelogFile?: ChangelogFile;
	changeset?: Changeset;
}
