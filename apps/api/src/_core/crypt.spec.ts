import { Crypt, CIPHERS } from './crypt';

describe('Crypt', () => {
	// ─── random() ──────────────────────────────────────────────────────────────

	describe('random()', () => {
		it('should return a number between 0 and 1 (exclusive)', () => {
			for (let i = 0; i < 100; i++) {
				const r = Crypt.random();
				expect(typeof r).toBe('number');
				expect(r).toBeGreaterThanOrEqual(0);
				expect(r).toBeLessThanOrEqual(1);
			}
		});

		it('should produce different values on consecutive calls', () => {
			const values = new Set<number>();
			for (let i = 0; i < 50; i++) {
				values.add(Crypt.random());
			}
			// With 50 cryptographically-random values, duplicates are astronomically unlikely
			expect(values.size).toBeGreaterThan(40);
		});

		it('should accept a custom byte size parameter', () => {
			const r = Crypt.random(64);
			expect(typeof r).toBe('number');
			expect(r).toBeGreaterThanOrEqual(0);
			expect(r).toBeLessThanOrEqual(1);
		});
	});

	// ─── randomHex() ───────────────────────────────────────────────────────────

	describe('randomHex()', () => {
		it('should return a hex string of default length (64 hex chars for 32 bytes)', () => {
			const hex = Crypt.randomHex();
			expect(hex).toMatch(/^[0-9a-f]+$/);
			expect(hex.length).toBe(64);
		});

		it('should return hex string with custom byte count', () => {
			const hex = Crypt.randomHex(16);
			expect(hex).toMatch(/^[0-9a-f]+$/);
			expect(hex.length).toBe(32);
		});

		it('should produce unique values', () => {
			const a = Crypt.randomHex();
			const b = Crypt.randomHex();
			expect(a).not.toBe(b);
		});

		it('should handle 1-byte request', () => {
			const hex = Crypt.randomHex(1);
			expect(hex).toMatch(/^[0-9a-f]{2}$/);
		});
	});

	// ─── randomBase64() ────────────────────────────────────────────────────────

	describe('randomBase64()', () => {
		it('should return a valid base64 string for default bytes', () => {
			const b64 = Crypt.randomBase64();
			expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
			// 32 bytes → ceil(32/3)*4 = 44 base64 chars
			expect(b64.length).toBe(44);
		});

		it('should return base64 string with custom byte count', () => {
			const b64 = Crypt.randomBase64(16);
			expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
			expect(b64.length).toBe(24);
		});

		it('should produce unique values', () => {
			const a = Crypt.randomBase64();
			const b = Crypt.randomBase64();
			expect(a).not.toBe(b);
		});
	});

	// ─── createSHA256Hash() ────────────────────────────────────────────────────

	describe('createSHA256Hash()', () => {
		it('should create a deterministic SHA256 hash', () => {
			const hash = Crypt.createSHA256Hash(
				'A_T0tally_Fake_Signing_K#y',
				'SomeUser@email.com',
			);
			expect(hash).toBe('Cp9i0g9HzUwZ/gtZg9/tOtDa9FS2TCPtlm77sEAzZs0=');
		});

		it('should produce the same hash for the same input on repeated calls', () => {
			const hash1 = Crypt.createSHA256Hash('hello', 'world');
			const hash2 = Crypt.createSHA256Hash('hello', 'world');
			expect(hash1).toBe(hash2);
		});

		it('should produce different hashes for different inputs', () => {
			const hash1 = Crypt.createSHA256Hash('hello');
			const hash2 = Crypt.createSHA256Hash('world');
			expect(hash1).not.toBe(hash2);
		});

		it('should handle empty string input', () => {
			const hash = Crypt.createSHA256Hash('');
			expect(typeof hash).toBe('string');
			expect(hash.length).toBeGreaterThan(0);
		});

		it('should handle single argument', () => {
			const hash = Crypt.createSHA256Hash('onlyone');
			expect(typeof hash).toBe('string');
		});

		it('should handle many arguments by joining them', () => {
			// SHA256('abc') === SHA256('a'+'b'+'c') because args.join('')
			const hashSingle = Crypt.createSHA256Hash('abc');
			const hashMulti = Crypt.createSHA256Hash('a', 'b', 'c');
			expect(hashSingle).toBe(hashMulti);
		});

		it('should handle unicode input', () => {
			const hash = Crypt.createSHA256Hash('日本語テスト', '🎉');
			expect(typeof hash).toBe('string');
			expect(hash.length).toBeGreaterThan(0);
		});

		it('should return a base64-encoded string', () => {
			const hash = Crypt.createSHA256Hash('test');
			expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
		});
	});

	// ─── createHMACHash() ──────────────────────────────────────────────────────

	describe('createHMACHash()', () => {
		it('should create a deterministic HMAC hash', () => {
			const hmac1 = Crypt.createHMACHash('secret', 'data');
			const hmac2 = Crypt.createHMACHash('secret', 'data');
			expect(hmac1).toBe(hmac2);
		});

		it('should produce different hashes with different secrets', () => {
			const hmac1 = Crypt.createHMACHash('secret1', 'data');
			const hmac2 = Crypt.createHMACHash('secret2', 'data');
			expect(hmac1).not.toBe(hmac2);
		});

		it('should produce different hashes with different data', () => {
			const hmac1 = Crypt.createHMACHash('secret', 'data1');
			const hmac2 = Crypt.createHMACHash('secret', 'data2');
			expect(hmac1).not.toBe(hmac2);
		});

		it('should handle empty data', () => {
			const hmac = Crypt.createHMACHash('secret', '');
			expect(typeof hmac).toBe('string');
			expect(hmac.length).toBeGreaterThan(0);
		});

		it('should handle unicode in secret and data', () => {
			const hmac = Crypt.createHMACHash('秘密', 'データ');
			expect(typeof hmac).toBe('string');
		});

		it('should join multiple data arguments', () => {
			const hmacSingle = Crypt.createHMACHash('secret', 'abc');
			const hmacMulti = Crypt.createHMACHash('secret', 'a', 'b', 'c');
			expect(hmacSingle).toBe(hmacMulti);
		});

		it('should return a base64-encoded string', () => {
			const hmac = Crypt.createHMACHash('secret', 'data');
			expect(hmac).toMatch(/^[A-Za-z0-9+/]+=*$/);
		});
	});

	// ─── encrypt() / decrypt() round-trip ──────────────────────────────────────

	describe('encrypt() / decrypt() round-trip', () => {
		const signingKey = 'Cp9i0g9HzUwZ/gtZg9/tOtDa9FS2TCPtlm77sEAzZs0=';
		const iv = 'd52c4b9782c65864';

		it('should encrypt and decrypt a simple string', () => {
			const plaintext = 'This is only a test. No cause for alarm.';
			const encrypted = Crypt.encrypt(plaintext, signingKey, iv);
			expect(encrypted).not.toBe(plaintext);
			const decrypted = Crypt.decrypt(encrypted, signingKey, iv);
			expect(decrypted).toBe(plaintext);
		});

		it('should produce the known ciphertext for the test data', () => {
			const plaintext = 'This is only a test. No cause for alarm.';
			const encrypted = Crypt.encrypt(plaintext, signingKey, iv);
			expect(encrypted).toBe(
				'wsIyLLkq1bb6pQ99BweMnpwcWeeNzluaaPbTTVEBvhv6RnTVXUAgZNUtd9+fIFSm',
			);
		});

		it('should fail to decrypt with the wrong IV', () => {
			const plaintext = 'This is only a test. No cause for alarm.';
			const encrypted = Crypt.encrypt(plaintext, signingKey, iv);
			const wrongIv = 'd52c4b9782c65865';
			const decrypted = Crypt.decrypt(encrypted, signingKey, wrongIv);
			expect(decrypted).not.toBe(plaintext);
		});

		it('should round-trip empty string', () => {
			const encrypted = Crypt.encrypt('', signingKey, iv);
			const decrypted = Crypt.decrypt(encrypted, signingKey, iv);
			expect(decrypted).toBe('');
		});

		it('should round-trip unicode text', () => {
			const plaintext = '日本語テスト 🎉 émojis and accénts';
			const encrypted = Crypt.encrypt(plaintext, signingKey, iv);
			const decrypted = Crypt.decrypt(encrypted, signingKey, iv);
			expect(decrypted).toBe(plaintext);
		});

		it('should round-trip a long string', () => {
			const plaintext = 'A'.repeat(10000);
			const encrypted = Crypt.encrypt(plaintext, signingKey, iv);
			const decrypted = Crypt.decrypt(encrypted, signingKey, iv);
			expect(decrypted).toBe(plaintext);
		});

		it('should round-trip with explicit AES_256 cipher', () => {
			const plaintext = 'Testing AES-256';
			const encrypted = Crypt.encrypt(
				plaintext,
				signingKey,
				iv,
				CIPHERS.AES_256,
			);
			const decrypted = Crypt.decrypt(
				encrypted,
				signingKey,
				iv,
				CIPHERS.AES_256,
			);
			expect(decrypted).toBe(plaintext);
		});

		it('should round-trip with hex encoding', () => {
			const plaintext = 'Testing hex encoding';
			const encrypted = Crypt.encrypt(
				plaintext,
				signingKey,
				iv,
				CIPHERS.AES_256,
				'hex',
			);
			expect(encrypted).toMatch(/^[0-9a-f]+$/);
			const decrypted = Crypt.decrypt(
				encrypted,
				signingKey,
				iv,
				CIPHERS.AES_256,
				'hex',
			);
			expect(decrypted).toBe(plaintext);
		});

		it('should produce different ciphertext for different plaintext', () => {
			const enc1 = Crypt.encrypt('hello', signingKey, iv);
			const enc2 = Crypt.encrypt('world', signingKey, iv);
			expect(enc1).not.toBe(enc2);
		});

		it('should round-trip text with special characters', () => {
			const plaintext =
				'<script>alert("xss")</script> & "quotes" \'single\' `backtick`';
			const encrypted = Crypt.encrypt(plaintext, signingKey, iv);
			const decrypted = Crypt.decrypt(encrypted, signingKey, iv);
			expect(decrypted).toBe(plaintext);
		});

		it('should round-trip newlines and tabs', () => {
			const plaintext = 'line1\nline2\ttab\r\nwindows';
			const encrypted = Crypt.encrypt(plaintext, signingKey, iv);
			const decrypted = Crypt.decrypt(encrypted, signingKey, iv);
			expect(decrypted).toBe(plaintext);
		});
	});

	// ─── hashPassword() / checkPassword() ──────────────────────────────────────

	describe('hashPassword() / checkPassword()', () => {
		it('should hash a password and verify it', async () => {
			const password = 'MySecureP@ssw0rd!';
			const hash = await Crypt.hashPassword(password);
			expect(hash).not.toBe(password);
			expect(hash.startsWith('$2b$')).toBe(true);

			const isMatch = await Crypt.checkPassword(password, hash);
			expect(isMatch).toBe(true);
		});

		it('should fail to verify an incorrect password', async () => {
			const hash = await Crypt.hashPassword('correctPassword');
			const isMatch = await Crypt.checkPassword('wrongPassword', hash);
			expect(isMatch).toBe(false);
		});

		it('should produce different hashes for the same password due to salting', async () => {
			const password = 'samePassword';
			const hash1 = await Crypt.hashPassword(password);
			const hash2 = await Crypt.hashPassword(password);
			expect(hash1).not.toBe(hash2);
			// Both should still verify correctly
			expect(await Crypt.checkPassword(password, hash1)).toBe(true);
			expect(await Crypt.checkPassword(password, hash2)).toBe(true);
		});

		it('should handle unicode passwords', async () => {
			const password = '日本語パスワード🔐';
			const hash = await Crypt.hashPassword(password);
			expect(await Crypt.checkPassword(password, hash)).toBe(true);
		});

		it('should handle very long passwords', async () => {
			// bcrypt truncates at 72 bytes, but it should still work
			const password = 'A'.repeat(200);
			const hash = await Crypt.hashPassword(password);
			expect(await Crypt.checkPassword(password, hash)).toBe(true);
		});

		it('should handle empty string password', async () => {
			const hash = await Crypt.hashPassword('');
			expect(await Crypt.checkPassword('', hash)).toBe(true);
			expect(await Crypt.checkPassword('notempty', hash)).toBe(false);
		});
	});
});
