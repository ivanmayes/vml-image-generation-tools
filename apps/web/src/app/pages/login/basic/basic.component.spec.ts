import {
	Component,
	provideZonelessChangeDetection,
	signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { GlobalQuery } from '../../../state/global/global.query';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';

import { BasicAuthComponent } from './basic.component';

// Test wrapper to provide required inputs
@Component({
	template: `<app-auth-basic [email]="email" [authConfig]="authConfig" />`,
	imports: [BasicAuthComponent],
})
class TestHostComponent {
	email = 'test@example.com';
	authConfig = { data: { token: 'test-token' } };
}

describe('BasicAuthComponent', () => {
	let component: TestHostComponent;
	let fixture: ComponentFixture<TestHostComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [TestHostComponent],
			providers: [
				provideZonelessChangeDetection(),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideAnimations(),
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
						selectLoading: () => of(false),
						user: signal(null),
						token: signal(null),
						isLoggedInSignal: signal(false),
						loading: signal(false),
						isAdmin: signal(false),
					},
				},
				{
					provide: SessionService,
					useValue: { activateEmail: () => of({}) },
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(TestHostComponent);
		component = fixture.componentInstance;
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
