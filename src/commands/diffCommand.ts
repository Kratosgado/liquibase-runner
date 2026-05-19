import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { getDiffReferenceUrl } from '../config/configManager.js';
import { pickProject, buildOnEvent } from './shared.js';

export function createDiffCommand(
	projects: LiquibaseProject[],
	webview: WebviewPanelManager,
	outputChannel: vscode.OutputChannel,
	runnerFactory: (p: LiquibaseProject) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async (node?: LiquibaseTreeNode) => {
		const project = node?.project ?? (await pickProject(projects));
		if (!project) return;

		const referenceUrl = await vscode.window.showInputBox({
			prompt: 'Reference database URL for diff',
			value: getDiffReferenceUrl(),
			placeHolder: 'jdbc:postgresql://localhost:5432/reference_db',
			validateInput: v => (v.trim() ? null : 'Reference URL cannot be empty'),
		});
		if (!referenceUrl) return;

		webview.show('Liquibase: diff');
		webview.postMessage({ type: 'commandStart', command: 'diff', project: project.name });
		outputChannel.appendLine(`\n[diff] ${project.name}`);
		outputChannel.show(true);

		const runner = runnerFactory(project);
		const cancelDisposable = webview.onMessage(msg => {
			if (msg.type === 'cancelCommand') runner.cancel();
		});

		const onEvent = buildOnEvent(webview, outputChannel);
		try {
			const result = await runner.run('diff', project, { referenceUrl: referenceUrl.trim() }, onEvent);
			webview.postMessage({ type: 'commandEnd', exitCode: result.exitCode, durationMs: result.durationMs });

			if (result.exitCode === 0) {
				webview.postMessage({ type: 'showDiff', content: result.stdout });
			} else {
				vscode.window.showErrorMessage('Liquibase diff failed. See Liquibase Runner output.');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			webview.postMessage({ type: 'commandEnd', exitCode: -1, durationMs: 0 });
			vscode.window.showErrorMessage(`Liquibase diff error: ${msg}`);
		} finally {
			cancelDisposable.dispose();
		}

		treeProvider.refresh();
	};
}
