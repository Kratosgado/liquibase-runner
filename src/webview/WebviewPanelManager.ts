import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { WebviewMessage } from '../types/index.js';

export class WebviewPanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly messageHandlers: Array<( msg: WebviewMessage ) => void> = [];

  constructor( private readonly context: vscode.ExtensionContext ) { }

  show( title = 'Liquibase Runner' ): void {
    if ( this.panel ) {
      this.panel.title = title;
      this.panel.reveal( vscode.ViewColumn.Beside, true );
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'liquibaseRunner',
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [ this.context.extensionUri ],
      },
    );

    const nonce = crypto.randomUUID().replaceAll( '-', '' );
    this.panel.webview.html = this.getWebviewContent( this.panel.webview, nonce );

    this.panel.webview.onDidReceiveMessage(
      ( msg: WebviewMessage ) => {
        for ( const handler of this.messageHandlers ) {
          handler( msg );
        }
      },
      undefined,
      this.context.subscriptions,
    );

    this.panel.onDidDispose( () => {
      this.panel = undefined;
    } );
  }

  postMessage( message: WebviewMessage ): void {
    this.panel?.webview.postMessage( message );
  }

  onMessage( handler: ( message: WebviewMessage ) => void ): vscode.Disposable {
    this.messageHandlers.push( handler );
    return new vscode.Disposable( () => {
      const idx = this.messageHandlers.indexOf( handler );
      if ( idx !== -1 ) this.messageHandlers.splice( idx, 1 );
    } );
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private getWebviewContent( webview: vscode.Webview, nonce: string ): string {
    const csp = [
      `default-src 'none'`,
      `font-src ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join( '; ' );

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
      background:
        radial-gradient(circle at top left, rgba(90, 140, 255, 0.14), transparent 32%),
        radial-gradient(circle at top right, rgba(0, 180, 160, 0.12), transparent 28%),
        var(--vscode-panel-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      padding: 10px;
      gap: 10px;
    }
    #hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, transparent);
    }
    #hero h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
    }
    #hero p {
      margin: 4px 0 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      max-width: 70ch;
    }
    #status-pill {
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      white-space: nowrap;
    }
    /* Tab bar */
    #tab-bar {
      display: flex;
      gap: 6px;
      padding: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      flex-shrink: 0;
    }
    .tab-btn {
      padding: 10px 14px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--vscode-tab-inactiveForeground);
      cursor: pointer;
      font-size: 12px;
      transition: color 0.1s, background 0.1s, border-color 0.1s;
    }
    .tab-btn:hover { color: var(--vscode-foreground); }
    .tab-btn.active {
      color: var(--vscode-tab-activeForeground);
      background: var(--vscode-tab-activeBackground);
      border-color: var(--vscode-focusBorder);
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
    /* allow flex children to shrink properly in VS Code webview */
    #tabs, .tab-panel, .table-wrap { min-height: 0; }
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
    .status-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 12px;
    }
    .stat-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      padding: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 94%, transparent);
    }
    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 700;
    }
    .hint {
      margin: 0;
      padding: 0 12px 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
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
  <div id="shell">
    <section id="hero">
      <div>
        <h1>Liquibase Runner</h1>
        <p>Run migrations, inspect pending changes, and generate new changelogs from database state or Spring/Hibernate entity metadata.</p>
      </div>
      <div id="status-pill">Ready</div>
    </section>
    <div id="tab-bar" role="tablist" aria-label="Liquibase panels">
      <button type="button" class="tab-btn active" data-tab="output" role="tab" aria-selected="true">Output</button>
      <button type="button" class="tab-btn" data-tab="status" role="tab" aria-selected="false">Status</button>
      <button type="button" class="tab-btn" data-tab="diff" role="tab" aria-selected="false">Diff</button>
      <button type="button" class="tab-btn" data-tab="settings" role="tab" aria-selected="false">Settings</button>
    </div>
    <div id="cmd-bar">
      <span id="cmd-label">Ready</span>
      <button type="button" id="cancel-btn">Cancel</button>
    </div>
    <div id="tabs">
      <div class="tab-panel active" id="tab-output">
        <pre id="output-stream"></pre>
      </div>
      <div class="tab-panel" id="tab-status">
        <div class="status-summary">
          <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value" id="status-pending-count">0</div></div>
          <div class="stat-card"><div class="stat-label">Mode</div><div class="stat-value">Database</div></div>
          <div class="stat-card"><div class="stat-label">Tip</div><div class="stat-value">Open a row</div></div>
        </div>
        <p class="hint" id="status-hint">Run Liquibase status to populate the table.</p>
        <div class="table-wrap">
          <div id="status-empty" class="empty">Run &ldquo;Liquibase: Status&rdquo; to see pending changesets.</div>
          <table id="status-table" style="display:none">
            <thead><tr><th>File</th><th>Changeset ID</th><th>Author</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      <div class="tab-panel" id="tab-diff">
        <div class="status-summary">
          <div class="stat-card"><div class="stat-label">Mode</div><div class="stat-value">Diff</div></div>
          <div class="stat-card"><div class="stat-label">Source</div><div class="stat-value">Database</div></div>
          <div class="stat-card"><div class="stat-label">Output</div><div class="stat-value">Changelog</div></div>
        </div>
        <p class="hint">Use Diff for schema comparison, or Generate Changelog from Entities to diff Hibernate/Spring metadata against the database.</p>
        <pre id="diff-content" class="empty">Run &ldquo;Liquibase: Diff&rdquo; to compare schemas.</pre>
      </div>
      <div class="tab-panel" id="tab-settings">
        <div class="table-wrap">
          <p class="hint">Project settings and presets for Liquibase Runner.</p>
          <div style="display:flex;gap:8px;align-items:center;padding:12px 0;flex-direction:column;">
            <div style="display:flex;gap:8px;align-items:center;width:100%;">
              <label style="min-width:90px;color:var(--vscode-descriptionForeground);">Project</label>
              <select id="wb-project" style="flex:1;padding:6px;border-radius:6px;"></select>
            </div>
            <div style="display:flex;gap:8px;align-items:center;width:100%;">
              <label style="min-width:90px;color:var(--vscode-descriptionForeground);">Command</label>
              <select id="wb-command" style="flex:1;padding:6px;border-radius:6px;">
                <option value="update">Update</option>
                <option value="status">Status</option>
                <option value="validate">Validate</option>
                <option value="diff">Diff</option>
                <option value="rollback">Rollback</option>
                <option value="generateChangeLog">GenerateChangeLog</option>
              </select>
            </div>
            <div id="wb-args" style="width:100%;display:flex;flex-direction:column;gap:8px;padding-top:8px;">
              <div style="display:flex;gap:8px;align-items:center;">
                <label style="min-width:90px;color:var(--vscode-descriptionForeground);">changelogFile</label>
                <input id="wb-changelogFile" placeholder="Optional changelog file" style="flex:1;padding:6px;border-radius:6px;" />
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <label style="min-width:90px;color:var(--vscode-descriptionForeground);">referenceUrl</label>
                <input id="wb-referenceUrl" placeholder="hibernate:spring:... or jdbc:..." style="flex:1;padding:6px;border-radius:6px;" />
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <label style="min-width:90px;color:var(--vscode-descriptionForeground);">tag/count</label>
                <input id="wb-tag" placeholder="tag or count" style="flex:1;padding:6px;border-radius:6px;" />
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;padding-top:8px;width:100%;">
              <button id="wb-run" style="padding:6px 10px;border-radius:6px;">Run</button>
              <button id="wb-save" style="padding:6px 10px;border-radius:6px;">Save Preset</button>
              <button id="open-configure" style="padding:6px 10px;border-radius:6px;">Open Configure Project</button>
            </div>
            <div style="color:var(--vscode-descriptionForeground);font-size:12px;">Presets are stored in the webview state and can be saved to workspace settings.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Confirmation modal -->
  <div id="confirm-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);align-items:center;justify-content:center;">
    <div style="background:var(--vscode-editor-background);padding:16px;border-radius:8px;border:1px solid var(--vscode-panel-border);max-width:520px;width:90%;">
      <div id="confirm-title" style="font-weight:700;margin-bottom:8px;">Confirm action</div>
      <div id="confirm-body" style="margin-bottom:12px;color:var(--vscode-descriptionForeground);"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;"><button id="confirm-cancel" style="padding:6px 10px;border-radius:6px;">Cancel</button><button id="confirm-ok" style="padding:6px 10px;border-radius:6px;">Run</button></div>
    </div>
  </div>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      const initialState = vscode.getState() || { activeTab: 'output' };

      function persistState(nextState) {
        vscode.setState(Object.assign({}, vscode.getState() || {}, nextState));
      }

      function setActiveTab(name) {
        document.querySelectorAll('.tab-btn').forEach(function(b) {
          var isActive = b.dataset.tab === name;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        var panel = document.getElementById('tab-' + name);
        if (panel) panel.classList.add('active');
        persistState({ activeTab: name });
      }

      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          setActiveTab(btn.dataset.tab || 'output');
        });
      });

      setActiveTab(initialState.activeTab || 'output');

      // Cancel
      document.getElementById('cancel-btn').addEventListener('click', function() {
        vscode.postMessage({ type: 'cancelCommand' });
      });

      document.getElementById('open-configure').addEventListener('click', function() {
        vscode.postMessage({ type: 'openConfigure' });
      });

      // Webview Builder form logic
      const projectSelect = document.getElementById('wb-project');
      const commandSelect = document.getElementById('wb-command');
      const changelogInput = document.getElementById('wb-changelogFile');
      const referenceInput = document.getElementById('wb-referenceUrl');
      const tagInput = document.getElementById('wb-tag');
      const runBtn = document.getElementById('wb-run');
      const saveBtn = document.getElementById('wb-save');
      const confirmOverlay = document.getElementById('confirm-overlay');
      const confirmBody = document.getElementById('confirm-body');
      const confirmOk = document.getElementById('confirm-ok');
      const confirmCancel = document.getElementById('confirm-cancel');

      function populateProjects(list) {
        projectSelect.innerHTML = '';
        list.forEach(function(p) {
          const opt = document.createElement('option');
          opt.value = p.rootPath;
          opt.textContent = p.name + ' — ' + p.rootPath;
          projectSelect.appendChild(opt);
        });
      }

      // Load initial presets from state
      const state = vscode.getState() || {};
      if ( state.presets && Array.isArray(state.presets.projects) ) {
        populateProjects(state.presets.projects);
      }

      // Update form inputs based on selected command
      function updateFormForCommand(cmd) {
        // show/hide inputs and apply per-command validation hints
        changelogInput.parentElement.style.display = cmd === 'generateChangeLog' || cmd === 'update' ? 'flex' : 'flex';
        referenceInput.parentElement.style.display = cmd === 'generateChangeLog' ? 'flex' : 'flex';
        tagInput.parentElement.style.display = cmd === 'rollback' ? 'flex' : (cmd === 'rollback' ? 'flex' : 'flex');
        // simple inline placeholder adjustments
        if ( cmd === 'rollback' ) {
          tagInput.placeholder = 'Provide tag OR numeric count';
        } else if ( cmd === 'generateChangeLog' ) {
          referenceInput.placeholder = 'hibernate:spring:... or jdbc:...';
        } else {
          tagInput.placeholder = 'tag or count';
        }
      }

      commandSelect.addEventListener('change', function() {
        updateFormForCommand(commandSelect.value);
      });
      updateFormForCommand(commandSelect.value);

      function validateForCommand(cmd) {
        // reset styles
        [changelogInput, referenceInput, tagInput].forEach(i => i.style.border = '');
        // rollback requires tag or count
        if ( cmd === 'rollback' ) {
          if ( !tagInput.value || tagInput.value.trim() === '' ) {
            tagInput.style.border = '1px solid var(--vscode-inputValidation-errorBorder)';
            return { ok: false, message: 'Rollback requires a tag or numeric count.' };
          }
        }
        return { ok: true };
      }

      runBtn.addEventListener('click', function() {
        const cmd = commandSelect.value;
        const proj = projectSelect.value || (projectSelect.options[0] && projectSelect.options[0].value);
        const validation = validateForCommand(cmd);
        if ( !validation.ok ) {
          // show a small toast in status-pill
          document.getElementById('status-pill').textContent = validation.message;
          setTimeout(() => document.getElementById('status-pill').textContent = 'Ready', 4000);
          return;
        }
        const extra = {};
        if ( changelogInput.value ) extra.changelogFile = changelogInput.value;
        if ( referenceInput.value ) extra.referenceUrl = referenceInput.value;
        if ( tagInput.value ) {
          if (/^[0-9]+$/.test(tagInput.value.trim())) extra.count = tagInput.value.trim();
          else extra.tag = tagInput.value.trim();
        }

        // show confirmation for destructive commands
        if ( cmd === 'rollback' || cmd === 'update' ) {
          confirmBody.textContent = cmd === 'rollback' ? 'This will apply a rollback which may remove changes. Are you sure?' : 'This will run update and apply migrations to the database. Continue?';
          confirmOverlay.style.display = 'flex';
          confirmOk.onclick = function() {
            confirmOverlay.style.display = 'none';
            vscode.postMessage({ type: 'webviewRunCommand', command: cmd, projectRoot: proj, extraArgs: extra });
          };
          confirmCancel.onclick = function() {
            confirmOverlay.style.display = 'none';
          };
          return;
        }

        vscode.postMessage({ type: 'webviewRunCommand', command: cmd, projectRoot: proj, extraArgs: extra });
      });

      saveBtn.addEventListener('click', function() {
        const selectedProject = projectSelect.value || (projectSelect.options[0] && projectSelect.options[0].value);
        const preset = {
          last: {
            command: commandSelect.value,
            changelogFile: changelogInput.value,
            referenceUrl: referenceInput.value,
            tag: tagInput.value,
          }
        };
        // persist in webview state for quick reload
        const s = vscode.getState() || {};
        s.presets = s.presets || {};
        s.presets.projects = Array.from(projectSelect.options).map(o => ({ name: o.textContent, rootPath: o.value }));
        s.presets[selectedProject] = preset;
        vscode.setState(s);
        vscode.postMessage({ type: 'savePresets', projectRoot: selectedProject, preset });
      });

      // Handle incoming project list
      window.addEventListener('message', function(event) {
        var msg = event.data;
        if ( msg.type === 'projects' && Array.isArray(msg.projects) ) {
          populateProjects(msg.projects);
          // persist in state for next load
          const s = vscode.getState() || {};
          s.presets = s.presets || {};
          s.presets.projects = msg.projects;
          vscode.setState(s);
        }
        if ( msg.type === 'presets' && msg.presets ) {
          // msg.presets is an object mapping rootPath -> preset
          const cfg = msg.presets || {};
          const s = vscode.getState() || {};
          s.presets = s.presets || {};
          s.presets.projects = s.presets.projects || [];
          // apply to UI if preset exists for selected project
          const selected = projectSelect.value || (projectSelect.options[0] && projectSelect.options[0].value);
          if ( selected && cfg[selected] && cfg[selected].last ) {
            const last = cfg[selected].last;
            commandSelect.value = last.command || commandSelect.value;
            changelogInput.value = last.changelogFile || '';
            referenceInput.value = last.referenceUrl || '';
            tagInput.value = last.tag || '';
          }
        }
      });

      function stripAnsi(str) {
          const ansiPattern = new RegExp('\\x1b\\[[0-9;]*[a-zA-Z]', 'g');
          return str.replace(ansiPattern, '');
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
        var count = document.getElementById('status-pending-count');
        if (!changesets || changesets.length === 0) {
          empty.style.display = 'flex';
          empty.textContent = 'No pending changesets — database is up to date.';
          table.style.display = 'none';
          count.textContent = '0';
          return;
        }
        empty.style.display = 'none';
        table.style.display = 'table';
        count.textContent = String(changesets.length);
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
            document.getElementById('status-pill').textContent = 'Running';
            document.getElementById('cancel-btn').style.display = 'inline';
            setActiveTab('output');
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
            document.getElementById('status-pill').textContent = ok ? 'Ready' : 'Failed';
            appendOutput(
              '\n[' + (ok ? 'Done' : 'Failed') + ' in ' +
              (msg.durationMs / 1000).toFixed(2) + 's, exit code ' + msg.exitCode + ']\n',
              ok ? 'done-line' : 'err-line'
            );
            break;
          case 'showStatus':
            renderStatusTable(msg.pending);
            setActiveTab('status');
            break;
          case 'showDiff':
            var diffEl = document.getElementById('diff-content');
            diffEl.textContent = msg.content || '(empty)';
            diffEl.className = '';
            setActiveTab('diff');
            break;
        }
      });
    })();
  </script>
</body>
</html>`;
  }
}
