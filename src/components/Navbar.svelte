<!--
@component
Navbar component that displays Klipper status in the OctoPrint navigation bar.

**Props:**
- `navbarClicked` - Function called when the navbar status is clicked

**Usage:**
```html
<Navbar navbarClicked={() => switchToKlipperTab()} />
```
-->
<script>
  import { klipperStore } from '../stores/klipper.js';

  let { navbarClicked = () => {} } = $props();

  let status = $derived(klipperStore.shortStatusNavbar);
  let statusHover = $derived(klipperStore.shortStatusNavbarHover);
</script>

<button
  type="button"
  onclick={navbarClicked}
  title={statusHover}
  class="plugin-klipper-navbar">
  {@html status}
</button>

<style>
  .plugin-klipper-navbar {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
  }
  .plugin-klipper-navbar:hover {
    text-decoration: underline;
  }
</style>
