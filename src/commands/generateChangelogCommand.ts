import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import type { ConnectionManager } from '../config/ConnectionManager.js';
import { CommandFormPanel } from '../webview/CommandFormPanel.js';
import { getProjectCommandConfig, saveProjectCommandConfig } from '../config/configManager.js';
import { pickProject, runCommand } from './shared.js';

export function createGenerateChangelogCommand(
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
			formType: 'generateChangelog',
			savedValues: {
				referenceUrl: saved.referenceUrl,
				outputFile: saved.generateChangelogDir
					? `${saved.generateChangelogDir}/generated.yaml`
					: undefined,
				contexts: saved.contexts,
				labels: saved.labels,
			},
		} );
		if ( !form ) return;

		const extraArgs: Record<string, string> = {};

		if ( form.outputFile ) {
			// Maven needs outputChangeLogFile, Gradle/CLI strategies map it accordingly
			extraArgs.outputChangeLogFile = form.outputFile;
			const dir = form.outputFile.includes( '/' )
				? form.outputFile.substring( 0, form.outputFile.lastIndexOf( '/' ) )
				: '';
			if ( dir ) await saveProjectCommandConfig( project.rootPath, { generateChangelogDir: dir } );
		}

		if ( form.contexts ) {
			extraArgs.contexts = form.contexts;
			await saveProjectCommandConfig( project.rootPath, { contexts: form.contexts } );
		}
		if ( form.labels ) {
			extraArgs.labels = form.labels;
			await saveProjectCommandConfig( project.rootPath, { labels: form.labels } );
		}

		if ( form.generationMode === 'entities' && form.referenceUrl ) {
			extraArgs.referenceUrl = form.referenceUrl;
			await saveProjectCommandConfig( project.rootPath, { referenceUrl: form.referenceUrl } );
		} else if ( form.generationMode === 'database' && form.connectionName ) {
			Object.assign( extraArgs, await connManager.getConnectionArgs( form.connectionName ) );
		}

		const commandTitle = form.generationMode === 'entities'
			? 'Generate Changelog from Entities'
			: 'Generate Changelog';

		const result = await runCommand( {
			project,
			commandTitle,
			command: 'generateChangeLog',
			runner: runnerFactory( project ),
			output,
			treeProvider,
			extraArgs,
		} );

		if ( result?.exitCode === 0 && form.outputFile ) {
			try {
				const doc = await vscode.workspace.openTextDocument( vscode.Uri.file( form.outputFile ) );
				await vscode.window.showTextDocument( doc, { preview: true, viewColumn: vscode.ViewColumn.Beside } );
			} catch {
				// output file may be relative or not yet flushed — ignore
			}
		}
	};
}
