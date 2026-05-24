import * as vscode from 'vscode';
import type { LiquibaseProject, Changeset } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import type { ConnectionManager } from '../config/ConnectionManager.js';
import { createUpdateCommand } from './updateCommand.js';
import { createStatusCommand } from './statusCommand.js';
import { createRollbackCommand } from './rollbackCommand.js';
import { createDiffCommand } from './diffCommand.js';
import { createConfigureProjectCommand } from './configureProject.js';
import { createCommandBuilderCommand } from './commandBuilder.js';
import { createValidateCommand } from './validateCommand.js';
import { createGenerateChangelogCommand } from './generateChangelogCommand.js';

export function registerCommands(
	context: vscode.ExtensionContext,
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
	connManager: ConnectionManager,
): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const reg = ( id: string, handler: ( ...args: any[] ) => unknown ) =>
		context.subscriptions.push( vscode.commands.registerCommand( id, handler ) );

	reg( 'liquibaseRunner.update',
		createUpdateCommand( projects, output, runnerFactory, treeProvider, context, connManager ) );
	reg( 'liquibaseRunner.status',
		createStatusCommand( projects, output, runnerFactory, treeProvider ) );
	reg( 'liquibaseRunner.validate',
		createValidateCommand( projects, output, runnerFactory, treeProvider ) );
	reg( 'liquibaseRunner.rollback',
		createRollbackCommand( projects, output, runnerFactory, treeProvider ) );
	reg( 'liquibaseRunner.generateChangelog',
		createGenerateChangelogCommand( projects, output, runnerFactory, treeProvider, context, connManager ) );
	reg( 'liquibaseRunner.diff',
		createDiffCommand( projects, output, runnerFactory, treeProvider, context, connManager ) );

	reg( 'liquibaseRunner.configureProject',
		createConfigureProjectCommand( projects ) );

	reg( 'liquibaseRunner.commandBuilder',
		createCommandBuilderCommand( projects, output, runnerFactory, treeProvider, context, connManager ) );

	reg( 'liquibaseRunner.refresh', ( _node?: LiquibaseTreeNode ) => {
		treeProvider.refresh();
	} );

	reg( 'liquibaseRunner.openPanel', () => {
		output.show();
	} );

	reg( 'liquibaseRunner.openChangeset', ( changeset?: Changeset ) => {
		if ( !changeset?.filePath ) return;
		const uri = vscode.Uri.file( changeset.filePath );
		const pos = new vscode.Position( Math.max( 0, changeset.lineNumber - 1 ), 0 );
		vscode.window.showTextDocument( uri, {
			selection: new vscode.Range( pos, pos ),
			preview: false,
		} );
	} );
}
