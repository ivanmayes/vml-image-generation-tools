export class LruCache<K, V> {
	private cache: Map<K, V>;
	private accessOrder: K[];
	private readonly maxSize: number;

	constructor(maxSize = 50) {
		this.maxSize = maxSize;
		this.cache = new Map<K, V>();
		this.accessOrder = [];
	}

	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			this.updateAccessOrder(key);
		}
		return value;
	}

	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.set(key, value);
			this.updateAccessOrder(key);
			return;
		}
		if (this.cache.size >= this.maxSize) {
			this.evictLeastRecentlyUsed();
		}
		this.cache.set(key, value);
		this.accessOrder.push(key);
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	clear(): void {
		this.cache.clear();
		this.accessOrder = [];
	}

	get size(): number {
		return this.cache.size;
	}

	private updateAccessOrder(key: K): void {
		const index = this.accessOrder.indexOf(key);
		if (index > -1) {
			this.accessOrder.splice(index, 1);
		}
		this.accessOrder.push(key);
	}

	private evictLeastRecentlyUsed(): void {
		if (this.accessOrder.length === 0) return;
		const lruKey = this.accessOrder.shift();
		if (lruKey !== undefined) {
			this.cache.delete(lruKey);
		}
	}
}
