import type { LiquibaseCommand, LiquibaseProject } from '../types/index.js';

export interface IRunStrategy {
	buildArgs(
		command: LiquibaseCommand,
		project: LiquibaseProject,
		extraArgs?: Record<string, string>,
	): string[];
	getExecutable(project: LiquibaseProject): string;
	getCwd(project: LiquibaseProject): string;
}
