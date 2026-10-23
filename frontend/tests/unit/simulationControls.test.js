import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {adjustSpeed,speedLabel,acceptsPauseShortcut,clampSpeed} from "../../src/utils/simulationControls";
describe("continuous speed and display bands",()=>{
 it("retains intermediate values and clamps only at boundaries",()=>{
  expect(adjustSpeed(.333,1)).toBe(.383);expect(adjustSpeed(.333,-1)).toBe(.283);
  expect(adjustSpeed(.98,1)).toBe(1);expect(adjustSpeed(.01,-1)).toBe(0);
  expect(clampSpeed(.537)).toBe(.537);expect(clampSpeed(NaN)).toBe(.25);
 });
 it("shows a pause and five display bands without quantizing the slider",()=>{
  expect([0,.001,.2,.201,.4,.401,.6,.601,.8,1].map(speedLabel)).toEqual(["⏸","x1","x1","x2","x2","x3","x3","x4","x4","x5"]);
 });
 it("does not toggle on repeated, composing, prevented or modified space",()=>{
  const base={code:"Space",target:{}};expect(acceptsPauseShortcut(base)).toBe(true);
  for(const modifier of ["repeat","isComposing","defaultPrevented","ctrlKey","altKey","metaKey","shiftKey"])
   expect(acceptsPauseShortcut({...base,[modifier]:true})).toBe(false);
  expect(acceptsPauseShortcut({...base,keyCode:229})).toBe(false);
  expect(acceptsPauseShortcut({code:"Enter"})).toBe(false);
 });
 it("does not take space from native controls, editables or inert regions",()=>{
  for(const element of [{isContentEditable:true},{closest:()=>({})}])
   expect(acceptsPauseShortcut({code:"Space",composedPath:()=>[element]})).toBe(false);
 });
});
let api;
beforeEach(async()=>{vi.resetModules();const data=new Map();vi.stubGlobal("localStorage",{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)});api=await import("../../src/data/store");});
afterEach(()=>vi.unstubAllGlobals());
describe("pause and reset state",()=>{
 it("restores the exact last nonzero speed",()=>{
  api.setSimulationSpeed(.537);api.toggleSimulationPause();expect(api.store.userSettings.timeSpeedModifier).toBe(0);
  api.toggleSimulationPause();expect(api.store.userSettings.timeSpeedModifier).toBe(.537);
  api.setSimulationSpeed(.123);api.setSimulationSpeed(0);api.toggleSimulationPause();expect(api.store.userSettings.timeSpeedModifier).toBe(.123);
 });
 it("uses the existing reset function and restores its original defaults",()=>{
  api.setSimulationSpeed(.9);api.toggleSimulationPause();api.store.userSettings.actualScale=true;
  api.store.userSettings.showLabels=false;api.store.userSettings.showOrbitPaths=false;
  api.resetUserSettings();expect(api.store.userSettings.timeSpeedModifier).toBe(.25);
  expect(api.store.userSettings.actualScale).toBe(false);expect(api.store.userSettings.showLabels).toBe(true);
  expect(api.store.userSettings.showOrbitPaths).toBe(true);expect(api.store.userSettings.focusedBody).toBe("Mars");
  api.toggleSimulationPause();api.toggleSimulationPause();expect(api.store.userSettings.timeSpeedModifier).toBe(.25);
 });
});
