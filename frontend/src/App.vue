<script setup>
import SolarView from "./views/SolarView.vue";
import PlannerView from "./views/PlannerView.vue";
import GroundView from "./views/GroundView.vue";
import { viewMode, viewTransition } from "./data/viewMode";
import { enterPlanner, leaveGround, leavePlanner } from "./scene/viewTransitions";

// 화면 전환 연출(scene/viewTransitions.js). 떠나는 화면은 연출이 끝날 때까지 남겨 두고, 들어오는 화면이 그 위(또는 밑)에서 움직인다.
const onEnterPlanner = (element, done) => enterPlanner(element, done, viewTransition);
const onLeavePlanner = (element, done) => leavePlanner(element, done, viewTransition);
const onLeaveGround = (element, done) => leaveGround(element, done, viewTransition);
</script>

<template>
  <SolarView />
  <Transition :css="false" @enter="onEnterPlanner" @leave="onLeavePlanner">
    <PlannerView v-if="viewMode === 'planner'" />
  </Transition>
  <Transition :css="false" @leave="onLeaveGround">
    <GroundView v-if="viewMode === 'ground'" />
  </Transition>
</template>
