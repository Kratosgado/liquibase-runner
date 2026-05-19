import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { pickProject, runCommand } from './shared.js';

export function createValidateCommand(
	projects: LiquibaseProject[],
	webview: WebviewPanelManager,
	outputChannel: vscode.OutputChannel,
	runnerFactory: (p: LiquibaseProject) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async (node?: LiquibaseTreeNode) => {
		const project = node?.project ?? (await pickProject(projects));
		if (!project) return;
		await runCommand({
			project,
			commandTitle: 'validate',
			runner: runnerFactory(project),
			webview,
			outputChannel,
			treeProvider,
			refreshAfter: false,
		});
	};
}
