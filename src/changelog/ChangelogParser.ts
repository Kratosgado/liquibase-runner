import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Changeset, ChangelogFile, LiquibaseProject } from '../types/index.js';

export class ChangelogParser {
	parseFormattedSql(absolutePath: string): Changeset[] {
		if (!fs.existsSync(absolutePath)) return [];
		const lines = fs.readFileSync(absolutePath, 'utf-8').split('\n');
		const changesets: Changeset[] = [];
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(/^--\s*changeset\s+(\S+):(\S+)/);
			if (match) {
				changesets.push({
					author: match[1],
					id: match[2],
					filePath: absolutePath,
					lineNumber: i + 1,
				});
			}
		}
		return changesets;
	}

	parseXmlChangelog(absolutePath: string): Changeset[] {
		if (!fs.existsSync(absolutePath)) return [];
		const content = fs.readFileSync(absolutePath, 'utf-8');
		const changesets: Changeset[] = [];
		const regex = /<changeSet[^>]+id="([^"]+)"[^>]+author="([^"]+)"/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(content)) !== null) {
			const upToMatch = content.slice(0, match.index);
			const lineNumber = (upToMatch.match(/\n/g) ?? []).length + 1;
			changesets.push({
				id: match[1],
				author: match[2],
				filePath: absolutePath,
				lineNumber,
			});
		}
		return changesets;
	}

	private resolveMasterFolder(absolutePath: string): string | undefined {
		if (!fs.existsSync(absolutePath)) return undefined;
		const content = fs.readFileSync(absolutePath, 'utf-8');

		// YAML includeAll: path: <value>
		const pathMatch = content.match(/path:\s*['"]?([^'"\n\r]+)['"]?/);
		if (pathMatch) {
			const dir = path.dirname(absolutePath);
			const resolved = path.resolve(dir, pathMatch[1].trim());
			if (fs.existsSync(resolved)) return resolved;
		}

		// XML includeAll path attribute
		const xmlMatch = content.match(/includeAll\s+path="([^"]+)"/);
		if (xmlMatch) {
			const dir = path.dirname(absolutePath);
			const resolved = path.resolve(dir, xmlMatch[1].trim());
			if (fs.existsSync(resolved)) return resolved;
		}

		return undefined;
	}

	async parseAll(project: LiquibaseProject): Promise<ChangelogFile[]> {
		const results: ChangelogFile[] = [];

		const masterAbsolute = path.isAbsolute(project.changelogFile)
			? project.changelogFile
			: path.join(project.rootPath, project.changelogFile);

		if (!fs.existsSync(masterAbsolute)) return results;

		// Add the master file itself (without changesets — it's an orchestrator)
		results.push({
			absolutePath: masterAbsolute,
			relativePath: project.changelogFile,
			changesets: [],
		});

		const migrationsFolder = this.resolveMasterFolder(masterAbsolute);
		if (!migrationsFolder || !fs.existsSync(migrationsFolder)) return results;

		const files = fs
			.readdirSync(migrationsFolder)
			.filter(f => /\.(sql|xml|yaml|yml)$/.test(f))
			.sort() // Alphabetical matches Liquibase's includeAll ordering
			.map(f => path.join(migrationsFolder, f));

		for (const absoluteFilePath of files) {
			const relativePath = path.relative(project.rootPath, absoluteFilePath);
			let changesets: Changeset[] = [];

			if (absoluteFilePath.endsWith('.sql')) {
				changesets = this.parseFormattedSql(absoluteFilePath);
			} else if (absoluteFilePath.endsWith('.xml')) {
				changesets = this.parseXmlChangelog(absoluteFilePath);
			}
			// YAML individual changesets are less common; skip for now

			results.push({ absolutePath: absoluteFilePath, relativePath, changesets });
		}

		return results;
	}
}
