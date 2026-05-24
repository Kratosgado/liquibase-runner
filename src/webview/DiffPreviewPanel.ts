import * as vscode from 'vscode';
import * as crypto from 'node:crypto';

interface DiffSection {
	kind: 'missing' | 'unexpected' | 'changed' | 'equal';
	category: string;
	items: DiffItem[];
}

interface DiffItem {
	name: string;
	details?: string[];
}

export class DiffPreviewPanel {
	static show( context: vscode.ExtensionContext, rawOutput: string ): void {
		const panel = vscode.window.createWebviewPanel(
			'liquibaseRunner.diffPreview',
			'Liquibase Diff Preview',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		context.subscriptions.push( panel );
		panel.webview.html = buildHtml( rawOutput );
	}
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseDiffOutput( raw: string ): { meta: string[]; sections: DiffSection[] } {
	const lines = raw.split( /\r?\n/ );
	const meta: string[] = [];
	const sections: DiffSection[] = [];

	// Collect header lines (before first section header)
	const sectionPattern = /^(Missing|Unexpected|Changed|Equal)\s+(.+?):\s*(.*)/i;
	let inMeta = true;

	let i = 0;
	while ( i < lines.length ) {
		const line = lines[ i ];
		const match = sectionPattern.exec( line );

		if ( match ) {
			inMeta = false;
			const kind = match[1].toLowerCase() as DiffSection['kind'];
			const category = match[2].trim();
			const inline = match[3].trim();
			const items: DiffItem[] = [];

			if ( inline && inline.toUpperCase() !== 'NONE' ) {
				items.push( { name: inline } );
			}

			i++;
			// Collect indented items that follow this header
			while ( i < lines.length ) {
				const next = lines[ i ];
				if ( /^\s{2,}/.test( next ) && next.trim() ) {
					const trimmed = next.trim();
					if ( trimmed.startsWith( 'size changed' ) || trimmed.startsWith( 'type changed' ) || trimmed.startsWith( 'nullable changed' ) ) {
						// This is a detail of the previous item
						if ( items.length > 0 ) {
							( items[ items.length - 1 ].details ??= [] ).push( trimmed );
						}
					} else if ( trimmed.toUpperCase() !== 'NONE' ) {
						items.push( { name: trimmed } );
					}
					i++;
				} else {
					break;
				}
			}

			sections.push( { kind, category, items } );
		} else {
			if ( inMeta && line.trim() ) meta.push( line.trim() );
			i++;
		}
	}

	return { meta, sections };
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml( raw: string ): string {
	const nonce = crypto.randomBytes( 16 ).toString( 'hex' );
	const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

	const { meta, sections } = parseDiffOutput( raw );

	const missing = sections.filter( s => s.kind === 'missing' && s.items.length > 0 );
	const unexpected = sections.filter( s => s.kind === 'unexpected' && s.items.length > 0 );
	const changed = sections.filter( s => s.kind === 'changed' && s.items.length > 0 );

	const totalChanges = missing.length + unexpected.length + changed.length;

	const metaHtml = meta.length
		? `<div class="meta">${meta.map( l => `<div>${esc( l )}</div>` ).join( '' )}</div>`
		: '';

	const summaryHtml = `
<div class="summary">
  <span class="chip missing">${missing.length} Missing</span>
  <span class="chip unexpected">${unexpected.length} Unexpected</span>
  <span class="chip changed">${changed.length} Changed</span>
</div>`;

	const noChangesHtml = totalChanges === 0
		? '<div class="empty">No differences found — databases are in sync.</div>'
		: '';

	const sectionsHtml = [
		...missing.map( s => sectionHtml( s, 'missing' ) ),
		...unexpected.map( s => sectionHtml( s, 'unexpected' ) ),
		...changed.map( s => sectionHtml( s, 'changed' ) ),
	].join( '' );

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Diff Preview</title>
<style nonce="${nonce}">${styles()}</style>
</head>
<body>
<h2>Diff Results</h2>
${metaHtml}
${summaryHtml}
${noChangesHtml}
<div class="tree">${sectionsHtml}</div>
<details class="raw-toggle"><summary>Raw output</summary><pre class="raw">${esc( raw )}</pre></details>
<script nonce="${nonce}">
document.querySelectorAll('.section-header').forEach(h => {
  h.addEventListener('click', () => {
    const body = h.nextElementSibling;
    const closing = !body.classList.contains('hidden');
    body.classList.toggle('hidden', closing);
    h.querySelector('.chevron').textContent = closing ? '▶' : '▼';
  });
});
</script>
</body>
</html>`;
}

function sectionHtml( section: DiffSection, kind: string ): string {
	const itemsHtml = section.items.map( item => {
		const detailsHtml = item.details?.length
			? `<ul class="details">${item.details.map( d => `<li>${esc( d )}</li>` ).join( '' )}</ul>`
			: '';
		return `<li class="item">${esc( item.name )}${detailsHtml}</li>`;
	} ).join( '' );

	return `
<div class="section ${kind}">
  <div class="section-header">
    <span class="chevron">▼</span>
    <span class="kind-badge ${kind}">${kind}</span>
    <span class="category">${esc( section.category )}</span>
    <span class="count">${section.items.length}</span>
  </div>
  <div class="section-body">
    <ul class="items">${itemsHtml}</ul>
  </div>
</div>`;
}

function esc( s: string ): string {
	return s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
}

function styles(): string {
	return `
*,*::before,*::after{box-sizing:border-box}
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:16px 20px}
h2{margin:0 0 8px;font-size:14px;font-weight:600}
.meta{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.6}
.summary{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.chip{padding:2px 10px;font-size:11px;font-weight:600;border-radius:10px}
.chip.missing{background:#5a1d1d;color:#f48771}
.chip.unexpected{background:#1d3a1d;color:#89d185}
.chip.changed{background:#3a2e1d;color:#cca700}
.empty{color:var(--vscode-descriptionForeground);font-style:italic;margin:12px 0}
.section{margin-bottom:6px;border:1px solid var(--vscode-panel-border,#454545)}
.section-header{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;user-select:none;background:var(--vscode-sideBarSectionHeader-background,#252526)}
.section-header:hover{background:var(--vscode-list-hoverBackground,#2a2d2e)}
.chevron{font-size:10px;width:12px;color:var(--vscode-descriptionForeground)}
.kind-badge{font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase}
.kind-badge.missing{background:#5a1d1d;color:#f48771}
.kind-badge.unexpected{background:#1d3a1d;color:#89d185}
.kind-badge.changed{background:#3a2e1d;color:#cca700}
.category{flex:1;font-size:12px}
.count{font-size:11px;color:var(--vscode-descriptionForeground);font-weight:600}
.section-body{padding:4px 0 4px 20px}
ul.items{margin:0;padding:0;list-style:none}
li.item{padding:3px 0;font-size:12px;font-family:var(--vscode-editor-font-family,monospace)}
ul.details{margin:2px 0 0 16px;padding:0;list-style:disc}
ul.details li{font-size:11px;color:var(--vscode-descriptionForeground);padding:1px 0}
.raw-toggle{margin-top:20px;font-size:12px}
.raw-toggle summary{cursor:pointer;color:var(--vscode-descriptionForeground)}
pre.raw{font-size:11px;white-space:pre-wrap;word-break:break-all;background:var(--vscode-textBlockQuote-background,#1e1e1e);padding:10px;margin:8px 0 0;overflow:auto}
.hidden{display:none}`;
}
