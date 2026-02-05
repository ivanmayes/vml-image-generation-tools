import { ShortNumberPipe } from './short-number.pipe';

describe('ShortNumberPipe', () => {
	let pipe: ShortNumberPipe;

	beforeEach(() => {
		pipe = new ShortNumberPipe();
	});

	it('should create an instance', () => {
		expect(pipe).toBeTruthy();
	});

	describe('transform', () => {
		describe('falsy values', () => {
			it('should return null for null input', () => {
				expect(pipe.transform(null)).toBeNull();
			});

			it('should return undefined for undefined input', () => {
				expect(pipe.transform(undefined)).toBeUndefined();
			});

			it('should return 0 for 0 input', () => {
				expect(pipe.transform(0)).toBe(0);
			});

			it('should return empty string for empty string input', () => {
				expect(pipe.transform('')).toBe('');
			});
		});

		describe('small positive numbers (< 1000)', () => {
			it('should return the number as-is for values under 1000', () => {
				expect(pipe.transform(500)).toBe(500);
				expect(pipe.transform(999)).toBe(999);
				expect(pipe.transform(1)).toBe(1);
			});

			it('should apply decimal places when args provided for small numbers', () => {
				expect(pipe.transform(500, 2)).toBe('500.00');
				expect(pipe.transform(123.456, 1)).toBe('123.5');
			});
		});

		describe('small negative numbers (> -1000)', () => {
			it('should return the number as-is for values between -1000 and 0', () => {
				expect(pipe.transform(-500)).toBe(-500);
				expect(pipe.transform(-999)).toBe(-999);
				expect(pipe.transform(-1)).toBe(-1);
			});
		});

		describe('thousands (K)', () => {
			it('should format thousands with K suffix', () => {
				expect(pipe.transform(1000, 0)).toBe('1K');
				expect(pipe.transform(1500, 1)).toBe('1.5K');
				expect(pipe.transform(999999, 0)).toBe('1000K');
			});

			it('should handle negative thousands', () => {
				expect(pipe.transform(-1000, 0)).toBe('-1K');
				expect(pipe.transform(-1500, 1)).toBe('-1.5K');
			});
		});

		describe('millions (M)', () => {
			it('should format millions with M suffix', () => {
				expect(pipe.transform(1000000, 0)).toBe('1M');
				expect(pipe.transform(1500000, 1)).toBe('1.5M');
				expect(pipe.transform(2500000, 2)).toBe('2.50M');
			});

			it('should handle negative millions', () => {
				expect(pipe.transform(-1000000, 0)).toBe('-1M');
				expect(pipe.transform(-2500000, 1)).toBe('-2.5M');
			});
		});

		describe('billions (B)', () => {
			it('should format billions with B suffix', () => {
				expect(pipe.transform(1000000000, 0)).toBe('1B');
				expect(pipe.transform(1500000000, 1)).toBe('1.5B');
			});

			it('should handle negative billions', () => {
				expect(pipe.transform(-1000000000, 0)).toBe('-1B');
			});
		});

		describe('trillions (T)', () => {
			it('should format trillions with T suffix', () => {
				expect(pipe.transform(1000000000000, 0)).toBe('1T');
				expect(pipe.transform(1500000000000, 1)).toBe('1.5T');
			});
		});

		describe('string input', () => {
			it('should handle numeric strings', () => {
				expect(pipe.transform('1000', 0)).toBe('1K');
				expect(pipe.transform('500')).toBe(500);
			});
		});

		describe('NaN handling', () => {
			it('should return NaN for non-numeric strings', () => {
				expect(pipe.transform('abc')).toBeNaN();
			});
		});
	});

	describe('isNumeric', () => {
		it('should return true for positive integers', () => {
			expect(pipe.isNumeric(123)).toBe(true);
			expect(pipe.isNumeric('456')).toBe(true);
		});

		it('should return true for negative integers', () => {
			expect(pipe.isNumeric(-123)).toBe(true);
		});

		it('should return true for positive decimals', () => {
			expect(pipe.isNumeric(123.45)).toBe(true);
			expect(pipe.isNumeric('123.45')).toBe(true);
		});

		it('should return true for negative decimals', () => {
			expect(pipe.isNumeric(-123.45)).toBe(true);
		});

		it('should return false for non-numeric strings', () => {
			expect(pipe.isNumeric('abc')).toBe(false);
			expect(pipe.isNumeric('12abc')).toBe(false);
		});

		it('should return true for zero', () => {
			expect(pipe.isNumeric(0)).toBe(true);
			expect(pipe.isNumeric('0')).toBe(true);
		});
	});
});
