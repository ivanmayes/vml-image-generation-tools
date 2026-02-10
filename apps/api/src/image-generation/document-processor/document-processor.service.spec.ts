/**
 * Pure-logic unit tests for DocumentProcessorService.
 *
 * Tests the private splitIntoChunks() and cosineSimilarity() methods.
 * These are the core algorithmic functions that can be tested without mocks.
 */
import { DocumentProcessorService } from './document-processor.service';

function createService(): DocumentProcessorService {
	// Pass null for DI deps — pure methods never touch them
	return new DocumentProcessorService(null as any, null as any);
}

describe('DocumentProcessorService — pure logic', () => {
	let service: DocumentProcessorService;

	beforeEach(() => {
		service = createService();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// splitIntoChunks()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('splitIntoChunks()', () => {
		const split = (text: string) => (service as any).splitIntoChunks(text);

		it('should return empty array for empty string', () => {
			expect(split('')).toEqual([]);
		});

		it('should return empty array for whitespace-only string', () => {
			expect(split('   \n\t   ')).toEqual([]);
		});

		it('should return single chunk for short text', () => {
			const text = 'This is a short text.';
			const chunks = split(text);
			expect(chunks).toHaveLength(1);
			expect(chunks[0]).toBe('This is a short text.');
		});

		it('should return single chunk for text exactly at CHUNK_SIZE', () => {
			// CHUNK_SIZE is 1000
			const text = 'A'.repeat(1000);
			const chunks = split(text);
			expect(chunks).toHaveLength(1);
			expect(chunks[0]).toBe(text);
		});

		it('should split text longer than CHUNK_SIZE into multiple chunks', () => {
			// Create text that is clearly larger than CHUNK_SIZE (1000)
			const words = Array(300).fill('word').join(' '); // ~1500 chars
			const chunks = split(words);
			expect(chunks.length).toBeGreaterThan(1);
		});

		it('should produce overlapping chunks', () => {
			// Create deterministic text with enough content
			const sentences: string[] = [];
			for (let i = 0; i < 50; i++) {
				sentences.push(`Sentence number ${i} has some content in it.`);
			}
			const text = sentences.join(' ');
			const chunks = split(text);

			if (chunks.length >= 2) {
				// The end of chunk 1 and start of chunk 2 should overlap
				// Due to CHUNK_OVERLAP (200), there should be shared text
				const chunk1End = chunks[0].slice(-100);
				const chunk2Start = chunks[1].slice(0, 200);
				// Some of chunk1's ending should appear in chunk2's beginning
				expect(chunk2Start).toContain(
					chunk1End.trim().split(' ').pop(),
				);
			}
		});

		it('should normalize whitespace (collapse multiple spaces)', () => {
			const text = 'Hello   world    this   has    extra   spaces';
			const chunks = split(text);
			expect(chunks[0]).toBe('Hello world this has extra spaces');
		});

		it('should try to break at sentence boundaries', () => {
			// Create text where a period falls near the chunk boundary
			const part1 = 'A'.repeat(800) + '. ';
			const part2 = 'B'.repeat(500);
			const text = part1 + part2;
			const chunks = split(text);

			if (chunks.length >= 2) {
				// First chunk should ideally end at a sentence boundary
				expect(
					chunks[0].endsWith('.') || chunks[0].endsWith('. '),
				).toBe(true);
			}
		});

		it('should handle text with no spaces or periods gracefully', () => {
			const text = 'A'.repeat(2500);
			const chunks = split(text);
			expect(chunks.length).toBeGreaterThan(1);
			// Each chunk should be at most CHUNK_SIZE
			for (const chunk of chunks) {
				expect(chunk.length).toBeLessThanOrEqual(1000);
			}
		});

		it('should handle very large text without hanging', () => {
			const text = Array(5000)
				.fill('The quick brown fox jumps over the lazy dog.')
				.join(' ');
			const chunks = split(text);
			expect(chunks.length).toBeGreaterThan(10);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// cosineSimilarity()
	// ═══════════════════════════════════════════════════════════════════════════

	describe('cosineSimilarity()', () => {
		const cosine = (a: number[], b: number[]) =>
			(service as any).cosineSimilarity(a, b);

		it('should return 1 for identical vectors', () => {
			expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 5);
		});

		it('should return 1 for proportional vectors', () => {
			expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1.0, 5);
		});

		it('should return 0 for orthogonal vectors', () => {
			expect(cosine([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
		});

		it('should return -1 for opposite vectors', () => {
			expect(cosine([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0, 5);
		});

		it('should return 0 for zero vectors', () => {
			expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
			expect(cosine([1, 2, 3], [0, 0, 0])).toBe(0);
			expect(cosine([0, 0, 0], [0, 0, 0])).toBe(0);
		});

		it('should throw for vectors of different lengths', () => {
			expect(() => cosine([1, 2], [1, 2, 3])).toThrow(
				'Vectors must have the same length',
			);
		});

		it('should handle single-element vectors', () => {
			expect(cosine([5], [3])).toBeCloseTo(1.0, 5);
			expect(cosine([5], [-3])).toBeCloseTo(-1.0, 5);
		});

		it('should handle high-dimensional vectors', () => {
			const a = Array(768)
				.fill(0)
				.map((_, i) => Math.sin(i));
			const b = Array(768)
				.fill(0)
				.map((_, i) => Math.cos(i));
			const result = cosine(a, b);
			expect(result).toBeGreaterThanOrEqual(-1);
			expect(result).toBeLessThanOrEqual(1);
		});

		it('should be symmetric', () => {
			const a = [1, 3, -5, 2];
			const b = [4, -2, -1, 8];
			expect(cosine(a, b)).toBeCloseTo(cosine(b, a), 10);
		});
	});
});
