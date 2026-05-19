import * as vscode from 'vscode';
import { detectProjects } from './config/projectDetector.js';
import { onConfigurationChange } from './config/configManager.js';
import { ChangelogParser } from './changelog/ChangelogParser.js';
import { ChangelogWatcher } from './changelog/ChangelogWatcher.js';
import { LiquibaseTreeProvider } from './tree/LiquibaseTreeProvider.js';
import { WebviewPanelManager } from './webview/WebviewPanelManager.js';
import { createRunnerFactory } from './runner/CommandRunner.js';
import { registerCommands } from './commands/registerCommands.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const outputChannel = vscode.window.createOutputChannel('Liquibase Runner');
	context.subscriptions.push(outputChannel);

	const parser = new ChangelogParser();
	const webviewManager = new WebviewPanelManager(context);
	context.subscriptions.push(webviewManager);

	let projects = await detectProjects(vscode.workspace.workspaceFolders ?? []);

	const treeProvider = new LiquibaseTreeProvider(projects, parser);
	context.subscriptions.push(treeProvider);

	const watchers = projects.map(
		p => new ChangelogWatcher(p, () => treeProvider.refresh()),
	);
	context.subscriptions.push(...watchers);

	const treeView = vscode.window.createTreeView('liquibaseRunner.projectsView', {
		treeDataProvider: treeProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(treeView);

	const runnerFactory = createRunnerFactory();

	registerCommands(context, projects, webviewManager, outputChannel, runnerFactory, treeProvider);

	// Re-detect projects when workspace folders or configuration changes
	const refreshProjects = async () => {
		projects = await detectProjects(vscode.workspace.workspaceFolders ?? []);
		treeProvider.updateProjects(projects);
	};

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(refreshProjects),
	);

	onConfigurationChange(refreshProjects, context.subscriptions);
}

export function deactivate(): void {}
