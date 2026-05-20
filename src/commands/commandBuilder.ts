import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import { pickProject, runCommand } from './shared.js';

export function createCommandBuilderCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async () => {
		const project = await pickProject( projects );
		if ( !project ) return;

		const pick = await vscode.window.showQuickPick(
			[
				{ label: 'Update', description: 'Apply pending changes' },
				{ label: 'Status', description: 'Show pending changesets' },
				{ label: 'Validate', description: 'Validate changelogs' },
				{ label: 'Diff', description: 'Compare two schemas' },
				{ label: 'Rollback', description: 'Rollback by tag or count' },
				{ label: 'Generate Changelog', description: 'Generate a changelog (DB or Entities)' },
			],
			{ placeHolder: 'Choose a Liquibase command to build and run' },
		);
		if ( !pick ) return;

		const runner = runnerFactory( project );

		switch ( pick.label ) {
			case 'Update':
				await runCommand( { project, commandTitle: 'Update', command: 'update', runner, output, treeProvider } );
				break;
			case 'Status':
				await runCommand( { project, commandTitle: 'Status', command: 'status', runner, output, treeProvider } );
				break;
			case 'Validate':
				await runCommand( { project, commandTitle: 'Validate', command: 'validate', runner, output, treeProvider } );
				break;
			case 'Diff':
				await runDiff( project, runner, output, treeProvider );
				break;
			case 'Rollback':
				await runRollback( project, runner, output, treeProvider );
				break;
			case 'Generate Changelog':
				await vscode.commands.executeCommand( 'liquibaseRunner.generateChangelog' );
				break;
		}
	};
}

async function runDiff(
	project: LiquibaseProject,
	runner: CommandRunner,
	output: OutputManager,
	treeProvider: LiquibaseTreeProvider,
) {
	const reference = await vscode.window.showInputBox( {
		prompt: 'Reference URL (optional)',
		placeHolder: 'hibernate:spring:... or jdbc:postgresql://...',
	} );
	const extra: Record<string, string> = {};
	if ( reference?.trim() ) extra.referenceUrl = reference.trim();
	await runCommand( { project, commandTitle: 'Diff', command: 'diff', runner, output, treeProvider, extraArgs: extra } );
}

async function runRollback(
	project: LiquibaseProject,
	runner: CommandRunner,
	output: OutputManager,
	treeProvider: LiquibaseTreeProvider,
) {
	const mode = await vscode.window.showQuickPick(
		[
			{ label: 'By Tag', mode: 'tag' },
			{ label: 'By Count', mode: 'count' },
		],
		{ placeHolder: 'Choose rollback mode' },
	);
	if ( !mode ) return;

	if ( mode.mode === 'tag' ) {
		const tag = await vscode.window.showInputBox( {
			prompt: 'Rollback to tag',
			validateInput: v => v?.trim() ? null : 'Tag is required',
		} );
		if ( !tag ) return;
		await runCommand( { project, commandTitle: 'Rollback (tag)', command: 'rollback', runner, output, treeProvider, extraArgs: { tag: tag.trim() } } );
	} else {
		const count = await vscode.window.showInputBox( {
			prompt: 'Number of changesets to rollback',
			validateInput: v => /^\d+$/.test( v ?? '' ) ? null : 'Enter a positive integer',
		} );
		if ( !count ) return;
		await runCommand( { project, commandTitle: 'Rollback (count)', command: 'rollback', runner, output, treeProvider, extraArgs: { count: count.trim() } } );
	}
}
