<script>
  import { klipperStore } from '../stores/klipper.js';

  let { navbarClicked = () => {} } = $props();

  let status = $derived(klipperStore.shortStatusNavbar);
  let statusHover = $derived(klipperStore.shortStatusNavbarHover);
</script>

<a 
  href="#"
  onclick={(e) => { e.preventDefault(); navbarClicked(); }}
  title={statusHover}
  class="plugin-klipper-navbar">
  {@html status}
</a>
