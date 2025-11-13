// Svelte 5 store using $state runes for the Klipper plugin state
class KlipperStore {
  // Connection state
  isConnected = $state(false);
  isActive = $state(false);

  // Status display
  shortStatusNavbar = $state('');
  shortStatusNavbarHover = $state('');
  shortStatusSidebar = $state('');

  // Log messages
  logMessages = $state([]);

  // Settings
  settings = $state({});

  // Login state
  loginState = $state({
    isUser: false,
    isAdmin: false
  });

  // Permissions
  permissions = $state({
    CONFIG: false,
    MACRO: false
  });

  // Helper methods
  addLogMessage(type, time, msg) {
    const newMessage = { type, time, msg };
    this.logMessages = [newMessage, ...this.logMessages].slice(0, 100); // Keep last 100 messages
  }

  clearLogMessages() {
    this.logMessages = [];
  }

  updateStatus(status) {
    this.shortStatusNavbar = status.navbar || '';
    this.shortStatusNavbarHover = status.navbarHover || '';
    this.shortStatusSidebar = status.sidebar || '';
  }
}

// Export a singleton instance
export const klipperStore = new KlipperStore();
