<!--
@component
Coordinate Offset dialog for setting X, Y, and Z offsets using the
SET_GCODE_OFFSET command.

**Props:**
- `show` - Boolean to control dialog visibility
- `onClose` - Function called when the dialog is closed

**Usage:**
```html
<OffsetDialog
  show={showOffset}
  onClose={() => showOffset = false} />
```
-->
<script>
  import { api } from '../lib/api.js';

  let { show, onClose = () => {} } = $props();

  let offsetX = $state(0);
  let offsetY = $state(0);
  let offsetZ = $state(0);

  async function setOffset() {
    try {
      if (typeof OctoPrint !== 'undefined') {
        const gcode = `SET_GCODE_OFFSET X=${offsetX} Y=${offsetY} Z=${offsetZ}`;
        OctoPrint.control.sendGcode(gcode);
        console.log('Offset set:', { offsetX, offsetY, offsetZ });
        handleClose();
      }
    } catch (error) {
      console.error('Failed to set offset:', error);
    }
  }

  function handleClose() {
    onClose();
  }
</script>

{#if show}
  <div class="modal fade in" style="display: block;">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <button type="button" class="close" onclick={handleClose}>&times;</button>
          <h3>Coordinate Offset</h3>
        </div>
        <div class="modal-body">
          <div class="control-group">
            <label class="control-label" for="offset-x">X Offset (mm)</label>
            <div class="controls">
              <input id="offset-x" type="number" bind:value={offsetX} step="0.1" />
            </div>
          </div>

          <div class="control-group">
            <label class="control-label" for="offset-y">Y Offset (mm)</label>
            <div class="controls">
              <input id="offset-y" type="number" bind:value={offsetY} step="0.1" />
            </div>
          </div>

          <div class="control-group">
            <label class="control-label" for="offset-z">Z Offset (mm)</label>
            <div class="controls">
              <input id="offset-z" type="number" bind:value={offsetZ} step="0.01" />
            </div>
          </div>

          <div class="alert alert-info">
            <strong>Info:</strong> This sets a coordinate offset for subsequent GCODE move commands.
            The offset will be applied until cleared or the printer is restarted.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick={handleClose}>Cancel</button>
          <button class="btn btn-primary" onclick={setOffset}>Set Offset</button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade in"></div>
{/if}

<style>
  .modal {
    z-index: 1050;
  }
  .modal-backdrop {
    z-index: 1040;
  }
</style>
