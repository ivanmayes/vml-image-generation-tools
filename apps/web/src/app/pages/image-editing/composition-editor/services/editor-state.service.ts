import { Injectable, signal, computed } from '@angular/core';

import type {
	Composition,
	CompositionVersion,
} from '../../../../shared/models/composition.model';
import type { EditorState } from '../models/editor-state.model';

/**
 * Signal-based editor state service.
 * Scoped to the editor route via providers array (not providedIn: 'root').
 * Destroyed when navigating away from the editor.
 */
@Injectable()
export class EditorStateService {
	readonly state = signal<EditorState>({ status: 'idle' });
	readonly composition = signal<Composition | null>(null);
	readonly currentVersion = signal<CompositionVersion | null>(null);
	readonly versions = signal<CompositionVersion[]>([]);
	readonly isDirty = signal(false);
	readonly isPolling = signal(false);

	readonly status = computed(() => this.state().status);
	readonly isIdle = computed(() => this.state().status === 'idle');
	readonly isLoading = computed(() => this.state().status === 'loading');
	readonly isSaving = computed(() => this.state().status === 'saving');
	readonly isGenerating = computed(
		() => this.state().status === 'generating',
	);
	readonly isError = computed(() => this.state().status === 'error');
	readonly isBusy = computed(
		() => this.isPolling() || (!this.isIdle() && !this.isError()),
	);

	readonly compositionName = signal('Untitled');
	readonly baseImageUrl = signal<string | null>(null);
	readonly isLoadingVersion = signal(false);

	readonly currentVersionNumber = computed(
		() => this.currentVersion()?.versionNumber ?? 0,
	);
	readonly totalVersions = computed(() => this.versions().length);

	setLoading(): void {
		this.state.set({ status: 'loading' });
	}

	setSaving(): void {
		this.state.set({ status: 'saving' });
	}

	setGenerating(): void {
		this.state.set({ status: 'generating' });
	}

	setIdle(): void {
		this.state.set({ status: 'idle' });
	}

	setError(message: string): void {
		this.state.set({ status: 'error', errorMessage: message });
	}

	markDirty(): void {
		this.isDirty.set(true);
	}

	markClean(): void {
		this.isDirty.set(false);
	}
}
