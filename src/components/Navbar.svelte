<script>
  import { shortStatusNavbar, shortStatusNavbarHover } from '../stores/klipper.js';

  let { navbarClicked = () => {} } = $props();

  let status = $derived($shortStatusNavbar);
  let statusHover = $derived($shortStatusNavbarHover);
</script>

<a 
  href="#"
  onclick={(e) => { e.preventDefault(); navbarClicked(); }}
  title={statusHover}
  class="plugin-klipper-navbar">
  {@html status}
</a>
