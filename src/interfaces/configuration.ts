export interface Configuration {
	/**
	 * Get a configuration value with optional default
	 */
	get<T>(key: string, defaultValue: T): T;

	/**
	 * Get a configuration section
	 */
	getSection(section: string): Configuration;

	/**
	 * Check if a configuration key exists
	 */
	has(key: string): boolean;
}
