import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { ConnectionManager } from '../config/ConnectionManager.js';
import { pickProject } from './shared.js';

export function createCommandBuilderCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
	context: vscode.ExtensionContext,
	connManager: ConnectionManager,
) {
	return async () => {
		const project = await pickProject( projects );
		if ( !project ) return;

		const pick = await vscode.window.showQuickPick(
			[
				{ label: '$(database-view) Update', description: 'Apply pending changesets' },
				{ label: '$(list-unordered) Status', description: 'Show pending changesets' },
				{ label: '$(check) Validate', description: 'Validate changelog files' },
				{ label: '$(diff) Diff', description: 'Compare two schemas' },
				{ label: '$(discard) Rollback', description: 'Rollback by tag or count' },
				{ label: '$(add) Generate Changelog', description: 'Generate a changelog (DB or Entities)' },
			],
			{ placeHolder: 'Choose a Liquibase command' },
		);
		if ( !pick ) return;

		const label = pick.label.replace( /\$\([^)]+\)\s*/, '' );

		switch ( label ) {
			case 'Update':
				await vscode.commands.executeCommand( 'liquibaseRunner.update' );
				break;
			case 'Status':
				await vscode.commands.executeCommand( 'liquibaseRunner.status' );
				break;
			case 'Validate':
				await vscode.commands.executeCommand( 'liquibaseRunner.validate' );
				break;
			case 'Diff':
				await vscode.commands.executeCommand( 'liquibaseRunner.diff' );
				break;
			case 'Rollback':
				await vscode.commands.executeCommand( 'liquibaseRunner.rollback' );
				break;
			case 'Generate Changelog':
				await vscode.commands.executeCommand( 'liquibaseRunner.generateChangelog' );
				break;
		}
	};
}
