<!--
@component
Sidebar component for OctoPrint that provides Klipper connection controls,
status display, and quick access to macros.

**Props:**
- `connectionState` - OctoPrint connection state object
- `loginState` - OctoPrint login state object
- `showEditorDialog` - Function to show the configuration editor
- `executeMacro` - Function called when a macro is executed
- `navbarClicked` - Function called when status is clicked

**Usage:**
```html
<Sidebar
  connectionState={connection}
  loginState={login}
  showEditorDialog={() => openEditor()}
  executeMacro={(macro) => runMacro(macro)}
  navbarClicked={() => switchToKlipperTab()} />
```
-->
<script>
  import { klipperStore } from '../stores/klipper.js';
  import { api } from '../lib/api.js';

  let {
    connectionState,
    loginState,
    showEditorDialog = () => {},
    executeMacro = () => {},
    navbarClicked = () => {}
  } = $props();

  let status = $derived(klipperStore.shortStatusSidebar);
  let config = $derived(klipperStore.settings);
  let active = $derived(klipperStore.isActive);
  let perms = $derived(klipperStore.permissions);

  async function handleConnect() {
    if (connectionState?.connect) {
      connectionState.connect();
    }
  }

  async function handleMacro(macro) {
    try {
      await api.executeMacro(macro);
      executeMacro(macro);
    } catch (error) {
      console.error('Failed to execute macro:', error);
    }
  }
</script>

<div class="control-group">
  <div class="controls">
    <label
      for="connection_printers"
      class:disabled={connectionState && !connectionState.isErrorOrClosed()}
      >
      Printer Profile
    </label>

    <select
      id="connection_printers"
      bind:value={connectionState.selectedPrinter}
      disabled={connectionState && !connectionState.isErrorOrClosed()}
      class:disabled={connectionState && !connectionState.isErrorOrClosed()}
      >
      {#if connectionState?.printerOptions}
        {#each connectionState.printerOptions as printer}
          <option value={printer.id}>{printer.name}</option>
        {/each}
      {/if}
    </select>

    <button
      class="btn btn-block"
      onclick={handleConnect}
      disabled={!loginState?.isUser}
      >
      {connectionState?.buttonText || 'Connect'}
    </button>

    {#if !config?.connection?.hide_editor_button && perms.CONFIG}
      <button
        class="btn btn-block"
        onclick={() => showEditorDialog()}
        title="Open Editor">
        Open Editor
      </button>
    {/if}
  </div>
</div>

{#if config?.configuration?.shortStatus_sidebar}
  <div id="shortStatus_SideBar" class="plugin-klipper-sidebar">
    <button
      type="button"
      onclick={navbarClicked}
      title="Go to OctoKlipper Tab">
      <div class="msg">{@html status}</div>
    </button>
  </div>
{/if}

{#if perms.MACRO}
  <div class="control-group">
    <div class="controls">
      <div class="control-label small">
        <i class="icon-list-alt"></i> Macros
      </div>
      {#each config?.macros || [] as macro}
        {#if macro.sidebar}
          <button
            class="btn btn-block"
            onclick={() => handleMacro(macro)}
            disabled={!active}>
            {macro.name}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  #shortStatus_SideBar button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    width: 100%;
    text-align: inherit;
  }
  #shortStatus_SideBar button:hover {
    text-decoration: underline;
  }
</style>
