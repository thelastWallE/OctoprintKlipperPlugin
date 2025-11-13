<script>
  import { settings } from '../stores/klipper.js';
  import { api } from '../lib/api.js';

  let { show, onClose = () => {} } = $props();

  let config = $derived($settings);
  let heater = $state('extruder');
  let targetTemp = $state(200);
  let fan = $state(0);
  let writeCfg = $state(false);

  async function startPidTuning() {
    try {
      await api.sendCommand('pidTune', {
        heater,
        targetTemp,
        fan,
        writeCfg
      });
      console.log('PID tuning started');
    } catch (error) {
      console.error('Failed to start PID tuning:', error);
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
          <h3>PID Tuning</h3>
        </div>
        <div class="modal-body">
          <div class="control-group">
            <label class="control-label">Heater</label>
            <div class="controls">
              <select bind:value={heater}>
                <option value="extruder">Extruder</option>
                <option value="heater_bed">Heated Bed</option>
              </select>
            </div>
          </div>

          <div class="control-group">
            <label class="control-label">Target Temperature (°C)</label>
            <div class="controls">
              <input type="number" bind:value={targetTemp} min="0" max="300" />
            </div>
          </div>

          <div class="control-group">
            <label class="control-label">Fan Speed (%)</label>
            <div class="controls">
              <input type="number" bind:value={fan} min="0" max="100" />
            </div>
          </div>

          <div class="control-group">
            <div class="controls">
              <label class="checkbox">
                <input type="checkbox" bind:checked={writeCfg} />
                Write results to config
              </label>
            </div>
          </div>

          <div class="alert alert-info">
            <strong>Note:</strong> PID tuning will heat the selected heater to the target temperature
            and cycle it to determine optimal PID parameters. This process may take several minutes.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick={handleClose}>Cancel</button>
          <button class="btn btn-primary" onclick={startPidTuning}>Start Tuning</button>
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
