// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://1kyc.github.io',
	// Bind the dev/preview server to all interfaces so the port is reachable
	// through the devcontainer's forwarded port (it otherwise binds IPv6-only).
	server: { host: true },
});
