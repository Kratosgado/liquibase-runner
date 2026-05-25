import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { getProjectCommandConfig, saveProjectCommandConfig } from '../config/configManager.js';
import { pickProject, runCommand } from './shared.js';

export function createTagCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async ( node?: LiquibaseTreeNode ) => {
		const project = node?.project ?? ( await pickProject( projects ) );
		if ( !project ) return;

		const saved = getProjectCommandConfig( project.rootPath );

		const tagName = await vscode.window.showInputBox( {
			title: `Tag Database — ${project.name}`,
			prompt: 'Tag name to apply to the current database state',
			value: saved.rollbackTag ?? '',
			placeHolder: 'e.g. v1.0.0',
			validateInput: v => ( v.trim() ? undefined : 'Tag name cannot be empty' ),
		} );
		if ( !tagName ) return;

		await saveProjectCommandConfig( project.rootPath, { rollbackTag: tagName.trim() } );

		await runCommand( {
			project,
			commandTitle: 'Tag',
			command: 'tag',
			runner: runnerFactory( project ),
			output,
			treeProvider,
			extraArgs: { tag: tagName.trim() },
		} );
	};
}
