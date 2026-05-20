import * as vscode from 'vscode';
import type { LiquibaseCommand, LiquibaseProject, RunnerEvent, CommandResult } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
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

export function buildOnEvent( output: OutputManager ): ( event: RunnerEvent ) => void {
	return ( event: RunnerEvent ) => {
		if ( event.type === 'stdout' || event.type === 'stderr' ) {
			output.appendOutput( event.data );
		}
	};
}

export async function runCommand( opts: {
	project: LiquibaseProject;
	commandTitle: string;
	command?: LiquibaseCommand;
	runner: CommandRunner;
	output: OutputManager;
	treeProvider: LiquibaseTreeProvider;
	extraArgs?: Record<string, string>;
	refreshAfter?: boolean;
} ): Promise<CommandResult | null> {
	const { project, commandTitle, runner, output, treeProvider, extraArgs, refreshAfter = true } = opts;
	const command = opts.command ?? commandTitle.toLowerCase().replace( /\s+/g, '' ) as LiquibaseCommand;

	output.startCommand( commandTitle, project.name );
	output.setCancelHandler( () => runner.cancel() );

	try {
		const result = await runner.run( command, project, extraArgs, buildOnEvent( output ) );
		output.endCommand( result.exitCode, result.durationMs );

		if ( result.exitCode !== 0 ) {
			vscode.window.showErrorMessage(
				`Liquibase ${commandTitle} failed (exit ${result.exitCode}). See Liquibase Runner output.`,
			);
		} else if ( refreshAfter ) {
			treeProvider.refresh();
		}
		return result;
	} catch ( err ) {
		const msg = err instanceof Error ? err.message : String( err );
		output.endCommand( -1, 0 );
		vscode.window.showErrorMessage( `Liquibase ${commandTitle} error: ${msg}` );
		return null;
	} finally {
		output.clearCancelHandler();
	}
}
