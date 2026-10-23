<script setup>
defineProps({ name:String, checked:Boolean, hasHistory:Boolean, disabled:Boolean });
defineEmits(["change"]);
</script>
<template>
  <div class="chat-scope-control">
    <label><input type="checkbox" :checked="checked" :disabled="disabled" @change="$emit('change',$event.target.checked)" />
      <span>{{ name }}에 대해 물어보기</span></label>
    <span class="chat-scope-hint">{{ checked ? "천체 전용 대화" : hasHistory ? "저장된 대화 있음" : "통합 대화" }}</span>
  </div>
</template>
<style scoped>
.chat-scope-control{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:5px 12px;padding:9px 15px;border-bottom:1px solid #ffffff0b;font-size:11px;color:#b2b8c5;}
label{display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0;}
input{appearance:none;flex:0 0 15px;width:15px;height:15px;border:1px solid #8c94a477;border-radius:50%;margin:0;display:grid;place-items:center;cursor:pointer;background:#ffffff05;}
input::after{content:"";width:7px;height:7px;border-radius:50%;background:#ffa56c;transform:scale(0);transition:transform .12s ease;}
input:checked{border-color:#ffa56c;background:#fd7e1412;}input:checked::after{transform:scale(1);}
input:focus-visible{outline:2px solid #fd7e14;outline-offset:3px;}input:disabled{opacity:.35;cursor:default;}
.chat-scope-hint{font-size:10px;color:#9298a6;}
@media(max-width:700px){.chat-scope-control{padding:8px 10px;font-size:10px;gap:4px 8px}.chat-scope-hint{font-size:9px}}
@media(prefers-reduced-motion:reduce){input::after{transition:none}}
</style>
