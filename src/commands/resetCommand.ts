import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { pickProject, runCommand } from './shared.js';

export function createResetCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async ( node?: LiquibaseTreeNode ) => {
		const project = node?.project ?? ( await pickProject( projects ) );
		if ( !project ) return;

		const confirmed = await vscode.window.showWarningMessage(
			`Reset "${project.name}"? This will DROP ALL objects then run UPDATE. All data will be lost.`,
			{ modal: true },
			'Reset',
		);
		if ( confirmed !== 'Reset' ) return;

		const dropResult = await runCommand( {
			project,
			commandTitle: 'Reset — Drop All',
			command: 'dropAll',
			runner: runnerFactory( project ),
			output,
			treeProvider,
			refreshAfter: false,
		} );

		if ( dropResult?.exitCode !== 0 ) return;

		await runCommand( {
			project,
			commandTitle: 'Reset — Update',
			command: 'update',
			runner: runnerFactory( project ),
			output,
			treeProvider,
		} );
	};
}
