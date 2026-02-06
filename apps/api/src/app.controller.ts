import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	@Get()
	public getHello(): string {
		return this.appService.getHello();
	}

	@Get('health')
	public health() {
		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
		};
	}
}
