export interface Telemetry {
	event(name: string, properties?: Record<string, string>): void;
	dispose(): void;
}
