import * as vscode from 'vscode';
import { NodeKind } from '../types/index.js';
import type { LiquibaseProject, ChangelogFile, Changeset } from '../types/index.js';

const ICON_MAP: Record<NodeKind, string> = {
	[NodeKind.Project]: 'database',
	[NodeKind.MigrationsFolder]: 'folder',
	[NodeKind.ChangelogFile]: 'file-code',
	[NodeKind.Changeset]: 'git-commit',
};

export class LiquibaseTreeNode extends vscode.TreeItem {
	constructor(
		public readonly kind: NodeKind,
		label: string,
		collapsible: vscode.TreeItemCollapsibleState,
		public readonly project?: LiquibaseProject,
		public readonly changelogFile?: ChangelogFile,
		public readonly changeset?: Changeset,
	) {
		super(label, collapsible);
		this.contextValue = kind;
		this.iconPath = new vscode.ThemeIcon(ICON_MAP[kind]);

		if (kind === NodeKind.Changeset && changeset) {
			this.description = `${changeset.author}:${changeset.id}`;
			this.command = {
				command: 'liquibaseRunner.openChangeset',
				title: 'Open File',
				arguments: [changeset],
			};
		}

		if (kind === NodeKind.Project && project) {
			this.description = project.resolvedStrategy;
			this.tooltip = project.rootPath;
		}

		if (kind === NodeKind.ChangelogFile && changelogFile) {
			this.tooltip = changelogFile.absolutePath;
			this.resourceUri = vscode.Uri.file(changelogFile.absolutePath);
		}
	}

	static project(p: LiquibaseProject): LiquibaseTreeNode {
		return new LiquibaseTreeNode(
			NodeKind.Project,
			p.name,
			vscode.TreeItemCollapsibleState.Expanded,
			p,
		);
	}

	static migrationsFolder(label: string, project: LiquibaseProject): LiquibaseTreeNode {
		return new LiquibaseTreeNode(
			NodeKind.MigrationsFolder,
			label,
			vscode.TreeItemCollapsibleState.Expanded,
			project,
		);
	}

	static changelogFile(file: ChangelogFile, project: LiquibaseProject): LiquibaseTreeNode {
		const name = file.relativePath.split('/').pop() ?? file.relativePath;
		const collapsible = file.changesets.length > 0
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;
		return new LiquibaseTreeNode(
			NodeKind.ChangelogFile,
			name,
			collapsible,
			project,
			file,
		);
	}

	static changeset(cs: Changeset, file: ChangelogFile, project: LiquibaseProject): LiquibaseTreeNode {
		return new LiquibaseTreeNode(
			NodeKind.Changeset,
			`${cs.author}:${cs.id}`,
			vscode.TreeItemCollapsibleState.None,
			project,
			file,
			cs,
		);
	}
}
