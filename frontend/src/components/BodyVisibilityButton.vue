<script setup>
defineProps({ visible: Boolean, label: {type:String,required:true} });
defineEmits(["toggle"]);
</script>
<template>
  <button type="button" class="body-eye" :class="{'is-off':!visible}" :aria-pressed="visible"
    :aria-label="`${label} ${visible?'숨기기':'표시'}`" :title="`${label} ${visible?'숨기기':'표시'}`"
    @click.stop="$emit('toggle')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
      <circle cx="12" cy="12" r="3"/>
      <path v-if="!visible" d="m3 3 18 18" stroke-width="2"/>
    </svg>
  </button>
</template>
<style scoped>
.body-eye { display:inline-grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border:1px solid transparent;border-radius:7px;background:transparent;color:#dfe7f5;cursor:pointer;transition:background .15s,color .15s,border-color .15s; }
.body-eye svg { width:19px;height:19px; }
.body-eye:hover { background:#ffffff12;border-color:#ffffff30;color:#fff; }
.body-eye.is-off { color:#7d879a; }
.body-eye.is-off:hover { color:#d4dfef; }
.body-eye:focus-visible { outline:2px solid #fd7e14;outline-offset:2px; }
</style>
