import * as path from 'node:path';
import type { LiquibaseCommand, LiquibaseProject } from '../types/index.js';
import { getCliBinaryPath } from '../config/configManager.js';
import type { IRunStrategy } from './IRunStrategy.js';

const COMMAND_NAMES: Record<LiquibaseCommand, string> = {
	update: 'update',
	status: 'status',
	validate: 'validate',
	rollback: 'rollback',
	generateChangelog: 'generate-changelog',
	diff: 'diff',
};

export class CliStrategy implements IRunStrategy {
	buildArgs(
		command: LiquibaseCommand,
		project: LiquibaseProject,
		extraArgs?: Record<string, string>,
	): string[] {
		const args: string[] = [];

		const changelogPath = path.isAbsolute(project.changelogFile)
			? project.changelogFile
			: path.join(project.rootPath, project.changelogFile);
		args.push(`--changelog-file=${changelogPath}`);

		const propsPath = path.isAbsolute(project.propertiesFile)
			? project.propertiesFile
			: path.join(project.rootPath, project.propertiesFile);
		args.push(`--defaults-file=${propsPath}`);

		args.push(COMMAND_NAMES[command]);

		if (extraArgs) {
			for (const [key, value] of Object.entries(extraArgs)) {
				args.push(`--${key}=${value}`);
			}
		}
		return args;
	}

	getExecutable(_project: LiquibaseProject): string {
		return getCliBinaryPath() || 'liquibase';
	}

	getCwd(project: LiquibaseProject): string {
		return project.rootPath;
	}
}
