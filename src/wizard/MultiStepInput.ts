import * as vscode from 'vscode';

export type StepOutcome<T> =
	| { kind: 'value'; value: T }
	| { kind: 'back' }
	| { kind: 'cancel' };

export interface QuickPickItem extends vscode.QuickPickItem {
	value?: string;
}

/**
 * Shows a QuickPick with an optional Back button (shown when showBack is true).
 * Returns the selected item, 'back', or 'cancel'.
 */
export async function pickOne<T extends vscode.QuickPickItem>(
	items: T[],
	opts: {
		title: string;
		placeholder?: string;
		active?: T;
		showBack?: boolean;
	},
): Promise<StepOutcome<T>> {
	return new Promise( resolve => {
		const qp = vscode.window.createQuickPick<T>();
		qp.title = opts.title;
		qp.placeholder = opts.placeholder;
		qp.items = items;
		qp.buttons = opts.showBack ? [ vscode.QuickInputButtons.Back ] : [];
		if ( opts.active ) qp.activeItems = [ opts.active ];

		let settled = false;
		const done = ( outcome: StepOutcome<T> ) => {
			if ( settled ) return;
			settled = true;
			qp.dispose();
			resolve( outcome );
		};

		qp.onDidAccept( () => {
			const [ item ] = qp.selectedItems;
			if ( item ) done( { kind: 'value', value: item } );
		} );
		qp.onDidTriggerButton( btn => {
			if ( btn === vscode.QuickInputButtons.Back ) done( { kind: 'back' } );
		} );
		qp.onDidHide( () => done( { kind: 'cancel' } ) );
		qp.show();
	} );
}

/**
 * Shows an InputBox with optional validation and an optional Back button.
 * Returns the entered string, 'back', or 'cancel'.
 */
export async function inputValue( opts: {
	title: string;
	prompt: string;
	value?: string;
	placeholder?: string;
	validate?: ( v: string ) => string | undefined;
	showBack?: boolean;
	password?: boolean;
} ): Promise<StepOutcome<string>> {
	return new Promise( resolve => {
		const ib = vscode.window.createInputBox();
		ib.title = opts.title;
		ib.prompt = opts.prompt;
		ib.value = opts.value ?? '';
		ib.placeholder = opts.placeholder ?? '';
		ib.password = opts.password ?? false;
		ib.buttons = opts.showBack ? [ vscode.QuickInputButtons.Back ] : [];

		let settled = false;
		const done = ( outcome: StepOutcome<string> ) => {
			if ( settled ) return;
			settled = true;
			ib.dispose();
			resolve( outcome );
		};

		if ( opts.validate ) {
			ib.onDidChangeValue( v => {
				ib.validationMessage = opts.validate!( v ) ?? '';
			} );
		}

		ib.onDidAccept( () => {
			const msg = opts.validate?.( ib.value );
			if ( msg ) { ib.validationMessage = msg; return; }
			done( { kind: 'value', value: ib.value } );
		} );
		ib.onDidTriggerButton( btn => {
			if ( btn === vscode.QuickInputButtons.Back ) done( { kind: 'back' } );
		} );
		ib.onDidHide( () => done( { kind: 'cancel' } ) );
		ib.show();
	} );
}

/** Formats a step counter for use in wizard titles, e.g. "Rollback (2/3)". */
export function stepTitle( base: string, step: number, total: number ): string {
	return `${base}  (${step}/${total})`;
}
