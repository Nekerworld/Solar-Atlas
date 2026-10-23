import {createApp,h} from "vue";
import SettingsPanel from "../../src/components/SettingsPanel.vue";
import ZoomControl from "../../src/components/ZoomControl.vue";
import BodyPicker from "../../src/components/BodyPicker.vue";
import ChatDock from "../../src/components/ChatDock.vue";
import {store} from "../../src/data/store";
import "../../src/style.css";
createApp({render:()=>h("main",{style:"min-height:100vh;background:radial-gradient(ellipse at 30% 45%,#17212d,#03050b 65%);"},[
 h(SettingsPanel),h(ZoomControl),h(BodyPicker),h(ChatDock),h("output",{id:"controls-state",hidden:true,"data-speed":store.userSettings.timeSpeedModifier,"data-focus":store.userSettings.focusedBody}),
 h("dialog",{id:"test-modal"},"테스트 대화상자")])}).mount("#app");
