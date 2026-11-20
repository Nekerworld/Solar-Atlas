<script setup>
import { openObservation } from "../data/store";
</script>

<template>
  <button type="button" class="ground-launcher" aria-label="지상 관측" title="지상 관측: 내 위치에서 올려다본 하늘" @click="openObservation('Earth')">
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 1.5c3.4 2.2 5.2 5.6 5.2 9.6 0 1.6-.3 3.1-.8 4.5H7.6c-.5-1.4-.8-2.9-.8-4.5 0-4 1.8-7.4 5.2-9.6Zm0 5.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
      <path d="M6.6 14.6 3.5 17.7c-.3.3-.4.7-.2 1.1l1 2.2 3-1.6c-.6-1.1-.9-2.4-.9-3.8l0-.9ZM17.4 14.6l3.1 3.1c.3.3.4.7.2 1.1l-1 2.2-3-1.6c.6-1.1.9-2.4.9-3.8l-.2-1ZM9.3 17.5h5.4L12 22.5l-2.7-5Z" />
    </svg>
    <span>지상 관측</span>
  </button>
</template>

<style scoped>
.ground-launcher { position: fixed; left: 16px; bottom: 16px; z-index: 30; display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px 10px 12px; border: 1px solid #ffffff33; border-radius: 999px; background: #12141cd9; color: #fff; font: inherit; font-size: 13px; cursor: pointer; backdrop-filter: blur(6px); }
.ground-launcher:hover, .ground-launcher:focus-visible { border-color: #ffb27a; color: #ffb27a; }
.ground-launcher svg { width: 22px; height: 22px; }
</style>
