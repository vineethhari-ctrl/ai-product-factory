import { buildProjectFile, parseProjectFile, projectFileName } from '../src/services/projectFile.ts';
const st = { productName: 'Dealer Warranty & Parts', businessUnit: 'X', description: '', materials: [], productDefinition: { a: 1 }, referenceImage: null };
const t = JSON.stringify(buildProjectFile(st));
const r = parseProjectFile<typeof st>(t); console.log('roundtrip', r.ok && JSON.stringify(r.state) === JSON.stringify(st));
console.log('name', projectFileName('Dealer Warranty & Parts', new Date('2026-11-01')));
for (const bad of ['nope', '[]', '{"kind":"x"}', JSON.stringify({ ...buildProjectFile(st), version: 9 }), JSON.stringify(buildProjectFile({ productName: 5 })), JSON.stringify(buildProjectFile({ materials: 'x' })), JSON.stringify(buildProjectFile({ productDefinition: [] }))]) console.log('rejects', !parseProjectFile(bad).ok);
