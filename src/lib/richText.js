export const CODE_COLOR = /^\{(\w+)\}([\s\S]*)\{\/\}$/
export const TOKEN = /`([^`]+)`|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*]+)\*|\{(\w+)\}([\s\S]+?)\{\/\}/g

// plainText — marker text with **b** *i* __u__ ~~s~~ `code` {color}…{/} stripped
export function plainText(s) {
  let out = String(s ?? '')
  for (let prev = null; prev !== out;) { prev = out; out = out.replace(new RegExp(TOKEN.source, 'g'), (m, c, b, u, st, i, col, ct) => (c != null ? c.replace(CODE_COLOR, '$2') : b ?? u ?? st ?? i ?? ct)) }
  return out
}
