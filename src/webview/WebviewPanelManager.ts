import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { WebviewMessage } from '../types/index.js';

export class WebviewPanelManager implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private readonly messageHandlers: Array<(msg: WebviewMessage) => void> = [];

	constructor(private readonly context: vscode.ExtensionContext) {}

	show(title = 'Liquibase Runner'): void {
		if (this.panel) {
			this.panel.title = title;
			this.panel.reveal(vscode.ViewColumn.Beside, true);
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'liquibaseRunner',
			title,
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.context.extensionUri],
			},
		);

		const nonce = crypto.randomUUID().replace(/-/g, '');
		this.panel.webview.html = this.getWebviewContent(this.panel.webview, nonce);

		this.panel.webview.onDidReceiveMessage(
			(msg: WebviewMessage) => {
				for (const handler of this.messageHandlers) {
					handler(msg);
				}
			},
			undefined,
			this.context.subscriptions,
		);

		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});
	}

	postMessage(message: WebviewMessage): void {
		this.panel?.webview.postMessage(message);
	}

	onMessage(handler: (message: WebviewMessage) => void): vscode.Disposable {
		this.messageHandlers.push(handler);
		return new vscode.Disposable(() => {
			const idx = this.messageHandlers.indexOf(handler);
			if (idx !== -1) this.messageHandlers.splice(idx, 1);
		});
	}

	dispose(): void {
		this.panel?.dispose();
	}

	private getWebviewContent(webview: vscode.Webview, nonce: string): string {
		const csp = [
			`default-src 'none'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ');

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Liquibase Runner</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-panel-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    /* Tab bar */
    #tab-bar {
      display: flex;
      gap: 0;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    .tab-btn {
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: var(--vscode-tab-inactiveForeground);
      cursor: pointer;
      font-size: var(--vscode-font-size);
      border-bottom: 2px solid transparent;
      transition: color 0.1s;
    }
    .tab-btn:hover { color: var(--vscode-foreground); }
    .tab-btn.active {
      color: var(--vscode-tab-activeForeground);
      border-bottom-color: var(--vscode-focusBorder);
      background: var(--vscode-tab-activeBackground);
    }
    /* Command header bar */
    #cmd-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      min-height: 34px;
    }
    #cmd-label {
      flex: 1;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    #cancel-btn {
      padding: 2px 10px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-size: 12px;
      display: none;
    }
    #cancel-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    /* Tab panels */
    #tabs { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
    .tab-panel { display: none; flex: 1; overflow: auto; padding: 0; }
    .tab-panel.active { display: flex; flex-direction: column; }
    /* Output */
    #output-stream {
      flex: 1;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
      padding: 8px 12px;
      margin: 0;
      background: var(--vscode-terminal-background, var(--vscode-editor-background));
      color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
      overflow: auto;
    }
    .err-line { color: var(--vscode-terminal-ansiRed, #f44); }
    .info-line { color: var(--vscode-terminal-ansiCyan, #0af); }
    .done-line { font-style: italic; color: var(--vscode-descriptionForeground); }
    /* Tables */
    .table-wrap { padding: 12px; overflow: auto; flex: 1; }
    table { border-collapse: collapse; width: 100%; }
    th {
      background: var(--vscode-keybindingTable-headerBackground, var(--vscode-editor-background));
      text-align: left;
      padding: 6px 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid var(--vscode-panel-border);
    }
    td { padding: 5px 10px; border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
    /* Empty state */
    .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    /* Diff */
    #diff-content {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      white-space: pre-wrap;
      word-break: break-all;
      padding: 12px;
      margin: 0;
      flex: 1;
    }
  </style>
</head>
<body>
  <div id="tab-bar">
    <button class="tab-btn active" data-tab="output">Output</button>
    <button class="tab-btn" data-tab="status">Status</button>
    <button class="tab-btn" data-tab="diff">Diff</button>
  </div>
  <div id="cmd-bar">
    <span id="cmd-label">Ready</span>
    <button id="cancel-btn">Cancel</button>
  </div>
  <div id="tabs">
    <div class="tab-panel active" id="tab-output">
      <pre id="output-stream"></pre>
    </div>
    <div class="tab-panel" id="tab-status">
      <div class="table-wrap">
        <div id="status-empty" class="empty">Run &ldquo;Liquibase: Status&rdquo; to see pending changesets.</div>
        <table id="status-table" style="display:none">
          <thead><tr><th>File</th><th>Changeset ID</th><th>Author</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
    <div class="tab-panel" id="tab-diff">
      <pre id="diff-content" class="empty">Run &ldquo;Liquibase: Diff&rdquo; to compare schemas.</pre>
    </div>
  </div>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      // Tab switching
      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
          document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
          btn.classList.add('active');
          document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
      });

      // Cancel
      document.getElementById('cancel-btn').addEventListener('click', function() {
        vscode.postMessage({ type: 'cancelCommand' });
      });

      function switchTab(name) {
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        var btn = document.querySelector('.tab-btn[data-tab="' + name + '"]');
        if (btn) btn.classList.add('active');
        var panel = document.getElementById('tab-' + name);
        if (panel) panel.classList.add('active');
      }

      function stripAnsi(str) {
        return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      }

      var outputEl = document.getElementById('output-stream');

      function appendOutput(text, className) {
        var span = document.createElement('span');
        span.textContent = stripAnsi(text);
        if (className) span.className = className;
        outputEl.appendChild(span);
        outputEl.scrollTop = outputEl.scrollHeight;
      }

      function renderStatusTable(changesets) {
        var empty = document.getElementById('status-empty');
        var table = document.getElementById('status-table');
        if (!changesets || changesets.length === 0) {
          empty.style.display = 'flex';
          empty.textContent = 'No pending changesets — database is up to date.';
          table.style.display = 'none';
          return;
        }
        empty.style.display = 'none';
        table.style.display = 'table';
        var tbody = table.querySelector('tbody');
        tbody.innerHTML = '';
        changesets.forEach(function(cs) {
          var tr = document.createElement('tr');
          var parts = cs.filePath ? cs.filePath.split(/[\\/]/) : [];
          var fileName = parts[parts.length - 1] || cs.filePath || '';
          tr.innerHTML =
            '<td title="' + (cs.filePath || '') + '">' + fileName + '</td>' +
            '<td>' + (cs.id || '') + '</td>' +
            '<td>' + (cs.author || '') + '</td>';
          tbody.appendChild(tr);
        });
      }

      window.addEventListener('message', function(event) {
        var msg = event.data;
        switch (msg.type) {
          case 'commandStart':
            outputEl.textContent = '';
            document.getElementById('cmd-label').textContent =
              (msg.command || '') + (msg.project ? '  —  ' + msg.project : '');
            document.getElementById('cancel-btn').style.display = 'inline';
            switchTab('output');
            break;
          case 'stdout':
            appendOutput(msg.data, null);
            break;
          case 'stderr':
            appendOutput(msg.data, 'err-line');
            break;
          case 'commandEnd':
            document.getElementById('cancel-btn').style.display = 'none';
            var ok = msg.exitCode === 0;
            appendOutput(
              '\n[' + (ok ? 'Done' : 'Failed') + ' in ' +
              (msg.durationMs / 1000).toFixed(2) + 's, exit code ' + msg.exitCode + ']\n',
              ok ? 'done-line' : 'err-line'
            );
            break;
          case 'showStatus':
            renderStatusTable(msg.pending);
            switchTab('status');
            break;
          case 'showDiff':
            var diffEl = document.getElementById('diff-content');
            diffEl.textContent = msg.content || '(empty)';
            diffEl.className = '';
            switchTab('diff');
            break;
        }
      });
    })();
  </script>
</body>
</html>`;
	}
}
