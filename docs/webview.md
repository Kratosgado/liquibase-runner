# Webview Panel

The webview panel (`WebviewPanelManager`) provides rich output display for Liquibase command results.

## Overview

- **Singleton**: only one panel exists at a time; `show()` reveals an existing panel instead of creating a duplicate
- **Retained context**: `retainContextWhenHidden: true` keeps DOM state when the user switches editor tabs
- **Inlined HTML**: the full HTML/CSS/JS lives as a template literal inside `getWebviewContent()` — no separate file needed with the single-entry esbuild config
- **CSP**: `script-src 'nonce-${nonce}'` with a `crypto.randomUUID()` nonce generated fresh per panel creation

## Tabs

| Tab | Triggered by | Content |
|---|---|---|
| **Output** | Every command start | Streaming stdout/stderr with ANSI stripping, auto-scroll |
| **Status** | `status` command success | Table of pending changesets (file / id / author) |
| **Diff** | `diff` command success | Raw diff output in a `<pre>` block |

## Message Protocol

Communication between the extension host and webview uses typed `postMessage` calls.

### Extension → Webview

| Message | When sent | Effect |
|---|---|---|
| `{ type: 'commandStart', command, project }` | Before running any command | Clears output, updates header label, shows Cancel button, switches to Output tab |
| `{ type: 'stdout', data }` | Each stdout chunk | Appends to `#output-stream`, auto-scrolls |
| `{ type: 'stderr', data }` | Each stderr chunk | Appends to `#output-stream` in red (`err-line` class), auto-scrolls |
| `{ type: 'commandEnd', exitCode, durationMs }` | Process close | Hides Cancel button, appends `[Done/Failed in Xs]` footer |
| `{ type: 'showStatus', pending: Changeset[] }` | After `status` success | Renders status table, switches to Status tab |
| `{ type: 'showDiff', content: string }` | After `diff` success | Populates diff `<pre>`, switches to Diff tab |

### Webview → Extension

| Message | When sent | Effect |
|---|---|---|
| `{ type: 'cancelCommand' }` | Cancel button click | `runner.cancel()` → SIGTERM → process exits |

## CSS Architecture

All styles use VS Code CSS variables for automatic theme adaptation (light / dark / high contrast):

```css
background: var(--vscode-panel-background)
color:       var(--vscode-foreground)
font:        var(--vscode-editor-font-family) / var(--vscode-editor-font-size)
errors:      var(--vscode-terminal-ansiRed)
borders:     var(--vscode-panel-border)
tab active:  var(--vscode-focusBorder)
```

No external CSS frameworks or icon fonts — purely VS Code native.

## ANSI Stripping

The webview JS strips ANSI escape codes before inserting text into the DOM:

```js
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}
```

This handles colored output from Maven, Gradle, and the Liquibase CLI without requiring an external library.

## Adding a New Tab

1. Add a tab button in the HTML template: `<button class="tab-btn" data-tab="mytab">My Tab</button>`
2. Add a panel div: `<div class="tab-panel" id="tab-mytab">...</div>`
3. Add a new `WebviewMessage` variant in [src/types/index.ts](../src/types/index.ts)
4. Handle the new message type in the webview's `window.addEventListener('message', ...)` handler
5. Post the message from the relevant command handler
