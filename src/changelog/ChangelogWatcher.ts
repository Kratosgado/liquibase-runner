import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';

export class ChangelogWatcher implements vscode.Disposable {
	private watcher: vscode.FileSystemWatcher | undefined;
	private debounceTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly project: LiquibaseProject,
		private readonly onChanged: () => void,
	) {
		const changelogDir = this.resolveChangelogDir();
		if ( changelogDir ) {
			const pattern = new vscode.RelativePattern( changelogDir, '**/*.{sql,xml,yaml,yml}' );
			this.watcher = vscode.workspace.createFileSystemWatcher( pattern );
			this.watcher.onDidCreate( this.handleChange, this );
			this.watcher.onDidChange( this.handleChange, this );
			this.watcher.onDidDelete( this.handleChange, this );
		}
	}

	private resolveChangelogDir(): string {
		const changelogFile = path.isAbsolute( this.project.changelogFile )
			? this.project.changelogFile
			: path.join( this.project.rootPath, this.project.changelogFile );
		return path.dirname( changelogFile );
	}

	private handleChange(): void {
		clearTimeout( this.debounceTimer );
		this.debounceTimer = setTimeout( () => this.onChanged(), 300 );
	}

	dispose(): void {
		clearTimeout( this.debounceTimer );
		this.watcher?.dispose();
	}
}
