import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LiquibaseCommand, LiquibaseProject } from '../types/index.js';
import { getGradleExecutable } from '../config/configManager.js';
import type { IRunStrategy } from './IRunStrategy.js';

const COMMAND_MAP: Record<LiquibaseCommand, string> = {
	update: 'liquibaseUpdate',
	status: 'liquibaseStatus',
	validate: 'liquibaseValidate',
	rollback: 'liquibaseRollback',
	generateChangelog: 'liquibaseGenerateChangelog',
	diffChangelog: 'liquibaseDiffChangelog',
	diff: 'liquibaseDiff',
};

export class GradleStrategy implements IRunStrategy {
	buildArgs(
		command: LiquibaseCommand,
		_project: LiquibaseProject,
		extraArgs?: Record<string, string>,
	): string[] {
		const task = COMMAND_MAP[ command ];
		const args = [ task ];
		if ( extraArgs?.changelogFile ) {
			args.push( `-PliquibaseChangelogFile=${extraArgs.changelogFile}` );
		}
		if ( extraArgs ) {
			for ( const [ key, value ] of Object.entries( extraArgs ) ) {
				if ( key === 'changelogFile' ) continue;
				args.push( `--${key}=${value}` );
			}
		}
		return args;
	}

	getExecutable( project: LiquibaseProject ): string {
		const configured = getGradleExecutable();
		if ( configured ) return configured;
		const wrapperName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
		if ( fs.existsSync( path.join( project.rootPath, wrapperName ) ) ) {
			return process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
		}
		return 'gradle';
	}

	getCwd( project: LiquibaseProject ): string {
		return project.rootPath;
	}
}
