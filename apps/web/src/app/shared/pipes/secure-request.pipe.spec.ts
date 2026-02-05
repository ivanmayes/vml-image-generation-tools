import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { SessionQuery } from '../../state/session/session.query';

import { SecureRequestPipe } from './secure-request.pipe';

describe('SecureRequestPipe', () => {
	let pipe: SecureRequestPipe;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				provideHttpClient(),
				provideHttpClientTesting(),
				SecureRequestPipe,
				{
					provide: SessionQuery,
					useValue: { getToken: () => 'test-token' },
				},
			],
		});
		pipe = TestBed.inject(SecureRequestPipe);
	});

	it('create an instance', () => {
		expect(pipe).toBeTruthy();
	});
});
