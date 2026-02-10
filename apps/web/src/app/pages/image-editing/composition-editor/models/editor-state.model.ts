/**
 * Editor state machine states.
 * Gates user interactions to prevent race conditions.
 */
export type EditorStatus =
	| 'idle'
	| 'loading'
	| 'saving'
	| 'generating'
	| 'error';

export interface EditorState {
	status: EditorStatus;
	errorMessage?: string;
}
