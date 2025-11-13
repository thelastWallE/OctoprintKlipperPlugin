<script>
  import { onMount } from 'svelte';
  import { 
    isConnected, 
    isActive, 
    logMessages, 
    settings, 
    loginState, 
    permissions,
    addLogMessage,
    clearLogMessages,
    updateStatus
  } from './stores/klipper.js';
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
    settings.set(octoprintSettings?.settings?.plugins?.klipper || {});
    
    loginState.set({
      isUser: octoprintLoginState?.isUser?.() || false,
      isAdmin: octoprintLoginState?.isAdmin?.() || false
    });

    permissions.set({
      CONFIG: octoprintLoginState?.hasPermissionKo?.(octoprintAccess?.permissions?.PLUGIN_KLIPPER_CONFIG) || false,
      MACRO: octoprintLoginState?.hasPermissionKo?.(octoprintAccess?.permissions?.PLUGIN_KLIPPER_MACRO) || false
    });

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
      updateStatus(data);
      isActive.set(data.isActive || false);
      isConnected.set(data.isConnected || false);
    } else if (data.type === "log") {
      addLogMessage(data.subtype || 'info', data.time || '', data.message || '');
    }
  }

  function updateConnectionState() {
    if (octoprintConnectionState) {
      const connected = octoprintConnectionState.isOperational?.() || 
                       octoprintConnectionState.isPrinting?.() || 
                       octoprintConnectionState.isPaused?.() || false;
      isConnected.set(connected);
      isActive.set(connected);
    }
  }

  function handleGetStatus(result) {
    if (result && result.status) {
      updateStatus(result.status);
    }
  }

  function handleRestartHost() {
    addLogMessage('info', new Date().toLocaleTimeString(), 'Restarting Klipper host...');
  }

  function handleRestartFirmware() {
    addLogMessage('info', new Date().toLocaleTimeString(), 'Restarting Klipper firmware...');
  }

  function handleClearLog() {
    clearLogMessages();
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
    addLogMessage('info', new Date().toLocaleTimeString(), `Executing macro: ${macro.name || macro}`);
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
