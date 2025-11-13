// <Octoprint Klipper Plugin - Svelte Integration Bridge>

// This file bridges the new Svelte 5 components with the existing OctoPrint Knockout.js system
// It provides backward compatibility during the migration

$(function () {
  function KlipperViewModelSvelte(parameters) {
    var self = this;

    self.settings = parameters[0];
    self.loginState = parameters[1];
    self.connectionState = parameters[2];
    self.levelingViewModel = parameters[3];
    self.paramMacroViewModel = parameters[4];
    self.access = parameters[5];

    // Track mounted Svelte apps
    self.svelteApps = {
      tab: null,
      sidebar: null,
      navbar: null
    };

    // Flag to enable/disable Svelte components (for gradual migration)
    self.useSvelteComponents = true;

    // Initialize Svelte components when the view model is bound
    self.onStartup = function() {
      console.log("KlipperViewModelSvelte: Initializing Svelte 5 components");
    };

    self.onAfterBinding = function() {
      if (!self.useSvelteComponents) {
        console.log("KlipperViewModelSvelte: Svelte components disabled, using Knockout.js");
        return;
      }

      console.log("KlipperViewModelSvelte: After binding, mounting Svelte 5 components");
      
      // Wait a bit for the DOM to be ready
      setTimeout(function() {
        self.mountTabComponent();
        self.mountSidebarComponent();
        self.mountNavbarComponent();
      }, 100);
    };

    self.mountTabComponent = function() {
      if (typeof window.KlipperSvelte === 'undefined') {
        console.warn("KlipperSvelte not loaded, skipping tab mount");
        return;
      }

      var tabContainer = document.querySelector('#tab_plugin_klipper');
      if (tabContainer) {
        // Create mount point
        var mountPoint = document.createElement('div');
        mountPoint.id = 'klipper-tab-mount';
        tabContainer.innerHTML = '';
        tabContainer.appendChild(mountPoint);
        
        self.svelteApps.tab = window.KlipperSvelte.mountKlipperApp(
          'klipper-tab-mount',
          'tab',
          {
            settings: self.settings,
            loginState: self.loginState,
            connectionState: self.connectionState,
            access: self.access
          }
        );
        console.log("Mounted Svelte 5 tab component");
      } else {
        console.warn("Tab container #tab_plugin_klipper not found");
      }
    };

    self.mountSidebarComponent = function() {
      if (typeof window.KlipperSvelte === 'undefined') {
        console.warn("KlipperSvelte not loaded, skipping sidebar mount");
        return;
      }

      var sidebarElement = document.getElementById('sidebar_plugin_klipper');
      if (sidebarElement) {
        // Create mount point
        var mountPoint = document.createElement('div');
        mountPoint.id = 'klipper-sidebar-mount';
        sidebarElement.innerHTML = '';
        sidebarElement.appendChild(mountPoint);
        
        self.svelteApps.sidebar = window.KlipperSvelte.mountKlipperApp(
          'klipper-sidebar-mount',
          'sidebar',
          {
            settings: self.settings,
            loginState: self.loginState,
            connectionState: self.connectionState,
            access: self.access
          }
        );
        console.log("Mounted Svelte 5 sidebar component");
      } else {
        console.warn("Sidebar element #sidebar_plugin_klipper not found");
      }
    };

    self.mountNavbarComponent = function() {
      if (typeof window.KlipperSvelte === 'undefined') {
        console.warn("KlipperSvelte not loaded, skipping navbar mount");
        return;
      }

      var navbarElement = document.getElementById('navbar_plugin_klipper');
      if (navbarElement) {
        // Create mount point
        var mountPoint = document.createElement('div');
        mountPoint.id = 'klipper-navbar-mount';
        navbarElement.innerHTML = '';
        navbarElement.appendChild(mountPoint);
        
        self.svelteApps.navbar = window.KlipperSvelte.mountKlipperApp(
          'klipper-navbar-mount',
          'navbar',
          {
            settings: self.settings,
            loginState: self.loginState,
            connectionState: self.connectionState,
            access: self.access
          }
        );
        console.log("Mounted Svelte 5 navbar component");
      } else {
        console.warn("Navbar element #navbar_plugin_klipper not found");
      }
    };

    // Clean up on destruction
    self.onDestroy = function() {
      console.log("KlipperViewModelSvelte: Cleaning up Svelte components");
      // Svelte 5 components will auto-cleanup when their container is removed
    };
  }

  OCTOPRINT_VIEWMODELS.push({
    construct: KlipperViewModelSvelte,
    dependencies: [
      "settingsViewModel",
      "loginStateViewModel",
      "connectionViewModel",
      "klipperLevelingViewModel",
      "klipperParamMacroViewModel",
      "accessViewModel"
    ],
    elements: [
      "#tab_plugin_klipper",
      "#sidebar_plugin_klipper",
      "#navbar_plugin_klipper"
    ]
  });
});
