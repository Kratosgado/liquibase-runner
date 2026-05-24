import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import type { ConnectionManager } from '../config/ConnectionManager.js';
import { CommandFormPanel } from '../webview/CommandFormPanel.js';
import { getProjectCommandConfig } from '../config/configManager.js';
import { pickProject, runCommand } from './shared.js';

export function createUpdateCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
	context: vscode.ExtensionContext,
	connManager: ConnectionManager,
) {
	return async ( node?: LiquibaseTreeNode ) => {
		const project = node?.project ?? ( await pickProject( projects ) );
		if ( !project ) return;

		const saved = getProjectCommandConfig( project.rootPath );

		const form = await CommandFormPanel.show( {
			context,
			project,
			connManager,
			formType: 'update',
			savedValues: {
				contexts: saved.contexts,
				labels: saved.labels,
				logLevel: saved.logLevel,
			},
		} );
		if ( !form ) return;

		const extraArgs: Record<string, string> = {};

		if ( form.changelogFile ) extraArgs.changelogFile = form.changelogFile;
		if ( form.contexts ) extraArgs.contexts = form.contexts;
		if ( form.labels ) extraArgs.labels = form.labels;
		if ( form.logLevel ) extraArgs.logLevel = form.logLevel;
		if ( form.connectionName ) {
			Object.assign( extraArgs, await connManager.getConnectionArgs( form.connectionName ) );
		}

		const command = form.action === 'updateSql' ? 'updateSql' : 'update';
		const commandTitle = form.action === 'updateSql' ? 'Update SQL' : 'Update';

		await runCommand( {
			project,
			commandTitle,
			command,
			runner: runnerFactory( project ),
			output,
			treeProvider,
			extraArgs,
		} );
	};
}
