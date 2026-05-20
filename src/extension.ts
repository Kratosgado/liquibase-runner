import * as vscode from 'vscode';
import { detectProjects } from './config/projectDetector.js';
import { onConfigurationChange } from './config/configManager.js';
import { ChangelogParser } from './changelog/ChangelogParser.js';
import { ChangelogWatcher } from './changelog/ChangelogWatcher.js';
import { LiquibaseTreeProvider } from './tree/LiquibaseTreeProvider.js';
import { OutputManager } from './output/OutputManager.js';
import { createRunnerFactory } from './runner/CommandRunner.js';
import { registerCommands } from './commands/registerCommands.js';

export async function activate( context: vscode.ExtensionContext ): Promise<void> {
	const output = new OutputManager( context );
	context.subscriptions.push( output );

	const parser = new ChangelogParser();

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

	registerCommands( context, projects, output, runnerFactory, treeProvider );

	const refreshProjects = async () => {
		projects = await detectProjects( vscode.workspace.workspaceFolders ?? [] );
		treeProvider.updateProjects( projects );
	};

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders( refreshProjects ),
	);

	onConfigurationChange( refreshProjects, context.subscriptions );
}

// VS Code calls this when the extension is unloaded; subscriptions handle all cleanup.
export function deactivate(): void { /* intentionally empty */ }
