import * as vscode from 'vscode';
import type { LiquibaseCommand, LiquibaseProject, RunnerEvent } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';

export async function pickProject(
	projects: LiquibaseProject[],
): Promise<LiquibaseProject | undefined> {
	if ( projects.length === 0 ) {
		vscode.window.showWarningMessage( 'No Liquibase projects detected in this workspace.' );
		return undefined;
	}
	if ( projects.length === 1 ) return projects[ 0 ];

	const items = projects.map( p => ( { label: p.name, description: p.rootPath, project: p } ) );
	const picked = await vscode.window.showQuickPick( items, { placeHolder: 'Select a Liquibase project' } );
	return picked?.project;
}

export function buildOnEvent(
	webview: WebviewPanelManager,
	outputChannel: vscode.OutputChannel,
): ( event: RunnerEvent ) => void {
	return ( event: RunnerEvent ) => {
		if ( event.type === 'stdout' || event.type === 'stderr' ) {
			webview.postMessage( { type: event.type, data: event.data } );
			outputChannel.append( event.data );
		}
	};
}

export async function runCommand( opts: {
	project: LiquibaseProject;
	commandTitle: string;
	command?: LiquibaseCommand;
	runner: CommandRunner;
	webview: WebviewPanelManager;
	outputChannel: vscode.OutputChannel;
	treeProvider: LiquibaseTreeProvider;
	extraArgs?: Record<string, string>;
	refreshAfter?: boolean;
} ): Promise<void> {
	const { project, commandTitle, runner, webview, outputChannel, treeProvider, extraArgs, refreshAfter = true } = opts;
	const command = opts.command ?? commandTitle.toLowerCase().replace( /\s+/g, '' ) as LiquibaseCommand;

	webview.show( `Liquibase: ${commandTitle}` );
	webview.postMessage( { type: 'commandStart', command: commandTitle, project: project.name } );
	outputChannel.appendLine( `\n[${commandTitle}] ${project.name} (${project.resolvedStrategy})` );
	outputChannel.show( true );

	// Wire cancel button in webview to abort the runner
	const cancelDisposable = webview.onMessage( msg => {
		if ( msg.type === 'cancelCommand' ) runner.cancel();
	} );

	const onEvent = buildOnEvent( webview, outputChannel );
	try {
		const result = await runner.run( command, project, extraArgs, onEvent );
		webview.postMessage( { type: 'commandEnd', exitCode: result.exitCode, durationMs: result.durationMs } );

		if ( result.exitCode !== 0 ) {
			vscode.window.showErrorMessage(
				`Liquibase ${commandTitle} failed (exit ${result.exitCode}). See Liquibase Runner output.`,
			);
		} else if ( refreshAfter ) {
			treeProvider.refresh();
		}
	} catch ( err ) {
		const msg = err instanceof Error ? err.message : String( err );
		webview.postMessage( { type: 'commandEnd', exitCode: -1, durationMs: 0 } );
		vscode.window.showErrorMessage( `Liquibase ${commandTitle} error: ${msg}` );
	} finally {
		cancelDisposable.dispose();
	}
}
