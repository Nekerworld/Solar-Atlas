const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const letter = /[\p{L}\p{N}_]/u;
const particle = /^(?:에서는|에서|으로|보다|처럼|까지|부터|하고|이랑|인가|인데|은|는|이|가|을|를|과|와|의|에|로|도|만|랑)/;
export function createMentionFinder(bodies, targets) {
  const registered = new Map(bodies.map(body=>[body.name,body]));
  const entries = new Map();
  for (const target of targets) {
    const body=registered.get(target.frontend_name);
    if (!body) continue;
    entries.set(body.name,{name:body.name,label:body.displayName || target.name_ko,
      aliases:new Set([body.name,body.displayName,target.name_ko,...(body.aliases || []),...(target.aliases || [])].filter(Boolean))});
  }
  const aliases=[];
  for (const entry of entries.values()) for (const raw of entry.aliases) {
    const alias=raw.normalize("NFKC").trim();
    // Ambiguous one-character aliases such as 해 are excluded. 달/판 are canonical names.
    if (alias.length<2 && !["달","판"].includes(alias)) continue;
    aliases.push({entry,alias,pattern:new RegExp(escape(alias).replace(/\s+/g,"\\s*"),"giu")});
  }
  aliases.sort((a,b)=>b.alias.length-a.alias.length);
  return text => {
    const value=String(text || "").normalize("NFKC"), found=new Map(), occupied=[];
    for (const {entry,alias,pattern} of aliases) {
      pattern.lastIndex=0;
      for (const match of value.matchAll(pattern)) {
        const start=match.index,end=start+match[0].length,before=value.slice(0,start),after=value.slice(end);
        if (letter.test(value[start-1] || "") && !/(?:과|와|랑|하고)$/.test(before)) continue;
        if (letter.test(after[0] || "") && !particle.test(after)) continue;
        if (alias==="달" && /(?:한|두|세|네|몇|이번|다음|지난|매|\d+)\s*$/.test(before)) continue;
        if (occupied.some(([a,b])=>start<b && end>a)) continue;
        occupied.push([start,end]);
        if (!found.has(entry.name)) found.set(entry.name,{name:entry.name,label:entry.label,index:start});
      }
    }
    return [...found.values()].sort((a,b)=>a.index-b.index).map(({name,label})=>({name,label}));
  };
}
