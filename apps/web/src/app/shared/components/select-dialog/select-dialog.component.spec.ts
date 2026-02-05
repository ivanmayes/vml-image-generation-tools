import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { SelectDialogComponent } from './select-dialog.component';

describe('SelectDialogComponent', () => {
	let component: SelectDialogComponent;
	let fixture: ComponentFixture<SelectDialogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [SelectDialogComponent],
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: DynamicDialogRef,
					useValue: { close: () => {} },
				},
				{
					provide: DynamicDialogConfig,
					useValue: { data: { title: 'Test', options: {} } },
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(SelectDialogComponent);
		component = fixture.componentInstance;
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
