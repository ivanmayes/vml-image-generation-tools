import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { PrimeNgModule } from '../../primeng.module';
import { ToolDefinition, TOOL_REGISTRY } from '../../tools/tool-registry';

@Component({
	selector: 'app-toolbox-grid',
	templateUrl: './toolbox-grid.component.html',
	styleUrls: ['./toolbox-grid.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class ToolboxGridComponent {
	tools = input<ToolDefinition[]>(TOOL_REGISTRY);
	baseRoute = input<string>('');

	constructor(private readonly router: Router) {}

	onToolClick(tool: ToolDefinition): void {
		if (tool.comingSoon) return;
		const base = this.baseRoute();
		const path = base
			? `${base}/${tool.routeFragment}`
			: `/${tool.routeFragment}`;
		this.router.navigate([path]);
	}
}
