/** Auditable matching. Similar names are never treated as identity. */
export function matchNodes(figmaNodes, reactNodes, explicitMap = {}) {
  const used = new Set();
  const pairs = [];
  const log = [];
  const list = Array.isArray(figmaNodes) ? figmaNodes : [];
  const react = Array.isArray(reactNodes) ? reactNodes : [];
  for (const node of list) {
    const mappedId = explicitMap[node.id];
    if (mappedId) {
      const found = react.find(item => item.id === mappedId && !used.has(item.id));
      if (found) {
        used.add(found.id);
        pairs.push({ figmaId: node.id, reactId: found.id, strategy: 'explicit-map' });
        log.push(`${node.id} طابق الخريطة الصريحة ${found.id}`);
        continue;
      }
    }
    const byId = react.find(item => item.id === node.id && !used.has(item.id));
    if (byId) {
      used.add(byId.id);
      pairs.push({ figmaId: node.id, reactId: byId.id, strategy: 'node-id' });
      log.push(`${node.id} طابق معرّف العقدة`);
      continue;
    }
    const bySemantic = react.find(item => node.semanticId && item.semanticId === node.semanticId && !used.has(item.id));
    if (bySemantic) {
      used.add(bySemantic.id);
      pairs.push({ figmaId: node.id, reactId: bySemantic.id, strategy: 'semantic-id' });
      log.push(`${node.id} طابق المعرّف الدلالي`);
      continue;
    }
    const byText = react.filter(item => !used.has(item.id) && item.type === node.type && item.text && item.text === node.text);
    if (byText.length === 1) {
      used.add(byText[0].id);
      pairs.push({ figmaId: node.id, reactId: byText[0].id, strategy: 'unique-type-and-text' });
      log.push(`${node.id} طابق النوع والنص لأن المرشح واحد فقط`);
      continue;
    }
    log.push(`${node.id} بلا زوج. لم يُستخدم تشابه الأسماء.`);
    pairs.push({ figmaId: node.id, reactId: null, strategy: 'unmatched' });
  }
  return {
    pairs,
    unmatchedReact: react.filter(item => !used.has(item.id)).map(item => item.id),
    log,
  };
}

export function matchSelectedPair(reference, actual) {
  return {
    pairs: [{ figmaId: reference?.nodeId || null, reactId: 'react-item', strategy: 'user-selected-pair' }],
    unmatchedReact: [],
    log: ['المقارنة بين العقدة التي حددها المستخدم والعنصر React الظاهر. تشابه الأسماء ليس دليل تطابق.'],
  };
}
