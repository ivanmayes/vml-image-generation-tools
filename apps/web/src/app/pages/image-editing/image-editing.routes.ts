import { Routes } from '@angular/router';

import { CompositionListPage } from './composition-list/composition-list.page';
import { CompositionEditorPage } from './composition-editor/composition-editor.page';
import { unsavedChangesGuard } from './composition-editor/composition-editor.guard';
import { EditorStateService } from './composition-editor/services/editor-state.service';
import { FabricCanvasService } from './composition-editor/services/fabric-canvas.service';
import { CanvasZoomService } from './composition-editor/services/canvas-zoom.service';
import { CanvasPanService } from './composition-editor/services/canvas-pan.service';

export const IMAGE_EDITING_ROUTES: Routes = [
	{
		path: '',
		component: CompositionListPage,
	},
	{
		path: ':compositionId',
		component: CompositionEditorPage,
		canDeactivate: [unsavedChangesGuard],
		providers: [
			EditorStateService,
			FabricCanvasService,
			CanvasZoomService,
			CanvasPanService,
		],
	},
];
