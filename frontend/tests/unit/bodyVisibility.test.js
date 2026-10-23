import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

let api;
beforeEach(async () => {
  vi.resetModules();
  const values=new Map();
  vi.stubGlobal("localStorage", {
    getItem:key=>values.get(key) ?? null,
    setItem:(key,value)=>values.set(key,String(value)),
  });
  api=await import("../../src/data/store");
});
afterEach(()=>vi.unstubAllGlobals());

const flatten=body=>[body,...body.satellites.flatMap(flatten)];
function shown(name) {
  const body=flatten(api.solarSystemData.real).find(body=>body.name===name);
  const settings=api.store.userSettings;
  return settings.bodyVisibility[name]!==false && [body.category,...body.ancestorCategories].every(category=>settings.categoryVisibility[category]!==false);
}

describe("individual visibility under hidden categories",()=>{
  it("reveals one comet without revealing the rest of the category",()=>{
    api.setCategoryVisibility("comet",false);
    api.toggleBodyVisibility("Halley");
    const comets=flatten(api.solarSystemData.real).filter(body=>body.category==="comet");
    expect(comets.filter(body=>shown(body.name)).map(body=>body.name)).toEqual(["Halley"]);
    expect(shown("Earth")).toBe(true);
    api.toggleBodyVisibility("Halley");
    expect(comets.some(body=>shown(body.name))).toBe(false);
  });
  it("preserves hidden siblings when opening multiple ancestor categories",()=>{
    api.setCategoryVisibility("moon",false);
    api.setCategoryVisibility("dwarf",false);
    api.revealBody("Hiiaka");
    expect(shown("Hiiaka")).toBe(true);
    for(const name of ["Namaka","Haumea","Pluto","Moon","Ceres"])
      expect(shown(name),name).toBe(false);
  });
  it("applies the same policy to name/chat navigation",()=>{
    api.setCategoryVisibility("artifact",false);
    api.revealBody("ISS");
    api.focusBody("ISS");
    expect(api.store.userSettings.focusedBody).toBe("ISS");
    expect(shown("ISS")).toBe(true);
    expect(shown("Hubble")).toBe(false);
    expect(shown("Tiangong")).toBe(false);
  });
  it("allows the explicit category control to show all members after partial visibility",()=>{
    api.setCategoryVisibility("comet",false);
    api.revealBody("Halley");
    api.setCategoryVisibility("comet",true);
    const comets=flatten(api.solarSystemData.real).filter(body=>body.category==="comet");
    expect(comets.every(body=>shown(body.name))).toBe(true);
    api.setCategoryVisibility("comet",false);
    expect(comets.some(body=>shown(body.name))).toBe(false);
  });
  it("persists only the requested body as visible for a newly opened category",()=>{
    api.setCategoryVisibility("comet",false);
    api.revealBody("Halley");
    const individual=JSON.parse(localStorage.getItem("bodyVisibility"));
    expect(individual.Halley).toBe(true);
    expect(individual.Encke).toBe(false);
    expect(JSON.parse(localStorage.getItem("categoryVisibility")).comet).toBe(true);
  });
});

describe("initial visibility and saved user view",()=>{
  it("starts with Sun, planets, other moons, Pluto and regions when no settings exist",()=>{
    const all=flatten(api.solarSystemData.real);
    const expected=all.filter(body=>body.name==="Sun" || body.category==="planet" || body.name==="Pluto"
      || ["AsteroidBelt","KuiperBelt","OortCloud"].includes(body.name)
      || (body.category==="moon" && !["Hiiaka","Namaka"].includes(body.name))).map(body=>body.name).sort();
    expect(all.filter(body=>shown(body.name)).map(body=>body.name).sort()).toEqual(expected);
    expect(shown("Charon")).toBe(true);
    for (const name of ["AsteroidBelt","KuiperBelt","OortCloud"]) expect(shown(name),name).toBe(true);
    expect(shown("Nix")).toBe(true);
    expect(shown("Hiiaka")).toBe(false);
    expect(shown("Namaka")).toBe(false);
    expect(localStorage.getItem("bodyVisibility")).not.toBeNull();
    expect(localStorage.getItem("categoryVisibility")).not.toBeNull();
  });
  it("restores the user's edited view on the next module load",async()=>{
    api.toggleBodyVisibility("Earth");
    api.toggleBodyVisibility("Io");
    api.revealBody("Vesta");
    api.revealBody("ISS");
    const expected=flatten(api.solarSystemData.real).filter(body=>shown(body.name)).map(body=>body.name).sort();
    vi.resetModules();
    api=await import("../../src/data/store");
    expect(flatten(api.solarSystemData.real).filter(body=>shown(body.name)).map(body=>body.name).sort()).toEqual(expected);
    expect(shown("Earth")).toBe(false);
    expect(shown("Vesta")).toBe(true);
    expect(shown("ISS")).toBe(true);
  });
  it("keeps an existing sparse saved profile instead of overwriting it with defaults",async()=>{
    localStorage.setItem("categoryVisibility",JSON.stringify({moon:true,dwarf:true,artifact:true,comet:false,region:false}));
    localStorage.setItem("bodyVisibility",JSON.stringify({Earth:false}));
    vi.resetModules();
    api=await import("../../src/data/store");
    expect(shown("Earth")).toBe(false);
    expect(shown("Ceres")).toBe(true);
    expect(shown("ISS")).toBe(true);
  });
  it("resets to the same initial visibility profile",()=>{
    api.revealBody("Hiiaka");
    api.revealBody("Vesta");
    api.toggleBodyVisibility("Earth");
    api.resetUserSettings();
    expect(shown("Earth")).toBe(true);
    expect(shown("Pluto")).toBe(true);
    expect(shown("Charon")).toBe(true);
    for (const name of ["AsteroidBelt","KuiperBelt","OortCloud"]) expect(shown(name),name).toBe(true);
    for (const name of ["Hiiaka","Namaka","Haumea","Vesta","Halley","ISS"])
      expect(shown(name),name).toBe(false);
  });
});
