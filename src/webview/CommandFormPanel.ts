import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { DatabaseConnection, LiquibaseProject } from '../types/index.js';
import type { ConnectionManager } from '../config/ConnectionManager.js';
import { addConnectionWizardExternal } from '../wizard/commandWizards.js';

export type FormType = 'update' | 'diff' | 'generateChangelog';

export interface FormSubmitResult {
	action: 'update' | 'updateSql' | 'diff' | 'generate';
	changelogFile?: string;
	connectionName?: string;
	referenceConnectionName?: string;
	referenceUrl?: string;
	outputFile?: string;
	generationMode?: 'database' | 'entities';
	contexts?: string;
	labels?: string;
	logLevel?: string;
}

export class CommandFormPanel {
	static async show( opts: {
		context: vscode.ExtensionContext;
		project: LiquibaseProject;
		connManager: ConnectionManager;
		formType: FormType;
		savedValues?: Partial<FormSubmitResult>;
	} ): Promise<FormSubmitResult | undefined> {
		const { context, project, connManager, formType, savedValues = {} } = opts;

		const panel = vscode.window.createWebviewPanel(
			`liquibaseRunner.form.${formType}`,
			formTitle( formType, project.name ),
			vscode.ViewColumn.Active,
			{ enableScripts: true, retainContextWhenHidden: false },
		);

		return new Promise( resolve => {
			let settled = false;
			const done = ( result: FormSubmitResult | undefined ) => {
				if ( settled ) return;
				settled = true;
				panel.dispose();
				resolve( result );
			};

			panel.onDidDispose( () => done( undefined ) );

			panel.webview.onDidReceiveMessage( async ( msg: WebviewMessage ) => {
				if ( msg.type === 'cancel' ) {
					done( undefined );
				} else if ( msg.type === 'submit' ) {
					done( msg as FormSubmitResult & { type: string } );
				} else if ( msg.type === 'browseFile' ) {
					const uris = await vscode.window.showOpenDialog( {
						canSelectFiles: true,
						canSelectFolders: false,
						canSelectMany: false,
						defaultUri: vscode.Uri.file( project.rootPath ),
						filters: { 'Changelog files': [ 'yaml', 'yml', 'xml', 'json', 'sql' ], 'All files': [ '*' ] },
					} );
					if ( uris?.[0] ) {
						panel.webview.postMessage( {
							type: 'fileSelected',
							field: msg.field,
							path: uris[0].fsPath,
						} );
					}
				} else if ( msg.type === 'browseFolder' ) {
					const uris = await vscode.window.showOpenDialog( {
						canSelectFiles: false,
						canSelectFolders: true,
						canSelectMany: false,
						defaultUri: vscode.Uri.file( project.rootPath ),
					} );
					if ( uris?.[0] ) {
						panel.webview.postMessage( {
							type: 'fileSelected',
							field: msg.field,
							path: uris[0].fsPath,
						} );
					}
				} else if ( msg.type === 'addConnection' ) {
					const conn = await addConnectionWizardExternal( connManager );
					if ( conn ) {
						panel.webview.postMessage( { type: 'connectionAdded', connection: conn } );
					}
				}
			} );

			panel.webview.html = buildHtml(
				panel.webview,
				formType,
				project,
				connManager.getConnections(),
				savedValues,
			);
		} );
	}
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WebviewMessage =
	| { type: 'cancel' }
	| { type: 'submit'; action: string; changelogFile?: string; connectionName?: string; referenceConnectionName?: string; referenceUrl?: string; outputFile?: string; generationMode?: string; contexts?: string; labels?: string; logLevel?: string }
	| { type: 'browseFile'; field: string }
	| { type: 'browseFolder'; field: string }
	| { type: 'addConnection' };

// ─── HTML generation ──────────────────────────────────────────────────────────

function buildHtml(
	webview: vscode.Webview,
	formType: FormType,
	project: LiquibaseProject,
	connections: DatabaseConnection[],
	saved: Partial<FormSubmitResult>,
): string {
	const nonce = crypto.randomBytes( 16 ).toString( 'hex' );
	const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

	const { heading, description, formHtml, submitJs } = formParts( formType, project, connections, saved );

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${heading}</title>
<style nonce="${nonce}">${styles()}</style>
</head>
<body>
<h2>${heading}</h2>
${description ? `<p class="desc">${description}</p>` : ''}
${formHtml}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
${sharedJs()}
${submitJs}
window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'fileSelected') {
    const el = document.getElementById(m.field);
    if (el) el.value = m.path;
  } else if (m.type === 'connectionAdded') {
    addConnToDropdowns(m.connection);
  }
});
</script>
</body>
</html>`;
}

function formParts( formType: FormType, project: LiquibaseProject, connections: DatabaseConnection[], saved: Partial<FormSubmitResult> ) {
	if ( formType === 'update' ) return updateForm( project, connections, saved );
	if ( formType === 'diff' ) return diffForm( project, connections, saved );
	return generateForm( project, connections, saved );
}

function formTitle( t: FormType, name: string ): string {
	if ( t === 'update' ) return `Liquibase Update — ${name}`;
	if ( t === 'diff' ) return `Diff Database Changelog — ${name}`;
	return `Generate Changelog — ${name}`;
}

// ─── Update form ──────────────────────────────────────────────────────────────

function updateForm( project: LiquibaseProject, conns: DatabaseConnection[], saved: Partial<FormSubmitResult> ) {
	const changelogFile = h( saved.changelogFile ?? project.changelogFile );
	const contexts = h( saved.contexts ?? '' );
	const labels = h( saved.labels ?? '' );
	const logLevel = saved.logLevel ?? '';

	return {
		heading: 'Liquibase Update',
		description: `Project: <strong>${h( project.name )}</strong>`,
		formHtml: `
<div class="field">
  <label>Root changelog file</label>
  <div class="row">
    <input type="text" id="changelogFile" value="${changelogFile}" />
    <button type="button" id="btnBrowseChangelog">Browse…</button>
  </div>
</div>
<div class="field">
  <label>DB connection</label>
  <div class="row">
    ${connSelect( 'connection', conns, saved.connectionName, '— use liquibase.properties —' )}
    <button type="button" id="btnAddConn">+</button>
  </div>
</div>
<div class="field">
  <label>Contexts</label>
  <input type="text" id="contexts" value="${contexts}" placeholder="e.g. dev,test" />
</div>
<div class="field">
  <label>Labels</label>
  <input type="text" id="labels" value="${labels}" placeholder="e.g. feature-1" />
</div>
<div class="field">
  <label>Log level</label>
  ${logLevelSelect( logLevel )}
</div>
<div class="actions">
  <button type="button" class="primary" id="btnUpdate">Update</button>
  <button type="button" id="btnUpdateSql">Show SQL</button>
  <button type="button" id="btnCancel">Cancel</button>
</div>`,
		submitJs: `
function submitForm(action) {
  vscode.postMessage({
    type: 'submit',
    action,
    changelogFile: val('changelogFile'),
    connectionName: val('connection') || null,
    contexts: val('contexts') || null,
    labels: val('labels') || null,
    logLevel: val('logLevel') || null,
  });
}
document.getElementById('btnBrowseChangelog').addEventListener('click', () => browse('changelogFile'));
document.getElementById('btnAddConn').addEventListener('click', addConn);
document.getElementById('btnUpdate').addEventListener('click', () => submitForm('update'));
document.getElementById('btnUpdateSql').addEventListener('click', () => submitForm('updateSql'));
document.getElementById('btnCancel').addEventListener('click', cancel);`,
	};
}

// ─── Diff form ────────────────────────────────────────────────────────────────

function diffForm( project: LiquibaseProject, conns: DatabaseConnection[], saved: Partial<FormSubmitResult> ) {
	const refUrl = h( saved.referenceUrl ?? '' );

	return {
		heading: 'Diff Database Changelog',
		description: `Compare a reference source against <strong>${h( project.name )}</strong>'s configured database.`,
		formHtml: `
<div class="field">
  <label>Source (Reference)</label>
  <div class="row">
    ${connSelect( 'refConnection', conns, saved.referenceConnectionName, '— enter URL manually —' )}
    <button type="button" id="btnAddConn">+</button>
  </div>
</div>
<div class="field" id="urlField">
  <label>Reference URL <span class="hint">(when no connection selected above)</span></label>
  <input type="text" id="referenceUrl" value="${refUrl}" placeholder="jdbc:postgresql://localhost:5432/reference_db" />
</div>
<div class="field">
  <label>Save diff as changelog <span class="hint">(optional — leave blank to preview only)</span></label>
  <div class="row">
    <input type="text" id="outputDir" placeholder="src/main/resources/db/changelog/changes" />
    <button type="button" id="btnBrowseDir">Browse…</button>
  </div>
  <div class="row file-row">
    <input type="text" id="outputName" placeholder="diff_output" />
    <select id="outputFormat">
      <option value="yaml">YAML (.yaml)</option>
      <option value="xml">XML (.xml)</option>
      <option value="json">JSON (.json)</option>
      <option value="sql">SQL (.sql)</option>
    </select>
  </div>
  <div id="dialectSection" class="hidden">
    <select id="outputDialect">${dialectOptions()}</select>
  </div>
  <p id="filePreview" class="hint file-preview"></p>
</div>
<div class="actions">
  <button type="button" class="primary" id="btnDiff">Run Diff</button>
  <button type="button" id="btnCancel">Cancel</button>
</div>`,
		submitJs: `
function buildOutputFile() {
  var dir = val('outputDir');
  var name = val('outputName');
  var fmt = document.getElementById('outputFormat').value;
  if (!dir || !name) return null;
  var dialect = fmt === 'sql' ? ('.' + document.getElementById('outputDialect').value) : '';
  return dir.replace(/\\/+$/, '') + '/' + name + dialect + '.' + fmt;
}
function updateFilePreview() {
  var f = buildOutputFile();
  var el = document.getElementById('filePreview');
  el.textContent = f ? 'Output: ' + f : '';
  document.getElementById('dialectSection').classList.toggle('hidden', document.getElementById('outputFormat').value !== 'sql');
}
function submitForm(action) {
  const connName = val('refConnection');
  vscode.postMessage({
    type: 'submit',
    action,
    referenceConnectionName: connName || null,
    referenceUrl: connName ? null : val('referenceUrl'),
    outputFile: buildOutputFile(),
  });
}
document.getElementById('refConnection').addEventListener('change', function() {
  document.getElementById('urlField').classList.toggle('hidden', !!this.value);
});
(function() {
  const c = document.getElementById('refConnection');
  if (c && c.value) document.getElementById('urlField').classList.add('hidden');
})();
document.getElementById('outputFormat').addEventListener('change', updateFilePreview);
document.getElementById('outputDialect').addEventListener('change', updateFilePreview);
document.getElementById('outputDir').addEventListener('input', updateFilePreview);
document.getElementById('outputName').addEventListener('input', updateFilePreview);
document.getElementById('btnBrowseDir').addEventListener('click', () => browseFolder('outputDir'));
document.getElementById('btnAddConn').addEventListener('click', addConn);
document.getElementById('btnDiff').addEventListener('click', () => submitForm('diff'));
document.getElementById('btnCancel').addEventListener('click', cancel);
updateFilePreview();`,
	};
}

// ─── Generate Changelog form ──────────────────────────────────────────────────

function generateForm( project: LiquibaseProject, conns: DatabaseConnection[], saved: Partial<FormSubmitResult> ) {
	const refUrl = h( saved.referenceUrl ?? '' );
	const mode = saved.generationMode ?? 'database';
	const contexts = h( saved.contexts ?? '' );
	const labels = h( saved.labels ?? '' );

	// Parse saved outputFile back into dir/name/format/dialect for pre-filling
	let savedDir = '';
	let savedName = '';
	let savedFormat = 'yaml';
	let savedDialect = 'postgresql';
	if ( saved.outputFile ) {
		const lastSlash = saved.outputFile.lastIndexOf( '/' );
		savedDir = lastSlash >= 0 ? saved.outputFile.slice( 0, lastSlash ) : '';
		const basename = lastSlash >= 0 ? saved.outputFile.slice( lastSlash + 1 ) : saved.outputFile;
		const parts = basename.split( '.' );
		if ( parts.length >= 3 && parts.at( -1 ) === 'sql' ) {
			savedFormat = 'sql';
			savedDialect = parts.at( -2 ) ?? 'postgresql';
			savedName = parts.slice( 0, -2 ).join( '.' );
		} else if ( parts.length >= 2 ) {
			savedFormat = parts.at( -1 ) ?? 'yaml';
			savedName = parts.slice( 0, -1 ).join( '.' );
		} else {
			savedName = basename;
		}
	}

	return {
		heading: 'Generate Changelog',
		description: `Project: <strong>${h( project.name )}</strong>`,
		formHtml: `
<div class="field">
  <label>Source type</label>
  <div class="radio-group">
    <label><input type="radio" name="mode" value="database" ${mode === 'database' ? 'checked' : ''}> Database schema</label>
    <label><input type="radio" name="mode" value="entities" ${mode === 'entities' ? 'checked' : ''}> Spring JPA entities</label>
  </div>
</div>
<div id="connSection" class="field">
  <label>DB connection</label>
  <div class="row">
    ${connSelect( 'connection', conns, saved.connectionName, '— use liquibase.properties —' )}
    <button type="button" id="btnAddConn">+</button>
  </div>
</div>
<div id="refUrlSection" class="field hidden">
  <label>Hibernate/Spring reference URL</label>
  <input type="text" id="referenceUrl" value="${refUrl}" placeholder="hibernate:spring:com.example.domain?dialect=PostgreSQLDialect" />
</div>
<div class="field">
  <label>Output directory</label>
  <div class="row">
    <input type="text" id="outputDir" value="${h( savedDir )}" placeholder="src/main/resources/db/changelog/migrations" />
    <button type="button" id="btnBrowseDir">Browse…</button>
  </div>
</div>
<div class="field">
  <label>File name <span class="hint">(without extension)</span></label>
  <input type="text" id="outputName" value="${h( savedName )}" placeholder="YYYYMMDD_changes" />
</div>
<div class="field">
  <label>Format</label>
  <div class="row file-row">
    <select id="outputFormat">
      <option value="yaml"${savedFormat === 'yaml' ? ' selected' : ''}>YAML (.yaml)</option>
      <option value="xml"${savedFormat === 'xml' ? ' selected' : ''}>XML (.xml)</option>
      <option value="json"${savedFormat === 'json' ? ' selected' : ''}>JSON (.json)</option>
      <option value="sql"${savedFormat === 'sql' ? ' selected' : ''}>SQL (.sql)</option>
    </select>
  </div>
  <div id="dialectSection"${savedFormat === 'sql' ? '' : ' class="hidden"'}>
    <select id="outputDialect">${dialectOptions( savedDialect )}</select>
  </div>
  <p id="filePreview" class="hint file-preview"></p>
</div>
<div class="field">
  <label>Contexts <span class="hint">(comma-separated, optional)</span></label>
  <input type="text" id="contexts" value="${contexts}" placeholder="e.g. dev,test" />
</div>
<div class="field">
  <label>Labels <span class="hint">(comma-separated, optional)</span></label>
  <input type="text" id="labels" value="${labels}" placeholder="e.g. feature-1" />
</div>
<div class="actions">
  <button type="button" class="primary" id="btnGenerate">Generate</button>
  <button type="button" id="btnCancel">Cancel</button>
</div>`,
		submitJs: `
function buildOutputFile() {
  var dir = val('outputDir');
  var name = val('outputName');
  var fmt = document.getElementById('outputFormat').value;
  if (!dir || !name) return '';
  var dialect = fmt === 'sql' ? ('.' + document.getElementById('outputDialect').value) : '';
  return dir.replace(/\\/+$/, '') + '/' + name + dialect + '.' + fmt;
}
function updateFilePreview() {
  var f = buildOutputFile();
  document.getElementById('filePreview').textContent = f ? 'Output: ' + f : '';
  document.getElementById('dialectSection').classList.toggle('hidden', document.getElementById('outputFormat').value !== 'sql');
}
function onModeChange() {
  const mode = document.querySelector('input[name="mode"]:checked')?.value;
  document.getElementById('connSection').classList.toggle('hidden', mode !== 'database');
  document.getElementById('refUrlSection').classList.toggle('hidden', mode !== 'entities');
}
function submitForm(action) {
  const f = buildOutputFile();
  if (!f) {
    alert('Output directory and file name are required.');
    return;
  }
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'database';
  vscode.postMessage({
    type: 'submit',
    action,
    generationMode: mode,
    connectionName: mode === 'database' ? (val('connection') || null) : null,
    referenceUrl: mode === 'entities' ? val('referenceUrl') : null,
    outputFile: f,
    contexts: val('contexts') || null,
    labels: val('labels') || null,
  });
}
document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', onModeChange));
document.getElementById('outputFormat').addEventListener('change', updateFilePreview);
document.getElementById('outputDialect').addEventListener('change', updateFilePreview);
document.getElementById('outputDir').addEventListener('input', updateFilePreview);
document.getElementById('outputName').addEventListener('input', updateFilePreview);
document.getElementById('btnAddConn').addEventListener('click', addConn);
document.getElementById('btnBrowseDir').addEventListener('click', () => browseFolder('outputDir'));
document.getElementById('btnGenerate').addEventListener('click', () => submitForm('generate'));
document.getElementById('btnCancel').addEventListener('click', cancel);
onModeChange();
updateFilePreview();`,
	};
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function dialectOptions( selected = 'postgresql' ): string {
	const dialects = [
		[ 'postgresql', 'PostgreSQL' ],
		[ 'mysql', 'MySQL' ],
		[ 'mariadb', 'MariaDB' ],
		[ 'oracle', 'Oracle' ],
		[ 'mssql', 'SQL Server' ],
		[ 'db2', 'DB2' ],
		[ 'sqlite', 'SQLite' ],
		[ 'h2', 'H2' ],
	];
	return dialects.map( ( [ val, label ] ) => `<option value="${val}"${selected === val ? ' selected' : ''}>${label}</option>` ).join( '' );
}

function connSelect( id: string, conns: DatabaseConnection[], selected: string | undefined, placeholder: string ): string {
	const opts = conns.map( c => {
		const sel = selected === c.name ? ' selected' : '';
		return `<option value="${h( c.name )}"${sel}>${h( c.name )} (${h( c.url )})</option>`;
	} ).join( '' );
	return `<select id="${id}" class="conn-picker"><option value="">${h( placeholder )}</option>${opts}</select>`;
}

function logLevelSelect( current: string ): string {
	const levels = [ '', 'DEBUG', 'INFO', 'WARNING', 'SEVERE' ];
	const labels: Record<string, string> = { '': '— default —', DEBUG: 'DEBUG', INFO: 'INFO', WARNING: 'WARNING', SEVERE: 'SEVERE' };
	const opts = levels.map( l => `<option value="${l}"${current === l ? ' selected' : ''}>${labels[l]}</option>` ).join( '' );
	return `<select id="logLevel">${opts}</select>`;
}

/** Escape string for safe HTML attribute/text insertion. */
function h( s: string ): string {
	return s.replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
}

function sharedJs(): string {
	return `
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function cancel() {
  vscode.postMessage({ type: 'cancel' });
}
function browse(field) {
  vscode.postMessage({ type: 'browseFile', field });
}
function browseFolder(field) {
  vscode.postMessage({ type: 'browseFolder', field });
}
function addConn() {
  vscode.postMessage({ type: 'addConnection' });
}
function addConnToDropdowns(conn) {
  document.querySelectorAll('select.conn-picker').forEach(sel => {
    const opt = document.createElement('option');
    opt.value = conn.name;
    opt.textContent = conn.name + ' (' + conn.url + ')';
    sel.insertBefore(opt, sel.lastChild);
    sel.value = conn.name;
  });
}`;
}

function styles(): string {
	return `
*,*::before,*::after{box-sizing:border-box}
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:20px 24px;max-width:560px}
h2{margin:0 0 4px;font-size:14px;font-weight:600}
.desc{margin:0 0 18px;font-size:12px;color:var(--vscode-descriptionForeground)}
.field{margin-bottom:12px}
label{display:block;margin-bottom:4px;font-size:12px;color:var(--vscode-descriptionForeground)}
.hint{font-size:11px;opacity:.7}
input[type="text"],select{width:100%;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:4px 7px;font-family:inherit;font-size:inherit;outline:none}
input[type="text"]:focus,select:focus{border-color:var(--vscode-focusBorder)}
.row{display:flex;gap:4px}
.row input,.row select{flex:1;min-width:0}
button{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#ccc);border:none;padding:4px 10px;cursor:pointer;font-family:inherit;font-size:inherit;white-space:nowrap}
button:hover{background:var(--vscode-button-secondaryHoverBackground,#45494e)}
button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
button.primary:hover{background:var(--vscode-button-hoverBackground)}
.radio-group{display:flex;gap:16px}
.radio-group label{display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--vscode-foreground);font-size:inherit}
.actions{margin-top:20px;display:flex;gap:8px}
.file-row{margin-top:4px}
.file-row select{flex:1;min-width:0}
#dialectSection{margin-top:4px}
.file-preview{margin-top:4px;font-style:italic}
.hidden{display:none}`;
}
