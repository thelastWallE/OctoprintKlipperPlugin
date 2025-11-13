<script>
  import { onMount } from 'svelte';
  import { klipperStore } from './stores/klipper.js';
  import { api } from './lib/api.js';
  import TabMain from './components/TabMain.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Navbar from './components/Navbar.svelte';
  import LevelingDialog from './components/LevelingDialog.svelte';
  import PidTuningDialog from './components/PidTuningDialog.svelte';
  import OffsetDialog from './components/OffsetDialog.svelte';

  let { 
    octoprintSettings = {},
    octoprintLoginState = {},
    octoprintConnectionState = {},
    octoprintAccess = {},
    type = 'tab' // 'tab', 'sidebar', or 'navbar'
  } = $props();

  // Dialog visibility state
  let showLevelingDlg = $state(false);
  let showPidTuningDlg = $state(false);
  let showOffsetDlg = $state(false);

  onMount(() => {
    // Initialize API
    api.init();

    // Set up initial state from OctoPrint
    klipperStore.settings = octoprintSettings?.settings?.plugins?.klipper || {};
    
    klipperStore.loginState = {
      isUser: octoprintLoginState?.isUser?.() || false,
      isAdmin: octoprintLoginState?.isAdmin?.() || false
    };

    klipperStore.permissions = {
      CONFIG: octoprintLoginState?.hasPermissionKo?.(octoprintAccess?.permissions?.PLUGIN_KLIPPER_CONFIG) || false,
      MACRO: octoprintLoginState?.hasPermissionKo?.(octoprintAccess?.permissions?.PLUGIN_KLIPPER_MACRO) || false
    };

    // Set up message listener from OctoPrint
    if (typeof OctoPrint !== 'undefined' && OctoPrint.socket) {
      OctoPrint.socket.onMessage("plugin", function(message) {
        if (message.plugin === "klipper") {
          handlePluginMessage(message.data);
        }
      });
    }

    // Update connection state
    updateConnectionState();
  });

  function handlePluginMessage(data) {
    if (data.type === "status") {
      klipperStore.updateStatus(data);
      klipperStore.isActive = data.isActive || false;
      klipperStore.isConnected = data.isConnected || false;
    } else if (data.type === "log") {
      klipperStore.addLogMessage(data.subtype || 'info', data.time || '', data.message || '');
    }
  }

  function updateConnectionState() {
    if (octoprintConnectionState) {
      const connected = octoprintConnectionState.isOperational?.() || 
                       octoprintConnectionState.isPrinting?.() || 
                       octoprintConnectionState.isPaused?.() || false;
      klipperStore.isConnected = connected;
      klipperStore.isActive = connected;
    }
  }

  function handleGetStatus(result) {
    if (result && result.status) {
      klipperStore.updateStatus(result.status);
    }
  }

  function handleRestartHost() {
    klipperStore.addLogMessage('info', new Date().toLocaleTimeString(), 'Restarting Klipper host...');
  }

  function handleRestartFirmware() {
    klipperStore.addLogMessage('info', new Date().toLocaleTimeString(), 'Restarting Klipper firmware...');
  }

  function handleClearLog() {
    klipperStore.clearLogMessages();
  }

  function showEditorDialog() {
    // Trigger the existing editor dialog (still using jQuery for now)
    if (typeof globalThis.$ !== 'undefined') {
      globalThis.$("#klipper_editor").modal({ show: true, width: "90%", backdrop: "static" });
    }
  }

  function showLevelingDialog() {
    showLevelingDlg = true;
  }

  function showPidTuningDialog() {
    showPidTuningDlg = true;
  }

  function showOffsetDialog() {
    showOffsetDlg = true;
  }

  function showGraphDialog() {
    // Trigger the existing graph dialog (still using jQuery for now)
    if (typeof globalThis.$ !== 'undefined') {
      globalThis.$("#klipper_graph_dialog").modal({ show: true, backdrop: "static" });
    }
  }

  function executeMacro(macro) {
    klipperStore.addLogMessage('info', new Date().toLocaleTimeString(), `Executing macro: ${macro.name || macro}`);
  }

  function navbarClicked() {
    // Navigate to the klipper tab
    if (typeof OctoPrint !== 'undefined') {
      globalThis.$('a[href="#tab_plugin_klipper"]').tab('show');
    }
  }
</script>

{#if type === 'tab'}
  <TabMain 
    onGetStatus={handleGetStatus}
    onRestartHost={handleRestartHost}
    onRestartFirmware={handleRestartFirmware}
    {showEditorDialog}
    {showLevelingDialog}
    {showPidTuningDialog}
    {showOffsetDialog}
    {showGraphDialog}
    {executeMacro}
    onClearLog={handleClearLog}
  />
{:else if type === 'sidebar'}
  <Sidebar 
    connectionState={octoprintConnectionState}
    loginState={octoprintLoginState}
    {showEditorDialog}
    {executeMacro}
    {navbarClicked}
  />
{:else if type === 'navbar'}
  <Navbar {navbarClicked} />
{/if}

<!-- Svelte Dialogs -->
<LevelingDialog bind:show={showLevelingDlg} onClose={() => showLevelingDlg = false} />
<PidTuningDialog bind:show={showPidTuningDlg} onClose={() => showPidTuningDlg = false} />
<OffsetDialog bind:show={showOffsetDlg} onClose={() => showOffsetDlg = false} />
