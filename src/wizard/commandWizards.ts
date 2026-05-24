import * as path from 'node:path';
import type { DatabaseConnection, LiquibaseProject } from '../types/index.js';
import { getProjectCommandConfig, saveProjectCommandConfig, getProjectOverrides } from '../config/configManager.js';
import type { ConnectionManager } from '../config/ConnectionManager.js';
import { pickOne, inputValue, stepTitle } from './MultiStepInput.js';

// ─── Rollback ────────────────────────────────────────────────────────────────

export async function collectRollbackArgs(
	project: LiquibaseProject,
): Promise<Record<string, string> | undefined> {
	const base = `Rollback — ${project.name}`;
	const saved = getProjectCommandConfig( project.rootPath );

	let mode: 'tag' | 'count' | undefined;
	let step = 0;

	while ( step < 2 ) {
		if ( step === 0 ) {
			const result = await pickOne(
				[
					{ label: '$(tag) By Tag', description: 'Roll back to a named tag', value: 'tag' },
					{ label: '$(list-ordered) By Count', description: 'Roll back the last N changesets', value: 'count' },
				],
				{ title: stepTitle( base, 1, 2 ), placeholder: 'Choose rollback mode' },
			);
			if ( result.kind !== 'value' ) return undefined;
			mode = result.value.value as 'tag' | 'count';
			step = 1;
		} else if ( mode === 'tag' ) {
			const result = await inputValue( {
				title: stepTitle( base, 2, 2 ),
				prompt: 'Tag to roll back to',
				value: saved.rollbackTag ?? '',
				placeholder: 'e.g. v1.0.0',
				validate: v => ( v.trim() ? undefined : 'Tag cannot be empty' ),
				showBack: true,
			} );
			if ( result.kind === 'cancel' ) return undefined;
			if ( result.kind === 'back' ) { step = 0; continue; }
			await saveProjectCommandConfig( project.rootPath, { rollbackTag: result.value.trim() } );
			return { rollbackTag: result.value.trim() };
		} else {
			const result = await inputValue( {
				title: stepTitle( base, 2, 2 ),
				prompt: 'Number of changesets to roll back',
				placeholder: '1',
				validate: v => ( /^\d+$/.test( v.trim() ) ? undefined : 'Must be a positive integer' ),
				showBack: true,
			} );
			if ( result.kind === 'cancel' ) return undefined;
			if ( result.kind === 'back' ) { step = 0; continue; }
			return { rollbackCount: result.value.trim() };
		}
	}
	return undefined;
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export async function collectDiffArgs(
	project: LiquibaseProject,
): Promise<{ referenceUrl: string } | undefined> {
	const saved = getProjectCommandConfig( project.rootPath );

	const result = await inputValue( {
		title: `Diff — ${project.name}`,
		prompt: 'Reference database URL',
		value: saved.referenceUrl ?? '',
		placeholder: 'jdbc:postgresql://localhost:5432/reference_db',
		validate: v => ( v.trim() ? undefined : 'Reference URL cannot be empty' ),
	} );
	if ( result.kind !== 'value' ) return undefined;

	const url = result.value.trim();
	await saveProjectCommandConfig( project.rootPath, { referenceUrl: url } );
	return { referenceUrl: url };
}

// ─── Generate Changelog ───────────────────────────────────────────────────────

type GenerationMode = 'database' | 'entities';

interface GenerateChangelogArgs {
	commandTitle: string;
	extraArgs: Record<string, string>;
}

export async function collectGenerateChangelogArgs(
	project: LiquibaseProject,
): Promise<GenerateChangelogArgs | undefined> {
	const base = `Generate Changelog — ${project.name}`;
	const saved = getProjectCommandConfig( project.rootPath );

	type ModeItem = { label: string; description: string; value: GenerationMode };
	let mode: GenerationMode | undefined;
	let outputFile: string | undefined;
	let step = 0;
	const totalSteps = 3; // worst case (entities needs 3)

	while ( step < totalSteps ) {
		if ( step === 0 ) {
			const result = await pickOne<ModeItem>(
				[
					{ label: '$(database) From database schema', description: 'Reverse-engineer the live database', value: 'database' },
					{ label: '$(symbol-class) From Spring JPA entities', description: 'Use Hibernate/Spring as reference model', value: 'entities' },
				],
				{ title: stepTitle( base, 1, mode === 'entities' ? totalSteps : 2 ), placeholder: 'Choose generation source' },
			);
			if ( result.kind !== 'value' ) return undefined;
			mode = result.value.value;
			step = 1;
		} else if ( step === 1 ) {
			const result = await inputValue( {
				title: stepTitle( base, 2, mode === 'entities' ? totalSteps : 2 ),
				prompt: 'Output changelog file path',
				value: outputFile ?? buildDefaultOutputFile( project, saved.generateChangelogDir, mode! ),
				placeholder: 'src/main/resources/db/changelog/migrations/2026-05-20.yaml',
				validate: v => ( v.trim() ? undefined : 'Output file is required' ),
				showBack: true,
			} );
			if ( result.kind === 'cancel' ) return undefined;
			if ( result.kind === 'back' ) { step = 0; continue; }
			outputFile = result.value.trim();
			await saveProjectCommandConfig( project.rootPath, { generateChangelogDir: path.dirname( outputFile ) } );

			if ( mode === 'database' ) {
				return { commandTitle: 'Generate Changelog', extraArgs: { changelogFile: outputFile } };
			}
			step = 2;
		} else {
			// step 2 — entities only: reference URL
			const result = await inputValue( {
				title: stepTitle( base, 3, totalSteps ),
				prompt: 'Hibernate/Spring reference URL',
				value: saved.referenceUrl ?? '',
				placeholder: 'hibernate:spring:com.example.domain?dialect=org.hibernate.dialect.PostgreSQLDialect',
				validate: v => ( v.trim() ? undefined : 'Reference URL is required' ),
				showBack: true,
			} );
			if ( result.kind === 'cancel' ) return undefined;
			if ( result.kind === 'back' ) { step = 1; continue; }
			const referenceUrl = result.value.trim();
			await saveProjectCommandConfig( project.rootPath, { referenceUrl } );
			return {
				commandTitle: 'Generate Changelog from Entities',
				extraArgs: { changelogFile: outputFile!, referenceUrl },
			};
		}
	}
	return undefined;
}

// ─── Configure Project ────────────────────────────────────────────────────────

interface ConfigureProjectArgs {
	changelogFile: string;
	propertiesFile: string;
	resolvedStrategy: string;
}

export async function collectConfigureProjectArgs(
	project: LiquibaseProject,
): Promise<ConfigureProjectArgs | undefined> {
	const base = `Configure — ${project.name}`;
	const overrides = getProjectOverrides( project.rootPath );

	let changelogFile: string | undefined;
	let propertiesFile: string | undefined;
	let step = 0;

	while ( step < 3 ) {
		if ( step === 0 ) {
			const result = await inputValue( {
				title: stepTitle( base, 1, 3 ),
				prompt: 'Changelog file (relative to project root)',
				value: changelogFile ?? ( overrides.changelogFile ?? project.changelogFile ),
				validate: v => ( v.trim() ? undefined : 'Changelog file is required' ),
			} );
			if ( result.kind !== 'value' ) return undefined;
			changelogFile = result.value.trim();
			step = 1;
		} else if ( step === 1 ) {
			const result = await inputValue( {
				title: stepTitle( base, 2, 3 ),
				prompt: 'Properties file (relative to project root)',
				value: propertiesFile ?? ( overrides.propertiesFile ?? project.propertiesFile ),
				showBack: true,
			} );
			if ( result.kind === 'cancel' ) return undefined;
			if ( result.kind === 'back' ) { step = 0; continue; }
			propertiesFile = result.value.trim();
			step = 2;
		} else {
			const strategies = [ 'auto', 'maven', 'gradle', 'cli' ];
			const current = overrides.resolvedStrategy ?? project.resolvedStrategy;
			const result = await pickOne(
				strategies.map( s => ( {
					label: s,
					description: s === current ? '(current)' : undefined,
					picked: s === current,
				} ) ),
				{ title: stepTitle( base, 3, 3 ), placeholder: 'Execution strategy', showBack: true },
			);
			if ( result.kind === 'cancel' ) return undefined;
			if ( result.kind === 'back' ) { step = 1; continue; }
			return { changelogFile: changelogFile!, propertiesFile: propertiesFile!, resolvedStrategy: result.value.label };
		}
	}
	return undefined;
}

// ─── DB Connection Picker ─────────────────────────────────────────────────────

type ConnectionChoice = DatabaseConnection | 'none';

/**
 * Shows a QuickPick of saved connections plus "Use liquibase.properties" and
 * "Add new connection…" options. Returns the chosen connection, 'none' (use
 * properties file), or undefined if the user cancelled.
 */
export async function pickConnection(
	connManager: ConnectionManager,
	title: string,
): Promise<ConnectionChoice | undefined> {
	const connections = connManager.getConnections();

	type Item = { label: string; description?: string; tag: 'none' | 'add' | 'conn'; conn?: DatabaseConnection };

	const items: Item[] = [
		{ label: '$(settings) Use liquibase.properties', description: 'Default connection from config file', tag: 'none' },
		...connections.map( c => ( {
			label: `$(database) ${c.name}`,
			description: c.url,
			tag: 'conn' as const,
			conn: c,
		} ) ),
		{ label: '$(add) Add new connection…', tag: 'add' },
	];

	const result = await pickOne( items, { title, placeholder: 'Select database connection' } );
	if ( result.kind !== 'value' ) return undefined;

	if ( result.value.tag === 'add' ) {
		return addConnectionWizard( connManager );
	}
	return result.value.tag === 'none' ? 'none' : result.value.conn!;
}

export async function addConnectionWizardExternal( connManager: ConnectionManager ): Promise<DatabaseConnection | undefined> {
	const result = await addConnectionWizard( connManager );
	return result === 'none' || result === undefined ? undefined : result;
}

async function addConnectionWizard( connManager: ConnectionManager ): Promise<ConnectionChoice | undefined> {
	const base = 'Add Connection';
	let name: string | undefined;
	let url: string | undefined;
	let username: string | undefined;
	let step = 0;

	while ( step < 4 ) {
		if ( step === 0 ) {
			const r = await inputValue( {
				title: stepTitle( base, 1, 4 ),
				prompt: 'Connection name',
				placeholder: 'e.g. auts_db@localhost',
				validate: v => ( v.trim() ? undefined : 'Name is required' ),
			} );
			if ( r.kind !== 'value' ) return undefined;
			name = r.value.trim();
			step = 1;
		} else if ( step === 1 ) {
			const r = await inputValue( {
				title: stepTitle( base, 2, 4 ),
				prompt: 'JDBC URL',
				value: url,
				placeholder: 'jdbc:postgresql://localhost:5432/mydb',
				validate: v => ( v.trim() ? undefined : 'URL is required' ),
				showBack: true,
			} );
			if ( r.kind === 'cancel' ) return undefined;
			if ( r.kind === 'back' ) { step = 0; continue; }
			url = r.value.trim();
			step = 2;
		} else if ( step === 2 ) {
			const r = await inputValue( {
				title: stepTitle( base, 3, 4 ),
				prompt: 'Username',
				value: username,
				showBack: true,
			} );
			if ( r.kind === 'cancel' ) return undefined;
			if ( r.kind === 'back' ) { step = 1; continue; }
			username = r.value.trim();
			step = 3;
		} else {
			const r = await inputValue( {
				title: stepTitle( base, 4, 4 ),
				prompt: 'Password (leave blank to skip)',
				password: true,
				showBack: true,
			} );
			if ( r.kind === 'cancel' ) return undefined;
			if ( r.kind === 'back' ) { step = 2; continue; }
			const conn: DatabaseConnection = { name: name!, url: url!, username: username! };
			await connManager.saveConnection( conn, r.value || undefined );
			return conn;
		}
	}
	return undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultOutputFile(
	project: LiquibaseProject,
	savedDir: string | undefined,
	mode: GenerationMode,
): string {
	const timestamp = new Date().toISOString().replace( /[:.]/g, '-' ).slice( 0, 19 );
	const dir = savedDir ?? path.join( project.rootPath, 'src/main/resources/db/changelog/migrations' );
	const suffix = mode === 'entities' ? 'entities' : 'generated';
	return path.join( dir, `${timestamp}-${suffix}.yaml` );
}
