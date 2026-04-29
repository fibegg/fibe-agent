const fs = require('fs');
const p = 'apps/api/src/app/gemma-router/gemma-router.service.test.ts';
let code = fs.readFileSync(p, 'utf8');

code = code.replace(/expect\(result\.tools\)\.toEqual\(\[\]\);/g, "expect(result.action).toBeUndefined();");
code = code.replace(/\{"tools":\["fibe_me"\],"confidence":0\.92\}/g, '{"type":"DELEGATE_TO_AGENT","tools":["fibe_me"],"confidence":0.92}');
code = code.replace(/expect\(result\.tools\)\.toEqual\(\['fibe_me'\]\);\n\s*expect\(result\.confidence\)\.toBeCloseTo\(0\.92\);/g, "expect(result.action).toEqual({ type: 'DELEGATE_TO_AGENT', tools: ['fibe_me'], confidence: 0.92 });");

code = code.replace(/\{"tools":\["fibe_me"\],"confidence":0\.85\}/g, '{"type":"DELEGATE_TO_AGENT","tools":["fibe_me"],"confidence":0.85}');
code = code.replace(/expect\(result\.skipped\)\.toBe\(false\);\n\s*expect\(result\.tools\)\.toEqual\(\['fibe_me'\]\);/g, "expect(result.skipped).toBe(false);\n      expect(result.action).toEqual({ type: 'DELEGATE_TO_AGENT', tools: ['fibe_me'], confidence: 0.85 });");

code = code.replace(/\{"tools":\[\],"confidence":1\.5\}/g, '{"type":"DELEGATE_TO_AGENT","tools":[],"confidence":1.5}');
code = code.replace(/expect\(result\.confidence\)\.toBe\(1\);/g, "expect((result.action as any).confidence).toBe(1);");

code = code.replace(/\{"tools":\["fibe_me",42,null\],"confidence":0\.9\}/g, '{"type":"DELEGATE_TO_AGENT","tools":["fibe_me",42,null],"confidence":0.9}');
code = code.replace(/expect\(result\.tools\)\.toEqual\(\['fibe_me'\]\);/g, "expect((result.action as any).tools).toEqual(['fibe_me']);");

fs.writeFileSync(p, code);
