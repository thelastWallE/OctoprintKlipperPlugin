import App from './App.svelte';

// Export function to mount Svelte components into OctoPrint
export function mountKlipperApp(targetId, type, params = {}) {
  const target = document.getElementById(targetId);
  if (!target) {
    console.error(`Target element ${targetId} not found`);
    return null;
  }

  const app = new App({
    target,
    props: {
      type,
      octoprintSettings: params.settings,
      octoprintLoginState: params.loginState,
      octoprintConnectionState: params.connectionState,
      octoprintAccess: params.access
    }
  });

  return app;
}

// Make it globally available for OctoPrint integration
if (typeof window !== 'undefined') {
  window.KlipperSvelte = {
    mountKlipperApp
  };
}
