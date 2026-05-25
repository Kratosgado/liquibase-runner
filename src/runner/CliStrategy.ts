import * as path from 'node:path';
import type { LiquibaseCommand, LiquibaseProject } from '../types/index.js';
import { getCliBinaryPath } from '../config/configManager.js';
import type { IRunStrategy } from './IRunStrategy.js';

const COMMAND_NAMES: Record<LiquibaseCommand, string> = {
	update: 'update',
	updateSql: 'update-sql',
	status: 'status',
	validate: 'validate',
	rollback: 'rollback',
	generateChangeLog: 'generate-changelog',
	diff: 'diff',
	diffChangelog: 'diff-changelog',
	tag: 'tag',
	tagExists: 'tag-exists',
	dropAll: 'drop-all',
	snapshot: 'snapshot',
	unexpectedChangeSets: 'unexpected-changesets',
};

// Liquibase CLI uses kebab-case flags; map camelCase extra-arg keys accordingly.
// contexts/labels use legacy names — accepted by all Liquibase versions including 4.x+.
const CLI_KEY_MAP: Record<string, string> = {
	referenceUrl: 'reference-url',
	diffChangeLogFile: 'changelog-file',
};

export class CliStrategy implements IRunStrategy {
	buildArgs(
		command: LiquibaseCommand,
		project: LiquibaseProject,
		extraArgs?: Record<string, string>,
	): string[] {
		const args: string[] = [ COMMAND_NAMES[ command ] ];
		const propsPath = path.isAbsolute( project.propertiesFile )
			? project.propertiesFile
			: path.join( project.rootPath, project.propertiesFile );

		if ( command === 'generateChangeLog' ) {
			// --changelog-file is the OUTPUT destination for generate-changelog
			if ( extraArgs?.outputChangeLogFile ) {
				args.unshift( `--changelog-file=${extraArgs.outputChangeLogFile}` );
			}
		} else if ( command === 'diffChangelog' ) {
			// --changelog-file is the OUTPUT destination for diff-changelog
			if ( extraArgs?.diffChangeLogFile ) {
				args.unshift( `--changelog-file=${extraArgs.diffChangeLogFile}` );
			}
		} else if ( command !== 'tag' && command !== 'tagExists' && command !== 'dropAll' && command !== 'snapshot' ) {
			args.unshift( `--changelog-file=${this.resolveChangelogPath( project, extraArgs )}` );
		}
		args.unshift( `--defaults-file=${propsPath}` );

		if ( extraArgs ) {
			for ( const [ key, value ] of Object.entries( extraArgs ) ) {
				if ( key === 'changelogFile' || key === 'outputChangeLogFile' || key === 'diffChangeLogFile' ) continue;
				const mappedKey = CLI_KEY_MAP[ key ] ?? key;
				args.push( `--${mappedKey}=${value}` );
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
