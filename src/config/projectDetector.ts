import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import * as vscode from 'vscode';
import type { ExecutionStrategy, LiquibaseProject } from '../types/index.js';
import { getExecutionStrategy } from './configManager.js';

export async function detectProjects(
	workspaceFolders: readonly vscode.WorkspaceFolder[],
): Promise<LiquibaseProject[]> {
	const projects: LiquibaseProject[] = [];
	for (const folder of workspaceFolders) {
		const project = await detectProject(folder.uri.fsPath);
		if (project) {
			projects.push(project);
		}
	}
	return projects;
}

async function detectProject(rootPath: string): Promise<LiquibaseProject | undefined> {
	const resolved = await detectStrategy(rootPath);
	if (!resolved) return undefined;

	const propertiesFile = findPropertiesFile(rootPath);
	const changelogFile = findChangelogFile(rootPath, propertiesFile);

	const name = path.basename(rootPath);
	const configuredStrategy = getExecutionStrategy();

	return {
		id: rootPath,
		name,
		rootPath,
		strategy: configuredStrategy,
		resolvedStrategy: resolved,
		changelogFile,
		propertiesFile,
	};
}

export async function detectStrategy(rootPath: string): Promise<'maven' | 'gradle' | 'cli' | undefined> {
	const configuredStrategy = getExecutionStrategy();
	if (configuredStrategy !== 'auto') {
		return configuredStrategy as 'maven' | 'gradle' | 'cli';
	}

	// Prefer Maven wrapper
	if (fs.existsSync(path.join(rootPath, 'mvnw'))) {
		return 'maven';
	}
	// pom.xml with liquibase
	if (hasMavenLiquibase(rootPath)) {
		return 'maven';
	}
	// Gradle wrapper
	const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
	if (fs.existsSync(path.join(rootPath, gradlew)) && hasGradleLiquibase(rootPath)) {
		return 'gradle';
	}
	// Standalone CLI on PATH
	if (isLiquibaseOnPath()) {
		return 'cli';
	}
	// Any liquibase.properties present — assume maven as fallback for Java projects
	if (fs.existsSync(path.join(rootPath, 'liquibase.properties'))) {
		return 'maven';
	}
	return undefined;
}

function hasMavenLiquibase(rootPath: string): boolean {
	const pomPath = path.join(rootPath, 'pom.xml');
	if (!fs.existsSync(pomPath)) return false;
	const content = fs.readFileSync(pomPath, 'utf-8');
	return content.includes('liquibase');
}

function hasGradleLiquibase(rootPath: string): boolean {
	for (const name of ['build.gradle', 'build.gradle.kts']) {
		const p = path.join(rootPath, name);
		if (fs.existsSync(p) && fs.readFileSync(p, 'utf-8').includes('liquibase')) {
			return true;
		}
	}
	return false;
}

function isLiquibaseOnPath(): boolean {
	try {
		execSync('liquibase --version', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function findPropertiesFile(rootPath: string): string {
	// Check common locations
	for (const rel of [
		'liquibase.properties',
		'liquibase/local.liquibase.properties',
		'src/main/resources/liquibase.properties',
	]) {
		if (fs.existsSync(path.join(rootPath, rel))) {
			return rel;
		}
	}
	return 'liquibase.properties';
}

export function findChangelogFile(rootPath: string, propertiesFile: string): string {
	// Try to read from properties file
	const propsPath = path.join(rootPath, propertiesFile);
	if (fs.existsSync(propsPath)) {
		const content = fs.readFileSync(propsPath, 'utf-8');
		const match = content.match(/^changelogFile\s*[=:]\s*(.+)$/m);
		if (match) {
			return match[1].trim();
		}
	}

	// Fall back to common paths
	for (const rel of [
		'src/main/resources/db/changelog/db.changelog-master.yaml',
		'src/main/resources/db/changelog/db.changelog-master.xml',
		'src/main/resources/db/changelog/changelog-master.yaml',
		'src/main/resources/db/changelog/changelog-master.xml',
		'db/changelog/db.changelog-master.yaml',
		'db.changelog-master.yaml',
	]) {
		if (fs.existsSync(path.join(rootPath, rel))) {
			return rel;
		}
	}

	return 'src/main/resources/db/changelog/db.changelog-master.yaml';
}

export function resolveStrategyFromConfig(
	configuredStrategy: ExecutionStrategy,
	detectedStrategy: 'maven' | 'gradle' | 'cli',
): 'maven' | 'gradle' | 'cli' {
	if (configuredStrategy === 'auto') return detectedStrategy;
	return configuredStrategy as 'maven' | 'gradle' | 'cli';
}
