import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import { collectConfigureProjectArgs } from '../wizard/commandWizards.js';
import { pickProject } from './shared.js';

export function createConfigureProjectCommand( projects: LiquibaseProject[] ) {
	return async () => {
		const project = await pickProject( projects );
		if ( !project ) return;

		const args = await collectConfigureProjectArgs( project );
		if ( !args ) return;

		const cfg = vscode.workspace.getConfiguration( 'liquibaseRunner' );
		const all = cfg.get<Record<string, Partial<LiquibaseProject>>>( 'projectOverrides' ) ?? {};
		all[ project.rootPath ] = {
			changelogFile: args.changelogFile,
			propertiesFile: args.propertiesFile,
			resolvedStrategy: args.resolvedStrategy as LiquibaseProject['resolvedStrategy'],
		};
		await cfg.update( 'projectOverrides', all, vscode.ConfigurationTarget.Workspace );
		vscode.window.showInformationMessage( `Saved Liquibase overrides for ${project.name}` );
	};
}
