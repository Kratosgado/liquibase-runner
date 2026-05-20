import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { pickProject, runCommand } from './shared.js';

export function createStatusCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async ( node?: LiquibaseTreeNode ) => {
		const project = node?.project ?? ( await pickProject( projects ) );
		if ( !project ) return;

		const result = await runCommand( {
			project,
			commandTitle: 'status',
			command: 'status',
			runner: runnerFactory( project ),
			output,
			treeProvider,
		} );

		if ( result?.exitCode === 0 ) {
			output.showPendingChangesets( parseStatusOutput( result.stdout ) );
		}
	};
}

function parseStatusOutput( stdout: string ) {
	const changesets: Array<{ id: string; author: string; filePath: string; lineNumber: number }> = [];
	const lineRegex = /^\s+(.+?)::([^:]+)::([^:]+)\s*$/;
	for ( const line of stdout.split( '\n' ) ) {
		const match = lineRegex.exec( line );
		if ( match ) {
			changesets.push( {
				filePath: match[ 1 ].trim(),
				id: match[ 2 ].trim(),
				author: match[ 3 ].trim(),
				lineNumber: 0,
			} );
		}
	}
	return changesets;
}
