import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

import { EditorStateService } from './services/editor-state.service';
import { FabricCanvasService } from './services/fabric-canvas.service';

/**
 * Functional canDeactivate guard.
 * Prompts user if there are unsaved changes in either editor state or canvas.
 */
export const unsavedChangesGuard: CanDeactivateFn<unknown> = () => {
	const editorState = inject(EditorStateService);
	const fabricCanvas = inject(FabricCanvasService);

	if (editorState.isDirty() || fabricCanvas.isDirty()) {
		return window.confirm(
			'You have unsaved changes. Are you sure you want to leave?',
		);
	}

	return true;
};
