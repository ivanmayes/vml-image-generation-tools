import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
	let component: ConfirmDialogComponent;
	let fixture: ComponentFixture<ConfirmDialogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [ConfirmDialogComponent],
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: DynamicDialogRef,
					useValue: { close: () => {} },
				},
				{
					provide: DynamicDialogConfig,
					useValue: {
						data: { title: 'Test', message: 'Test message' },
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(ConfirmDialogComponent);
		component = fixture.componentInstance;
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
