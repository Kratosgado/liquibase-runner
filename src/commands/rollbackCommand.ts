import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { getDefaultRollbackTag } from '../config/configManager.js';
import { pickProject, buildOnEvent } from './shared.js';

export function createRollbackCommand(
	projects: LiquibaseProject[],
	webview: WebviewPanelManager,
	outputChannel: vscode.OutputChannel,
	runnerFactory: (p: LiquibaseProject) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async (node?: LiquibaseTreeNode) => {
		const project = node?.project ?? (await pickProject(projects));
		if (!project) return;

		const mode = await vscode.window.showQuickPick(
			[
				{ label: 'By Tag', description: 'Rollback to a named tag', value: 'tag' },
				{ label: 'By Count', description: 'Rollback last N changesets', value: 'count' },
			],
			{ placeHolder: 'How do you want to rollback?' },
		);
		if (!mode) return;

		let extraArgs: Record<string, string>;

		if (mode.value === 'tag') {
			const tag = await vscode.window.showInputBox({
				prompt: 'Enter rollback tag',
				value: getDefaultRollbackTag(),
				placeHolder: 'e.g. v1.0.0',
				validateInput: v => (v.trim() ? null : 'Tag cannot be empty'),
			});
			if (!tag) return;
			extraArgs = { rollbackTag: tag.trim() };
		} else {
			const countStr = await vscode.window.showInputBox({
				prompt: 'Number of changesets to rollback',
				placeHolder: '1',
				validateInput: v => (/^\d+$/.test(v.trim()) ? null : 'Must be a positive integer'),
			});
			if (!countStr) return;
			extraArgs = { rollbackCount: countStr.trim() };
		}

		webview.show('Liquibase: rollback');
		webview.postMessage({ type: 'commandStart', command: 'rollback', project: project.name });
		outputChannel.appendLine(`\n[rollback] ${project.name}`);
		outputChannel.show(true);

		const runner = runnerFactory(project);
		const cancelDisposable = webview.onMessage(msg => {
			if (msg.type === 'cancelCommand') runner.cancel();
		});

		const onEvent = buildOnEvent(webview, outputChannel);
		try {
			const result = await runner.run('rollback', project, extraArgs, onEvent);
			webview.postMessage({ type: 'commandEnd', exitCode: result.exitCode, durationMs: result.durationMs });

			if (result.exitCode !== 0) {
				vscode.window.showErrorMessage('Liquibase rollback failed. See Liquibase Runner output.');
			} else {
				treeProvider.refresh();
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			webview.postMessage({ type: 'commandEnd', exitCode: -1, durationMs: 0 });
			vscode.window.showErrorMessage(`Liquibase rollback error: ${msg}`);
		} finally {
			cancelDisposable.dispose();
		}
	};
}
