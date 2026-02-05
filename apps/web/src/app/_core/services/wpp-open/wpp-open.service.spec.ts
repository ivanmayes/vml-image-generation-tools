import { TestBed } from '@angular/core/testing';
import { connectToParent } from 'penpal';

import { WppOpenService } from './wpp-open.service';

// Mock penpal
vi.mock('penpal', () => ({
	connectToParent: vi.fn(),
}));

describe('WppOpenService', () => {
	let service: WppOpenService;
	let mockConnection: {
		osApi: {
			getAccessToken: ReturnType<typeof vi.fn>;
		};
	};

	beforeEach(() => {
		mockConnection = {
			osApi: {
				getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
			},
		};

		// Reset the mock before each test
		vi.mocked(connectToParent).mockReset();

		TestBed.configureTestingModule({
			providers: [WppOpenService],
		});

		service = TestBed.inject(WppOpenService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('context getter', () => {
		it('should return undefined initially', () => {
			expect(service.context).toBeUndefined();
		});
	});

	describe('connect', () => {
		it('should resolve immediately if already connected', async () => {
			// Simulate already connected state
			(service as any).connected = true;

			await expect(service.connect()).resolves.toBeUndefined();
			expect(connectToParent).not.toHaveBeenCalled();
		});

		it('should resolve immediately if already connecting', async () => {
			// Simulate connecting state
			(service as any).connecting = true;

			await expect(service.connect()).resolves.toBeUndefined();
			expect(connectToParent).not.toHaveBeenCalled();
		});

		it('should call connectToParent when not connected', async () => {
			const mockContext = { workspace: { azId: 'workspace123' } };
			let receiveOsContextCallback: (context: any) => void;

			vi.mocked(connectToParent).mockImplementation((config: any) => {
				receiveOsContextCallback = config.methods.receiveOsContext;
				return {
					promise: Promise.resolve(mockConnection),
				} as any;
			});

			const connectPromise = service.connect();

			// Simulate receiving context
			setTimeout(() => {
				receiveOsContextCallback(mockContext);
			}, 10);

			await connectPromise;

			expect(connectToParent).toHaveBeenCalled();
			expect(service.context).toEqual(mockContext);
		});

		it('should reject when connection fails', async () => {
			vi.mocked(connectToParent).mockImplementation(
				() =>
					({
						promise: Promise.reject(new Error('Connection failed')),
					}) as any,
			);

			await expect(service.connect()).rejects.toThrow(
				'Failed to connect to parent.',
			);
		});
	});

	describe('getAccessToken', () => {
		it('should return access token when connected', async () => {
			// Setup connected state
			(service as any).connection = mockConnection;
			(service as any).connected = true;

			const token = await service.getAccessToken();

			expect(token).toBe('mock-access-token');
			expect(mockConnection.osApi.getAccessToken).toHaveBeenCalled();
		});

		it('should throw error when connection not established', async () => {
			(service as any).connection = null;

			// Mock connect to not establish connection
			vi.spyOn(service, 'connect').mockResolvedValue();

			await expect(service.getAccessToken()).rejects.toThrow(
				'Connection not established.',
			);
		});

		it('should throw error when getAccessToken fails', async () => {
			(service as any).connection = {
				osApi: {
					getAccessToken: vi.fn().mockResolvedValue(null),
				},
			};
			(service as any).connected = true;

			await expect(service.getAccessToken()).rejects.toThrow(
				'Failed to get access token.',
			);
		});
	});

	describe('getOsContext', () => {
		it('should return context when connected', async () => {
			const mockContext = { workspace: { azId: 'workspace123' } };
			(service as any).connection = mockConnection;
			(service as any).connected = true;
			(service as any)._context = mockContext;

			const context = await service.getOsContext();

			expect(context).toEqual(mockContext);
		});

		it('should throw error when connection not established', async () => {
			(service as any).connection = null;
			vi.spyOn(service, 'connect').mockResolvedValue();

			await expect(service.getOsContext()).rejects.toThrow(
				'Connection not established.',
			);
		});
	});

	describe('getWorkspaceScope', () => {
		it('should throw error when connection not established', async () => {
			(service as any).connection = null;
			vi.spyOn(service, 'connect').mockResolvedValue();

			await expect(service.getWorkspaceScope()).rejects.toThrow(
				'Connection not established.',
			);
		});
	});

	describe('getClient', () => {
		it('should throw error when connection not established', async () => {
			(service as any).connection = null;
			vi.spyOn(service, 'connect').mockResolvedValue();

			await expect(service.getClient()).rejects.toThrow(
				'Connection not established.',
			);
		});
	});
});
