import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { pickProject, buildOnEvent } from './shared.js';

export function createStatusCommand(
	projects: LiquibaseProject[],
	webview: WebviewPanelManager,
	outputChannel: vscode.OutputChannel,
	runnerFactory: (p: LiquibaseProject) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async (node?: LiquibaseTreeNode) => {
		const project = node?.project ?? (await pickProject(projects));
		if (!project) return;

		webview.show('Liquibase: status');
		webview.postMessage({ type: 'commandStart', command: 'status', project: project.name });
		outputChannel.appendLine(`\n[status] ${project.name}`);
		outputChannel.show(true);

		const runner = runnerFactory(project);
		const cancelDisposable = webview.onMessage(msg => {
			if (msg.type === 'cancelCommand') runner.cancel();
		});

		const onEvent = buildOnEvent(webview, outputChannel);
		try {
			const result = await runner.run('status', project, undefined, onEvent);
			webview.postMessage({ type: 'commandEnd', exitCode: result.exitCode, durationMs: result.durationMs });

			if (result.exitCode === 0) {
				// Parse pending changesets from stdout and show in the status tab
				const pending = parseStatusOutput(result.stdout);
				webview.postMessage({ type: 'showStatus', pending });
				treeProvider.refresh();
			} else {
				vscode.window.showErrorMessage('Liquibase status failed. See Liquibase Runner output.');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			webview.postMessage({ type: 'commandEnd', exitCode: -1, durationMs: 0 });
			vscode.window.showErrorMessage(`Liquibase status error: ${msg}`);
		} finally {
			cancelDisposable.dispose();
		}
	};
}

function parseStatusOutput(stdout: string) {
	// Liquibase status output lines look like:
	// "3 changesets have not been applied to ..."
	// or individual lines: "     path/to/file.sql::id::author"
	const changesets: Array<{ id: string; author: string; filePath: string; lineNumber: number }> = [];
	const lineRegex = /^\s+(.+?)::([^:]+)::([^:]+)\s*$/;
	for (const line of stdout.split('\n')) {
		const match = line.match(lineRegex);
		if (match) {
			changesets.push({
				filePath: match[1].trim(),
				id: match[2].trim(),
				author: match[3].trim(),
				lineNumber: 0,
			});
		}
	}
	return changesets;
}
