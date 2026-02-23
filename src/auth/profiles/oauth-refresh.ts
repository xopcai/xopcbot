/**
 * OAuth Refresh Registry
 * 
 * Registry for OAuth refresh functions.
 * Used by ModelRegistry to handle OAuth token refresh.
 */

import type { OAuthCredentials } from '@mariozechner/pi-ai';

export type OAuthRefreshFn = (credentials: OAuthCredentials) => Promise<OAuthCredentials>;

const oauthRefreshRegistry = new Map<string, OAuthRefreshFn>();

/**
 * Register an OAuth refresh function for a provider
 */
export function registerOAuthRefresh(provider: string, refreshFn: OAuthRefreshFn): void {
	oauthRefreshRegistry.set(provider, refreshFn);
}

/**
 * Get OAuth refresh function for a provider
 */
export function getOAuthRefresh(provider: string): OAuthRefreshFn | undefined {
	return oauthRefreshRegistry.get(provider);
}

/**
 * Check if provider has OAuth refresh registered
 */
export function hasOAuthRefresh(provider: string): boolean {
	return oauthRefreshRegistry.has(provider);
}

/**
 * Clear all registered OAuth refresh functions
 */
export function clearOAuthRefreshRegistry(): void {
	oauthRefreshRegistry.clear();
}
