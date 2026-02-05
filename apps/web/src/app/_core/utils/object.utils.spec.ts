import {
	diffObjects,
	resolveDotNotationPath,
	setObjectValueAtPath,
	objectIsEmpty,
	getLastPropertyFromPath,
} from './object.utils';

describe('Object Utils', () => {
	describe('diffObjects', () => {
		it('should return empty object when objects are identical', () => {
			const o1 = { a: 1, b: 2 };
			const o2 = { a: 1, b: 2 };
			expect(diffObjects(o1, o2)).toEqual({});
		});

		it('should return differences when values differ', () => {
			const o1 = { a: 1, b: 2 };
			const o2 = { a: 1, b: 3 };
			expect(diffObjects(o1, o2)).toEqual({ b: 3 });
		});

		it('should include new keys from second object', () => {
			const o1 = { a: 1 };
			const o2 = { a: 1, b: 2 };
			expect(diffObjects(o1, o2)).toEqual({ b: 2 });
		});

		it('should handle empty objects', () => {
			expect(diffObjects({}, {})).toEqual({});
			expect(diffObjects({ a: 1 }, {})).toEqual({});
			expect(diffObjects({}, { a: 1 })).toEqual({ a: 1 });
		});

		it('should detect differences in nested objects by reference', () => {
			const nested = { x: 1 };
			const o1 = { a: nested };
			const o2 = { a: { x: 1 } };
			// Different references, so it's a difference
			expect(diffObjects(o1, o2)).toEqual({ a: { x: 1 } });
		});
	});

	describe('resolveDotNotationPath', () => {
		it('should resolve simple path', () => {
			const obj = { name: 'John' };
			expect(resolveDotNotationPath('name', obj)).toBe('John');
		});

		it('should resolve nested path', () => {
			const obj = { user: { profile: { name: 'John' } } };
			expect(resolveDotNotationPath('user.profile.name', obj)).toBe(
				'John',
			);
		});

		it('should return undefined for non-existent path', () => {
			const obj = { name: 'John' };
			expect(resolveDotNotationPath('age', obj)).toBeUndefined();
		});

		it('should return undefined for partial path', () => {
			const obj = { user: { name: 'John' } };
			expect(
				resolveDotNotationPath('user.profile.name', obj),
			).toBeUndefined();
		});

		it('should handle array access', () => {
			const obj = { users: [{ name: 'John' }, { name: 'Jane' }] };
			expect(resolveDotNotationPath('users.0.name', obj)).toBe('John');
			expect(resolveDotNotationPath('users.1.name', obj)).toBe('Jane');
		});

		it('should handle null/undefined path', () => {
			const obj = { name: 'John' };
			expect(resolveDotNotationPath(null as any, obj)).toBeUndefined();
			expect(
				resolveDotNotationPath(undefined as any, obj),
			).toBeUndefined();
		});

		it('should handle empty object', () => {
			expect(resolveDotNotationPath('name', {})).toBeUndefined();
		});
	});

	describe('setObjectValueAtPath', () => {
		it('should set value at simple path', () => {
			const obj: Record<string, unknown> = {};
			setObjectValueAtPath(obj, 'name', 'John');
			expect(obj.name).toBe('John');
		});

		it('should set value at nested path', () => {
			const obj: Record<string, unknown> = {};
			setObjectValueAtPath(obj, 'user.profile.name', 'John');
			expect((obj.user as any).profile.name).toBe('John');
		});

		it('should overwrite existing value', () => {
			const obj: Record<string, unknown> = { name: 'Jane' };
			setObjectValueAtPath(obj, 'name', 'John');
			expect(obj.name).toBe('John');
		});

		it('should handle array notation in path', () => {
			const obj: Record<string, unknown> = {};
			setObjectValueAtPath(obj, 'users[0].name', 'John');
			expect((obj.users as any)['0'].name).toBe('John');
		});

		it('should accept path as array', () => {
			const obj: Record<string, unknown> = {};
			setObjectValueAtPath(obj, ['user', 'name'], 'John');
			expect((obj.user as any).name).toBe('John');
		});

		it('should return the modified object', () => {
			const obj: Record<string, unknown> = {};
			const result = setObjectValueAtPath(obj, 'name', 'John');
			expect(result).toBe(obj);
		});
	});

	describe('objectIsEmpty', () => {
		it('should return true for empty object', () => {
			expect(objectIsEmpty({})).toBe(true);
		});

		it('should return true when all values are falsy', () => {
			expect(objectIsEmpty({ a: null, b: undefined, c: '' })).toBe(true);
			expect(objectIsEmpty({ a: 0 })).toBe(true);
			expect(objectIsEmpty({ a: false })).toBe(true);
		});

		it('should return false when any value is truthy', () => {
			expect(objectIsEmpty({ a: 1 })).toBe(false);
			expect(objectIsEmpty({ a: 'value' })).toBe(false);
			expect(objectIsEmpty({ a: null, b: 'value' })).toBe(false);
			expect(objectIsEmpty({ a: true })).toBe(false);
		});

		it('should return false for object with nested object', () => {
			expect(objectIsEmpty({ a: {} })).toBe(false);
			expect(objectIsEmpty({ a: [] })).toBe(false);
		});
	});

	describe('getLastPropertyFromPath', () => {
		it('should return last property from dotted path', () => {
			expect(getLastPropertyFromPath('user.profile.name')).toBe('name');
		});

		it('should return same value for single property path', () => {
			expect(getLastPropertyFromPath('name')).toBe('name');
		});

		it('should handle deeply nested paths', () => {
			expect(getLastPropertyFromPath('a.b.c.d.e.f')).toBe('f');
		});

		it('should handle empty string', () => {
			expect(getLastPropertyFromPath('')).toBe('');
		});
	});
});
