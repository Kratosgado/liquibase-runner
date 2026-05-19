import * as vscode from 'vscode';
import type { LiquibaseProject, Changeset } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { createUpdateCommand } from './updateCommand.js';
import { createStatusCommand } from './statusCommand.js';
import { createValidateCommand } from './validateCommand.js';
import { createRollbackCommand } from './rollbackCommand.js';
import { createGenerateChangelogCommand } from './generateChangelogCommand.js';
import { createDiffCommand } from './diffCommand.js';

export function registerCommands(
	context: vscode.ExtensionContext,
	projects: LiquibaseProject[],
	webview: WebviewPanelManager,
	outputChannel: vscode.OutputChannel,
	runnerFactory: (p: LiquibaseProject) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const reg = (id: string, handler: (...args: any[]) => unknown) =>
		context.subscriptions.push(vscode.commands.registerCommand(id, handler));

	reg('liquibaseRunner.update',
		createUpdateCommand(projects, webview, outputChannel, runnerFactory, treeProvider));
	reg('liquibaseRunner.status',
		createStatusCommand(projects, webview, outputChannel, runnerFactory, treeProvider));
	reg('liquibaseRunner.validate',
		createValidateCommand(projects, webview, outputChannel, runnerFactory, treeProvider));
	reg('liquibaseRunner.rollback',
		createRollbackCommand(projects, webview, outputChannel, runnerFactory, treeProvider));
	reg('liquibaseRunner.generateChangelog',
		createGenerateChangelogCommand(projects, webview, outputChannel, runnerFactory, treeProvider));
	reg('liquibaseRunner.diff',
		createDiffCommand(projects, webview, outputChannel, runnerFactory, treeProvider));

	reg('liquibaseRunner.refresh', (_node?: LiquibaseTreeNode) => {
		treeProvider.refresh();
	});

	reg('liquibaseRunner.openPanel', () => {
		webview.show('Liquibase Runner');
	});

	reg('liquibaseRunner.openChangeset', (changeset?: Changeset) => {
		if (!changeset?.filePath) return;
		const uri = vscode.Uri.file(changeset.filePath);
		const pos = new vscode.Position(Math.max(0, changeset.lineNumber - 1), 0);
		vscode.window.showTextDocument(uri, {
			selection: new vscode.Range(pos, pos),
			preview: false,
		});
	});
}
