<script setup>
import { onBeforeUnmount, ref } from "vue";
const dialog = ref();
function open() { if (!dialog.value.open) dialog.value.showModal(); }
function close() { dialog.value?.close(); }
onBeforeUnmount(close);
</script>

<template>
  <div class="info-control" @pointerdown.stop @click.stop @wheel.stop>
    <button type="button" class="info-button" aria-label="프로젝트 정보 및 출처 열기" aria-haspopup="dialog" @click="open">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg>
    </button>
    <Teleport to="body">
      <dialog ref="dialog" class="info-dialog" aria-labelledby="info-title" @click.self="close"
        @pointerdown.stop @wheel.stop>
        <header class="info-heading"><div><span class="info-eyebrow">SOLAR ATLAS</span><h2 id="info-title">이 여정에 함께한 자료</h2></div>
          <button type="button" class="info-close" aria-label="정보 닫기" autofocus @click="close">×</button>
        </header>
        <p class="info-description">태양계를 탐험하는 데 사용한 모델과 이미지의 출처를 확인할 수 있습니다.</p>
        <div class="info-links">
          <a href="/assets/models/CREDITS.html" target="_blank" rel="noopener noreferrer"><span>인공물 3D 모델</span><span aria-hidden="true">↗</span></a>
          <a href="/assets/models/natural/CREDITS.html" target="_blank" rel="noopener noreferrer"><span>자연 천체 모델 · 표면 표현</span><span aria-hidden="true">↗</span></a>
          <a href="/assets/planet-texture-maps/CREDITS.html" target="_blank" rel="noopener noreferrer"><span>천체 텍스처 이미지</span><span aria-hidden="true">↗</span></a>
        </div>
        <p class="info-note">자료별 저작자·사용 조건·수정 내역은 각 출처 안내에 기재되어 있습니다. 일부 표면과 궤도는 시각화를 위한 근사 표현입니다.</p>
        <footer>A solar system experience built with Vue & Three.js.<br />by <a href="https://github.com/Nekerworld" target="_blank" rel="noopener noreferrer">Nekerworld</a></footer>
      </dialog>
    </Teleport>
  </div>
</template>
