import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { RouterQuery } from '@datorama/akita-ng-router-store';

import { GlobalQuery } from '../../../state/global/global.query';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';
import { ThemeService } from '../../services/theme.service';

import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
	let component: HeaderComponent;
	let fixture: ComponentFixture<HeaderComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [HeaderComponent],
			providers: [
				provideZonelessChangeDetection(),
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: RouterQuery,
					useValue: { select: () => of({}) },
				},
				{
					provide: GlobalQuery,
					useValue: {
						select: () => of({}),
						settings: signal(null),
						header: signal(null),
						adminMode: signal(false),
					},
				},
				{
					provide: SessionQuery,
					useValue: {
						select: () => of({}),
						user: signal(null),
						token: signal(null),
						isLoggedInSignal: signal(false),
						loading: signal(false),
						isAdmin: signal(false),
					},
				},
				{
					provide: SessionService,
					useValue: { logout: () => {} },
				},
				{
					provide: ThemeService,
					useValue: {
						currentTheme: 'light',
						toggleTheme: () => {},
						getTheme: () => 'light',
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(HeaderComponent);
		component = fixture.componentInstance;
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
