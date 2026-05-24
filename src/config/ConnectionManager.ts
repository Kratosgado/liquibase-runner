import * as vscode from 'vscode';
import type { DatabaseConnection } from '../types/index.js';

const SECTION = 'liquibaseRunner';
const CONNECTIONS_KEY = 'connections';

export class ConnectionManager {
	constructor( private readonly secrets: vscode.SecretStorage ) {}

	getConnections(): DatabaseConnection[] {
		return vscode.workspace.getConfiguration( SECTION )
			.get<DatabaseConnection[]>( CONNECTIONS_KEY, [] );
	}

	async saveConnection( conn: DatabaseConnection, password?: string ): Promise<void> {
		const cfg = vscode.workspace.getConfiguration( SECTION );
		const list = this.getConnections();
		const idx = list.findIndex( c => c.name === conn.name );
		if ( idx >= 0 ) list[ idx ] = conn;
		else list.push( conn );
		await cfg.update( CONNECTIONS_KEY, list, vscode.ConfigurationTarget.Global );
		if ( password !== undefined ) {
			await this.secrets.store( `${SECTION}.pw.${conn.name}`, password );
		}
	}

	async deleteConnection( name: string ): Promise<void> {
		const cfg = vscode.workspace.getConfiguration( SECTION );
		const list = this.getConnections().filter( c => c.name !== name );
		await cfg.update( CONNECTIONS_KEY, list, vscode.ConfigurationTarget.Global );
		await this.secrets.delete( `${SECTION}.pw.${name}` );
	}

	async getPassword( name: string ): Promise<string | undefined> {
		return this.secrets.get( `${SECTION}.pw.${name}` );
	}

	async getConnectionArgs( name: string ): Promise<Record<string, string>> {
		const conn = this.getConnections().find( c => c.name === name );
		if ( !conn ) return {};
		const password = await this.getPassword( name );
		const args: Record<string, string> = { url: conn.url, username: conn.username };
		if ( password ) args.password = password;
		return args;
	}

	async getReferenceArgs( name: string ): Promise<Record<string, string>> {
		const conn = this.getConnections().find( c => c.name === name );
		if ( !conn ) return {};
		const password = await this.getPassword( name );
		const args: Record<string, string> = {
			referenceUrl: conn.url,
			referenceUsername: conn.username,
		};
		if ( password ) args.referencePassword = password;
		return args;
	}
}
