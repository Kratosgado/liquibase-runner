import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Changeset, ChangelogFile, LiquibaseProject } from '../types/index.js';

export class ChangelogParser {
	parseFormattedSql( absolutePath: string ): Changeset[] {
		if ( !fs.existsSync( absolutePath ) ) return [];
		const lines = fs.readFileSync( absolutePath, 'utf-8' ).split( '\n' );
		const changesets: Changeset[] = [];
		for ( let i = 0; i < lines.length; i++ ) {
			const match = lines[ i ].match( /^--\s*changeset\s+(\S+):(\S+)/ );
			if ( match ) {
				changesets.push( {
					author: match[ 1 ],
					id: match[ 2 ],
					filePath: absolutePath,
					lineNumber: i + 1,
				} );
			}
		}
		return changesets;
	}

	parseXmlChangelog( absolutePath: string ): Changeset[] {
		if ( !fs.existsSync( absolutePath ) ) return [];
		const content = fs.readFileSync( absolutePath, 'utf-8' );
		const changesets: Changeset[] = [];
		const regex = /<changeSet[^>]+id="([^"]+)"[^>]+author="([^"]+)"/g;
		let match: RegExpExecArray | null;
		while ( ( match = regex.exec( content ) ) !== null ) {
			const upToMatch = content.slice( 0, match.index );
			const lineNumber = ( upToMatch.match( /\n/g ) ?? [] ).length + 1;
			changesets.push( {
				id: match[ 1 ],
				author: match[ 2 ],
				filePath: absolutePath,
				lineNumber,
			} );
		}
		return changesets;
	}

	private resolveMigrationFolders( project: LiquibaseProject, absolutePath: string ): string[] {
		if ( !fs.existsSync( absolutePath ) ) return [];
		const content = fs.readFileSync( absolutePath, 'utf-8' );
		const masterDir = path.dirname( absolutePath );
		const folders = new Set<string>( this.getConfiguredMigrationFolders( content, masterDir ) );

		if ( folders.size === 0 ) {
			for ( const candidate of this.getFallbackMigrationFolders( project, masterDir ) ) {
				if ( fs.existsSync( candidate ) && fs.statSync( candidate ).isDirectory() ) {
					folders.add( candidate );
				}
			}
		}

		return [ ...folders ];
	}

	private getConfiguredMigrationFolders( content: string, masterDir: string ): string[] {
		const folders = new Set<string>();
		for ( const match of content.matchAll( /path:\s*['"]?([^'"\n\r]+)['"]?/g ) ) {
			const resolved = path.resolve( masterDir, match[ 1 ].trim() );
			if ( fs.existsSync( resolved ) && fs.statSync( resolved ).isDirectory() ) {
				folders.add( resolved );
			}
		}

		for ( const match of content.matchAll( /includeAll[^>]*path="([^"]+)"/g ) ) {
			const resolved = path.resolve( masterDir, match[ 1 ].trim() );
			if ( fs.existsSync( resolved ) && fs.statSync( resolved ).isDirectory() ) {
				folders.add( resolved );
			}
		}

		return [ ...folders ];
	}

	private getFallbackMigrationFolders( project: LiquibaseProject, masterDir: string ): string[] {
		return [
			path.join( masterDir, 'migrations' ),
			path.join( masterDir, 'migration' ),
			path.join( masterDir, 'changes' ),
			path.join( project.rootPath, 'src/main/resources/db/changelog/migrations' ),
			path.join( project.rootPath, 'src/main/resources/db/changelog/changes' ),
			path.join( project.rootPath, 'db/changelog/migrations' ),
			path.join( project.rootPath, 'db/changelog' ),
			path.join( project.rootPath, 'migrations' ),
		];
	}

	private collectFiles( directory: string ): string[] {
		const files: string[] = [];
		for ( const entry of fs.readdirSync( directory, { withFileTypes: true } ) ) {
			const absolute = path.join( directory, entry.name );
			if ( entry.isDirectory() ) {
				files.push( ...this.collectFiles( absolute ) );
				continue;
			}
			if ( /\.(sql|xml|yaml|yml)$/i.test( entry.name ) ) {
				files.push( absolute );
			}
		}
		return files;
	}

	async parseAll( project: LiquibaseProject ): Promise<ChangelogFile[]> {
		const results: ChangelogFile[] = [];

		const masterAbsolute = path.isAbsolute( project.changelogFile )
			? project.changelogFile
			: path.join( project.rootPath, project.changelogFile );

		if ( !fs.existsSync( masterAbsolute ) ) return results;

		// Add the master file itself (without changesets — it's an orchestrator)
		results.push( {
			absolutePath: masterAbsolute,
			relativePath: project.changelogFile,
			changesets: [],
		} );

		const migrationFolders = this.resolveMigrationFolders( project, masterAbsolute );
		const files = [ ...new Set( migrationFolders.flatMap( folder => this.collectFiles( folder ) ) ) ].sort( ( a, b ) =>
			a.localeCompare( b ),
		);

		for ( const absoluteFilePath of files ) {
			const relativePath = path.relative( project.rootPath, absoluteFilePath );
			let changesets: Changeset[] = [];

			if ( absoluteFilePath.endsWith( '.sql' ) ) {
				changesets = this.parseFormattedSql( absoluteFilePath );
			} else if ( absoluteFilePath.endsWith( '.xml' ) ) {
				changesets = this.parseXmlChangelog( absoluteFilePath );
			}
			// YAML individual changesets are less common; skip for now

			results.push( { absolutePath: absoluteFilePath, relativePath, changesets } );
		}

		return results;
	}
}
