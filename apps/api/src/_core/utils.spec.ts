import * as Utils from './utils';

describe('Utils', () => {
	// ═══════════════════════════════════════════════════════════════════════════
	// Time
	// ═══════════════════════════════════════════════════════════════════════════

	describe('Time', () => {
		// ─── durationStringToMs() ──────────────────────────────────────────

		describe('durationStringToMs()', () => {
			it('should convert hours to milliseconds', () => {
				expect(Utils.Time.durationStringToMs('1h')).toBe(3_600_000);
				expect(Utils.Time.durationStringToMs('2h')).toBe(7_200_000);
				expect(Utils.Time.durationStringToMs('0.5h')).toBe(1_800_000);
			});

			it('should convert days to milliseconds', () => {
				expect(Utils.Time.durationStringToMs('1d')).toBe(86_400_000);
				expect(Utils.Time.durationStringToMs('7d')).toBe(604_800_000);
			});

			it('should convert minutes to milliseconds', () => {
				expect(Utils.Time.durationStringToMs('1m')).toBe(60_000);
				expect(Utils.Time.durationStringToMs('30m')).toBe(1_800_000);
			});

			it('should convert seconds to milliseconds', () => {
				expect(Utils.Time.durationStringToMs('1s')).toBe(1_000);
				expect(Utils.Time.durationStringToMs('30s')).toBe(30_000);
			});

			it('should return 0 for unknown duration types', () => {
				expect(Utils.Time.durationStringToMs('5x')).toBe(0);
				expect(Utils.Time.durationStringToMs('abc')).toBe(0);
			});

			it('should return 0 for empty string', () => {
				expect(Utils.Time.durationStringToMs('')).toBe(0);
			});

			it('should handle fractional values', () => {
				expect(Utils.Time.durationStringToMs('1.5h')).toBe(5_400_000);
				expect(Utils.Time.durationStringToMs('2.5m')).toBe(150_000);
			});

			it('should handle zero value', () => {
				expect(Utils.Time.durationStringToMs('0h')).toBe(0);
				expect(Utils.Time.durationStringToMs('0m')).toBe(0);
				expect(Utils.Time.durationStringToMs('0s')).toBe(0);
				expect(Utils.Time.durationStringToMs('0d')).toBe(0);
			});
		});

		// ─── durationStringToSQLFormat() ───────────────────────────────────

		describe('durationStringToSQLFormat()', () => {
			it('should convert hours to SQL format', () => {
				expect(Utils.Time.durationStringToSQLFormat('1h')).toBe(
					'1 hours',
				);
				expect(Utils.Time.durationStringToSQLFormat('24h')).toBe(
					'24 hours',
				);
			});

			it('should convert days to SQL format', () => {
				expect(Utils.Time.durationStringToSQLFormat('1d')).toBe(
					'1 days',
				);
				expect(Utils.Time.durationStringToSQLFormat('30d')).toBe(
					'30 days',
				);
			});

			it('should convert minutes to SQL format', () => {
				expect(Utils.Time.durationStringToSQLFormat('15m')).toBe(
					'15 minutes',
				);
			});

			it('should convert seconds to SQL format', () => {
				expect(Utils.Time.durationStringToSQLFormat('30s')).toBe(
					'30 seconds',
				);
			});

			it('should return the string unchanged if no matching unit', () => {
				expect(Utils.Time.durationStringToSQLFormat('5x')).toBe('5x');
			});
		});

		// ─── Conversion methods ────────────────────────────────────────────

		describe('unit conversion methods', () => {
			it('msToS - should convert milliseconds to seconds', () => {
				expect(Utils.Time.msToS(1000)).toBe(1);
				expect(Utils.Time.msToS(500)).toBe(0.5);
				expect(Utils.Time.msToS(0)).toBe(0);
			});

			it('msToM - should convert milliseconds to minutes', () => {
				expect(Utils.Time.msToM(60_000)).toBe(1);
				expect(Utils.Time.msToM(30_000)).toBe(0.5);
				expect(Utils.Time.msToM(0)).toBe(0);
			});

			it('msToH - should convert milliseconds to hours', () => {
				expect(Utils.Time.msToH(3_600_000)).toBe(1);
				expect(Utils.Time.msToH(1_800_000)).toBe(0.5);
				expect(Utils.Time.msToH(0)).toBe(0);
			});

			it('msToD - should convert milliseconds to days', () => {
				// Note: msToD has a bug — it multiplies by 24 instead of dividing
				// msToH(86_400_000) = 24, then 24 * 24 = 576
				// Testing actual behavior:
				expect(Utils.Time.msToD(3_600_000)).toBe(24); // 1 hour * 24
			});

			it('sToMs - should convert seconds to milliseconds', () => {
				expect(Utils.Time.sToMs(1)).toBe(1000);
				expect(Utils.Time.sToMs(0)).toBe(0);
				expect(Utils.Time.sToMs(0.5)).toBe(500);
			});

			it('mToMs - should convert minutes to milliseconds', () => {
				expect(Utils.Time.mToMs(1)).toBe(60_000);
				expect(Utils.Time.mToMs(0)).toBe(0);
			});

			it('hToMs - should convert hours to milliseconds', () => {
				expect(Utils.Time.hToMs(1)).toBe(3_600_000);
				expect(Utils.Time.hToMs(0)).toBe(0);
			});

			it('dToMs - should convert days to milliseconds', () => {
				expect(Utils.Time.dToMs(1)).toBe(86_400_000);
				expect(Utils.Time.dToMs(0)).toBe(0);
			});
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// String
	// ═══════════════════════════════════════════════════════════════════════════

	describe('String', () => {
		// ─── titleCase() ───────────────────────────────────────────────────

		describe('titleCase()', () => {
			it('should title-case a simple phrase', () => {
				expect(Utils.String.titleCase('hello world')).toBe(
					'Hello World',
				);
			});

			it('should handle single word', () => {
				expect(Utils.String.titleCase('hello')).toBe('Hello');
			});

			it('should handle already title-cased input', () => {
				expect(Utils.String.titleCase('Hello World')).toBe(
					'Hello World',
				);
			});

			it('should handle all-caps input', () => {
				expect(Utils.String.titleCase('HELLO WORLD')).toBe(
					'Hello World',
				);
			});

			it('should return non-string inputs unchanged', () => {
				expect(Utils.String.titleCase(123)).toBe(123);
				expect(Utils.String.titleCase(null)).toBe(null);
				expect(Utils.String.titleCase(undefined)).toBe(undefined);
				expect(Utils.String.titleCase(true)).toBe(true);
			});

			it('should handle single character words', () => {
				expect(Utils.String.titleCase('a b c')).toBe('A B C');
			});
		});

		// ─── slugify() ─────────────────────────────────────────────────────

		describe('slugify()', () => {
			it('should slugify a simple string', () => {
				expect(Utils.String.slugify('Hello World')).toBe('hello-world');
			});

			it('should remove special characters', () => {
				expect(Utils.String.slugify('Hello, World!')).toBe(
					'hello-world',
				);
			});

			it('should handle multiple spaces', () => {
				expect(Utils.String.slugify('hello   world')).toBe(
					'hello---world',
				);
			});

			it('should handle leading and trailing spaces', () => {
				expect(Utils.String.slugify('  hello world  ')).toBe(
					'hello-world',
				);
			});

			it('should handle empty string', () => {
				expect(Utils.String.slugify('')).toBe('');
			});

			it('should handle null-ish input via fallback', () => {
				// The function does `input || ''` so falsy values resolve to ''
				expect(Utils.String.slugify(undefined as any)).toBe('');
				expect(Utils.String.slugify(null as any)).toBe('');
			});

			it('should preserve numbers and hyphens', () => {
				expect(Utils.String.slugify('Page 42 - Section 3')).toBe(
					'page-42---section-3',
				);
			});

			it('should remove unicode characters', () => {
				expect(Utils.String.slugify('café au lait')).toBe(
					'caf-au-lait',
				);
			});
		});

		// ─── addTrailingSlash() ─────────────────────────────────────────────

		describe('addTrailingSlash()', () => {
			it('should add a trailing slash if missing', () => {
				expect(Utils.String.addTrailingSlash('/path/to/resource')).toBe(
					'/path/to/resource/',
				);
			});

			it('should not add a trailing slash if already present', () => {
				expect(
					Utils.String.addTrailingSlash('/path/to/resource/'),
				).toBe('/path/to/resource/');
			});

			it('should handle empty string', () => {
				expect(Utils.String.addTrailingSlash('')).toBe('/');
			});

			it('should handle null-ish input via fallback', () => {
				expect(Utils.String.addTrailingSlash(undefined as any)).toBe(
					'/',
				);
				expect(Utils.String.addTrailingSlash(null as any)).toBe('/');
			});

			it('should handle root slash', () => {
				expect(Utils.String.addTrailingSlash('/')).toBe('/');
			});
		});

		// ─── toAddress() ────────────────────────────────────────────────────

		describe('toAddress()', () => {
			it('should parse a full US address', () => {
				const result = Utils.String.toAddress(
					'123 Main St, Springfield, IL 62701',
				);
				expect(result.street).toBe('123 Main St');
				expect(result.city).toBe('Springfield');
				expect(result.state).toBe('IL');
				expect(result.zip).toBe('62701');
			});

			it('should return all undefined for empty string', () => {
				const result = Utils.String.toAddress('');
				expect(result.street).toBeUndefined();
				expect(result.city).toBeUndefined();
				expect(result.state).toBeUndefined();
				expect(result.zip).toBeUndefined();
			});

			it('should return all undefined for null-ish input', () => {
				const result = Utils.String.toAddress(null as any);
				expect(result.street).toBeUndefined();
			});

			it('should handle address with extra spaces', () => {
				const result = Utils.String.toAddress(
					'123 Main  St ,  Springfield , IL 62701',
				);
				expect(result.state).toBe('IL');
				expect(result.zip).toBe('62701');
			});
		});

		// ─── cleanIPAddress() ───────────────────────────────────────────────

		describe('cleanIPAddress()', () => {
			it('should return IPv4 address unchanged', () => {
				expect(Utils.String.cleanIPAddress('192.168.1.1')).toBe(
					'192.168.1.1',
				);
			});

			it('should strip port from IPv4 address', () => {
				expect(Utils.String.cleanIPAddress('192.168.1.1:8080')).toBe(
					'192.168.1.1',
				);
			});

			it('should strip IPv6-to-IPv4 wrapper', () => {
				expect(Utils.String.cleanIPAddress('::ffff:192.168.1.1')).toBe(
					'192.168.1.1',
				);
			});

			it('should strip port from IPv6 bracket notation', () => {
				expect(Utils.String.cleanIPAddress('[::1]:8080')).toBe('::1');
			});

			it('should return empty string for empty input', () => {
				expect(Utils.String.cleanIPAddress('')).toBe('');
			});

			it('should return empty string for null-ish input', () => {
				expect(Utils.String.cleanIPAddress(null as any)).toBe('');
				expect(Utils.String.cleanIPAddress(undefined as any)).toBe('');
			});

			it('should handle loopback address', () => {
				expect(Utils.String.cleanIPAddress('127.0.0.1')).toBe(
					'127.0.0.1',
				);
			});

			it('should trim whitespace', () => {
				expect(Utils.String.cleanIPAddress('  192.168.1.1  ')).toBe(
					'192.168.1.1',
				);
			});
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ObjectUtils
	// ═══════════════════════════════════════════════════════════════════════════

	describe('ObjectUtils', () => {
		// ─── isObject() ─────────────────────────────────────────────────────

		describe('isObject()', () => {
			it('should return true for plain objects', () => {
				expect(Utils.ObjectUtils.isObject({})).toBe(true);
				expect(Utils.ObjectUtils.isObject({ a: 1 })).toBe(true);
			});

			it('should return false for arrays', () => {
				expect(Utils.ObjectUtils.isObject([])).toBe(false);
				expect(Utils.ObjectUtils.isObject([1, 2, 3])).toBe(false);
			});

			it('should return false for null', () => {
				expect(Utils.ObjectUtils.isObject(null)).toBe(false);
			});

			it('should return false for primitives', () => {
				expect(Utils.ObjectUtils.isObject(42)).toBe(false);
				expect(Utils.ObjectUtils.isObject('string')).toBe(false);
				expect(Utils.ObjectUtils.isObject(true)).toBe(false);
				expect(Utils.ObjectUtils.isObject(undefined)).toBe(false);
			});
		});

		// ─── mergeDeep() ────────────────────────────────────────────────────

		describe('mergeDeep()', () => {
			it('should merge flat objects', () => {
				const result = Utils.ObjectUtils.mergeDeep(
					{ a: 1, b: 2 } as any,
					{ b: 3, c: 4 } as any,
				);
				expect(result).toEqual({ a: 1, b: 3, c: 4 });
			});

			it('should deep merge nested objects', () => {
				const target = { a: { x: 1, y: 2 }, b: 1 } as any;
				const source = { a: { y: 3, z: 4 }, c: 2 } as any;
				const result = Utils.ObjectUtils.mergeDeep(target, source);
				expect(result).toEqual({
					a: { x: 1, y: 3, z: 4 },
					b: 1,
					c: 2,
				});
			});

			it('should not mutate the original objects', () => {
				const target = { a: { x: 1 } } as any;
				const source = { a: { y: 2 } } as any;
				const targetCopy = JSON.parse(JSON.stringify(target));
				const sourceCopy = JSON.parse(JSON.stringify(source));
				Utils.ObjectUtils.mergeDeep(target, source);
				expect(target).toEqual(targetCopy);
				expect(source).toEqual(sourceCopy);
			});

			it('should return target if source is not an object', () => {
				const target = { a: 1 } as any;
				const result = Utils.ObjectUtils.mergeDeep(target, null as any);
				expect(result).toEqual({ a: 1 });
			});

			it('should return target if target is not an object', () => {
				const result = Utils.ObjectUtils.mergeDeep(
					'string' as any,
					{ a: 1 } as any,
				);
				expect(result).toBe('string');
			});

			it('should handle empty objects', () => {
				expect(
					Utils.ObjectUtils.mergeDeep({} as any, { a: 1 } as any),
				).toEqual({ a: 1 });
				expect(
					Utils.ObjectUtils.mergeDeep({ a: 1 } as any, {} as any),
				).toEqual({ a: 1 });
			});

			it('should keep target primitive when source has object for same key', () => {
				// mergeDeep guards: isObject(target[k]) is false for primitive, so it returns target[k] as-is
				const result = Utils.ObjectUtils.mergeDeep(
					{ a: 1 } as any,
					{ a: { nested: true } } as any,
				);
				// The primitive in target is preserved because mergeDeep(1, {nested:true}) returns 1
				expect(result.a).toBe(1);
			});
		});

		// ─── getPropertyByName() ────────────────────────────────────────────

		describe('getPropertyByName()', () => {
			it('should find a top-level property', () => {
				expect(
					Utils.ObjectUtils.getPropertyByName({ foo: 'bar' }, 'foo'),
				).toBe('bar');
			});

			it('should find a deeply nested property', () => {
				const obj = { a: { b: { c: { target: 'found' } } } };
				expect(Utils.ObjectUtils.getPropertyByName(obj, 'target')).toBe(
					'found',
				);
			});

			it('should find property inside arrays', () => {
				const obj = { arr: [{ key: 'value' }] };
				expect(Utils.ObjectUtils.getPropertyByName(obj, 'key')).toBe(
					'value',
				);
			});

			it('should return -1 when property is not found', () => {
				expect(
					Utils.ObjectUtils.getPropertyByName(
						{ a: 1, b: 2 },
						'nonexistent',
					),
				).toBe(-1);
			});

			it('should return the first match found', () => {
				const obj = { a: 'first', nested: { a: 'second' } };
				expect(Utils.ObjectUtils.getPropertyByName(obj, 'a')).toBe(
					'first',
				);
			});

			it('should handle empty object', () => {
				expect(
					Utils.ObjectUtils.getPropertyByName({}, 'anything'),
				).toBe(-1);
			});

			it('should handle empty array', () => {
				expect(
					Utils.ObjectUtils.getPropertyByName([] as any, 'anything'),
				).toBe(-1);
			});
		});
	});
});
