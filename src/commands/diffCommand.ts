import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { getDiffReferenceUrl } from '../config/configManager.js';
import { pickProject, runCommand } from './shared.js';

export function createDiffCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async ( node?: LiquibaseTreeNode ) => {
		const project = node?.project ?? ( await pickProject( projects ) );
		if ( !project ) return;

		const referenceUrl = await vscode.window.showInputBox( {
			prompt: 'Reference database URL for diff',
			value: getDiffReferenceUrl(),
			placeHolder: 'jdbc:postgresql://localhost:5432/reference_db',
			validateInput: v => ( v.trim() ? null : 'Reference URL cannot be empty' ),
		} );
		if ( !referenceUrl ) return;

		const result = await runCommand( {
			project,
			commandTitle: 'diff',
			command: 'diff',
			runner: runnerFactory( project ),
			output,
			treeProvider,
			extraArgs: { referenceUrl: referenceUrl.trim() },
		} );

		if ( result?.exitCode === 0 ) {
			await output.showDiff( result.stdout );
		}
	};
}
