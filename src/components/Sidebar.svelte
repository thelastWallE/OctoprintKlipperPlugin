<script>
  import { shortStatusSidebar, settings, isActive, permissions } from '../stores/klipper.js';
  import { api } from '../lib/api.js';

  let { 
    connectionState,
    loginState,
    showEditorDialog = () => {},
    executeMacro = () => {},
    navbarClicked = () => {}
  } = $props();

  let status = $derived($shortStatusSidebar);
  let config = $derived($settings);
  let active = $derived($isActive);
  let perms = $derived($permissions);

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
    <a 
      href="#"
      onclick={(e) => { e.preventDefault(); navbarClicked(); }}
      title="Go to OctoKlipper Tab">
      <div class="msg">{@html status}</div>
    </a>
  </div>
{/if}

{#if perms.MACRO}
  <div class="control-group">
    <div class="controls">
      <label class="control-label small">
        <i class="icon-list-alt"></i> Macros
      </label>
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
