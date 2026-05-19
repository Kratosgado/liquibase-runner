import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import { pickProject, runCommand } from './shared.js';

export function createCommandBuilderCommand(
    projects: LiquibaseProject[],
    webview: WebviewPanelManager,
    outputChannel: vscode.OutputChannel,
    runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
    treeProvider: LiquibaseTreeProvider,
) {
    return async () => {
        const project = await pickProject( projects );
        if ( !project ) return;

        const pick = await vscode.window.showQuickPick(
            [
                { label: 'Update', description: 'Apply pending changes' },
                { label: 'Status', description: 'Show pending changesets' },
                { label: 'Validate', description: 'Validate changelogs' },
                { label: 'Diff', description: 'Compare two schemas' },
                { label: 'Rollback', description: 'Rollback by tag or count' },
                { label: 'Generate Changelog', description: 'Generate a changelog (DB or Entities)' },
            ],
            { placeHolder: 'Choose a Liquibase command to build and run' },
        );
        if ( !pick ) return;

        const runner = runnerFactory( project );

        switch ( pick.label ) {
            case 'Update':
                await runCommand( { project, commandTitle: 'Update', command: 'update', runner, webview, outputChannel, treeProvider } );
                break;
            case 'Status':
                await runCommand( { project, commandTitle: 'Status', command: 'status', runner, webview, outputChannel, treeProvider } );
                break;
            case 'Validate':
                await runCommand( { project, commandTitle: 'Validate', command: 'validate', runner, webview, outputChannel, treeProvider } );
                break;
            case 'Diff': {
                const reference = await vscode.window.showInputBox( { prompt: 'Reference URL (optional)', placeHolder: 'hibernate:spring:... or jdbc:postgresql://...' } );
                const extra: Record<string, string> = {};
                if ( reference && reference.trim() ) extra.referenceUrl = reference.trim();
                await runCommand( { project, commandTitle: 'Diff', command: 'diff', runner, webview, outputChannel, treeProvider, extraArgs: extra } );
                break;
            }
            case 'Rollback': {
                const mode = await vscode.window.showQuickPick( [
                    { label: 'By Tag', mode: 'tag' },
                    { label: 'By Count', mode: 'count' },
                ], { placeHolder: 'Choose rollback mode' } );
                if ( !mode ) return;
                if ( mode.mode === 'tag' ) {
                    const tag = await vscode.window.showInputBox( { prompt: 'Rollback to tag', validateInput: v => v && v.trim() ? null : 'Tag is required' } );
                    if ( !tag ) return;
                    await runCommand( { project, commandTitle: 'Rollback (tag)', command: 'rollback', runner, webview, outputChannel, treeProvider, extraArgs: { tag: tag.trim() } } );
                } else {
                    const count = await vscode.window.showInputBox( { prompt: 'Number of changesets to rollback', validateInput: v => /^[0-9]+$/.test( v || '' ) ? null : 'Enter a positive integer' } );
                    if ( !count ) return;
                    await runCommand( { project, commandTitle: 'Rollback (count)', command: 'rollback', runner, webview, outputChannel, treeProvider, extraArgs: { count: count.trim() } } );
                }
                break;
            }
            case 'Generate Changelog':
                // Reuse the existing command to keep the same wizard UX
                await vscode.commands.executeCommand( 'liquibaseRunner.generateChangelog' );
                break;
        }
    };
}
