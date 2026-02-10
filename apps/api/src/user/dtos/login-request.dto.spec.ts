import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { LoginRequestDto } from './login-request.dto';

async function validateDto(data: Record<string, unknown>) {
	const dto = plainToInstance(LoginRequestDto, data);
	return validate(dto);
}

describe('LoginRequestDto validation', () => {
	it('should pass with valid siteId and email', async () => {
		const errors = await validateDto({
			siteId: 'site-123',
			email: 'user@example.com',
		});
		expect(errors).toHaveLength(0);
	});

	describe('siteId', () => {
		it('should fail when siteId is missing', async () => {
			const errors = await validateDto({ email: 'user@example.com' });
			expect(errors.find((e) => e.property === 'siteId')).toBeDefined();
		});

		it('should fail when siteId is empty string', async () => {
			const errors = await validateDto({
				siteId: '',
				email: 'user@example.com',
			});
			expect(errors.find((e) => e.property === 'siteId')).toBeDefined();
		});

		it('should fail when siteId is not a string', async () => {
			const errors = await validateDto({
				siteId: 123,
				email: 'user@example.com',
			});
			expect(errors.find((e) => e.property === 'siteId')).toBeDefined();
		});
	});

	describe('email', () => {
		it('should fail when email is missing', async () => {
			const errors = await validateDto({ siteId: 'site-123' });
			expect(errors.find((e) => e.property === 'email')).toBeDefined();
		});

		it('should fail when email is empty string', async () => {
			const errors = await validateDto({
				siteId: 'site-123',
				email: '',
			});
			expect(errors.find((e) => e.property === 'email')).toBeDefined();
		});

		it('should fail when email is not a string', async () => {
			const errors = await validateDto({
				siteId: 'site-123',
				email: 42,
			});
			expect(errors.find((e) => e.property === 'email')).toBeDefined();
		});

		it('should pass with any non-empty string (no email format validation)', async () => {
			// The DTO only uses @IsString() @IsNotEmpty(), no @IsEmail()
			const errors = await validateDto({
				siteId: 'site-123',
				email: 'not-actually-an-email',
			});
			expect(errors).toHaveLength(0);
		});
	});

	it('should fail when both fields are missing', async () => {
		const errors = await validateDto({});
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});
});
