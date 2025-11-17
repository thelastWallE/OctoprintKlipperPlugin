<!--
@component
Main tab content for the Klipper plugin, displaying log messages and providing
controls for Klipper operations, tools, and macros.

**Props:**
- `onGetStatus` - Function called when getting Klipper status
- `onRestartHost` - Function called when restarting Klipper host
- `onRestartFirmware` - Function called when restarting firmware
- `showEditorDialog` - Function to show the configuration editor
- `showLevelingDialog` - Function to show the bed leveling dialog
- `showPidTuningDialog` - Function to show the PID tuning dialog
- `showOffsetDialog` - Function to show the coordinate offset dialog
- `showGraphDialog` - Function to show the log analysis graph dialog
- `executeMacro` - Function called when a macro is executed
- `onClearLog` - Function called when clearing the log

**Usage:**
```html
<TabMain
  onGetStatus={() => getStatus()}
  onRestartHost={() => restartHost()}
  onRestartFirmware={() => restartFirmware()}
  showEditorDialog={() => openEditor()}
  showLevelingDialog={() => showLeveling = true}
  showPidTuningDialog={() => showPidTuning = true}
  showOffsetDialog={() => showOffset = true}
  showGraphDialog={() => showGraph = true}
  executeMacro={(macro) => runMacro(macro)}
  onClearLog={() => clearMessages()} />
```
-->
<script>
  import { klipperStore } from '../stores/klipper.js';
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
  let messages = $derived(klipperStore.logMessages);
  let active = $derived(klipperStore.isActive);
  let config = $derived(klipperStore.settings);
  let perms = $derived(klipperStore.permissions);

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
    <div class="klipper-inline">
      <i class="icon-tasks"></i> Messages
    </div>
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
          <div class="control-label small">
            <i class="icon-refresh"></i> Restart
          </div>
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
          <div class="control-label">
            <i class="icon-wrench"></i> Tools
          </div>
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
          <div class="control-label">
            <i class="icon-list-alt"></i> Macros
          </div>
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
