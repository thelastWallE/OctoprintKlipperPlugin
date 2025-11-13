<script>
  import { settings } from '../stores/klipper.js';

  let { show, onClose = () => {} } = $props();

  let config = $derived($settings);
  let activePoint = $state(-1);
  let points = $derived(config?.probe?.points || []);
  let pointCount = $derived(points.length);

  function startLeveling() {
    if (typeof OctoPrint !== 'undefined') {
      OctoPrint.control.sendGcode("G28");
      moveToPoint(0);
    }
  }

  function stopLeveling() {
    if (typeof OctoPrint !== 'undefined' && config?.probe) {
      const height = config.probe.height * 1;
      const lift = config.probe.lift * 1;
      OctoPrint.control.sendGcode("G1 Z" + (height + lift));
      gotoHome();
    }
  }

  function gotoHome() {
    if (typeof OctoPrint !== 'undefined') {
      OctoPrint.control.sendGcode("G28");
      activePoint = -1;
    }
  }

  function nextPoint() {
    moveToPoint(activePoint + 1);
  }

  function previousPoint() {
    moveToPoint(activePoint - 1);
  }

  function jumpToPoint(index) {
    moveToPoint(index);
  }

  function moveToPosition(x, y) {
    if (typeof OctoPrint !== 'undefined' && config?.probe) {
      const height = config.probe.height * 1;
      const lift = config.probe.lift * 1;
      const speedZ = config.probe.speed_z;
      const speedXY = config.probe.speed_xy;

      OctoPrint.control.sendGcode([
        `G1 Z${height + lift} F${speedZ}`,
        `G1 X${x} Y${y} F${speedXY}`,
        `G1 Z${height} F${speedZ}`
      ]);
    }
  }

  function moveToPoint(index) {
    if (index >= 0 && index < points.length) {
      const point = points[index];
      moveToPosition(point.x, point.y);
      activePoint = index;
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
          <h3>Assisted Bed Leveling</h3>
        </div>
        <div class="modal-body">
          <div class="control-group">
            <label class="control-label">Points: {pointCount}</label>
            <div class="controls">
              <button 
                class="btn btn-primary"
                onclick={startLeveling}
                disabled={activePoint >= 0}>
                Start Leveling
              </button>
              <button 
                class="btn btn-danger"
                onclick={stopLeveling}
                disabled={activePoint < 0}>
                Stop Leveling
              </button>
              <button 
                class="btn"
                onclick={gotoHome}>
                Home
              </button>
            </div>
          </div>

          {#if activePoint >= 0}
            <div class="control-group">
              <label class="control-label">
                Current Point: {activePoint + 1} of {pointCount}
              </label>
              <div class="controls">
                <button 
                  class="btn"
                  onclick={previousPoint}
                  disabled={activePoint <= 0}>
                  <i class="icon-arrow-left"></i> Previous
                </button>
                <button 
                  class="btn"
                  onclick={nextPoint}
                  disabled={activePoint >= pointCount - 1}>
                  Next <i class="icon-arrow-right"></i>
                </button>
              </div>
            </div>
          {/if}

          <div class="control-group">
            <label class="control-label">Jump to Point:</label>
            <div class="controls">
              {#each points as point, index}
                <button 
                  class="btn btn-small"
                  class:btn-primary={activePoint === index}
                  onclick={() => jumpToPoint(index)}>
                  {index + 1}
                </button>
              {/each}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick={handleClose}>Close</button>
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
