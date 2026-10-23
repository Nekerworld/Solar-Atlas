<script setup>
import { computed } from "vue";
const props = defineProps({stage:{type:String,default:"textures"},error:{type:Boolean,default:false}});
defineEmits(["retry"]);
const steps = [
  {key:"textures",text:"천체의 표면을 준비하고 있어요"},
  {key:"models",text:"행성과 위성의 모습을 불러오고 있어요"},
  {key:"scene",text:"태양계의 궤도를 정돈하고 있어요"},
  {key:"frame",text:"탐사를 시작할 준비가 되었어요"},
];
const index = computed(() => Math.max(0,steps.findIndex(step=>step.key===props.stage)));
</script>

<template>
  <section class="loading-screen" aria-label="Solar Atlas 준비 중">
    <div class="loading-stars" aria-hidden="true"></div>
    <div class="loading-content">
      <div class="loading-system" aria-hidden="true">
        <div v-for="n in 3" :key="n" :class="['loading-orbit-plane',`loading-orbit-${n}`]">
          <div class="loading-orbit"><span></span></div>
        </div>
        <div class="loading-sun"></div>
      </div>
      <h1 class="loading-brand">SOLAR ATLAS</h1>
      <p class="loading-tagline">태양계 탐사를 준비하고 있어요</p>
      <div v-if="!error" class="loading-status" role="status" aria-live="polite" aria-atomic="true">
        <span class="loading-stage-number" aria-hidden="true">0{{ index+1 }} / 04</span>
        <p>{{ steps[index].text }}</p>
      </div>
      <div v-else class="loading-error" role="alert">
        <p>탐사 화면을 준비하지 못했어요.<br />연결 상태를 확인하고 다시 시도해주세요.</p>
        <button type="button" @click="$emit('retry')">다시 시도</button>
      </div>
    </div>
    <span class="loading-footer" aria-hidden="true">A LITTLE CLOSER TO THE UNIVERSE</span>
  </section>
</template>
