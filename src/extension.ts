import * as vscode from 'vscode';
import { detectProjects } from './config/projectDetector.js';
import { onConfigurationChange } from './config/configManager.js';
import { ChangelogParser } from './changelog/ChangelogParser.js';
import { ChangelogWatcher } from './changelog/ChangelogWatcher.js';
import { LiquibaseTreeProvider } from './tree/LiquibaseTreeProvider.js';
import { WebviewPanelManager } from './webview/WebviewPanelManager.js';
import { createRunnerFactory } from './runner/CommandRunner.js';
import { registerCommands } from './commands/registerCommands.js';

export async function activate( context: vscode.ExtensionContext ): Promise<void> {
	const outputChannel = vscode.window.createOutputChannel( 'Liquibase Runner' );
	context.subscriptions.push( outputChannel );

	const parser = new ChangelogParser();
	const webviewManager = new WebviewPanelManager( context );
	context.subscriptions.push( webviewManager );

	let projects = await detectProjects( vscode.workspace.workspaceFolders ?? [] );

	const treeProvider = new LiquibaseTreeProvider( projects, parser );
	context.subscriptions.push( treeProvider );

	const watchers = projects.map(
		p => new ChangelogWatcher( p, () => treeProvider.refresh() ),
	);
	context.subscriptions.push( ...watchers );

	const treeView = vscode.window.createTreeView( 'liquibaseRunner.projectsView', {
		treeDataProvider: treeProvider,
		showCollapseAll: true,
	} );
	context.subscriptions.push( treeView );

	const runnerFactory = createRunnerFactory();

	registerCommands( context, projects, webviewManager, outputChannel, runnerFactory, treeProvider );

	// Handle messages from the webview (e.g. open configure project)
	context.subscriptions.push( webviewManager.onMessage( async ( msg: any ) => {
		if ( !msg || !msg.type ) return;
		if ( msg.type === 'openConfigure' ) {
			await vscode.commands.executeCommand( 'liquibaseRunner.configureProject' );
			return;
		}
		if ( msg.type === 'webviewRunCommand' ) {
			const { command, projectRoot, extraArgs } = msg as { command: string; projectRoot?: string; extraArgs?: Record<string, string> };
			const project = projects.find( p => p.rootPath === projectRoot ) ?? ( projects.length ? projects[ 0 ] : undefined );
			if ( !project ) {
				vscode.window.showWarningMessage( 'No Liquibase project available to run the command.' );
				return;
			}
			// confirmation for destructive commands
			if ( command === 'rollback' || command === 'update' ) {
				const choice = await vscode.window.showWarningMessage(
					`[liquibase-runner] Are you sure you want to run ${command} on ${project.name}?`,
					{ modal: true },
					'Run',
					'Cancel',
				);
				if ( choice !== 'Run' ) return;
			}
			const runner = runnerFactory( project );
			await import( './commands/shared.js' ).then( m => m.runCommand( {
				project,
				commandTitle: command,
				command: command as any,
				runner,
				webview: webviewManager,
				outputChannel,
				treeProvider,
				extraArgs: extraArgs || {},
			} ) );
			return;
		}
		if ( msg.type === 'savePresets' ) {
			// Store presets in workspace configuration under liquibaseRunner.projectPresets.<rootPath>
			try {
				const projectRoot: string | undefined = msg.projectRoot;
				const preset = msg.preset;
				const cfg = vscode.workspace.getConfiguration();
				const existing = cfg.get<Record<string, unknown>>( 'liquibaseRunner.projectPresets' ) || {};
				if ( projectRoot ) existing[ projectRoot ] = preset;
				await cfg.update( 'liquibaseRunner.projectPresets', existing, vscode.ConfigurationTarget.Workspace );
				vscode.window.showInformationMessage( 'Presets saved to workspace settings.' );
			} catch ( e ) {
				console.error( '[liquibase-runner] error saving presets', e );
			}
			return;
		}
	} ) );

	// Re-detect projects when workspace folders or configuration changes
	const refreshProjects = async () => {
		projects = await detectProjects( vscode.workspace.workspaceFolders ?? [] );
		treeProvider.updateProjects( projects );
	};

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders( refreshProjects ),
	);

	onConfigurationChange( refreshProjects, context.subscriptions );
}

export function deactivate(): void { }
