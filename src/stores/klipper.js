// Svelte 5 stores using runes for the Klipper plugin state
import { writable } from 'svelte/store';

// Connection state
export const isConnected = writable(false);
export const isActive = writable(false);

// Status display
export const shortStatusNavbar = writable('');
export const shortStatusNavbarHover = writable('');
export const shortStatusSidebar = writable('');

// Log messages
export const logMessages = writable([]);

// Settings
export const settings = writable({});

// Login state
export const loginState = writable({
  isUser: false,
  isAdmin: false
});

// Permissions
export const permissions = writable({
  CONFIG: false,
  MACRO: false
});

// Helper functions
export function addLogMessage(type, time, msg) {
  logMessages.update(messages => {
    const newMessage = { type, time, msg };
    return [newMessage, ...messages].slice(0, 100); // Keep last 100 messages
  });
}

export function clearLogMessages() {
  logMessages.set([]);
}

export function updateStatus(status) {
  shortStatusNavbar.set(status.navbar || '');
  shortStatusNavbarHover.set(status.navbarHover || '');
  shortStatusSidebar.set(status.sidebar || '');
}
