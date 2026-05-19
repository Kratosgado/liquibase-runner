import * as vscode from 'vscode';
import type { ExecutionStrategy, LiquibaseProject } from '../types/index.js';

const SECTION = 'liquibaseRunner';

export function getExecutionStrategy(): ExecutionStrategy {
	return vscode.workspace.getConfiguration(SECTION).get<ExecutionStrategy>('executionStrategy', 'auto');
}

export function getMavenExecutable(): string {
	return vscode.workspace.getConfiguration(SECTION).get<string>('mavenExecutable', 'mvn');
}

export function getGradleExecutable(): string {
	return vscode.workspace.getConfiguration(SECTION).get<string>('gradleExecutable', '');
}

export function getCliBinaryPath(): string {
	return vscode.workspace.getConfiguration(SECTION).get<string>('cliBinaryPath', 'liquibase');
}

export function getDefaultRollbackTag(): string {
	return vscode.workspace.getConfiguration(SECTION).get<string>('defaultRollbackTag', '');
}

export function getDiffReferenceUrl(): string {
	return vscode.workspace.getConfiguration(SECTION).get<string>('diffReferenceUrl', '');
}

export function getProjectOverrides(projectRoot: string): Partial<LiquibaseProject> {
	const overrides = vscode.workspace.getConfiguration(SECTION).get<Record<string, Partial<LiquibaseProject>>>('projectOverrides', {});
	return overrides[projectRoot] ?? {};
}

export function onConfigurationChange(handler: () => void, disposables: vscode.Disposable[]): void {
	const d = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(SECTION)) {
			handler();
		}
	});
	disposables.push(d);
}
