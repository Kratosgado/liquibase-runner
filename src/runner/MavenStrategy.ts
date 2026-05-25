import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LiquibaseCommand, LiquibaseProject } from '../types/index.js';
import { getMavenExecutable } from '../config/configManager.js';
import type { IRunStrategy } from './IRunStrategy.js';

const COMMAND_MAP: Record<LiquibaseCommand, string> = {
	update: 'liquibase:update',
	updateSql: 'liquibase:updateSQL',
	status: 'liquibase:status',
	validate: 'liquibase:validate',
	rollback: 'liquibase:rollback',
	generateChangeLog: 'liquibase:generateChangeLog',
	diff: 'liquibase:diff',
	diffChangelog: 'liquibase:diff',
};

// Liquibase 4.24+ renamed these parameters; use the new names for both old+new plugin versions.
const MAVEN_KEY_MAP: Record<string, string> = {
	labels: 'labelFilter',
	contexts: 'contextFilter',
};

export class MavenStrategy implements IRunStrategy {
	buildArgs(
		command: LiquibaseCommand,
		_project: LiquibaseProject,
		extraArgs?: Record<string, string>,
	): string[] {
		const goal = COMMAND_MAP[ command ];
		const args = [ goal ];
		if ( extraArgs?.changelogFile ) {
			args.push( `-Dliquibase.changelogFile=${extraArgs.changelogFile}` );
		}
		if ( extraArgs ) {
			for ( const [ key, value ] of Object.entries( extraArgs ) ) {
				if ( key === 'changelogFile' ) continue;
				const mappedKey = MAVEN_KEY_MAP[ key ] ?? key;
				args.push( `-Dliquibase.${mappedKey}=${value}` );
			}
		}
		return args;
	}

	getExecutable( project: LiquibaseProject ): string {
		const configured = getMavenExecutable();
		if ( configured && configured !== 'mvn' ) return configured;
		// Prefer wrapper in the project root
		const wrapper = path.join( project.rootPath, 'mvnw' );
		if ( fs.existsSync( wrapper ) ) return './mvnw';
		return 'mvn';
	}

	getCwd( project: LiquibaseProject ): string {
		return project.rootPath;
	}
}
