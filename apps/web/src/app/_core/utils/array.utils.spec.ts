import {
	arrayMove,
	pluckFirst,
	pluckFromArray,
	ReduceOperation,
	groupEntities,
	sortEntities,
	joinWithProp,
} from './array.utils';

describe('Array Utils', () => {
	describe('arrayMove', () => {
		it('should move item from one index to another', () => {
			const arr = ['a', 'b', 'c', 'd'];
			const result = arrayMove(arr, 0, 2);
			expect(result).toEqual(['b', 'c', 'a', 'd']);
		});

		it('should handle moving to the end', () => {
			const arr = ['a', 'b', 'c'];
			const result = arrayMove(arr, 0, 2);
			expect(result).toEqual(['b', 'c', 'a']);
		});

		it('should handle moving to beginning', () => {
			const arr = ['a', 'b', 'c'];
			const result = arrayMove(arr, 2, 0);
			expect(result).toEqual(['c', 'a', 'b']);
		});

		it('should extend array if newIndex exceeds length', () => {
			const arr = ['a', 'b'];
			const result = arrayMove(arr, 0, 4);
			expect(result.length).toBe(5);
			expect(result[4]).toBe('a');
		});

		it('should handle same index', () => {
			const arr = ['a', 'b', 'c'];
			const result = arrayMove(arr, 1, 1);
			expect(result).toEqual(['a', 'b', 'c']);
		});
	});

	describe('pluckFirst', () => {
		it('should return first item from array', () => {
			expect(pluckFirst([1, 2, 3])).toBe(1);
			expect(pluckFirst(['a', 'b', 'c'])).toBe('a');
		});

		it('should return undefined for empty array', () => {
			expect(pluckFirst([])).toBeUndefined();
		});

		it('should return undefined for null/undefined', () => {
			expect(pluckFirst(null as any)).toBeUndefined();
			expect(pluckFirst(undefined as any)).toBeUndefined();
		});

		it('should return first item even if falsy', () => {
			expect(pluckFirst([0, 1, 2])).toBe(0);
			expect(pluckFirst([null, 'a'])).toBeNull();
		});
	});

	describe('pluckFromArray', () => {
		const testData = [
			{ id: 1, name: 'Alice', score: 90, category: 'A' },
			{ id: 2, name: 'Bob', score: 80, category: 'B' },
			{ id: 3, name: 'Charlie', score: 85, category: 'A' },
		];

		describe('JOIN operation', () => {
			it('should join property values with comma', () => {
				const result = pluckFromArray(
					testData,
					'name',
					ReduceOperation.JOIN,
				);
				expect(result).toBe('Alice, Bob, Charlie');
			});
		});

		describe('COUNT operation', () => {
			it('should return count of items', () => {
				const result = pluckFromArray(
					testData,
					'name',
					ReduceOperation.COUNT,
				);
				expect(result).toBe(3);
			});
		});

		describe('SUM operation', () => {
			it('should sum numeric property values', () => {
				const result = pluckFromArray(
					testData,
					'score',
					ReduceOperation.SUM,
				);
				expect(result).toBe(255);
			});
		});

		describe('AVERAGE operation', () => {
			it('should calculate average of numeric property values', () => {
				const result = pluckFromArray(
					testData,
					'score',
					ReduceOperation.AVERAGE,
				);
				expect(result).toBe(85);
			});
		});

		describe('FIRST operation', () => {
			it('should return first item property value', () => {
				const result = pluckFromArray(
					testData,
					'name',
					ReduceOperation.FIRST,
				);
				expect(result).toBe('Alice');
			});

			it('should return empty array for empty input', () => {
				const result = pluckFromArray(
					[],
					'name',
					ReduceOperation.FIRST,
				);
				expect(result).toBeNull();
			});
		});

		describe('with filter', () => {
			it('should filter items before applying operation', () => {
				const result = pluckFromArray(
					testData,
					'name',
					ReduceOperation.JOIN,
					'category',
					'A',
				);
				expect(result).toBe('Alice, Charlie');
			});

			it('should count only filtered items', () => {
				const result = pluckFromArray(
					testData,
					'name',
					ReduceOperation.COUNT,
					'category',
					'A',
				);
				expect(result).toBe(2);
			});
		});

		describe('edge cases', () => {
			it('should return null for empty array', () => {
				expect(
					pluckFromArray([], 'name', ReduceOperation.JOIN),
				).toBeNull();
			});

			it('should return null for null input', () => {
				expect(
					pluckFromArray(null as any, 'name', ReduceOperation.JOIN),
				).toBeNull();
			});

			it('should return null for unknown operation', () => {
				expect(pluckFromArray(testData, 'name', 'unknown')).toBeNull();
			});
		});
	});

	describe('groupEntities', () => {
		it('should group items by iterator function result', () => {
			const items = [
				{ name: 'Alice', category: 'A' },
				{ name: 'Bob', category: 'B' },
				{ name: 'Charlie', category: 'A' },
			];

			const result = groupEntities(items, (item) => item.category);

			expect(result).toHaveLength(2);
			expect(result.find((g) => g.name === 'A')?.items).toHaveLength(2);
			expect(result.find((g) => g.name === 'B')?.items).toHaveLength(1);
		});

		it('should handle empty array', () => {
			const result = groupEntities([], (item: any) => item.category);
			expect(result).toEqual([]);
		});

		it('should handle single group', () => {
			const items = [
				{ name: 'Alice', category: 'A' },
				{ name: 'Bob', category: 'A' },
			];

			const result = groupEntities(items, (item) => item.category);
			expect(result).toHaveLength(1);
			expect(result[0].items).toHaveLength(2);
		});
	});

	describe('sortEntities', () => {
		it('should sort items by iterator function result', () => {
			const items = [
				{ name: 'Charlie' },
				{ name: 'Alice' },
				{ name: 'Bob' },
			];

			const result = sortEntities(items, (item) => item.name);

			expect(result[0].name).toBe('Alice');
			expect(result[1].name).toBe('Bob');
			expect(result[2].name).toBe('Charlie');
		});

		it('should sort numbers correctly', () => {
			const items = [{ value: 3 }, { value: 1 }, { value: 2 }];

			const result = sortEntities(items, (item) => item.value);

			expect(result[0].value).toBe(1);
			expect(result[1].value).toBe(2);
			expect(result[2].value).toBe(3);
		});

		it('should handle empty array', () => {
			const result = sortEntities([], (item: any) => item.name);
			expect(result).toEqual([]);
		});
	});

	describe('joinWithProp', () => {
		it('should join array items by property with default separator', () => {
			const items = [
				{ name: 'Alice' },
				{ name: 'Bob' },
				{ name: 'Charlie' },
			];
			const result = joinWithProp(items);
			expect(result).toBe('Alice, Bob, Charlie');
		});

		it('should use custom property path', () => {
			const items = [
				{ user: { name: 'Alice' } },
				{ user: { name: 'Bob' } },
			];
			const result = joinWithProp(items, 'user.name');
			expect(result).toBe('Alice, Bob');
		});

		it('should use custom separator', () => {
			const items = [{ name: 'Alice' }, { name: 'Bob' }];
			const result = joinWithProp(items, 'name', ' | ');
			expect(result).toBe('Alice | Bob');
		});

		it('should return empty string for non-array input', () => {
			expect(joinWithProp(null as any)).toBe('');
			expect(joinWithProp(undefined as any)).toBe('');
			expect(joinWithProp('string' as any)).toBe('');
		});

		it('should handle empty array', () => {
			expect(joinWithProp([])).toBe('');
		});
	});
});
