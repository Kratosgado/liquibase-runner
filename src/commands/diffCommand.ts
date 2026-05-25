import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import type { ConnectionManager } from '../config/ConnectionManager.js';
import { CommandFormPanel } from '../webview/CommandFormPanel.js';
import { DiffPreviewPanel } from '../webview/DiffPreviewPanel.js';
import { getProjectCommandConfig, saveProjectCommandConfig } from '../config/configManager.js';
import { pickProject, runCommand } from './shared.js';

export function createDiffCommand(
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
			formType: 'diff',
			savedValues: { referenceUrl: saved.referenceUrl },
		} );
		if ( !form ) return;

		const extraArgs: Record<string, string> = {};

		if ( form.referenceConnectionName ) {
			Object.assign( extraArgs, await connManager.getReferenceArgs( form.referenceConnectionName ) );
		} else if ( form.referenceUrl ) {
			extraArgs.referenceUrl = form.referenceUrl;
			await saveProjectCommandConfig( project.rootPath, { referenceUrl: form.referenceUrl } );
		}

		if ( form.outputFile ) {
			extraArgs.diffChangeLogFile = form.outputFile;
			const result = await runCommand( {
				project,
				commandTitle: 'Diff Changelog',
				command: 'diffChangelog',
				runner: runnerFactory( project ),
				output,
				treeProvider,
				extraArgs,
			} );
			if ( result?.exitCode === 0 ) {
				try {
					const doc = await vscode.workspace.openTextDocument( vscode.Uri.file( form.outputFile ) );
					await vscode.window.showTextDocument( doc, { preview: true, viewColumn: vscode.ViewColumn.Beside } );
				} catch {
					// file may be relative or not yet flushed
				}
			}
		} else {
			const result = await runCommand( {
				project,
				commandTitle: 'Diff',
				command: 'diff',
				runner: runnerFactory( project ),
				output,
				treeProvider,
				extraArgs,
			} );
			if ( result?.exitCode === 0 ) {
				DiffPreviewPanel.show( context, result.stdout );
			}
		}
	};
}
