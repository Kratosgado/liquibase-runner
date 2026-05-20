import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LiquibaseProject } from '../types/index.js';
import type { CommandRunner } from '../runner/CommandRunner.js';
import type { OutputManager } from '../output/OutputManager.js';
import type { LiquibaseTreeProvider } from '../tree/LiquibaseTreeProvider.js';
import type { LiquibaseTreeNode } from '../tree/LiquibaseNode.js';
import { getDiffReferenceUrl } from '../config/configManager.js';
import { pickProject, runCommand } from './shared.js';

type GenerationMode = 'database' | 'entities';

export function createGenerateChangelogCommand(
	projects: LiquibaseProject[],
	output: OutputManager,
	runnerFactory: ( p: LiquibaseProject ) => CommandRunner,
	treeProvider: LiquibaseTreeProvider,
) {
	return async ( node?: LiquibaseTreeNode ) => {
		const project = node?.project ?? ( await pickProject( projects ) );
		if ( !project ) return;

		const mode = await vscode.window.showQuickPick(
			[
				{
					label: 'From database schema',
					description: 'Generate a changelog from the live database',
					mode: 'database' as const,
				},
				{
					label: 'From Spring JPA entities',
					description: 'Use Hibernate/Spring entities as the reference model',
					mode: 'entities' as const,
				},
			],
			{ placeHolder: 'How should Liquibase generate the changelog?' },
		);
		if ( !mode ) return;

		const outputFile = await vscode.window.showInputBox( {
			prompt: 'Output changelog file',
			placeHolder: 'src/main/resources/db/changelog/migrations/2026-05-19-generated.yaml',
			value: createDefaultOutputFile( project, mode.mode ),
			validateInput: value => ( value.trim() ? null : 'Output file is required' ),
		} );
		if ( !outputFile ) return;

		const extraArgs: Record<string, string> = {
			changelogFile: outputFile.trim(),
		};

		let commandTitle = 'Generate Changelog';

		if ( mode.mode === 'entities' ) {
			const referenceUrl = await vscode.window.showInputBox( {
				prompt: 'Hibernate/Spring reference URL',
				placeHolder: 'hibernate:spring:com.example.domain?dialect=org.hibernate.dialect.PostgreSQLDialect',
				value: getDiffReferenceUrl(),
				validateInput: value => ( value.trim() ? null : 'Reference URL is required' ),
			} );
			if ( !referenceUrl ) return;
			extraArgs.referenceUrl = referenceUrl.trim();
			commandTitle = 'Generate Changelog from Entities';
		}

		await runCommand( {
			project,
			commandTitle,
			command: 'generateChangeLog',
			runner: runnerFactory( project ),
			output,
			treeProvider,
			extraArgs,
		} );
	};
}

function createDefaultOutputFile( project: LiquibaseProject, mode: GenerationMode ): string {
	const timestamp = new Date().toISOString().replace( /[:.]/g, '-' ).slice( 0, 19 );
	const baseDir = path.join( project.rootPath, 'src/main/resources/db/changelog/migrations' );
	const fileName = mode === 'entities' ? `${timestamp}-entities.yaml` : `${timestamp}-generated.yaml`;
	return path.join( baseDir, fileName );
}
