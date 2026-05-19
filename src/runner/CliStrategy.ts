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
	diffChangelog: 'diff-changelog',
	diff: 'diff',
};

export class CliStrategy implements IRunStrategy {
	buildArgs(
		command: LiquibaseCommand,
		project: LiquibaseProject,
		extraArgs?: Record<string, string>,
	): string[] {
		const args: string[] = [ COMMAND_NAMES[ command ] ];
		const changelogPath = this.resolveChangelogPath( project, extraArgs );
		const propsPath = path.isAbsolute( project.propertiesFile )
			? project.propertiesFile
			: path.join( project.rootPath, project.propertiesFile );
		args.unshift( `--defaults-file=${propsPath}` );
		args.unshift( `--changelog-file=${changelogPath}` );

		if ( extraArgs ) {
			for ( const [ key, value ] of Object.entries( extraArgs ) ) {
				if ( key === 'changelogFile' ) continue;
				args.push( `--${key}=${value}` );
			}
		}
		return args;
	}

	private resolveChangelogPath( project: LiquibaseProject, extraArgs?: Record<string, string> ): string {
		if ( extraArgs?.changelogFile ) return extraArgs.changelogFile;
		if ( path.isAbsolute( project.changelogFile ) ) return project.changelogFile;
		return path.join( project.rootPath, project.changelogFile );
	}

	getExecutable( _project: LiquibaseProject ): string {
		return getCliBinaryPath() || 'liquibase';
	}

	getCwd( project: LiquibaseProject ): string {
		return project.rootPath;
	}
}
