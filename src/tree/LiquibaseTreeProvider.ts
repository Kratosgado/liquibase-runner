import * as vscode from 'vscode';
import type { LiquibaseProject, ChangelogFile } from '../types/index.js';
import { NodeKind } from '../types/index.js';
import type { ChangelogParser } from '../changelog/ChangelogParser.js';
import { LiquibaseTreeNode } from './LiquibaseNode.js';

export class LiquibaseTreeProvider
	implements vscode.TreeDataProvider<LiquibaseTreeNode>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<LiquibaseTreeNode | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private changelogCache = new Map<string, ChangelogFile[]>();

	constructor(
		private projects: LiquibaseProject[],
		private readonly parser: ChangelogParser,
	) {}

	getTreeItem(element: LiquibaseTreeNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: LiquibaseTreeNode): Promise<LiquibaseTreeNode[]> {
		if (!element) {
			// Root: list all detected projects
			if (this.projects.length === 0) {
				return [
					new LiquibaseTreeNode(
						NodeKind.Project,
						'No Liquibase projects found',
						vscode.TreeItemCollapsibleState.None,
					),
				];
			}
			return this.projects.map(p => LiquibaseTreeNode.project(p));
		}

		if (element.kind === NodeKind.Project && element.project) {
			const files = await this.getChangelogFiles(element.project);
			// Show a single Migrations folder node under each project
			const folder = LiquibaseTreeNode.migrationsFolder('Changelogs', element.project);
			// Attach changelog files as children by storing on the folder node
			(folder as LiquibaseTreeNode & { _files: ChangelogFile[] })._files = files;
			return [folder];
		}

		if (element.kind === NodeKind.MigrationsFolder && element.project) {
			const files = await this.getChangelogFiles(element.project);
			return files.map(f => LiquibaseTreeNode.changelogFile(f, element.project!));
		}

		if (element.kind === NodeKind.ChangelogFile && element.changelogFile && element.project) {
			return element.changelogFile.changesets.map(cs =>
				LiquibaseTreeNode.changeset(cs, element.changelogFile!, element.project!),
			);
		}

		return [];
	}

	private async getChangelogFiles(project: LiquibaseProject): Promise<ChangelogFile[]> {
		const cached = this.changelogCache.get(project.id);
		if (cached) return cached;
		const files = await this.parser.parseAll(project);
		this.changelogCache.set(project.id, files);
		return files;
	}

	refresh(element?: LiquibaseTreeNode): void {
		if (element?.project) {
			this.changelogCache.delete(element.project.id);
		} else {
			this.changelogCache.clear();
		}
		this._onDidChangeTreeData.fire(element);
	}

	updateProjects(projects: LiquibaseProject[]): void {
		this.projects = projects;
		this.changelogCache.clear();
		this._onDidChangeTreeData.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
