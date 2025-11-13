<script>
  import { logMessages, isActive, settings, permissions } from '../stores/klipper.js';
  import { api } from '../lib/api.js';

  let { 
    onGetStatus = () => {}, 
    onRestartHost = () => {},
    onRestartFirmware = () => {},
    showEditorDialog = () => {},
    showLevelingDialog = () => {},
    showPidTuningDialog = () => {},
    showOffsetDialog = () => {},
    showGraphDialog = () => {},
    executeMacro = () => {},
    onClearLog = () => {}
  } = $props();

  // Svelte 5 runes for reactive state
  let messages = $derived($logMessages);
  let active = $derived($isActive);
  let config = $derived($settings);
  let perms = $derived($permissions);

  async function handleGetStatus() {
    try {
      const result = await api.getStatus();
      onGetStatus(result);
    } catch (error) {
      console.error('Failed to get status:', error);
    }
  }

  async function handleRestartHost() {
    try {
      await api.restartHost();
      onRestartHost();
    } catch (error) {
      console.error('Failed to restart host:', error);
    }
  }

  async function handleRestartFirmware() {
    try {
      await api.restartFirmware();
      onRestartFirmware();
    } catch (error) {
      console.error('Failed to restart firmware:', error);
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

  function clearLog() {
    onClearLog();
  }
</script>

<div class="row-fluid">
  <div id="left-side">
    <label class="klipper-inline">
      <i class="icon-tasks"></i> Messages
    </label>
    {#if perms.CONFIG}
      <button 
        class="btn btn-small pull-right"
        onclick={() => showEditorDialog()}
        title="Open the OctoKlipper Settings">
        <i class="fa icon-black fa-wrench"></i>
      </button>
    {/if}
    
    <div class="plugin-klipper-log">
      {#each messages as message}
        <div class="log-item {message.type}">
          <div class="ts">{message.time}</div>
          <div class="msg">{@html message.msg}</div>
        </div>
      {/each}
    </div>
    
    &nbsp;
    <button 
      class="btn btn-mini pull-right clear-btn" 
      onclick={clearLog}
      title="Clear Log">
      <i class="fa fa-trash"></i> Clear Log
    </button>
  </div>

  <div id="right-side">
    <div class="control-group">
      <div class="control-group">
        <div class="controls">
          <label class="control-label"></label>
          <button 
            class="btn btn-block btn-small"
            onclick={handleGetStatus}
            disabled={!active}
            title="Query Klipper for its current status">
            <i class="fa icon-black fa-info-circle"></i> Get Status
          </button>
          {#if perms.CONFIG}
            <button 
              class="btn btn-block btn-small"
              onclick={() => showEditorDialog()}
              title="Show the Editor">
              <i class="fa icon-black fa-file-code-o"></i> Show Editor
            </button>
          {/if}
        </div>
      </div>

      <div class="control-group">
        <div class="controls">
          <label class="control-label small">
            <i class="icon-refresh"></i> Restart
          </label>
          <button 
            class="btn btn-block btn-small"
            onclick={handleRestartHost}
            disabled={!active}
            title="This will cause the host software to reload its config and perform an internal reset">
            Host
          </button>
          <button 
            class="btn btn-block btn-small"
            onclick={handleRestartFirmware}
            disabled={!active}
            title="Similar to a host restart, but also clears any error state from the micro-controller">
            Firmware
          </button>
        </div>
      </div>

      <div class="control-group">
        <div class="controls">
          <label class="control-label">
            <i class="icon-wrench"></i> Tools
          </label>
          <button 
            class="btn btn-block btn-small"
            onclick={() => showLevelingDialog()}
            disabled={!active}
            title="Assists in manually leveling your printbed by moving the head to a configurable set of positions in sequence.">
            Assisted Bed Leveling
          </button>
          <button 
            class="btn btn-block btn-small"
            onclick={() => showPidTuningDialog()}
            disabled={!active}
            title="Determines optimal PID parameters by heat cycling the hotend/bed.">
            PID Tuning
          </button>
          <button 
            class="btn btn-block btn-small"
            onclick={() => showOffsetDialog()}
            disabled={!active}
            title="Sets a offset for subsequent GCODE coordinates.">
            Coordinate Offset
          </button>
          <button 
            class="btn btn-block btn-small"
            onclick={() => showGraphDialog()}
            title="Assists in debugging performance issues by analyzing the Klipper log files.">
            Analyze Klipper Log
          </button>
        </div>
      </div>

      {#if perms.MACRO}
        <div class="controls">
          <label class="control-label">
            <i class="icon-list-alt"></i> Macros
          </label>
          {#each config?.macros || [] as macro}
            {#if macro.tab}
              <button 
                class="btn btn-block btn-small"
                onclick={() => handleMacro(macro)}
                disabled={!active}>
                {macro.name}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Additional styles if needed, but mostly using existing CSS */
</style>
