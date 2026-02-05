import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GlobalQuery } from '../../state/global/global.query';

import { EntityFieldMaskPipe } from './entity-field-mask.pipe';

describe('EntityFieldMaskPipe', () => {
	let pipe: EntityFieldMaskPipe;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				EntityFieldMaskPipe,
				{
					provide: GlobalQuery,
					useValue: {
						getValue: () => ({
							settings: { settings: { entities: {} } },
						}),
					},
				},
			],
		});
		pipe = TestBed.inject(EntityFieldMaskPipe);
	});

	it('create an instance', () => {
		expect(pipe).toBeTruthy();
	});
});
