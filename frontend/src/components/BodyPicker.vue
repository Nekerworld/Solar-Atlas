<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import BodyVisibilityButton from "./BodyVisibilityButton.vue";
import { focusBody, revealBody, toggleBodyVisibility, setCategoryVisibility, solarSystemData, store } from "../data/store";
import { BODY_CATEGORIES, flattenBodies, isBodyVisible } from "../data/bodyCatalog";

const navigation = ref();
const active = ref(null);
const query = ref("");
const searchOpen = ref(false);
const searchInput = ref();
const resultButtons = new Map();
const buttons = new Map();
let closeTimer;
const bodies = computed(() => flattenBodies(store.userSettings.actualScale ? solarSystemData.real : solarSystemData.toon));
const star = computed(() => bodies.value.find((body) => body.category === "star"));
const selected = computed(() => bodies.value.find((body) => body.name === store.userSettings.focusedBody));
const groups = computed(() => BODY_CATEGORIES.map((category) => ({
  ...category, bodies: bodies.value.filter((body) => body.category === category.key),
})).map((category) => ({ ...category, total: category.bodies.length, visibleCount: category.bodies.filter(body => isBodyVisible(body,store.userSettings.categoryVisibility,store.userSettings.bodyVisibility)).length })));
const categoryNames = Object.fromEntries(BODY_CATEGORIES.map(({ key, label }) => [key, label]));
const categoryLabel = (body) => body.category === "star" ? "태양" : categoryNames[body.category] || "기타";
const needle = computed(() => query.value.trim().toLocaleLowerCase());
const results = computed(() => bodies.value.filter((body) => needle.value &&
  [body.name, body.displayName, ...(body.aliases || [])].some((name) => name.toLocaleLowerCase().includes(needle.value))));
// Closed silhouettes, filled with currentColor; no outline-only icons.
const icons = {
  planet: ["M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z", "M2 15C-2 20 7 22 17 15S26 3 20 5l-1 2c4-1 2 3-4 7S3 19 4 16Z"],
  moon: ["M20.7 15.6A9.2 9.2 0 0 1 8.4 3.3 9.6 9.6 0 1 0 20.7 15.6Z"],
  comet: ["M21 2 8 9a6 6 0 1 0 7 7L23 4 13 12Z"],

  artifact: ["m10 7 7 7-4 4-7-7ZM1 5l4-4 5 5-4 4Zm13 13 4-4 5 5-4 4ZM14 6l4-4 2 2-4 4ZM4 18l3-3 2 2-3 3Z"],
  region: ["M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm0 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  dwarf: ["M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12ZM3 3h3v3H3Zm15 16h3v3h-3Z"],
};
const visible = (body) => isBodyVisible(body, store.userSettings.categoryVisibility, store.userSettings.bodyVisibility);
function cancelClose() { clearTimeout(closeTimer); }
function openCategory(key) { cancelClose(); searchOpen.value = false; active.value = key; }
function openSearch() { cancelClose(); active.value = null; searchOpen.value = true; }
function scheduleClose() { cancelClose(); closeTimer = setTimeout(() => { active.value = null; }, 180); }
function close() { cancelClose(); active.value = null; searchOpen.value = false; }
function choose(body) {
  revealBody(body.name);
  focusBody(body.name);
  if (searchOpen.value) searchInput.value?.focus();
  else buttons.get(body.category)?.focus();
  close();
}
function escape(event) {
  event.preventDefault();
  if (searchOpen.value) searchInput.value?.focus();
  else buttons.get(active.value)?.focus();
  close();
}
function focusFirstResult() {
  const first = results.value[0];
  if (first) resultButtons.get(first.name)?.focus();
}
function moveResult(body, direction) {
  const enabled = results.value;
  const index = enabled.findIndex((entry) => entry.name === body.name);
  if (enabled.length) resultButtons.get(enabled[(index + direction + enabled.length) % enabled.length].name)?.focus();
}
function outside(event) { if (!navigation.value?.contains(event.target)) close(); }
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => { cancelClose(); document.removeEventListener("pointerdown", outside); });
</script>

<template>
  <nav ref="navigation" class="body-navigation" aria-label="천체 탐색" @keydown.esc.stop="escape"
       @pointerdown.stop @click.stop @wheel.stop>
    <div class="body-toolbar">
      <div v-if="star" class="body-star-control">
      <button type="button" class="body-nav-button" :class="{ selected: selected?.category === 'star' }"
              :aria-pressed="selected?.category === 'star'" aria-label="태양으로 이동" title="태양으로 이동"
              @mouseenter="close" @focus="close" @click="choose(star)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M10.5 0h3v5h-3Zm0 19h3v5h-3ZM0 10.5h5v3H0Zm19 0h5v3h-5ZM2.5 4.6l2.1-2.1L8 5.9 5.9 8Zm13.5 13.5 2.1-2.1 3.4 3.4-2.1 2.1ZM2.5 19.4l3.4-3.4L8 18.1l-3.4 3.4ZM16 5.9l3.4-3.4 2.1 2.1L18.1 8Z"/></svg>
        <span>태양</span>
      </button>
      </div>
      <div v-for="group in groups" :key="group.key" class="body-nav-category"
           @mouseenter="openCategory(group.key)" @mouseleave="scheduleClose" @focusin="cancelClose"
           @focusout="!$event.currentTarget.contains($event.relatedTarget) && scheduleClose()">
        <button :ref="(element) => element ? buttons.set(group.key, element) : buttons.delete(group.key)"
                type="button" class="body-nav-button" :class="{ selected: selected?.category === group.key, expanded: active === group.key, hidden: store.userSettings.categoryVisibility[group.key] === false }"
                :aria-expanded="active === group.key" :aria-controls="`body-group-${group.key}`"
                @focus="openCategory(group.key)" @click="openCategory(group.key)" @keydown.arrow-down.prevent="openCategory(group.key)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in icons[group.key]" :key="path" :d="path"/></svg>
          <span>{{ group.label }}</span>
        </button>
        <div v-show="active === group.key" class="body-dropdown-bridge" @mouseenter="cancelClose">
          <section :id="`body-group-${group.key}`" class="body-dropdown" :aria-label="`${group.label} 선택`">
            <header class="body-dropdown-header">
              <h2>{{ group.label }} <span>{{ group.total }}</span></h2>
              <label v-if="group.toggle" class="body-visibility-label">
                표시
                <input type="checkbox" class="body-visibility-switch" :aria-label="`${group.label} 전체 표시`"
                  :checked="group.total > 0 && group.visibleCount === group.total"
                  :indeterminate="group.visibleCount > 0 && group.visibleCount < group.total"
                  :aria-checked="group.visibleCount > 0 && group.visibleCount < group.total ? 'mixed' : group.visibleCount === group.total"
                  :class="{'is-partial':group.visibleCount > 0 && group.visibleCount < group.total}"
                  :title="`${group.visibleCount}/${group.total}개 표시 · 클릭하면 전체 표시 전환`"
                  @change="setCategoryVisibility(group.key,$event.target.checked)">
              </label>
            </header>
            <div class="body-dropdown-list" :aria-label="`${group.label} 카메라 대상 및 표시 설정`">
              <p v-if="!group.total" class="body-empty">아직 추가된 천체가 없습니다.</p>
              <div v-for="body in group.bodies" :key="body.name" class="body-option" :class="{ 'is-hidden': !visible(body), checked: selected?.name === body.name }">
                <BodyVisibilityButton v-if="body.name !== 'Sun'" :visible="visible(body)" :label="body.displayName" @toggle="toggleBodyVisibility(body.name)" />
                <button type="button" class="body-option-focus" :aria-label="`${body.displayName}로 이동`"
                  :aria-pressed="selected?.name === body.name" @click="choose(body)">
                  <span>{{ body.displayName }} <span v-if="body.isMajorMoon" class="body-major-badge">주요</span><small>{{ body.parentDisplayName ? `${body.parentDisplayName} · ` : "" }}{{ body.classification ? `${body.classification} · ` : "" }}{{ body.designation || body.name }}</small></span>
                </button>
              </div>
            </div>
            <p v-if="store.userSettings.categoryVisibility[group.key] === false" class="body-hidden-hint">눈 아이콘이나 천체 이름을 누르면 표시할 수 있습니다.</p>
          </section>
        </div>
      </div>
    </div>
    <div class="body-global-search" @focusout="!$event.currentTarget.contains($event.relatedTarget) && (searchOpen = false)">
      <label class="body-search-label" for="body-search">전체 천체 검색</label>
      <div class="body-search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
        <input id="body-search" ref="searchInput" v-model="query" class="body-search" type="search"
               placeholder="전체 천체 검색" autocomplete="off"
               aria-controls="body-search-results" :aria-expanded="searchOpen && !!needle"
               @focus="openSearch" @click="openSearch" @input="openSearch" @keydown.arrow-down.prevent="focusFirstResult">
      </div>
      <div v-if="searchOpen && needle" class="body-search-results-bridge">
        <section id="body-search-results" class="body-dropdown body-search-results" aria-label="전체 천체 검색 결과">
          <p class="body-search-count" role="status">검색 결과 {{ results.length }}개</p>
          <div class="body-dropdown-list">
            <p v-if="!results.length" class="body-empty">검색 결과가 없습니다.</p>
            <div v-for="body in results" :key="body.name" class="body-result-row">
              <button :ref="(element) => element ? resultButtons.set(body.name, element) : resultButtons.delete(body.name)"
                      type="button" class="body-result" :class="{ checked: selected?.name === body.name }"
                      :aria-label="`${body.displayName} · ${categoryLabel(body)}로 이동`"
                      @click="choose(body)" @keydown.arrow-down.prevent="moveResult(body, 1)" @keydown.arrow-up.prevent="moveResult(body, -1)">
                <span>{{ body.displayName }} <span v-if="body.isMajorMoon" class="body-major-badge">주요</span><small>{{ body.parentDisplayName ? `${body.parentDisplayName} · ` : "" }}{{ body.classification ? `${body.classification} · ` : "" }}{{ body.designation || body.name }}</small></span>
                <span class="body-category-badge">{{ categoryLabel(body) }}</span>
              </button>
              <BodyVisibilityButton v-if="body.name !== 'Sun'" :visible="visible(body)" :label="body.displayName" @toggle="toggleBodyVisibility(body.name)" />
            </div>
          </div>
        </section>
      </div>
    </div>
    <p class="body-current">현재 관찰 중 <strong>{{ selected?.displayName || "태양" }}</strong></p>
  </nav>
</template>

<style scoped>
.body-navigation { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 48px); z-index: 40; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.body-toolbar { display: flex; gap: 6px; padding: 0; background: transparent; pointer-events: auto; }
.body-nav-category { position: relative; }
.body-nav-button { width: 66px; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 5px 7px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: #ffffff; font-size: 11px; text-shadow: 0 1px 4px #000; }
.body-nav-button svg { width: 23px; height: 23px; fill: currentColor; stroke: none; filter: drop-shadow(0 1px 3px #0008); }
.body-nav-button:hover, .body-nav-button.expanded { background: #ffffff20; color: #ffffff; }
.body-nav-button.selected { background: #ffffff; border-color: #ffffff; color: #111318; text-shadow: none; }
.body-nav-button.selected svg { filter: none; }
.body-nav-button.hidden { opacity: .5; }
.body-current { margin-top: 7px; padding: 3px 9px; border-radius: 8px; background: transparent; color: #bbc1cf; text-shadow: 0 1px 4px #000; font-size: 11px; }
.body-current strong { color: #e3e5ed; font-weight: 500; margin-left: 6px; }
.body-dropdown-bridge { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); width: 260px; padding-top: 10px; z-index: 3; }
.body-dropdown { padding: 14px; border: 1px solid #ffffff24; border-radius: 12px; background: #1c1e25fa; box-shadow: 0 16px 40px #0008; }
.body-dropdown-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.body-dropdown-header h2 { color: #e9eaf0; font-size: 13px; font-weight: 600; }
.body-dropdown-header h2 span { margin-left: 5px; color: #9199ad; font-size: 11px; }
.body-visibility-label { display: flex; align-items: center; gap: 7px; color: #aeb3c2; font-size: 11px; cursor: pointer; }
.body-visibility-switch { appearance: none; position: relative; width: 28px; height: 16px; flex: 0 0 28px; border-radius: 10px; background: #50535d; cursor: pointer; margin: 0; }
.body-visibility-switch::after { content: ""; position: absolute; width: 12px; height: 12px; border-radius: 50%; background: white; top: 2px; left: 2px; }
.body-visibility-switch:checked { background: #fd7e14; }
.body-visibility-switch.is-partial { background:#a36b39; }
.body-visibility-switch.is-partial::after { transform:translateX(6px); }
.body-visibility-switch:checked::after { transform: translateX(12px); }
.body-search-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.body-global-search { position: relative; width: 360px; max-width: 100%; margin-top: 10px; pointer-events: auto; }
.body-search-field { position: relative; }
.body-search-field > svg { position: absolute; left: 11px; top: 10px; width: 16px; height: 16px; fill: none; stroke: #c1c7d5; stroke-width: 1.7; pointer-events: none; }
.body-search { width: 100%; min-width: 0; color: #ffffff; background: #11151b99; border: 1px solid #ffffff35; border-radius: 20px; padding: 9px 12px 9px 35px; font-size: 12px; }
.body-search::placeholder { color: #c1c7d5; }
.body-search-results-bridge { position: absolute; top: 100%; left: 0; right: 0; padding-top: 8px; z-index: 4; }
.body-search-count { color: #aeb5c4; font-size: 11px; padding: 0 3px; }
.body-result-row { display: flex; align-items: center; gap: 5px; }
.body-result { display: flex; align-items: center; gap: 10px; justify-content: space-between; flex: 1; min-width: 0; padding: 9px 8px; border: 0; border-radius: 7px; background: transparent; color: #e9eaf0; text-align: left; font-size: 13px; }
.body-result > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.body-result small { display: block; font-size: 10px; color: #a3adbf; }
.body-result:hover:enabled { background: #ffffff0d; }
.body-result.checked { background: #ffffff14; }
.body-result:disabled { opacity: .4; }
.body-category-badge { flex-shrink: 0; border: 1px solid #ffffff25; border-radius: 5px; padding: 2px 6px; font-size: 10px; color: #c2cede; }
.body-dropdown-list { margin-top: 9px; max-height: min(48vh, 360px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #555a6a transparent; }
.body-option { display: flex; align-items: center; gap: 6px; padding: 5px; border-radius: 7px; color: #d1d5e0; }
.body-option:hover { background: #ffffff08; }
.body-option.checked { background: #fd7e1412; color: #ffc38f; }
.body-option input { accent-color: #fd7e14; margin: 0; }
.body-option span { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.body-option small { display: block; color: #8f98ad; font-size: 10px; }
.body-option span.body-major-badge,.body-result span.body-major-badge { display:inline-flex;align-items:center;vertical-align:middle;margin-left:3px;padding:0 4px;border:1px solid #6bbac455;border-radius:4px;background:#1c272d;color:#a8dadc;font-size:9px;font-weight:500;line-height:1.6; }
.body-major-legend { margin:0 0 7px;color:#a8dadc;font-size:10px;line-height:1.5; }
.body-option.is-hidden .body-option-focus { opacity:.45; }
.body-option-focus { flex:1;min-width:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;padding:3px 0; }
.body-option-focus:focus-visible { outline:2px solid #fd7e14;outline-offset:2px;border-radius:4px; }
.body-star-control { position:relative; }
.body-empty, .body-hidden-hint { color: #999fac; font-size: 11px; padding: 10px 3px; }
.body-hidden-hint { border-top: 1px solid #ffffff12; padding-bottom: 0; }
</style>
