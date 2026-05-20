import * as vscode from 'vscode';
import type { Changeset } from '../types/index.js';

const DIFF_SCHEME = 'liquibase-diff';

class DiffContentProvider implements vscode.TextDocumentContentProvider {
	private content = '';
	readonly uri = vscode.Uri.parse( `${DIFF_SCHEME}:Liquibase%20Diff.sql` );
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;

	update( content: string ): void {
		this.content = content;
		this._onDidChange.fire( this.uri );
	}

	provideTextDocumentContent(): string {
		return this.content;
	}
}

export class OutputManager implements vscode.Disposable {
	private readonly outputChannel: vscode.OutputChannel;
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly diffProvider: DiffContentProvider;
	private cancelHandler?: () => void;

	constructor( context: vscode.ExtensionContext ) {
		this.outputChannel = vscode.window.createOutputChannel( 'Liquibase Runner' );
		this.statusBarItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Left, 100 );
		this.diffProvider = new DiffContentProvider();

		this.statusBarItem.text = '$(database) Liquibase';
		this.statusBarItem.tooltip = 'Liquibase Runner — click to open output';
		this.statusBarItem.command = 'liquibaseRunner.openPanel';
		this.statusBarItem.show();

		context.subscriptions.push(
			vscode.commands.registerCommand( 'liquibaseRunner._cancelCurrent', () => {
				this.cancelHandler?.();
			} ),
			vscode.workspace.registerTextDocumentContentProvider( DIFF_SCHEME, this.diffProvider ),
			this.outputChannel,
			this.statusBarItem,
		);
	}

	show(): void {
		this.outputChannel.show( true );
	}

	startCommand( command: string, project: string ): void {
		const separator = '─'.repeat( 60 );
		this.outputChannel.appendLine( `\n${separator}` );
		this.outputChannel.appendLine( `▶  ${command.toUpperCase()}  ·  ${project}` );
		this.outputChannel.appendLine( separator );
		this.outputChannel.show( true );

		this.statusBarItem.text = `$(loading~spin) Liquibase: ${command}`;
		this.statusBarItem.tooltip = `Running ${command} on ${project}\nClick to cancel`;
		this.statusBarItem.command = 'liquibaseRunner._cancelCurrent';
		this.statusBarItem.backgroundColor = undefined;
	}

	appendOutput( data: string ): void {
		this.outputChannel.append( data );
	}

	endCommand( exitCode: number, durationMs: number ): void {
		const dur = `${( durationMs / 1000 ).toFixed( 1 )}s`;
		if ( exitCode === 0 ) {
			this.outputChannel.appendLine( `\n✓  Done in ${dur}` );
			this.statusBarItem.text = '$(check) Liquibase: Done';
			this.statusBarItem.backgroundColor = undefined;
		} else {
			this.outputChannel.appendLine( `\n✗  Failed (exit ${exitCode}) in ${dur}` );
			this.statusBarItem.text = '$(error) Liquibase: Failed';
			this.statusBarItem.backgroundColor = new vscode.ThemeColor( 'statusBarItem.errorBackground' );
		}
		this.statusBarItem.tooltip = 'Liquibase Runner — click to open output';
		this.statusBarItem.command = 'liquibaseRunner.openPanel';
		this.cancelHandler = undefined;

		setTimeout( () => {
			if ( !this.cancelHandler ) {
				this.statusBarItem.text = '$(database) Liquibase';
				this.statusBarItem.backgroundColor = undefined;
			}
		}, 8_000 );
	}

	setCancelHandler( handler: () => void ): void {
		this.cancelHandler = handler;
	}

	clearCancelHandler(): void {
		this.cancelHandler = undefined;
	}

	async showDiff( content: string ): Promise<void> {
		this.diffProvider.update( content );
		const doc = await vscode.workspace.openTextDocument( this.diffProvider.uri );
		await vscode.window.showTextDocument( doc, {
			preview: true,
			viewColumn: vscode.ViewColumn.Beside,
		} );
	}

	showPendingChangesets( changesets: Changeset[] ): void {
		if ( changesets.length === 0 ) {
			vscode.window.showInformationMessage( 'Liquibase: database is up to date — no pending changesets.' );
			return;
		}

		const items = changesets.map( cs => ( {
			label: `$(circle-filled) ${cs.id}`,
			description: cs.author,
			detail: cs.filePath,
			changeset: cs,
		} ) );

		vscode.window.showQuickPick( items, {
			title: `${changesets.length} Pending Changeset${changesets.length === 1 ? '' : 's'}`,
			placeHolder: 'Select a changeset to open the file',
			matchOnDescription: true,
			matchOnDetail: true,
		} ).then( selected => {
			if ( !selected?.changeset.filePath ) return;
			const uri = vscode.Uri.file( selected.changeset.filePath );
			const pos = new vscode.Position( Math.max( 0, selected.changeset.lineNumber - 1 ), 0 );
			vscode.window.showTextDocument( uri, { selection: new vscode.Range( pos, pos ) } );
		} );
	}

	dispose(): void {
		this.outputChannel.dispose();
		this.statusBarItem.dispose();
	}
}
